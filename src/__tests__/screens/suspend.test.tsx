import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import Home from '../../../app/(tabs)/index';
import Moderation from '../../../app/moderation';
import Notifications from '../../../app/notifications';
import RoomScreen from '../../../app/room/[storyId]/[room]';
import { setAdmin, sql } from '../../../test/database';
import { renderScreen } from '../../../test/router';
import { openRoom, postComment } from '../../lib/discussions';
import { reportComment, reportUser } from '../../lib/safety';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Suspending a reader (docs/DECISIONS.md, "Suspending a reader"): the reader's banner and notices, the
// room telling them why they can't post or react, and the admin's Suspend / Lift on the Moderation
// screen. Real readers on local Supabase.
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

const suspended = (u: User) => sql(`select is_suspended from public.profiles where id = '${u.id}';`).trim() === 't';

async function suspend(u: User, reason: string | null, on: boolean) {
  await as(admin);
  const { error } = await supabase.rpc('set_reader_suspended', { p_user: u.id, p_suspended: on, p_reason: reason });
  if (error) throw error;
}

const BODY = 'You can still read, but you can’t post, react or report until this is lifted. Write to support@livami.app if you think this is a mistake.';

let admin: User;
let banned: User;
let fine: User;
let troll: User;
let admin2: User;
let flip: User;
let storyId: string;
let commentId: string;
let reportId: string;
let selfReportId: string;
let adminReportId: string;
let flipReportId: string;

const openReport = (userId: string) =>
  sql(`select id from public.reports where reported_user_id = '${userId}' and status = 'open' limit 1;`).trim();

beforeAll(async () => {
  admin = await signUp('susadmin');
  banned = await signUp('susbanned');
  fine = await signUp('susfine');
  troll = await signUp('sustroll');
  admin2 = await signUp('susadmin2');
  flip = await signUp('susflip');
  setAdmin(admin.id, true);
  setAdmin(admin2.id, true);

  await as(fine);
  storyId = (await createManualBook({ title: 'Suspense Novel', author: 'x', chapters: 3, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  const room = (await openRoom(storyId, 'chapter', 1)).id;
  commentId = (await postComment(room, 'A fine comment')).id;

  await as(troll);
  await addToLibrary(storyId, 'finished');
  const trollComment = (await postComment(room, 'Spoilers everywhere')).id;
  await as(fine);
  await reportComment(trollComment, 'spoiler', 'Ruins chapter 3');
  reportId = sql(`select id from public.reports where comment_id = '${trollComment}' and status = 'open' limit 1;`).trim();
  await reportUser(admin.id, 'harassment', 'About the admin who reads this');
  await reportUser(admin2.id, 'harassment', 'About another admin');
  await reportUser(flip.id, 'spam', 'Suspended here, lifted elsewhere');
  selfReportId = openReport(admin.id);
  adminReportId = openReport(admin2.id);
  flipReportId = openReport(flip.id);

  await as(banned);
  await addToLibrary(storyId, 'finished');
  await suspend(banned, 'Repeated spoilers in chapter rooms', true);
});

afterAll(async () => {
  await supabase.auth.signOut();
});

describe('a suspended reader', () => {
  beforeEach(async () => {
    await as(banned);
  });

  it('sees a banner on Home with the reason', async () => {
    await renderScreen('en', { index: Home }, '/');
    const banner = await screen.findByTestId('suspension-banner', {}, { timeout: 8000 });
    expect(within(banner).getByText('Your account is suspended')).toBeOnTheScreen();
    expect(within(banner).getByText('Reason: Repeated spoilers in chapter rooms')).toBeOnTheScreen();
    expect(within(banner).getByText(BODY)).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await renderScreen('bg', { index: Home }, '/');
    const banner = await screen.findByTestId('suspension-banner', {}, { timeout: 8000 });
    expect(within(banner).getByText('Профилът ти е спрян')).toBeOnTheScreen();
    expect(within(banner).getByText('Причина: Repeated spoilers in chapter rooms')).toBeOnTheScreen();
  });

  it('gets a notification with the reason', async () => {
    await renderScreen('en', { notifications: Notifications }, '/notifications');
    expect(await screen.findByText('Your account is suspended', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Reason: Repeated spoilers in chapter rooms')).toBeOnTheScreen();
  });

  it('still reads the room, and is told why they cannot post or react', async () => {
    await renderScreen('en', { 'room/[storyId]/[room]': RoomScreen }, `/room/${storyId}/1`);
    expect(await screen.findByText('A fine comment', {}, { timeout: 8000 })).toBeOnTheScreen();
    // The suspension is looked up alongside the comments; once known, the comment box gives way to why.
    expect(await screen.findByText('Your account is suspended, so you can’t post or react until this is lifted.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Add to the discussion')).toBeNull();

    await fireEvent.press(screen.getByLabelText(`React 🔥 to comment ${commentId}`));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account is suspended, so you can’t post or react until this is lifted.');
    expect(sql(`select count(*) from public.reactions where comment_id = '${commentId}';`).trim()).toBe('0');
  });
});

describe('a reader in good standing', () => {
  it('sees no banner, and gets a notice when a suspension is lifted', async () => {
    await suspend(fine, 'Testing', true);
    await suspend(fine, null, false);
    await as(fine);
    await renderScreen('en', { index: Home, notifications: Notifications }, '/notifications');
    expect(await screen.findByText('Your account is active again', {}, { timeout: 8000 })).toBeOnTheScreen();
    await renderScreen('en', { index: Home }, '/');
    expect(await screen.findByText(`Hi, ${fine.username}`, {}, { timeout: 8000 })).toBeOnTheScreen();
    // The banner's lookup has had time to answer (the same round trip as the replies list below it).
    await waitFor(() => expect(screen.queryByText('Could not load your notifications. Try again in a moment.')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(screen.queryByTestId('suspension-banner')).toBeNull();
  });
});

describe('an admin on the Moderation screen', () => {
  beforeEach(async () => {
    await as(admin);
  });

  it('suspends the author of a reported comment, with a reason', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const card = await screen.findByTestId(`queue-comment_report-${reportId}`, {}, { timeout: 8000 });
    await fireEvent.press(within(card).getByRole('button', { name: /^Suspend the reader/ }));
    const confirm = within(card).getByRole('button', { name: 'Suspend' });
    expect(confirm).toBeDisabled(); // no reason yet
    await fireEvent.changeText(within(card).getByLabelText('Reason (the reader sees this)'), 'Spoilers in every room');
    await fireEvent.press(confirm);
    expect(await within(card).findByText(`${troll.username} is suspended`)).toBeOnTheScreen();
    expect(suspended(troll)).toBe(true);
    expect(sql(`select reason from public.suspensions where user_id = '${troll.id}' order by created_at desc limit 1;`).trim()).toBe('Spoilers in every room');
  });

  it('lifts the suspension', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const card = await screen.findByTestId(`queue-comment_report-${reportId}`, {}, { timeout: 8000 });
    await fireEvent.press(await within(card).findByRole('button', { name: /^Lift the suspension/ }));
    expect(await within(card).findByRole('button', { name: /^Suspend the reader/ })).toBeOnTheScreen();
    expect(suspended(troll)).toBe(false);
  });

  it('does not offer to suspend themselves', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const card = await screen.findByTestId(`queue-user_report-${selfReportId}`, {}, { timeout: 8000 });
    expect(within(card).getByRole('button', { name: /^Dismiss/ })).toBeOnTheScreen();
    expect(within(card).queryByRole('button', { name: /^Suspend the reader/ })).toBeNull();
  });

  it('is told that an admin cannot be suspended', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const card = await screen.findByTestId(`queue-user_report-${adminReportId}`, {}, { timeout: 8000 });
    await fireEvent.press(within(card).getByRole('button', { name: /^Suspend the reader/ }));
    await fireEvent.changeText(within(card).getByLabelText('Reason (the reader sees this)'), 'Power struggle');
    await fireEvent.press(within(card).getByRole('button', { name: 'Suspend' }));
    expect(await within(card).findByText('Admins can’t be suspended, and you can’t suspend yourself.')).toBeOnTheScreen();
    expect(suspended(admin2)).toBe(false);
  });

  it('in Bulgarian', async () => {
    await renderScreen('bg', { moderation: Moderation }, '/moderation');
    const card = await screen.findByTestId(`queue-user_report-${adminReportId}`, {}, { timeout: 8000 });
    await fireEvent.press(within(card).getByRole('button', { name: /^Спри читателя/ }));
    await fireEvent.changeText(within(card).getByLabelText('Причина (читателят я вижда)'), 'Power struggle');
    await fireEvent.press(within(card).getByRole('button', { name: 'Спри' }));
    expect(await within(card).findByText('Администратор не може да бъде спрян, а себе си не можеш да спреш.')).toBeOnTheScreen();
  });

  it('is told when the reason is too long', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const card = await screen.findByTestId(`queue-user_report-${flipReportId}`, {}, { timeout: 8000 });
    await fireEvent.press(within(card).getByRole('button', { name: /^Suspend the reader/ }));
    await fireEvent.changeText(within(card).getByLabelText('Reason (the reader sees this)'), 'x'.repeat(501));
    await fireEvent.press(within(card).getByRole('button', { name: 'Suspend' }));
    expect(await within(card).findByText('The reason is too long: 500 characters at most.')).toBeOnTheScreen();
    expect(suspended(flip)).toBe(false);
  });

  it('sees what the server says after a reload, not what this card last did', async () => {
    const feedbackId = sql(
      `insert into public.feedback (user_id, kind, body) values ('${fine.id}', 'idea', 'Reload trigger ${run}') returning id;`,
    ).split('\n')[0];
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const card = await screen.findByTestId(`queue-user_report-${flipReportId}`, {}, { timeout: 8000 });
    await fireEvent.press(within(card).getByRole('button', { name: /^Suspend the reader/ }));
    await fireEvent.changeText(within(card).getByLabelText('Reason (the reader sees this)'), 'Spam');
    await fireEvent.press(within(card).getByRole('button', { name: 'Suspend' }));
    expect(await within(card).findByText(`${flip.username} is suspended`, {}, { timeout: 8000 })).toBeOnTheScreen();
    // Another admin lets them back in (without signing this one out); this screen hears of it on its next reload.
    sql(`update public.profiles set is_suspended = false where id = '${flip.id}';`);
    const other = await screen.findByTestId(`queue-feedback-${feedbackId}`);
    await fireEvent.press(within(other).getByRole('button', { name: /^Dismiss/ }));
    expect(await within(card).findByRole('button', { name: /^Suspend the reader/ }, { timeout: 8000 })).toBeOnTheScreen();
    expect(within(card).queryByText(`${flip.username} is suspended`)).toBeNull();
  });
});
