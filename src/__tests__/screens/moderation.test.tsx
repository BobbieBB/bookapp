import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import Profile from '../../../app/(tabs)/profile';
import Moderation from '../../../app/moderation';
import { ModerationQueue } from '../../components/ModerationQueue';
import { setAdmin, sql } from '../../../test/database';
import { renderIn } from '../../../test/i18n';
import { renderScreen } from '../../../test/router';
import { openRoom, postComment } from '../../lib/discussions';
import { requestChapterCount } from '../../lib/moderation';
import { reportComment, sendFeedback } from '../../lib/safety';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Profile > Moderation (docs/DECISIONS.md, "Moderation in v1"): the open reports and requests,
// for admins only. Real readers on local Supabase. The queue is shared with every other test file,
// so each test looks for its own items by id.
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

let admin: User;
let reader: User;
let troll: User;
let storyId: string;
let hideCommentId: string;
let dismissCommentId: string;
let hideReportId: string;
let dismissReportId: string;
let countRequestId: string;
let feedbackId: string;

const openId = (table: string, column: string, value: string) =>
  sql(`select id from public.${table} where ${column} = '${value}' and status = 'open' limit 1;`).trim();

beforeAll(async () => {
  admin = await signUp('modadmin');
  reader = await signUp('modreader');
  troll = await signUp('modtroll');
  setAdmin(admin.id, true);

  await as(troll);
  storyId = (await createManualBook({ title: 'Moderated Book', author: 'x', chapters: 4, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  const room = (await openRoom(storyId, 'chapter', 1)).id;
  hideCommentId = (await postComment(room, 'This comment is rude')).id;
  dismissCommentId = (await postComment(room, 'This comment is fine')).id;

  await as(reader);
  await addToLibrary(storyId, 'finished');
  await reportComment(hideCommentId, 'harassment', 'Insults everyone in the thread');
  await reportComment(dismissCommentId, 'spam');
  await requestChapterCount(storyId, 12);
  await sendFeedback('idea', 'Please add dark mode');
  hideReportId = openId('reports', 'comment_id', hideCommentId);
  dismissReportId = openId('reports', 'comment_id', dismissCommentId);
  countRequestId = openId('chapter_count_requests', 'story_id', storyId);
  feedbackId = openId('feedback', 'user_id', reader.id);
});

afterAll(async () => {
  await supabase.auth.signOut();
});

const card = (kind: string, id: string) => screen.findByTestId(`queue-${kind}-${id}`, {}, { timeout: 8000 });

describe('as an admin', () => {
  beforeAll(async () => {
    await as(admin);
  });

  it('Profile links to the moderation queue', async () => {
    await renderScreen('en', { profile: Profile, moderation: Moderation }, '/profile');
    await fireEvent.press(await screen.findByRole('button', { name: 'Moderation' }, { timeout: 8000 }));
    expect(await card('comment_report', hideReportId)).toBeOnTheScreen();
  });

  it('shows a reported comment with what a moderator needs', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const item = await card('comment_report', hideReportId);
    expect(within(item).getByText('Reported comment')).toBeOnTheScreen();
    expect(within(item).getByText('Moderated Book')).toBeOnTheScreen();
    expect(within(item).getByText(troll.username)).toBeOnTheScreen();
    expect(within(item).getByText('This comment is rude')).toBeOnTheScreen();
    expect(within(item).getByText('Harassment')).toBeOnTheScreen();
    expect(within(item).getByText('Insults everyone in the thread')).toBeOnTheScreen();
    expect(within(item).getByRole('button', { name: 'Hide the comment' })).toBeOnTheScreen();
    expect(within(item).getByRole('button', { name: 'Dismiss' })).toBeOnTheScreen();
    expect(within(item).queryByText(/reports$/)).toBeNull(); // one report: no count
  });

  it('shows the chapter count change and the feedback', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const count = await card('chapter_count', countRequestId);
    expect(within(count).getByText('Chapter count')).toBeOnTheScreen();
    expect(within(count).getByText('4 → 12 chapters')).toBeOnTheScreen();
    expect(within(count).getByText(reader.username)).toBeOnTheScreen();
    expect(within(count).getByRole('button', { name: 'Accept the new count' })).toBeOnTheScreen();
    const feedback = await card('feedback', feedbackId);
    expect(within(feedback).getByText('Please add dark mode')).toBeOnTheScreen();
    expect(within(feedback).getByText('Idea')).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await renderScreen('bg', { moderation: Moderation }, '/moderation');
    const item = await card('comment_report', hideReportId);
    expect(within(item).getByText('Докладван коментар')).toBeOnTheScreen();
    expect(within(item).getByText('Тормоз')).toBeOnTheScreen();
    expect(within(item).getByRole('button', { name: 'Скрий коментара' })).toBeOnTheScreen();
    expect(within(item).getByRole('button', { name: 'Отхвърли' })).toBeOnTheScreen();
    expect(within(await card('chapter_count', countRequestId)).getByText('4 → 12 глави')).toBeOnTheScreen();
  });

  it('Hide takes the report off the list and hides the comment', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const item = await card('comment_report', hideReportId);
    await fireEvent.press(within(item).getByRole('button', { name: 'Hide the comment' }));
    await waitFor(() => expect(screen.queryByTestId(`queue-comment_report-${hideReportId}`)).toBeNull(), { timeout: 8000 });
    expect(sql(`select is_hidden from public.comments where id = '${hideCommentId}';`).trim()).toBe('t');
    expect(screen.getByTestId(`queue-comment_report-${dismissReportId}`)).toBeOnTheScreen(); // the others stay
  });

  it('Dismiss takes an item off the list and leaves the comment alone', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const item = await card('comment_report', dismissReportId);
    await fireEvent.press(within(item).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByTestId(`queue-comment_report-${dismissReportId}`)).toBeNull(), { timeout: 8000 });
    expect(sql(`select is_hidden from public.comments where id = '${dismissCommentId}';`).trim()).toBe('f');
  });

  it('Accept sets the new chapter count and the item goes', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const item = await card('chapter_count', countRequestId);
    await fireEvent.press(within(item).getByRole('button', { name: 'Accept the new count' }));
    await waitFor(() => expect(screen.queryByTestId(`queue-chapter_count-${countRequestId}`)).toBeNull(), { timeout: 8000 });
    expect(sql(`select total_sections from public.stories where id = '${storyId}';`).trim()).toBe('12');
  });

  it('a failed action stays on the card with a reason', async () => {
    const link = `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 7}`;
    const requestId = sql(
      `insert into public.removal_requests (story_url, contact, message) values ('${link}', 'author@example.test', 'Please remove my fic') returning id;`,
    ).split('\n')[0];
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    const item = await card('removal_request', requestId);
    expect(within(item).getByText('author@example.test')).toBeOnTheScreen();
    expect(within(item).getByText(link)).toBeOnTheScreen();
    await fireEvent.press(within(item).getByRole('button', { name: 'Hide the fic' }));
    expect(await within(item).findByText(/No fic in the app matches this link/, {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByTestId(`queue-removal_request-${requestId}`)).toBeOnTheScreen();
  });
});

describe('as a reader who is not an admin', () => {
  beforeAll(async () => {
    await as(reader);
  });

  it('Profile has no Moderation link', async () => {
    await renderScreen('en', { profile: Profile }, '/profile');
    await screen.findByLabelText('Help us improve the app', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Moderation' })).toBeNull();
  });

  it('the screen itself refuses', async () => {
    await renderScreen('en', { moderation: Moderation }, '/moderation');
    expect(await screen.findByText('The moderation queue is only for the Livami team.', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.queryByTestId(/^queue-/)).toBeNull();
  });
});

// The queue is shared with every other test file running at the same time, so "nothing open" can't be
// produced in the database from here; the list is rendered with no items instead. That the database
// returns only open items is covered by supabase/tests/moderation.test.sql.
describe('an empty queue', () => {
  it.each([
    ['en', 'Nothing to moderate'],
    ['bg', 'Няма нищо за модериране'],
  ] as const)('says so in %s', async (language, text) => {
    await renderIn(language, <ModerationQueue items={[]} onResolved={() => undefined} />);
    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(screen.queryByTestId(/^queue-/)).toBeNull();
  });
});
