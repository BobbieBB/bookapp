import type { Messages, Translation } from '../types';

// Import from Goodreads (app/import-goodreads.tsx).
export const en = {
  'goodreads.link': 'Import from Goodreads',
  'goodreads.title': 'Import from Goodreads',
  'goodreads.intro':
    'Bring the books you’ve read, are reading and want to read, with your star ratings. Reviews stay on Goodreads.',
  'goodreads.onComputer': 'Goodreads gives you your library only on a computer, so the import happens there too.',
  'goodreads.onComputerSteps':
    'On a computer, open {url}, sign in with this account, then Profile → Import from Goodreads. Your books will show here too.',
  'goodreads.step1': '1. Export your library from Goodreads',
  'goodreads.step1Detail': 'On goodreads.com: My Books → Import and export → Export Library. Download the file it makes.',
  'goodreads.step2': '2. Choose that file',
  'goodreads.chooseFile': 'Choose the file',
  'goodreads.notExport': 'That doesn’t look like a Goodreads export. Choose the .csv file from “Export Library”.',
  'goodreads.empty': 'There are no books on your Read, Currently Reading or Want to Read shelves in this file.',
  'goodreads.found': { one: 'Found {count} book. Which shelves should come?', other: 'Found {count} books. Which shelves should come?' },
  'goodreads.shelf.read': 'Read → Finished ({count})',
  'goodreads.shelf.currently-reading': 'Currently Reading ({count})',
  'goodreads.shelf.to-read': 'Want to Read ({count})',
  'goodreads.whatComes':
    'Your ratings come too; reviews don’t. Books already in your library are skipped. Imported books have no chapter count yet: set it on a book’s page to open its rooms.',
  'goodreads.import': { one: 'Import {count} book', other: 'Import {count} books' },
  'goodreads.importing': 'Importing {done} of {total}…',
  'goodreads.keepOpen': 'Keep this page open. It takes about a second a book.',
  'goodreads.stop': 'Stop',
  'goodreads.done': { one: 'Added {count} book to your library.', other: 'Added {count} books to your library.' },
  'goodreads.already': { one: '{count} was already there.', other: '{count} were already there.' },
  'goodreads.setChapters': 'Set the chapter count on a book’s page to open its rooms.',
  'goodreads.notFound': { one: 'We couldn’t find {count} book:', other: 'We couldn’t find {count} books:' },
  'goodreads.addByHand': 'Add them from Add a book: search by title, or add them by hand.',
  'goodreads.toLibrary': 'To my library',
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'goodreads.link': 'Импорт от Goodreads',
  'goodreads.title': 'Импорт от Goodreads',
  'goodreads.intro':
    'Пренеси книгите, които си прочела, четеш и искаш да прочетеш, заедно с оценките си. Отзивите остават в Goodreads.',
  'goodreads.onComputer': 'Goodreads дава библиотеката ти само от компютър, затова и импортът става там.',
  'goodreads.onComputerSteps':
    'На компютър отвори {url}, влез с този акаунт, после Профил → Импорт от Goodreads. Книгите ще се появят и тук.',
  'goodreads.step1': '1. Изтегли библиотеката си от Goodreads',
  'goodreads.step1Detail': 'В goodreads.com: My Books → Import and export → Export Library. Изтегли файла, който се създава.',
  'goodreads.step2': '2. Избери този файл',
  'goodreads.chooseFile': 'Избери файла',
  'goodreads.notExport': 'Това не прилича на файл от Goodreads. Избери .csv файла от „Export Library“.',
  'goodreads.empty': 'В този файл няма книги на рафтовете Read, Currently Reading или Want to Read.',
  'goodreads.found': { one: 'Намерихме {count} книга. Кои рафтове да пренесем?', other: 'Намерихме {count} книги. Кои рафтове да пренесем?' },
  'goodreads.shelf.read': 'Read → Прочетени ({count})',
  'goodreads.shelf.currently-reading': 'Чета в момента ({count})',
  'goodreads.shelf.to-read': 'Искам да прочета ({count})',
  'goodreads.whatComes':
    'Оценките идват с тях, отзивите не. Книгите, които вече са в библиотеката ти, се пропускат. Пренесените книги още нямат брой глави: задай го на страницата на книгата, за да се отворят стаите ѝ.',
  'goodreads.import': { one: 'Пренеси {count} книга', other: 'Пренеси {count} книги' },
  'goodreads.importing': 'Пренасяме {done} от {total}…',
  'goodreads.keepOpen': 'Не затваряй страницата. Отнема около секунда на книга.',
  'goodreads.stop': 'Спри',
  'goodreads.done': { one: 'Добавихме {count} книга в библиотеката ти.', other: 'Добавихме {count} книги в библиотеката ти.' },
  'goodreads.already': { one: '{count} вече беше там.', other: '{count} вече бяха там.' },
  'goodreads.setChapters': 'Задай броя глави на страницата на книгата, за да се отворят стаите ѝ.',
  'goodreads.notFound': { one: 'Не намерихме {count} книга:', other: 'Не намерихме {count} книги:' },
  'goodreads.addByHand': 'Добави ги от „Добави книга“: потърси по заглавие или ги добави на ръка.',
  'goodreads.toLibrary': 'Към библиотеката',
};
