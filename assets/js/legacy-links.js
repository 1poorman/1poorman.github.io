/* Invalid front matter once gave Chronos a build-date-prefixed URL. */
(function () {
  'use strict';
  var link = document.querySelector('[data-legacy-chronos]');
  if (!link) return;
  var target = new URL(link.href, window.location.href);
  var repairedPath = window.location.pathname.replace(
    /\/\d{4}-\d{2}-\d{2}-(2026-06-25-chronos-2-learning)\/?$/,
    '/$1/'
  );
  if (repairedPath !== window.location.pathname && repairedPath === target.pathname && target.origin === window.location.origin) {
    target.search = window.location.search;
    target.hash = window.location.hash;
    window.location.replace(target.href);
  }
})();
