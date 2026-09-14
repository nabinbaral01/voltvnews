import { prisma } from './prisma';

/**
 * Everything the dashboards read.
 *
 * Charts and tables query `DailyMetric` — the nightly rollup — never the raw
 * `PageView` table. Raw events are used in exactly three places, each marked
 * below: realtime (last 5 minutes), demographic cross-tabs, and geo drill-down
 * beyond the pre-aggregated dimensions.
 *
 * "Page views" is the exception to the rollup: it comes from `DailyHit`, the
 * live, consent-free tally, so it covers every reader and includes today.
 * Visitors, sessions, bounces and engagement need a visitor identity, which
 * only consenting readers provide, so those stay on the rollup — and every
 * ratio (time per view, pages per session) is computed over the same
 * consented views it was measured on, never the tally.
 */

const DAY = 86_400_000;

export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export type DateRange = {
  from: Date;
  to: Date;
  days: number;
  preset: RangePreset;
  previous: { from: Date; to: Date };
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

/** Parses the global date-range picker. Every dashboard shares this shape. */
export function parseRange(params: {
  preset?: string;
  from?: string;
  to?: string;
}): DateRange {
  const today = startOfDay(new Date());
  const preset = (params.preset ?? (params.from ? 'custom' : '30d')) as RangePreset;

  let from: Date;
  let to = today;

  if (preset === 'custom' && params.from) {
    from = startOfDay(new Date(params.from));
    to = params.to ? startOfDay(new Date(params.to)) : today;
    if (Number.isNaN(from.getTime())) from = new Date(today.getTime() - 29 * DAY);
    if (Number.isNaN(to.getTime())) to = today;
    if (from > to) [from, to] = [to, from];
  } else {
    const spans: Record<string, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 };
    from = new Date(today.getTime() - (spans[preset] ?? 29) * DAY);
  }

  const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1;

  return {
    from,
    to,
    days,
    preset,
    // Immediately-preceding window of equal length, for the % deltas.
    previous: {
      from: new Date(from.getTime() - days * DAY),
      to: new Date(from.getTime() - DAY),
    },
  };
}

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  custom: 'Custom',
};

// ---------------------------------------------------------------- hits

type HitFilter = { postId?: string; path?: string };

/** Tally views per day (ISO date → views), optionally for one post or path. */
async function hitsByDay(from: Date, to: Date, filter: HitFilter = {}): Promise<Map<string, number>> {
  const rows = await prisma.dailyHit.groupBy({
    by: ['day'],
    where: { day: { gte: from, lte: to }, ...filter },
    _sum: { views: true },
  });
  return new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r._sum.views ?? 0]));
}

/**
 * Days before the tally existed have no hit rows, so the consented count is
 * the best figure for them. Every consented view is also a hit, so taking the
 * larger of the two never double-counts.
 */
function bestViews(hits: number | undefined, sampled: number): number {
  return Math.max(hits ?? 0, sampled);
}

/** The tally is only kept by day and by page; other dimensions have none. */
function hitFilterFor(dimension: string, value: string): HitFilter | null {
  if (dimension === 'total') return {};
  if (dimension === 'post') return { postId: value };
  if (dimension === 'path') return { path: value };
  return null;
}

// ---------------------------------------------------------------- totals

export type Totals = {
  pageViews: number;
  /** Page views from readers who accepted analytics — the base of every other figure. */
  sampledPageViews: number;
  visitors: number;
  sessions: number;
  bounces: number;
  bounceRate: number;
  avgDurationSeconds: number;
  pagesPerSession: number;
  avgScrollPercent: number;
  newVisitors: number;
};

async function totalsFor(from: Date, to: Date): Promise<Totals> {
  const [rows, hits] = await Promise.all([
    prisma.dailyMetric.findMany({ where: { dimension: 'total', day: { gte: from, lte: to } } }),
    hitsByDay(from, to),
  ]);

  const s = {
    sampledViews: 0, visitors: 0, sessions: 0, bounces: 0,
    totalDuration: 0, totalScroll: 0, scrollSamples: 0, newVisitors: 0,
  };
  const sampledByDay = new Map<string, number>();
  for (const r of rows) {
    sampledByDay.set(r.day.toISOString().slice(0, 10), r.pageViews);
    s.sampledViews += r.pageViews;
    s.visitors += r.visitors;
    s.sessions += r.sessions;
    s.bounces += r.bounces;
    s.totalDuration += r.totalDuration;
    s.totalScroll += r.totalScroll;
    s.scrollSamples += r.scrollSamples;
    s.newVisitors += r.newVisitors;
  }

  let pageViews = 0;
  for (const day of new Set([...sampledByDay.keys(), ...hits.keys()])) {
    pageViews += bestViews(hits.get(day), sampledByDay.get(day) ?? 0);
  }

  const { sampledViews, sessions } = s;
  return {
    pageViews,
    sampledPageViews: sampledViews,
    // Summed daily uniques. A visitor who reads on three days counts three
    // times here; `uniqueVisitors()` below is the exact figure when it matters.
    visitors: s.visitors,
    sessions,
    bounces: s.bounces,
    bounceRate: sessions ? s.bounces / sessions : 0,
    avgDurationSeconds: sampledViews ? s.totalDuration / sampledViews : 0,
    pagesPerSession: sessions ? sampledViews / sessions : 0,
    avgScrollPercent: s.scrollSamples ? s.totalScroll / s.scrollSamples : 0,
    newVisitors: s.newVisitors,
  };
}

export async function getTotals(range: DateRange) {
  const [current, previous] = await Promise.all([
    totalsFor(range.from, range.to),
    totalsFor(range.previous.from, range.previous.to),
  ]);
  return { current, previous };
}

/**
 * How much of the readership the consented figures describe: the share of all
 * page views in the range that came with analytics cookies accepted.
 */
export async function getCoverage(range: DateRange) {
  const { pageViews, sampledPageViews } = await totalsFor(range.from, range.to);
  return {
    all: pageViews,
    sampled: sampledPageViews,
    share: pageViews ? sampledPageViews / pageViews : 0,
  };
}

/**
 * Exact distinct visitors across the whole window — the summed-daily figure
 * over-counts returning readers. Hits raw events, so it is only used for the
 * headline tile.
 */
export async function uniqueVisitors(range: DateRange): Promise<number> {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "visitorId")::bigint AS count
    FROM "PageView"
    WHERE "createdAt" >= ${range.from} AND "createdAt" < ${new Date(range.to.getTime() + DAY)}
  `;
  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------- series

export type SeriesPoint = {
  day: string;
  pageViews: number;
  visitors: number;
  sessions: number;
  bounces: number;
  bounceRate: number;
  avgDurationSeconds: number;
};

/** Daily series for the traffic chart, gap-filled so missing days render as 0. */
export async function getSeries(
  range: DateRange,
  dimension = 'total',
  value = 'all',
): Promise<SeriesPoint[]> {
  const filter = hitFilterFor(dimension, value);
  const [rows, hits] = await Promise.all([
    prisma.dailyMetric.findMany({
      where: { dimension, value, day: { gte: range.from, lte: range.to } },
      orderBy: { day: 'asc' },
    }),
    filter ? hitsByDay(range.from, range.to, filter) : new Map<string, number>(),
  ]);

  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const out: SeriesPoint[] = [];

  for (let t = range.from.getTime(); t <= range.to.getTime(); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({
      day: key,
      pageViews: bestViews(hits.get(key), row?.pageViews ?? 0),
      visitors: row?.visitors ?? 0,
      sessions: row?.sessions ?? 0,
      bounces: row?.bounces ?? 0,
      bounceRate: row?.sessions ? row.bounces / row.sessions : 0,
      avgDurationSeconds: row?.pageViews ? row.totalDuration / row.pageViews : 0,
    });
  }

  return out;
}

/** Sparkline data for the KPI tiles: one number per day, already ordered. */
export async function getSparklines(range: DateRange) {
  const series = await getSeries(range);
  return {
    pageViews: series.map((p) => p.pageViews),
    visitors: series.map((p) => p.visitors),
    sessions: series.map((p) => p.sessions),
    bounceRate: series.map((p) => Math.round(p.bounceRate * 100)),
    avgDuration: series.map((p) => Math.round(p.avgDurationSeconds)),
  };
}

// ---------------------------------------------------------------- breakdowns

export type BreakdownRow = {
  value: string;
  pageViews: number;
  visitors: number;
  sessions: number;
  bounces: number;
  bounceRate: number;
  avgDurationSeconds: number;
  share: number;
};

export async function getBreakdown(
  range: DateRange,
  dimension: string,
  limit = 20,
): Promise<BreakdownRow[]> {
  const rows = await prisma.dailyMetric.groupBy({
    by: ['value'],
    where: { dimension, day: { gte: range.from, lte: range.to } },
    _sum: {
      pageViews: true,
      visitors: true,
      sessions: true,
      bounces: true,
      totalDuration: true,
    },
    orderBy: { _sum: { pageViews: 'desc' } },
    take: limit,
  });

  const total = rows.reduce((sum, r) => sum + (r._sum.pageViews ?? 0), 0);

  return rows.map((row) => {
    const pageViews = row._sum.pageViews ?? 0;
    const sessions = row._sum.sessions ?? 0;
    return {
      value: row.value,
      pageViews,
      visitors: row._sum.visitors ?? 0,
      sessions,
      bounces: row._sum.bounces ?? 0,
      bounceRate: sessions ? (row._sum.bounces ?? 0) / sessions : 0,
      avgDurationSeconds: pageViews ? (row._sum.totalDuration ?? 0) / pageViews : 0,
      share: total ? pageViews / total : 0,
    };
  });
}

/** Country totals for the choropleth — every country, not a top-N slice. */
export async function getCountryTotals(range: DateRange) {
  return getBreakdown(range, 'country', 300);
}

/**
 * City drill-down for one country. Cities are pre-aggregated under the key
 * "CC|City", so this stays on the rollup table.
 */
export async function getCitiesForCountry(range: DateRange, country: string) {
  const rows = await prisma.dailyMetric.groupBy({
    by: ['value'],
    where: {
      dimension: 'city',
      value: { startsWith: `${country}|` },
      day: { gte: range.from, lte: range.to },
    },
    _sum: { pageViews: true, visitors: true, sessions: true, bounces: true, totalDuration: true },
    orderBy: { _sum: { pageViews: 'desc' } },
    take: 50,
  });

  return rows.map((row) => {
    const pageViews = row._sum.pageViews ?? 0;
    const sessions = row._sum.sessions ?? 0;
    return {
      city: row.value.split('|')[1] ?? row.value,
      pageViews,
      visitors: row._sum.visitors ?? 0,
      sessions,
      bounceRate: sessions ? (row._sum.bounces ?? 0) / sessions : 0,
      avgDurationSeconds: pageViews ? (row._sum.totalDuration ?? 0) / pageViews : 0,
    };
  });
}

/** New vs returning, from the rollup's newVisitors counter. */
export async function getNewVsReturning(range: DateRange) {
  const agg = await prisma.dailyMetric.aggregate({
    where: { dimension: 'total', day: { gte: range.from, lte: range.to } },
    _sum: { sessions: true, newVisitors: true },
  });
  const sessions = agg._sum.sessions ?? 0;
  const fresh = Math.min(agg._sum.newVisitors ?? 0, sessions);
  return { new: fresh, returning: Math.max(0, sessions - fresh), sessions };
}

// ---------------------------------------------------------------- content

export type PostPerformance = {
  id: string;
  title: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  contentTypeName: string;
  authorName: string;
  pageViews: number;
  visitors: number;
  avgDurationSeconds: number;
  avgScrollPercent: number;
  comments: number;
};

export async function getTopPosts(range: DateRange, limit = 10): Promise<PostPerformance[]> {
  const day = { gte: range.from, lte: range.to };
  const [hitRows, metricRows] = await Promise.all([
    prisma.dailyHit.groupBy({
      by: ['postId'],
      where: { postId: { not: null }, day },
      _sum: { views: true },
    }),
    prisma.dailyMetric.groupBy({
      by: ['value'],
      where: { dimension: 'post', day },
      _sum: {
        pageViews: true,
        visitors: true,
        totalDuration: true,
        totalScroll: true,
        scrollSamples: true,
      },
    }),
  ]);

  // Rank by the tally; a post only the rollup knows about (pre-tally days)
  // still ranks on its consented views.
  const sampled = new Map(metricRows.map((r) => [r.value, r._sum]));
  const hits = new Map(hitRows.map((r) => [r.postId as string, r._sum.views ?? 0]));
  const rows = [...new Set([...sampled.keys(), ...hits.keys()])]
    .map((id) => ({ value: id, views: bestViews(hits.get(id), sampled.get(id)?.pageViews ?? 0) }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);

  if (!rows.length) return [];

  const posts = await prisma.post.findMany({
    where: { id: { in: rows.map((r) => r.value) } },
    select: {
      id: true,
      title: true,
      slug: true,
      category: { select: { name: true, slug: true } },
      contentType: { select: { name: true } },
      author: { select: { name: true } },
      _count: { select: { comments: true } },
    },
  });
  const byId = new Map(posts.map((p) => [p.id, p]));

  return rows
    .map((row) => {
      const post = byId.get(row.value);
      if (!post) return null;
      const s = sampled.get(row.value);
      const sampledViews = s?.pageViews ?? 0;
      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        categoryName: post.category.name,
        categorySlug: post.category.slug,
        contentTypeName: post.contentType.name,
        authorName: post.author.name,
        pageViews: row.views,
        visitors: s?.visitors ?? 0,
        avgDurationSeconds: sampledViews ? (s?.totalDuration ?? 0) / sampledViews : 0,
        avgScrollPercent: s?.scrollSamples ? (s.totalScroll ?? 0) / s.scrollSamples : 0,
        comments: post._count.comments,
      };
    })
    .filter((row): row is PostPerformance => row !== null);
}

/** Author / category / content-type leaderboards, resolved to names. */
export async function getLabelledBreakdown(
  range: DateRange,
  dimension: 'author' | 'category' | 'contentType',
  limit = 20,
) {
  const rows = await getBreakdown(range, dimension, limit);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.value);
  const labels = new Map<string, string>();

  if (dimension === 'author') {
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    users.forEach((u) => labels.set(u.id, u.name));
  } else if (dimension === 'category') {
    const cats = await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, colour: true } });
    cats.forEach((c) => labels.set(c.id, c.name));
  } else {
    const types = await prisma.contentType.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    types.forEach((t) => labels.set(t.id, t.name));
  }

  return rows.map((row) => ({ ...row, label: labels.get(row.value) ?? 'Unknown' }));
}

// ---------------------------------------------------------------- realtime

/** The only place that reads raw events by design: the last five minutes. */
export async function getRealtime() {
  const since = new Date(Date.now() - 5 * 60_000);

  const [active, byPath, byCountry, recent] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "visitorId")::bigint AS count
      FROM "PageView" WHERE "createdAt" >= ${since}
    `,
    prisma.pageView.groupBy({
      by: ['path'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: 'desc' } },
      take: 10,
    }),
    prisma.pageView.groupBy({
      by: ['country'],
      where: { createdAt: { gte: since }, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: 'desc' } },
      take: 10,
    }),
    prisma.pageView.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        path: true,
        country: true,
        city: true,
        deviceType: true,
        createdAt: true,
        post: { select: { title: true } },
      },
    }),
  ]);

  return {
    activeVisitors: Number(active[0]?.count ?? 0),
    since,
    topPaths: byPath.map((row) => ({ path: row.path, views: row._count._all })),
    topCountries: byCountry.map((row) => ({ country: row.country ?? '??', views: row._count._all })),
    recent: recent.map((row) => ({
      path: row.path,
      title: row.post?.title ?? row.path,
      country: row.country,
      city: row.city,
      deviceType: row.deviceType,
      at: row.createdAt,
    })),
  };
}

// ---------------------------------------------------------------- demographics

export type DemographicBucket = { bucket: string; value: number; share: number };

export type DemographicReport = {
  /** Views we could attribute to a signed-in reader who answered the question. */
  known: number;
  /** All views in the window — the denominator that makes coverage honest. */
  total: number;
  coverage: number;
  buckets: DemographicBucket[];
  source: 'SELF_DECLARED' | 'SURVEY' | 'PANEL';
  sampleSize?: number;
  /** ±%, at 95% confidence. Only meaningful for the survey source. */
  marginOfError?: number;
};

function toBuckets(rows: { value: string; pageViews: number }[]): DemographicBucket[] {
  const total = rows.reduce((sum, r) => sum + r.pageViews, 0);
  return rows.map((row) => ({
    bucket: row.value,
    value: row.pageViews,
    share: total ? row.pageViews / total : 0,
  }));
}

/**
 * Self-declared demographics, from the optional account fields.
 *
 * Accurate for the readers it covers and silent about everyone else, which is
 * why `coverage` travels with the numbers everywhere they are displayed.
 */
export async function getSelfDeclared(
  range: DateRange,
  question: 'ageBucket' | 'gender',
): Promise<DemographicReport> {
  const [rows, totals, coverageRows] = await Promise.all([
    prisma.dailyMetric.groupBy({
      by: ['value'],
      where: { dimension: question, day: { gte: range.from, lte: range.to } },
      _sum: { pageViews: true },
    }),
    totalsFor(range.from, range.to),
    prisma.dailyMetric.groupBy({
      by: ['value'],
      where: {
        dimension: 'coverage',
        value: question === 'ageBucket' ? 'knownAge' : 'knownGender',
        day: { gte: range.from, lte: range.to },
      },
      _sum: { pageViews: true },
    }),
  ]);

  const buckets = toBuckets(
    rows.map((r) => ({ value: r.value, pageViews: r._sum.pageViews ?? 0 })),
  );
  const known = coverageRows[0]?._sum.pageViews ?? 0;

  return {
    known,
    total: totals.pageViews,
    coverage: totals.pageViews ? known / totals.pageViews : 0,
    buckets,
    source: 'SELF_DECLARED',
  };
}

/**
 * On-site poll results, projected. Reported with its sample size and a 95%
 * margin of error so nobody reads a 1,400-response poll as a census.
 */
export async function getSurveyDemographics(
  range: DateRange,
  question: 'age' | 'gender',
): Promise<DemographicReport> {
  const rows = await prisma.surveyResponse.groupBy({
    by: ['answer'],
    where: { questionKey: question, createdAt: { gte: range.from, lte: new Date(range.to.getTime() + DAY) } },
    _count: { _all: true },
  });

  const sampleSize = rows.reduce((sum, r) => sum + r._count._all, 0);
  const buckets = toBuckets(rows.map((r) => ({ value: r.answer, pageViews: r._count._all })));
  const totals = await totalsFor(range.from, range.to);

  return {
    known: sampleSize,
    total: totals.pageViews,
    coverage: totals.pageViews ? sampleSize / totals.pageViews : 0,
    buckets,
    source: 'SURVEY',
    sampleSize,
    // Standard 95% CI for a proportion at p = 0.5, the widest case.
    marginOfError: sampleSize ? 1.96 * Math.sqrt(0.25 / sampleSize) : undefined,
  };
}

/** Modelled third-party panel shares (GA4-shaped). Never per-visitor. */
export async function getPanelDemographics(
  range: DateRange,
  question: 'age' | 'gender',
): Promise<DemographicReport> {
  const rows = await prisma.panelDemographic.groupBy({
    by: ['bucket'],
    where: { questionKey: question, day: { gte: range.from, lte: range.to } },
    _avg: { share: true },
  });

  const total = rows.reduce((sum, r) => sum + (r._avg.share ?? 0), 0);

  return {
    known: 0,
    total: 0,
    coverage: 0,
    buckets: rows.map((row) => ({
      bucket: row.bucket,
      value: Math.round((row._avg.share ?? 0) * 1000) / 10,
      share: total ? (row._avg.share ?? 0) / total : 0,
    })),
    source: 'PANEL',
  };
}

/**
 * Cross-tabbed demographics (by category or country). Composite dimensions are
 * not pre-aggregated, so this is the documented drill-down path into raw
 * events — bounded by the 14-month retention window.
 */
export async function getDemographicCrosstab(
  range: DateRange,
  question: 'ageBucket' | 'gender',
  filter: { categoryId?: string; country?: string },
): Promise<DemographicReport> {
  const to = new Date(range.to.getTime() + DAY);
  const conditions = [`pv."createdAt" >= $1`, `pv."createdAt" < $2`];
  const params: unknown[] = [range.from, to];

  if (filter.country) {
    params.push(filter.country);
    conditions.push(`pv."country" = $${params.length}`);
  }
  if (filter.categoryId) {
    params.push(filter.categoryId);
    conditions.push(`p."categoryId" = $${params.length}`);
  }

  const bucketExpr =
    question === 'ageBucket'
      ? `CASE
           WHEN EXTRACT(YEAR FROM pv."createdAt")::int - u."birthYear" <= 17 THEN '13-17'
           WHEN EXTRACT(YEAR FROM pv."createdAt")::int - u."birthYear" <= 24 THEN '18-24'
           WHEN EXTRACT(YEAR FROM pv."createdAt")::int - u."birthYear" <= 34 THEN '25-34'
           WHEN EXTRACT(YEAR FROM pv."createdAt")::int - u."birthYear" <= 44 THEN '35-44'
           WHEN EXTRACT(YEAR FROM pv."createdAt")::int - u."birthYear" <= 54 THEN '45-54'
           WHEN EXTRACT(YEAR FROM pv."createdAt")::int - u."birthYear" <= 64 THEN '55-64'
           ELSE '65+'
         END`
      : `u."gender"::text`;

  const known = question === 'ageBucket' ? `u."birthYear" IS NOT NULL` : `u."gender" IS NOT NULL`;

  const rows = await prisma.$queryRawUnsafe<{ bucket: string; views: bigint }[]>(
    `
    SELECT ${bucketExpr} AS bucket, COUNT(*)::bigint AS views
    FROM "PageView" pv
    JOIN "User" u ON u."id" = pv."userId"
    LEFT JOIN "Post" p ON p."id" = pv."postId"
    WHERE ${conditions.join(' AND ')} AND ${known}
    GROUP BY 1
    ORDER BY 2 DESC
    `,
    ...params,
  );

  const totalRows = await prisma.$queryRawUnsafe<{ views: bigint }[]>(
    `
    SELECT COUNT(*)::bigint AS views
    FROM "PageView" pv
    LEFT JOIN "Post" p ON p."id" = pv."postId"
    WHERE ${conditions.join(' AND ')}
    `,
    ...params,
  );

  const buckets = toBuckets(
    rows.map((r) => ({ value: r.bucket, pageViews: Number(r.views) })),
  );
  const known_ = buckets.reduce((sum, b) => sum + b.value, 0);
  const total = Number(totalRows[0]?.views ?? 0);

  return {
    known: known_,
    total,
    coverage: total ? known_ / total : 0,
    buckets,
    source: 'SELF_DECLARED',
  };
}

// ---------------------------------------------------------------- acquisition

export async function getAcquisition(range: DateRange) {
  const [sources, referrers, campaigns] = await Promise.all([
    getBreakdown(range, 'source', 10),
    getBreakdown(range, 'referrer', 20),
    getBreakdown(range, 'campaign', 20),
  ]);
  return { sources, referrers, campaigns };
}

export async function getTechnology(range: DateRange) {
  const [devices, browsers, operatingSystems] = await Promise.all([
    getBreakdown(range, 'device', 10),
    getBreakdown(range, 'browser', 12),
    getBreakdown(range, 'os', 12),
  ]);
  return { devices, browsers, operatingSystems };
}
