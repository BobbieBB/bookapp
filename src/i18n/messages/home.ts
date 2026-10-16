import type { Messages, Translation } from '../types';

// The Home tab.
export const en = {} as const satisfies Messages;

export const bg: Translation<typeof en> = {};
