import { ArrowDown } from 'lucide-react';
import Link from 'next/link';

import { NewsletterForm } from '@/components/site/newsletter-form';
import { GridCard, ListRow, OverlayCard, RailRow, TextRow } from '@/components/site/post-card';
import { TrendingStrip } from '@/components/site/trending-strip';
import { SectionHeading } from '@/components/ui/surface';
import {
  getCategoryBlock,
  getEditorPicks,
  getHomepageTop,
  getMixedFeed,
  getMostRead,
  getNavigation,
} from '@/lib/queries';
import { getSettings } from '@/lib/site';

// The shop window is rebuilt on publish (tag revalidation) and at worst every
// two minutes — never per request.
export const revalidate = 120;

async function CategoryBlock({ slug }: { slug: string }) {
  const block = await getCategoryBlock(slug, 4);
  if (!block) return null;

  return (
    <section className="mt-10">
      <SectionHeading
        title={block.category.name}
        href={`/${block.category.slug}`}
        colour={block.category.colour}
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {block.posts.map((post) => (
          <GridCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

async function EditorPicks() {
  const picks = await getEditorPicks();
  if (!picks.length) return null;

  return (
    <section className="mt-10">
      <SectionHeading title="Editor's Picks" href="/search?q=" moreLabel="Browse all" />
      {/* Carousel on small screens, grid once there is room for four across. */}
      <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0">
        {picks.slice(0, 8).map((post) => (
          <li key={post.id} className="w-[78vw] shrink-0 snap-start sm:w-[44vw] lg:w-auto">
            <GridCard post={post} sizes="(max-width: 1024px) 78vw, 25vw" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function HomePage() {
  const [settings, top, nav] = await Promise.all([
    getSettings(),
    getHomepageTop(),
    getNavigation(),
  ]);

  const modules = settings['homepage.modules'] ?? [];
  const [feed, mostRead] = await Promise.all([getMixedFeed(0, 16), getMostRead(6)]);

  const categoryModules = modules.filter((m) => m.startsWith('category:'));
  const orderedCategories = categoryModules.length
    ? categoryModules.map((m) => m.split(':')[1])
    : nav.map((c) => c.slug);

  return (
    <>
      {modules.includes('trending') ? <TrendingStrip /> : null}

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Hero split: one big story, the LATEST rail alongside it. */}
        {top.hero ? (
          <section className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <OverlayCard post={top.hero} size="hero" priority />
            </div>
            <aside aria-labelledby="latest-heading" className="lg:col-span-1">
              <h2
                id="latest-heading"
                className="headline border-b-2 border-accent pb-2 text-2xl uppercase"
              >
                Latest
              </h2>
              <div className="mt-1">
                {top.latest.map((post) => (
                  <RailRow key={post.id} post={post} />
                ))}
              </div>
              <Link
                href="/search?q="
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-accent hover:underline"
              >
                More <ArrowDown className="size-3" aria-hidden />
              </Link>
            </aside>
          </section>
        ) : null}

        {/* Two medium heroes, same image-with-headline treatment. */}
        {top.secondary.length ? (
          <section className="mt-6 grid gap-6 sm:grid-cols-2">
            {top.secondary.map((post) => (
              <OverlayCard key={post.id} post={post} size="medium" />
            ))}
          </section>
        ) : null}

        {orderedCategories.slice(0, 3).map((slug) => (
          <CategoryBlock key={slug} slug={slug} />
        ))}

        {modules.includes('editors-picks') ? <EditorPicks /> : null}

        {orderedCategories.slice(3).map((slug) => (
          <CategoryBlock key={slug} slug={slug} />
        ))}

        {/* Dense two-column feed: list rows on the left, headlines on the right. */}
        <section className="mt-12 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SectionHeading title="More Stories" href="/search?q=" moreLabel="See all" />
            {feed.slice(0, 10).map((post) => (
              <ListRow key={post.id} post={post} />
            ))}
          </div>
          <aside className="lg:col-span-1">
            <SectionHeading title="Most Read" />
            {mostRead.map((post) => (
              <TextRow key={post.id} post={post} />
            ))}
            <SectionHeading title="Just In" />
            {feed.slice(10, 16).map((post) => (
              <TextRow key={post.id} post={post} />
            ))}
          </aside>
        </section>

        {modules.includes('newsletter') ? (
          <section className="mt-14 rounded-card border border-border bg-surface p-6 sm:p-10">
            <div className="grid items-center gap-6 lg:grid-cols-2">
              <div>
                <h2 className="headline text-3xl uppercase sm:text-4xl">
                  The week, in one email
                </h2>
                <p className="mt-2 max-w-md text-sm text-muted">
                  Every Friday: the stories that mattered, the reviews worth your time and what
                  is landing next week. No filler.
                </p>
              </div>
              <NewsletterForm source="homepage-band" />
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
