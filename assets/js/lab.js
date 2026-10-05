/* Shared theme and accessible mobile navigation. */
(function () {
  'use strict';

  var themeButton = document.querySelector('[data-theme-toggle]');
  var themeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function savedTheme() {
    try {
      var value = localStorage.getItem('theme');
      return value === 'light' || value === 'dark' ? value : null;
    } catch (_) { return null; }
  }

  function applyTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) {
      try { localStorage.setItem('theme', theme); } catch (_) { /* Storage is optional. */ }
    }
    if (themeButton) {
      var label = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
      themeButton.setAttribute('aria-label', label);
      themeButton.setAttribute('title', label);
      themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }

  if (themeButton) {
    themeButton.hidden = false;
    applyTheme(savedTheme() || (themeQuery.matches ? 'dark' : 'light'), false);
    themeButton.addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });
    var followSystem = function (event) {
      if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light', false);
    };
    if (themeQuery.addEventListener) themeQuery.addEventListener('change', followSystem);
    else themeQuery.addListener(followSystem);
  }

  var header = document.querySelector('[data-lab-header]');
  var menuButton = document.querySelector('[data-nav-toggle]');
  var navigation = document.getElementById('lab-navigation');
  if (!header || !menuButton || !navigation) return;
  var mobileQuery = window.matchMedia('(max-width: 760px)');
  var menuOpen = false;

  function setMenu(open, returnFocus) {
    menuOpen = open;
    header.setAttribute('data-menu-open', String(open));
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '收起导航' : '展开导航');
    if (returnFocus) menuButton.focus();
  }

  header.setAttribute('data-enhanced', 'true');
  menuButton.hidden = false;
  setMenu(false, false);
  menuButton.addEventListener('click', function () {
    setMenu(!menuOpen, false);
    if (menuOpen) navigation.querySelector('a').focus();
  });
  navigation.addEventListener('click', function (event) {
    if (event.target.closest('a')) setMenu(false, false);
  });
  document.addEventListener('click', function (event) {
    if (menuOpen && !header.contains(event.target)) setMenu(false, false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      setMenu(false, true);
    }
  });
  header.addEventListener('focusout', function () {
    window.requestAnimationFrame(function () {
      if (menuOpen && !header.contains(document.activeElement)) setMenu(false, false);
    });
  });
  var handleViewport = function () {
    setMenu(false, mobileQuery.matches && navigation.contains(document.activeElement));
  };
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleViewport);
  else mobileQuery.addListener(handleViewport);
})();
