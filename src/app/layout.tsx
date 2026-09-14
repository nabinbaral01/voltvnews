import type { Metadata } from 'next';
import { Inter, Khand } from 'next/font/google';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@/components/theme-provider';
import { SITE_URL } from '@/lib/site';
import './globals.css';

/* Khand is the identity. Everything else on the page is negotiable. */
const headline = Khand({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-headline',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

/** AdSense publisher id. Public by nature — it is in every page's HTML. */
const ADSENSE_CLIENT = 'ca-pub-2712501023106459';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'The Volt V — Screens, panels and controllers, covered properly',
    template: '%s | The Volt V',
  },
  description:
    'The Volt V is an entertainment publication covering film, television, comics, gaming and anime with reporting, reviews and rankings.',
  openGraph: {
    type: 'website',
    siteName: 'The Volt V',
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image', site: '@voltv' },
  alternates: { types: { 'application/rss+xml': '/rss.xml' } },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Tells the router that the smooth scroll in globals.css is deliberate,
      // so route transitions jump instantly instead of animating the whole page.
      data-scroll-behavior="smooth"
      className={`${headline.variable} ${body.variable}`}
    >
      <head>
        {/* A literal tag, not next/script: AdSense's site verification reads
            the served HTML for exactly this element, and next/script emits
            only a preload hint there and injects the script at runtime. */}
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <ThemeProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--elevated)',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
