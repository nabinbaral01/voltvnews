/**
 * Applies pending migrations as part of the Vercel build.
 *
 * Vercel keeps production secrets write-only, so nobody can run
 * `prisma migrate deploy` from a laptop against the live database — the only
 * place DATABASE_URL is readable is the build itself. Running it here means a
 * schema change ships with the code that needs it, and a migration that fails
 * fails the build, which leaves the previous deployment serving untouched.
 *
 * Off Vercel this is a no-op: local development applies migrations with
 * `npm run db:migrate`, and a CI build should not be touching a database.
 *
 *   npm run build            # runs it on Vercel, skips it elsewhere
 *   npm run migrate:deploy   # force it, e.g. from a shell that has the URL
 */
import { spawnSync } from 'node:child_process';

const forced = process.argv.includes('--force');

if (!process.env.VERCEL && !forced) {
  console.log('migrate-deploy: not a Vercel build, skipping');
  process.exit(0);
}

// Production goes through Neon's pooler. Prisma's migration lock is a
// session-level advisory lock, which a transaction-mode pooler cannot hold
// reliably, so it is switched off — the retry below covers the one race it
// guarded against: several builds of the same commit migrating at once.
const env = { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1' };

const ATTEMPTS = 3;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    env,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status === 0) process.exit(0);

  if (attempt < ATTEMPTS) {
    const wait = 5_000 * attempt;
    console.error(`migrate-deploy: attempt ${attempt} failed, retrying in ${wait / 1000}s`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
  }
}

console.error(`migrate-deploy: gave up after ${ATTEMPTS} attempts`);
process.exit(1);
