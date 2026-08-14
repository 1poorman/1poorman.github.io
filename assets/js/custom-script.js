/* 自定义交互：暗色模式 / 阅读进度条 / 返回顶部 / 代码块增强 / 滚动渐入 */
(function () {
  'use strict';

  /* ==================== 暗色模式 ==================== */

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) {
      try { localStorage.setItem('theme', theme); } catch (e) { /* ignore */ }
    }
    var icon = document.querySelector('#theme-toggle i');
    if (icon) {
      icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
  }

  function initThemeToggle() {
    var nav = document.querySelector('.navbar-custom .navbar-nav');
    if (!nav) return;

    var li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = '<a class="nav-link" id="theme-toggle" href="#" title="切换明暗主题" role="button" aria-label="切换明暗主题"><i class="fas fa-moon"></i></a>';
    nav.appendChild(li);

    applyTheme(currentTheme(), false);

    li.querySelector('#theme-toggle').addEventListener('click', function (e) {
      e.preventDefault();
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });

    // 用户未手动选择时跟随系统
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var listener = function (e) {
        var saved = null;
        try { saved = localStorage.getItem('theme'); } catch (err) { /* ignore */ }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
      };
      if (mq.addEventListener) mq.addEventListener('change', listener);
      else if (mq.addListener) mq.addListener(listener);
    }
  }

  /* ==================== 阅读进度条 ==================== */

  function initReadingProgress() {
    var bar = document.createElement('div');
    bar.id = 'reading-progress';
    document.body.appendChild(bar);

    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var scrollTop = window.pageYOffset || doc.scrollTop;
      var max = doc.scrollHeight - doc.clientHeight;
      bar.style.width = (max > 0 ? (scrollTop / max) * 100 : 0) + '%';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  /* ==================== 返回顶部 ==================== */

  function initBackToTop() {
    var btn = document.createElement('button');
    btn.id = 'back-to-top';
    btn.type = 'button';
    btn.title = '返回顶部';
    btn.setAttribute('aria-label', '返回顶部');
    btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        btn.classList.toggle('show', (window.pageYOffset || 0) > 300);
        ticking = false;
      });
    }, { passive: true });
  }

  /* ==================== 代码块增强（Mac 栏 + 语言标签 + 复制） ==================== */

  function copyText(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    done(ok);
  }

  function enhanceCodeBlocks() {
    var blocks = document.querySelectorAll('div.highlighter-rouge');
    blocks.forEach(function (block) {
      if (block.querySelector('.code-header')) return;
      var pre = block.querySelector('pre');
      if (!pre) return;

      var lang = 'text';
      var m = block.className.match(/language-([\w#+-]+)/);
      if (m) lang = m[1];

      var header = document.createElement('div');
      header.className = 'code-header';
      header.innerHTML =
        '<span class="code-dots"><i></i><i></i><i></i></span>' +
        '<span class="code-lang">' + lang + '</span>' +
        '<button class="copy-btn" type="button">copy</button>';
      block.insertBefore(header, block.firstChild);

      var btn = header.querySelector('.copy-btn');
      btn.addEventListener('click', function () {
        copyText(pre.innerText, function (ok) {
          btn.textContent = ok ? 'copied!' : 'failed';
          btn.classList.toggle('copied', ok);
          setTimeout(function () {
            btn.textContent = 'copy';
            btn.classList.remove('copied');
          }, 2000);
        });
      });
    });
  }

  /* ==================== 滚动渐入 ==================== */

  function initFadeIn() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    var targets = document.querySelectorAll('.post-preview, .post-main-col .blog-post, .sidebar-inner');
    if (!targets.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05 });

    targets.forEach(function (el) {
      el.classList.add('fade-in-up');
      observer.observe(el);
    });
  }

  /* ==================== 启动 ==================== */

  function init() {
    initThemeToggle();
    initReadingProgress();
    initBackToTop();
    enhanceCodeBlocks();
    initFadeIn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
