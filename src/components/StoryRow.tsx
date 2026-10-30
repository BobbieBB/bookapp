import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { T } from '@/components/ui';
import { progressLine, sectionTotal, statusKey } from '@/lib/library';
import type { LibraryEntry } from '@/lib/types';
import { useT } from '@/i18n';
import { coverColor, softShadow, space, useTheme } from '@/theme';

const COVER = { width: 76, height: 110, borderRadius: 10 };

export function StoryRow({
  entry,
  showStatus,
  hint,
  coverUrl,
}: {
  entry: LibraryEntry;
  showStatus?: boolean;
  hint?: string;
  /** The reader's own private cover for this story (docs/DECISIONS.md, "Custom covers"), if they set one. */
  coverUrl?: string;
}) {
  const t = useTheme();
  const tr = useT();
  const { fonts } = t;
  const { c } = t;
  const s = entry.story;
  const total = sectionTotal(entry);
  const pct =
    entry.status === 'finished' && !(s.kind === 'fanfic' && s.status === 'ongoing') ? 100 : total ? Math.min(100, Math.round((entry.progress_section / total) * 100)) : 0;
  // Only the author under the title: a fandom next to it read like a co-author (PO, 20 Oct 2026).
  // The status line says only what the empty/filled bar doesn't: no "Not started", no "Finished · Finished".
  const statusLine =
    entry.status === 'finished'
      ? progressLine(entry, tr) // "Finished", or "Caught up · 16 of 16 chapters" on a WIP
      : [showStatus ? tr(statusKey(entry.status, s)) : null, entry.progress_section > 0 ? progressLine(entry, tr) : null]
          .filter(Boolean)
          .join(' · ');
  const cover = coverColor(s.id, t.isDark);
  // The link that failed to load, so a broken image falls back to the typographic cover (a new link
  // for the same story, after a reload, gets another try).
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  const custom = coverUrl && coverUrl !== failedUrl ? coverUrl : undefined;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={s.title}
      onPress={() => router.push({ pathname: '/story/[id]', params: { id: s.id } })}
      style={[t.card, { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: space.m }]}
    >
      {/* The reader's own cover if they set one (only they see it); otherwise the typographic cover.
          Fics never get a public cover (fanart is someone else's work). */}
      {custom ? (
        <Image
          source={{ uri: custom }}
          accessibilityLabel={tr('covers.customLabel', { title: s.title })}
          onError={() => setFailedUrl(custom)}
          style={{ ...COVER, ...softShadow(t.isDark, 'small') }}
        />
      ) : (
        <View
          accessible
          accessibilityLabel={tr('library.coverLabel', { title: s.title })}
          style={{
            ...COVER,
            backgroundColor: cover.bg,
            ...softShadow(t.isDark, 'small'),
            justifyContent: 'space-between',
            padding: 7,
          }}
        >
          <Text numberOfLines={5} style={{ fontFamily: fonts.moment, fontSize: 14, lineHeight: 15, color: cover.fg }}>
            {s.title}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 8, lineHeight: 9, letterSpacing: 0.2, color: cover.fg }}>
            {s.author_name.toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <T v="h2" numberOfLines={2}>
          {s.title}
        </T>
        <T v="muted" numberOfLines={1}>
          {s.author_name}
        </T>
        {statusLine ? <T v="label">{statusLine}</T> : null}
        {hint ? <T v="muted">{hint}</T> : null}
        <View
          style={{
            height: 6,
            borderRadius: 999,
            backgroundColor: c.track,
            overflow: 'hidden',
            marginTop: 6,
          }}
        >
          <View style={{ height: '100%', borderRadius: 999, width: `${pct}%`, backgroundColor: s.kind === 'fanfic' ? c.secondary : c.primary }} />
        </View>
      </View>
    </Pressable>
  );
}
