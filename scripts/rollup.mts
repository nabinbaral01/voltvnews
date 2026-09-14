/**
 * Nightly pre-aggregation.
 *
 * Raw PageView rows are drill-down storage only — at 50k views a day the table
 * grows by ~18M rows a year, which no dashboard should ever scan. Every chart
 * in /admin/analytics reads DailyMetric instead, one row per
 * (day, dimension, value).
 *
 *   npm run rollup           # rebuild the last 3 days
 *   npm run rollup -- 90     # rebuild the last 90 days
 */
import { PrismaClient } from '@prisma/client';

export type RollupRange = { from: Date; to: Date };

/** Page-view-derived dimensions: value expression is evaluated against pv. */
const PAGEVIEW_DIMENSIONS: { dimension: string; value: string; where?: string }[] = [
  { dimension: 'total', value: `'all'` },
  { dimension: 'country', value: `pv."country"`, where: `pv."country" IS NOT NULL` },
  { dimension: 'city', value: `pv."country" || '|' || pv."city"`, where: `pv."city" IS NOT NULL AND pv."country" IS NOT NULL` },
  { dimension: 'region', value: `pv."country" || '|' || pv."region"`, where: `pv."region" IS NOT NULL AND pv."country" IS NOT NULL` },
  { dimension: 'post', value: `pv."postId"`, where: `pv."postId" IS NOT NULL` },
  { dimension: 'path', value: `pv."path"` },
  { dimension: 'device', value: `pv."deviceType"::text` },
  { dimension: 'browser', value: `pv."browser"`, where: `pv."browser" IS NOT NULL` },
  { dimension: 'os', value: `pv."os"`, where: `pv."os" IS NOT NULL` },
  { dimension: 'campaign', value: `pv."utmCampaign"`, where: `pv."utmCampaign" IS NOT NULL` },
];

/** Session-derived dimensions: sessions, bounces and entry sources. */
const SESSION_DIMENSIONS: { dimension: string; value: string; where?: string }[] = [
  { dimension: 'total', value: `'all'` },
  { dimension: 'country', value: `vs."country"`, where: `vs."country" IS NOT NULL` },
  { dimension: 'city', value: `vs."country" || '|' || vs."city"`, where: `vs."city" IS NOT NULL AND vs."country" IS NOT NULL` },
  { dimension: 'region', value: `vs."country" || '|' || vs."region"`, where: `vs."region" IS NOT NULL AND vs."country" IS NOT NULL` },
  { dimension: 'source', value: `vs."source"` },
  { dimension: 'referrer', value: `vs."referrer"`, where: `vs."referrer" IS NOT NULL` },
  { dimension: 'device', value: `vs."deviceType"::text` },
  { dimension: 'browser', value: `vs."browser"`, where: `vs."browser" IS NOT NULL` },
  { dimension: 'os', value: `vs."os"`, where: `vs."os" IS NOT NULL` },
];

/**
 * Bounds go to SQL as plain 'YYYY-MM-DD' strings and are cast there. A JS Date
 * would arrive as a timestamp with a zone and get its date taken in the
 * session's zone, which is only UTC by luck of the hosting; a date literal
 * has no zone to get wrong. Days are UTC throughout, same as the dashboards.
 */
function dayBounds(range: RollupRange) {
  return {
    from: range.from.toISOString().slice(0, 10),
    to: range.to.toISOString().slice(0, 10),
  };
}

export async function rebuildRollups(prisma: PrismaClient, range: RollupRange) {
  const { from, to } = dayBounds(range);

  // Recompute from scratch for the window so a re-run is always idempotent.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "DailyMetric" WHERE "day" >= $1::date AND "day" <= $2::date`,
    from,
    to,
  );

  for (const dim of PAGEVIEW_DIMENSIONS) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "DailyMetric"
        ("id", "day", "dimension", "value", "pageViews", "visitors", "sessions", "bounces",
         "totalDuration", "totalScroll", "scrollSamples", "newVisitors")
      SELECT
        gen_random_uuid()::text,
        pv."createdAt"::date,
        '${dim.dimension}',
        ${dim.value},
        COUNT(*)::int,
        COUNT(DISTINCT pv."visitorId")::int,
        0,
        0,
        COALESCE(SUM(pv."timeOnPageSeconds"), 0)::int,
        COALESCE(SUM(pv."scrollDepthPercent"), 0)::int,
        COUNT(*) FILTER (WHERE pv."scrollDepthPercent" > 0)::int,
        COUNT(*) FILTER (WHERE pv."isNewVisitor")::int
      FROM "PageView" pv
      WHERE pv."createdAt" >= $1::date AND pv."createdAt" < $2::date + 1
        ${dim.where ? `AND ${dim.where}` : ''}
      GROUP BY 2, 4
      ON CONFLICT ("day", "dimension", "value") DO UPDATE SET
        "pageViews" = "DailyMetric"."pageViews" + EXCLUDED."pageViews",
        "visitors" = GREATEST("DailyMetric"."visitors", EXCLUDED."visitors"),
        "totalDuration" = "DailyMetric"."totalDuration" + EXCLUDED."totalDuration",
        "totalScroll" = "DailyMetric"."totalScroll" + EXCLUDED."totalScroll",
        "scrollSamples" = "DailyMetric"."scrollSamples" + EXCLUDED."scrollSamples",
        "newVisitors" = "DailyMetric"."newVisitors" + EXCLUDED."newVisitors"
      `,
      from,
      to,
    );
  }

  for (const dim of SESSION_DIMENSIONS) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "DailyMetric"
        ("id", "day", "dimension", "value", "pageViews", "visitors", "sessions", "bounces",
         "totalDuration", "totalScroll", "scrollSamples", "newVisitors")
      SELECT
        gen_random_uuid()::text,
        vs."startedAt"::date,
        '${dim.dimension}',
        ${dim.value},
        0, 0,
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE vs."isBounce")::int,
        0, 0, 0, 0
      FROM "VisitSession" vs
      WHERE vs."startedAt" >= $1::date AND vs."startedAt" < $2::date + 1
        ${dim.where ? `AND ${dim.where}` : ''}
      GROUP BY 2, 4
      ON CONFLICT ("day", "dimension", "value") DO UPDATE SET
        "sessions" = "DailyMetric"."sessions" + EXCLUDED."sessions",
        "bounces" = "DailyMetric"."bounces" + EXCLUDED."bounces"
      `,
      from,
      to,
    );
  }

  // Content taxonomy needs a join back to Post, so it gets its own pass.
  for (const [dimension, column] of [
    ['category', 'categoryId'],
    ['contentType', 'contentTypeId'],
    ['author', 'authorId'],
  ] as const) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "DailyMetric"
        ("id", "day", "dimension", "value", "pageViews", "visitors", "sessions", "bounces",
         "totalDuration", "totalScroll", "scrollSamples", "newVisitors")
      SELECT
        gen_random_uuid()::text,
        pv."createdAt"::date,
        '${dimension}',
        p."${column}",
        COUNT(*)::int,
        COUNT(DISTINCT pv."visitorId")::int,
        0, 0,
        COALESCE(SUM(pv."timeOnPageSeconds"), 0)::int,
        COALESCE(SUM(pv."scrollDepthPercent"), 0)::int,
        COUNT(*) FILTER (WHERE pv."scrollDepthPercent" > 0)::int,
        COUNT(*) FILTER (WHERE pv."isNewVisitor")::int
      FROM "PageView" pv
      JOIN "Post" p ON p."id" = pv."postId"
      WHERE pv."createdAt" >= $1::date AND pv."createdAt" < $2::date + 1
      GROUP BY 2, 4
      ON CONFLICT ("day", "dimension", "value") DO UPDATE SET
        "pageViews" = "DailyMetric"."pageViews" + EXCLUDED."pageViews",
        "visitors" = GREATEST("DailyMetric"."visitors", EXCLUDED."visitors"),
        "totalDuration" = "DailyMetric"."totalDuration" + EXCLUDED."totalDuration",
        "totalScroll" = "DailyMetric"."totalScroll" + EXCLUDED."totalScroll",
        "scrollSamples" = "DailyMetric"."scrollSamples" + EXCLUDED."scrollSamples",
        "newVisitors" = "DailyMetric"."newVisitors" + EXCLUDED."newVisitors"
      `,
      from,
      to,
    );
  }

  // Self-declared demographics, rolled up the same way as everything else.
  // `known` is the denominator that keeps every demographic chart honest: it
  // counts the views we can attribute to a signed-in reader who answered.
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "DailyMetric"
      ("id", "day", "dimension", "value", "pageViews", "visitors", "sessions", "bounces",
       "totalDuration", "totalScroll", "scrollSamples", "newVisitors")
    SELECT
      gen_random_uuid()::text,
      pv."createdAt"::date,
      'ageBucket',
      CASE
        WHEN age <= 17 THEN '13-17'
        WHEN age <= 24 THEN '18-24'
        WHEN age <= 34 THEN '25-34'
        WHEN age <= 44 THEN '35-44'
        WHEN age <= 54 THEN '45-54'
        WHEN age <= 64 THEN '55-64'
        ELSE '65+'
      END,
      COUNT(*)::int,
      COUNT(DISTINCT pv."visitorId")::int,
      0, 0, 0, 0, 0, 0
    FROM (
      SELECT pv2.*, EXTRACT(YEAR FROM pv2."createdAt")::int - u."birthYear" AS age
      FROM "PageView" pv2
      JOIN "User" u ON u."id" = pv2."userId"
      WHERE pv2."createdAt" >= $1::date AND pv2."createdAt" < $2::date + 1 AND u."birthYear" IS NOT NULL
    ) pv
    WHERE age BETWEEN 13 AND 110
    GROUP BY 2, 4
    ON CONFLICT ("day", "dimension", "value") DO UPDATE SET
      "pageViews" = "DailyMetric"."pageViews" + EXCLUDED."pageViews"
    `,
    from,
    to,
  );

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "DailyMetric"
      ("id", "day", "dimension", "value", "pageViews", "visitors", "sessions", "bounces",
       "totalDuration", "totalScroll", "scrollSamples", "newVisitors")
    SELECT
      gen_random_uuid()::text,
      pv."createdAt"::date,
      'gender',
      u."gender"::text,
      COUNT(*)::int,
      COUNT(DISTINCT pv."visitorId")::int,
      0, 0, 0, 0, 0, 0
    FROM "PageView" pv
    JOIN "User" u ON u."id" = pv."userId"
    WHERE pv."createdAt" >= $1::date AND pv."createdAt" < $2::date + 1 AND u."gender" IS NOT NULL
    GROUP BY 2, 4
    ON CONFLICT ("day", "dimension", "value") DO UPDATE SET
      "pageViews" = "DailyMetric"."pageViews" + EXCLUDED."pageViews"
    `,
    from,
    to,
  );

  // Coverage denominators: how much traffic could be attributed at all.
  for (const [value, where] of [
    ['signedIn', `pv."userId" IS NOT NULL`],
    ['knownAge', `u."birthYear" IS NOT NULL`],
    ['knownGender', `u."gender" IS NOT NULL`],
  ] as const) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "DailyMetric"
        ("id", "day", "dimension", "value", "pageViews", "visitors", "sessions", "bounces",
         "totalDuration", "totalScroll", "scrollSamples", "newVisitors")
      SELECT
        gen_random_uuid()::text,
        pv."createdAt"::date,
        'coverage',
        '${value}',
        COUNT(*)::int,
        COUNT(DISTINCT pv."visitorId")::int,
        0, 0, 0, 0, 0, 0
      FROM "PageView" pv
      LEFT JOIN "User" u ON u."id" = pv."userId"
      WHERE pv."createdAt" >= $1::date AND pv."createdAt" < $2::date + 1 AND ${where}
      GROUP BY 2, 4
      ON CONFLICT ("day", "dimension", "value") DO UPDATE SET
        "pageViews" = "DailyMetric"."pageViews" + EXCLUDED."pageViews"
      `,
      from,
      to,
    );
  }

  const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "DailyMetric" WHERE "day" >= $1::date AND "day" <= $2::date`,
    from,
    to,
  );
  return Number(count);
}

/** Deletes raw events past the retention window; rollups are kept forever. */
export async function pruneRawEvents(prisma: PrismaClient, retentionMonths = 14) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);
  const views = await prisma.pageView.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const sessions = await prisma.visitSession.deleteMany({ where: { startedAt: { lt: cutoff } } });
  return { cutoff, pageViews: views.count, sessions: sessions.count };
}

const isEntrypoint = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/rollup.mts');

if (isEntrypoint) {
  const days = Number(process.argv[2] ?? 3);
  const prisma = new PrismaClient();
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const rows = await rebuildRollups(prisma, { from, to });
  console.log(`[rollup] rebuilt ${rows} metric rows across ${days} day(s)`);
  await prisma.$disconnect();
}
