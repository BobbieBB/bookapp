import type { MessageKey } from './en';
import * as common from './messages/common';
import * as auth from './messages/auth';
import * as home from './messages/home';
import * as library from './messages/library';
import * as add from './messages/add';
import * as profile from './messages/profile';
import * as story from './messages/story';
import * as room from './messages/room';
import * as discover from './messages/discover';
import * as safety from './messages/safety';
import * as finishing from './messages/finishing';
import * as notifications from './messages/notifications';
import * as covers from './messages/covers';
import * as account from './messages/account';
import * as admin from './messages/admin';
import type { Message } from './types';

export const bg: Record<MessageKey, Message> = { ...common.bg, ...auth.bg, ...home.bg, ...library.bg, ...add.bg, ...profile.bg, ...story.bg, ...room.bg, ...discover.bg, ...safety.bg, ...finishing.bg, ...notifications.bg, ...covers.bg, ...account.bg, ...admin.bg };
