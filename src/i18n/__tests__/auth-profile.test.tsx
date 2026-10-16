import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import Onboarding from '../../../app/onboarding';
import SignIn from '../../../app/sign-in';
import TabsLayout from '../../../app/(tabs)/_layout';
import Profile from '../../../app/(tabs)/profile';
import { ProfileError } from '../../../app/_layout';
import { AuthProvider } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { languageWrapper, renderIn } from '../../../test/i18n';
import type { Language } from '../index';

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
  return { email, username };
}

type User = Awaited<ReturnType<typeof createUser>>;
let reader: User;
let newcomer: User;

beforeAll(async () => {
  reader = await createUser('lang_reader', true);
  newcomer = await createUser('lang_newcomer', false);
});

// Before, not after: RNTL unmounts each test's tree in its own afterEach.
beforeEach(async () => {
  await supabase.auth.signOut();
});

async function signInAs(user: User) {
  await act(() => supabase.auth.signInWithPassword({ email: user.email, password }).then(() => undefined));
}

const languages: Language[] = ['en', 'bg'];

describe.each(languages)('sign-in in %s', (language) => {
  const text = {
    en: {
      title: 'Welcome back',
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      passwordPlaceholder: 'At least 8 characters',
      submit: 'Sign in',
      toSignUp: 'New here? Create an account',
      signUpTitle: 'Join the readers',
      missingEmail: 'Please enter your email address.',
    },
    bg: {
      title: 'Радваме се да те видим отново',
      email: 'Имейл',
      emailPlaceholder: 'ime@example.com',
      passwordPlaceholder: 'Поне 8 знака',
      submit: 'Вход',
      toSignUp: 'Нов си тук? Създай акаунт',
      signUpTitle: 'Присъедини се към читателите',
      missingEmail: 'Моля, въведи имейл адреса си.',
    },
  }[language];

  it('shows its text, switches to sign-up and reports a missing e-mail', async () => {
    await renderIn(language, <SignIn />);
    expect(screen.getByText(text.title)).toBeTruthy();
    expect(screen.getByText(text.email)).toBeTruthy();
    expect(screen.getByPlaceholderText(text.emailPlaceholder)).toBeTruthy();
    expect(screen.getByPlaceholderText(text.passwordPlaceholder)).toBeTruthy();

    await fireEvent.press(screen.getByText(text.submit));
    expect(await screen.findByText(text.missingEmail)).toBeTruthy();

    await fireEvent.press(screen.getByText(text.toSignUp));
    expect(screen.getByText(text.signUpTitle)).toBeTruthy();
  });
});

describe.each(languages)('onboarding in %s', (language) => {
  const text = {
    en: {
      title: 'Make yourself at home',
      question: 'What do you read?',
      start: 'Start reading',
      signOut: 'Sign out',
      badName: 'Names use 3–30 letters, numbers or underscores, no spaces.',
    },
    bg: {
      title: 'Чувствай се като у дома си',
      question: 'Какво четеш?',
      start: 'Започни да четеш',
      signOut: 'Изход',
      badName: 'Имената са от 3 до 30 латински букви, цифри или долни черти, без интервали.',
    },
  }[language];

  it('shows its text and validates the name', async () => {
    await signInAs(newcomer);
    await renderIn(language, <AuthProvider><Onboarding /></AuthProvider>);
    expect(await screen.findByText(text.title)).toBeTruthy();
    expect(screen.getByText(text.question)).toBeTruthy();
    expect(screen.getByText(text.signOut)).toBeTruthy();

    await fireEvent.press(screen.getByText(text.start));
    expect(await screen.findByText(text.badName)).toBeTruthy();
  });
});

describe.each(languages)('profile error in %s', (language) => {
  const text = {
    en: { title: 'We couldn’t load your profile', retry: 'Try again' },
    bg: { title: 'Не успяхме да заредем профила ти', retry: 'Опитай пак' },
  }[language];

  it('shows its text', async () => {
    await renderIn(language, <AuthProvider><ProfileError /></AuthProvider>);
    expect(await screen.findByText(text.title)).toBeTruthy();
    expect(screen.getByText(text.retry)).toBeTruthy();
  });
});

describe.each(languages)('tabs and profile in %s', (language) => {
  const text = {
    en: { home: 'Home', library: 'Library', profile: 'Profile', language: 'Language', welcome: 'Authors are welcome here', signOut: 'Sign out' },
    bg: { home: 'Начало', library: 'Библиотека', profile: 'Профил', language: 'Език', welcome: 'Авторите са добре дошли тук', signOut: 'Изход' },
  }[language];

  async function renderTabs() {
    await signInAs(reader);
    await renderRouter(
      {
        '(tabs)/_layout': TabsLayout,
        '(tabs)/index': () => <Text>home screen</Text>,
        '(tabs)/library': () => <Text>library screen</Text>,
        '(tabs)/profile': () => (
          <AuthProvider>
            <Profile />
          </AuthProvider>
        ),
      },
      { initialUrl: '/profile', wrapper: await languageWrapper(language) },
    );
  }

  it('labels the tabs', async () => {
    await renderTabs();
    expect(await screen.findByLabelText(text.home)).toBeTruthy();
    expect(screen.getByLabelText(text.library)).toBeTruthy();
    expect(screen.getByLabelText(text.profile)).toBeTruthy();
  });

  it('shows the profile in this language', async () => {
    await renderTabs();
    expect(await screen.findByText(text.welcome)).toBeTruthy();
    expect(screen.getByText(text.language)).toBeTruthy();
    expect(screen.getByText(text.signOut)).toBeTruthy();
  });
});

test('the language chips switch the whole screen', async () => {
  await signInAs(reader);
  await renderIn('en', <AuthProvider><Profile /></AuthProvider>);
  expect(await screen.findByText('Language')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'English' }).props.accessibilityState).toMatchObject({ selected: true });

  await fireEvent.press(screen.getByRole('button', { name: 'Български' }));
  await waitFor(() => expect(screen.getByText('Език')).toBeTruthy());
  expect(screen.getByText('Изход')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Български' }).props.accessibilityState).toMatchObject({ selected: true });
});
