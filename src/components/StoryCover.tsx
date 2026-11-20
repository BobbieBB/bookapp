import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { forgetCoverLink } from '@/lib/covers';
import { coverColor, softShadow, useTheme } from '@/theme';

type CoverStory = { id: string; kind: 'book' | 'fanfic'; title: string; author_name: string; cover_url?: string | null };

/**
 * A story's cover, the same everywhere (PO, 20 Nov 2026: Home showed a typographic cover for a book whose page
 * showed the real one). In order: the reader's own private cover, a book's cover from Open Library or Google
 * Books, else the typographic cover (title + author). Fics never get a public cover: fanart is someone else's
 * work. A picture that fails to load falls back to the next one.
 */
export function StoryCover({ story, customUrl, width }: { story: CoverStory; customUrl?: string | null; width: number }) {
  const th = useTheme();
  const t = useT();
  const height = Math.round(width * 1.45);
  const size = { width, height, borderRadius: Math.max(8, Math.round(width / 7)), ...softShadow(th.mode, 'small') };
  const [failed, setFailed] = useState<string[]>([]);
  const custom = customUrl && !failed.includes(customUrl) ? customUrl : null;
  const book = story.kind === 'book' && story.cover_url && !failed.includes(story.cover_url) ? story.cover_url : null;

  if (custom) {
    return (
      <Image
        source={{ uri: custom }}
        accessibilityLabel={t('covers.customLabel', { title: story.title })}
        onError={() => {
          setFailed((f) => [...f, custom]);
          // The signed link may have expired: the next load signs a new one.
          forgetCoverLink(custom);
        }}
        style={size}
      />
    );
  }
  const label = t('library.coverLabel', { title: story.title });
  if (book) {
    return <Image source={{ uri: book }} accessibilityLabel={label} onError={() => setFailed((f) => [...f, book])} style={size} />;
  }
  const cover = coverColor(story.id, th.mode);
  // Type sizes follow the cover's width: 76 (lists) → 14/8, 96 (story page) → 20/9, larger on "You finished it!".
  const titleSize = Math.round(width / 5);
  const authorSize = Math.max(8, Math.round(width / 11));
  return (
    <View accessible accessibilityLabel={label} style={[size, { backgroundColor: cover.bg, justifyContent: 'space-between', padding: Math.round(width / 11) }]}>
      <Text numberOfLines={5} style={{ fontFamily: th.fonts.moment, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.05), color: cover.fg }}>
        {story.title}
      </Text>
      <Text numberOfLines={2} style={{ fontFamily: th.fonts.bodyBold, fontSize: authorSize, lineHeight: authorSize + 1, letterSpacing: 0.2, color: cover.fg }}>
        {story.author_name.toUpperCase()}
      </Text>
    </View>
  );
}
