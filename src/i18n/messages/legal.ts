import type { Translation } from '../types';

// Accepting the terms and confirming your age, at sign-up and when the terms change (docs/DECISIONS.md,
// "Terms and age: ticked at sign-up"). {age} is MIN_AGE (src/lib/legal.ts).
export const en = {
  'legal.acceptTerms': 'I accept the Terms and the Privacy Policy',
  'legal.terms': 'Terms',
  'legal.privacy': 'Privacy Policy',
  'legal.age': 'I’m at least {age}',
  'legal.ageNote': 'Livami is for readers aged {age} and over.',
  'legal.linkFailed': 'We couldn’t open the page. Please try again.',
  'legal.gateTitle': 'Our terms have changed',
  'legal.gateIntro': 'Before you go on, please read the Terms and the Privacy Policy and tick both boxes.',
  'legal.accept': 'Accept',
  'legal.acceptFailed': 'We couldn’t save that. Please try again.',
} as const;

export const bg: Translation<typeof en> = {
  'legal.acceptTerms': 'Приемам Условията и Политиката за поверителност',
  'legal.terms': 'Условия',
  'legal.privacy': 'Политика за поверителност',
  'legal.age': 'Аз съм на поне {age} години',
  'legal.ageNote': 'Livami е за читатели на {age} и повече години.',
  'legal.linkFailed': 'Не успяхме да отворим страницата. Опитай пак.',
  'legal.gateTitle': 'Условията ни се промениха',
  'legal.gateIntro': 'Преди да продължиш, прочети Условията и Политиката за поверителност и отметни двете полета.',
  'legal.accept': 'Приемам',
  'legal.acceptFailed': 'Не успяхме да запазим това. Опитай пак.',
};
