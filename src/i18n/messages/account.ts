import type { Translation } from '../types';

// Deleting your account (docs/DECISIONS.md, "Deleting an account: what happens to comments"), and how
// a deleted reader's comments and reviews are signed.
export const en = {
  'account.deletedReader': 'Deleted reader',
  'account.deleteLink': 'Delete my account',
  'account.title': 'Delete your account',
  'account.intro': 'Your account is deleted for good. This cannot be undone.',
  'account.goesHeading': 'What goes',
  'account.goes':
    'Your profile, library and reading progress, ratings, reactions, follows, blocks, notifications, your own covers, what we counted about how you use the app, and the phones that get your notifications.',
  'account.staysHeading': 'What stays',
  'account.stays': 'Choose what happens to your comments and book reviews.',
  'account.keepComments': 'Keep my comments and reviews, shown as “Deleted reader”',
  'account.keepCommentsHint':
    'Your comments and reviews stay, so replies to them still make sense, with no name, picture or link to you.',
  'account.eraseComments': 'Erase my comments and delete my reviews',
  'account.eraseCommentsHint':
    'Each comment keeps its place in the thread but its text is erased: it shows “This comment was deleted”.',
  'account.delete': 'Delete my account',
  'account.confirm': 'Are you sure? Your account will be deleted right away, and you will be signed out.',
  'account.confirmDelete': 'Yes, delete it forever',
  'account.keep': 'Keep my account',
  'account.failed': 'We couldn’t delete your account. Please try again.',
} as const;

export const bg: Translation<typeof en> = {
  'account.deletedReader': 'Изтрит читател',
  'account.deleteLink': 'Изтрий акаунта ми',
  'account.title': 'Изтриване на акаунта',
  'account.intro': 'Акаунтът ти се изтрива завинаги. Това не може да се отмени.',
  'account.goesHeading': 'Какво се изтрива',
  'account.goes':
    'Профилът ти, библиотеката и напредъкът ти в четенето, оценките, реакциите, следените дискусии, блокиранията, известията, твоите собствени корици, това, което сме отчели за това как ползваш приложението, и телефоните, на които получаваш известия.',
  'account.staysHeading': 'Какво остава',
  'account.stays': 'Избери какво да стане с коментарите и ревютата ти на книги.',
  'account.keepComments': 'Запази коментарите и ревютата ми, с „Изтрит читател“ вместо името ми',
  'account.keepCommentsHint':
    'Коментарите и ревютата ти остават, за да имат смисъл отговорите към тях, но без име, снимка и линк към профила ти.',
  'account.eraseComments': 'Изтрий коментарите и ревютата ми',
  'account.eraseCommentsHint':
    'Всеки коментар остава на мястото си в дискусията, но текстът му се изтрива: на негово място пише „Този коментар е изтрит“.',
  'account.delete': 'Изтрий акаунта ми',
  'account.confirm': 'Наистина ли? Акаунтът ти ще бъде изтрит веднага и ще излезеш от приложението.',
  'account.confirmDelete': 'Да, изтрий го завинаги',
  'account.keep': 'Запази акаунта ми',
  'account.failed': 'Не успяхме да изтрием акаунта ти. Опитай пак.',
};
