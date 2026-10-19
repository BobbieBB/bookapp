import { fireEvent, screen, within } from '@testing-library/react-native';

import Admin from '../../../app/admin';
import Profile from '../../../app/(tabs)/profile';
import { setAdmin, sql } from '../../../test/database';
import { renderScreen } from '../../../test/router';
import { fetchNumbers, type WeekNumbers } from '../../lib/admin';
import { supabase } from '../../lib/supabase';

// Profile > Numbers (docs/DECISIONS.md, "Analytics"): the PO's weekly numbers, for admins only.
const password = 'test-password-1234';
const run = Date.now().toString(36);
type User = { email: string; id: string };

async function signUp(name: string): Promise<User> {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  await supabase.from('profiles').insert({ id: data.user.id, username: `${name}_${run}` }).throwOnError();
  await supabase.auth.signOut();
  return { email, id: data.user.id };
}

async function as(u: User) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

let admin: User;
let reader: User;

beforeAll(async () => {
  admin = await signUp('numbers');
  reader = await signUp('notadmin');
  setAdmin(admin.id, true);
  // Two weeks back nothing else is recorded while the tests run, so the screen and the database agree.
  sql(`insert into public.analytics_events (user_id, name, props, created_at) values
    ('${reader.id}', 'sign_up', '{}', now() - interval '14 days'),
    ('${reader.id}', 'story_added', '{"kind": "book", "source": "manual", "language": "bg"}', now() - interval '14 days'),
    ('${admin.id}', 'room_opened', '{}', now() - interval '14 days');`);
});

afterAll(async () => {
  await supabase.auth.signOut();
});

const weekOf = (rows: WeekNumbers[], back: number) => rows[rows.length - 1 - back];

describe('as an admin', () => {
  let rows: WeekNumbers[];
  beforeAll(async () => {
    await as(admin);
    rows = await fetchNumbers(8);
  });

  it('Profile links to the numbers', async () => {
    await renderScreen('en', { profile: Profile, admin: Admin }, '/profile');
    await fireEvent.press(await screen.findByRole('button', { name: 'Numbers' }, { timeout: 8000 }));
    expect(await screen.findByText('Weekly active readers', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('shows each number for this week and the last 8 weeks', async () => {
    expect(rows).toHaveLength(8);
    const before = weekOf(rows, 2);
    expect(before.active).toBeGreaterThanOrEqual(2);
    expect(before.added_manual).toBeGreaterThanOrEqual(1);
    await renderScreen('en', { admin: Admin }, '/admin');
    const active = await screen.findByTestId('numbers-active', {}, { timeout: 8000 });
    expect(within(active).getByText('Weekly active readers')).toBeOnTheScreen();
    expect(within(active).getAllByTestId(/^week-/)).toHaveLength(8);
    expect(within(active).getByTestId(`value-${before.week}`)).toHaveTextContent(String(before.active));
    expect(within(screen.getByTestId('numbers-discussion')).getByTestId(`value-${before.week}`)).toHaveTextContent(
      String(before.discussion_readers),
    );
    expect(within(screen.getByTestId('numbers-sources')).getByTestId(`value-${before.week}`)).toHaveTextContent(
      `${before.added_search} · ${before.added_manual} · ${before.added_ao3}`,
    );
    expect(within(screen.getByTestId('numbers-languages')).getByTestId(`value-${before.week}`)).toHaveTextContent(
      `${before.added_bg} · ${before.added_en} · ${before.added_unknown}`,
    );
  });

  it('shows week-1 return as "x of y", and "not yet" while the week is still open', async () => {
    await renderScreen('en', { admin: Admin }, '/admin');
    const returned = await screen.findByTestId('numbers-returned', {}, { timeout: 8000 });
    const known = weekOf(rows, 3);
    expect(within(returned).getByTestId(`value-${known.week}`)).toHaveTextContent(`${known.returned_week1} of ${known.signed_up}`);
    expect(within(returned).getByTestId(`value-${weekOf(rows, 2).week}`)).toHaveTextContent('not yet');
    expect(within(returned).getByTestId(`value-${weekOf(rows, 0).week}`)).toHaveTextContent('not yet');
  });

  it('in Bulgarian', async () => {
    await renderScreen('bg', { admin: Admin }, '/admin');
    expect(await screen.findByText('Активни читатели за седмицата', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getAllByText('още не').length).toBeGreaterThan(0);
  });
});

describe('as a reader who is not an admin', () => {
  beforeAll(async () => {
    await as(reader);
  });

  it('Profile has no Numbers link', async () => {
    await renderScreen('en', { profile: Profile }, '/profile');
    await screen.findByLabelText('Help us improve the app', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Numbers' })).toBeNull();
  });

  it('the screen itself refuses, and so does the database', async () => {
    await expect(fetchNumbers(8)).rejects.toMatchObject({ code: '42501', message: 'only admins can see the numbers' });
    await renderScreen('en', { admin: Admin }, '/admin');
    expect(await screen.findByText('These numbers are only for the Livami team.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByTestId('numbers-active')).toBeNull();
  });
});
