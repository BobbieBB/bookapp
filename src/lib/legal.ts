// The terms and privacy policy live on the web; the app links to them and records which version a
// reader accepted (docs/DECISIONS.md, "Terms and age: ticked at sign-up", user decision 2 Nov 2026).
// The PO sets these. Bumping TERMS_VERSION asks every reader to accept again before the app opens.
export const TERMS_URL = 'https://livami.app/terms';
export const PRIVACY_URL = 'https://livami.app/privacy';
// Date-prefixed (YYYY-MM-…), so a newer version always sorts later: the database refuses going back to
// an older one (docs/DATA_MODEL.md, "Terms and age").
export const TERMS_VERSION = '2026-11-draft';
// The day TERMS_VERSION takes effect (YYYY-MM-DD, the phone's own calendar day). Before it, readers on an
// older version keep using the app and see a notice on Home they can dismiss or accept early; from it on,
// they accept before the app opens (docs/DECISIONS.md, "Terms changes take effect on a date"). The PO
// sets it with each new version, normally some weeks ahead. This version has applied since sign-up ticks
// began.
export const TERMS_EFFECTIVE = '2026-11-03';
// Which version's notice this phone has dismissed (only the latest is kept: a new version shows again).
export const TERMS_NOTICE_STORAGE_KEY = 'livami.terms.noticeDismissed';
// Readers tick "I'm at least {MIN_AGE}"; no birth date is stored. 16 is a dev default until the PO decides.
export const MIN_AGE = 16;

/** Today on the phone's calendar, as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let schedule: { today?: string; effective?: string } = {};

/**
 * For tests: pretend today and/or TERMS_EFFECTIVE are other days (YYYY-MM-DD), without faking timers.
 * Returns a function that puts the previous schedule back.
 */
export function overrideTermsSchedule(o: { today?: string; effective?: string }): () => void {
  const previous = schedule;
  schedule = o;
  return () => {
    schedule = previous;
  };
}

/** The day the current terms take effect, as YYYY-MM-DD. */
export const termsEffective = () => schedule.effective ?? TERMS_EFFECTIVE;

/**
 * Where a reader who accepted `accepted` stands with the current terms:
 * - 'current': they accepted TERMS_VERSION, or a newer one from a newer build (the database never lets
 *   them go back, so asking again could only fail);
 * - 'upcoming': an older version, before TERMS_EFFECTIVE — the app opens, with a notice;
 * - 'required': an older version from TERMS_EFFECTIVE on, or none at all — they accept first.
 * Versions are date-prefixed ASCII, so string order is the database's "C" order.
 */
export function termsStatus(accepted: string | null | undefined): 'current' | 'upcoming' | 'required' {
  if (!accepted) return 'required';
  if (accepted >= TERMS_VERSION) return 'current';
  return (schedule.today ?? localToday()) < termsEffective() ? 'upcoming' : 'required';
}
