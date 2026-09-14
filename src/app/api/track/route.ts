import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';

import { auth } from '@/auth';
import {
  SESSION_COOKIE,
  SESSION_TTL_MINUTES,
  VISITOR_COOKIE,
  classifySource,
  clientIp,
  geoFromHeaders,
  hash,
  parseUserAgent,
} from '@/lib/analytics';
import { CONSENT_COOKIE } from '@/lib/consent';
import { prisma } from '@/lib/prisma';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pageviewSchema = z.object({
  type: z.literal('pageview'),
  path: z.string().min(1).max(512),
  postId: z.string().max(64).nullish(),
  referrer: z.string().max(1024).nullish(),
  utmSource: z.string().max(128).nullish(),
  utmMedium: z.string().max(128).nullish(),
  utmCampaign: z.string().max(128).nullish(),
  screenWidth: z.number().int().min(0).max(10_000).nullish(),
});

/**
 * A bare tally for the article's view counter: no row, no cookie, nothing that
 * identifies anyone, so it needs no consent and ignores DNT. Bots still don't
 * count.
 */
const hitSchema = z.object({
  type: z.literal('hit'),
  path: z.string().min(1).max(512),
});

const engagementSchema = z.object({
  type: z.literal('engagement'),
  id: z.string().min(1).max(64),
  seconds: z.number().int().min(0).max(3600),
  scroll: z.number().int().min(0).max(100),
});

const payloadSchema = z.discriminatedUnion('type', [hitSchema, pageviewSchema, engagementSchema]);

/** Consent is enforced server-side too — the client check is a courtesy. */
function hasAnalyticsConsent(request: NextRequest): boolean {
  const raw = request.cookies.get(CONSENT_COOKIE)?.value;
  if (!raw) return false;
  try {
    return (JSON.parse(decodeURIComponent(raw)) as { value?: string }).value === 'all';
  } catch {
    return false;
  }
}

/**
 * Article attribution is resolved from the path server-side, so the client
 * never has to know a post id and can't claim one it did not visit.
 */
async function postIdFromPath(path: string): Promise<string | null> {
  const match = path.match(/^\/[a-z0-9-]+\/([a-z0-9-]+)\/?$/);
  if (!match) return null;
  const post = await prisma.post.findUnique({
    where: { slug: match[1], deletedAt: null },
    select: { id: true },
  });
  return post?.id ?? null;
}

function refusesTracking(request: NextRequest): boolean {
  return request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1';
}

export async function POST(request: NextRequest) {
  const ipHash = hash(clientIp(request.headers));
  const limit = rateLimit(`track:${ipHash}`, 120, 60);
  if (!limit.ok) return tooManyRequests(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (parsed.data.type === 'hit') {
    const ua = parseUserAgent(request.headers.get('user-agent'));
    if (ua.deviceType !== 'BOT') {
      const { path } = parsed.data;
      const postId = await postIdFromPath(path);
      // Days are UTC, the same clock the nightly rollup buckets by. Sent as a
      // date literal so the database's own timezone never enters into it.
      const day = new Date().toISOString().slice(0, 10);
      await Promise.all([
        // One upsert, done in SQL so two simultaneous hits cannot race on the
        // insert and lose one.
        prisma.$executeRaw`
          INSERT INTO "DailyHit" ("day", "path", "postId", "views")
          VALUES (${day}::date, ${path}, ${postId}, 1)
          ON CONFLICT ("day", "path") DO UPDATE SET "views" = "DailyHit"."views" + 1
        `.catch(() => null),
        postId
          ? prisma.post
              .update({ where: { id: postId }, data: { viewCount: { increment: 1 } } })
              .catch(() => null)
          : null,
      ]);
    }
    return new NextResponse(null, { status: 204 });
  }

  // Everything below stores something about the visitor, so it is consent-gated.
  if (refusesTracking(request) || !hasAnalyticsConsent(request)) {
    // 204: the beacon succeeded from the client's point of view, nothing stored.
    return new NextResponse(null, { status: 204 });
  }

  if (parsed.data.type === 'engagement') {
    const { id, seconds, scroll } = parsed.data;
    await prisma.pageView
      .update({
        where: { id },
        data: { timeOnPageSeconds: seconds, scrollDepthPercent: scroll },
      })
      .catch(() => null);
    return new NextResponse(null, { status: 204 });
  }

  const data = parsed.data;

  const postId = data.postId ?? (await postIdFromPath(data.path));

  const ua = parseUserAgent(request.headers.get('user-agent'));
  if (ua.deviceType === 'BOT') return new NextResponse(null, { status: 204 });

  const geo = geoFromHeaders(request.headers);
  const session = await auth().catch(() => null);

  // First-party identifiers: a random cookie value we only ever store hashed.
  const existingVisitor = request.cookies.get(VISITOR_COOKIE)?.value;
  const visitorRaw = existingVisitor ?? crypto.randomUUID();
  const visitorId = hash(visitorRaw);
  const isNewVisitor = !existingVisitor;

  const existingSession = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = existingSession ?? crypto.randomUUID();
  const source = classifySource(data.referrer ?? null, data.utmMedium);

  const view = await prisma.pageView.create({
    data: {
      postId,
      path: data.path,
      sessionId,
      visitorId,
      referrer: data.referrer ?? null,
      utmSource: data.utmSource ?? null,
      utmMedium: data.utmMedium ?? null,
      utmCampaign: data.utmCampaign ?? null,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      latitude: geo.latitude,
      longitude: geo.longitude,
      deviceType: ua.deviceType,
      browser: ua.browser,
      os: ua.os,
      screenWidth: data.screenWidth ?? null,
      isNewVisitor,
      userId: session?.user?.id ?? null,
    },
    select: { id: true },
  });

  // The session row is what bounce rate and pages-per-session are computed from.
  if (existingSession) {
    await prisma.visitSession
      .update({
        where: { id: sessionId },
        data: {
          pageCount: { increment: 1 },
          exitPath: data.path,
          endedAt: new Date(),
          isBounce: false,
          userId: session?.user?.id ?? undefined,
        },
      })
      .catch(async () => {
        // Cookie outlived the row (retention prune): start a fresh session.
        await prisma.visitSession.create({
          data: {
            id: sessionId,
            visitorId,
            entryPath: data.path,
            exitPath: data.path,
            country: geo.country,
            region: geo.region,
            city: geo.city,
            deviceType: ua.deviceType,
            browser: ua.browser,
            os: ua.os,
            source,
            referrer: data.referrer ?? null,
            userId: session?.user?.id ?? null,
          },
        });
      });
  } else {
    await prisma.visitSession.create({
      data: {
        id: sessionId,
        visitorId,
        entryPath: data.path,
        exitPath: data.path,
        country: geo.country,
        region: geo.region,
        city: geo.city,
        deviceType: ua.deviceType,
        browser: ua.browser,
        os: ua.os,
        source,
        referrer: data.referrer ?? null,
        userId: session?.user?.id ?? null,
      },
    });
  }

  // viewCount is not touched here: the consent-free hit already counted it.
  const response = NextResponse.json({ id: view.id });
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(VISITOR_COOKIE, visitorRaw, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_MINUTES * 60,
  });

  return response;
}
