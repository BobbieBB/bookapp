import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import Home from '../../../app/(tabs)/index';
import Profile from '../../../app/(tabs)/profile';
import TabsLayout from '../../../app/(tabs)/_layout';
import { RootStack } from '../../../app/_layout';
import AcceptTerms from '../../../app/accept-terms';
import DeleteAccount from '../../../app/delete-account';
import Onboarding from '../../../app/onboarding';
import SignIn from '../../../app/sign-in';
import { failRequests } from '../../../test/network';
import { renderScreen } from '../../../test/router';
import { MIN_AGE, overrideTermsSchedule, PRIVACY_URL, TERMS_NOTICE_STORAGE_KEY, TERMS_URL, TERMS_VERSION } from '../../lib/legal';
import { supabase } from '../../lib/supabase';

// Terms and age at sign-up (docs/DECISIONS.md, "Terms and age: ticked at sign-up", 2 Nov 2026): two
// ticks before Start, and readers whose accepted version is missing or old are asked again before the
// app opens. Real readers on local Supabase.
const password = 'test-password-1234';
// Versions are date-prefixed, so this one sorts before TERMS_VERSION, as a real older version would.
const OLD_VERSION = '2026-01';
const run = Date.now().toString(36);
type User = { email: string; id: string; username: string };

/** A signed-in reader, with a profile on `version` (null: before the terms existed) or none at all. */
async function signUp(name: string, version?: string | null): Promise<User> {
  await supabase.auth.signOut();
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  const username = `${name}_${run}`;
  if (version !== undefined) {
    await supabase
      .from('profiles')
      .insert({ id: data.user.id, username, terms_version: version, age_confirmed: version !== null })
      .throwOnError();
  }
  return { email, id: data.user.id, username };
}

const profileOf = async (u: User) =>
  (
    await supabase
      .from('profiles')
      .select('terms_version, terms_accepted_at, age_confirmed')
      .eq('id', u.id)
      .maybeSingle()
      .throwOnError()
  ).data;

// The whole app's routing, so the gate decides which screen shows; Profile stands in for the app.
const app = {
  _layout: RootStack,
  'sign-in': SignIn,
  onboarding: Onboarding,
  'accept-terms': AcceptTerms,
  'delete-account': DeleteAccount,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/profile': Profile,
};
const inTheApp = () => screen.findByLabelText('Help us improve the app', {}, { timeout: 8000 });

afterAll(async () => {
  await supabase.removeAllChannels();
  await supabase.auth.signOut();
});

describe('onboarding', () => {
  const tick = (name: RegExp) => fireEvent.press(screen.getByRole('checkbox', { name }));
  const start = () => screen.getByRole('button', { name: 'Start reading' });

  it('Start stays disabled until both are ticked, then saves the version, the age and a server time', async () => {
    const u = await signUp('newcomer');
    await renderScreen('en', { onboarding: Onboarding }, '/onboarding');
    await fireEvent.changeText(await screen.findByLabelText('Name', {}, { timeout: 8000 }), u.username);
    expect(start()).toBeDisabled();
    expect(start().props.accessibilityHint).toBe('Tick both boxes to continue.');
    expect(screen.getByText('Tick both boxes to continue.')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: /accept/ })).not.toBeChecked();

    // A privacy notice is read, not accepted (GDPR arts. 7(4), 13): only the Terms are agreed to.
    expect(screen.getByRole('checkbox', { name: 'I accept the Terms. I have read the Privacy Policy.' })).toBeOnTheScreen();
    await tick(/accept/);
    expect(screen.getByRole('checkbox', { name: /accept/ })).toBeChecked();
    expect(start()).toBeDisabled();
    await tick(new RegExp(`at least ${MIN_AGE}`));
    expect(start()).toBeEnabled();
    expect(screen.queryByText('Tick both boxes to continue.')).toBeNull();
    expect(screen.getByText(`Livami is for readers aged ${MIN_AGE} and over.`)).toBeOnTheScreen();

    await fireEvent.press(start());
    await waitFor(async () => expect(await profileOf(u)).not.toBeNull(), { timeout: 8000 });
    const row = (await profileOf(u))!;
    expect(row.terms_version).toBe(TERMS_VERSION);
    expect(row.age_confirmed).toBe(true);
    expect(Math.abs(Date.parse(row.terms_accepted_at!) - Date.now())).toBeLessThan(60_000);
  });

  it('without the age tick, Start does nothing and no profile is made', async () => {
    const u = await signUp('notyet');
    await renderScreen('en', { onboarding: Onboarding }, '/onboarding');
    await fireEvent.changeText(await screen.findByLabelText('Name', {}, { timeout: 8000 }), u.username);
    await tick(/accept/);
    expect(start()).toBeDisabled();
    await fireEvent.press(start());
    // Saving swaps the title for a spinner at once, before any request: the title still being there
    // shows the press never started a save (the name is valid, so it would not stop early).
    expect(start()).toBeDisabled();
    expect(await profileOf(u)).toBeNull();
  });

  it('a failed save shows a translated message, never the raw error', async () => {
    const u = await signUp('offline');
    await renderScreen('en', { onboarding: Onboarding }, '/onboarding');
    await fireEvent.changeText(await screen.findByLabelText('Name', {}, { timeout: 8000 }), u.username);
    await tick(/accept/);
    await tick(new RegExp(`at least ${MIN_AGE}`));
    const online = failRequests((url, method) => method === 'POST' && url.includes('/rest/v1/profiles'));
    try {
      await fireEvent.press(start());
      expect(await screen.findByText('We couldn’t save your profile. Please try again.')).toBeOnTheScreen();
    } finally {
      online();
    }
    expect(screen.queryByText(/Network request failed/)).toBeNull();
    expect(await profileOf(u)).toBeNull();
  });

  it('the Terms and Privacy Policy links open the web pages', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    try {
      await signUp('linker');
      await renderScreen('en', { onboarding: Onboarding }, '/onboarding');
      await fireEvent.press(await screen.findByRole('link', { name: 'Open the Terms' }, { timeout: 8000 }));
      expect(open).toHaveBeenCalledWith(TERMS_URL);
      await fireEvent.press(screen.getByRole('link', { name: 'Open the Privacy Policy' }));
      expect(open).toHaveBeenCalledWith(PRIVACY_URL);
    } finally {
      open.mockRestore();
    }
  });

  it('a link that cannot open says so, until a later one opens', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('no browser')).mockResolvedValue(true);
    try {
      await signUp('nobrowser');
      await renderScreen('en', { onboarding: Onboarding }, '/onboarding');
      await fireEvent.press(await screen.findByRole('link', { name: 'Open the Terms' }, { timeout: 8000 }));
      expect(await screen.findByText('We couldn’t open the page. Please try again.')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('link', { name: 'Open the Terms' }));
      await waitFor(() => expect(screen.queryByText('We couldn’t open the page. Please try again.')).toBeNull());
    } finally {
      open.mockRestore();
    }
  });
});

describe('readers who accepted an older version, or none', () => {
  const accept = () => screen.getByRole('button', { name: 'Accept' });

  it('an old version is asked again; accepting opens the app', async () => {
    const u = await signUp('oldterms', OLD_VERSION);
    await renderScreen('en', app, '/profile');
    expect(await screen.findByText('Our terms have changed', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Help us improve the app')).toBeNull();
    expect(accept()).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: /accept/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(`at least ${MIN_AGE}`) }));
    await fireEvent.press(accept());
    expect(await inTheApp()).toBeOnTheScreen();
    const row = (await profileOf(u))!;
    expect(row.terms_version).toBe(TERMS_VERSION);
    expect(Math.abs(Date.parse(row.terms_accepted_at!) - Date.now())).toBeLessThan(60_000);
  });

  const tickBoth = async () => {
    await fireEvent.press(await screen.findByRole('checkbox', { name: /accept/ }, { timeout: 8000 }));
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(`at least ${MIN_AGE}`) }));
  };

  it('Accept says why it is disabled', async () => {
    await signUp('hinted', OLD_VERSION);
    await renderScreen('en', app, '/profile');
    expect(await screen.findByText('Tick both boxes to continue.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(accept().props.accessibilityHint).toBe('Tick both boxes to continue.');
  });

  it('when the profile is gone, Accept says it failed instead of doing nothing', async () => {
    await signUp('vanished', OLD_VERSION);
    await renderScreen('en', app, '/profile');
    await tickBoth();
    // Deleted from another device: this session still works, but the update finds no row.
    await supabase.rpc('delete_my_account', { p_erase_comments: false }).throwOnError();
    await fireEvent.press(accept());
    expect(await screen.findByText('We couldn’t save that. Please try again.')).toBeOnTheScreen();
    expect(screen.getByText('Our terms have changed')).toBeOnTheScreen();
  });

  it('when the profile cannot be reloaded after accepting, it says so and Accept can be tried again', async () => {
    const u = await signUp('flaky', OLD_VERSION);
    await renderScreen('en', app, '/profile');
    await tickBoth();
    const online = failRequests((url, method) => method === 'GET' && url.includes('/rest/v1/profiles') && url.includes('reads_books'));
    try {
      await fireEvent.press(accept());
      expect(await screen.findByText('We couldn’t save that. Please try again.')).toBeOnTheScreen();
      expect(screen.getByText('Our terms have changed')).toBeOnTheScreen();
    } finally {
      online();
    }
    expect((await profileOf(u))!.terms_version).toBe(TERMS_VERSION);
    await fireEvent.press(accept());
    expect(await inTheApp()).toBeOnTheScreen();
  });

  it('a reader from before the terms is asked too', async () => {
    await signUp('noterms', null);
    await renderScreen('en', app, '/profile');
    expect(await screen.findByText('Our terms have changed', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Open the Terms' })).toBeOnTheScreen();
  });

  it('a reader on the current version goes straight to the app', async () => {
    await signUp('current', TERMS_VERSION);
    await renderScreen('en', app, '/profile');
    expect(await inTheApp()).toBeOnTheScreen();
    expect(screen.queryByText('Our terms have changed')).toBeNull();
  });

  it('a reader on a newer version than this build goes straight to the app (it cannot go back)', async () => {
    await signUp('ahead', '2099-01');
    await renderScreen('en', app, '/profile');
    expect(await inTheApp()).toBeOnTheScreen();
    expect(screen.queryByText('Our terms have changed')).toBeNull();
  });

  it('can sign out from the gate', async () => {
    await signUp('leaver', OLD_VERSION);
    await renderScreen('en', app, '/profile');
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }, { timeout: 8000 }));
    expect(await screen.findByText('Welcome back', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('can delete the account from the gate, without accepting', async () => {
    const u = await signUp('refuser', OLD_VERSION);
    await renderScreen('en', app, '/profile');
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' }, { timeout: 8000 }));
    expect(await screen.findByText('Delete your account', {}, { timeout: 8000 })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Yes, delete it forever' }));
    expect(await screen.findByText('Welcome back', {}, { timeout: 15000 })).toBeOnTheScreen();
    expect(!!(await supabase.auth.signInWithPassword({ email: u.email, password })).error).toBe(true);
  });

  it('deleting the account from the gate signs out', async () => {
    await signUp('goodbye', OLD_VERSION);
    await renderScreen('en', app, '/profile');
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' }, { timeout: 8000 }));
    expect(await screen.findByText('Delete your account', {}, { timeout: 8000 })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Yes, delete it forever' }));
    await waitFor(async () => expect((await supabase.auth.getSession()).data.session).toBeNull(), { timeout: 15000 });
    expect(await screen.findByText('Welcome back', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await signUp('bgterms', OLD_VERSION);
    await renderScreen('bg', app, '/profile');
    expect(await screen.findByText('Условията ни се промениха', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Приемам Условията. Прочетох Политиката за поверителност.' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: new RegExp(`поне ${MIN_AGE}`) })).toBeOnTheScreen();
    expect(screen.getByText(`Livami е за читатели на ${MIN_AGE} и повече години.`)).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Отвори Условията' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Отвори Политиката за поверителност' })).toBeOnTheScreen();
    expect(screen.getByText('Условия')).toBeOnTheScreen();
    expect(screen.getByText('Отметни двете полета, за да продължиш.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Приемам' })).toBeOnTheScreen();
  });
});

// A change announced ahead of its effective date (docs/DECISIONS.md, "Terms changes take effect on a
// date"): until then readers on an older version keep using the app and see a notice on Home; from that
// day the gate above applies. The schedule is overridden instead of faking timers (renderScreen uses
// real ones).
describe('terms that change on a date', () => {
  const homeApp = { ...app, '(tabs)/index': Home };
  const before = () => overrideTermsSchedule({ today: '2026-11-30', effective: '2026-12-01' });
  let restore: () => void = () => {};
  const atHome = (u: User) => screen.findByText(`Hi, ${u.username}`, {}, { timeout: 8000 });
  const notice = 'Our terms change on 1 December 2026';

  beforeEach(async () => {
    await AsyncStorage.removeItem(TERMS_NOTICE_STORAGE_KEY);
  });
  afterEach(() => restore());

  it('before the date, an older version opens the app with a notice and no gate', async () => {
    restore = before();
    await signUp('early', OLD_VERSION);
    await renderScreen('en', homeApp, '/');
    expect(await screen.findByText(notice, {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText('Our terms have changed')).toBeNull();
  });

  it('the notice links to the Terms', async () => {
    restore = before();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    try {
      await signUp('earlyreader', OLD_VERSION);
      await renderScreen('en', homeApp, '/');
      await fireEvent.press(await screen.findByRole('link', { name: 'Read the new Terms' }, { timeout: 8000 }));
      expect(open).toHaveBeenCalledWith(TERMS_URL);
    } finally {
      open.mockRestore();
    }
  });

  it('dismissing the notice is remembered on this phone for this version', async () => {
    restore = before();
    const u = await signUp('dismisser', OLD_VERSION);
    const first = await renderScreen('en', homeApp, '/');
    await fireEvent.press(await screen.findByRole('button', { name: 'Dismiss' }, { timeout: 8000 }));
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull());
    expect(await AsyncStorage.getItem(TERMS_NOTICE_STORAGE_KEY)).toBe(TERMS_VERSION);
    first.unmount();

    await renderScreen('en', homeApp, '/');
    expect(await atHome(u)).toBeOnTheScreen();
    // The remembered answer is read asynchronously: give it time to (wrongly) show.
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.queryByText(notice)).toBeNull();
  });

  it('a dismissal for an earlier version does not hide this one', async () => {
    restore = before();
    await AsyncStorage.setItem(TERMS_NOTICE_STORAGE_KEY, OLD_VERSION);
    await signUp('redismiss', OLD_VERSION);
    await renderScreen('en', homeApp, '/');
    expect(await screen.findByText(notice, {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('Accept now saves the current version early, and the notice goes', async () => {
    restore = before();
    const u = await signUp('earlybird', OLD_VERSION);
    await renderScreen('en', homeApp, '/');
    await fireEvent.press(await screen.findByRole('button', { name: 'Accept now' }, { timeout: 8000 }));
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull(), { timeout: 8000 });
    const row = (await profileOf(u))!;
    expect(row.terms_version).toBe(TERMS_VERSION);
    expect(Math.abs(Date.parse(row.terms_accepted_at!) - Date.now())).toBeLessThan(60_000);
    expect(screen.getByText(`Hi, ${u.username}`)).toBeOnTheScreen();
  });

  it('a reader on the current version sees no notice', async () => {
    restore = before();
    const u = await signUp('uptodate', TERMS_VERSION);
    await renderScreen('en', homeApp, '/');
    expect(await atHome(u)).toBeOnTheScreen();
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.queryByText(notice)).toBeNull();
  });

  it('a reader who never accepted any terms is still gated before the date', async () => {
    restore = before();
    await signUp('neveraccepted', null);
    await renderScreen('en', homeApp, '/');
    expect(await screen.findByText('Our terms have changed', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('on the date, the gate applies', async () => {
    restore = overrideTermsSchedule({ today: '2026-12-01', effective: '2026-12-01' });
    await signUp('ontheday', OLD_VERSION);
    await renderScreen('en', homeApp, '/');
    expect(await screen.findByText('Our terms have changed', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByText(notice)).toBeNull();
  });

  it('after the date, the gate applies', async () => {
    restore = overrideTermsSchedule({ today: '2027-01-15', effective: '2026-12-01' });
    await signUp('afterwards', OLD_VERSION);
    await renderScreen('en', homeApp, '/');
    expect(await screen.findByText('Our terms have changed', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('in Bulgarian, with the date in Bulgarian', async () => {
    restore = before();
    await signUp('bgearly', OLD_VERSION);
    await renderScreen('bg', homeApp, '/');
    expect(await screen.findByText('Условията ни се променят на 1 декември 2026 г.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Прочети новите Условия' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Приемам сега' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Скрий' })).toBeOnTheScreen();
  });
});
