import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, View } from 'react-native';

import { Button, Card, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { track } from '@/lib/analytics';
import { myCoverUrl, myCoverUrls, removeCover, uploadCover } from '@/lib/covers';
import { space, useTheme } from '@/theme';

const COVER_WIDTH = 1200;
const MAX_COVER_BYTES = 5 * 1024 * 1024; // the covers bucket's limit

function decodeBase64(data: string): ArrayBuffer {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** The reader's own cover for a story: its link (null when they have none) and the actions that change it. */
export function useCustomCover(storyId: string, enabled: boolean) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const running = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    myCoverUrl(storyId).then(
      (link) => current && setUrl(link),
      () => current && setError(t('covers.loadFailed')),
    );
    return () => {
      current = false;
    };
  }, [storyId, enabled, t]);

  const run = useCallback(
    async (action: () => Promise<void>, failure: string) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setError('');
      try {
        await action();
      } catch {
        if (alive.current) setError(failure);
      } finally {
        running.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [],
  );

  const choose = useCallback(
    () =>
      run(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          if (alive.current) setError(t('covers.denied'));
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [2, 3],
          quality: 1,
        });
        const asset = result.canceled ? null : result.assets[0];
        if (!asset) return;
        // A cover never needs more than ~1200 px: resize and re-encode as JPEG before uploading.
        const context = ImageManipulator.manipulate(asset.uri);
        context.resize({ width: COVER_WIDTH });
        const image = await context.renderAsync();
        const resized = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
        if (!resized.base64) throw new Error('The resized image has no data.');
        const bytes = decodeBase64(resized.base64);
        if (bytes.byteLength > MAX_COVER_BYTES) {
          if (alive.current) setError(t('covers.tooLarge'));
          return;
        }
        await uploadCover(storyId, bytes, 'image/jpeg');
        void track('cover_set');
        const link = await myCoverUrl(storyId);
        if (alive.current) setUrl(link);
      }, t('covers.uploadFailed')),
    [run, storyId, t],
  );

  const remove = useCallback(
    () =>
      run(async () => {
        await removeCover(storyId);
        if (alive.current) setUrl(null);
      }, t('covers.removeFailed')),
    [run, storyId, t],
  );

  return { url, error, busy, choose, remove };
}

/**
 * Your covers for the stories in a list of library rows, keyed by story id. Loaded again when the rows
 * change (the lists reload on focus, so a cover set on the story page shows on the way back). Until
 * then the last links stay up, and if loading fails every row simply keeps its usual cover.
 */
export function useMyCoverUrls(entries: { story_id: string }[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let current = true;
    myCoverUrls(entries.map((e) => e.story_id)).then(
      (links) => current && setUrls(links),
      () => undefined, // rows fall back to the typographic cover; nothing here worth an error message
    );
    return () => {
      current = false;
    };
  }, [entries]);
  return urls;
}

/** The small pencil on the cover: "Use my own cover" / "Change my cover" for screen readers. */
export function CoverEditButton({ hasCover, onPress }: { hasCover: boolean; onPress: () => void }) {
  const t = useT();
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasCover ? t('covers.change') : t('covers.use')}
      onPress={onPress}
      hitSlop={8}
      style={{
        position: 'absolute',
        right: -10,
        top: -10,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: c.surface,
        borderWidth: 2,
        borderColor: c.ground,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather name="edit-2" size={16} color={c.ink} />
    </Pressable>
  );
}

/**
 * Opened from the pencil on the cover. Before the first cover it explains why it stays private;
 * with one, it offers another image or the usual cover, with the reminder that only you see it.
 */
export function CoverActions({
  cover,
  open,
  onClose,
}: {
  cover: ReturnType<typeof useCustomCover>;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const hasCover = !!cover.url;

  return (
    <View style={{ gap: space.s }}>
      {open ? (
        <Card style={{ gap: space.m }}>
          <T v="body">{hasCover ? t('covers.onlyYou') : t('covers.explain')}</T>
          <Button
            title={hasCover ? t('covers.chooseAnother') : t('covers.choose')}
            loading={cover.busy}
            onPress={async () => {
              await cover.choose();
              onClose();
            }}
          />
          {hasCover ? (
            <Button
              variant="link"
              title={t('covers.remove')}
              onPress={async () => {
                await cover.remove();
                onClose();
              }}
            />
          ) : null}
          <Button variant="link" title={t('covers.cancel')} onPress={onClose} />
        </Card>
      ) : null}
      <ErrorText>{cover.error}</ErrorText>
    </View>
  );
}
