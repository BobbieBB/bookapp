export const NAME_RULE = /^[a-zA-Z0-9_]{3,30}$/;

/**
 * Whether to show the name's problem under the field (PO, 21 Nov 2026: as the reader types, not only
 * after "Start reading"). A wrong character or a name over 30 shows at once. "Too short" waits until
 * the reader leaves the field, so the first two letters aren't met with an error. After a try to
 * save, every problem shows, an empty name too.
 */
export function nameProblem(name: string, { left, tried }: { left: boolean; tried: boolean }): boolean {
  const handle = name.trim();
  if (NAME_RULE.test(handle)) return false;
  if (tried) return true;
  if (handle === '') return false;
  if (/[^a-zA-Z0-9_]/.test(handle) || handle.length > 30) return true;
  return left;
}
