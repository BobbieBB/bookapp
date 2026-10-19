// Deleting your account (docs/DECISIONS.md, "Deleting an account: what happens to comments").
// The database does the deleting (delete_my_account); Storage files can't be removed from SQL, so
// your cover files go first, from here, under the covers bucket's owner-only delete policy.
import { forgetPushDevice } from './pushDevice';
import { supabase } from './supabase';

const COVERS = 'covers';
const PAGE = 100;

/** Removes every file in your covers/<user id>/ folder. */
async function removeMyCoverFiles(userId: string) {
  const bucket = supabase.storage.from(COVERS);
  for (;;) {
    // Always the first page: each round removes what it listed.
    const { data, error } = await bucket.list(userId, { limit: PAGE });
    if (error) throw error;
    if (!data.length) return;
    const { data: removed, error: removeError } = await bucket.remove(data.map((file) => `${userId}/${file.name}`));
    if (removeError) throw removeError;
    // Storage reports files a policy kept it from removing as simply not removed.
    if (!removed.length) throw new Error('No cover files could be removed.');
    if (data.length < PAGE) return;
  }
}

/**
 * Deletes the signed-in reader's account, for good, and signs out. Comments and reviews stay
 * without an author, or with `eraseComments` lose their text (reviews are deleted).
 */
export async function deleteMyAccount({ eraseComments }: { eraseComments: boolean }) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in.');
  try {
    await removeMyCoverFiles(data.user.id);
  } catch (error) {
    // Leftover files are private and are swept up later; they must not keep the account alive.
    console.warn('Could not remove cover files', error instanceof Error ? error.message : error);
  }
  const { error } = await supabase.rpc('delete_my_account', { p_erase_comments: eraseComments });
  if (error) throw error;
  await forgetPushDevice();
  // The server already dropped every session with the account; only this phone still holds one.
  await supabase.auth.signOut({ scope: 'local' });
}
