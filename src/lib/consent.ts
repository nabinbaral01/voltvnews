/** Shared consent vocabulary for the banner and the analytics beacon. */

export const CONSENT_COOKIE = 'volt_consent';
export const CONSENT_VERSION = 1;
/** Dispatched on window whenever writeConsent runs, so beacons can start late. */
export const CONSENT_EVENT = 'volt:consent';

export type ConsentValue = 'essential' | 'all';

export type ConsentState = {
  value: ConsentValue;
  version: number;
  at: string;
};

/**
 * Do Not Track and Global Privacy Control are honoured as a refusal, and the
 * banner is never shown to a browser that has already said no.
 */
export function signalsRefusal(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const dnt =
    nav.doNotTrack ??
    (window as unknown as { doNotTrack?: string }).doNotTrack ??
    nav.msDoNotTrack;
  return nav.globalPrivacyControl === true || dnt === '1' || dnt === 'yes';
}

export function readConsent(): ConsentState | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.split('=')[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as ConsentState;
    return parsed.version === CONSENT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: ConsentValue) {
  const state: ConsentState = { value, version: CONSENT_VERSION, at: new Date().toISOString() };
  const maxAge = 60 * 60 * 24 * 180;
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=${maxAge}; samesite=lax`;
  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: state }));
}

export function analyticsAllowed(): boolean {
  if (signalsRefusal()) return false;
  return readConsent()?.value === 'all';
}
