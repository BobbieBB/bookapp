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
  'account.stays':
    'Your comments and book reviews stay, so other readers’ discussions still make sense. Your name is taken off them: they show “Deleted reader”, with no picture and no link to you.',
  'account.staysErased':
    'Your comments keep their place, so replies to them still make sense, but their text is erased: they show “This comment was deleted”. Your book reviews are deleted.',
  'account.erase': 'Also delete all my comments',
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
  'account.stays':
    'Коментарите и ревютата ти на книги остават, за да имат смисъл дискусиите на другите читатели. Името ти се маха от тях: вместо него пише „Изтрит читател“, без снимка и без връзка към теб.',
  'account.staysErased':
    'Коментарите ти остават на мястото си, за да имат смисъл отговорите към тях, но текстът им се изтрива: на тяхно място пише „Този коментар е изтрит“. Ревютата ти на книги се изтриват.',
  'account.erase': 'Изтрий и всичките ми коментари',
  'account.delete': 'Изтрий акаунта ми',
  'account.confirm': 'Наистина ли? Акаунтът ти ще бъде изтрит веднага и ще излезеш от приложението.',
  'account.confirmDelete': 'Да, изтрий го завинаги',
  'account.keep': 'Запази акаунта ми',
  'account.failed': 'Не успяхме да изтрием акаунта ти. Опитай пак.',
};
