import { Clock, Eye, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArchiveView, Pagination } from '@/components/site/archive-view';
import { ArticleBody } from '@/components/site/article-body';
import { ArticleRail } from '@/components/site/article-rail';
import { AuthorCard } from '@/components/site/author-card';
import { Comments } from '@/components/site/comments';
import { GridCard } from '@/components/site/post-card';
import { ShareButtons } from '@/components/site/share-buttons';
import { SectionHeading } from '@/components/ui/surface';
import { buildSafe } from '@/lib/build-safe';
import { prisma } from '@/lib/prisma';
import {
  getArchive,
  getArticle,
  getMoreFromSection,
  getLikeCount,
  getRelatedPosts,
} from '@/lib/queries';
import { SITE_URL } from '@/lib/site';
import { bylineTitle, initials } from '@/lib/byline';
import { compactNumber, formatDateTime, relativeTime } from '@/lib/utils';

export const revalidate = 300;

/**
 * One route serves two shapes: /movies/reviews (a format archive) and
 * /movies/some-headline (an article). Content-type slugs are checked first,
 * which is why post slugs are never allowed to collide with them.
 */
type Props = {
  params: Promise<{ category: string; segment: string }>;
  searchParams: Promise<{ page?: string }>;
};

async function resolveContentType(categorySlug: string, segment: string) {
  const [category, contentType] = await Promise.all([
    prisma.category.findFirst({
      where: { slug: categorySlug, isActive: true },
      select: { name: true, slug: true, colour: true },
    }),
    prisma.contentType.findUnique({
      where: { slug: segment },
      select: { name: true, slug: true },
    }),
  ]);
  return category && contentType ? { category, contentType } : null;
}

/**
 * Prerender the recent archive plus every category × content-type pair. Older
 * articles are rendered on first request and then cached the same way — the
 * long tail of a news archive is not worth a build-time round trip each deploy.
 */
export async function generateStaticParams() {
  return buildSafe('article prerender list', async () => {
  const [posts, categories, contentTypes] = await Promise.all([
    prisma.post.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lte: new Date() }, deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      take: 200,
      select: { slug: true, category: { select: { slug: true } } },
    }),
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true } }),
    prisma.contentType.findMany({ select: { slug: true } }),
  ]);

  return [
    ...posts.map((post) => ({ category: post.category.slug, segment: post.slug })),
    ...categories.flatMap((category) =>
      contentTypes.map((type) => ({ category: category.slug, segment: type.slug })),
    ),
  ];
  }, []);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: categorySlug, segment } = await params;

  const archive = await resolveContentType(categorySlug, segment);
  if (archive) {
    const title = `${archive.category.name} ${archive.contentType.name}s`;
    return {
      title,
      description: `Every ${archive.contentType.name.toLowerCase()} we have published in ${archive.category.name}.`,
      alternates: { canonical: `/${categorySlug}/${segment}` },
    };
  }

  const post = await getArticle(segment, categorySlug);
  if (!post) return {};

  const url = `${SITE_URL}/${categorySlug}/${post.slug}`;
  const image = post.ogImage ?? post.coverImage ?? undefined;

  return {
    title: post.metaTitle ?? post.title,
    description: post.metaDescription ?? post.excerpt ?? undefined,
    alternates: { canonical: `/${categorySlug}/${post.slug}` },
    authors: [{ name: post.author.name, url: `${SITE_URL}/author/${post.author.slug}` }],
    openGraph: {
      type: 'article',
      url,
      title: post.metaTitle ?? post.title,
      description: post.metaDescription ?? post.excerpt ?? undefined,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.author.name],
      section: post.category.name,
      tags: post.tags.map((t) => t.name),
      images: image ? [{ url: image, width: 1600, height: 900, alt: post.coverAlt ?? post.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.metaTitle ?? post.title,
      description: post.metaDescription ?? post.excerpt ?? undefined,
      images: image ? [image] : undefined,
    },
  };
}

function Rating({ value }: { value: number }) {
  const stars = Math.round(value / 2);
  return (
    <div className="flex items-center gap-2 rounded-card border border-accent/40 bg-accent/10 px-3 py-2">
      <span className="flex" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={i < stars ? 'size-4 fill-accent text-accent' : 'size-4 text-muted'}
          />
        ))}
      </span>
      <span className="text-sm font-semibold text-accent">
        {value.toFixed(1)}
        <span className="text-muted">/10</span>
      </span>
      <span className="sr-only">Rated {value.toFixed(1)} out of 10</span>
    </div>
  );
}

async function FormatArchive({
  categorySlug,
  segment,
  searchParams,
}: {
  categorySlug: string;
  segment: string;
  searchParams: Props['searchParams'];
}) {
  // searchParams is awaited *here*, not in the shared page component: reading it
  // opts the request out of the full-route cache, and the article branch has no
  // business paying for the archive's pagination.
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  const resolved = (await resolveContentType(categorySlug, segment))!;
  const archive = await getArchive({
    categorySlug,
    contentTypeSlug: segment,
    page,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-widest text-muted">
        <Link href={`/${categorySlug}`} className="hover:text-accent">
          {resolved.category.name}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-fg">{resolved.contentType.name}</span>
      </nav>

      <header className="mt-2 border-b-2 pb-4" style={{ borderColor: resolved.category.colour }}>
        <h1 className="headline text-4xl uppercase sm:text-6xl">
          {resolved.category.name} {resolved.contentType.name}s
        </h1>
        <p className="mt-2 text-sm text-muted">
          {archive.total} {archive.total === 1 ? 'story' : 'stories'}
        </p>
      </header>

      <div className="mt-6">
        <ArchiveView
          posts={archive.posts}
          emptyTitle="Nothing published in this format yet"
        />
      </div>

      <Pagination
        page={archive.page}
        pages={archive.pages}
        basePath={`/${categorySlug}/${segment}`}
      />
    </div>
  );
}

export default async function CategorySegmentPage({ params, searchParams }: Props) {
  const { category: categorySlug, segment } = await params;

  const asArchive = await resolveContentType(categorySlug, segment);
  if (asArchive) {
    return (
      <FormatArchive
        categorySlug={categorySlug}
        segment={segment}
        searchParams={searchParams}
      />
    );
  }

  const post = await getArticle(segment, categorySlug);
  if (!post) notFound();

  const [related, sectionPosts, likeCount] = await Promise.all([
    getRelatedPosts(post.id, post.categoryId, post.tags.map((t) => t.slug)),
    getMoreFromSection(post.categoryId, post.id, 8),
    // Cached and tagged like the article. Only the count is shared; whether
    // this particular reader liked it is resolved inside the rail.
    getLikeCount(post.id),
  ]);

  const url = `${SITE_URL}/${categorySlug}/${post.slug}`;

  // NewsArticle schema. Google reads this; so does every social preview crawler.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: post.metaDescription ?? post.excerpt ?? undefined,
    image: post.ogImage ?? post.coverImage ? [`${SITE_URL}${post.ogImage ?? post.coverImage}`] : undefined,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    articleSection: post.category.name,
    keywords: post.tags.map((t) => t.name).join(', '),
    wordCount: post.bodyText.split(/\s+/).filter(Boolean).length,
    author: {
      '@type': 'Person',
      name: post.author.name,
      url: `${SITE_URL}/author/${post.author.slug}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'The Volt V',
      url: SITE_URL,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(post.rating != null
      ? {
          review: {
            '@type': 'Review',
            reviewRating: { '@type': 'Rating', ratingValue: post.rating, bestRating: 10, worstRating: 0 },
            author: { '@type': 'Person', name: post.author.name },
          },
        }
      : {}),
  };

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Full-bleed hero with the headline sitting on the scrim. */}
      <header className="relative">
        <div className="relative aspect-[4/3] w-full sm:aspect-[21/9]">
          {post.coverImage ? (
            <Image
              src={post.coverImage}
              alt={post.coverAlt ?? ''}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="size-full bg-elevated" />
          )}
          <div className="img-scrim absolute inset-0" aria-hidden />
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-4xl px-4 pb-6">
            <nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-widest">
              <Link href={`/${post.category.slug}`} style={{ color: post.category.colour }}>
                {post.category.name}
              </Link>
              <span className="text-white/50" aria-hidden> / </span>
              <Link href={`/${post.category.slug}/${post.contentType.slug}`} className="text-white/80">
                {post.contentType.name}
              </Link>
            </nav>
            <h1 className="headline mt-2 text-[clamp(2rem,5.5vw,4rem)] text-white drop-shadow-lg">
              {post.title}
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/*
          The prose is capped at max-w-3xl but its grid track is wider, so the
          slack to its right is where the rail lives — no overlap with the
          sidebar and no fixed positioning to fight the layout. Below xl there
          is no slack, so the same control renders as a horizontal row under
          the byline instead of being hidden.
        */}
        <div className="flex min-w-0 gap-6">
        <div className="min-w-0 max-w-3xl flex-1">
          {post.excerpt ? (
            <p className="text-lg leading-relaxed text-muted">{post.excerpt}</p>
          ) : null}

          {/* Byline block */}
          <div className="mt-6 flex flex-wrap items-start gap-3 border-y border-border py-4">
            <Link href={`/author/${post.author.slug}`} className="shrink-0">
              <span className="grid size-11 place-items-center overflow-hidden rounded-full bg-elevated text-sm font-bold text-accent">
                {post.author.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.author.image} alt="" className="size-full object-cover" />
                ) : (
                  initials(post.author.name)
                )}
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                By{' '}
                <Link href={`/author/${post.author.slug}`} className="font-semibold hover:text-accent">
                  {post.author.name}
                </Link>
              </p>
              {/* The position, not the role. A reader deciding whether to
                  trust a review wants to know the writer covers this beat —
                  "Senior Film Critic" answers that and "ADMIN" does not. */}
              <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
                {bylineTitle(post.author)}
              </p>
              {post.publishedAt ? (
                <p className="mt-0.5 text-xs text-muted">
                  Published <time dateTime={post.publishedAt.toISOString()}>{formatDateTime(post.publishedAt)}</time>
                  <span aria-hidden> · </span>
                  {relativeTime(post.publishedAt)}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> {post.readingTimeMinutes} min read
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3.5" aria-hidden /> {compactNumber(post.viewCount)}
              </span>
            </div>
          </div>

          <div className="mt-4 xl:hidden">
            <ArticleRail
              postId={post.id}
              authorId={post.author.id}
              authorName={post.author.name}
              initialLikes={likeCount}
              commentCount={post._count.comments}
              orientation="horizontal"
            />
          </div>

          {post.rating != null ? (
            <div className="mt-6">
              <Rating value={post.rating} />
            </div>
          ) : null}

          <div className="mt-6">
            <ArticleBody body={post.body} />
          </div>

          <div className="mt-8 border-t border-border pt-4">
            <ShareButtons url={url} title={post.title} />
          </div>

          <AuthorCard author={post.author} />

          {post.tags.length ? (
            <div className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Topics</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <li key={tag.slug}>
                    <Link
                      href={`/tag/${tag.slug}`}
                      className="inline-block rounded-full border border-border bg-surface px-3 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
                    >
                      {tag.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {related.length ? (
            <section className="mt-12">
              <SectionHeading title="Related Reading" colour={post.category.colour} />
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((item) => (
                  <GridCard key={item.id} post={item} sizes="(max-width: 640px) 100vw, 25vw" />
                ))}
              </div>
            </section>
          ) : null}

          <Comments postId={post.id} />
        </div>

          {/* Sticky beside the prose from xl up, where the grid track is wide
              enough to hold it without narrowing the text. */}
          <div className="hidden xl:block">
            <div className="sticky top-24">
              <ArticleRail
                postId={post.id}
                authorId={post.author.id}
                authorName={post.author.name}
                initialLikes={likeCount}
                commentCount={post._count.comments}
              />
            </div>
          </div>
        </div>

        {/* Sticky "more from this section" rail. */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <h2
            className="headline border-b-2 pb-2 text-xl uppercase"
            style={{ borderColor: post.category.colour }}
          >
            More {post.category.name}
          </h2>
          <ul className="mt-2">
            {sectionPosts.map((item) => (
              <li key={item.slug} className="border-b border-border py-3 last:border-b-0">
                <Link
                  href={`/${item.category.slug}/${item.slug}`}
                  className="headline text-base leading-tight transition-colors hover:text-accent"
                >
                  {item.title}
                </Link>
                {item.publishedAt ? (
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                    {relativeTime(item.publishedAt)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </article>
  );
}
