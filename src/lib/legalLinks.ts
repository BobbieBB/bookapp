import { useLanguage } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * The web page's address with the app's language and light or dark look, so the Terms open the way the
 * app looks (livami.app reads ?lang= and ?theme=, site/lang.js). Calm is a light theme on the web.
 */
export function legalUrl(url: string, language: string, dark: boolean): string {
  return `${url}?lang=${language}&theme=${dark ? 'dark' : 'light'}`;
}

export function useLegalUrl(): (url: string) => string {
  const { language } = useLanguage();
  const { isDark } = useTheme();
  return (url) => legalUrl(url, language, isDark);
}
