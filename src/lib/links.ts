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

/**
 * A fic rated Explicit keeps its AO3 link, its archive warnings and its discussion rooms hidden until the
 * reader says they are 18 or over in Profile (the minimum age is 16; docs/DECISIONS.md, "Explicit works:
 * an 18+ yes/no"). Its rating stays visible, so readers know why. Until the profile has loaded, it stays hidden.
 */
export function hidesExplicit(rating: string | null | undefined, adultConfirmed: boolean | undefined): boolean {
  return rating === 'Explicit' && adultConfirmed !== true;
}
