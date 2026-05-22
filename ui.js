/* ui.js */
  function setupTickerAutocomplete(inputId, opts) {
    opts = opts || {};
    var input = document.getElementById(inputId);
    if (!input) return null;
    if (input.dataset.tickerAcBound === '1' && acControllers[inputId]) {
      return acControllers[inputId];
    }
    var wrap = input.closest('.ticker-ac-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ticker-ac-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    var list = wrap.querySelector('.ticker-ac-list');
    if (!list) {
      list = document.createElement('ul');
      list.className = 'ticker-ac-list';
      list.setAttribute('role', 'listbox');
      list.hidden = true;
      wrap.appendChild(list);
    }

    var acState = { items: [], active: -1, timer: null, open: false };

    function closeList() {
      list.hidden = true;
      acState.open = false;
      acState.active = -1;
    }

    function openList() {
      list.hidden = false;
      acState.open = true;
    }

    function renderList() {
      if (!acState.items.length) {
        closeList();
        return;
      }
      list.innerHTML = acState.items.map(function (item, i) {
        var kindText = typeof Markets !== 'undefined' && item.market === 'US'
          ? Markets.marketBadgeLabel('US')
          : kindLabel(item.kind || item.type);
        return (
          '<li role="option" class="ticker-ac-item' + (i === acState.active ? ' active' : '') + '" data-secid="' + escapeHtml(item.ticker) + '">' +
            '<span class="ticker-ac-secid">' + escapeHtml(item.ticker) + '</span>' +
            '<span class="ticker-ac-name">' + escapeHtml(item.name || '') + '</span>' +
            '<span class="ticker-ac-kind">' + escapeHtml(kindText) + '</span>' +
          '</li>'
        );
      }).join('');
      openList();
    }

    function selectItem(item) {
      if (!item) return;
      rememberTickerItem(item);
      input.value = item.ticker;
      closeList();
      if (opts.onSelect) opts.onSelect(item);
    }

    function runSearch() {
      var v = input.value.trim();
      if (v.length < 1) {
        closeList();
        return;
      }
      if (v.length < 2) {
        var shortItems = [];
        if (typeof Markets === 'undefined' || Markets.isMarketEnabled('RU')) {
          shortItems = shortItems.concat(searchLocalTickers(v).map(function (it) {
            return { ticker: it.ticker, name: it.name, kind: it.kind, market: 'RU', currency: 'RUB' };
          }));
        }
        if (typeof Markets !== 'undefined' && Markets.isMarketEnabled('US')) {
          shortItems = shortItems.concat(Markets.searchUsSecurities(v));
        }
        acState.items = shortItems.slice(0, 12);
        acState.active = acState.items.length ? 0 : -1;
        renderList();
        return;
      }
      var searchFn = typeof Markets !== 'undefined' ? Markets.searchSecurities : searchMoexSecurities;
      searchFn(v).then(function (items) {
        acState.items = items;
        acState.active = items.length ? 0 : -1;
        renderList();
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(acState.timer);
      acState.timer = setTimeout(runSearch, 220);
    });

    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 1) runSearch();
    });

    list.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });

    list.addEventListener('click', function (e) {
      var li = e.target.closest('.ticker-ac-item');
      if (!li) return;
      var secid = li.getAttribute('data-secid');
      var item = null;
      for (var i = 0; i < acState.items.length; i++) {
        if (acState.items[i].ticker === secid) { item = acState.items[i]; break; }
      }
      selectItem(item);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' && acState.items.length) {
        e.preventDefault();
        acState.active = Math.min(acState.active + 1, acState.items.length - 1);
        renderList();
      } else if (e.key === 'ArrowUp' && acState.items.length) {
        e.preventDefault();
        acState.active = Math.max(acState.active - 1, 0);
        renderList();
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) closeList();
    });

    var ctrl = {
      handleEnter: function (e) {
        if (acState.open && acState.items.length) {
          e.preventDefault();
          var idx = acState.active >= 0 ? acState.active : 0;
          selectItem(acState.items[idx]);
          return true;
        }
        return false;
      },
      close: closeList
    };
    input.dataset.tickerAcBound = '1';
    acControllers[inputId] = ctrl;
    return ctrl;
  }



  function darkenColor(hex, percent) {
    var color = hex.startsWith('#') ? hex.slice(1) : hex;
    if (color.length === 3) {
      color = color.split('').map(function (c) { return c + c; }).join('');
    }
    var num = parseInt(color, 16);
    var r = (num >> 16) & 0xff;
    var g = (num >> 8) & 0xff;
    var b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
    g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
    b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }



  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }



  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    var t = url.trim();
    if (t === '#') return '#';
    try {
      var u = new URL(t, window.location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (e) { /* ignore */ }
    return '#';
  }



  function showToast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2800);
  }



  function normalizeTicker(t) {
    return String(t || '').trim().toUpperCase().replace(/\s+/g, '');
  }



  function formatChartPrice(value, ticker, currency) {
    if (value == null || !isFinite(Number(value))) return '—';
    if (typeof Markets !== 'undefined' && currency === 'USD') {
      return Markets.formatMoneyValue(value, 'USD');
    }
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      return Markets.formatMoneyValue(value, 'USD');
    }
    if (ticker === IMOEX_SECID || ticker === 'MOEX') {
      return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' п.';
    }
    if (ticker.indexOf('OFZ') >= 0 || (ticker.indexOf('SU') === 0 && ticker.length > 8)) return value.toFixed(2) + '%';
    if (value >= 1000) return value.toFixed(0) + ' ₽';
    return value.toFixed(2) + ' ₽';
  }



  function formatChartAxisTime(ts, horizon) {
    var d = new Date(ts);
    if (horizon === 'day') {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    if (horizon === 'year') {
      return d.toLocaleDateString('ru-RU', { month: 'short' });
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }



  function getChartYAxisPad(ctx, minP, maxP, ticker) {
    ctx.save();
    ctx.font = '10px Inter, Manrope, sans-serif';
    var maxW = 0;
    for (var g = 0; g <= 4; g++) {
      var labelVal = maxP - ((maxP - minP) * g) / 4;
      var w = ctx.measureText(formatChartPrice(labelVal, ticker)).width;
      if (w > maxW) maxW = w;
    }
    ctx.restore();
    return Math.max(48, Math.ceil(maxW) + 14);
  }



  function formatChartHoverLabel(pt, ticker, horizon) {
    return formatChartAxisTime(pt.t, horizon) + ' · ' + formatChartPrice(pt.price, ticker);
  }



  function chartIndexAtClientX(canvas, clientX) {
    var meta = canvas._chartMeta;
    if (!meta || !meta.series || meta.series.length < 2) return -1;
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    if (x < meta.pad.left || x > meta.pad.left + meta.plotW) return -1;
    var ratio = (x - meta.pad.left) / meta.plotW;
    var idx = Math.round(ratio * (meta.series.length - 1));
    return Math.max(0, Math.min(meta.series.length - 1, idx));
  }



  function redrawPriceChartWithHover(canvas, hoverIndex) {
    var meta = canvas._chartMeta;
    if (!meta) return;
    drawPriceChart(canvas, meta.series, {
      ticker: meta.ticker,
      horizon: meta.horizon,
      hoverIndex: hoverIndex
    });
  }



  function bindChartHover(canvas) {
    if (!canvas || canvas._chartHoverBound) return;
    var wrap = canvas.parentElement;
    if (!wrap || !wrap.classList.contains('chart-canvas-wrap')) return;
    canvas._chartHoverBound = true;

    var tip = wrap.querySelector('.chart-hover-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-hover-tip';
      tip.setAttribute('aria-hidden', 'true');
      wrap.appendChild(tip);
    }

    function hideHover() {
      canvas._chartHoverIndex = null;
      tip.classList.remove('is-visible');
      tip.setAttribute('aria-hidden', 'true');
      if (canvas._chartMeta) {
        redrawPriceChartWithHover(canvas, null);
        if (canvas.id === 'portfolioPriceChart' && canvas._chartStatsSeries) {
          updateChartStatsFromSeries(canvas._chartStatsSeries, canvas._chartMeta.ticker);
        }
      }
    }

    function showHover(clientX, clientY) {
      var meta = canvas._chartMeta;
      if (!meta || !meta.series || meta.series.length < 2) {
        hideHover();
        return;
      }
      var idx = chartIndexAtClientX(canvas, clientX);
      if (idx < 0) {
        hideHover();
        return;
      }
      if (canvas._chartHoverIndex !== idx) {
        canvas._chartHoverIndex = idx;
        redrawPriceChartWithHover(canvas, idx);
        if (canvas.id === 'portfolioPriceChart' && canvas._chartStatsSeries) {
          updateChartStatsFromSeries(canvas._chartStatsSeries, meta.ticker, idx);
        }
      }
      var pt = meta.series[idx];
      tip.textContent = formatChartHoverLabel(pt, meta.ticker, meta.horizon);
      tip.classList.add('is-visible');
      tip.setAttribute('aria-hidden', 'false');
      var wrapRect = wrap.getBoundingClientRect();
      var tipX = Math.min(Math.max(clientX - wrapRect.left, 48), wrapRect.width - 48);
      var tipY = Math.max(clientY - wrapRect.top - 10, 12);
      tip.style.left = tipX + 'px';
      tip.style.top = tipY + 'px';
    }

    wrap.addEventListener('mousemove', function (e) {
      showHover(e.clientX, e.clientY);
    });
    wrap.addEventListener('mouseleave', hideHover);
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length) showHover(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    wrap.addEventListener('touchmove', function (e) {
      if (e.touches.length) {
        e.preventDefault();
        showHover(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    wrap.addEventListener('touchend', hideHover);
    wrap.addEventListener('touchcancel', hideHover);
  }



  function drawPriceChart(canvas, series, options) {
    options = options || {};
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(rect.width, 280);
    var h = Math.max(rect.height, 160);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!series || series.length < 2) {
      canvas._chartMeta = null;
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '14px Golos Text, IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Недостаточно данных', w / 2, h / 2);
      return;
    }

    var prices = series.map(function (p) { return p.price; });
    var minP = Math.min.apply(null, prices);
    var maxP = Math.max.apply(null, prices);
    var range = maxP - minP || maxP * 0.02 || 1;
    minP -= range * 0.06;
    maxP += range * 0.06;

    var pad = {
      top: 14,
      right: 12,
      bottom: 28,
      left: getChartYAxisPad(ctx, minP, maxP, options.ticker)
    };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    function xAt(i) {
      return pad.left + (i / (series.length - 1)) * plotW;
    }
    function yAt(price) {
      return pad.top + plotH - ((price - minP) / (maxP - minP)) * plotH;
    }

    canvas._chartMeta = {
      series: series,
      ticker: options.ticker,
      horizon: options.horizon,
      pad: pad,
      plotW: plotW,
      plotH: plotH,
      w: w,
      h: h,
      minP: minP,
      maxP: maxP
    };

    ctx.strokeStyle = 'rgba(43, 43, 43, 0.08)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = pad.top + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(pad.left + plotW, gy);
      ctx.stroke();
      var labelVal = maxP - ((maxP - minP) * g) / 4;
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '10px Inter, Manrope, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatChartPrice(labelVal, options.ticker), pad.left - 8, gy + 3);
    }

    var up = series[series.length - 1].price >= series[0].price;
    var lineColor = up ? '#6B7A5A' : '#B85C50';
    var fillTop = up ? 'rgba(107, 122, 90, 0.22)' : 'rgba(184, 92, 80, 0.16)';

    ctx.beginPath();
    series.forEach(function (pt, idx) {
      var x = xAt(idx);
      var y = yAt(pt.price);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xAt(series.length - 1), pad.top + plotH);
    ctx.lineTo(xAt(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = fillTop;
    ctx.fill();

    ctx.beginPath();
    series.forEach(function (pt, idx) {
      var x = xAt(idx);
      var y = yAt(pt.price);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    var hoverIndex = options.hoverIndex;
    var endIdx = hoverIndex != null && hoverIndex >= 0 && hoverIndex < series.length
      ? hoverIndex
      : series.length - 1;
    var endPt = series[endIdx];

    if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < series.length) {
      var hx = xAt(hoverIndex);
      ctx.save();
      ctx.strokeStyle = 'rgba(43, 43, 43, 0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.fillStyle = lineColor;
    ctx.strokeStyle = '#faf8f4';
    ctx.lineWidth = hoverIndex != null ? 2 : 0;
    ctx.beginPath();
    ctx.arc(xAt(endIdx), yAt(endPt.price), hoverIndex != null ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    if (hoverIndex != null) ctx.stroke();

    var labelIdx = [0, Math.floor((series.length - 1) / 2), series.length - 1];
    ctx.fillStyle = '#6B6B6B';
    ctx.font = '10px Inter, Manrope, sans-serif';
    ctx.textAlign = 'center';
    labelIdx.forEach(function (idx) {
      if (idx < 0 || idx >= series.length) return;
      ctx.fillText(formatChartAxisTime(series[idx].t, options.horizon), xAt(idx), h - 8);
    });

    bindChartHover(canvas);
  }



  function destroyPortfolioPapersMagnet() {
    if (portfolioPapersMagnetCleanup) {
      portfolioPapersMagnetCleanup();
      portfolioPapersMagnetCleanup = null;
    }
  }



  function initPortfolioPapersMagnet() {
    destroyPortfolioPapersMagnet();
    var strip = document.querySelector('#portfolioFolderScene .pf-papers-strip');
    if (!strip) return;
    var papers = strip.querySelectorAll('.paper[data-ticker]');
    if (!papers.length || bentoAnimationsDisabled()) return;

    var magnetAnims = [];
    var unbinds = [];
    papers.forEach(function (paper, i) {
      magnetAnims[i] = null;
      function onMove(e) {
        var rect = paper.getBoundingClientRect();
        var mx = (e.clientX - rect.left - rect.width / 2) * 0.07;
        var my = (e.clientY - rect.top - rect.height / 2) * 0.07;
        if (magnetAnims[i]) magnetAnims[i].kill();
        magnetAnims[i] = gsap.to(paper, {
          x: mx,
          y: my,
          scale: 1.04,
          boxShadow: '0 6px 16px rgba(31, 30, 28, 0.12)',
          duration: 0.22,
          ease: 'power2.out'
        });
      }
      function onLeave() {
        if (magnetAnims[i]) magnetAnims[i].kill();
        gsap.to(paper, {
          x: 0,
          y: 0,
          scale: 1,
          boxShadow: '0 2px 8px rgba(31, 30, 28, 0.08)',
          duration: 0.32,
          ease: 'power2.out'
        });
      }
      paper.addEventListener('mousemove', onMove);
      paper.addEventListener('mouseleave', onLeave);
      unbinds.push(function () {
        paper.removeEventListener('mousemove', onMove);
        paper.removeEventListener('mouseleave', onLeave);
        if (magnetAnims[i]) magnetAnims[i].kill();
        gsap.set(paper, { x: 0, y: 0, scale: 1, clearProps: 'transform,boxShadow' });
      });
    });
    portfolioPapersMagnetCleanup = function () {
      unbinds.forEach(function (fn) { fn(); });
    };
  }



  function bentoAnimationsDisabled() {
    return (
      window.innerWidth <= 768 ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      typeof gsap === 'undefined'
    );
  }



  function destroyMarketTilesBento() {
    if (marketTilesBentoCleanup) {
      marketTilesBentoCleanup();
      marketTilesBentoCleanup = null;
    }
  }



  function bentoSpotlightValues(radius) {
    return { proximity: radius * 0.5, fadeDistance: radius * 0.75 };
  }



  function bentoUpdateCardGlow(card, mouseX, mouseY, glow, radius) {
    var rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    card.style.setProperty('--glow-x', ((mouseX - rect.left) / rect.width) * 100 + '%');
    card.style.setProperty('--glow-y', ((mouseY - rect.top) / rect.height) * 100 + '%');
    card.style.setProperty('--glow-intensity', String(glow));
    card.style.setProperty('--glow-radius', radius + 'px');
  }



  function initMarketTilesBento() {
    destroyMarketTilesBento();
    var grid = document.getElementById('marketTiles');
    if (!grid || !grid.classList.contains('bento-section')) return;
    var cards = grid.querySelectorAll('.magic-bento-card');
    if (!cards.length) return;

    if (bentoAnimationsDisabled()) return;

    var glowColor = BENTO_GLOW_RGB;
    var spotlightRadius = BENTO_SPOTLIGHT_RADIUS;
    var spotlight = document.createElement('div');
    spotlight.className = 'market-bento-spotlight';
    document.body.appendChild(spotlight);

    function onMouseMove(e) {
      var section = grid.closest('.bento-section') || grid;
      var rect = section.getBoundingClientRect();
      var inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      var cardList = grid.querySelectorAll('.magic-bento-card');

      if (!inside) {
        gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        cardList.forEach(function (card) {
          card.style.setProperty('--glow-intensity', '0');
        });
        return;
      }

      var sv = bentoSpotlightValues(spotlightRadius);
      var minDistance = Infinity;

      cardList.forEach(function (card) {
        var cardRect = card.getBoundingClientRect();
        var centerX = cardRect.left + cardRect.width / 2;
        var centerY = cardRect.top + cardRect.height / 2;
        var distance =
          Math.hypot(e.clientX - centerX, e.clientY - centerY) -
          Math.max(cardRect.width, cardRect.height) / 2;
        var effectiveDistance = Math.max(0, distance);
        minDistance = Math.min(minDistance, effectiveDistance);

        var glowIntensity = 0;
        if (effectiveDistance <= sv.proximity) {
          glowIntensity = 1;
        } else if (effectiveDistance <= sv.fadeDistance) {
          glowIntensity = (sv.fadeDistance - effectiveDistance) / (sv.fadeDistance - sv.proximity);
        }
        bentoUpdateCardGlow(card, e.clientX, e.clientY, glowIntensity, spotlightRadius);
      });

      gsap.set(spotlight, { left: e.clientX, top: e.clientY });
      var targetOpacity =
        minDistance <= sv.proximity
          ? 0.75
          : minDistance <= sv.fadeDistance
            ? ((sv.fadeDistance - minDistance) / (sv.fadeDistance - sv.proximity)) * 0.75
            : 0;
      gsap.to(spotlight, {
        opacity: targetOpacity,
        duration: targetOpacity > 0 ? 0.2 : 0.45,
        ease: 'power2.out'
      });
    }

    function onDocLeave() {
      grid.querySelectorAll('.magic-bento-card').forEach(function (card) {
        card.style.setProperty('--glow-intensity', '0');
      });
      gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
    }

    function onTileClick(e) {
      var tile = e.target.closest('.market-tile');
      if (!tile || e.target.closest('.market-tile-remove')) return;

      var card = tile.closest('.magic-bento-card');
      if (!card) return;

      var rect = tile.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var maxDistance = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height)
      );

      var ripple = document.createElement('div');
      ripple.className = 'market-tile-bento-ripple';
      ripple.style.cssText =
        'width:' + (maxDistance * 2) + 'px;height:' + (maxDistance * 2) + 'px;' +
        'left:' + (x - maxDistance) + 'px;top:' + (y - maxDistance) + 'px;' +
        'background:radial-gradient(circle,rgba(' + glowColor + ',0.35) 0%,rgba(' + glowColor + ',0.15) 35%,transparent 70%);';
      tile.style.position = 'relative';
      tile.appendChild(ripple);

      gsap.fromTo(
        ripple,
        { scale: 0, opacity: 1 },
        {
          scale: 1,
          opacity: 0,
          duration: 0.75,
          ease: 'power2.out',
          onComplete: function () { ripple.remove(); }
        }
      );
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onDocLeave);
    grid.addEventListener('click', onTileClick);

    marketTilesBentoCleanup = function () {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onDocLeave);
      grid.removeEventListener('click', onTileClick);
      if (spotlight.parentNode) spotlight.parentNode.removeChild(spotlight);
    };
  }



  function destroyBriefingBento() {
    if (briefingBentoCleanup) {
      briefingBentoCleanup();
      briefingBentoCleanup = null;
    }
  }



  function initBriefingBento() {
    destroyBriefingBento();
    var grids = [];
    ['topBriefsList', 'myBriefsList', 'briefingList'].forEach(function (id) {
      var g = document.getElementById(id);
      if (g) grids.push(g);
    });
    if (!grids.length) return;
    var cards = [];
    grids.forEach(function (grid) {
      grid.querySelectorAll('.brief-card.magic-bento-card').forEach(function (c) { cards.push(c); });
    });
    var grid = grids[0];
    if (!cards.length) return;
    if (bentoAnimationsDisabled()) return;

    var glowColor = BENTO_GLOW_RGB;
    var spotlightRadius = BENTO_SPOTLIGHT_RADIUS;
    var magnetAnims = [];
    var cardUnbinds = [];

    cards.forEach(function (card, i) {
      magnetAnims[i] = null;
      function onMove(e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var mx = (x - rect.width / 2) * 0.045;
        var my = (y - rect.height / 2) * 0.045;
        if (magnetAnims[i]) magnetAnims[i].kill();
        magnetAnims[i] = gsap.to(card, {
          x: mx,
          y: my,
          duration: 0.28,
          ease: 'power2.out'
        });
        bentoUpdateCardGlow(card, e.clientX, e.clientY, 1, spotlightRadius);
      }
      function onLeave() {
        if (magnetAnims[i]) magnetAnims[i].kill();
        gsap.to(card, { x: 0, y: 0, duration: 0.35, ease: 'power2.out' });
        card.style.setProperty('--glow-intensity', '0');
      }
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
      cardUnbinds.push(function () {
        card.removeEventListener('mousemove', onMove);
        card.removeEventListener('mouseleave', onLeave);
        if (magnetAnims[i]) magnetAnims[i].kill();
        gsap.set(card, { x: 0, y: 0 });
        card.style.setProperty('--glow-intensity', '0');
      });
    });

    var spotlight = document.createElement('div');
    spotlight.className = 'market-bento-spotlight briefing-bento-spotlight';
    document.body.appendChild(spotlight);

    function onMouseMove(e) {
      var rect = grid.getBoundingClientRect();
      var inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      var cardList = grid.querySelectorAll('.brief-card.magic-bento-card');

      if (!inside) {
        gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        return;
      }

      var sv = bentoSpotlightValues(spotlightRadius);
      var minDistance = Infinity;

      cardList.forEach(function (card) {
        var cardRect = card.getBoundingClientRect();
        var centerX = cardRect.left + cardRect.width / 2;
        var centerY = cardRect.top + cardRect.height / 2;
        var distance =
          Math.hypot(e.clientX - centerX, e.clientY - centerY) -
          Math.max(cardRect.width, cardRect.height) / 2;
        var effectiveDistance = Math.max(0, distance);
        minDistance = Math.min(minDistance, effectiveDistance);
        if (effectiveDistance > sv.fadeDistance) {
          return;
        }
        var glowIntensity = 0;
        if (effectiveDistance <= sv.proximity) {
          glowIntensity = 1;
        } else {
          glowIntensity = (sv.fadeDistance - effectiveDistance) / (sv.fadeDistance - sv.proximity);
        }
        if (glowIntensity > parseFloat(card.style.getPropertyValue('--glow-intensity') || '0')) {
          bentoUpdateCardGlow(card, e.clientX, e.clientY, glowIntensity, spotlightRadius);
        }
      });

      gsap.set(spotlight, { left: e.clientX, top: e.clientY });
      var targetOpacity =
        minDistance <= sv.proximity
          ? 0.55
          : minDistance <= sv.fadeDistance
            ? ((sv.fadeDistance - minDistance) / (sv.fadeDistance - sv.proximity)) * 0.55
            : 0;
      gsap.to(spotlight, {
        opacity: targetOpacity,
        duration: targetOpacity > 0 ? 0.2 : 0.45,
        ease: 'power2.out'
      });
    }

    function onDocLeave() {
      gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onDocLeave);

    briefingBentoCleanup = function () {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onDocLeave);
      cardUnbinds.forEach(function (fn) { fn(); });
      if (spotlight.parentNode) spotlight.parentNode.removeChild(spotlight);
    };
  }



  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-panel') === tab);
    });
    document.querySelectorAll('.book-nav[data-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    if (typeof NavBooks !== 'undefined') NavBooks.onTabChange(tab);
    if (location.hash !== '#' + tab) {
      history.replaceState(null, '', '#' + tab);
    }
    if (tab === 'briefing') {
      renderHomePage();
      renderMarketTiles();
      renderMarketMacro();
    }
    if (tab === 'portfolio') {
      renderPortfolio();
      setupTickerAutocomplete('pfAddTicker');
    }
    if (tab === 'watchlist') {
      renderPortfolioTableBody();
      setupTickerAutocomplete('pfWatchAddTicker');
    }
    if (tab === 'settings') renderAlerts();
  }



  function openDigestModal() {
    var d = getDigest();
    document.getElementById('digestEmail').value = d.email || '';
    var consentModal = document.getElementById('digestConsentModal');
    if (consentModal) consentModal.checked = !!d.emailConsent;
    var timeEl = document.getElementById('digestTimeModal') || document.getElementById('digestTime');
    if (timeEl) timeEl.value = d.time || '08:00';
    var modal = document.getElementById('digestModal');
    modal.hidden = false;
    modal.classList.add('open');
  }



  function closeDigestModal() {
    var modal = document.getElementById('digestModal');
    modal.classList.remove('open');
    modal.hidden = true;
  }



  function initHash() {
    var hash = (location.hash || '#briefing').replace('#', '');
    var valid = ['briefing', 'watchlist', 'portfolio', 'settings'];
    if (valid.indexOf(hash) !== -1) switchTab(hash);
    else switchTab('briefing');
  }


