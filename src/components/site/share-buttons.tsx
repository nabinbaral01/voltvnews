'use client';

import { Check, Link2, Share2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { SocialIcon } from '@/components/site/social-icon';

const TARGETS = [
  { key: 'x', label: 'X', href: (u: string, t: string) => `https://x.com/intent/post?url=${u}&text=${t}` },
  { key: 'facebook', label: 'Facebook', href: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  { key: 'reddit', label: 'Reddit', href: (u: string, t: string) => `https://www.reddit.com/submit?url=${u}&title=${t}` },
];

/**
 * `url` is the canonical address the server knows. Once mounted, the share
 * targets switch to the origin the reader is actually on: it is the address
 * they see in their bar, and it cannot disagree with it — a misconfigured
 * site URL once had "Copy link" handing out a vercel.app domain from a page
 * served on thevoltv.com.
 */
function useReaderUrl(canonical: string): string {
  return React.useSyncExternalStore(
    () => () => {},
    () => {
      try {
        const { pathname, search } = new URL(canonical, window.location.origin);
        return new URL(pathname + search, window.location.origin).href;
      } catch {
        return canonical;
      }
    },
    () => canonical,
  );
}

export function ShareButtons({ url: canonical, title }: { url: string; title: string }) {
  const [copied, setCopied] = React.useState(false);
  const url = useReaderUrl(canonical);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link');
    }
  }

  async function nativeShare() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ url, title });
    } catch {
      /* the reader cancelled */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-widest text-muted">Share</span>
      {TARGETS.map((target) => (
        <a
          key={target.key}
          href={target.href(encodedUrl, encodedTitle)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
        >
          {/* The mark carries the recognition, the word carries the meaning —
              a share bar is a row of choices, so dropping the labels here
              would make the reader decode five glyphs to pick one. */}
          <SocialIcon name={target.key} className="size-3.5" />
          {target.label}
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
      >
        {copied ? <Check className="size-3" aria-hidden /> : <Link2 className="size-3" aria-hidden />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <button
        type="button"
        onClick={nativeShare}
        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent sm:hidden"
      >
        <Share2 className="size-3" aria-hidden />
        More
      </button>
    </div>
  );
}
