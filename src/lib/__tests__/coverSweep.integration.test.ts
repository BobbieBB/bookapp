import { serviceClient } from '../../../test/service';
import { uploadCover } from '../covers';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// The orphan cover-file sweep (docs/DECISIONS.md, "Dev defaults"): files in the covers bucket that no
// custom_covers row points to any more. Real storage on local Supabase, listed by the service role
// the sweep-covers Edge Function uses.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
let service: ReturnType<typeof serviceClient>;
let referenced: string;
let orphan: string;

beforeAll(async () => {
  service = serviceClient();
  const { data, error } = await supabase.auth.signUp({ email: `sweep-${run}@example.test`, password });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  await supabase.from('profiles').insert({ id: data.user.id, username: `sweep_${run}` }).throwOnError();
  const storyId = (await createManualBook({ title: 'Swept', author: 'x', chapters: 1, language: 'en' })).id;
  await addToLibrary(storyId, 'currently_reading');
  referenced = await uploadCover(storyId, PNG.buffer, 'image/png');
  // A file whose custom_covers row never landed (or was deleted with the account).
  orphan = `${data.user.id}/${storyId}-orphan.png`;
  const { error: uploadError } = await supabase.storage.from('covers').upload(orphan, PNG.buffer, { contentType: 'image/png' });
  if (uploadError) throw uploadError;
});

afterAll(async () => {
  await service.storage.from('covers').remove([orphan]);
  await supabase.auth.signOut();
});

it('lists files no cover points to, and not the ones in use', async () => {
  const { data, error } = await service.rpc('orphan_cover_paths', { p_older_than: '0 seconds', p_limit: 100_000 });
  expect(error).toBeNull();
  expect(data).toContain(orphan);
  expect(data).not.toContain(referenced);
});

it('leaves out files younger than the grace period (an upload whose row has not landed yet)', async () => {
  const { data, error } = await service.rpc('orphan_cover_paths', { p_older_than: '1 hour', p_limit: 100_000 });
  expect(error).toBeNull();
  expect(data).not.toContain(orphan);
});

it('only the service role may list them', async () => {
  const { data, error } = await supabase.rpc('orphan_cover_paths', { p_older_than: '0 seconds' });
  expect(data).toBeNull();
  expect(error?.message).toMatch(/permission denied/);
});
