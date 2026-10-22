import type { Language } from '@/i18n';

// Written out by hand: Hermes on iOS has no Intl.RelativeTimeFormat (tests run in Node, which has it).
type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute';

const UNITS: [Unit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const WORDS: Record<Language, Record<Unit, [one: string, other: string]>> = {
  en: {
    year: ['year', 'years'],
    month: ['month', 'months'],
    week: ['week', 'weeks'],
    day: ['day', 'days'],
    hour: ['hour', 'hours'],
    minute: ['minute', 'minutes'],
  },
  bg: {
    year: ['година', 'години'],
    month: ['месец', 'месеца'],
    week: ['седмица', 'седмици'],
    day: ['ден', 'дни'],
    hour: ['час', 'часа'],
    minute: ['минута', 'минути'],
  },
};

// "yesterday", "last week": what Intl.RelativeTimeFormat gives with numeric: 'auto'.
const LAST: Record<Language, Partial<Record<Unit, string>>> = {
  en: { day: 'yesterday', week: 'last week', month: 'last month', year: 'last year' },
  bg: { day: 'вчера', week: 'миналата седмица', month: 'миналия месец', year: 'миналата година' },
};
const NEXT: Record<Language, Partial<Record<Unit, string>>> = {
  en: { day: 'tomorrow', week: 'next week', month: 'next month', year: 'next year' },
  bg: { day: 'утре', week: 'следващата седмица', month: 'следващия месец', year: 'следващата година' },
};

/** "5 minutes ago" / "преди 5 минути" for an ISO timestamp. */
export function relativeTime(iso: string, language: Language, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const found = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  if (!found) return language === 'bg' ? 'сега' : 'now';
  const [unit, size] = found;
  const value = Math.trunc(seconds / size);
  const n = Math.abs(value);
  if (n === 1 && value < 0 && LAST[language][unit]) return LAST[language][unit]!;
  if (n === 1 && value > 0 && NEXT[language][unit]) return NEXT[language][unit]!;
  const word = WORDS[language][unit][n === 1 ? 0 : 1];
  if (language === 'bg') return value < 0 ? `преди ${n} ${word}` : `след ${n} ${word}`;
  return value < 0 ? `${n} ${word} ago` : `in ${n} ${word}`;
}
