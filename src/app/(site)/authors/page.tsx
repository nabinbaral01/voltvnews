import type { Metadata } from 'next';
import Link from 'next/link';

import { bylineTitle, initials, STAFF_GROUPS } from '@/lib/byline';
import { buildSafe } from '@/lib/build-safe';
import { getStaffDirectory } from '@/lib/queries';
import { SITE_URL } from '@/lib/site';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Our writers',
  description: 'The editors and writers behind Volt V — who they are and what they cover.',
  alternates: { canonical: '/authors' },
};

export default async function AuthorsPage() {
  const staff = await buildSafe('masthead', () => getStaffDirectory(), []);

  // Grouped by role so the page reads as a masthead rather than a flat list.
  // The heading is the only place role is exposed, and only as an editorial
  // label — an individual's card never says "ADMIN".
  const groups = STAFF_GROUPS.map((group) => ({
    ...group,
    people: staff.filter((person) => person.role === group.role),
  })).filter((group) => group.people.length > 0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'The Volt V editorial team',
    itemListElement: staff.map((person, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Person',
        name: person.name,
        jobTitle: bylineTitle(person),
        url: `${SITE_URL}/author/${person.slug}`,
      },
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="border-b-2 border-accent pb-6">
        <h1 className="headline text-4xl uppercase sm:text-6xl">Our writers</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every story on Volt V carries a name. These are the people behind them — what they cover,
          where to find them, and everything they have published.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="mt-10 text-sm text-muted">The masthead has not been set up yet.</p>
      ) : null}

      {groups.map((group) => (
        <section key={group.role} className="mt-10">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="headline text-2xl uppercase">{group.heading}</h2>
            <p className="text-xs text-muted">{group.blurb}</p>
          </div>

          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.people.map((person) => (
              <li key={person.slug}>
                <Link
                  href={`/author/${person.slug}`}
                  className="flex h-full gap-4 rounded-card border border-border bg-surface p-4 transition-colors hover:border-accent"
                >
                  <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-elevated text-lg font-bold text-accent">
                    {person.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={person.image}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      initials(person.name)
                    )}
                  </span>

                  <div className="min-w-0">
                    <p className="truncate font-semibold">{person.name}</p>
                    <p className="text-xs uppercase tracking-widest text-accent">
                      {bylineTitle(person)}
                    </p>
                    {person.bio ? (
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted">
                        {person.bio}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">
                      {person.publishedCount}{' '}
                      {person.publishedCount === 1 ? 'story' : 'stories'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
