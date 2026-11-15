import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useExplicitGate } from '@/components/ExplicitDialog';
import { ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { loadRooms, type Room } from '@/lib/discussions';
import { useLookup } from '@/lib/useLookup';
import { radius, softShadow, space, useTheme } from '@/theme';

/**
 * The story page's rooms: every chapter (or 25-page part) and The Epilogue. Locked rooms say what
 * opens them and can't be entered; the database refuses them anyway (Spoiler Safe Mode). An Explicit fic's
 * rooms ask the 18+ question before the first one opens (docs/DECISIONS.md, "Explicit works: an 18+ confirmation").
 */
export function StoryRooms({ storyId, version }: { storyId: string; version: number }) {
  const { c } = useTheme();
  const t = useT();
  const { profile } = useAuth();
  // The list follows the reader's 18+ answer: an Explicit fic's reached rooms only count their comments after
  // the yes, which may be given on this screen (the AO3 link) after the list loaded.
  const adult = profile?.adult_confirmed === true;
  const rooms = useLookup(`${storyId}:${version}:${adult}`, () => loadRooms(storyId));
  const list = rooms.data ?? rooms.previous;
  const gate = useExplicitGate();
  // While the list reloads after a yes, `previous` still says adult_only: the profile has the latest answer.
  const enter = (room: Room) =>
    gate.ask(room.adult_only && !adult, () =>
      router.push(`/room/${storyId}/${room.kind === 'epilogue' ? 'epilogue' : room.section_number}`),
    );

  return (
    <View style={{ gap: space.s }}>
      {gate.dialog}
      <T v="overline">{t('story.discussions')}</T>
      {rooms.error ? <ErrorText>{t('story.roomsFailed')}</ErrorText> : null}
      {list ? list.map((room) => <RoomRow key={room.kind + (room.section_number ?? '')} room={room} onEnter={() => enter(room)} />) : <ActivityIndicator color={c.signal} />}
    </View>
  );
}

function RoomRow({ room, onEnter }: { room: Room; onEnter: () => void }) {
  const { c, mode, fonts } = useTheme();
  const t = useT();
  const epilogue = room.kind === 'epilogue';
  const name = epilogue ? t('room.epilogue') : t('room.chapter', { n: room.section_number! });
  const detail = room.unlocked
    ? [t('story.readers', { count: room.readers }), room.comments ? t('story.comments', { count: room.comments }) : null].filter(Boolean).join(' · ')
    : epilogue
      ? t('story.epilogueLocked')
      : t('story.roomLocked', { n: room.section_number! });

  return (
    <Pressable
      testID={epilogue ? 'room-epilogue' : `room-chapter-${room.section_number}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !room.unlocked }}
      disabled={!room.unlocked}
      onPress={onEnter}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.m,
        padding: space.m,
        borderRadius: radius.s,
        backgroundColor: c.surface,
        opacity: room.unlocked ? 1 : 0.6,
        ...softShadow(mode, 'small'),
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T style={epilogue ? { fontFamily: fonts.moment, fontSize: 20 } : undefined}>{name}</T>
        <T v="muted">{detail}</T>
      </View>
      <Feather name={room.unlocked ? 'chevron-right' : 'lock'} size={18} color={c.muted} />
    </Pressable>
  );
}
