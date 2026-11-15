import { failRequests, holdRequest, holdResponse, recordRequests } from '../../../test/network';
import { analyticsConsent, cleanProps, setAnalyticsConsent, track } from '../analytics';
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

// Analytics are opt-in (docs/DECISIONS.md, "Analytics: opt-in", 14 Nov 2026).
async function newReader(name: string) {
  await supabase.auth.signOut();
  const run = Date.now().toString(36);
  const { data, error } = await supabase.auth.signUp({ email: `${name}-${run}@example.test`, password: 'test-password-1234' });
  if (error || !data.user) throw error ?? new Error('could not sign up');
  await supabase.from('profiles').insert({ id: data.user.id, username: `${name}_${run}` }).throwOnError();
}

describe('consent is cached, and a save always wins over an older read', () => {
  afterAll(async () => {
    await supabase.auth.signOut();
  });

  it('a read that started before a save never overwrites the saved value', async () => {
    await newReader('racer');
    // The read reaches the database first (no consent yet), but its answer arrives after the save.
    const read = holdResponse((url) => url.includes('/rest/v1/analytics_consents?select='));
    const before = analyticsConsent(); // nothing cached yet: this one asks the database
    await read.answered;
    await setAnalyticsConsent(true);
    read.release();
    expect(await before).toBe(true);
    expect(await analyticsConsent()).toBe(true);
  });
});

describe('saves run one at a time, and reads wait for them', () => {
  afterAll(async () => {
    await supabase.auth.signOut();
  });
  const saveUrl = (url: string) => url.includes('/rest/v1/analytics_consents') && !url.includes('select=');
  const inDatabase = async () =>
    (await supabase.from('analytics_consents').select('user_id').throwOnError()).data!.length === 1;

  it('a read that starts while a save is in flight answers with the saved value', async () => {
    await newReader('pending');
    expect(await analyticsConsent()).toBe(false); // cached "no"
    const save = holdRequest(saveUrl); // the save has not reached the database yet
    const saving = setAnalyticsConsent(true);
    const during = analyticsConsent();
    save.release();
    await saving;
    expect(await during).toBe(true);
  });

  it('two quick toggles end with the database and the cache on the last choice', async () => {
    await newReader('toggler');
    // The first save is slow to leave the phone; the second must still land after it.
    const first = holdRequest(saveUrl);
    const on = setAnalyticsConsent(true);
    const off = setAnalyticsConsent(false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    first.release();
    await Promise.all([on, off]);
    expect(await inDatabase()).toBe(false);
    expect(await analyticsConsent()).toBe(false);
  });

  it('a failed save leaves no wrong answer cached', async () => {
    await newReader('failsave');
    expect(await analyticsConsent()).toBe(false);
    const online = failRequests((url, method) => saveUrl(url) && method !== 'GET');
    try {
      await expect(setAnalyticsConsent(true)).rejects.toThrow();
    } finally {
      online();
    }
    expect(await analyticsConsent()).toBe(false);
    expect(await inDatabase()).toBe(false);
  });
});

describe('track', () => {
  beforeAll(async () => {
    await newReader('tracker');
  });

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  it('sends nothing until the reader says yes, then records events until they say no', async () => {
    const sent = recordRequests((url) => url.includes('/rest/v1/analytics_events'));
    try {
      expect(await analyticsConsent()).toBe(false); // off by default
      expect(await track('app_open')).toBe(false);
      expect(sent.bodies).toEqual([]); // not even tried: the database would refuse it anyway
      await setAnalyticsConsent(true);
      expect(await analyticsConsent()).toBe(true);
      expect(await track('story_added', { kind: 'book' })).toBe(true);
      await setAnalyticsConsent(false);
      expect(await analyticsConsent()).toBe(false);
      expect(await track('app_open')).toBe(false);
      expect(sent.bodies).toHaveLength(1);
    } finally {
      sent.stop();
    }
  });

  it('never throws: a failure is reported as false', async () => {
    await setAnalyticsConsent(true);
    expect(await track('not_an_event' as never)).toBe(false);
    await supabase.auth.signOut();
    expect(await track('app_open')).toBe(false); // signed out: nothing is recorded
  });
});
