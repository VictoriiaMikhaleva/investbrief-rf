/* TextType — vanilla port of React Bits TextType for hint lines. */
(function (global) {
  var HINT_DEFAULTS = {
    typingSpeed: 155,
    deletingSpeed: 35,
    pauseDuration: 3900,
    initialDelay: 0,
    loop: false,
    showCursor: false,
    cursorCharacter: '|',
    cursorBlinkDuration: 1.8,
    variableSpeed: { min: 25, max: 225 },
    startOnVisible: true,
    threshold: 0.1
  };

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden]')) return false;
    var panel = el.closest('.panel');
    if (panel && !panel.classList.contains('active')) return false;
    return true;
  }

  function plainTextFromHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('br').forEach(function (br) {
      br.replaceWith(document.createTextNode('\n'));
    });
    return (tmp.textContent || '').replace(/\r\n/g, '\n');
  }

  function plainTextFromElement(el) {
    if (el.dataset.typePlainText) return el.dataset.typePlainText;
    return plainTextFromHtml(el.innerHTML);
  }

  function getRandomSpeed(options) {
    if (!options.variableSpeed) return options.typingSpeed;
    var min = options.variableSpeed.min;
    var max = options.variableSpeed.max;
    return Math.random() * (max - min) + min;
  }

  function destroyController(el) {
    var ctrl = el._hintTypeController;
    if (!ctrl) return;
    if (ctrl.timeout) clearTimeout(ctrl.timeout);
    if (ctrl.observer) ctrl.observer.disconnect();
    if (ctrl.cursorTween && global.gsap) ctrl.cursorTween.kill();
    el._hintTypeController = null;
  }

  function finishTyping(el, ctrl) {
    el.classList.add('hint-type--done');
    el.dataset.typeAnimated = '1';
    delete el.dataset.typePending;
    if (ctrl.options.onComplete) ctrl.options.onComplete(el);
    if (ctrl.sourceHtml && ctrl.sourceHtml.indexOf('<') !== -1) {
      el.innerHTML = ctrl.sourceHtml;
      el.classList.add('text-type', 'hint-type--done');
    }
  }

  function mountShell(el, options) {
    var sourceHtml = el.innerHTML;
    var plain = plainTextFromElement(el);
    el.dataset.typeSourceHtml = sourceHtml;
    el.dataset.typePlainText = plain;
    el.classList.add('text-type');
    el.innerHTML = '';
    var content = document.createElement('span');
    content.className = 'text-type__content';
    el.appendChild(content);
    var cursor = null;
    var cursorTween = null;
    if (options.showCursor) {
      cursor = document.createElement('span');
      cursor.className = 'text-type__cursor';
      cursor.textContent = options.cursorCharacter;
      el.appendChild(cursor);
      if (global.gsap) {
        global.gsap.set(cursor, { opacity: 1 });
        cursorTween = global.gsap.to(cursor, {
          opacity: 0,
          duration: options.cursorBlinkDuration,
          repeat: -1,
          yoyo: true,
          ease: 'power2.inOut'
        });
      }
    }
    return { sourceHtml: sourceHtml, plain: plain, content: content, cursor: cursor, cursorTween: cursorTween };
  }

  function runTypewriter(el, options, immediate) {
    if (el.dataset.typeAnimated === '1') return;
    destroyController(el);

    if (prefersReducedMotion()) {
      el.classList.add('hint-type--done', 'text-type');
      el.dataset.typeAnimated = '1';
      return;
    }

    var shell = mountShell(el, options);
    var textArray = Array.isArray(options.text)
      ? options.text.slice()
      : [options.text != null ? String(options.text) : shell.plain];
    if (!textArray[0]) textArray = [shell.plain];

    var state = {
      displayed: '',
      charIndex: 0,
      isDeleting: false,
      textIndex: 0,
      started: false
    };

    var ctrl = {
      el: el,
      options: options,
      sourceHtml: shell.sourceHtml,
      content: shell.content,
      cursor: shell.cursor,
      cursorTween: shell.cursorTween,
      timeout: null,
      observer: null,
      state: state,
      textArray: textArray
    };
    el._hintTypeController = ctrl;

    function schedule(fn, delay) {
      if (ctrl.timeout) clearTimeout(ctrl.timeout);
      ctrl.timeout = setTimeout(fn, delay);
    }

    function currentText() {
      return ctrl.textArray[state.textIndex] || '';
    }

    function step() {
      if (!el.isConnected) {
        destroyController(el);
        return;
      }

      var full = currentText();

      if (state.isDeleting) {
        if (state.displayed === '') {
          state.isDeleting = false;
          if (state.textIndex === ctrl.textArray.length - 1 && !options.loop) {
            finishTyping(el, ctrl);
            return;
          }
          if (options.onSentenceComplete) {
            options.onSentenceComplete(full, state.textIndex);
          }
          state.textIndex = (state.textIndex + 1) % ctrl.textArray.length;
          state.charIndex = 0;
          schedule(step, options.pauseDuration);
          return;
        }
        schedule(function () {
          state.displayed = state.displayed.slice(0, -1);
          ctrl.content.textContent = state.displayed;
          step();
        }, options.deletingSpeed);
        return;
      }

      if (state.charIndex < full.length) {
        schedule(function () {
          state.displayed += full.charAt(state.charIndex);
          state.charIndex += 1;
          ctrl.content.textContent = state.displayed;
          step();
        }, getRandomSpeed(options));
        return;
      }

      if (!options.loop && state.textIndex === ctrl.textArray.length - 1) {
        finishTyping(el, ctrl);
        return;
      }

      schedule(function () {
        state.isDeleting = true;
        step();
      }, options.pauseDuration);
    }

    function start() {
      if (state.started) return;
      state.started = true;
      schedule(step, options.initialDelay);
    }

    if (immediate || !options.startOnVisible) {
      start();
      return;
    }

    ctrl.observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            start();
            if (ctrl.observer) {
              ctrl.observer.disconnect();
              ctrl.observer = null;
            }
          }
        });
      },
      { threshold: options.threshold }
    );
    ctrl.observer.observe(el);
  }

  function revert(el) {
    destroyController(el);
    if (el.dataset.typeSourceHtml != null) {
      el.innerHTML = el.dataset.typeSourceHtml;
    }
    el.classList.remove('text-type', 'hint-type--done');
    delete el.dataset.typeSourceHtml;
    delete el.dataset.typePlainText;
    delete el.dataset.typeAnimated;
    delete el.dataset.typePending;
  }

  function whenFontsReady(cb) {
    if (global.document.fonts && global.document.fonts.status === 'loaded') {
      cb();
      return;
    }
    if (global.document.fonts && global.document.fonts.ready) {
      global.document.fonts.ready.then(cb);
      return;
    }
    cb();
  }

  function init(scope, opts) {
    var root = scope || document;
    var options = Object.assign({}, HINT_DEFAULTS, opts || {});
    whenFontsReady(function () {
      root.querySelectorAll('.hint-split').forEach(function (el) {
        if (el.dataset.typeAnimated === '1') return;
        if (!isVisible(el)) {
          el.dataset.typePending = '1';
          return;
        }
        runTypewriter(el, options, false);
      });
    });
  }

  function initPendingIn(scope, opts) {
    var root = scope || document;
    var options = Object.assign({}, HINT_DEFAULTS, opts || {});
    whenFontsReady(function () {
      root.querySelectorAll('.hint-split[data-type-pending="1"]').forEach(function (el) {
        if (!isVisible(el)) return;
        delete el.dataset.typePending;
        runTypewriter(el, options, false);
      });
    });
  }

  function refresh(el, opts) {
    if (!el) return;
    var options = Object.assign({}, HINT_DEFAULTS, opts || {});
    delete el.dataset.typePlainText;
    revert(el);
    whenFontsReady(function () {
      if (!isVisible(el)) {
        el.dataset.typePending = '1';
        return;
      }
      var immediate = !!el.closest('.modal-overlay');
      options.startOnVisible = !immediate;
      runTypewriter(el, options, immediate);
    });
  }

  function animateInModal(modalEl, opts) {
    if (!modalEl) return;
    var options = Object.assign({}, HINT_DEFAULTS, opts || { startOnVisible: false });
    whenFontsReady(function () {
      modalEl.querySelectorAll('.hint-split').forEach(function (el) {
        if (el.dataset.typeAnimated === '1') return;
        runTypewriter(el, options, true);
      });
    });
  }

  global.HintType = {
    init: init,
    initPendingIn: initPendingIn,
    refresh: refresh,
    animateInModal: animateInModal,
    revert: revert
  };
  global.HintSplit = global.HintType;
})(typeof window !== 'undefined' ? window : globalThis);
