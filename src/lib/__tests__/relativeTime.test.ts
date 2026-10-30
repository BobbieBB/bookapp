import { relativeTime } from '@/lib/relativeTime';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('relativeTime', () => {
  it('says "now" for under a minute', () => {
    expect(relativeTime(ago(20), 'en', NOW)).toBe('now');
    expect(relativeTime(ago(20), 'bg', NOW)).toBe('сега');
  });

  it('counts minutes, hours and days in both languages', () => {
    expect(relativeTime(ago(60), 'en', NOW)).toBe('1 minute ago');
    expect(relativeTime(ago(5 * 60), 'en', NOW)).toBe('5 minutes ago');
    expect(relativeTime(ago(5 * 60), 'bg', NOW)).toBe('преди 5 минути');
    expect(relativeTime(ago(3600), 'bg', NOW)).toBe('преди 1 час');
    expect(relativeTime(ago(3 * 3600), 'bg', NOW)).toBe('преди 3 часа');
    expect(relativeTime(ago(3 * 86400), 'en', NOW)).toBe('3 days ago');
    expect(relativeTime(ago(3 * 86400), 'bg', NOW)).toBe('преди 3 дни');
  });

  it('uses words for exactly one day, week, month or year back', () => {
    expect(relativeTime(ago(86400), 'en', NOW)).toBe('yesterday');
    expect(relativeTime(ago(86400), 'bg', NOW)).toBe('вчера');
    expect(relativeTime(ago(8 * 86400), 'en', NOW)).toBe('last week');
    expect(relativeTime(ago(8 * 86400), 'bg', NOW)).toBe('миналата седмица');
    expect(relativeTime(ago(400 * 86400), 'bg', NOW)).toBe('миналата година');
  });

  it('handles times slightly in the future (a phone clock running behind)', () => {
    expect(relativeTime(new Date(NOW + 5 * 60 * 1000).toISOString(), 'en', NOW)).toBe('in 5 minutes');
  });
});

// Hermes on iOS has no Intl.PluralRules or Intl.RelativeTimeFormat: using either crashed the app at
// start-up in Expo Go (20 Oct 2026). Jest runs in Node, which has both, so hide them here.
describe('without Intl.PluralRules and Intl.RelativeTimeFormat (as on iOS)', () => {
  const saved = { PluralRules: Intl.PluralRules, RelativeTimeFormat: Intl.RelativeTimeFormat };
  beforeEach(() => {
    // @ts-expect-error simulating Hermes
    delete Intl.PluralRules;
    // @ts-expect-error simulating Hermes
    delete Intl.RelativeTimeFormat;
  });
  afterEach(() => {
    Object.assign(Intl, saved);
  });

  it('still loads the translations and formats times', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { translate } = require('@/i18n') as typeof import('@/i18n');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { relativeTime: rt } = require('@/lib/relativeTime') as typeof import('@/lib/relativeTime');
      expect(translate('bg', 'add.pages', { count: 1 })).toBe('1 страница');
      expect(translate('en', 'add.pages', { count: 3 })).toBe('3 pages');
      expect(rt(ago(2 * 3600), 'bg', NOW)).toBe('преди 2 часа');
    });
  });
});
