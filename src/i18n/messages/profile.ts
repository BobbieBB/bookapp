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
  'profile.fandoms': 'Your fandoms',
  'profile.fandomsHint': 'Fandoms you pick shape what Discover shows you.',
  'profile.fandomsEmpty': 'No fandoms picked yet.',
  'profile.fandomsSuggested': 'From your library',
  'profile.removeFandom': 'Remove {fandom} from your fandoms',
  'profile.addFandom': 'Add {fandom} to your fandoms',
  'profile.fandomsError': 'Could not update your fandoms. Please try again.',
  'profile.push': 'Notifications on this phone',
  'profile.pushHint': 'Get a buzz when someone replies to you or mentions you. It never shows what they wrote.',
  'profile.pushDenied': 'Turn on notifications for Fictionally in your phone’s settings.',
  'profile.pushUnsupported': 'Push notifications need a phone.',
  'profile.pushNotConfigured': 'Push notifications aren’t set up yet.',
  'profile.pushError': 'Could not change notifications. Please try again.',
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'profile.readsBooks': 'Чете: книги',
  'profile.readsFanfiction': 'Чете: фенфикшън',
  'profile.readsBoth': 'Чете: книги и фенфикшън',
  'profile.authorsWelcome': 'Авторите са добре дошли тук',
  'profile.authorsNote':
    'Всеки фик е подарък за общността. Пазим само връзка към твоята творба и връщаме читателите при теб за kudos и коментари. Ако имаш фик и предпочиташ да не е в списъка тук, можеш да ни помолиш да го скрием по всяко време.',
  'profile.language': 'Език',
  'profile.fandoms': 'Твоите фендъми',
  'profile.fandomsHint': 'Фендъмите, които избереш, определят какво ти показва „Открий“.',
  'profile.fandomsEmpty': 'Още не си избрал фендъми.',
  'profile.fandomsSuggested': 'От твоята библиотека',
  'profile.removeFandom': 'Махни {fandom} от твоите фендъми',
  'profile.addFandom': 'Добави {fandom} към твоите фендъми',
  'profile.fandomsError': 'Не успяхме да обновим фендъмите ти. Опитай пак.',
  'profile.push': 'Известия на този телефон',
  'profile.pushHint': 'Получаваш известие, когато някой ти отговори или те спомене. То никога не показва какво е написал.',
  'profile.pushDenied': 'Включи известията за Fictionally в настройките на телефона си.',
  'profile.pushUnsupported': 'Известията се получават на телефон.',
  'profile.pushNotConfigured': 'Известията още не са настроени.',
  'profile.pushError': 'Не успяхме да променим известията. Опитай пак.',
};
