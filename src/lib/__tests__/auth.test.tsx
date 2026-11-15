import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { holdRequest } from '../../../test/network';
import { AuthProvider, useAuth } from '../auth';
import { myCoverUrl, uploadCover } from '../covers';
import { addToLibrary, createManualBook } from '../stories';
import { supabase } from '../supabase';

// Real users in the local Supabase stack; e-mail confirmation is off there (supabase/config.toml).
const password = 'test-password-1234';
const run = Date.now().toString(36);

async function createUser(name: string, withProfile: boolean) {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  const username = `${name}_${run}`;
  if (withProfile) {
    const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, username });
    if (profileError) throw profileError;
  }
  await supabase.auth.signOut();
  return { id: data.user.id, email, username };
}

type User = Awaited<ReturnType<typeof createUser>>;

type Snapshot = { loading: boolean; user: string | null; username: string | null; profileState: string };

function Probe({ onRender }: { onRender?: (state: Snapshot) => void }) {
  const { loading, session, profile, profileState } = useAuth();
  const state = { loading, user: session?.user.email ?? null, username: profile?.username ?? null, profileState };
  onRender?.(state);
  return <Text testID="auth">{JSON.stringify(state)}</Text>;
}

function authState() {
  return JSON.parse(String(screen.getByTestId('auth').props.children));
}

let alice: User;
let bob: User;
let newcomer: User;

beforeAll(async () => {
  alice = await createUser('alice', true);
  bob = await createUser('bob', true);
  newcomer = await createUser('newcomer', false);
});

// Before, not after: RNTL unmounts each test's tree in its own afterEach, so a sign-out
// there would update a provider that is still mounted.
beforeEach(async () => {
  await supabase.auth.signOut();
});

test('signed out: no session, no profile, nothing loading', async () => {
  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(authState()).toEqual({ loading: false, user: null, username: null, profileState: 'ready' }));
});

test('signing in loads that reader\'s profile', async () => {
  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(authState().loading).toBe(false));
  await act(() => supabase.auth.signInWithPassword({ email: alice.email, password }).then(() => undefined));
  await waitFor(() =>
    expect(authState()).toEqual({ loading: false, user: alice.email, username: alice.username, profileState: 'ready' }),
  );
});

test('a reader without a profile is ready with no profile (goes to onboarding)', async () => {
  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(authState().loading).toBe(false));
  await act(() => supabase.auth.signInWithPassword({ email: newcomer.email, password }).then(() => undefined));
  await waitFor(() =>
    expect(authState()).toEqual({ loading: false, user: newcomer.email, username: null, profileState: 'ready' }),
  );
});

test('a slow profile reply for the previous reader never replaces the current one', async () => {
  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(authState().loading).toBe(false));
  const aliceProfile = holdRequest((url) => url.includes('/rest/v1/rpc/my_profile') && url.includes(alice.id));
  await act(async () => {
    await supabase.auth.signInWithPassword({ email: alice.email, password });
    await supabase.auth.signInWithPassword({ email: bob.email, password });
  });
  await waitFor(() => expect(authState()).toMatchObject({ user: bob.email, username: bob.username, profileState: 'ready' }));
  await act(async () => {
    aliceProfile.release();
    await aliceProfile.answer;
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  expect(authState()).toMatchObject({ user: bob.email, username: bob.username, profileState: 'ready' });
});

test('switching reader never shows the previous reader\'s profile', async () => {
  const seen: Snapshot[] = [];
  await render(<AuthProvider><Probe onRender={(state) => seen.push(state)} /></AuthProvider>);
  await waitFor(() => expect(authState().loading).toBe(false));
  await act(() => supabase.auth.signInWithPassword({ email: alice.email, password }).then(() => undefined));
  await waitFor(() => expect(authState().username).toBe(alice.username));
  const bobProfile = holdRequest((url) => url.includes('/rest/v1/rpc/my_profile') && url.includes(bob.id));
  await act(() => supabase.auth.signInWithPassword({ email: bob.email, password }).then(() => undefined));
  await waitFor(() => expect(authState()).toMatchObject({ user: bob.email, username: null, profileState: 'loading' }));
  await act(async () => {
    bobProfile.release();
    await bobProfile.answer;
  });
  await waitFor(() => expect(authState()).toMatchObject({ user: bob.email, username: bob.username, profileState: 'ready' }));
  expect(seen.filter((state) => state.user === bob.email && state.username === alice.username)).toEqual([]);
});

test('signing out clears the profile', async () => {
  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(authState().loading).toBe(false));
  await act(() => supabase.auth.signInWithPassword({ email: alice.email, password }).then(() => undefined));
  await waitFor(() => expect(authState().username).toBe(alice.username));
  await act(() => supabase.auth.signOut().then(() => undefined));
  await waitFor(() => expect(authState()).toEqual({ loading: false, user: null, username: null, profileState: 'ready' }));
});

// A 1×1 PNG.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));

test('a change of reader, however the session changed, forgets the signed cover links', async () => {
  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(authState().loading).toBe(false));
  const signIn = (u: User) => act(() => supabase.auth.signInWithPassword({ email: u.email, password }).then(() => undefined));
  await signIn(alice);
  await waitFor(() => expect(authState().username).toBe(alice.username));
  const storyId = (await createManualBook({ title: 'Alice Cover', author: 'x', chapters: 1, language: 'en' })).id;
  await addToLibrary(storyId, 'want_to_read');
  await uploadCover(storyId, PNG.buffer, 'image/png');
  const first = await myCoverUrl(storyId);
  await new Promise((resolve) => setTimeout(resolve, 1100)); // a new signature would carry a later time
  // Straight to another reader and back, through supabase.auth (no signOut from useAuth).
  await signIn(bob);
  await waitFor(() => expect(authState().username).toBe(bob.username));
  await signIn(alice);
  await waitFor(() => expect(authState().username).toBe(alice.username));
  expect(await myCoverUrl(storyId)).not.toBe(first);
});
