import type { Language } from '@/i18n';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 minutes ago" / "преди 5 минути" for an ISO timestamp. */
export function relativeTime(iso: string, language: Language, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  return unit ? formatter.format(Math.trunc(seconds / unit[1]), unit[0]) : formatter.format(0, 'second');
}
