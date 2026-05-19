/* Мобильная навигация: альбомные книги с текстом на обложке. Десктоп: чистые обложки, подпись сбоку. */
(function (global) {
  var timers = {};
  var mqMobile = global.matchMedia ? global.matchMedia('(max-width: 899px)') : null;

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobileNav() {
    return mqMobile && mqMobile.matches;
  }

  function clearTimer(key) {
    if (timers[key]) {
      clearTimeout(timers[key]);
      delete timers[key];
    }
  }

  function formatMobileText(raw) {
    return String(raw || '')
      .replace(/\|/g, '\n')
      .trim();
  }

  function getTypingText(btn, title) {
    if (btn.classList.contains('book-nav--bottom') && isMobileNav()) {
      return formatMobileText(title.getAttribute('data-typing-mobile') || title.getAttribute('data-typing') || '');
    }
    return '';
  }

  function fitBookNavSize(btn) {
    var box = btn.querySelector('.book-nav__3d');
    var title = btn.querySelector('.book-nav__title');
    if (!box || !title) return;

    var isBottom = btn.classList.contains('book-nav--bottom');
    var isSidebar = !!btn.closest('.sidebar-nav');

    title.classList.remove('book-nav__title--multiline');
    box.classList.remove('book-nav__3d--landscape');

    if (isSidebar) {
      title.textContent = '';
      box.style.removeProperty('--book-w');
      box.style.removeProperty('--book-h');
      title.style.removeProperty('--book-font');
      return;
    }

    if (!isBottom || !isMobileNav()) {
      box.style.removeProperty('--book-w');
      box.style.removeProperty('--book-h');
      title.style.removeProperty('--book-font');
      return;
    }

    box.classList.add('book-nav__3d--landscape');
    var text = getTypingText(btn, title);
    var lines = text.split('\n').filter(function (l) { return l.length; });
    var multiline = lines.length > 1;
    var longest = lines.reduce(function (max, line) {
      return Math.max(max, line.length);
    }, 0);

    title.classList.toggle('book-nav__title--multiline', multiline);

    var wRem = Math.min(7rem, Math.max(3.85, longest * 0.3 + 1.55));
    var hRem = multiline ? Math.max(2.75, wRem * 0.62) : Math.max(2.45, wRem * 0.54);

    if (longest > 11) {
      title.style.setProperty('--book-font', '0.54rem');
    } else if (longest > 8) {
      title.style.setProperty('--book-font', '0.58rem');
    } else {
      title.style.setProperty('--book-font', '0.62rem');
    }

    if (btn.getAttribute('data-tab') === 'settings') {
      wRem = Math.max(wRem, 5.15);
      hRem = Math.max(hRem, 2.95);
      title.style.setProperty('--book-font', '0.56rem');
    }

    if (btn.getAttribute('data-tab') === 'briefing') {
      wRem = Math.max(wRem, 4.55);
      hRem = Math.max(hRem, 2.95);
      title.style.setProperty('--book-font', '0.58rem');
    }

    box.style.setProperty('--book-w', wRem.toFixed(2) + 'rem');
    box.style.setProperty('--book-h', hRem.toFixed(2) + 'rem');
  }

  function fitAllBookNavSizes() {
    document.querySelectorAll('.book-nav').forEach(fitBookNavSize);
  }

  function typeTitle(el, text, speed) {
    if (!el || !text) return;
    var btn = el.closest('.book-nav');
    if (!btn || btn.closest('.sidebar-nav')) return;

    var key = btn.getAttribute('data-tab') || String(Math.random());
    clearTimer(key);
    fitBookNavSize(btn);

    if (prefersReducedMotion()) {
      el.textContent = text;
      return;
    }

    el.textContent = '';
    var i = 0;
    function tick() {
      if (i < text.length) {
        var ch = text.charAt(i++);
        el.textContent += ch;
        timers[key] = setTimeout(tick, speed || 42);
      }
    }
    tick();
  }

  function typeActiveInScope(scope) {
    if (!scope || scope.closest('.sidebar-nav')) return;
    scope.querySelectorAll('.book-nav.active .book-nav__title').forEach(function (el) {
      var btn = el.closest('.book-nav');
      typeTitle(el, getTypingText(btn, el), 42);
    });
  }

  function showMobileTitlesInstant() {
    document.querySelectorAll('.book-nav--bottom .book-nav__title').forEach(function (el) {
      var btn = el.closest('.book-nav');
      var text = getTypingText(btn, el);
      el.textContent = text;
      fitBookNavSize(btn);
    });
  }

  function init() {
    document.querySelectorAll('.sidebar-nav .book-nav__title').forEach(function (el) {
      el.textContent = '';
    });

    fitAllBookNavSizes();

    document.querySelectorAll('.book-nav--bottom').forEach(function (btn) {
      btn.addEventListener('click', function () {
        global.requestAnimationFrame(function () {
          if (!btn.classList.contains('active')) return;
          var t = btn.querySelector('.book-nav__title');
          typeTitle(t, getTypingText(btn, t), 38);
        });
      });
    });

    if (mqMobile && mqMobile.addEventListener) {
      mqMobile.addEventListener('change', function () {
        fitAllBookNavSizes();
        if (isMobileNav()) {
          showMobileTitlesInstant();
          typeActiveInScope(document.querySelector('.bottom-nav'));
        } else {
          document.querySelectorAll('.sidebar-nav .book-nav__title').forEach(function (el) {
            el.textContent = '';
          });
        }
      });
    }

    if (isMobileNav()) {
      showMobileTitlesInstant();
      typeActiveInScope(document.querySelector('.bottom-nav'));
    }
  }

  function onTabChange(tab) {
    if (!isMobileNav()) return;
    document.querySelectorAll('.book-nav--bottom[data-tab="' + tab + '"].active .book-nav__title').forEach(function (el) {
      var btn = el.closest('.book-nav');
      typeTitle(el, getTypingText(btn, el), 38);
    });
  }

  global.NavBooks = {
    init: init,
    onTabChange: onTabChange,
    fitSizes: fitAllBookNavSizes
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
