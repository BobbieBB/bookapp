import type { Messages, Translation } from '../types';

export const en = {
  'common.signOut': 'Sign out',
  'common.chapters': { one: '{count} chapter', other: '{count} chapters' },
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'common.signOut': 'Изход',
  'common.chapters': { one: '{count} глава', other: '{count} глави' },
};
