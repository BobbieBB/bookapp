import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import * as Localization from 'expo-localization';
import { Text } from 'react-native';

import { bg } from '../bg';
import { en } from '../en';
import { LanguageProvider, STORAGE_KEY, translate, useLanguage, useT } from '../index';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));
const getLocales = Localization.getLocales as jest.Mock;

function deviceLanguage(languageCode: string | null) {
  getLocales.mockReturnValue([{ languageCode, languageTag: languageCode ?? 'und' }]);
}

describe('dictionaries', () => {
  it('Bulgarian has every English key and nothing else', () => {
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort());
  });

  it('no message is empty, and both languages use the same {placeholders}', () => {
    const placeholders = (m: unknown) =>
      JSON.stringify(m)
        .match(/\{\w+\}/g)
        ?.filter((v, i, a) => a.indexOf(v) === i)
        .sort() ?? [];
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      for (const msg of [en[key], bg[key]]) {
        const texts: string[] = typeof msg === 'string' ? [msg] : Object.values(msg);
        for (const t of texts) expect(`${String(key)}: ${t.trim()}`).not.toBe(`${String(key)}: `);
      }
      expect(`${String(key)} ${placeholders(bg[key])}`).toBe(`${String(key)} ${placeholders(en[key])}`);
    }
  });

  it('the app is called Livami (docs/DECISIONS.md, "Name"), never by its working name', () => {
    expect(JSON.stringify([en, bg])).not.toMatch(/fictionally/i);
    expect(en['add.alreadyHere']).toBe('Already on Livami');
    expect(bg['add.alreadyHere']).toBe('Вече е в Livami');
  });
});

describe('translate', () => {
  it('a key this build does not know (a newer server kind) shows the key instead of crashing', () => {
    expect(translate('en', 'notifications.some_future_kind' as never)).toBe('notifications.some_future_kind');
    expect(translate('bg', 'notifications.some_future_kind' as never, { name: 'x' })).toBe('notifications.some_future_kind');
  });

  it('fills in {placeholders}', () => {
    expect(translate('en', 'library.finishedChapterOf', { n: 3, total: 10 })).toBe('Finished chapter 3 of 10');
  });

  it('picks the plural form for each language', () => {
    expect(translate('en', 'common.chapters', { count: 1 })).toBe('1 chapter');
    expect(translate('en', 'common.chapters', { count: 5 })).toBe('5 chapters');
    expect(translate('bg', 'common.chapters', { count: 1 })).toBe('1 глава');
    expect(translate('bg', 'common.chapters', { count: 5 })).toBe('5 глави');
  });

  it('leaves an unknown placeholder visible rather than printing "undefined"', () => {
    expect(translate('en', 'library.finishedChapterOf', { n: 3 })).toBe('Finished chapter 3 of {total}');
  });

  it('never throws on a key this build does not know (e.g. a notification kind added later): shows the key', () => {
    const unknown = 'notifications.account_suspended' as Parameters<typeof translate>[1];
    expect(() => translate('en', unknown)).not.toThrow();
    expect(translate('bg', unknown, { count: 2 })).toBe('notifications.account_suspended');
  });

  it('falls back to English when only Bulgarian lacks the key', () => {
    const enOnly = 'test.enOnly' as Parameters<typeof translate>[1];
    (en as unknown as Record<string, string>)[enOnly] = 'English only';
    try {
      expect(translate('bg', enOnly)).toBe('English only');
    } finally {
      delete (en as unknown as Record<string, string>)[enOnly];
    }
  });
});

describe('LanguageProvider', () => {
  function Probe() {
    const t = useT();
    const { language, setLanguage } = useLanguage();
    return (
      <>
        <Text testID="lang">{language}</Text>
        <Text testID="text">{t('common.signOut')}</Text>
        <Text testID="switch" onPress={() => setLanguage(language === 'en' ? 'bg' : 'en')}>switch</Text>
      </>
    );
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('follows the phone language when nothing was chosen', async () => {
    deviceLanguage('bg');
    await render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('lang').props.children).toBe('bg');
    expect(screen.getByTestId('text').props.children).toBe(bg['common.signOut']);
  });

  it('uses English for any other phone language', async () => {
    deviceLanguage('de');
    await render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('lang').props.children).toBe('en');
  });

  it('remembers a language chosen in the app over the phone language', async () => {
    deviceLanguage('en');
    const first = await render(<LanguageProvider><Probe /></LanguageProvider>);
    await act(async () => screen.getByTestId('switch').props.onPress());
    expect(screen.getByTestId('text').props.children).toBe(bg['common.signOut']);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('bg');
    await first.unmount();

    await render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('lang').props.children).toBe('bg');
  });

  it('falls back to English when the phone language cannot be read', async () => {
    getLocales.mockImplementation(() => {
      throw new Error('no locale');
    });
    await render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('lang').props.children).toBe('en');
    getLocales.mockReset();
  });

  it('ignores a corrupt stored value', async () => {
    deviceLanguage('en');
    await AsyncStorage.setItem(STORAGE_KEY, 'klingon');
    await render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('lang').props.children).toBe('en');
  });
});
