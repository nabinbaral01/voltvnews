import { rebuildRollups } from '../../scripts/rollup.mts';
import { prisma } from './prisma';

/**
 * Keeps today's row of the rollup current.
 *
 * The cron rebuilds DailyMetric once a night, which is fine for yesterday and
 * useless for today: every consented figure — visitors, sessions, engagement,
 * the breakdowns — sat at zero until 03:20 the next morning. Page views
 * escaped that because they read the live tally; nothing else does.
 *
 * Rather than a second aggregation that could drift from the cron's, this
 * runs the cron's own rollup for today only. Today's raw rows are few, so it
 * is a handful of cheap statements, throttled to once a minute per instance
 * and shared between concurrent requests. The nightly run still rebuilds the
 * day afterwards, so nothing here has to be exact.
 */
const REFRESH_INTERVAL_MS = 60_000;

let lastRefresh = 0;
let inFlight: Promise<void> | null = null;

export async function refreshToday(): Promise<void> {
  if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return;
  if (inFlight) return inFlight;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  inFlight = rebuildRollups(prisma, { from: today, to: today })
    .then(() => {
      lastRefresh = Date.now();
    })
    .catch(() => {
      /* a stale day beats a broken dashboard; the cron will catch it up */
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
