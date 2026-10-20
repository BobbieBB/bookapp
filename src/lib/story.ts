// Reading progress on a story page (docs/DECISIONS.md, "Reading progress", "Who can change a WIP
// fic's chapters or finish it"). Chapters unlock discussions; pages are personal and unlock nothing.
// The database enforces every rule here (library_entry_normalise, bump_published_sections,
// complete_story, reopen_story); these helpers only decide which buttons to show.
import { supabase } from './supabase';
import type { LibraryEntry, LibraryStatus, Story } from './types';

export type ProgressStory = Pick<
  Story,
  'kind' | 'status' | 'has_chapters' | 'published_sections' | 'total_sections' | 'page_count'
> & { completed_at: string | null };

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const isWip = (s: Pick<ProgressStory, 'kind' | 'status'>) => s.kind === 'fanfic' && s.status === 'ongoing';

/** Chapters that exist for everyone right now (a WIP fic's published count, else the total). */
export function chapterCount(s: ProgressStory): number | null {
  return s.published_sections ?? s.total_sections ?? null;
}

/**
 * The chapter "I finished chapter N" offers after `progress`, or null when there is none. On a WIP
 * fic a reader who is caught up can report the next chapter as newly published (at most one past
 * their progress, as the database allows).
 */
export function nextChapter(s: ProgressStory, progress: number): { chapter: number; newlyPublished: boolean } | null {
  if (!s.has_chapters) return null;
  const chapter = progress + 1;
  // On a WIP fic only the published chapters exist yet (as bump_published_sections counts them).
  const count = (isWip(s) ? s.published_sections : chapterCount(s)) ?? 0;
  if (chapter <= count) return { chapter, newlyPublished: false };
  const beyondTotal = s.total_sections !== null && chapter > s.total_sections;
  return isWip(s) && !beyondTotal ? { chapter, newlyPublished: true } : null;
}

/** Personal page progress as a whole percentage, or null when it can't be known. */
export function pagePercent(page: number | null, pageCount: number | null): number | null {
  if (page === null || !pageCount) return null;
  return Math.min(100, Math.max(0, Math.round((page / pageCount) * 100)));
}

const caughtUp = (s: ProgressStory, progress: number) => progress >= (s.published_sections ?? 0);

/** Only a reader who has read every published chapter can mark a WIP fic complete. */
export function canComplete(s: ProgressStory, progress: number): boolean {
  return isWip(s) && s.published_sections !== null && caughtUp(s, progress);
}

/** A caught-up reader can undo a completion within 7 days, if no chapters were added since. */
export function canReopen(s: ProgressStory, progress: number, now: Date = new Date()): boolean {
  if (s.kind !== 'fanfic' || s.status !== 'completed' || !s.completed_at) return false;
  if (s.total_sections !== s.published_sections) return false;
  if (now.getTime() - new Date(s.completed_at).getTime() >= REOPEN_WINDOW_MS) return false;
  return caughtUp(s, progress);
}

// ---------------------------------------------------------------------------
// Loading and saving
// ---------------------------------------------------------------------------

export type StoryDetails = Story &
  ProgressStory & {
    language: 'en' | 'bg' | null;
    cover_url: string | null;
    content_rating: string | null;
    warnings: string[];
  };

export type MyEntry = Pick<LibraryEntry, 'status' | 'is_favourite' | 'progress_section' | 'progress_page'>;

const DETAILS =
  'id, kind, title, author_name, fandoms, ships, has_chapters, published_sections, total_sections, page_count, ' +
  'status, source_url, language, cover_url, content_rating, warnings, completed_at';

/** The story and the signed-in reader's library entry for it (null if it isn't in their library). */
export async function loadStoryPage(storyId: string, userId: string): Promise<{ story: StoryDetails; entry: MyEntry | null }> {
  const [story, entry] = await Promise.all([
    supabase.from('stories').select(DETAILS).eq('id', storyId).single(),
    supabase
      .from('library_entries')
      .select('status, is_favourite, progress_section, progress_page')
      .eq('story_id', storyId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (story.error) throw story.error;
  if (entry.error) throw entry.error;
  return { story: story.data as unknown as StoryDetails, entry: entry.data as MyEntry | null };
}

async function updateEntry(storyId: string, userId: string, fields: Partial<MyEntry>) {
  const { data, error } = await supabase
    .from('library_entries')
    .update(fields)
    .eq('story_id', storyId)
    .eq('user_id', userId)
    .select('story_id');
  if (error) throw error;
  if (!data.length) throw new Error('This story is not in your library.');
}

/**
 * "I finished chapter N". A newly published WIP chapter is reported first (the database allows
 * at most one past the reader's progress), then progress moves to it.
 */
export async function finishChapter(storyId: string, userId: string, next: { chapter: number; newlyPublished: boolean }) {
  if (next.newlyPublished) {
    const { error } = await supabase.rpc('bump_published_sections', { p_story: storyId, p_count: next.chapter });
    if (error) throw error;
  }
  await updateEntry(storyId, userId, { progress_section: next.chapter });
}

/** The chapter picker: the last fully finished chapter. Moving back locks later chapters again. */
export const setChapter = (storyId: string, userId: string, chapter: number) =>
  updateEntry(storyId, userId, { progress_section: chapter });

/** "I'm on page 143": personal only, it never unlocks a discussion. */
export const setPage = (storyId: string, userId: string, page: number | null) =>
  updateEntry(storyId, userId, { progress_page: page });

export const setStatus = (storyId: string, userId: string, status: LibraryStatus) =>
  updateEntry(storyId, userId, { status });

/**
 * The fields "Finished" saves. On a WIP fic it also means "I've read every published chapter", so
 * progress moves to the last published one: otherwise its chapter discussions stayed locked (rule 7
 * opens a WIP chapter only once it is read) and the reader couldn't mark it complete.
 */
type FinishableStory = Pick<ProgressStory, 'kind' | 'status' | 'published_sections'>;

export function finishedFields(story: FinishableStory): Partial<MyEntry> {
  return isWip(story) && story.published_sections
    ? { status: 'finished', progress_section: story.published_sections }
    : { status: 'finished' };
}

export const finishStory = (story: FinishableStory & { id: string }, userId: string) =>
  updateEntry(story.id, userId, finishedFields(story));

/** A caught-up reader marks a WIP fic complete; its count becomes the published chapters. */
export async function markComplete(storyId: string) {
  const { error } = await supabase.rpc('complete_story', { p_story: storyId });
  if (error) throw error;
}

/** The first reader who has a book without a chapter count sets it (once). */
export async function setBookChapterCount(storyId: string, count: number) {
  const { error } = await supabase.rpc('set_book_chapter_count', { p_story: storyId, p_count: count });
  if (error) throw error;
}

/** Undo a completion (within 7 days, caught-up readers only). */
export async function reopen(storyId: string) {
  const { error } = await supabase.rpc('reopen_story', { p_story: storyId });
  if (error) throw error;
}
