'use client';

import { ChevronDown, ChevronUp, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { saveSettingsAction, type SettingsState } from './actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Card, CardHeader } from '@/components/ui/surface';

export type SettingsPayload = {
  siteName: string;
  tagline: string;
  description: string;
  logo: string;
  social: Record<string, string>;
  homepageModules: string[];
  footerColumns: { heading: string; links: { label: string; href: string }[] }[];
};

// Keep in step with SOCIAL_LABELS in the footer — a key offered here but not
// labelled there renders as a raw lower-case slug.
const SOCIAL_KEYS = ['x', 'youtube', 'instagram', 'tiktok', 'facebook'] as const;

const MODULE_LABELS: Record<string, string> = {
  trending: 'Trending strip',
  hero: 'Hero + Latest split',
  secondary: 'Two secondary heroes',
  'editors-picks': "Editor's picks carousel",
  'mixed-feed': 'Mixed feed',
  newsletter: 'Newsletter band',
};

function moduleLabel(key: string, categories: { slug: string; name: string }[]) {
  if (key.startsWith('category:')) {
    const slug = key.split(':')[1];
    return `${categories.find((c) => c.slug === slug)?.name ?? slug} block`;
  }
  return MODULE_LABELS[key] ?? key;
}

export function SettingsClient({
  settings,
  categories,
}: {
  settings: SettingsPayload;
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<SettingsState, FormData>(
    saveSettingsAction,
    {},
  );
  const [draft, setDraft] = React.useState<SettingsPayload>(settings);

  React.useEffect(() => {
    if (state.ok) {
      toast.success('Settings saved.');
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const set = <K extends keyof SettingsPayload>(key: K, value: SettingsPayload[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const moveModule = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.homepageModules.length) return;
    const next = [...draft.homepageModules];
    [next[index], next[target]] = [next[target], next[index]];
    set('homepageModules', next);
  };

  const availableModules = [
    ...Object.keys(MODULE_LABELS),
    ...categories.map((category) => `category:${category.slug}`),
  ].filter((key) => !draft.homepageModules.includes(key));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={JSON.stringify(draft)} />

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          Save settings
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Identity" description="Shown in the header, footer and every share card." />
          <div className="space-y-3 p-4">
            <Field label="Site name" htmlFor="site-name" error={state.fieldErrors?.siteName}>
              <Input id="site-name" value={draft.siteName} onChange={(e) => set('siteName', e.target.value)} />
            </Field>
            <Field label="Tagline" htmlFor="site-tagline">
              <Input id="site-tagline" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />
            </Field>
            <Field
              label="Description"
              htmlFor="site-description"
              hint="The default meta description and the RSS channel description."
            >
              <Textarea
                id="site-description"
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                rows={3}
              />
            </Field>
            <Field
              label="Logo URL"
              htmlFor="site-logo"
              hint="Optional. Leave blank to use the two-tone VOLT V wordmark."
            >
              <Input id="site-logo" value={draft.logo} onChange={(e) => set('logo', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Social links" description="Rendered in the footer's FOLLOW US column." />
          <div className="space-y-3 p-4">
            {SOCIAL_KEYS.map((key) => (
              <Field key={key} label={key} htmlFor={`social-${key}`}>
                <Input
                  id={`social-${key}`}
                  value={draft.social[key] ?? ''}
                  placeholder="https://…"
                  onChange={(e) => set('social', { ...draft.social, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Homepage modules"
            description="The order here is the order the front page is assembled in."
          />
          <div className="p-4">
            <ul className="space-y-1.5">
              {draft.homepageModules.map((module, index) => (
                <li
                  key={module}
                  className="flex items-center gap-2 rounded border border-border bg-elevated px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {moduleLabel(module, categories)}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveModule(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${moduleLabel(module, categories)} up`}
                    className="rounded p-1 text-muted hover:text-fg disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveModule(index, 1)}
                    disabled={index === draft.homepageModules.length - 1}
                    aria-label={`Move ${moduleLabel(module, categories)} down`}
                    className="rounded p-1 text-muted hover:text-fg disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      set('homepageModules', draft.homepageModules.filter((m) => m !== module))
                    }
                    aria-label={`Remove ${moduleLabel(module, categories)}`}
                    className="rounded p-1 text-muted hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>

            {availableModules.length ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Add a module</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableModules.map((module) => (
                    <button
                      key={module}
                      type="button"
                      onClick={() => set('homepageModules', [...draft.homepageModules, module])}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                    >
                      <Plus className="size-3" aria-hidden />
                      {moduleLabel(module, categories)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Card>

      </div>

      <Card>
        <CardHeader
          title="Footer columns"
          description="Grouped link columns under the newsletter band."
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                set('footerColumns', [...draft.footerColumns, { heading: 'New column', links: [] }])
              }
            >
              <Plus className="size-4" /> Column
            </Button>
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {draft.footerColumns.map((column, columnIndex) => (
            <div key={columnIndex} className="space-y-2 rounded border border-border p-3">
              <div className="flex items-center gap-1">
                <label className="sr-only" htmlFor={`column-${columnIndex}`}>Column heading</label>
                <Input
                  id={`column-${columnIndex}`}
                  value={column.heading}
                  onChange={(e) => {
                    const next = [...draft.footerColumns];
                    next[columnIndex] = { ...column, heading: e.target.value };
                    set('footerColumns', next);
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    set('footerColumns', draft.footerColumns.filter((_, i) => i !== columnIndex))
                  }
                  aria-label={`Remove ${column.heading} column`}
                  className="rounded border border-border p-1.5 text-muted hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {column.links.map((link, linkIndex) => (
                <div key={linkIndex} className="space-y-1 rounded bg-elevated p-2">
                  <label className="sr-only" htmlFor={`link-label-${columnIndex}-${linkIndex}`}>Link label</label>
                  <Input
                    id={`link-label-${columnIndex}-${linkIndex}`}
                    value={link.label}
                    placeholder="Label"
                    onChange={(e) => {
                      const next = [...draft.footerColumns];
                      const links = [...column.links];
                      links[linkIndex] = { ...link, label: e.target.value };
                      next[columnIndex] = { ...column, links };
                      set('footerColumns', next);
                    }}
                  />
                  <label className="sr-only" htmlFor={`link-href-${columnIndex}-${linkIndex}`}>Link URL</label>
                  <div className="flex gap-1">
                    <Input
                      id={`link-href-${columnIndex}-${linkIndex}`}
                      value={link.href}
                      placeholder="/path"
                      onChange={(e) => {
                        const next = [...draft.footerColumns];
                        const links = [...column.links];
                        links[linkIndex] = { ...link, href: e.target.value };
                        next[columnIndex] = { ...column, links };
                        set('footerColumns', next);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...draft.footerColumns];
                        next[columnIndex] = {
                          ...column,
                          links: column.links.filter((_, i) => i !== linkIndex),
                        };
                        set('footerColumns', next);
                      }}
                      aria-label={`Remove ${link.label}`}
                      className="rounded border border-border px-2 text-muted hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const next = [...draft.footerColumns];
                  next[columnIndex] = { ...column, links: [...column.links, { label: '', href: '' }] };
                  set('footerColumns', next);
                }}
                className="w-full rounded border border-dashed border-border py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
              >
                + Add link
              </button>
            </div>
          ))}
        </div>
      </Card>
    </form>
  );
}
