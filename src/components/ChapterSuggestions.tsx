// "Suggested: 22 chapters" under a chapter-count field (src/lib/chapterSuggestions.ts). Tapping one fills the field;
// the reader still checks it against their own copy.
import { View } from 'react-native';

import { Chip, T } from '@/components/ui';
import { useT } from '@/i18n';
import { suggestChapterCounts, type BookForSuggestions } from '@/lib/chapterSuggestions';
import { useLookup } from '@/lib/useLookup';
import { space } from '@/theme';

export function ChapterSuggestions({ book, onPick }: { book: BookForSuggestions | null; onPick: (count: number) => void }) {
  const t = useT();
  const ready = book && book.title.trim().length >= 2 && book.author.trim().length >= 2;
  const key = ready ? `chapters:${book.olWork ?? ''}|${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}` : null;
  const found = useLookup(key, () => suggestChapterCounts(book!), 600);
  const suggestions = key ? (found.data ?? []) : [];
  if (!suggestions.length) return null;
  return (
    <View style={{ gap: space.xs }}>
      <T v="muted">{t('chapters.suggested')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {suggestions.map((s) => (
          <Chip key={s.from} label={t(s.from === 'livami' ? 'chapters.fromLivami' : 'chapters.fromOpenLibrary', { count: s.count })} active={false} onPress={() => onPick(s.count)} />
        ))}
      </View>
      <T v="muted" style={{ fontSize: 13 }}>{t('chapters.check')}</T>
    </View>
  );
}
