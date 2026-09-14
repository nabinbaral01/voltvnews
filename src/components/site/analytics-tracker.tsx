'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { CONSENT_EVENT, analyticsAllowed, type ConsentState } from '@/lib/consent';

/**
 * First-party page-view beacon.
 *
 * Two things leave the browser per route change. A "hit" is a bare tally for
 * the article's view counter and carries only the path, so it is sent for
 * everyone. The "pageview" is the analytics row proper (referrer, device,
 * session) and goes only with consent, followed by a single engagement update
 * (time on page + max scroll depth) when the page is hidden. No third-party
 * script, no cross-site identifier: the server sets a first-party visitor
 * cookie and only ever stores a salted hash of it.
 *
 * Without consent the pageview waits rather than giving up: the first page a
 * visitor lands on is exactly where they answer the banner, and it would
 * otherwise never be recorded even after they accept.
 */
function Beacon({ postId }: { postId?: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewIdRef = React.useRef<string | null>(null);
  // Stamped in the effect, not at render: the clock is not a pure read, and the
  // number we want is "when this route became visible" anyway.
  const startedRef = React.useRef(0);
  const scrollRef = React.useRef(0);
  const sentRef = React.useRef(false);
  // Last path the tally was sent for. The effect can re-run without a real
  // navigation (a search-param change, StrictMode's dev double-invoke) and
  // that is not a second view.
  const hitRef = React.useRef<string | null>(null);

  const search = searchParams.toString();

  React.useEffect(() => {
    viewIdRef.current = null;
    startedRef.current = Date.now();
    scrollRef.current = 0;
    sentRef.current = false;

    const params = new URLSearchParams(search);
    const controller = new AbortController();

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const depth = scrollable > 0 ? Math.round(((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100) : 100;
      scrollRef.current = Math.min(100, Math.max(scrollRef.current, depth));
    };

    const flush = () => {
      if (sentRef.current || !viewIdRef.current) return;
      sentRef.current = true;
      const payload = JSON.stringify({
        type: 'engagement',
        id: viewIdRef.current,
        seconds: Math.round((Date.now() - startedRef.current) / 1000),
        scroll: scrollRef.current,
      });
      // sendBeacon survives the unload that a fetch would not.
      navigator.sendBeacon?.('/api/track', new Blob([payload], { type: 'application/json' }));
    };

    const onVisibility = () => document.visibilityState === 'hidden' && flush();

    const send = () => {
      void fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          type: 'pageview',
          path: pathname,
          postId: postId ?? null,
          referrer: document.referrer || null,
          utmSource: params.get('utm_source'),
          utmMedium: params.get('utm_medium'),
          utmCampaign: params.get('utm_campaign'),
          screenWidth: window.innerWidth,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.id) viewIdRef.current = data.id;
        })
        .catch(() => {
          /* tracking must never break the page */
        });
    };

    // The view counter is a bare tally — no row, no cookie — so it goes up for
    // everyone, consent or not. sendBeacon so a bounce inside the first second
    // still counts; fetch keepalive is the fallback where beacons are absent.
    if (hitRef.current !== pathname) {
      hitRef.current = pathname;
      const hit = JSON.stringify({ type: 'hit', path: pathname });
      if (!navigator.sendBeacon?.('/api/track', new Blob([hit], { type: 'application/json' }))) {
        void fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: hit,
          keepalive: true,
        }).catch(() => {
          /* tracking must never break the page */
        });
      }
    }

    // Scroll depth is measured from the start either way, so a late "accept"
    // still reports how far the visitor actually read.
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);

    const onConsent = (event: Event) => {
      if ((event as CustomEvent<ConsentState>).detail?.value !== 'all') return;
      window.removeEventListener(CONSENT_EVENT, onConsent);
      send();
    };

    if (analyticsAllowed()) send();
    else window.addEventListener(CONSENT_EVENT, onConsent);

    return () => {
      flush();
      controller.abort();
      window.removeEventListener(CONSENT_EVENT, onConsent);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [pathname, search, postId]);

  return null;
}

export function AnalyticsTracker({ postId }: { postId?: string | null }) {
  return (
    <React.Suspense fallback={null}>
      <Beacon postId={postId} />
    </React.Suspense>
  );
}
