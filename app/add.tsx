import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, ErrorText, Field, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isbnOf, normaliseAo3Link, searchBooks, type BookResult } from '@/lib/sources';
import {
  AO3_RATINGS,
  AO3_WARNINGS,
  addToLibrary,
  createBook,
  createFic,
  createManualBook,
  findStory,
} from '@/lib/stories';
import type { LibraryStatus, Story, StoryKind } from '@/lib/types';
import { coverColor, fonts, softShadow, space, useTheme } from '@/theme';

// Search starts at 3 characters, after a pause in typing (docs/DECISIONS.md).
const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;

// Short labels for AO3's archive warnings (the stored value stays AO3's wording).
const WARNING_LABEL: Record<string, string> = {
  'No Archive Warnings Apply': 'No warnings apply',
  'Creator Chose Not To Use Archive Warnings': 'Chose not to warn',
  'Graphic Depictions Of Violence': 'Graphic violence',
  'Major Character Death': 'Major character death',
  'Rape/Non-Con': 'Rape/Non-con',
  'Underage Sex': 'Underage sex',
};

export default function AddStory() {
  const { c } = useTheme();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ kind?: StoryKind }>();
  const [kind, setKind] = useState<StoryKind>(
    params.kind ?? (profile?.reads_books === false ? 'fanfic' : 'book'),
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: space.s, backgroundColor: c.band }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="x" size={24} color={c.ink} />
        </Pressable>
        <T v="h2" style={{ fontSize: 24 }}>Add a story</T>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: space.xxl }}>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <View style={{ flex: 1 }}>
              <Chip label="Book" active={kind === 'book'} onPress={() => setKind('book')} big />
            </View>
            <View style={{ flex: 1 }}>
              <Chip label="Fanfiction" active={kind === 'fanfic'} onPress={() => setKind('fanfic')} big />
            </View>
          </View>
          {kind === 'book' ? <AddBook /> : <AddFic />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Status for the new library entry: most people add what they're about to read. */
function StatusPicker({ value, onChange }: { value: LibraryStatus; onChange: (s: LibraryStatus) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.s }}>
      <Chip label="Reading now" active={value === 'currently_reading'} onPress={() => onChange('currently_reading')} />
      <Chip label="Want to read" active={value === 'want_to_read'} onPress={() => onChange('want_to_read')} />
    </View>
  );
}

async function finish(storyId: string, status: LibraryStatus) {
  await addToLibrary(storyId, status);
  router.back();
}

function friendly(e: unknown) {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/network|fetch/i.test(msg)) return 'We couldn’t reach the server. Check your connection and try again.';
  return msg;
}

// ---------------------------------------------------------------------------
// Books: search Open Library, then add. A book new to us needs one question:
// how to split its discussions (Open Library doesn't know chapter counts).
// ---------------------------------------------------------------------------

function AddBook() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<{ book: BookResult; existing: Story | null } | null>(null);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    const q = query.trim();
    const immediate = !!isbnOf(q); // a pasted ISBN searches right away
    if (q.length < MIN_CHARS) {
      setResults([]);
      setSearched(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(
      async () => {
        setSearching(true);
        setError('');
        try {
          setResults(await searchBooks(q, ctrl.signal));
          setSearched(true);
        } catch (e) {
          if (!ctrl.signal.aborted) setError(friendly(e));
        } finally {
          if (!ctrl.signal.aborted) setSearching(false);
        }
      },
      immediate ? 0 : DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort(); // each keystroke cancels the previous search
    };
  }, [query]);

  if (picked) return <ConfirmBook {...picked} onCancel={() => setPicked(null)} />;
  if (manual) return <ManualBook initialTitle={query} onCancel={() => setManual(false)} />;

  return (
    <View style={{ gap: space.m }}>
      <Field
        label="Search"
        placeholder="Title, author or ISBN"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      <T v="muted" style={{ fontSize: 12 }}>Book details from Open Library</T>
      {searching && <ActivityIndicator />}
      <ErrorText>{error}</ErrorText>
      {results.map((b) => (
        <BookRow key={b.key} book={b} onPick={(book, existing) => setPicked({ book, existing })} />
      ))}
      {searched && !searching && (
        results.length ? (
          <CantFind onPress={() => setManual(true)} />
        ) : (
          <Card>
            <T v="h2">No books found</T>
            <T v="muted">Check the spelling, or add it yourself.</T>
            <Button title="Add it by hand" onPress={() => setManual(true)} />
          </Card>
        )
      )}
    </View>
  );
}

function CantFind({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.hairline, paddingLeft: space.m }}>
      <T v="muted">Can’t find it?</T>
      <Button variant="link" title="Add it by hand" onPress={onPress} />
    </View>
  );
}

function SmallCover({ title, author, url, id }: { title: string; author: string; url?: string | null; id: string }) {
  const t = useTheme();
  const col = coverColor(id, t.isDark);
  const style = { width: 44, height: 64, borderRadius: 8, ...softShadow(t.isDark, 'small') };
  if (url) return <Image source={{ uri: url }} style={style} accessibilityLabel={`${title} cover`} />;
  return (
    <View accessible accessibilityLabel={`${title} cover`} style={[style, { backgroundColor: col.bg, padding: 4, justifyContent: 'space-between', overflow: 'hidden' }]}>
      <Text numberOfLines={4} style={{ fontFamily: fonts.moment, fontSize: 10, lineHeight: 10, color: col.fg }}>{title}</Text>
      <Text numberOfLines={2} style={{ fontFamily: fonts.bodyBold, fontSize: 5.5, color: col.fg }}>{author.toUpperCase()}</Text>
    </View>
  );
}

function BookRow({ book, onPick }: { book: BookResult; onPick: (b: BookResult, existing: Story | null) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    setBusy(true);
    setError('');
    try {
      onPick(book, await findStory({ openLibraryKey: book.key }));
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[t.card, { padding: 10, flexDirection: 'row', alignItems: 'center', gap: space.m }]}>
      <SmallCover title={book.title} author={book.author} url={book.coverUrl} id={book.key} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h2" style={{ fontSize: 16 }} numberOfLines={2}>{book.title}</T>
        <T v="muted" numberOfLines={1}>
          {[book.author, book.year, book.pages ? `${book.pages} pages` : null].filter(Boolean).join(' · ')}
        </T>
        <ErrorText>{error}</ErrorText>
      </View>
      <View style={{ width: 84 }}>
        <Button title="Add" onPress={add} loading={busy} />
      </View>
    </View>
  );
}

/**
 * Last step before adding a book: the reading status, and for a book new to Fictionally,
 * its chapter count (Open Library doesn't know it). Discussions are by chapter (PO, 15 Oct).
 */
function ConfirmBook({ book, existing, onCancel }: { book: BookResult; existing: Story | null; onCancel: () => void }) {
  const [chapters, setChapters] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('currently_reading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const n = Number(chapters);
    if (!existing && (!Number.isInteger(n) || n < 1 || n > 5000)) return setError('Enter the number of chapters.');
    setBusy(true);
    setError('');
    try {
      const story = existing ?? (await createBook(book, { chapters: n }));
      await finish(story.id, status);
    } catch (e) {
      setError(friendly(e));
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
      {!existing && (
        <>
          <T v="muted">You’re the first to add this book. How many chapters does it have? Each chapter gets its own discussion.</T>
          <Field label="Chapters" keyboardType="number-pad" value={chapters} onChangeText={setChapters} placeholder="e.g. 40" />
        </>
      )}
      <StatusPicker value={status} onChange={setStatus} />
      <ErrorText>{error}</ErrorText>
      <Button title="Add to my library" onPress={save} loading={busy} />
      <Button variant="link" title="Back to results" onPress={onCancel} />
    </Card>
  );
}

function ManualBook({ initialTitle, onCancel }: { initialTitle: string; onCancel: () => void }) {
  const [title, setTitle] = useState(isbnOf(initialTitle) ? '' : initialTitle.trim());
  const [author, setAuthor] = useState('');
  const [chapters, setChapters] = useState('');
  const [status, setStatus] = useState<LibraryStatus>('currently_reading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const n = Number(chapters);
    if (!title.trim() || !author.trim()) return setError('Add the title and the author.');
    if (!Number.isInteger(n) || n < 1 || n > 5000) return setError('Enter the number of chapters.');
    setBusy(true);
    setError('');
    try {
      const story = await createManualBook({ title: title.trim(), author: author.trim(), chapters: n });
      await finish(story.id, status);
    } catch (e) {
      setError(friendly(e));
      setBusy(false);
    }
  }

  return (
    <Card>
      <T v="h2">Add a book by hand</T>
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Author" value={author} onChangeText={setAuthor} />
      <Field label="Chapters" keyboardType="number-pad" value={chapters} onChangeText={setChapters} />
      <StatusPicker value={status} onChange={setStatus} />
      <ErrorText>{error}</ErrorText>
      <Button title="Add to my library" onPress={save} loading={busy} />
      <Button variant="link" title="Back to search" onPress={onCancel} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fanfiction: the AO3 link is looked up in OUR database only. Found → details are
// filled in; not found → the reader types them (we never fetch from AO3).
// ---------------------------------------------------------------------------

function AddFic() {
  const { c } = useTheme();
  const [link, setLink] = useState('');
  const [existing, setExisting] = useState<Story | null>(null);
  const [checking, setChecking] = useState(false);
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
  const lookup = useRef(0);

  const canonical = normaliseAo3Link(link);
  const badLink = link.trim().length > 0 && !canonical;

  useEffect(() => {
    const id = ++lookup.current;
    setExisting(null);
    if (!canonical) return;
    setChecking(true);
    findStory({ ao3Link: canonical })
      .then((s) => {
        if (id === lookup.current) setExisting(s);
      })
      .catch(() => {}) // not found or offline: the reader fills in the form
      .finally(() => {
        if (id === lookup.current) setChecking(false);
      });
  }, [canonical]);

  function toggleWarning(w: string) {
    setWarnings((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));
  }

  async function save() {
    if (!canonical) return setError('Paste the link to the fic on AO3.');
    setBusy(true);
    setError('');
    try {
      if (existing) {
        await finish(existing.id, status);
        return;
      }
      const n = Number(chapters);
      if (!title.trim() || !author.trim()) throw new Error('Add the title and the author.');
      if (!fandom.trim()) throw new Error('Add the fandom.');
      if (!Number.isInteger(n) || n < 1 || n > 5000) throw new Error('Enter the number of chapters.');
      if (!warnings.length) throw new Error('Pick the archive warnings, as shown on AO3.');
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
      await finish(story.id, status);
    } catch (e) {
      setError(friendly(e));
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.m }}>
      <Field
        label="AO3 link"
        placeholder="archiveofourown.org/works/…"
        value={link}
        onChangeText={setLink}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {checking && <T v="muted">Checking…</T>}
      {badLink && <ErrorText>That doesn’t look like an AO3 work link.</ErrorText>}

      {existing ? (
        <Card tone="band">
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Feather name="check" size={18} color={c.ink} />
            <T v="label">Already on Fictionally</T>
          </View>
          <T v="h2">{existing.title}</T>
          <T v="muted">{[existing.author_name, existing.fandoms[0], existing.ships[0]].filter(Boolean).join(' · ')}</T>
        </Card>
      ) : (
        canonical && !checking && (
          <>
            <Field label="Title" value={title} onChangeText={setTitle} />
            <Field label="Author" value={author} onChangeText={setAuthor} autoCapitalize="none" />
            <Field label="Fandom" value={fandom} onChangeText={setFandom} />
            <Field label="Ship (optional)" value={ship} onChangeText={setShip} />

            <T v="label">Status</T>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Chip label="Complete" active={complete} onPress={() => setComplete(true)} />
              <Chip label="WIP" active={!complete} onPress={() => setComplete(false)} />
            </View>
            <Field
              label={complete ? 'Chapters' : 'Chapters so far'}
              keyboardType="number-pad"
              value={chapters}
              onChangeText={setChapters}
            />

            <T v="label">AO3 rating</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {AO3_RATINGS.map((r) => (
                <Chip key={r} label={r} active={rating === r} onPress={() => setRating(r)} />
              ))}
            </View>

            <T v="label">Archive warnings (as on AO3)</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {AO3_WARNINGS.map((w) => (
                <Chip key={w} label={WARNING_LABEL[w] ?? w} active={warnings.includes(w)} onPress={() => toggleWarning(w)} />
              ))}
            </View>
          </>
        )
      )}

      {canonical && !checking && (
        <>
          <StatusPicker value={status} onChange={setStatus} />
          <ErrorText>{error}</ErrorText>
          <Button title="Add to my library" onPress={save} loading={busy} />
        </>
      )}
    </View>
  );
}
