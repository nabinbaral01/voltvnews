import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'Exactly what Volt V collects, why, how long it is kept and how to get it back or have it deleted.',
};

/**
 * Written to match what the code actually does. If the analytics pipeline
 * changes, this page changes with it.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="headline text-4xl uppercase sm:text-5xl">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted">
        Last updated {new Date().getFullYear()}. This is a demonstration publication, but the data
        handling described below is exactly what the software does.
      </p>

      <div className="prose-volt mt-8">
        <h2>The short version</h2>
        <ul>
          <li>We run our own analytics. No third-party ad trackers, no data brokers.</li>
          <li>We never store your IP address. It is hashed with a secret salt on arrival.</li>
          <li>Analytics cookies are off until you accept them. Essential cookies always run.</li>
          <li>
            Every article keeps a plain view counter that goes up by one per visit. It stores
            nothing about you — no cookie, no address, no row — so it runs without consent.
          </li>
          <li>
            We honour Do Not Track and Global Privacy Control automatically — if your browser sends
            either, nothing about you is recorded and you are never shown the banner. Only the
            counter above moves.
          </li>
          <li>Age and gender come only from what readers volunteer. We never infer them.</li>
        </ul>

        <h2 id="cookies">Cookies we set</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2">Cookie</th>
              <th>Purpose</th>
              <th>Lifetime</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2 font-mono text-xs">volt_consent</td>
              <td>Remembers your cookie choice</td>
              <td>180 days</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 font-mono text-xs">volt_vid</td>
              <td>
                First-party visitor identifier, used to tell a returning reader from a new one.
                Only its salted hash is stored server-side.
              </td>
              <td>1 year</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 font-mono text-xs">volt_sid</td>
              <td>Groups page views into a single visit, for bounce rate</td>
              <td>30 minutes</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 font-mono text-xs">authjs.session-token</td>
              <td>Keeps you signed in. Essential; set only when you have an account.</td>
              <td>30 days</td>
            </tr>
          </tbody>
        </table>

        <h2>What we record when you read an article</h2>
        <p>
          Without consent, one thing: the article&apos;s view counter increases by one. That
          number is not linked to a visitor, a cookie or an address, and there is no per-visit
          record behind it.
        </p>
        <p>
          With analytics consent, each page view stores: the path, the referring site, any UTM
          campaign parameters, an approximate location derived from your IP (country, region,
          city), your device type, browser and operating system, your screen width, how long the
          page was open and how far down it you scrolled.
        </p>
        <p>
          <strong>Your IP address is never written to the database.</strong> It is used in memory
          to derive an approximate location, then hashed. Rotating our salt permanently
          disconnects all historical rows from any device.
        </p>

        <h2>Age and gender</h2>
        <p>
          Web traffic does not carry age or gender, and we do not infer either from browsing
          behaviour — that would be unreliable and, in the UK and EU, regulated profiling.
        </p>
        <p>Our audience reports draw on three clearly-labelled sources:</p>
        <ol>
          <li>
            <strong>Self-declared</strong> — the optional birth year and gender fields on the
            registration and account pages. Accurate, but it only covers readers with accounts who
            chose to answer.
          </li>
          <li>
            <strong>Surveys</strong> — occasional one-question site polls, reported as a projection
            with a stated sample size.
          </li>
          <li>
            <strong>Third-party panels</strong> — modelled, aggregated estimates from providers
            such as Google Analytics 4. Never per-visitor.
          </li>
        </ol>
        <p>
          Every demographic figure in our internal reporting is shown with the percentage of the
          audience it is based on. You can clear your demographic fields at any time from{' '}
          <Link href="/account">your account</Link>.
        </p>

        <h2>How long we keep it</h2>
        <ul>
          <li>Raw page-view and session rows: 14 months, then automatically deleted.</li>
          <li>
            Daily aggregates (counts by day, country, article and so on): kept indefinitely. They
            contain no identifiers.
          </li>
          <li>Account data: until you delete your account.</li>
          <li>Newsletter subscriptions: until you unsubscribe.</li>
        </ul>

        <h2>Your rights</h2>
        <p>
          From <Link href="/account">your account</Link> you can export everything we hold about
          you as a JSON file, correct any of it, or delete the account entirely. Deleting detaches
          your comments, clears your demographic fields and unlinks every analytics row from you.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about any of this go to <code>privacy@voltv.example</code>.
        </p>
      </div>
    </div>
  );
}
