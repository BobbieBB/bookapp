// The terms and privacy policy live on the web; the app links to them and records which version a
// reader accepted (docs/DECISIONS.md, "Terms and age: ticked at sign-up", user decision 2 Nov 2026).
// The PO sets these. Bumping TERMS_VERSION asks every reader to accept again before the app opens.
export const TERMS_URL = 'https://livami.app/terms';
export const PRIVACY_URL = 'https://livami.app/privacy';
// Date-prefixed (YYYY-MM-…), so a newer version always sorts later: the database refuses going back to
// an older one (docs/DATA_MODEL.md, "Terms and age").
export const TERMS_VERSION = '2026-11-draft';
// Readers tick "I'm at least {MIN_AGE}"; no birth date is stored. 16 is a dev default until the PO decides.
export const MIN_AGE = 16;
