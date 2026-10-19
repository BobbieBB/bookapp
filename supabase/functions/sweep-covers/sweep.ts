// The sweep-covers function's own logic, kept free of Deno and Supabase so the app's Jest suite can
// test it (src/lib/__tests__/sweepCovers.test.ts). index.ts wires it to the request and to Storage.

/** Storage removes at most this many files per request. */
export const CHUNK_SIZE = 100;

/**
 * Whether the request carries the shared secret. Compared in constant time, so the answer's timing
 * says nothing about how much of a guess was right. With no secret configured nobody gets in.
 */
export function authorized(given: string | null, secret: string | undefined): boolean {
  if (!secret || given === null) return false;
  let diff = given.length ^ secret.length;
  for (let i = 0; i < secret.length; i++) diff |= (given.charCodeAt(i) || 0) ^ secret.charCodeAt(i);
  return diff === 0;
}

/** The list split into groups of at most `size`, in order. */
export function chunks<T>(list: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < list.length; i += size) groups.push(list.slice(i, i + size));
  return groups;
}

export type RemoveResult = { removed: number; error: string | null };

async function attempt(group: string[], remove: (group: string[]) => Promise<RemoveResult>): Promise<number | null> {
  try {
    const result = await remove(group);
    return result.error ? null : result.removed;
  } catch {
    return null;
  }
}

/**
 * Removes the files a chunk at a time and counts them. A chunk that fails is tried again file by
 * file, so one file Storage keeps refusing can't hold back the others: orphan_cover_paths lists the
 * oldest first, and the same failing chunk would otherwise come back first every day. What still
 * fails is counted as failed and tried again in the next sweep.
 */
export async function removeInChunks(
  paths: string[],
  remove: (group: string[]) => Promise<RemoveResult>,
  size = CHUNK_SIZE,
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const group of chunks(paths, size)) {
    const done = await attempt(group, remove);
    if (done !== null) {
      removed += done;
      continue;
    }
    if (group.length === 1) {
      failed += 1;
      continue;
    }
    for (const path of group) {
      const one = await attempt([path], remove);
      if (one === null) failed += 1;
      else removed += one;
    }
  }
  return { removed, failed };
}
