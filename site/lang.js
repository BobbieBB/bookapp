// Shows one language: ?lang=bg|en, else the last choice, else the browser's language. Without this script both show.
(function () {
  var root = document.documentElement;
  var pick = function (lang) {
    root.lang = lang;
    var buttons = document.querySelectorAll('[data-lang]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-lang') === lang));
    }
    try { localStorage.setItem('livami-lang', lang); } catch (e) {}
  };
  var asked = new URLSearchParams(location.search).get('lang');
  var saved = null;
  try { saved = localStorage.getItem('livami-lang'); } catch (e) {}
  var browser = (navigator.language || '').toLowerCase().indexOf('bg') === 0 ? 'bg' : 'en';
  var start = asked === 'bg' || asked === 'en' ? asked : saved === 'bg' || saved === 'en' ? saved : browser;
  document.addEventListener('DOMContentLoaded', function () {
    pick(start);
    var buttons = document.querySelectorAll('[data-lang]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () { pick(this.getAttribute('data-lang')); });
    }
  });
  root.lang = start;
})();
