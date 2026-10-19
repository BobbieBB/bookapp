// Deleting your account (docs/DECISIONS.md, "Deleting an account: what happens to comments").
// The database does the deleting (delete_my_account); Storage files can't be removed from SQL, so
// your cover files go first, from here, under the covers bucket's owner-only delete policy.
import { forgetPushDevice } from './pushDevice';
import { supabase } from './supabase';

const COVERS = 'covers';
const PAGE = 100;
/** More rounds than any library needs (10 000 files); never a loop without end. */
const MAX_ROUNDS = 100;

/** Removes every file in your covers/<user id>/ folder, then your rows pointing at them. */
async function removeMyCovers(userId: string) {
  const bucket = supabase.storage.from(COVERS);
  for (let round = 0; ; round++) {
    if (round === MAX_ROUNDS) throw new Error('Too many cover files to remove.');
    // Always the first page: each round removes all it listed, or stops.
    const { data, error } = await bucket.list(userId, { limit: PAGE });
    if (error) throw error;
    if (!data.length) break;
    const { data: removed, error: removeError } = await bucket.remove(data.map((file) => `${userId}/${file.name}`));
    if (removeError) throw removeError;
    // Storage reports files a policy kept it from removing as simply not removed.
    if (removed.length < data.length) throw new Error('Some cover files could not be removed.');
    if (data.length < PAGE) break;
  }
  // The files are gone: no cover may point at one, even if deleting the account then fails.
  const { error } = await supabase.from('custom_covers').delete().eq('user_id', userId);
  if (error) throw error;
}

/** After the account is gone: nothing that fails here may look like the deletion failed. */
async function leaveThisPhone() {
  try {
    await forgetPushDevice();
  } catch (error) {
    console.warn('Could not forget the push token', error instanceof Error ? error.message : error);
  }
  // The server already dropped every session with the account; only this phone still holds one.
  // Signing out locally only clears stored state, so one retry covers a passing storage error.
  for (let attempt = 1; ; attempt++) {
    try {
      await supabase.auth.signOut({ scope: 'local' });
      return;
    } catch (error) {
      console.warn('Could not sign out', error instanceof Error ? error.message : error);
      if (attempt === 2) return;
    }
  }
}

/**
 * Deletes the signed-in reader's account, for good, and signs out. Comments and reviews stay
 * without an author, or with `eraseComments` lose their text (reviews are deleted). Throws only
 * when the account was not deleted.
 */
export async function deleteMyAccount({ eraseComments }: { eraseComments: boolean }) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in.');
  try {
    await removeMyCovers(data.user.id);
  } catch (error) {
    // Leftover files are private and are swept up later; they must not keep the account alive.
    console.warn('Could not remove cover files', error instanceof Error ? error.message : error);
  }
  const { error } = await supabase.rpc('delete_my_account', { p_erase_comments: eraseComments });
  if (error) throw error;
  await leaveThisPhone();
}
