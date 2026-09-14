'use client';

import * as React from 'react';

import { SplitBar } from '@/components/admin/charts/basic-charts';
import { ChartFrame } from '@/components/admin/charts/chart-frame';
import { TimeSeriesChart, type MetricKey } from '@/components/admin/charts/time-series';
import type { SeriesPoint } from '@/lib/analytics-queries';
import { formatDuration } from '@/lib/utils';

export function OverviewCharts({
  series,
  comparison,
  rangeLabel,
  newVsReturning,
  avgScroll,
}: {
  series: SeriesPoint[];
  comparison: SeriesPoint[];
  rangeLabel: string;
  newVsReturning: { new: number; returning: number; sessions: number };
  avgScroll: number;
}) {
  const [metric, setMetric] = React.useState<MetricKey>('pageViews');

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <ChartFrame
          title="Traffic over time"
          description={`${rangeLabel}, with the previous period overlaid`}
          csvName="volt-analytics-overview"
          columns={[
            { key: 'day', label: 'Day' },
            { key: 'pageViews', label: 'Page views', align: 'right' },
            { key: 'visitors', label: 'Visitors', align: 'right' },
            { key: 'sessions', label: 'Sessions', align: 'right' },
            { key: 'bounceRate', label: 'Bounce rate', align: 'right' },
            { key: 'avgTime', label: 'Avg. time', align: 'right' },
          ]}
          rows={series.map((point) => ({
            day: point.day,
            pageViews: point.pageViews,
            visitors: point.visitors,
            sessions: point.sessions,
            bounceRate: `${(point.bounceRate * 100).toFixed(1)}%`,
            avgTime: formatDuration(point.avgDurationSeconds),
          }))}
        >
          <TimeSeriesChart
            data={series}
            comparison={comparison}
            metric={metric}
            onMetricChange={setMetric}
            height={320}
          />
        </ChartFrame>
      </div>

      <div className="space-y-4">
        <ChartFrame
          title="New vs returning"
          description="Share of sessions started by a first-time visitor"
        >
          <SplitBar
            parts={[
              { label: 'New', value: newVsReturning.new },
              { label: 'Returning', value: newVsReturning.returning },
            ]}
          />
          <p className="mt-3 text-xs text-muted">
            {newVsReturning.sessions.toLocaleString()} sessions in the period. A visitor counts as
            new until their first-party cookie is set, so cleared cookies read as new visitors.
          </p>
        </ChartFrame>

        <ChartFrame title="Reading depth" description="How far down the page people get">
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-semibold tabular-nums">{avgScroll.toFixed(0)}%</p>
            <p className="text-sm text-muted">average scroll depth</p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, avgScroll)}%`, background: 'var(--chart-primary)' }}
              role="presentation"
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Measured when the page is hidden, so a reader who leaves a tab open still reports the
            depth they actually reached.
          </p>
        </ChartFrame>
      </div>
    </div>
  );
}
