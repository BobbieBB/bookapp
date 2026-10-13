import { Text, View } from 'react-native';

import { T } from '@/components/ui';
import { progressLine, sectionTotal } from '@/lib/library';
import type { LibraryEntry } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/types';
import { coverColor, fonts, space, useTheme } from '@/theme';

export function StoryRow({ entry, showStatus }: { entry: LibraryEntry; showStatus?: boolean }) {
  const t = useTheme();
  const { c } = t;
  const s = entry.story;
  const total = sectionTotal(entry);
  const pct =
    entry.status === 'finished' ? 100 : total ? Math.min(100, Math.round((entry.progress_section / total) * 100)) : 0;
  const subtitle =
    s.kind === 'fanfic' ? [s.author_name, s.fandoms[0], s.ships[0]].filter(Boolean).join(' · ') : s.author_name;
  const cover = coverColor(s.id, t.isDark);

  return (
    <View style={[t.card, { flexDirection: 'row', gap: space.m, padding: space.m, borderRadius: 16 }]}>
      {/* Typographic cover: fics never have covers (fanart is someone else's work). */}
      <View
        accessible
        accessibilityLabel={`${s.title} cover`}
        style={{
          width: 64,
          height: 92,
          borderRadius: 8,
          backgroundColor: cover.bg,
          borderWidth: t.isDark ? 0 : 2,
          borderColor: c.outline,
          justifyContent: 'space-between',
          padding: 6,
        }}
      >
        <Text numberOfLines={4} style={{ fontFamily: fonts.moment, fontSize: 15, lineHeight: 15, color: cover.fg }}>
          {s.title}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 8, letterSpacing: 0.5, color: cover.fg }}>
          {s.author_name.toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="h2" numberOfLines={2}>
          {s.title}
        </T>
        <T v="muted" numberOfLines={1}>
          {subtitle}
        </T>
        <T v="label">
          {showStatus ? `${STATUS_LABEL[entry.status]} · ` : ''}
          {progressLine(entry)}
        </T>
        <View
          style={{
            height: 8,
            borderRadius: 4,
            borderWidth: t.isDark ? 0 : 1.5,
            borderColor: c.outline,
            backgroundColor: c.track,
            overflow: 'hidden',
            marginTop: 4,
          }}
        >
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: s.kind === 'fanfic' ? c.secondary : c.primary }} />
        </View>
      </View>
    </View>
  );
}
