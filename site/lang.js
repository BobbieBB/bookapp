// Shows one language: ?lang=bg|en, else the last choice, else the browser's language. Without this script both show.
(() => {
  const root = document.documentElement;
  const remember = (lang) => {
    try {
      localStorage.setItem('livami-lang', lang);
    } catch {
      // private mode or blocked storage: the choice just isn't remembered
    }
  };
  const recall = () => {
    try {
      return localStorage.getItem('livami-lang');
    } catch {
      return null;
    }
  };
  const pick = (lang) => {
    root.lang = lang;
    for (const button of document.querySelectorAll('[data-lang]')) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-lang') === lang));
    }
    remember(lang);
  };
  const valid = (lang) => lang === 'bg' || lang === 'en';
  const asked = new URLSearchParams(location.search).get('lang');
  const saved = recall();
  const browser = (navigator.language || '').toLowerCase().startsWith('bg') ? 'bg' : 'en';
  const start = valid(asked) ? asked : valid(saved) ? saved : browser;
  root.lang = start;
  document.addEventListener('DOMContentLoaded', () => {
    pick(start);
    for (const button of document.querySelectorAll('[data-lang]')) {
      button.addEventListener('click', () => pick(button.getAttribute('data-lang')));
    }
  });
})();
