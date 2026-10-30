import type { Messages, Translation } from '../types';

// The Home tab.
export const en = {
  'home.greetingMorning': '{day} MORNING READING',
  'home.greetingAfternoon': '{day} AFTERNOON READING',
  'home.greetingNight': '{day} NIGHT READING',
  'home.hi': 'Hi, {name}',
  'home.continueFanfic': 'CONTINUE READING · FANFICTION',
  'home.continueBooks': 'CONTINUE READING · BOOKS',
  'home.emptyTitle': 'Nothing on the go yet',
  'home.idleTitle': 'Nothing you’re reading right now',
  'home.idleHint': 'Pick something up from your library, or tap + to add a new story.',
  'home.toLibrary': 'Open My Library',
  'home.newChapter': 'Chapter {n} is out',
  'home.emptyHint': 'Tap + to add a book or a fic. The chapters you finish unlock their discussions.',
  'home.repliesTitle': 'REPLIES TO YOU',
  'home.repliesEmpty': 'When someone replies to you or mentions you, you’ll see it here.',
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'home.greetingMorning': '{day} · СУТРЕШНО ЧЕТЕНЕ',
  'home.greetingAfternoon': '{day} · СЛЕДОБЕДНО ЧЕТЕНЕ',
  'home.greetingNight': '{day} · НОЩНО ЧЕТЕНЕ',
  'home.hi': 'Здравей, {name}',
  'home.continueFanfic': 'ПРОДЪЛЖИ ДА ЧЕТЕШ · ФЕНФИКШЪН',
  'home.continueBooks': 'ПРОДЪЛЖИ ДА ЧЕТЕШ · КНИГИ',
  'home.emptyTitle': 'Още нищо не четеш',
  'home.idleTitle': 'В момента не четеш нищо',
  'home.idleHint': 'Избери нещо от библиотеката си или натисни +, за да добавиш нова история.',
  'home.toLibrary': 'Към моята библиотека',
  'home.newChapter': 'Излезе глава {n}',
  'home.emptyHint': 'Натисни +, за да добавиш книга или фик. Главите, които прочиташ, отключват своите обсъждания.',
  'home.repliesTitle': 'ОТГОВОРИ ЗА ТЕБ',
  'home.repliesEmpty': 'Когато някой ти отговори или те спомене, ще го видиш тук.',
};
