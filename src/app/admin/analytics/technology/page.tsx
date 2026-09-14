import type { Metadata } from 'next';

import { TechnologyClient } from './technology-client';
import { DateRangePicker } from '@/components/admin/date-range-picker';
import { CoverageNote } from '@/components/admin/coverage-note';
import { PageHeader } from '@/components/admin/page-header';
import { getTechnology, parseRange, RANGE_LABELS } from '@/lib/analytics-queries';
import { refreshToday } from '@/lib/analytics-live';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = { title: 'Technology' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ preset?: string; from?: string; to?: string }> };

/** Screen-width buckets come from raw events; they are not a rollup dimension. */
const WIDTH_BUCKETS = [
  { label: '< 400px', min: 0, max: 399 },
  { label: '400–767px', min: 400, max: 767 },
  { label: '768–1023px', min: 768, max: 1023 },
  { label: '1024–1439px', min: 1024, max: 1439 },
  { label: '1440–1919px', min: 1440, max: 1919 },
  { label: '1920px+', min: 1920, max: 100_000 },
];

export default async function TechnologyPage({ searchParams }: Props) {
  await refreshToday();
  const range = parseRange(await searchParams);

  const [tech, widths] = await Promise.all([
    getTechnology(range),
    prisma.$queryRaw<{ bucket: string; views: bigint }[]>`
      SELECT
        CASE
          WHEN "screenWidth" < 400 THEN '< 400px'
          WHEN "screenWidth" < 768 THEN '400–767px'
          WHEN "screenWidth" < 1024 THEN '768–1023px'
          WHEN "screenWidth" < 1440 THEN '1024–1439px'
          WHEN "screenWidth" < 1920 THEN '1440–1919px'
          ELSE '1920px+'
        END AS bucket,
        COUNT(*)::bigint AS views
      FROM "PageView"
      WHERE "createdAt" >= ${range.from}
        AND "createdAt" < ${new Date(range.to.getTime() + 86_400_000)}
        AND "screenWidth" IS NOT NULL
      GROUP BY 1
    `,
  ]);

  const widthMap = new Map(widths.map((row) => [row.bucket, Number(row.views)]));

  return (
    <>
      <PageHeader
        title="Audience · Technology"
        description={`${RANGE_LABELS[range.preset]} · device, browser, operating system and viewport.`}
      >
        <DateRangePicker
          preset={range.preset}
          from={range.from.toISOString().slice(0, 10)}
          to={range.to.toISOString().slice(0, 10)}
        />
      </PageHeader>
      <CoverageNote range={range} />

      <TechnologyClient
        devices={tech.devices.map((row) => ({
          label: row.value.charAt(0) + row.value.slice(1).toLowerCase(),
          value: row.sessions || row.pageViews,
        }))}
        browsers={tech.browsers.map((row) => ({ label: row.value, value: row.pageViews }))}
        operatingSystems={tech.operatingSystems.map((row) => ({ label: row.value, value: row.pageViews }))}
        screenWidths={WIDTH_BUCKETS.map((bucket) => ({
          label: bucket.label,
          value: widthMap.get(bucket.label) ?? 0,
        }))}
      />
    </>
  );
}
