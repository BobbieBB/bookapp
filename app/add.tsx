import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, ErrorText, Field, T } from '@/components/ui';
import { track } from '@/lib/analytics';
import { parseAo3Share } from '@/lib/ao3Share';
import { addFavouriteFandom } from '@/lib/discover';
import { statusKey } from '@/lib/library';
import { finishStory } from '@/lib/story';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useLookup } from '@/lib/useLookup';
import { guessLanguage, isbnOf, normaliseAo3Link, searchBooks, searchDelay, type BookResult } from '@/lib/sources';
import {
  AO3_RATINGS,
  AO3_WARNINGS,
  addToLibrary,
  createBook,
  createFic,
  createManualBook,
  findStory,
  type BookLanguage,
} from '@/lib/stories';
import type { LibraryStatus, Story, StoryKind } from '@/lib/types';
import { RATING_LABEL, WARNING_LABEL } from '@/lib/ao3Labels';
import { coverColor, softShadow, space, useTheme } from '@/theme';
import { useT } from '@/i18n';

type Translate = ReturnType<typeof useT>;

export default function AddStory() {
  const { c, fonts } = useTheme();
  const t = useT();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ kind?: StoryKind }>();
  const [kind, setKind] = useState<StoryKind>(
    params.kind ?? (profile?.reads_books === false ? 'fanfic' : 'book'),
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: space.s, backgroundColor: c.band }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('add.close')} onPress={() => router.back()} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="x" size={24} color={c.ink} />
        </Pressable>
        {/* Screen titles are Sofia Sans (DECISIONS, "Fonts"): Unbounded ran off the screen in Bulgarian. */}
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 24, color: c.ink }}>
          {t('add.title')}
        </Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: space.xxl }}>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <View style={{ flex: 1 }}>
              <Chip label={t('add.kindBook')} active={kind === 'book'} onPress={() => setKind('book')} big />
            </View>
            <View style={{ flex: 1 }}>
              <Chip label={t('add.kindFanfic')} active={kind === 'fanfic'} onPress={() => setKind('fanfic')} big />
            </View>
          </View>
          {kind === 'book' ? <AddBook /> : <AddFic />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Status for the new library entry: most people add what they're about to read, but a book read
 * long ago (or dropped) belongs on the shelf too (PO, phone test 20 Oct 2026). On Hold is for
 * fanfiction only, as on the story page; on a WIP fic Finished reads "Caught up".
 */
function StatusPicker({
  value,
  onChange,
  kind,
  wip = false,
}: {
  value: LibraryStatus;
  onChange: (s: LibraryStatus) => void;
  kind: StoryKind;
  wip?: boolean;
}) {
  const t = useT();
  const options: [LibraryStatus, string][] = [
    ['currently_reading', t('add.statusReading')],
    ['want_to_read', t('add.statusWant')],
    ['finished', t(statusKey('finished', { kind, status: wip ? 'ongoing' : 'completed' }))],
    ['dnf', t('library.status.dnf')],
  ];
  if (kind === 'fanfic') options.push(['on_hold', t('library.status.on_hold')]);
  return (
    <View style={{ gap: space.s, marginTop: space.m }}>
      <T v="label">{t('add.statusLabel')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {options.map(([s, label]) => (
          <Chip key={s} label={label} active={value === s} onPress={() => onChange(s)} />
        ))}
      </View>
    </View>
  );
}

/**
 * Chapter count check: a whole number from 1 to 5000. Optional for "Want to read": you may not
 * have the book in hand yet; the count is asked on its page when you start (PO, 20 Oct 2026).
 */
function chaptersError(value: string, t: ReturnType<typeof useT>, optional = false): string | undefined {
  if (optional && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5000 ? undefined : t('add.errorChapters');
}

/**
 * When to show a field's error: once the reader has left the field, or tried to save. A chapter
 * count that is already wrong while typing (e.g. 86292) shows at once.
 */
function useFieldErrors() {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  return {
    show: (name: string, error: string | undefined, value = '') =>
      submitted || touched[name] || (name === 'chapters' && value.trim() !== '') ? error : undefined,
    onBlur: (name: string) => () => setTouched((cur) => ({ ...cur, [name]: true })),
    submit: () => setSubmitted(true),
  };
}

/** Which edition the reader has: discussions are separate per language (PO, 15 Oct 2026). */
function LanguagePicker({ value, onChange }: { value: BookLanguage; onChange: (l: BookLanguage) => void }) {
  const t = useT();
  return (
    <View style={{ gap: space.xs }}>
      <T v="label">{t('add.readingIn')}</T>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Chip label={t('add.langEn')} active={value === 'en'} onPress={() => onChange('en')} />
        <Chip label={t('add.langBg')} active={value === 'bg'} onPress={() => onChange('bg')} />
      </View>
    </View>
  );
}

/**
 * Adding a fic adds its fandom to "Your fandoms" (Discover follows it); the reader can remove it in
 * Profile. Best effort: a failure here never stops the fic being added (PO, phone test 20 Oct 2026).
 */
async function followFandoms(fandoms: string[]) {
  await Promise.all(fandoms.filter(Boolean).map((f) => addFavouriteFandom(f).catch(() => undefined)));
}

// A book's edition language goes with the event (the PO's "BG vs EN"); AO3 fics have none.
async function finish(
  story: Story,
  status: LibraryStatus,
  kind: StoryKind,
  source: 'open_library' | 'manual' | 'ao3',
  language?: BookLanguage,
) {
  await addToLibrary(story.id, status);
  void track('story_added', language ? { kind, source, status, language } : { kind, source, status });
  if (status === 'finished') {
    // Same as tapping Finished on the story page: a WIP is caught up to its published chapters,
    // and the "You finished it!" screen follows (rate a book, The Epilogue, or "caught up").
    const userId = (await supabase.auth.getSession()).data.session?.user.id;
    if (userId) await finishStory(story, userId).catch(() => undefined);
    void track('story_finished', { kind });
    router.replace(`/finished/${story.id}`);
    return;
  }
  // Opened from a link with nothing behind it: go Home instead of nowhere.
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function friendly(e: unknown, t: Translate) {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/network|fetch/i.test(msg)) return t('add.errorNetwork');
  return msg;
}

// ---------------------------------------------------------------------------
// Books: search Open Library, then add. A book new to us needs one question:
// how to split its discussions (Open Library doesn't know chapter counts).
// ---------------------------------------------------------------------------

function AddBook() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<BookResult | null>(null);
  const [manual, setManual] = useState(false);

  // Each keystroke cancels the previous search; a pasted ISBN searches right away.
  const q = query.trim();
  const delay = searchDelay(q);
  const search = useLookup(delay === null ? null : q, (signal) => searchBooks(q, signal), delay ?? 0);
  // While the next search loads (or if it fails), the last results stay on screen.
  const results = delay === null ? [] : (search.data ?? search.previous ?? []);
  const settled = search.data !== undefined || search.error !== undefined;
  const error = search.error ? friendly(search.error, t) : '';

  if (picked) return <ConfirmBook book={picked} onCancel={() => setPicked(null)} />;
  if (manual) return <ManualBook initialTitle={query} onCancel={() => setManual(false)} />;

  return (
    <View style={{ gap: space.m }}>
      <Field
        label={t('add.search')}
        placeholder={t('add.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      <T v="muted" style={{ fontSize: 12 }}>{t('add.openLibraryCredit')}</T>
      {search.loading && <ActivityIndicator />}
      <ErrorText>{error}</ErrorText>
      {results.map((b) => (
        <BookRow key={b.key} book={b} onPick={setPicked} />
      ))}
      {settled && (
        results.length ? (
          <CantFind onPress={() => setManual(true)} />
        ) : (
          <Card>
            <T v="h2">{t('add.noBooks')}</T>
            <T v="muted">{t('add.noBooksHint')}</T>
            <Button title={t('add.byHand')} onPress={() => setManual(true)} />
          </Card>
        )
      )}
    </View>
  );
}

function CantFind({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.hairline, paddingLeft: space.m }}>
      <T v="muted">{t('add.cantFind')}</T>
      <Button variant="link" title={t('add.byHand')} onPress={onPress} />
    </View>
  );
}

function SmallCover({ title, author, url, id }: { title: string; author: string; url?: string | null; id: string }) {
  const theme = useTheme();
  const t = useT();
  const { fonts } = theme;
  const col = coverColor(id, theme.isDark);
  const style = { width: 44, height: 64, borderRadius: 8, ...softShadow(theme.isDark, 'small') };
  if (url) return <Image source={{ uri: url }} style={style} accessibilityLabel={t('add.cover', { title })} />;
  return (
    <View accessible accessibilityLabel={t('add.cover', { title })} style={[style, { backgroundColor: col.bg, padding: 4, justifyContent: 'space-between', overflow: 'hidden' }]}>
      <Text numberOfLines={4} style={{ fontFamily: fonts.moment, fontSize: 10, lineHeight: 10, color: col.fg }}>{title}</Text>
      <Text numberOfLines={2} style={{ fontFamily: fonts.bodyBold, fontSize: 5.5, color: col.fg }}>{author.toUpperCase()}</Text>
    </View>
  );
}

function BookRow({ book, onPick }: { book: BookResult; onPick: (b: BookResult) => void }) {
  const theme = useTheme();
  const t = useT();

  return (
    <View style={[theme.card, { padding: 10, flexDirection: 'row', alignItems: 'center', gap: space.m }]}>
      <SmallCover title={book.title} author={book.author} url={book.coverUrl} id={book.key} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h2" style={{ fontSize: 16 }} numberOfLines={2}>{book.title}</T>
        <T v="muted" numberOfLines={1}>
          {[book.author, book.year, book.pages ? t('add.pages', { count: book.pages }) : null].filter(Boolean).join(' · ')}
        </T>
      </View>
      {/* Sized by its label, never squeezed: "Добави" broke into two lines at a fixed width. */}
      <View style={{ flexShrink: 0 }}>
        <Button title={t('add.add')} accessibilityLabel={`${t('add.add')}: ${book.title}`} onPress={() => onPick(book)} />
      </View>
    </View>
  );
}

/**
 * Last step before adding a book: the edition language (rooms are per language), the reading
 * status, and for an edition new to Livami its chapter count (Open Library doesn't know it).
 */
function ConfirmBook({ book, onCancel }: { book: BookResult; onCancel: () => void }) {
  const t = useT();
  const [language, setLanguage] = useState<BookLanguage>(guessLanguage(book.title));
  const [chapters, setChapters] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('currently_reading');
  const [busy, setBusy] = useState(false);
  const [saveError, setError] = useState('');
  const fields = useFieldErrors();

  const found = useLookup(`${book.key}#${language}`, () => findStory({ openLibraryKey: book.key, language }));
  // undefined = still checking; null = new to Livami (or the check failed: we'll create it)
  const existing: Story | null | undefined = found.loading ? undefined : (found.data ?? null);
  const error = saveError || (found.error ? friendly(found.error, t) : '');

  async function save() {
    const n = Number(chapters);
    if (existing === undefined) return;
    fields.submit();
    if (!existing && chaptersError(chapters, t, status === 'want_to_read')) return;
    setBusy(true);
    setError('');
    try {
      const story = existing ?? (await createBook(book, { chapters: chapters.trim() ? n : null }, language));
      await finish(story, status, 'book', 'open_library', language);
    } catch (e) {
      setError(friendly(e, t));
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
        <SmallCover title={book.title} author={book.author} url={book.coverUrl} id={book.key} />
        <View style={{ flex: 1 }}>
          <T v="h2">{book.title}</T>
          <T v="muted">{book.author}</T>
        </View>
      </View>
      <LanguagePicker value={language} onChange={setLanguage} />
      {existing === undefined ? (
        <ActivityIndicator />
      ) : (
        !existing && (
          <>
            <T v="muted">{t('add.firstEdition')}</T>
            <Field
              label={status === 'want_to_read' ? t('add.chaptersOptional') : t('add.chapters')}
              keyboardType="number-pad"
              value={chapters}
              onChangeText={setChapters}
              onBlur={fields.onBlur('chapters')}
              error={fields.show('chapters', chaptersError(chapters, t, status === 'want_to_read'), chapters)}
              placeholder={t('add.chaptersPlaceholder')}
            />
          </>
        )
      )}
      <StatusPicker value={status} onChange={setStatus} kind="book" />
      <ErrorText>{error}</ErrorText>
      <Button title={t('add.addToLibrary')} onPress={save} loading={busy} disabled={existing === undefined} />
      <Button variant="link" title={t('add.backToResults')} onPress={onCancel} />
    </Card>
  );
}

function ManualBook({ initialTitle, onCancel }: { initialTitle: string; onCancel: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(isbnOf(initialTitle) ? '' : initialTitle.trim());
  const [author, setAuthor] = useState('');
  const [chapters, setChapters] = useState('');
  const [language, setLanguage] = useState<BookLanguage>(guessLanguage(initialTitle));
  const [status, setStatus] = useState<LibraryStatus>('currently_reading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fields = useFieldErrors();
  const errors = {
    title: title.trim() ? undefined : t('add.errorTitle'),
    author: author.trim() ? undefined : t('add.errorAuthor'),
    chapters: chaptersError(chapters, t, status === 'want_to_read'),
  };

  async function save() {
    const n = Number(chapters);
    fields.submit();
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setError('');
    try {
      const story = await createManualBook({ title: title.trim(), author: author.trim(), chapters: chapters.trim() ? n : null, language });
      await finish(story, status, 'book', 'manual', language);
    } catch (e) {
      setError(friendly(e, t));
      setBusy(false);
    }
  }

  return (
    <Card>
      <T v="h2">{t('add.manualTitle')}</T>
      <Field label={t('add.fieldTitle')} value={title} onChangeText={setTitle} onBlur={fields.onBlur('title')} error={fields.show('title', errors.title)} />
      <Field label={t('add.fieldAuthor')} value={author} onChangeText={setAuthor} onBlur={fields.onBlur('author')} error={fields.show('author', errors.author)} />
      <Field
        label={status === 'want_to_read' ? t('add.chaptersOptional') : t('add.chapters')}
        keyboardType="number-pad"
        value={chapters}
        onChangeText={setChapters}
        onBlur={fields.onBlur('chapters')}
        error={fields.show('chapters', errors.chapters, chapters)}
      />
      <LanguagePicker value={language} onChange={setLanguage} />
      <StatusPicker value={status} onChange={setStatus} kind="book" />
      <ErrorText>{error}</ErrorText>
      <Button title={t('add.addToLibrary')} onPress={save} loading={busy} />
      <Button variant="link" title={t('add.backToSearch')} onPress={onCancel} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fanfiction: the AO3 link is looked up in OUR database only. Found → details are
// filled in; not found → the reader types them (we never fetch from AO3).
// ---------------------------------------------------------------------------

function AddFic() {
  const { c } = useTheme();
  const t = useT();
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [fandom, setFandom] = useState('');
  const [ship, setShip] = useState('');
  const [complete, setComplete] = useState(true);
  const [chapters, setChapters] = useState('');
  const [rating, setRating] = useState<(typeof AO3_RATINGS)[number]>('Not Rated');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<LibraryStatus>('currently_reading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fields = useFieldErrors();
  // Archive warnings are optional: AO3 shows them in the work's tags, and readers often don't spot them.
  const errors = {
    title: title.trim() ? undefined : t('add.errorTitle'),
    author: author.trim() ? undefined : t('add.errorAuthor'),
    fandom: fandom.trim() ? undefined : t('add.errorFandom'),
    chapters: chaptersError(chapters, t),
  };

  const [filled, setFilled] = useState(false);

  /** A plain link, or AO3's Share text: then everything it says is filled in (nothing is fetched from AO3). */
  function onLink(value: string) {
    const share = parseAo3Share(value);
    if (!share) {
      setLink(value);
      setFilled(false);
      return;
    }
    setLink(share.link);
    setTitle(share.title);
    setAuthor(share.author);
    setFandom(share.fandom);
    setShip(share.ship);
    setComplete(share.complete);
    setChapters(share.chapters ? String(share.chapters) : '');
    if (share.rating) setRating(share.rating);
    setWarnings(share.warnings);
    setFilled(true);
  }

  const canonical = normaliseAo3Link(link);
  const badLink = link.trim().length > 0 && !canonical;

  // Not found or offline: the reader fills in the form (a duplicate insert then joins the existing story).
  const found = useLookup(canonical, () => findStory({ ao3Link: canonical! }));
  const existing = found.data ?? null;
  const checking = found.loading;

  function toggleWarning(w: string) {
    setWarnings((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));
  }

  async function save() {
    if (!canonical) return setError(t('add.errorLink'));
    if (!existing) {
      fields.submit();
      if (Object.values(errors).some(Boolean)) return;
    }
    setBusy(true);
    setError('');
    try {
      if (existing) {
        await followFandoms(existing.fandoms);
        await finish(existing, status, 'fanfic', 'ao3');
        return;
      }
      const n = Number(chapters);
      const story = await createFic({
        ao3Link: canonical,
        title,
        author,
        fandom,
        ship,
        complete,
        chapters: n,
        rating,
        warnings,
      });
      await followFandoms([fandom.trim()]);
      await finish(story, status, 'fanfic', 'ao3');
    } catch (e) {
      setError(friendly(e, t));
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.m }}>
      <Field
        label={t('add.ao3Link')}
        placeholder={t('add.ao3Placeholder')}
        value={link}
        onChangeText={onLink}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <T v="muted">{filled ? t('add.ao3Filled') : t('add.ao3ShareHint')}</T>
      {checking && <T v="muted">{t('add.checking')}</T>}
      {badLink && <ErrorText>{t('add.badLink')}</ErrorText>}

      {existing ? (
        <Card tone="band">
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Feather name="check" size={18} color={c.ink} />
            <T v="label">{t('add.alreadyHere')}</T>
          </View>
          <T v="h2">{existing.title}</T>
          <T v="muted">{[existing.author_name, existing.fandoms[0], existing.ships[0]].filter(Boolean).join(' · ')}</T>
        </Card>
      ) : (
        canonical && !checking && (
          <>
            <Field label={t('add.fieldTitle')} value={title} onChangeText={setTitle} onBlur={fields.onBlur('title')} error={fields.show('title', errors.title)} />
            <Field
              label={t('add.fieldAuthor')}
              value={author}
              onChangeText={setAuthor}
              autoCapitalize="none"
              onBlur={fields.onBlur('author')}
              error={fields.show('author', errors.author)}
            />
            <Field label={t('add.fandom')} value={fandom} onChangeText={setFandom} onBlur={fields.onBlur('fandom')} error={fields.show('fandom', errors.fandom)} />
            <Field label={t('add.ship')} value={ship} onChangeText={setShip} />

            <T v="label">{t('add.ficStatus')}</T>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Chip label={t('add.complete')} active={complete} onPress={() => setComplete(true)} />
              <Chip label={t('add.wip')} active={!complete} onPress={() => setComplete(false)} />
            </View>
            <Field
              label={complete ? t('add.chapters') : t('add.chaptersSoFar')}
              keyboardType="number-pad"
              value={chapters}
              onChangeText={setChapters}
              onBlur={fields.onBlur('chapters')}
              error={fields.show('chapters', errors.chapters, chapters)}
            />

            <T v="label">{t('add.rating')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {AO3_RATINGS.map((r) => (
                <Chip key={r} label={t(RATING_LABEL[r])} active={rating === r} onPress={() => setRating(r)} />
              ))}
            </View>

            <T v="label">{t('add.warnings')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {AO3_WARNINGS.map((w) => (
                <Chip key={w} label={t(WARNING_LABEL[w])} active={warnings.includes(w)} onPress={() => toggleWarning(w)} />
              ))}
            </View>
          </>
        )
      )}

      {canonical && !checking && (
        <>
          <StatusPicker value={status} onChange={setStatus} kind="fanfic" wip={existing ? existing.status === 'ongoing' : !complete} />
          <ErrorText>{error}</ErrorText>
          <Button title={t('add.addToLibrary')} onPress={save} loading={busy} />
        </>
      )}
    </View>
  );
}
