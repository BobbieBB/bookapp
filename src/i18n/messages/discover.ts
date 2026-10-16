import type { Messages, Translation } from '../types';

// The Discover tab.
export const en = {
  'discover.tab': 'Discover',
  'discover.fanficOnly': 'Discover is for fanfiction for now.',
  'discover.yourFandoms': 'YOUR FANDOMS',
  'discover.allFandoms': 'All fandoms',
  'discover.searchLabel': 'Search fandoms',
  'discover.searching': 'Searching…',
  'discover.noHits': 'No fandoms match that yet.',
  'discover.hitStories': { one: '{count} fic', other: '{count} fics' },
  'discover.lively': 'LIVELY IN YOUR FANDOMS',
  'discover.livelyIn': 'LIVELY IN {fandom}',
  'discover.tier.week': 'Most discussed this week',
  'discover.tier.month': 'Most discussed this month',
  'discover.tier.readers': 'Most read',
  'discover.tier.starter': 'Popular fandoms to start with',
  'discover.empty': 'Nothing lively here yet.',
  'discover.loading': 'Loading Discover',
  'discover.error': 'Could not load Discover. Please try again.',
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'discover.tab': 'Открий',
  'discover.fanficOnly': 'Засега „Открий“ е само за фенфикшън.',
  'discover.yourFandoms': 'ТВОИТЕ ФЕНДЪМИ',
  'discover.allFandoms': 'Всички фендъми',
  'discover.searchLabel': 'Търси фендъми',
  'discover.searching': 'Търсим…',
  'discover.noHits': 'Още няма фендъм, който да пасва.',
  'discover.hitStories': { one: '{count} фик', other: '{count} фика' },
  'discover.lively': 'ОЖИВЕНО В ТВОИТЕ ФЕНДЪМИ',
  'discover.livelyIn': 'ОЖИВЕНО В {fandom}',
  'discover.tier.week': 'Най-обсъждани тази седмица',
  'discover.tier.month': 'Най-обсъждани този месец',
  'discover.tier.readers': 'Най-четени',
  'discover.tier.starter': 'Популярни фендъми, с които да започнеш',
  'discover.empty': 'Още няма нищо оживено тук.',
  'discover.loading': 'Зареждаме „Открий“',
  'discover.error': 'Не успяхме да заредим „Открий“. Опитай пак.',
};
