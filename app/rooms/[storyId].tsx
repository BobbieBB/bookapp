import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';

import { RoomRow, unlockedChapters } from '@/components/StoryRooms';
import { ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { loadRooms } from '@/lib/discussions';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

/** Every discussion you unlocked on one story, newest first ("All (N) ›" on the story page). */
export default function AllRooms() {
  const { c } = useTheme();
  const t = useT();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const [version, setVersion] = useState(0);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  const rooms = useLookup(storyId ? `${storyId}:${version}` : null, () => loadRooms(storyId!));
  const list = rooms.data ?? rooms.previous;
  const epilogue = list?.find((r) => r.kind === 'epilogue' && r.unlocked);

  return (
    <ScrollView style={{ backgroundColor: c.ground }} contentContainerStyle={{ padding: space.xl, gap: space.s }}>
      <T v="h1">{t('story.roomsTitle')}</T>
      {rooms.error ? <ErrorText>{t('story.roomsFailed')}</ErrorText> : null}
      {!list ? (
        <ActivityIndicator color={c.signal} />
      ) : (
        <>
          {epilogue ? <RoomRow storyId={storyId!} room={epilogue} /> : null}
          {unlockedChapters(list).map((room) => (
            <RoomRow key={room.section_number} storyId={storyId!} room={room} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
