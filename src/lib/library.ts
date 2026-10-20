import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import type { MessageKey } from '../i18n/en';
import type { Params } from '../i18n';
import { supabase } from './supabase';
import type { LibraryEntry, LibraryStatus } from './types';

const SELECT = `
  story_id, status, is_favourite, progress_section, progress_page, updated_at,
  story:stories!inner (
    id, kind, title, author_name, fandoms, ships, has_chapters,
    published_sections, total_sections, page_count, status, source_url
  )
`;

/** The signed-in user's own library, reloaded whenever the screen comes into focus. */
export function useMyLibrary(userId: string | undefined, status?: LibraryStatus) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Filter by user: other readers' public entries are readable too (for counts and profiles).
    // `!inner` drops entries whose story is hidden (author opt-out): the story row is
    // invisible to us then, and the entry would arrive with `story: null`.
    let query = supabase.from('library_entries').select(SELECT).eq('user_id', userId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('updated_at', { ascending: false });
    setError(error ? error.message : '');
    const rows = (data as unknown as LibraryEntry[] | null) ?? [];
    setEntries(rows.filter((e) => e.story)); // belt and braces
    setLoading(false);
  }, [userId, status]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { entries, loading, error, reload: load };
}

export function sectionTotal(entry: LibraryEntry) {
  const s = entry.story;
  if (!s.has_chapters && s.page_count) return Math.ceil(s.page_count / 25);
  return s.published_sections ?? s.total_sections ?? null;
}

/** Text for `key` in the UI language, as returned by `useT()`. */
export type Translate = (key: MessageKey, params?: Params) => string;

type StatusStory = Pick<LibraryEntry['story'], 'kind' | 'status'>;

/**
 * The word for a library status. On a WIP fic, "Finished" reads "Caught up": you've read every
 * chapter published so far, not the end of the story (PO, phone test 20 Oct 2026).
 */
export function statusKey(status: LibraryStatus, story: StatusStory): MessageKey {
  if (status === 'finished' && story.kind === 'fanfic' && story.status === 'ongoing') return 'library.status.caughtUp';
  return `library.status.${status}`;
}

export function progressLine(entry: LibraryEntry, t: Translate) {
  const total = sectionTotal(entry);
  const n = entry.progress_section;
  if (entry.status === 'finished' && entry.story.kind === 'fanfic' && entry.story.status === 'ongoing' && total) {
    return t('library.caughtUpOf', { n: Math.min(n, total), total });
  }
  if (entry.status === 'finished') return t('library.status.finished');
  if (n === 0) return t('library.notStarted');
  const unit = entry.story.has_chapters ? 'Chapter' : 'Part';
  return total ? t(`library.finished${unit}Of`, { n, total }) : t(`library.finished${unit}`, { n });
}
