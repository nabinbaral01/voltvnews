import type { Metadata } from 'next';

import { SettingsClient } from './settings-client';
import { PageHeader } from '@/components/admin/page-header';
import { requireCapability } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/site';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireCapability('settings.manage');

  const [settings, categories] = await Promise.all([
    getSettings(),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      select: { slug: true, name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Site identity, homepage assembly and footer navigation. Saving here revalidates the public cache immediately."
      />

      <SettingsClient
        settings={{
          siteName: settings['site.name'],
          tagline: settings['site.tagline'],
          description: settings['site.description'],
          logo: settings['site.logo'],
          social: settings['social.links'],
          homepageModules: settings['homepage.modules'],
          footerColumns: settings['footer.columns'],
        }}
        categories={categories}
      />
    </>
  );
}
