import { FileText, PenLine } from 'lucide-react';
import Link from 'next/link';

import { LiveCounter, SourceDonut, TrafficChart } from './dashboard-charts';
import { DateRangePicker } from '@/components/admin/date-range-picker';
import { CoverageNote } from '@/components/admin/coverage-note';
import { PageHeader } from '@/components/admin/page-header';
import { StatTile } from '@/components/admin/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatusPill } from '@/components/ui/surface';
import {
  getBreakdown,
  getRealtime,
  getSeries,
  getSparklines,
  getTopPosts,
  getTotals,
  parseRange,
  RANGE_LABELS,
  uniqueVisitors,
} from '@/lib/analytics-queries';
import { refreshToday } from '@/lib/analytics-live';
import { can, requireCapability } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { compactNumber, formatDuration, formatNumber, relativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Outside the component body — a clock read counts as impure during render. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/** Inclusive upper bound for a date range, as an exclusive timestamp. */
function endOfRange(to: Date): Date {
  return new Date(to.getTime() + 86_400_000);
}

type Props = { searchParams: Promise<{ preset?: string; from?: string; to?: string }> };

export default async function AdminDashboard({ searchParams }: Props) {
  const user = await requireCapability('admin.access');
  const params = await searchParams;
  const range = parseRange(params);
  const showAnalytics = can(user.role, 'analytics.view');
  if (showAnalytics) await refreshToday();

  // An AUTHOR gets the editorial half of this page and none of the numbers.
  const [postsThisWeek, myDrafts, pendingComments, recentPosts] = await Promise.all([
    prisma.post.count({
      where: { status: 'PUBLISHED', publishedAt: { gte: daysAgo(7) } },
    }),
    prisma.post.findMany({
      where: can(user.role, 'post.edit.any')
        ? { status: { in: ['DRAFT', 'IN_REVIEW', 'SCHEDULED'] } }
        : { authorId: user.id, status: { in: ['DRAFT', 'IN_REVIEW', 'SCHEDULED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        author: { select: { name: true } },
      },
    }),
    can(user.role, 'comment.moderate')
      ? prisma.comment.count({ where: { status: 'PENDING' } })
      : Promise.resolve(0),
    prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        slug: true,
        viewCount: true,
        publishedAt: true,
        category: { select: { slug: true, name: true } },
      },
    }),
  ]);

  if (!showAnalytics) {
    return (
      <>
        <PageHeader
          title={`Good to see you, ${(user.name ?? '').split(' ')[0]}`}
          description="Your desk. Audience numbers are visible to editors and administrators."
          actions={
            <Button asChild>
              <Link href="/admin/posts/new">
                <PenLine className="size-4" /> New post
              </Link>
            </Button>
          }
        />
        <Card>
          <CardHeader title="Your work in progress" />
          <ul className="divide-y divide-border">
            {myDrafts.map((post) => (
              <li key={post.id} className="flex items-center gap-3 p-4">
                <Link href={`/admin/posts/${post.id}`} className="min-w-0 flex-1 truncate text-sm hover:text-accent">
                  {post.title}
                </Link>
                <StatusPill status={post.status} />
                <span className="hidden shrink-0 text-xs text-muted sm:inline">
                  {relativeTime(post.updatedAt)}
                </span>
              </li>
            ))}
            {!myDrafts.length ? (
              <li className="p-6 text-center text-sm text-muted">Nothing in progress.</li>
            ) : null}
          </ul>
        </Card>
      </>
    );
  }

  const [{ current, previous }, series, comparison, sparks, topPosts, sources, realtime, uniques, newSubs, prevSubs] =
    await Promise.all([
      getTotals(range),
      getSeries(range),
      getSeries({ ...range, from: range.previous.from, to: range.previous.to }),
      getSparklines(range),
      getTopPosts(range, 10),
      getBreakdown(range, 'source', 6),
      getRealtime(),
      uniqueVisitors(range),
      prisma.newsletter.count({
        where: { createdAt: { gte: range.from, lte: endOfRange(range.to) } },
      }),
      prisma.newsletter.count({
        where: { createdAt: { gte: range.previous.from, lte: range.previous.to } },
      }),
    ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${RANGE_LABELS[range.preset]} · ${formatNumber(current.pageViews)} page views`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/posts">
                <FileText className="size-4" /> All posts
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/posts/new">
                <PenLine className="size-4" /> New post
              </Link>
            </Button>
          </>
        }
      >
        <DateRangePicker
          preset={range.preset}
          from={range.from.toISOString().slice(0, 10)}
          to={range.to.toISOString().slice(0, 10)}
        />
      </PageHeader>
      <CoverageNote range={range} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Visitors"
          value={compactNumber(uniques)}
          current={current.visitors}
          previous={previous.visitors}
          spark={sparks.visitors}
          hint="Distinct visitors across the whole period"
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
          label="New subscribers"
          value={formatNumber(newSubs)}
          current={newSubs}
          previous={prevSubs}
        />
        <StatTile
          label="Published this week"
          value={formatNumber(postsThisWeek)}
          hint="Across every vertical"
        />
        <StatTile
          label="Comments awaiting review"
          value={formatNumber(pendingComments)}
          hint={pendingComments ? 'Needs a moderator' : 'Queue is clear'}
        />
        <LiveCounter initial={realtime.activeVisitors} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrafficChart
            series={series}
            comparison={comparison}
            rangeLabel={RANGE_LABELS[range.preset]}
          />
        </div>
        <SourceDonut
          slices={sources.map((row) => ({
            label: row.value.charAt(0).toUpperCase() + row.value.slice(1),
            value: row.sessions,
          }))}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Top posts"
            description={RANGE_LABELS[range.preset]}
            action={
              <Link href="/admin/analytics/content" className="text-xs text-accent hover:underline">
                Full report →
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="p-3 font-medium">Post</th>
                  <th scope="col" className="p-3 font-medium">Section</th>
                  <th scope="col" className="p-3 text-right font-medium">Views</th>
                  <th scope="col" className="p-3 text-right font-medium">Avg. time</th>
                  <th scope="col" className="p-3 text-right font-medium">Scroll</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((post) => (
                  <tr key={post.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-72 p-3">
                      <Link
                        href={`/${post.categorySlug}/${post.slug}`}
                        className="line-clamp-2 hover:text-accent"
                      >
                        {post.title}
                      </Link>
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {post.categoryName} · {post.contentTypeName}
                    </td>
                    <td className="p-3 text-right tabular-nums">{compactNumber(post.pageViews)}</td>
                    <td className="p-3 text-right tabular-nums text-muted">
                      {formatDuration(post.avgDurationSeconds)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted">
                      {post.avgScrollPercent.toFixed(0)}%
                    </td>
                  </tr>
                ))}
                {!topPosts.length ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted">
                      No page views recorded in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="In progress" description="Drafts, review queue and scheduled" />
            <ul className="divide-y divide-border">
              {myDrafts.map((post) => (
                <li key={post.id} className="flex items-center gap-2 px-4 py-2.5">
                  <Link
                    href={`/admin/posts/${post.id}`}
                    className="min-w-0 flex-1 truncate text-sm hover:text-accent"
                  >
                    {post.title}
                  </Link>
                  <StatusPill status={post.status} />
                </li>
              ))}
              {!myDrafts.length ? (
                <li className="p-6 text-center text-sm text-muted">Nothing in progress.</li>
              ) : null}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Just published" />
            <ul className="divide-y divide-border">
              {recentPosts.map((post) => (
                <li key={post.id} className="px-4 py-2.5">
                  <Link
                    href={`/${post.category.slug}/${post.slug}`}
                    className="line-clamp-2 text-sm hover:text-accent"
                  >
                    {post.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {post.category.name} ·{' '}
                    {post.publishedAt ? relativeTime(post.publishedAt) : 'unscheduled'} ·{' '}
                    {compactNumber(post.viewCount)} views
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
