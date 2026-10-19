// English UI text. Each namespace in ./messages keeps its English and Bulgarian side by side.
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
import * as admin from './messages/admin';

export const en = { ...common.en, ...auth.en, ...home.en, ...library.en, ...add.en, ...profile.en, ...story.en, ...room.en, ...discover.en, ...safety.en, ...finishing.en, ...notifications.en, ...covers.en, ...admin.en };

export type MessageKey = keyof typeof en;
