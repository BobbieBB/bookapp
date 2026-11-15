import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { loadRooms, type Room } from '@/lib/discussions';
import { useLookup } from '@/lib/useLookup';
import { radius, softShadow, space, useTheme } from '@/theme';

/** How many unlocked rooms the story page shows before "All (N) ›" (docs/DECISIONS.md, PO testing round, B). */
export const ROOMS_ON_STORY_PAGE = 3;

/** Unlocked chapter rooms, newest first. */
export const unlockedChapters = (rooms: Room[]) =>
  rooms.filter((r) => r.kind === 'chapter' && r.unlocked).sort((a, b) => (b.section_number ?? 0) - (a.section_number ?? 0));

/**
 * The story page's discussions: the last few rooms you unlocked, newest first, and The Epilogue at the
 * bottom. Locked chapters are not listed (the main button already says what comes next); the database
 * refuses them anyway (Spoiler Safe Mode). "All (N) ›" opens every unlocked room.
 */
export function StoryRooms({ storyId, version }: { storyId: string; version: number }) {
  const { c, fonts } = useTheme();
  const t = useT();
  const rooms = useLookup(`${storyId}:${version}`, () => loadRooms(storyId));
  const list = rooms.data ?? rooms.previous;
  const unlocked = list ? unlockedChapters(list) : [];
  const epilogue = list?.find((r) => r.kind === 'epilogue');

  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <T v="overline">{t('story.discussions')}</T>
        {unlocked.length > ROOMS_ON_STORY_PAGE ? (
          <Pressable
            testID="all-rooms"
            accessibilityRole="link"
            accessibilityLabel={t('story.allRoomsLabel', { count: unlocked.length })}
            onPress={() => router.push(`/rooms/${storyId}`)}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>{t('story.allRooms', { count: unlocked.length })} ›</Text>
          </Pressable>
        ) : null}
      </View>
      {rooms.error ? <ErrorText>{t('story.roomsFailed')}</ErrorText> : null}
      {!list ? (
        <ActivityIndicator color={c.signal} />
      ) : (
        <>
          {unlocked.length === 0 && !epilogue?.unlocked ? <T v="muted">{t('story.roomsEmpty')}</T> : null}
          {unlocked.slice(0, ROOMS_ON_STORY_PAGE).map((room) => (
            <RoomRow key={room.section_number} storyId={storyId} room={room} />
          ))}
          {epilogue ? <RoomRow storyId={storyId} room={epilogue} /> : null}
        </>
      )}
    </View>
  );
}

/** 💬 3 · 👤 2: comments (only known once a room is unlocked) and readers. */
export function RoomCounts({ comments, readers }: { comments: number | null; readers: number }) {
  const { c, fonts } = useTheme();
  const t = useT();
  const text = { fontFamily: fonts.bodyBold, fontSize: 14, color: c.muted };
  const spoken = [comments ? t('story.comments', { count: comments }) : null, t('story.readers', { count: readers })].filter(Boolean).join(', ');
  return (
    <View accessible accessibilityLabel={spoken} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
      {comments ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Feather name="message-circle" size={14} color={c.muted} />
          <Text style={text}>{comments}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Feather name="user" size={14} color={c.muted} />
        <Text style={text}>{readers}</Text>
      </View>
    </View>
  );
}

/** One room: open ones with the discussion icon and counts; a locked one (only The Epilogue) faded, with a lock. */
export function RoomRow({ storyId, room }: { storyId: string; room: Room }) {
  const { c, mode, fonts } = useTheme();
  const t = useT();
  const epilogue = room.kind === 'epilogue';
  const name = epilogue ? t('room.epilogue') : t('room.chapter', { n: room.section_number! });

  return (
    <Pressable
      testID={epilogue ? 'room-epilogue' : `room-chapter-${room.section_number}`}
      accessibilityRole="button"
      accessibilityLabel={room.unlocked ? name : `${name}. ${epilogue ? t('story.epilogueLocked') : t('story.roomLocked', { n: room.section_number! })}`}
      accessibilityState={{ disabled: !room.unlocked }}
      disabled={!room.unlocked}
      onPress={() => router.push(`/room/${storyId}/${epilogue ? 'epilogue' : room.section_number}`)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.m,
        padding: space.m,
        minHeight: 60,
        borderRadius: radius.s,
        ...(room.unlocked
          ? { backgroundColor: c.surface, ...softShadow(mode, 'small') }
          : { borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: c.hairline, opacity: 0.6 }),
      }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: room.unlocked ? c.band : c.track }}>
        <Feather name={room.unlocked ? 'message-circle' : 'lock'} size={16} color={c.ink} />
      </View>
      <Text style={epilogue ? { flex: 1, fontFamily: fonts.moment, fontSize: 20, color: c.ink } : { flex: 1, fontFamily: fonts.bodyBold, fontSize: 17, color: c.ink }}>{name}</Text>
      {room.unlocked ? (
        <>
          <RoomCounts comments={room.comments} readers={room.readers} />
          <Feather name="chevron-right" size={20} color={c.muted} />
        </>
      ) : null}
    </Pressable>
  );
}
