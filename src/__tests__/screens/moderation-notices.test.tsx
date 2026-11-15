import { screen } from '@testing-library/react-native';

import Home from '../../../app/(tabs)/index';
import Notifications from '../../../app/notifications';
import { setAdmin } from '../../../test/database';
import { renderScreen } from '../../../test/router';
import { openRoom, postComment } from '../../lib/discussions';
import { resolve } from '../../lib/moderation';
import { reportComment, reportUser } from '../../lib/safety';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// Moderation notices (docs/DECISIONS.md, Moderation notices; EU DSA arts. 16(5) and 17): the author of
// hidden content is told why, and each reporter what was decided. Never who reported, never the comment
// text. Real readers on local Supabase.
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

const title = `Notice Book ${run}`;
let admin: User;
let author: User;
let reporter: User;

beforeAll(async () => {
  admin = await signUp('ntadmin');
  author = await signUp('ntauthor');
  reporter = await signUp('ntreporter');
  setAdmin(admin.id, true);

  await as(author);
  const storyId = (await createManualBook({ title, author: 'x', chapters: 3, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  const room = (await openRoom(storyId, 'chapter', 2)).id;
  const comment = await postComment(room, 'Something rude here');

  await as(reporter);
  await addToLibrary(storyId, 'finished');
  await reportComment(comment.id, 'harassment');
  await reportUser(author.id, 'spam');
  const { data: reports } = await supabase.from('reports').select('id, comment_id').eq('reporter_id', reporter.id).throwOnError();
  const commentReport = reports?.find((r) => r.comment_id)?.id;
  const userReport = reports?.find((r) => !r.comment_id)?.id;
  if (!commentReport || !userReport) throw new Error('reports were not filed');

  await as(admin);
  await resolve('comment_report', commentReport, 'hide');
  await resolve('user_report', userReport, 'dismiss');
});

describe('Moderation notices', () => {
  it('the author is told their comment was hidden, why, and how to appeal; never who reported', async () => {
    await as(author);
    await renderScreen('en', { notifications: Notifications }, '/notifications');
    expect(
      await screen.findByText(
        `Your comment in ${title} was hidden: harassment. If you think this is a mistake, write to support@livami.app and we’ll look again.`,
        {},
        { timeout: 8000 },
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Chapter 2')).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(reporter.username))).toBeNull();
    expect(screen.queryByText('Something rude here')).toBeNull();
  });

  it('the reporter is told what was decided on each report, never naming the other reader', async () => {
    await as(reporter);
    await renderScreen('en', { notifications: Notifications }, '/notifications');
    expect(await screen.findByText(`We reviewed your report about a comment in ${title}: we hid it.`, {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('We reviewed your report about a reader: we didn’t remove it.')).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(author.username))).toBeNull();
  });

  it('an unread notice shows on Home too', async () => {
    await as(reporter);
    await supabase.from('notifications').update({ read_at: null }).eq('user_id', reporter.id).throwOnError();
    await renderScreen('en', { index: Home }, '/');
    expect(await screen.findByText(`We reviewed your report about a comment in ${title}: we hid it.`, {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await as(author);
    await renderScreen('bg', { notifications: Notifications }, '/notifications');
    expect(
      await screen.findByText(
        `Твоят коментар в ${title} беше скрит: тормоз. Ако смяташ, че е грешка, пиши ни на support@livami.app и ще го прегледаме отново.`,
        {},
        { timeout: 8000 },
      ),
    ).toBeOnTheScreen();
    await as(reporter);
    await renderScreen('bg', { notifications: Notifications }, '/notifications');
    expect(await screen.findByText(`Прегледахме доклада ти за коментар в ${title}: скрихме го.`, {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getByText('Прегледахме доклада ти за читател: не го премахнахме.')).toBeOnTheScreen();
  });
});
