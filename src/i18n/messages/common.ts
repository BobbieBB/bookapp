import type { Messages, Translation } from '../types';

export const en = {
  'common.signOut': 'Sign out',
  'common.chapters': { one: '{count} chapter', other: '{count} chapters' },
  'common.home': 'Home',
  'common.library': 'Library',
  'common.profile': 'Profile',
  'common.name': 'Name',
  'common.tryAgain': 'Try again',
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'common.signOut': 'Изход',
  'common.chapters': { one: '{count} глава', other: '{count} глави' },
  'common.home': 'Начало',
  'common.library': 'Библиотека',
  'common.profile': 'Профил',
  'common.name': 'Име',
  'common.tryAgain': 'Опитай пак',
};
