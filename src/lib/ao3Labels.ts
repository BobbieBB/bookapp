import type { MessageKey } from '../i18n/en';
import type { AO3_RATINGS, AO3_WARNINGS } from './stories';

// Short labels for AO3's archive warnings and ratings: what is shown, never what is stored (that stays AO3's wording).
export const WARNING_LABEL: Record<(typeof AO3_WARNINGS)[number], MessageKey> = {
  'No Archive Warnings Apply': 'add.warnNone',
  'Creator Chose Not To Use Archive Warnings': 'add.warnUnchosen',
  'Graphic Depictions Of Violence': 'add.warnViolence',
  'Major Character Death': 'add.warnDeath',
  'Rape/Non-Con': 'add.warnNonCon',
  'Underage Sex': 'add.warnUnderage',
};

export const RATING_LABEL: Record<(typeof AO3_RATINGS)[number], MessageKey> = {
  'General Audiences': 'add.ratingGeneral',
  'Teen And Up Audiences': 'add.ratingTeen',
  Mature: 'add.ratingMature',
  Explicit: 'add.ratingExplicit',
  'Not Rated': 'add.ratingNotRated',
};
