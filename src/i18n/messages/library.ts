import type { Messages, Translation } from '../types';

export const en = {
  'library.progressChapter': 'Chapter {n} of {total}',
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'library.progressChapter': 'Глава {n} от {total}',
};
