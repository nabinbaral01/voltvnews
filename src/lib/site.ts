import { unstable_cache } from 'next/cache';

import { prisma } from './prisma';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

export type FooterColumn = {
  heading: string;
  links: { label: string; href: string }[];
};

export type SiteSettings = {
  'site.name': string;
  'site.tagline': string;
  'site.logo': string;
  'site.description': string;
  'social.links': Record<string, string>;
  'homepage.modules': string[];
  'footer.columns': FooterColumn[];
};

export const DEFAULT_SETTINGS: SiteSettings = {
  'site.name': 'The Volt V',
  'site.tagline': 'Screens, panels and controllers — covered properly.',
  'site.logo': '',
  'site.description':
    'The Volt V is an entertainment publication covering film, television, comics, gaming and anime.',
  'social.links': {},
  'homepage.modules': [
    'trending',
    'hero',
    'secondary',
    'category:movies',
    'category:tv',
    'category:gaming',
    'editors-picks',
    'mixed-feed',
    'newsletter',
  ],
  'footer.columns': [],
};

export const SETTINGS_TAG = 'site-settings';

/**
 * Settings are read on every public request, so they are cached until an admin
 * save revalidates the tag rather than re-queried per render.
 */
export const getSettings = unstable_cache(
  async (): Promise<SiteSettings> => {
    const rows = await prisma.siteSetting.findMany();
    const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    for (const row of rows) merged[row.key] = row.value;
    return merged as SiteSettings;
  },
  ['site-settings'],
  { tags: [SETTINGS_TAG], revalidate: 3600 },
);

export async function getSetting<K extends keyof SiteSettings>(
  key: K,
): Promise<SiteSettings[K]> {
  const settings = await getSettings();
  return settings[key];
}
