/* Посимвольная печать и подгонка размера книг навигации под текст обложки. */
(function (global) {
  var timers = {};

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clearTimer(key) {
    if (timers[key]) {
      clearTimeout(timers[key]);
      delete timers[key];
    }
  }

  function fitBookNavSize(btn) {
    var box = btn.querySelector('.book-nav__3d');
    var title = btn.querySelector('.book-nav__title');
    if (!box || !title) return;

    var text = (title.getAttribute('data-typing') || title.textContent || '').trim();
    var isBottom = btn.classList.contains('book-nav--bottom');
    var len = Math.max(text.length, 1);
    var words = text.split(/\s+/).filter(Boolean);
    var multiline = !isBottom && words.length >= 2 && len > 9;

    title.classList.toggle('book-nav__title--multiline', multiline);

    var wRem;
    var hRem;
    if (isBottom) {
      wRem = Math.min(2.75, Math.max(1.95, len * 0.24 + 1.05));
      hRem = wRem * 1.3;
      title.style.setProperty('--book-font', len > 7 ? '0.4rem' : '0.44rem');
    } else {
      wRem = Math.min(6.5, Math.max(2.85, len * 0.27 + 1.2));
      hRem = multiline ? wRem * 1.52 : wRem * 1.3;
      if (len > 14) {
        title.style.setProperty('--book-font', '0.44rem');
      } else if (len > 11) {
        title.style.setProperty('--book-font', '0.48rem');
      } else {
        title.style.setProperty('--book-font', '0.52rem');
      }
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

  function titlesInGroup(root) {
    return (root || document).querySelectorAll('.book-nav.active .book-nav__title');
  }

  function typeActiveInScope(scope) {
    titlesInGroup(scope).forEach(function (el) {
      typeTitle(el, el.getAttribute('data-typing') || '', 42);
    });
  }

  function init() {
    document.querySelectorAll('.book-nav__title').forEach(function (el) {
      var full = el.getAttribute('data-typing') || el.textContent.trim();
      el.setAttribute('data-typing', full);
    });

    fitAllBookNavSizes();

    document.querySelectorAll('.book-nav').forEach(function (btn) {
      btn.addEventListener('click', function () {
        global.requestAnimationFrame(function () {
          if (!btn.classList.contains('active')) return;
          var t = btn.querySelector('.book-nav__title');
          typeTitle(t, t && t.getAttribute('data-typing'), 38);
        });
      });
    });

    typeActiveInScope(document.querySelector('.sidebar-nav'));
    if (global.matchMedia && global.matchMedia('(max-width: 899px)').matches) {
      typeActiveInScope(document.querySelector('.bottom-nav'));
    }
  }

  function onTabChange(tab) {
    document.querySelectorAll('.book-nav[data-tab="' + tab + '"].active .book-nav__title').forEach(function (el) {
      typeTitle(el, el.getAttribute('data-typing'), 38);
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
