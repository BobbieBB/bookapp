import { formatDay } from '../../components/TermsChangeNotice';
import {
  localToday,
  overrideTermsSchedule,
  TERMS_EFFECTIVE,
  TERMS_VERSION,
  TERMS_VERSION_PATTERN,
  termsNoticeKey,
  termsStatus,
} from '../legal';

// Versions sort by date, so the version and the day it takes effect have one strict format
// (docs/DECISIONS.md, "Terms changes take effect on a date").
describe('the terms version format', () => {
  it.each(['2026-11-03', '2026-12-01-b', '2027-01-15-2'])('%s is a version', (v) => {
    expect(v).toMatch(TERMS_VERSION_PATTERN);
  });

  it.each(['2026-11-draft', '2026-11', '2026-1-03', '26-11-03', '2026-11-03-', '2026-11-03 ', 'draft'])('%s is not', (v) => {
    expect(v).not.toMatch(TERMS_VERSION_PATTERN);
  });

  it('the current version and its effective day fit it', () => {
    expect(TERMS_VERSION).toMatch(TERMS_VERSION_PATTERN);
    expect(TERMS_EFFECTIVE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('termsStatus', () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  const older = '2000-01-01';
  const newer = '2999-01-01';
  it.each([
    ['nothing accepted, before the date', null, '2026-11-30', 'required'],
    ['nothing accepted (undefined), before the date', undefined, '2026-11-30', 'required'],
    ['an older version, before the date', older, '2026-11-30', 'upcoming'],
    ['an older version, on the date', older, '2026-12-01', 'required'],
    ['an older version, after the date', older, '2027-03-01', 'required'],
    ['this version, after the date', TERMS_VERSION, '2027-03-01', 'current'],
    ['a newer version, after the date', newer, '2027-03-01', 'current'],
  ] as const)('%s', (_name, accepted, today, expected) => {
    restore = overrideTermsSchedule({ today, effective: '2026-12-01' });
    expect(termsStatus(accepted)).toBe(expected);
  });

  it('readers who accepted the November draft stay current', () => {
    restore = overrideTermsSchedule({ today: '2027-03-01', effective: '2026-12-01' });
    expect(termsStatus('2026-11-draft')).toBe('current');
  });
});

describe('localToday', () => {
  it('pads the month and the day', () => {
    expect(localToday(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });

  it('is the local calendar day, not the UTC one', () => {
    expect(localToday(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});

describe('overrideTermsSchedule', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('cannot be called outside tests', () => {
    process.env.NODE_ENV = 'production';
    expect(() => overrideTermsSchedule({ today: '2099-01-01' })).toThrow();
    process.env.NODE_ENV = env;
    expect(termsStatus(null)).toBe('required');
    expect(termsStatus(TERMS_VERSION)).toBe('current');
  });
});

describe('the notice dismissal key', () => {
  it('is per reader', () => {
    expect(termsNoticeKey('a')).not.toBe(termsNoticeKey('b'));
    expect(termsNoticeKey('a')).toContain('a');
  });
});

// Hermes ships varying ICU data, so dates are spelt from our own month names, not toLocaleDateString.
describe('formatDay', () => {
  let locale: jest.SpyInstance;
  beforeEach(() => {
    locale = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('12/1/2026');
  });
  afterEach(() => locale.mockRestore());

  it.each([
    ['en', '2026-12-01', '1 December 2026'],
    ['en', '2027-01-15', '15 January 2027'],
    ['bg', '2026-12-01', '1 декември 2026 г.'],
    ['bg', '2027-05-09', '9 май 2027 г.'],
  ] as const)('%s %s', (language, day, expected) => {
    expect(formatDay(day, language)).toBe(expected);
  });

  it('names every month in both languages', () => {
    const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`);
    expect(months.map((d) => formatDay(d, 'en').split(' ')[1])).toEqual([
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]);
    expect(months.map((d) => formatDay(d, 'bg').split(' ')[1])).toEqual([
      'януари', 'февруари', 'март', 'април', 'май', 'юни',
      'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
    ]);
  });
});
