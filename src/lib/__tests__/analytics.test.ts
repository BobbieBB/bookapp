import { analyticsOptOut, cleanProps, setAnalyticsOptOut, track } from '../analytics';
import { supabase } from '../supabase';

describe('cleanProps: no content ever leaves the device', () => {
  it('keeps only allowed keys with short plain values', () => {
    expect(cleanProps({ kind: 'fanfic', language: 'bg', tier: 'week', count: 3, wip: true })).toEqual({
      kind: 'fanfic',
      language: 'bg',
      tier: 'week',
      count: 3,
      wip: true,
    });
  });

  it('drops anything else: unknown keys, long text, objects', () => {
    expect(
      cleanProps({ body: 'my secret comment', title: 'A Fic', kind: 'x'.repeat(41), nested: { a: 1 } as unknown as string }),
    ).toEqual({});
  });
});

describe('track', () => {
  const password = 'test-password-1234';
  const email = `tracker-${Date.now().toString(36)}@example.test`;

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) throw error ?? new Error('could not sign up');
    await supabase.from('profiles').insert({ id: data.user.id, username: `tracker_${Date.now().toString(36)}` }).throwOnError();
  });

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  it('records a known event', async () => {
    expect(await track('story_added', { kind: 'book' })).toBe(true);
  });

  it('records nothing while the reader has opted out, and again once they opt back in', async () => {
    expect(await analyticsOptOut()).toBe(false); // on by default
    await setAnalyticsOptOut(true);
    expect(await analyticsOptOut()).toBe(true);
    expect(await track('app_open')).toBe(false);
    await setAnalyticsOptOut(false);
    expect(await analyticsOptOut()).toBe(false);
    expect(await track('app_open')).toBe(true);
  });

  it('never throws: a failure is reported as false', async () => {
    expect(await track('not_an_event' as never)).toBe(false);
    await supabase.auth.signOut();
    expect(await track('app_open')).toBe(false); // signed out: nothing is recorded
  });
});
