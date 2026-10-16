// English UI text. Each namespace in ./messages keeps its English and Bulgarian side by side.
import * as common from './messages/common';
import * as auth from './messages/auth';
import * as home from './messages/home';
import * as library from './messages/library';
import * as add from './messages/add';
import * as profile from './messages/profile';

export const en = { ...common.en, ...auth.en, ...home.en, ...library.en, ...add.en, ...profile.en };

export type MessageKey = keyof typeof en;
