'use server';

import { revalidatePath, updateTag } from 'next/cache';

import { assertCapability } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { NAV_TAG, POSTS_TAG } from '@/lib/queries';
import { SETTINGS_TAG } from '@/lib/site';
import { settingsSchema } from '@/lib/validation';

export type SettingsState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  let user;
  try {
    user = await assertCapability('settings.manage');
  } catch {
    return { error: 'Not authorised.' };
  }

  const raw = formData.get('payload');
  if (typeof raw !== 'string') return { error: 'Could not read the settings payload.' };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { error: 'Malformed settings payload.' };
  }

  const parsed = settingsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
    }
    return { fieldErrors, error: 'Some settings need attention.' };
  }

  const data = parsed.data;
  const entries: [string, unknown][] = [
    ['site.name', data.siteName],
    ['site.tagline', data.tagline],
    ['site.description', data.description],
    ['site.logo', data.logo ?? ''],
    ['social.links', data.social],
    ['homepage.modules', data.homepageModules],
    ['footer.columns', data.footerColumns],
  ];

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { key },
        create: { key, value: value as object },
        update: { value: value as object },
      }),
    ),
  );

  await prisma.auditLog.create({
    data: { userId: user.id, action: 'settings.update', entity: 'SiteSetting', entityId: 'bulk' },
  });

  updateTag(SETTINGS_TAG);
  updateTag(POSTS_TAG);
  updateTag(NAV_TAG);
  revalidatePath('/');
  revalidatePath('/admin/settings');

  return { ok: true };
}
