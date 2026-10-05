/* Filter the complete, statically rendered catalogue and share its state. */
(function () {
  'use strict';

  var index = document.querySelector('[data-article-index]');
  if (!index) return;
  var queryInput = index.querySelector('[data-filter-query]');
  var topicSelect = index.querySelector('[data-filter-topic]');
  var sortSelect = index.querySelector('[data-filter-sort]');
  var kindButtons = Array.from(index.querySelectorAll('[data-filter-kind]'));
  var resetButtons = Array.from(index.querySelectorAll('[data-filter-reset]'));
  var results = index.querySelector('[data-article-results]');
  var emptyState = index.querySelector('[data-empty-state]');
  var resultCount = index.querySelector('[data-result-count]');
  var lockedKind = index.getAttribute('data-locked-kind') || '';
  var selectedKind = lockedKind;
  var timer = null;
  var composing = false;
  var collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

  function normalise(value) { return value.normalize('NFKC').toLocaleLowerCase('zh-CN').trim(); }

  var articles = Array.from(results.querySelectorAll('[data-article]')).map(function (element, position) {
    return {
      element: element,
      kind: element.getAttribute('data-kind'),
      topics: element.getAttribute('data-topics').split(/\s+/),
      text: normalise(element.getAttribute('data-search')),
      title: element.getAttribute('data-title'),
      published: Number(element.getAttribute('data-published')),
      updated: Number(element.getAttribute('data-updated')),
      position: position
    };
  });

  function writeUrl(mode) {
    if (mode === 'none') return;
    var url = new URL(window.location.href);
    var values = { q: queryInput.value.trim(), topic: topicSelect.value, kind: lockedKind ? '' : selectedKind, sort: sortSelect.value === 'published' ? '' : sortSelect.value };
    Object.keys(values).forEach(function (key) {
      if (values[key]) url.searchParams.set(key, values[key]);
      else url.searchParams.delete(key);
    });
    if (url.href !== window.location.href) window.history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', url.href);
  }

  function render(mode) {
    var terms = normalise(queryInput.value).split(/\s+/).filter(Boolean);
    var topic = topicSelect.value;
    var candidates = articles.filter(function (article) {
      return (!topic || article.topics.includes(topic)) && terms.every(function (term) { return article.text.includes(term); });
    });
    var matching = new Set(candidates.filter(function (article) { return !selectedKind || article.kind === selectedKind; }));
    var ordered = articles.slice().sort(function (a, b) {
      if (sortSelect.value === 'title') return collator.compare(a.title, b.title) || a.position - b.position;
      var key = sortSelect.value === 'updated' ? 'updated' : 'published';
      return b[key] - a[key] || a.position - b.position;
    });
    var fragment = document.createDocumentFragment();
    ordered.forEach(function (article) {
      article.element.hidden = !matching.has(article);
      fragment.appendChild(article.element);
    });
    results.appendChild(fragment);
    kindButtons.forEach(function (button) {
      var kind = button.getAttribute('data-filter-kind');
      button.setAttribute('aria-pressed', String(kind === selectedKind));
      button.querySelector('[data-kind-count]').textContent = String(candidates.filter(function (article) { return !kind || article.kind === kind; }).length);
    });
    var filtered = Boolean(terms.length || topic || (!lockedKind && selectedKind));
    resultCount.textContent = (filtered ? '找到 ' : '共 ') + matching.size + ' 篇记录';
    resetButtons.forEach(function (button) { if (!emptyState.contains(button)) button.hidden = !(filtered || sortSelect.value !== 'published'); });
    emptyState.hidden = matching.size !== 0;
    writeUrl(mode);
  }

  function restoreFromUrl() {
    window.clearTimeout(timer);
    var params = new URLSearchParams(window.location.search);
    queryInput.value = params.get('q') || '';
    var topic = params.get('topic') || '';
    topicSelect.value = Array.from(topicSelect.options).some(function (option) { return option.value === topic; }) ? topic : '';
    var sort = params.get('sort') || 'published';
    sortSelect.value = ['published', 'updated', 'title'].includes(sort) ? sort : 'published';
    var kind = params.get('kind') || '';
    selectedKind = lockedKind || (kindButtons.some(function (button) { return button.getAttribute('data-filter-kind') === kind; }) ? kind : '');
    render('none');
  }

  function scheduleSearch() {
    window.clearTimeout(timer);
    if (!composing) timer = window.setTimeout(function () { render('replace'); }, 180);
  }
  queryInput.addEventListener('input', scheduleSearch);
  queryInput.addEventListener('compositionstart', function () { composing = true; window.clearTimeout(timer); });
  queryInput.addEventListener('compositionend', function () { composing = false; scheduleSearch(); });
  index.querySelector('[data-filter-form]').addEventListener('submit', function (event) {
    event.preventDefault(); window.clearTimeout(timer); render('push');
  });
  [topicSelect, sortSelect].forEach(function (select) {
    select.addEventListener('change', function () { window.clearTimeout(timer); render('push'); });
  });
  kindButtons.forEach(function (button) {
    button.addEventListener('click', function () { window.clearTimeout(timer); selectedKind = button.getAttribute('data-filter-kind'); render('push'); });
  });
  resetButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      window.clearTimeout(timer);
      queryInput.value = ''; topicSelect.value = ''; sortSelect.value = 'published'; selectedKind = lockedKind;
      render('push'); queryInput.focus();
    });
  });
  window.addEventListener('popstate', restoreFromUrl);
  window.addEventListener('pageshow', function (event) { if (event.persisted) restoreFromUrl(); });
  function focusSearchAnchor() { if (window.location.hash === '#article-query') queryInput.focus(); }
  restoreFromUrl();
  index.querySelector('[data-index-controls]').hidden = false;
  window.addEventListener('hashchange', focusSearchAnchor);
  focusSearchAnchor();
})();
