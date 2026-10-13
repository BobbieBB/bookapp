import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from './supabase';
import type { LibraryEntry, LibraryStatus } from './types';

const SELECT = `
  story_id, status, is_favourite, progress_section, progress_page, updated_at,
  story:stories (
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
    if (!userId) return;
    setLoading(true);
    // Filter by user: other readers' public entries are readable too (for counts and profiles).
    let query = supabase.from('library_entries').select(SELECT).eq('user_id', userId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('updated_at', { ascending: false });
    setError(error ? error.message : '');
    setEntries((data as unknown as LibraryEntry[]) ?? []);
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

export function progressLine(entry: LibraryEntry) {
  const total = sectionTotal(entry);
  const unit = entry.story.has_chapters ? 'chapter' : 'part';
  if (entry.status === 'finished') return 'Finished';
  if (entry.progress_section === 0) return 'Not started';
  return `Finished ${unit} ${entry.progress_section}${total ? ` of ${total}` : ''}`;
}
