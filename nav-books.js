/* Посимвольная печать заголовков на обложках книг навигации. */
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

  function typeTitle(el, text, speed) {
    if (!el || !text) return;
    var key = (el.closest('.book-nav') || {}).getAttribute('data-tab') || String(Math.random());
    clearTimer(key);
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

  global.NavBooks = { init: init, onTabChange: onTabChange };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
