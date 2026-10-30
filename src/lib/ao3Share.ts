// The text AO3's "Share" button gives (docs/DECISIONS.md, "Filling in a fic from AO3"): the reader
// copies it on AO3 and pastes it into Add, and we read the details from it. Livami never fetches
// anything from AO3 itself.
//
// <a href="https://archiveofourown.org/works/1"><strong>Title</strong></a> (123 words) by <a …><strong>Author</strong></a><br />
// Chapters: 53/?<br />Fandom: <a …>Harry Potter - J. K. Rowling</a><br />Rating: Explicit<br />
// Warnings: Graphic Depictions Of Violence<br />Relationships: Hermione Granger/Draco Malfoy<br />…
import { normaliseAo3Link } from './sources';
import { AO3_RATINGS, AO3_WARNINGS } from './stories';

export type Ao3Share = {
  link: string;
  title: string;
  author: string;
  fandom: string;
  ship: string;
  complete: boolean;
  chapters: number | null;
  rating: (typeof AO3_RATINGS)[number] | null;
  warnings: string[];
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Tags stripped, entities decoded, spaces tidied. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[e.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** The parts after "Name:" in each line, by name. */
function fields(lines: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z ]+):\s*([\s\S]*)$/);
    if (m && !out.has(m[1]!.trim())) out.set(m[1]!.trim(), m[2]!);
  }
  return out;
}

/** The details in AO3's Share text, or null when the text isn't one. */
export function parseAo3Share(input: string): Ao3Share | null {
  const lines = input.split(/<br\s*\/?>|\n/i);
  const first = lines[0] ?? '';
  const work = first.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const link = work ? normaliseAo3Link(work[1]!) : null;
  if (!work || !link) return null;

  // "… (123 words) by <a>A</a>, <a>B</a>" or "by Anonymous"
  const byPart = first.split(/\)\s*by\s+/i)[1] ?? '';
  const author = text(byPart);

  const f = fields(lines.slice(1));
  const chapters = (f.get('Chapters') ?? '').match(/(\d+)\s*\/\s*(\d+|\?)/);
  const published = chapters ? Number(chapters[1]) : null;
  const complete = !!chapters && chapters[2] !== '?' && Number(chapters[2]) === published;

  const list = (name: string) =>
    text(f.get(name) ?? '')
      .split(/\s*,\s*/)
      .filter(Boolean);
  const rating = text(f.get('Rating') ?? '');
  const known = AO3_WARNINGS as readonly string[];

  return {
    link,
    title: text(work[2]!),
    author,
    fandom: list('Fandom')[0] ?? list('Fandoms')[0] ?? '',
    ship: list('Relationships')[0] ?? list('Relationship')[0] ?? '',
    complete,
    chapters: published,
    rating: (AO3_RATINGS as readonly string[]).includes(rating) ? (rating as Ao3Share['rating']) : null,
    warnings: list('Warnings').filter((w) => known.includes(w)),
  };
}
