import { PrismaClient } from '@prisma/client';
import { expect, test, type Page, type Request } from '@playwright/test';

import { acceptAnalytics, firstArticleHref } from './helpers';

const prisma = new PrismaClient();

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 3000}`;

/**
 * Two kinds of POST reach /api/track. A "hit" is the consent-free view tally
 * and carries only the path; a "pageview" is the analytics row and must never
 * leave the browser without consent. The tests tell them apart by payload.
 *
 * Hits go out via sendBeacon, which Playwright's request events do not see,
 * so the tally is checked where it lands: the post's viewCount.
 */
function trackType(request: Request): string | null {
  if (!request.url().includes('/api/track') || request.method() !== 'POST') return null;
  try {
    return (request.postDataJSON() as { type?: string } | null)?.type ?? null;
  } catch {
    return null;
  }
}

function pageviewFor(path: string) {
  return (res: { request(): Request }) =>
    trackType(res.request()) === 'pageview' &&
    (res.request().postDataJSON() as { path: string }).path === path;
}

async function viewCountOf(href: string): Promise<number> {
  const slug = href.split('/')[2]?.split('?')[0] ?? '';
  const post = await prisma.post.findFirstOrThrow({ where: { slug }, select: { viewCount: true } });
  return post.viewCount;
}

/** Today's tally for a path — what the traffic chart reads. */
async function todaysHitsFor(path: string): Promise<number> {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const row = await prisma.dailyHit.findUnique({ where: { day_path: { day, path } } });
  return row?.views ?? 0;
}

function collectTrackTypes(page: Page): string[] {
  const types: string[] = [];
  page.on('request', (request) => {
    const type = trackType(request);
    if (type) types.push(type);
  });
  return types;
}

test.describe('analytics tracking', () => {
  test.afterAll(() => prisma.$disconnect());

  test('a visit counts without consent, but sends nothing else', async ({ page }) => {
    const href = await firstArticleHref(page);
    const [before, hitsBefore] = await Promise.all([viewCountOf(href), todaysHitsFor(href)]);
    const types = collectTrackTypes(page);

    await page.goto(href);
    await expect
      .poll(() => viewCountOf(href), { message: 'the view counter runs without consent' })
      .toBe(before + 1);
    expect(await todaysHitsFor(href), "today's tally feeds the traffic chart").toBe(hitsBefore + 1);

    await page.waitForTimeout(1500);
    expect(types, 'the analytics beacon must not fire until cookies are accepted').not.toContain(
      'pageview',
    );
  });

  test('a page view is recorded once consent is given', async ({ page }) => {
    // Resolve the target before arming the listener — firstArticleHref
    // navigates, and a navigation discards any pending response body.
    const href = await firstArticleHref(page);

    await page.goto('/');
    await acceptAnalytics(page);

    // Accepting also records "/" itself, so wait for the article's beacon.
    const beacon = page.waitForResponse(pageviewFor(href), { timeout: 20_000 });
    await page.goto(href);

    const response = await beacon;
    expect(response.status()).toBe(200);

    const payload = await response.json();
    expect(
      payload.id,
      'the server returns the page-view id the engagement update is keyed on',
    ).toBeTruthy();
  });

  test('accepting on the page you landed on records that page', async ({ page }) => {
    // The common case: arrive from a search result, answer the banner, read.
    // The beacon has to wait for the decision, not give up at page load.
    const href = await firstArticleHref(page);

    await page.goto(href);
    const beacon = page.waitForResponse(pageviewFor(href), { timeout: 20_000 });
    await acceptAnalytics(page);

    expect((await beacon).status()).toBe(200);
  });

  test('Global Privacy Control is honoured even with consent stored', async ({ browser }) => {
    const context = await browser.newContext();
    // GPC is a browser-level signal; simulate it before any script runs.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    });
    await context.addCookies([
      {
        name: 'volt_consent',
        value: encodeURIComponent(JSON.stringify({ value: 'all', version: 1, at: new Date().toISOString() })),
        url: BASE_URL,
      },
    ]);

    const page = await context.newPage();
    const types = collectTrackTypes(page);

    await page.goto('/');
    await page.waitForTimeout(2500);

    expect(types, 'GPC overrides a stored consent cookie').not.toContain('pageview');
    await context.close();
  });

  test('the consent banner is not shown again after a decision', async ({ page }) => {
    await page.goto('/');
    await acceptAnalytics(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Accept analytics' })).toHaveCount(0);
  });
});
