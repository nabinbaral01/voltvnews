import type { Metadata } from 'next';

import { AcquisitionClient } from './acquisition-client';
import { DateRangePicker } from '@/components/admin/date-range-picker';
import { CoverageNote } from '@/components/admin/coverage-note';
import { PageHeader } from '@/components/admin/page-header';
import { getAcquisition, parseRange, RANGE_LABELS } from '@/lib/analytics-queries';
import { refreshToday } from '@/lib/analytics-live';

export const metadata: Metadata = { title: 'Acquisition' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ preset?: string; from?: string; to?: string }> };

export default async function AcquisitionPage({ searchParams }: Props) {
  await refreshToday();
  const range = parseRange(await searchParams);
  const { sources, referrers, campaigns } = await getAcquisition(range);

  return (
    <>
      <PageHeader
        title="Acquisition"
        description={`${RANGE_LABELS[range.preset]} · how sessions started, and which campaigns brought them.`}
      >
        <DateRangePicker
          preset={range.preset}
          from={range.from.toISOString().slice(0, 10)}
          to={range.to.toISOString().slice(0, 10)}
        />
      </PageHeader>
      <CoverageNote range={range} />

      <AcquisitionClient
        sources={sources.map((row) => ({
          label: row.value.charAt(0).toUpperCase() + row.value.slice(1),
          value: row.sessions || row.pageViews,
          bounceRate: row.bounceRate,
          avgDurationSeconds: row.avgDurationSeconds,
        }))}
        referrers={referrers.map((row) => ({
          label: row.value,
          value: row.sessions || row.pageViews,
          bounceRate: row.bounceRate,
          avgDurationSeconds: row.avgDurationSeconds,
        }))}
        campaigns={campaigns.map((row) => ({
          label: row.value,
          value: row.pageViews,
          bounceRate: row.bounceRate,
          avgDurationSeconds: row.avgDurationSeconds,
        }))}
      />
    </>
  );
}
