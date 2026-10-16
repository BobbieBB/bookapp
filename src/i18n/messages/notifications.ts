import type { Messages, Translation } from '../types';

// Replies, mentions and reactions to you, and the "new comments" hint on Continue Reading.
export const en = {
  'notifications.title': 'Notifications',
  'notifications.back': 'Back',
  'notifications.reply': '{name} replied to you',
  'notifications.mention': '{name} mentioned you',
  'notifications.reaction': '{name} reacted to your comment',
  'notifications.where': '{story} · {room}',
  'notifications.unread': 'Unread',
  'notifications.empty': 'Nothing yet. Replies and mentions will show up here.',
  'notifications.error': 'Could not load your notifications. Try again in a moment.',
  'notifications.seeAll': 'See all',
  'notifications.newComments': {
    one: '{count} new comment in chapter {chapter}',
    other: '{count} new comments in chapter {chapter}',
  },
} as const satisfies Messages;

export const bg: Translation<typeof en> = {
  'notifications.title': 'Известия',
  'notifications.back': 'Назад',
  'notifications.reply': '{name} ти отговори',
  'notifications.mention': '{name} те спомена',
  'notifications.reaction': '{name} реагира на коментара ти',
  'notifications.where': '{story} · {room}',
  'notifications.unread': 'Непрочетено',
  'notifications.empty': 'Още нищо. Отговорите и споменаванията ще се показват тук.',
  'notifications.error': 'Известията не се заредиха. Опитай пак след малко.',
  'notifications.seeAll': 'Виж всички',
  'notifications.newComments': {
    one: '{count} нов коментар в глава {chapter}',
    other: '{count} нови коментара в глава {chapter}',
  },
};
