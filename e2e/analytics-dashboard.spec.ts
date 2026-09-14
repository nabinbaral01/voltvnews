import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

import { acceptAnalytics, firstArticleHref, signIn } from './helpers';

const prisma = new PrismaClient();

const PAGES = [
  '/admin',
  '/admin/analytics',
  '/admin/analytics/acquisition',
  '/admin/analytics/location',
  '/admin/analytics/technology',
  '/admin/analytics/content',
  '/admin/analytics/demographics',
];

test.describe('analytics dashboards', () => {
  test.afterAll(() => prisma.$disconnect());

  test('today is rolled up when a dashboard loads, not only by the nightly cron', async ({
    page,
  }) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.dailyMetric.deleteMany({ where: { day: today } });

    // A consented read is what the rollup aggregates.
    const href = await firstArticleHref(page);
    await page.goto('/');
    await acceptAnalytics(page);
    const beacon = page.waitForResponse(
      (res) => res.url().includes('/api/track') && res.status() === 200,
    );
    await page.goto(href);
    await beacon;

    await signIn(page, 'admin');
    const res = await page.goto('/admin/analytics?preset=today');
    expect(res?.status()).toBe(200);

    // The row lands on today's UTC date whatever timezone the database
    // session runs in — the local server is deliberately not UTC.
    const total = await prisma.dailyMetric.findFirst({ where: { day: today, dimension: 'total' } });
    expect(total, "today's rollup row").toBeTruthy();
    expect(total!.pageViews).toBeGreaterThanOrEqual(1);
    expect(total!.sessions).toBeGreaterThanOrEqual(1);
  });

  test('every page says which readers its figures describe', async ({ page }) => {
    await signIn(page, 'admin');
    for (const path of PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByText(/who accepted analytics cookies/), path).toBeVisible();
    }
  });
});
