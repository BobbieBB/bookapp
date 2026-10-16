import { pushTarget, registerPushToken, unregisterPushToken } from '../push';
import { supabase } from '../supabase';

// Push notifications (docs/DECISIONS.md, Spoiler Safe Mode 5). The device side (permission, Expo
// token) is native; what we keep and where a tap leads is tested here against local Supabase.

describe('pushTarget: where tapping a push may lead', () => {
  it('only to a discussion room in the app', () => {
    expect(pushTarget({ url: '/room/0f8fad5b-d9cb-469f-a165-70867728950e/3' })).toBe('/room/0f8fad5b-d9cb-469f-a165-70867728950e/3');
    expect(pushTarget({ url: '/room/0f8fad5b-d9cb-469f-a165-70867728950e/epilogue' })).toBe(
      '/room/0f8fad5b-d9cb-469f-a165-70867728950e/epilogue',
    );
  });

  it('nowhere else', () => {
    for (const url of ['https://evil.example', '/settings', '/room/not-a-uuid/3', '/room/0f8fad5b-d9cb-469f-a165-70867728950e/3/../x', undefined, 42]) {
      expect(pushTarget({ url })).toBeNull();
    }
    expect(pushTarget(null)).toBeNull();
  });
});

describe('device tokens', () => {
  const password = 'test-password-1234';
  const run = Date.now().toString(36);
  const token = `ExponentPushToken[test-${run}]`;
  let me: string;

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signUp({ email: `pusher-${run}@example.test`, password });
    if (error || !data.user) throw error ?? new Error('could not sign up');
    me = data.user.id;
    await supabase.from('profiles').insert({ id: me, username: `pusher_${run}` }).throwOnError();
  });

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  it('registering a device keeps its language; registering again updates it', async () => {
    await registerPushToken(token, 'bg', 'ios');
    await registerPushToken(token, 'en', 'ios');
    const { data } = await supabase.from('push_tokens').select('user_id, language').eq('token', token).single().throwOnError();
    expect(data).toEqual({ user_id: me, language: 'en' });
  });

  it('signing out of a device forgets it', async () => {
    await unregisterPushToken(token);
    const { data } = await supabase.from('push_tokens').select('token').eq('token', token).throwOnError();
    expect(data).toEqual([]);
  });
});
