/* Десктоп: чистые обложки, подписи сбоку. Мобильная нижняя панель: полные названия на обложках + анимация набора. */
(function (global) {
  var timers = {};
  var introPlayed = false;
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

  function getMobileLabel(titleEl) {
    if (!titleEl) return '';
    return formatMobileText(titleEl.getAttribute('data-typing-mobile') || '');
  }

  function clearSidebarCoverText() {
    document.querySelectorAll('.sidebar-nav .book-nav__title').forEach(function (el) {
      el.textContent = '';
    });
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
    var text = getMobileLabel(title);
    var lines = text.split('\n').filter(function (l) { return l.length; });
    var multiline = lines.length > 1;
    var longest = lines.reduce(function (max, line) {
      return Math.max(max, line.length);
    }, 0);

    title.classList.toggle('book-nav__title--multiline', multiline);

    var wRem = Math.min(7.25, Math.max(4, longest * 0.32 + 1.6));
    var hRem = multiline ? Math.max(2.85, wRem * 0.64) : Math.max(2.55, wRem * 0.56);

    if (longest > 11) {
      title.style.setProperty('--book-font', '0.52rem');
    } else if (longest > 8) {
      title.style.setProperty('--book-font', '0.56rem');
    } else {
      title.style.setProperty('--book-font', '0.6rem');
    }

    var tab = btn.getAttribute('data-tab');
    if (tab === 'settings') {
      wRem = Math.max(wRem, 5.35);
      hRem = Math.max(hRem, 3.05);
      title.style.setProperty('--book-font', '0.54rem');
    }
    if (tab === 'briefing') {
      wRem = Math.max(wRem, 4.65);
      hRem = Math.max(hRem, 3.05);
    }
    if (tab === 'portfolio') {
      wRem = Math.max(wRem, 4.55);
      hRem = Math.max(hRem, 3);
    }
    if (tab === 'watchlist') {
      wRem = Math.max(wRem, 4.45);
      hRem = Math.max(hRem, 2.95);
    }

    box.style.setProperty('--book-w', wRem.toFixed(2) + 'rem');
    box.style.setProperty('--book-h', hRem.toFixed(2) + 'rem');
  }

  function fitAllBookNavSizes() {
    document.querySelectorAll('.book-nav').forEach(fitBookNavSize);
  }

  function setCoverText(titleEl, text) {
    if (!titleEl) return;
    titleEl.textContent = text || '';
  }

  function typeTitle(titleEl, text, speed, onDone) {
    if (!titleEl || !text) {
      if (onDone) onDone();
      return;
    }
    var btn = titleEl.closest('.book-nav');
    if (!btn || !btn.classList.contains('book-nav--bottom')) {
      if (onDone) onDone();
      return;
    }

    var key = btn.getAttribute('data-tab') || 'book';
    clearTimer(key);
    fitBookNavSize(btn);

    if (prefersReducedMotion()) {
      setCoverText(titleEl, text);
      if (onDone) onDone();
      return;
    }

    setCoverText(titleEl, '');
    var i = 0;
    function tick() {
      if (i >= text.length) {
        if (onDone) onDone();
        return;
      }
      var ch = text.charAt(i++);
      setCoverText(titleEl, titleEl.textContent + ch);
      var delay = ch === '\n' ? 55 : ch === ' ' ? 28 : speed || 36;
      timers[key] = setTimeout(tick, delay);
    }
    tick();
  }

  function refreshAllMobileCovers(showText) {
    document.querySelectorAll('.book-nav--bottom').forEach(function (btn) {
      var title = btn.querySelector('.book-nav__title');
      var label = getMobileLabel(title);
      if (showText !== false && label) {
        setCoverText(title, label);
      }
      fitBookNavSize(btn);
    });
  }

  function playMobileIntro() {
    if (!isMobileNav() || introPlayed) return;
    introPlayed = true;

    var books = Array.prototype.slice.call(document.querySelectorAll('.book-nav--bottom'));
    if (!books.length) return;

    if (prefersReducedMotion()) {
      refreshAllMobileCovers(true);
      return;
    }

    books.forEach(function (btn) {
      setCoverText(btn.querySelector('.book-nav__title'), '');
    });

    var index = 0;
    function nextBook() {
      if (index >= books.length) {
        refreshAllMobileCovers(true);
        return;
      }
      var btn = books[index++];
      var title = btn.querySelector('.book-nav__title');
      var label = getMobileLabel(title);
      typeTitle(title, label, 34, function () {
        timers.intro = setTimeout(nextBook, 90);
      });
    }
    nextBook();
  }

  function animateActiveTab(tab) {
    if (!isMobileNav()) return;
    document.querySelectorAll('.book-nav--bottom').forEach(function (btn) {
      var title = btn.querySelector('.book-nav__title');
      var label = getMobileLabel(title);
      if (btn.getAttribute('data-tab') === tab && btn.classList.contains('active')) {
        typeTitle(title, label, 32);
      } else if (label) {
        setCoverText(title, label);
      }
    });
  }

  function bindBottomNavClicks() {
    document.querySelectorAll('.book-nav--bottom').forEach(function (btn) {
      if (btn.dataset.navBookBound === '1') return;
      btn.dataset.navBookBound = '1';
      btn.addEventListener('click', function () {
        global.requestAnimationFrame(function () {
          if (!btn.classList.contains('active') || !isMobileNav()) return;
          var title = btn.querySelector('.book-nav__title');
          typeTitle(title, getMobileLabel(title), 30);
        });
      });
    });
  }

  function activateMobile() {
    clearSidebarCoverText();
    fitAllBookNavSizes();
    introPlayed = false;
    if (prefersReducedMotion()) {
      refreshAllMobileCovers(true);
    } else {
      playMobileIntro();
    }
  }

  function activateDesktop() {
    clearSidebarCoverText();
    introPlayed = false;
    document.querySelectorAll('.book-nav--bottom .book-nav__title').forEach(function (el) {
      var label = getMobileLabel(el);
      if (label) setCoverText(el, label);
    });
    fitAllBookNavSizes();
  }

  function init() {
    clearSidebarCoverText();
    bindBottomNavClicks();
    fitAllBookNavSizes();

    if (isMobileNav()) {
      if (prefersReducedMotion()) {
        refreshAllMobileCovers(true);
      } else {
        playMobileIntro();
      }
    } else {
      activateDesktop();
    }

    if (mqMobile && mqMobile.addEventListener) {
      mqMobile.addEventListener('change', function () {
        if (isMobileNav()) {
          introPlayed = false;
          activateMobile();
        } else {
          activateDesktop();
        }
      });
    }

    global.addEventListener('load', function () {
      if (!isMobileNav()) return;
      refreshAllMobileCovers(true);
      fitAllBookNavSizes();
      var active = document.querySelector('.book-nav--bottom.active .book-nav__title');
      if (active && !active.textContent.trim()) {
        introPlayed = false;
        playMobileIntro();
      }
    });
  }

  function onTabChange(tab) {
    if (!isMobileNav()) return;
    animateActiveTab(tab);
  }

  global.NavBooks = {
    init: init,
    onTabChange: onTabChange,
    fitSizes: fitAllBookNavSizes,
    refreshMobile: refreshAllMobileCovers
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
