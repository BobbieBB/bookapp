import type { Messages, Translation } from '../types';

// The Profile tab.
export const en = {
  'profile.readsBooks': 'Reads: Books',
  'profile.readsFanfiction': 'Reads: Fanfiction',
  'profile.readsBoth': 'Reads: Books & Fanfiction',
  'profile.authorsWelcome': 'Authors are welcome here',
  'profile.authorsNote':
    'Every fic is a gift to the community. We only keep a link to your work and send readers back to you for kudos and comments. If you wrote a fic and would rather it wasn’t listed here, you can ask us to hide it at any time.',
  'profile.language': 'Language',
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'profile.readsBooks': 'Чете: книги',
  'profile.readsFanfiction': 'Чете: фенфикшън',
  'profile.readsBoth': 'Чете: книги и фенфикшън',
  'profile.authorsWelcome': 'Авторите са добре дошли тук',
  'profile.authorsNote':
    'Всеки фик е подарък за общността. Пазим само връзка към твоята творба и връщаме читателите при теб за kudos и коментари. Ако имаш фик и предпочиташ да не е в списъка тук, можеш да ни помолиш да го скрием по всяко време.',
  'profile.language': 'Език',
};
