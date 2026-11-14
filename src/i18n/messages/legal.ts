import type { Translation } from '../types';

// Accepting the terms and confirming your age, at sign-up and when the terms change (docs/DECISIONS.md,
// "Terms and age: ticked at sign-up"). {age} is MIN_AGE (src/lib/legal.ts). The Terms are accepted; the
// Privacy Policy is only read, since a privacy notice is information, not an agreement (GDPR arts. 7(4), 13).
// {date} is TERMS_EFFECTIVE in the reader's language ("Terms changes take effect on a date").
export const en = {
  'legal.acceptTerms': 'I accept the Terms. I have read the Privacy Policy.',
  'legal.terms': 'Terms',
  'legal.privacy': 'Privacy Policy',
  'legal.openTerms': 'Open the Terms',
  'legal.openPrivacy': 'Open the Privacy Policy',
  'legal.tickBoth': 'Tick both boxes to continue.',
  'legal.age': 'I’m at least {age}',
  'legal.ageNote': 'Livami is for readers aged {age} and over.',
  'legal.linkFailed': 'We couldn’t open the page. Please try again.',
  'legal.gateTitle': 'Our terms have changed',
  'legal.gateIntro': 'Before you go on, please read the Terms and the Privacy Policy and tick both boxes.',
  'legal.accept': 'Accept',
  'legal.acceptFailed': 'We couldn’t save that. Please try again.',
  'legal.changeTitle': 'Our terms change on {date}',
  'legal.changeBody': 'Nothing changes for you until then. From that day, you’ll accept the new Terms before going on.',
  'legal.readNewTerms': 'Read the new Terms',
  'legal.acceptNow': 'Accept now',
  'legal.dismiss': 'Dismiss',
  'legal.earlyTitle': 'The new terms',
  'legal.earlyIntro': 'They apply from {date}. To accept them now, read the Terms and the Privacy Policy and tick both boxes.',
  'legal.notNow': 'Not now',
} as const;

export const bg: Translation<typeof en> = {
  'legal.acceptTerms': 'Приемам Условията. Прочетох Политиката за поверителност.',
  'legal.terms': 'Условия',
  'legal.privacy': 'Политика за поверителност',
  'legal.openTerms': 'Отвори Условията',
  'legal.openPrivacy': 'Отвори Политиката за поверителност',
  'legal.tickBoth': 'Отметни двете полета, за да продължиш.',
  'legal.age': 'Аз съм на поне {age} години',
  'legal.ageNote': 'Livami е за читатели на {age} и повече години.',
  'legal.linkFailed': 'Не успяхме да отворим страницата. Опитай пак.',
  'legal.gateTitle': 'Условията ни се промениха',
  'legal.gateIntro': 'Преди да продължиш, прочети Условията и Политиката за поверителност и отметни двете полета.',
  'legal.accept': 'Приемам',
  'legal.acceptFailed': 'Не успяхме да запазим това. Опитай пак.',
  'legal.changeTitle': 'Условията ни се променят на {date}',
  'legal.changeBody': 'Дотогава за теб нищо не се променя. От този ден ще трябва да приемеш новите Условия, за да продължиш.',
  'legal.readNewTerms': 'Прочети новите Условия',
  'legal.acceptNow': 'Приемам сега',
  'legal.dismiss': 'Скрий',
  'legal.earlyTitle': 'Новите условия',
  'legal.earlyIntro': 'Важат от {date}. За да ги приемеш сега, прочети Условията и Политиката за поверителност и отметни двете полета.',
  'legal.notNow': 'Не сега',
};
