import type { Messages, Translation } from '../types';

// Sign in, sign up and onboarding.
export const en = {} as const satisfies Messages;

export const bg: Translation<typeof en> = {};
