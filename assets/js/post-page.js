/* 文章页：自动目录 + scroll-spy + 左侧分类折叠 */
(function () {
  'use strict';

  var post = document.querySelector('.blog-post');
  var tocNav = document.getElementById('toc-nav');
  if (!post || !tocNav) return;

  var headings = post.querySelectorAll('h2, h3');
  if (headings.length === 0) {
    tocNav.innerHTML = '<p class="toc-empty">无目录</p>';
    return;
  }

  var links = [];

  var ul = document.createElement('ul');
  ul.className = 'toc-list';

  headings.forEach(function (h) {
    if (!h.id) {
      h.id = h.textContent.trim()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    var li = document.createElement('li');
    li.className = 'toc-item toc-' + h.tagName.toLowerCase();

    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent.trim();
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.getElementById(h.id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      links.forEach(function (link) { link.classList.remove('toc-active'); });
      a.classList.add('toc-active');
    });

    links.push(a);
    li.appendChild(a);
    ul.appendChild(li);
  });

  tocNav.appendChild(ul);

  /* scroll-spy：IntersectionObserver 替代逐帧全量遍历 */
  if ('IntersectionObserver' in window) {
    var visible = new Map();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRect.top : null);
      });
      var active = null;
      var minTop = Infinity;
      visible.forEach(function (top, id) {
        if (top !== null && top >= 0 && top < minTop) {
          minTop = top;
          active = id;
        }
      });
      if (active === null) {
        visible.forEach(function (top, id) {
          if (top === null) visible.delete(id);
        });
      }
      links.forEach(function (a) {
        a.classList.toggle('toc-active', a.getAttribute('href') === '#' + active);
      });
    }, { rootMargin: '-96px 0px -70% 0px', threshold: 0 });
    headings.forEach(function (h) { observer.observe(h); });
  } else {
    var onScroll = function () {
      var scrollY = window.pageYOffset + 120;
      var current = null;
      for (var i = headings.length - 1; i >= 0; i--) {
        if (headings[i].getBoundingClientRect().top + window.pageYOffset <= scrollY) {
          current = headings[i].id;
          break;
        }
      }
      links.forEach(function (a) {
        a.classList.toggle('toc-active', a.getAttribute('href') === '#' + current);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* 左侧分类目录折叠 */
  document.querySelectorAll('.sidebar-category-title').forEach(function (title) {
    title.addEventListener('click', function () {
      var list = this.nextElementSibling;
      var icon = this.querySelector('.sidebar-collapse-icon');
      if (list) {
        list.classList.toggle('collapsed');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-right');
      }
    });
  });
})();
