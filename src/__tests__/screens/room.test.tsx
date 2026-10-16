import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactElement } from 'react';

import RoomScreen from '../../../app/room/[storyId]/[room]';
import { languageWrapper } from '../../../test/i18n';
import { openRoom, postComment } from '../../lib/discussions';
import type { Language } from '../../i18n';
import { AuthProvider } from '../../lib/auth';
import { addToLibrary, createManualBook } from '../../lib/stories';
import { supabase } from '../../lib/supabase';

// A Chapter Discussion / The Epilogue screen (docs/DECISIONS.md: Spoiler Safe Mode, Visual design,
// naming). Route: /room/<storyId>/<chapter number | "epilogue">. Real readers on local Supabase.
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

let writer: User; // finished the book, wrote the comments
let reader: User; // finished chapter 2
let storyId: string;

beforeAll(async () => {
  writer = await signUp('writer');
  reader = await signUp('reader');
  await as(writer);
  storyId = (await createManualBook({ title: 'Room Book', author: 'x', chapters: 3, language: 'en' })).id;
  await addToLibrary(storyId, 'finished');
  const ch2 = (await openRoom(storyId, 'chapter', 2)).id;
  const top = await postComment(ch2, 'That ending of chapter 2!');
  for (const n of [1, 2, 3]) await postComment(ch2, `reply ${n}`, top.id);
  const ch3 = (await openRoom(storyId, 'chapter', 3)).id;
  await postComment(ch3, 'CHAPTER 3 SPOILER');

  await as(reader);
  await addToLibrary(storyId, 'currently_reading');
  await supabase.from('library_entries').update({ progress_section: 2 }).eq('story_id', storyId).eq('user_id', reader.id).throwOnError();
});

async function open(language: Language, room: string) {
  const InLanguage = await languageWrapper(language);
  await renderRouter(
    { 'room/[storyId]/[room]': RoomScreen },
    {
      initialUrl: `/room/${storyId}/${room}`,
      wrapper: ({ children }: { children: ReactElement }) => (
        <InLanguage>
          <AuthProvider>{children}</AuthProvider>
        </InLanguage>
      ),
    },
  );
  await screen.findByTestId('room-title', {}, { timeout: 8000 });
}

describe('a chapter you finished', () => {
  it('shows the discussion, with long threads collapsed to the last 2 replies', async () => {
    await open('en', '2');
    expect(screen.getByTestId('room-title')).toHaveTextContent('Chapter 2');
    expect(await screen.findByText('That ending of chapter 2!', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(screen.getAllByText(writer.username).length).toBeGreaterThan(0);
    expect(screen.queryByText('reply 1')).toBeNull();
    expect(screen.getByText('reply 3')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('View 1 earlier reply'));
    expect(screen.getByText('reply 1')).toBeOnTheScreen();
  });

  it('you can post a comment and reply to one', async () => {
    await open('en', '2');
    await screen.findByText('That ending of chapter 2!', {}, { timeout: 8000 });
    await fireEvent.changeText(screen.getByLabelText('Add to the discussion'), 'My first thought');
    await fireEvent.press(screen.getByText('Post'));
    expect(await screen.findByText('My first thought', {}, { timeout: 8000 })).toBeOnTheScreen();

    const thread = screen.getByTestId(`thread-${(await firstCommentId('That ending of chapter 2!'))}`);
    await fireEvent.press(within(thread).getAllByText('Reply')[0]);
    await fireEvent.changeText(screen.getByLabelText('Add to the discussion'), 'A reply from me');
    await fireEvent.press(screen.getByText('Post'));
    expect(await within(thread).findByText('A reply from me', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('you can react to a comment', async () => {
    await open('en', '2');
    const id = await firstCommentId('That ending of chapter 2!');
    await fireEvent.press(screen.getByLabelText(`React 🔥 to comment ${id}`));
    expect(await within(screen.getByTestId(`reactions-${id}`)).findByText('🔥 1', {}, { timeout: 8000 })).toBeOnTheScreen();
  });

  it('offers the next chapter as a small pill, never the main button', async () => {
    await open('en', '2');
    expect(screen.getByText('I finished chapter 3')).toBeOnTheScreen();
  });

  it('in Bulgarian', async () => {
    await open('bg', '2');
    expect(screen.getByTestId('room-title')).toHaveTextContent('Глава 2');
    expect(screen.getByText('Прочетох глава 3')).toBeOnTheScreen();
  });
});

describe('the spoiler wall', () => {
  it('a chapter you have not finished stays closed, even by direct link', async () => {
    await open('en', '3');
    expect(screen.getByText('Finish chapter 3 to join this discussion.')).toBeOnTheScreen();
    expect(screen.queryByText('CHAPTER 3 SPOILER')).toBeNull();
    expect(screen.queryByLabelText('Add to the discussion')).toBeNull();
  });

  it('The Epilogue opens only when you finish the story', async () => {
    await open('en', 'epilogue');
    expect(screen.getByTestId('room-title')).toHaveTextContent('The Epilogue');
    expect(screen.getByText('The whole story, spoilers and all. Opens when you finish.')).toBeOnTheScreen();
    expect(screen.getByText('Finish the story to join The Epilogue.')).toBeOnTheScreen();
  });
});

async function firstCommentId(body: string) {
  const { data } = await supabase.from('comments').select('id').eq('body', body).single().throwOnError();
  return data!.id as string;
}
