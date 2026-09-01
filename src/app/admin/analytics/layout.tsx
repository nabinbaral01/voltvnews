import type { Metadata } from 'next';

import { AnalyticsNav } from './analytics-nav';
import { requireCapability } from '@/lib/permissions';

export const metadata: Metadata = {
  title: { default: 'Analytics', template: '%s · Analytics · The Volt V' },
};

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  await requireCapability('analytics.view');

  return (
    <div>
      <AnalyticsNav />
      {children}
    </div>
  );
}
