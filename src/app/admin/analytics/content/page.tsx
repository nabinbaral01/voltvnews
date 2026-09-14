import type { Metadata } from 'next';

import { ContentClient } from './content-client';
import { DateRangePicker } from '@/components/admin/date-range-picker';
import { CoverageNote } from '@/components/admin/coverage-note';
import { PageHeader } from '@/components/admin/page-header';
import {
  getLabelledBreakdown, getTopPosts, parseRange, RANGE_LABELS,
} from '@/lib/analytics-queries';
import { refreshToday } from '@/lib/analytics-live';

export const metadata: Metadata = { title: 'Content' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ preset?: string; from?: string; to?: string }> };

export default async function ContentPage({ searchParams }: Props) {
  await refreshToday();
  const range = parseRange(await searchParams);

  const [posts, authors, categories, contentTypes] = await Promise.all([
    getTopPosts(range, 100),
    getLabelledBreakdown(range, 'author', 20),
    getLabelledBreakdown(range, 'category', 20),
    getLabelledBreakdown(range, 'contentType', 20),
  ]);

  return (
    <>
      <PageHeader
        title="Content"
        description={`${RANGE_LABELS[range.preset]} · every post ranked, plus how the two taxonomy axes are performing against each other.`}
      >
        <DateRangePicker
          preset={range.preset}
          from={range.from.toISOString().slice(0, 10)}
          to={range.to.toISOString().slice(0, 10)}
        />
      </PageHeader>
      <CoverageNote range={range} />

      <ContentClient
        posts={posts}
        authors={authors.map((row) => ({
          label: row.label,
          value: row.pageViews,
          avgDurationSeconds: row.avgDurationSeconds,
        }))}
        categories={categories.map((row) => ({
          label: row.label,
          value: row.pageViews,
          avgDurationSeconds: row.avgDurationSeconds,
        }))}
        contentTypes={contentTypes.map((row) => ({
          label: row.label,
          value: row.pageViews,
          avgDurationSeconds: row.avgDurationSeconds,
        }))}
      />
    </>
  );
}
