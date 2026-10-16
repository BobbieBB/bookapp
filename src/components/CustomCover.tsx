import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { myCoverUrl, removeCover, uploadCover } from '@/lib/covers';
import { space } from '@/theme';

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

/** The quiet link, the privacy explanation before picking, and the way back to the usual cover. */
export function CoverActions({ cover }: { cover: ReturnType<typeof useCustomCover> }) {
  const t = useT();
  const [explaining, setExplaining] = useState(false);

  if (cover.url) {
    return (
      <View>
        <Button variant="link" title={t('covers.remove')} onPress={cover.remove} loading={cover.busy} />
        <ErrorText>{cover.error}</ErrorText>
      </View>
    );
  }
  return (
    <View style={{ gap: space.s }}>
      {explaining ? (
        <Card style={{ gap: space.m }}>
          <T v="body">{t('covers.explain')}</T>
          <Button
            title={t('covers.choose')}
            loading={cover.busy}
            onPress={async () => {
              await cover.choose();
              setExplaining(false);
            }}
          />
          <Button variant="link" title={t('covers.cancel')} onPress={() => setExplaining(false)} />
        </Card>
      ) : (
        <Button variant="link" title={t('covers.use')} onPress={() => setExplaining(true)} />
      )}
      <ErrorText>{cover.error}</ErrorText>
    </View>
  );
}
