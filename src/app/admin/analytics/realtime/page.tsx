import type { Metadata } from 'next';

import { RealtimeClient } from './realtime-client';
import { PageHeader } from '@/components/admin/page-header';
import { getRealtime } from '@/lib/analytics-queries';

export const metadata: Metadata = { title: 'Realtime' };
export const dynamic = 'force-dynamic';

export default async function RealtimePage() {
  const initial = await getRealtime();

  return (
    <>
      <PageHeader
        title="Realtime"
        description="The last five minutes, straight off the raw event table. Only readers who accepted analytics cookies appear here."
      />
      <RealtimeClient
        initial={{
          activeVisitors: initial.activeVisitors,
          topPaths: initial.topPaths,
          topCountries: initial.topCountries,
          recent: initial.recent.map((row) => ({ ...row, at: row.at.toISOString() })),
        }}
      />
    </>
  );
}
