import { z } from 'zod';

/**
 * Shared schemas. Every one of these runs on the client for instant feedback
 * and again on the server, where it is the only version that counts.
 */

export const GENDER_VALUES = ['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'] as const;

const currentYear = new Date().getUTCFullYear();

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Tell us what to call you.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(200, 'That is longer than we can store.'),
  // Optional demographics. The dashboards are built to report the coverage gap
  // rather than pretend it does not exist, so these stay genuinely optional.
  birthYear: z
    .union([z.literal(''), z.coerce.number().int().min(currentYear - 110).max(currentYear - 13)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  gender: z
    .union([z.literal(''), z.enum(GENDER_VALUES)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  country: z
    .union([z.literal(''), z.string().trim().length(2)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v!.toUpperCase())),
});

export type RegisterInput = z.input<typeof registerSchema>;

export const accountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  bio: z.union([z.literal(''), z.string().max(400)]).optional(),
  birthYear: z
    .union([z.literal(''), z.coerce.number().int().min(currentYear - 110).max(currentYear - 13)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  gender: z
    .union([z.literal(''), z.enum(GENDER_VALUES)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  country: z
    .union([z.literal(''), z.string().trim().length(2)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v!.toUpperCase())),
  city: z
    .union([z.literal(''), z.string().trim().max(80)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});

/**
 * The staff-facing half of a profile: everything that appears on a byline.
 *
 * Separate from `accountSchema` on purpose. That one is a reader's private
 * record — birth year, city, the demographics the dashboards sample from — and
 * none of it belongs on a public author page. This one is the opposite: every
 * field here is published, so it is edited from the admin panel and validated
 * on its own terms.
 */
export const SOCIAL_PLATFORMS = [
  { key: 'x', label: 'X / Twitter', placeholder: 'https://x.com/yourhandle' },
  { key: 'bluesky', label: 'Bluesky', placeholder: 'https://bsky.app/profile/you' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/you' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/you' },
  { key: 'website', label: 'Website', placeholder: 'https://yoursite.com' },
] as const;

const SOCIAL_KEYS = SOCIAL_PLATFORMS.map((p) => p.key) as unknown as [string, ...string[]];

/** A profile link is rendered as an anchor, so `javascript:` must never pass. */
const publicUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => /^https?:\/\/.+/i.test(value), 'Links must start with http:// or https://');

export const staffProfileSchema = z.object({
  name: z.string().trim().min(2, 'A byline needs a name.').max(80),
  title: z
    .union([z.literal(''), z.string().trim().max(60)])
    .optional()
    .transform((v) => (v ? v : null)),
  bio: z
    .union([z.literal(''), z.string().trim().max(600)])
    .optional()
    .transform((v) => (v ? v : null)),
  // Three separate blocks, because the author page runs them as three columns
  // and each renders only when it has something in it.
  focus: z
    .union([z.literal(''), z.string().trim().max(600)])
    .optional()
    .transform((v) => (v ? v : null)),
  favourites: z
    .union([z.literal(''), z.string().trim().max(600)])
    .optional()
    .transform((v) => (v ? v : null)),
  image: z
    .union([z.literal(''), z.string().trim().max(500)])
    .optional()
    .transform((v) => (v ? v : null)),
  // Empty values are dropped rather than stored as "", so the author page can
  // simply iterate the object without filtering blanks back out.
  socialLinks: z
    .record(z.enum(SOCIAL_KEYS), z.union([z.literal(''), publicUrl]))
    .default({})
    .transform((links) =>
      Object.fromEntries(Object.entries(links).filter(([, href]) => Boolean(href))),
    ),
});

export type StaffProfileInput = z.input<typeof staffProfileSchema>;

/** Fields only an admin may set on someone else — including themselves. */
export const staffAdminFieldsSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only.')
    .min(2)
    .max(60),
  staffOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const postSchema = z.object({
  title: z.string().trim().min(3, 'A headline is required.').max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only.')
    .max(90)
    .optional()
    .or(z.literal('')),
  excerpt: z.string().max(400).optional().or(z.literal('')),
  body: z.any(),
  coverImage: z.string().max(500).optional().or(z.literal('')),
  coverAlt: z.string().max(300).optional().or(z.literal('')),
  categoryId: z.string().min(1, 'Choose a category.'),
  contentTypeId: z.string().min(1, 'Choose a content type.'),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']),
  publishedAt: z.string().optional().nullable(),
  scheduledFor: z.string().optional().nullable(),
  isFeatured: z.boolean().default(false),
  isTrending: z.boolean().default(false),
  isEditorPick: z.boolean().default(false),
  rating: z.union([z.literal(''), z.coerce.number().min(0).max(10)]).optional().nullable(),
  metaTitle: z.string().max(120).optional().or(z.literal('')),
  metaDescription: z.string().max(320).optional().or(z.literal('')),
  ogImage: z.string().max(500).optional().or(z.literal('')),
  tagIds: z.array(z.string()).default([]),
  newTags: z.array(z.string().trim().min(1).max(60)).default([]),
});

export type PostInput = z.infer<typeof postSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(60).optional().or(z.literal('')),
  description: z.string().max(300).optional().or(z.literal('')),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #00E88F.'),
  parentId: z.string().optional().nullable(),
  order: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const settingsSchema = z.object({
  siteName: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(320),
  logo: z.string().max(500).optional().or(z.literal('')),
  social: z.record(z.string(), z.string().max(300)),
  homepageModules: z.array(z.string().max(60)),
  footerColumns: z.array(
    z.object({
      heading: z.string().max(60),
      links: z.array(z.object({ label: z.string().max(60), href: z.string().max(300) })),
    }),
  ),
});
