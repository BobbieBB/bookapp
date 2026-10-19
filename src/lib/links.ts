/** Only archive links leave the app, and only to AO3. */
export function isAo3Link(url: string | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'archiveofourown.org';
  } catch {
    return false;
  }
}
