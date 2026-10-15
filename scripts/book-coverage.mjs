// How well do Open Library and Google Books cover Bulgarian books?
// Run from the repo root:  node scripts/book-coverage.mjs
// Prints, per search, how many results each source found and the top 3 (title · author · language · cover).

const QUERIES = [
  'Пенелъпи Дъглъс',
  'Ноктикадия',
  'Да пробудиш драконче',
  'Хари Потър и философският камък',
  'Алхимизирани',
  'Колелото на времето',
  'Фондация Азимов',
];

const isCyrillic = (s = '') => /[А-Яа-яЁё]/.test(s);

async function openLibrary(q) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=title,author_name,language,cover_i`;
  const res = await fetch(url, { headers: { 'User-Agent': 'FictionallyCoverageTest/0.1' } });
  const body = await res.json();
  return {
    total: body.numFound ?? 0,
    items: (body.docs ?? []).map((d) => ({
      title: d.title,
      author: (d.author_name ?? []).join(', '),
      lang: (d.language ?? []).join('/'),
      cover: !!d.cover_i,
    })),
  };
}

async function googleBooks(q) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10`;
  const body = await (await fetch(url)).json();
  return {
    total: body.totalItems ?? 0,
    items: (body.items ?? []).map((i) => ({
      title: i.volumeInfo?.title,
      author: (i.volumeInfo?.authors ?? []).join(', '),
      lang: i.volumeInfo?.language ?? '',
      cover: !!i.volumeInfo?.imageLinks,
    })),
  };
}

function show(name, r) {
  const bg = r.items.filter((i) => isCyrillic(i.title)).length;
  const covers = r.items.filter((i) => isCyrillic(i.title) && i.cover).length;
  console.log(`  ${name}: ${r.total} found · ${bg} of top ${r.items.length} in Cyrillic · ${covers} of those with a cover`);
  for (const i of r.items.slice(0, 3)) {
    console.log(`     - ${i.title} · ${i.author || '?'} · ${i.lang || '?'} · ${i.cover ? 'cover' : 'no cover'}`);
  }
}

for (const q of QUERIES) {
  console.log(`\n${q}`);
  try { show('Open Library', await openLibrary(q)); } catch (e) { console.log(`  Open Library: error ${e.message}`); }
  try { show('Google Books', await googleBooks(q)); } catch (e) { console.log(`  Google Books: error ${e.message}`); }
}
