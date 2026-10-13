import { StyleSheet, Text, View } from 'react-native';

import { progressLine, sectionTotal } from '@/lib/library';
import type { LibraryEntry } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/types';
import { colors, radius, space } from '@/theme';

export function StoryRow({ entry, showStatus }: { entry: LibraryEntry; showStatus?: boolean }) {
  const s = entry.story;
  const total = sectionTotal(entry);
  const pct =
    entry.status === 'finished' ? 100 : total ? Math.min(100, Math.round((entry.progress_section / total) * 100)) : 0;
  const subtitle =
    s.kind === 'fanfic'
      ? [s.author_name, s.fandoms[0], s.ships[0]].filter(Boolean).join(' · ')
      : s.author_name;

  return (
    <View style={styles.row}>
      <View style={[styles.cover, s.kind === 'fanfic' && { backgroundColor: colors.night }]}>
        <Text style={styles.coverText}>{initials(s.title)}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.title} numberOfLines={2}>
          {s.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={styles.progress}>
          {showStatus ? `${STATUS_LABEL[entry.status]} · ` : ''}
          {progressLine(entry)}
        </Text>
        <View style={styles.track}>
          <View style={[styles.bar, { width: `${pct}%` }]} />
        </View>
      </View>
    </View>
  );
}

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.m,
    padding: space.m,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.l,
  },
  cover: {
    width: 56,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.accent,
    justifyContent: 'flex-end',
    padding: 6,
  },
  coverText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 13, color: colors.muted },
  progress: { fontSize: 13, fontWeight: '700', color: colors.accentDark },
  track: { height: 6, borderRadius: 3, backgroundColor: '#ECE8F2', overflow: 'hidden', marginTop: 4 },
  bar: { height: '100%', backgroundColor: colors.accent },
});
