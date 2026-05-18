/* SplitText-style hint animation (vanilla port of React Bits SplitText + GSAP). */
(function (global) {
  var DEFAULTS = {
    delay: 64,
    duration: 1.44,
    ease: 'power3.out',
    splitType: 'chars',
    from: { opacity: 0, y: 40 },
    to: { opacity: 1, y: 0 },
    threshold: 0.1,
    rootMargin: '-100px'
  };

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function scrollStart(threshold, rootMargin) {
    var startPct = (1 - threshold) * 100;
    var marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin || '-100px');
    var marginValue = marginMatch ? parseFloat(marginMatch[1]) : 0;
    var marginUnit = marginMatch ? marginMatch[2] || 'px' : 'px';
    var sign =
      marginValue === 0
        ? ''
        : marginValue < 0
          ? '-=' + Math.abs(marginValue) + marginUnit
          : '+=' + marginValue + marginUnit;
    return 'top ' + startPct + '%' + sign;
  }

  function isInActivePanel(el) {
    var panel = el.closest('.panel');
    return !panel || panel.classList.contains('active');
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden]')) return false;
    var panel = el.closest('.panel');
    if (panel && !panel.classList.contains('active')) return false;
    return true;
  }

  function killElAnimation(el) {
    if (el._hintSplitTween) {
      el._hintSplitTween.kill();
      el._hintSplitTween = null;
    }
    if (el._hintSplitScrollTrigger) {
      el._hintSplitScrollTrigger.kill();
      el._hintSplitScrollTrigger = null;
    }
  }

  function revertSplit(el, restoreHtml) {
    killElAnimation(el);
    if (restoreHtml !== false && el.querySelector('.split-char') && el.dataset.splitSourceHtml != null) {
      el.innerHTML = el.dataset.splitSourceHtml;
    }
    el.classList.remove('split-parent', 'hint-split--done');
    delete el.dataset.splitSourceHtml;
    delete el.dataset.splitPrepared;
    delete el.dataset.splitAnimated;
    delete el.dataset.splitPending;
  }

  function wrapTextNode(textNode) {
    var text = textNode.textContent;
    if (!text) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var span = document.createElement('span');
      span.className = ch.trim() ? 'split-char' : 'split-char split-char--space';
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      frag.appendChild(span);
    }
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function wrapWordsInElement(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if (p && (p.classList.contains('split-char') || p.classList.contains('split-word'))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(wrapTextNode);
  }

  function wrapCharsInElement(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.textContent) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if (p && p.classList.contains('split-char')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(wrapTextNode);
  }

  function collectTargets(el, splitType) {
    if (splitType.indexOf('chars') !== -1) {
      var chars = el.querySelectorAll('.split-char');
      if (chars.length) return chars;
    }
    if (splitType.indexOf('words') !== -1) {
      var words = el.querySelectorAll('.split-word');
      if (words.length) return words;
    }
    return el.querySelectorAll('.split-char');
  }

  function prepareSplit(el, splitType) {
    if (el.dataset.splitPrepared === '1') return;
    el.dataset.splitSourceHtml = el.innerHTML;
    el.classList.add('split-parent');
    if (splitType.indexOf('words') !== -1 && splitType.indexOf('chars') === -1) {
      wrapWordsInElement(el);
    } else {
      wrapCharsInElement(el);
    }
    el.dataset.splitPrepared = '1';
  }

  function runAnimation(el, opts, immediate) {
    if (typeof global.gsap === 'undefined') return;
    if (el.dataset.splitAnimated === '1') return;
    if (prefersReducedMotion()) {
      el.classList.add('hint-split--done');
      el.dataset.splitAnimated = '1';
      return;
    }

    var options = Object.assign({}, DEFAULTS, opts || {});
    prepareSplit(el, options.splitType);
    var targets = collectTargets(el, options.splitType);
    if (!targets.length) return;

    killElAnimation(el);

    var tweenOpts = Object.assign({}, options.to, {
      duration: options.duration,
      ease: options.ease,
      stagger: options.delay / 1000,
      willChange: 'transform, opacity',
      force3D: true,
      onComplete: function () {
        el.classList.add('hint-split--done');
        el.dataset.splitAnimated = '1';
        delete el.dataset.splitPending;
      }
    });

    if (immediate || !global.ScrollTrigger) {
      el._hintSplitTween = global.gsap.fromTo(targets, Object.assign({}, options.from), tweenOpts);
      return;
    }

    tweenOpts.scrollTrigger = {
      trigger: el,
      start: scrollStart(options.threshold, options.rootMargin),
      once: true,
      fastScrollEnd: true,
      anticipatePin: 0.4,
      onKill: function () {
        el._hintSplitScrollTrigger = null;
      }
    };
    el._hintSplitTween = global.gsap.fromTo(targets, Object.assign({}, options.from), tweenOpts);
    if (tweenOpts.scrollTrigger && el._hintSplitTween.scrollTrigger) {
      el._hintSplitScrollTrigger = el._hintSplitTween.scrollTrigger;
    }
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

  function init(scope) {
    var root = scope || document;
    whenFontsReady(function () {
      if (global.ScrollTrigger && global.gsap) {
        global.gsap.registerPlugin(global.ScrollTrigger);
      }
      root.querySelectorAll('.hint-split').forEach(function (el) {
        if (el.dataset.splitAnimated === '1') return;
        if (!isVisible(el)) {
          el.dataset.splitPending = '1';
          return;
        }
        runAnimation(el, null, false);
      });
      if (global.ScrollTrigger) global.ScrollTrigger.refresh();
    });
  }

  function initPendingIn(scope) {
    var root = scope || document;
    whenFontsReady(function () {
      root.querySelectorAll('.hint-split[data-split-pending="1"]').forEach(function (el) {
        if (!isVisible(el)) return;
        delete el.dataset.splitPending;
        runAnimation(el, null, false);
      });
      if (global.ScrollTrigger) global.ScrollTrigger.refresh();
    });
  }

  function refresh(el, opts) {
    if (!el) return;
    revertSplit(el, el.querySelector('.split-char') ? true : false);
    whenFontsReady(function () {
      if (!isVisible(el)) {
        el.dataset.splitPending = '1';
        return;
      }
      var immediate = !!el.closest('.modal-overlay');
      runAnimation(el, opts, immediate);
      if (global.ScrollTrigger) global.ScrollTrigger.refresh();
    });
  }

  function refreshScroll() {
    if (global.ScrollTrigger) global.ScrollTrigger.refresh();
  }

  function animateInModal(modalEl) {
    if (!modalEl) return;
    whenFontsReady(function () {
      modalEl.querySelectorAll('.hint-split').forEach(function (el) {
        if (el.dataset.splitAnimated === '1') return;
        runAnimation(el, null, true);
      });
    });
  }

  global.HintSplit = {
    init: init,
    initPendingIn: initPendingIn,
    refresh: refresh,
    refreshScroll: refreshScroll,
    animateInModal: animateInModal,
    revert: revertSplit
  };
})(typeof window !== 'undefined' ? window : globalThis);
