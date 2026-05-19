/* Печать на обложках: десктоп — короткий текст + подпись сбоку; мобильная — альбомная книга с полным названием. */
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

  function getTypingText(btn, title) {
    if (btn.classList.contains('book-nav--bottom') && isMobileNav()) {
      return (title.getAttribute('data-typing-mobile') || title.getAttribute('data-typing') || '').trim();
    }
    return (title.getAttribute('data-typing') || title.textContent || '').trim();
  }

  function fitBookNavSize(btn) {
    var box = btn.querySelector('.book-nav__3d');
    var title = btn.querySelector('.book-nav__title');
    if (!box || !title) return;

    var text = getTypingText(btn, title);
    var isBottom = btn.classList.contains('book-nav--bottom');
    var isSidebar = !!btn.closest('.sidebar-nav');

    title.classList.remove('book-nav__title--multiline');
    box.classList.remove('book-nav__3d--landscape');

    if (isSidebar) {
      box.style.removeProperty('--book-w');
      box.style.removeProperty('--book-h');
      title.style.removeProperty('--book-font');
      return;
    }

    if (!isBottom) return;

    if (!isMobileNav()) {
      box.style.removeProperty('--book-w');
      box.style.removeProperty('--book-h');
      title.style.removeProperty('--book-font');
      return;
    }

    box.classList.add('book-nav__3d--landscape');
    var len = Math.max(text.length, 1);
    var words = text.split(/\s+/).filter(Boolean);
    var multiline = words.length >= 2 && len > 8;
    title.classList.toggle('book-nav__title--multiline', multiline);

    var wRem = Math.min(5.75, Math.max(3.35, len * 0.24 + 1.35));
    var hRem = Math.max(2.15, wRem * 0.56);
    if (multiline) {
      hRem = Math.max(2.45, wRem * 0.62);
    }

    if (len > 12) {
      title.style.setProperty('--book-font', '0.52rem');
    } else if (len > 9) {
      title.style.setProperty('--book-font', '0.56rem');
    } else {
      title.style.setProperty('--book-font', '0.6rem');
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
    var key = (btn && btn.getAttribute('data-tab')) || String(Math.random());
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
        el.textContent += text.charAt(i++);
        timers[key] = setTimeout(tick, speed || 42);
      }
    }
    tick();
  }

  function typeActiveInScope(scope) {
    (scope || document).querySelectorAll('.book-nav.active .book-nav__title').forEach(function (el) {
      var btn = el.closest('.book-nav');
      typeTitle(el, getTypingText(btn, el), 42);
    });
  }

  function init() {
    document.querySelectorAll('.book-nav__title').forEach(function (el) {
      var btn = el.closest('.book-nav');
      var text = getTypingText(btn, el);
      if (!el.getAttribute('data-typing')) {
        el.setAttribute('data-typing', text);
      }
    });

    fitAllBookNavSizes();

    document.querySelectorAll('.book-nav').forEach(function (btn) {
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
        var sidebar = document.querySelector('.sidebar-nav');
        var bottom = document.querySelector('.bottom-nav');
        if (isMobileNav()) {
          typeActiveInScope(bottom);
        } else {
          typeActiveInScope(sidebar);
        }
      });
    }

    if (isMobileNav()) {
      typeActiveInScope(document.querySelector('.bottom-nav'));
    } else {
      typeActiveInScope(document.querySelector('.sidebar-nav'));
    }
  }

  function onTabChange(tab) {
    document.querySelectorAll('.book-nav[data-tab="' + tab + '"].active').forEach(function (btn) {
      var el = btn.querySelector('.book-nav__title');
      if (el) typeTitle(el, getTypingText(btn, el), 38);
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
