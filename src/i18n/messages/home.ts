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
  'home.emptyHint': 'Натисни +, за да добавиш книга или фик. Главите, които прочиташ, отключват своите обсъждания.',
  'home.repliesTitle': 'ОТГОВОРИ ЗА ТЕБ',
  'home.repliesEmpty': 'Когато някой ти отговори или те спомене, ще го видиш тук.',
};
