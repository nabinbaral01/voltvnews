import type { Metadata } from 'next';

import { OverviewCharts } from './overview-charts';
import { DateRangePicker } from '@/components/admin/date-range-picker';
import { CoverageNote } from '@/components/admin/coverage-note';
import { PageHeader } from '@/components/admin/page-header';
import { StatTile } from '@/components/admin/stat-tile';
import {
  getNewVsReturning, getSeries, getSparklines, getTotals, parseRange, RANGE_LABELS,
  uniqueVisitors,
} from '@/lib/analytics-queries';
import { refreshToday } from '@/lib/analytics-live';
import { compactNumber, formatDuration } from '@/lib/utils';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ preset?: string; from?: string; to?: string }> };

export default async function AnalyticsOverview({ searchParams }: Props) {
  await refreshToday();
  const range = parseRange(await searchParams);

  const [{ current, previous }, series, comparison, sparks, uniques, newVsReturning] =
    await Promise.all([
      getTotals(range),
      getSeries(range),
      getSeries({ ...range, from: range.previous.from, to: range.previous.to }),
      getSparklines(range),
      uniqueVisitors(range),
      getNewVsReturning(range),
    ]);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${RANGE_LABELS[range.preset]} · every figure below is compared with the ${range.days}-day window immediately before it.`}
      >
        <DateRangePicker
          preset={range.preset}
          from={range.from.toISOString().slice(0, 10)}
          to={range.to.toISOString().slice(0, 10)}
        />
      </PageHeader>
      <CoverageNote range={range} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Visitors"
          value={compactNumber(uniques)}
          current={current.visitors}
          previous={previous.visitors}
          spark={sparks.visitors}
          hint="Distinct across the whole window"
        />
        <StatTile
          label="Sessions"
          value={compactNumber(current.sessions)}
          current={current.sessions}
          previous={previous.sessions}
          spark={sparks.sessions}
        />
        <StatTile
          label="Page views"
          value={compactNumber(current.pageViews)}
          current={current.pageViews}
          previous={previous.pageViews}
          spark={sparks.pageViews}
        />
        <StatTile
          label="Avg. time on page"
          value={formatDuration(current.avgDurationSeconds)}
          current={current.avgDurationSeconds}
          previous={previous.avgDurationSeconds}
          spark={sparks.avgDuration}
        />
        <StatTile
          label="Bounce rate"
          value={`${(current.bounceRate * 100).toFixed(1)}%`}
          current={current.bounceRate}
          previous={previous.bounceRate}
          spark={sparks.bounceRate}
          invert
        />
        <StatTile
          label="Pages per session"
          value={current.pagesPerSession.toFixed(2)}
          current={current.pagesPerSession}
          previous={previous.pagesPerSession}
        />
      </div>

      <div className="mt-6">
        <OverviewCharts
          series={series}
          comparison={comparison}
          rangeLabel={RANGE_LABELS[range.preset]}
          newVsReturning={newVsReturning}
          avgScroll={current.avgScrollPercent}
        />
      </div>
    </>
  );
}
