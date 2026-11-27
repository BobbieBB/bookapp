// Import from Goodreads (src/lib/goodreads.ts). Goodreads exports a library only on a computer, so the import runs
// in Livami's web version (livami.expo.app) on that computer; the apps say where to do it (PO, 27 Nov 2026).
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, ErrorText, T } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  importGoodreads,
  parseGoodreadsExport,
  type GoodreadsBook,
  type GoodreadsShelf,
  type ImportResult,
} from '@/lib/goodreads';
import { space, useTheme } from '@/theme';

const SHELVES: GoodreadsShelf[] = ['read', 'currently-reading', 'to-read'];
const WEB_URL = 'https://livami.expo.app';

type FileInput = {
  type: string;
  accept: string;
  files: ArrayLike<{ text(): Promise<string> }> | null;
  onchange: (() => void) | null;
  click(): void;
};

/** The browser's file picker (web only): the text of the chosen file, or null if none was chosen. */
function pickTextFile(): Promise<string | null> {
  const doc = (globalThis as { document?: { createElement(tag: 'input'): FileInput } }).document;
  if (!doc) return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

export default function ImportGoodreads() {
  const { c } = useTheme();
  const t = useT();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [books, setBooks] = useState<GoodreadsBook[] | null>(null);
  const [shelves, setShelves] = useState<Set<GoodreadsShelf>>(new Set(SHELVES));
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const stop = useRef(false);

  const chosen = books?.filter((b) => shelves.has(b.shelf)) ?? [];
  const count = (shelf: GoodreadsShelf) => books?.filter((b) => b.shelf === shelf).length ?? 0;

  async function choose() {
    setError('');
    setResult(null);
    const text = await pickTextFile();
    if (text === null) return;
    try {
      const found = parseGoodreadsExport(text);
      if (!found.length) setError(t('goodreads.empty'));
      setBooks(found);
    } catch {
      setBooks(null);
      setError(t('goodreads.notExport'));
    }
  }

  async function run() {
    if (!userId || !chosen.length) return;
    stop.current = false;
    setProgress({ done: 0, total: chosen.length });
    const r = await importGoodreads(userId, chosen, {
      onProgress: (done, total) => setProgress({ done, total }),
      shouldStop: () => stop.current,
    });
    setProgress(null);
    setResult(r);
    setBooks(null);
  }

  const toggle = (shelf: GoodreadsShelf) =>
    setShelves((s) => {
      const next = new Set(s);
      if (next.has(shelf)) next.delete(shelf);
      else next.add(shelf);
      return next;
    });

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <T v="h1">{t('goodreads.title')}</T>
        <T v="muted">{t('goodreads.intro')}</T>

        {Platform.OS !== 'web' ? (
          <Card>
            <T v="label">{t('goodreads.onComputer')}</T>
            <T>{t('goodreads.onComputerSteps', { url: WEB_URL })}</T>
          </Card>
        ) : progress ? (
          <Card>
            <T v="label">{t('goodreads.importing', { done: progress.done, total: progress.total })}</T>
            <T v="muted">{t('goodreads.keepOpen')}</T>
            <Button variant="secondary" title={t('goodreads.stop')} onPress={() => (stop.current = true)} />
          </Card>
        ) : result ? (
          <Card>
            <T v="label">{t('goodreads.done', { count: result.added.length })}</T>
            {result.already.length ? <T>{t('goodreads.already', { count: result.already.length })}</T> : null}
            <T v="muted">{t('goodreads.setChapters')}</T>
            {result.notFound.length + result.failed.length ? (
              <View style={{ gap: space.xs }}>
                <T v="label">{t('goodreads.notFound', { count: result.notFound.length + result.failed.length })}</T>
                {[...result.notFound, ...result.failed].map((b, i) => (
                  <T key={`${b.title}-${i}`}>{`• ${b.title} – ${b.author}`}</T>
                ))}
                <T v="muted">{t('goodreads.addByHand')}</T>
              </View>
            ) : null}
            <Button title={t('goodreads.toLibrary')} onPress={() => router.navigate('/library')} />
          </Card>
        ) : (
          <>
            <Card>
              <T v="label">{t('goodreads.step1')}</T>
              <T>{t('goodreads.step1Detail')}</T>
              <T v="label">{t('goodreads.step2')}</T>
              <Button variant={books ? 'secondary' : 'primary'} title={t('goodreads.chooseFile')} onPress={() => void choose()} />
              <ErrorText>{error}</ErrorText>
            </Card>
            {books?.length ? (
              <Card>
                <T v="label">{t('goodreads.found', { count: books.length })}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
                  {SHELVES.map((s) => (
                    <Chip key={s} label={t(`goodreads.shelf.${s}`, { count: count(s) })} active={shelves.has(s)} onPress={() => toggle(s)} />
                  ))}
                </View>
                <T v="muted">{t('goodreads.whatComes')}</T>
                <Button title={t('goodreads.import', { count: chosen.length })} onPress={() => void run()} disabled={!chosen.length} />
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
