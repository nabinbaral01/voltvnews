import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArchiveView, Pagination } from '@/components/site/archive-view';
import { buildSafe } from '@/lib/build-safe';
import { prisma } from '@/lib/prisma';
import { getArchive, getNavigation } from '@/lib/queries';

export const revalidate = 300;

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
};

async function loadCategory(slug: string) {
  return prisma.category.findFirst({
    where: { slug, isActive: true },
    select: { name: true, slug: true, colour: true, description: true },
  });
}

export async function generateStaticParams() {
  return buildSafe('category prerender list', async () => {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true },
    });
    return categories.map((c) => ({ category: c.slug }));
  }, []);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) return {};
  return {
    title: category.name,
    description: category.description ?? `${category.name} coverage from Volt V.`,
    alternates: { canonical: `/${category.slug}` },
    openGraph: { title: `${category.name} | The Volt V`, type: 'website' },
  };
}

/**
 * The paginated list is its own component so that `searchParams` — which opts
 * the request out of the full-route cache the moment it is read — is only
 * awaited below the header, letting page one stream from cache.
 */
async function CategoryArchive({
  slug,
  basePath,
  searchParams,
}: {
  slug: string;
  basePath: string;
  searchParams: Props['searchParams'];
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);
  const archive = await getArchive({ categorySlug: slug, page });

  return (
    <>
      <p className="mt-6 text-xs uppercase tracking-widest text-muted">
        {archive.total} {archive.total === 1 ? 'story' : 'stories'}
      </p>

      <div className="mt-4">
        <ArchiveView
          posts={archive.posts}
          emptyTitle="No stories here yet"
          emptyDescription="Published posts in this vertical will appear here."
        />
      </div>

      <Pagination page={archive.page} pages={archive.pages} basePath={basePath} />
    </>
  );
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params;

  const category = await loadCategory(slug);
  if (!category) notFound();

  const nav = await getNavigation();
  const formats = nav.find((c) => c.slug === slug)?.formats ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="border-b-2 pb-4" style={{ borderColor: category.colour }}>
        <h1 className="headline text-4xl uppercase sm:text-6xl">{category.name}</h1>
        {category.description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted">{category.description}</p>
        ) : null}
      </header>

      {formats.length ? (
        <nav
          aria-label={`${category.name} formats`}
          className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1"
        >
          <span className="shrink-0 rounded-full border border-accent bg-accent px-3 py-1 text-xs font-semibold text-accent-fg">
            All
          </span>
          {formats.map((format) => (
            <Link
              key={format.slug}
              href={`/${category.slug}/${format.slug}`}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {format.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <CategoryArchive
        slug={slug}
        basePath={`/${category.slug}`}
        searchParams={searchParams}
      />
    </div>
  );
}
