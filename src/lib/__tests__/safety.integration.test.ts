import { block, blockedReaders, reportComment, reportUser, requestRemoval, sendFeedback, unblock } from '../safety';
import { supabase } from '../supabase';

// Report, block, feedback and author opt-out (docs/DECISIONS.md: Fandom etiquette, MVP scope).
// Real readers on local Supabase.
const password = 'test-password-1234';
const run = Date.now().toString(36);
type User = { email: string; id: string; username: string };

async function signUp(name: string): Promise<User> {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  const username = `${name}_${run}`;
  await supabase.from('profiles').insert({ id: data.user.id, username }).throwOnError();
  await supabase.auth.signOut();
  return { email, id: data.user.id, username };
}

async function as(u: User) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

let me: User;
let other: User;

beforeAll(async () => {
  me = await signUp('safe');
  other = await signUp('rude');
});

afterAll(async () => {
  await supabase.auth.signOut();
});

it('feedback is saved with the app version', async () => {
  await as(me);
  await sendFeedback('idea', 'Dark mode for covers');
  const { data } = await supabase.from('feedback').select('kind, body, app_version').eq('user_id', me.id).single().throwOnError();
  expect(data).toEqual({ kind: 'idea', body: 'Dark mode for covers', app_version: '0.1.0' });
});

it('empty feedback is refused before it is sent', async () => {
  await as(me);
  await expect(sendFeedback('problem', '   ')).rejects.toThrow('empty');
});

it('an author asks for their fic to be removed by its AO3 link', async () => {
  await as(me);
  await requestRemoval({ storyUrl: 'archiveofourown.org/works/424242/chapters/1', contact: 'me@example.test', message: 'Please hide my fic' });
  const { data } = await supabase.from('removal_requests').select('story_url, contact, status').eq('requester_id', me.id).single().throwOnError();
  expect(data).toEqual({ story_url: 'https://archiveofourown.org/works/424242', contact: 'me@example.test', status: 'open' });
});

it('a removal request needs an AO3 work link', async () => {
  await as(me);
  await expect(requestRemoval({ storyUrl: 'https://example.com/x', contact: '', message: '' })).rejects.toThrow('AO3');
});

it('reporting a reader', async () => {
  await as(me);
  await reportUser(other.id, 'harassment', 'Rude in chapter 3');
  const { data } = await supabase.from('reports').select('reported_user_id, reason').eq('reporter_id', me.id).single().throwOnError();
  expect(data).toEqual({ reported_user_id: other.id, reason: 'harassment' });
});

it('reporting a comment you cannot see fails', async () => {
  await as(me);
  await expect(reportComment('00000000-0000-0000-0000-000000000000', 'spoiler')).rejects.toBeTruthy();
});

it('block, list and unblock', async () => {
  await as(me);
  await block(other.id);
  await block(other.id); // twice is still once
  expect(await blockedReaders()).toEqual([{ id: other.id, username: other.username }]);
  await unblock(other.id);
  expect(await blockedReaders()).toEqual([]);
});
