import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminMobileNav, AdminSidebar } from '@/components/admin/sidebar';
import { AdminUserMenu } from '@/components/admin/user-menu';
import { CAPABILITIES, can, requireCapability, type Capability } from '@/lib/permissions';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · The Volt V Admin' },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // One gate for the whole panel; individual screens re-check their own
  // capability so an AUTHOR cannot deep-link into settings.
  const user = await requireCapability('admin.access');

  const allowed = (Object.keys(CAPABILITIES) as Capability[]).filter((capability) =>
    can(user.role, capability),
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <AdminSidebar allowed={allowed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur">
          <Link href="/admin" className="headline text-lg uppercase tracking-tight lg:hidden">
            Volt<span className="text-accent">V</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <AdminUserMenu
              user={{ name: user.name ?? 'You', role: user.role, image: user.image ?? null }}
            />
          </div>
        </header>

        <AdminMobileNav allowed={allowed} />

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
