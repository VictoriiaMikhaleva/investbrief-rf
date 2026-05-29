/* ui.js */
  var CHART_COLOR_AUTUMN = '#D4873B';
  var CHART_COLOR_AUTUMN_SOFT = 'rgba(212, 135, 59, 0.42)';
  var CHART_COLOR_FORECAST = '#4A7356';

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
    if (ticker === '^VIX' || ticker === 'VIX') {
      return Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' п.';
    }
    if (ticker === IMOEX_SECID || ticker === 'INDEX') {
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
      return d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
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



  function drawMiniBarChart(canvas, series, options) {
    options = options || {};
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(canvas.clientWidth || 120, 80);
    var h = Math.max(canvas.clientHeight || 36, 28);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!series || !series.length) {
      ctx.fillStyle = '#9a9a9a';
      ctx.font = '10px Golos Text, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('—', w / 2, h / 2);
      return;
    }
    var vals = series.map(function (p) { return p.v != null ? p.v : p.y; });
    var max = Math.max.apply(null, vals.concat([0.001]));
    var pad = { l: 2, r: 2, t: 4, b: 4 };
    var barW = Math.max(2, (w - pad.l - pad.r) / vals.length - 1);
    var color = options.color || '#6B7A5A';
    vals.forEach(function (v, i) {
      var bh = Math.max(2, ((v / max) * (h - pad.t - pad.b)));
      var x = pad.l + i * (barW + 1);
      var y = h - pad.b - bh;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barW, bh);
    });
  }



  function paintQuoteMiniCharts(wrapEl, analytics) {
    if (!wrapEl || !analytics) return;
    var divCanvas = wrapEl.querySelector('[data-mini-chart="div"]');
    var volCanvas = wrapEl.querySelector('[data-mini-chart="vol"]');
    if (divCanvas && analytics.divYieldByYear && analytics.divYieldByYear.length) {
      drawMiniBarChart(divCanvas, analytics.divYieldByYear.map(function (y) {
        return { v: y.yieldPct != null && isFinite(y.yieldPct) ? y.yieldPct : 0 };
      }), { color: CHART_COLOR_AUTUMN });
    }
    if (volCanvas && analytics.volumeByDay && analytics.volumeByDay.length) {
      drawMiniBarChart(volCanvas, analytics.volumeByDay, { color: '#6B7A5A' });
    }
  }



  function openAnalyticsModal(ticker) {
    ticker = normalizeTicker(ticker);
    if (typeof selectAnalyticsTicker === 'function') {
      selectAnalyticsTicker(ticker);
      return;
    }
    var modal = document.getElementById('securityAnalyticsModal');
    if (!modal) {
      if (typeof openPortfolioChart === 'function') openPortfolioChart(ticker);
      return;
    }
    var titleEl = document.getElementById('securityAnalyticsTitle');
    var metaEl = document.getElementById('securityAnalyticsMeta');
    var priceCanvas = document.getElementById('securityAnalyticsPriceChart');
    var divCanvas = document.getElementById('securityAnalyticsDivChart');
    var volCanvas = document.getElementById('securityAnalyticsVolChart');
    var divNote = document.getElementById('securityAnalyticsDivNote');
    var volNote = document.getElementById('securityAnalyticsVolNote');
    if (titleEl) titleEl.textContent = ticker;
    if (metaEl) metaEl.textContent = 'Загрузка…';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      if (metaEl) metaEl.textContent = 'Рынок США · дивиденды и оборот МосБиржи недоступны';
      if (divNote) divNote.textContent = 'Для US бумаг используйте отчётность эмитента.';
      fetchMoexHistory(ticker, 'month').then(function (r) {
        if (priceCanvas) drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: 'month' });
      });
      return;
    }

    if (typeof buildSecurityAnalytics !== 'function') return;
    buildSecurityAnalytics(ticker).then(function (a) {
      if (metaEl) {
        var parts = [a.name || getTickerSubtitle(ticker)];
        if (a.divAvg5y != null) parts.push('Ср. див. доходность 5л: ' + formatDivYieldPct(a.divAvg5y));
        metaEl.textContent = parts.join(' · ');
      }
      if (divCanvas) {
        drawMiniBarChart(divCanvas, (a.divYieldByYear || []).map(function (y) {
          return { v: y.yieldPct != null && isFinite(y.yieldPct) ? y.yieldPct : 0 };
        }), { color: CHART_COLOR_AUTUMN });
      }
      if (divNote) {
        divNote.textContent = (a.divYieldByYear || []).map(function (y) {
          return y.year + ': ' + (y.yieldPct != null ? formatDivYieldPct(y.yieldPct) : '—');
        }).join(' · ');
      }
      if (volCanvas) drawMiniBarChart(volCanvas, a.volumeByDay || [], { color: '#6B7A5A' });
      if (volNote) volNote.textContent = 'Оборот TQBR, млрд ₽ · ' + (a.volumeByDay.length || 0) + ' торговых дней';
      return fetchMoexHistory(ticker, 'month');
    }).then(function (r) {
      if (priceCanvas && r && r.series) {
        drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: 'month' });
      }
    }).catch(function () {
      if (metaEl) metaEl.textContent = 'Не удалось загрузить аналитику';
    });
  }



  function closeAnalyticsModal() {
    var modal = document.getElementById('securityAnalyticsModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }



  function formatBarChartValue(v, opts) {
    if (v == null || !isFinite(v) || v <= 0) return '';
    opts = opts || {};
    if (opts.valueMode === 'bln') {
      return v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',');
    }
    if (v >= 1000) return Math.round(v).toLocaleString('ru-RU');
    if (v >= 100) return String(Math.round(v));
    if (v >= 10) return v.toFixed(1).replace('.', ',');
    return v.toFixed(2).replace('.', ',');
  }



  function formatBarChartDate(point) {
    if (!point) return '';
    if (point.dateLabel) return String(point.dateLabel);
    if (typeof formatTradeDateRu === 'function' && point.date) {
      return formatTradeDateRu(point.date, !!point.dateWithYear);
    }
    return point.label ? String(point.label) : '';
  }



  function formatBarChartValueWithUnit(v, opts) {
    var val = formatBarChartValue(v, opts);
    if (!val) return '';
    if (opts && opts.valueMode === 'bln') return val + ' млрд ₽';
    return val;
  }



  function drawBarHoverTooltip(ctx, lines, cx, topY, plotWidth) {
    lines = (lines || []).filter(Boolean);
    if (!lines.length) return;
    ctx.save();
    ctx.font = '600 11px Manrope, Golos Text, sans-serif';
    var lineH = 14;
    var maxW = 0;
    lines.forEach(function (ln) {
      maxW = Math.max(maxW, ctx.measureText(ln).width);
    });
    var padX = 6;
    var padY = 4;
    var bw = maxW + padX * 2;
    var bh = lines.length * lineH + padY * 2;
    var maxPlotW = plotWidth || 280;
    var bx = Math.max(2, cx - bw / 2);
    var by = Math.max(2, topY - bh - 4);
    if (bx + bw > maxPlotW - 2) bx = maxPlotW - bw - 2;
    ctx.fillStyle = 'rgba(247, 244, 238, 0.96)';
    ctx.strokeStyle = 'rgba(61, 92, 71, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, bw, bh, 5);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1F1E1C';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach(function (ln, idx) {
      ctx.fillText(ln, bx + bw / 2, by + padY + lineH * idx + lineH / 2);
    });
    ctx.restore();
  }



  function drawBarValueLabel(ctx, text, cx, topY, plotWidth) {
    if (!text) return;
    ctx.save();
    ctx.font = '700 12px Manrope, Golos Text, sans-serif';
    var tw = ctx.measureText(text).width;
    var padX = 6;
    var padY = 4;
    var bw = tw + padX * 2;
    var bh = 18;
    var maxPlotW = plotWidth || 320;
    var bx = Math.max(4, Math.min(cx - bw / 2, maxPlotW - bw - 4));
    var by = Math.max(4, topY - bh - 8);
    ctx.fillStyle = 'rgba(255, 252, 248, 0.98)';
    ctx.strokeStyle = CHART_COLOR_AUTUMN_SOFT;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, bw, bh, 4);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1F1E1C';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2);
    ctx.restore();
  }



  function bindBarChartMagnet(canvas) {
    if (!canvas || canvas._barMagnetBound) return;
    canvas._barMagnetBound = true;
    var parent = canvas.parentElement;
    if (parent && !parent.classList.contains('bar-chart-wrap')) {
      parent.classList.add('bar-chart-wrap');
    }

    function pickBar(clientX) {
      var st = canvas._barChartState;
      if (!st || !st.bars.length) return -1;
      var rect = canvas.getBoundingClientRect();
      var mx = clientX - rect.left;
      var best = -1;
      var bestDist = Infinity;
      st.bars.forEach(function (b) {
        var cx = b.x + b.barW / 2;
        var dist = Math.abs(mx - cx);
        if (dist < bestDist) {
          bestDist = dist;
          best = b.index;
        }
      });
      var magnet = st.bars[0] ? Math.max(22, st.bars[0].barW * 1.4) : 24;
      return bestDist <= magnet ? best : -1;
    }

    function redraw(hoverIdx) {
      var st = canvas._barChartState;
      if (!st) return;
      var opts = Object.assign({}, st.baseOptions, { hoverIndex: hoverIdx, _redraw: true });
      drawFullBarChart(canvas, st.series, opts);
    }

    canvas.addEventListener('mousemove', function (e) {
      var hit = pickBar(e.clientX);
      var st = canvas._barChartState;
      if (!st) return;
      if (hit !== st.hover) redraw(hit);
    });
    canvas.addEventListener('mouseleave', function () {
      var st = canvas._barChartState;
      if (st && st.hover !== -1) redraw(-1);
    });
  }



  function drawFullBarChart(canvas, series, options) {
    options = options || {};
    if (!canvas) return;
    var prevHover = options._redraw && canvas._barChartState ? canvas._barChartState.hover : -1;
    var hoverIndex = options.hoverIndex != null ? options.hoverIndex : prevHover;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(canvas.clientWidth || 280, 200);
    var h = Math.max(canvas.clientHeight || 140, 100);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!series || !series.length) {
      canvas._barChartState = null;
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '13px Golos Text, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Нет данных', w / 2, h / 2);
      return;
    }
    var vals = series.map(function (p) { return p.v != null ? p.v : (p.y != null ? p.y : 0); });
    var max = Math.max.apply(null, vals.concat([0.001]));
    var dense = vals.length > 14;
    var alwaysValues = options.showValues === true;
    var showValues = options.showValues !== false && (alwaysValues || !dense);
    var padTop = showValues ? 34 : 14;
    if (hoverIndex >= 0) padTop = Math.max(padTop, 42);
    var pad = { l: 36, r: 12, t: padTop, b: 28 };
    var plotW = w - pad.l - pad.r;
    var plotH = h - pad.t - pad.b;
    var barGap = vals.length > 20 ? 2 : 4;
    var barW = Math.max(4, (plotW - barGap * (vals.length - 1)) / vals.length);
    var color = options.color || CHART_COLOR_AUTUMN;
    var forecastColor = options.forecastColor || CHART_COLOR_FORECAST;
    var barsMeta = [];

    vals.forEach(function (v, i) {
      var isHover = i === hoverIndex;
      var lift = isHover ? 5 : 0;
      var bh = Math.max(3, (v / max) * plotH) * (isHover ? 1.06 : 1);
      var x = pad.l + i * (barW + barGap);
      var y = pad.t + plotH - bh - lift;
      var barColor = series[i].forecast ? forecastColor : color;
      ctx.globalAlpha = hoverIndex >= 0 && !isHover ? 0.55 : 1;
      ctx.fillStyle = barColor;
      if (isHover) {
        ctx.shadowColor = 'rgba(74, 115, 86, 0.35)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
      }
      ctx.fillRect(x, y, barW, bh);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = 1;

      barsMeta.push({ x: x, y: y, barW: barW, bh: bh, index: i, v: v });

      var showVal = v > 0 && (showValues || isHover);
      if (showVal) {
        if (isHover) {
          var hoverLines = series[i].hoverLines;
          if (!hoverLines || !hoverLines.length) {
            var dt = formatBarChartDate(series[i]);
            var valPart = series[i].valueLabel != null
              ? String(series[i].valueLabel)
              : formatBarChartValueWithUnit(v, options);
            if (dt && valPart) hoverLines = [dt, valPart];
            else if (valPart) hoverLines = [valPart];
            else if (dt) hoverLines = [dt];
          }
          if (hoverLines && hoverLines.length) {
            drawBarHoverTooltip(ctx, hoverLines, x + barW / 2, y, w);
          }
        } else {
          var valText = series[i].valueLabel != null
            ? String(series[i].valueLabel)
            : formatBarChartValue(v, options);
          if (valText) drawBarValueLabel(ctx, valText, x + barW / 2, y, w);
        }
      }
      if (options.showLabels !== false || (isHover && options.showLabels === false)) {
        var lbl = series[i].label || String(i + 1);
        if (isHover || options.showLabels !== false) {
          ctx.fillStyle = isHover ? '#1F1E1C' : '#6B6B6B';
          ctx.font = (isHover ? '600 ' : '') + '9px Golos Text, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(lbl, x + barW / 2, h - 6);
        }
      }
    });

    if (options.ySuffix) {
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '10px Golos Text, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(options.ySuffix, pad.l - 6, pad.t + 10);
    }

    var baseOptions = {};
    Object.keys(options).forEach(function (k) {
      if (k !== 'hoverIndex' && k !== '_redraw') baseOptions[k] = options[k];
    });
    canvas._barChartState = {
      series: series,
      baseOptions: baseOptions,
      bars: barsMeta,
      hover: hoverIndex
    };
    if (!options._redraw) bindBarChartMagnet(canvas);
  }



  function buildDividendRubSeries(yearly, forecast) {
    var bars = (yearly || []).map(function (y) {
      var v = y.totalDiv > 0 ? y.totalDiv : 0;
      return {
        v: v,
        label: String(y.year).slice(-2),
        forecast: false,
        valueLabel: v > 0 ? formatBarChartValue(v, {}) : ''
      };
    });
    if (forecast && forecast.amount != null && isFinite(forecast.amount)) {
      var fv = forecast.amount;
      bars.push({
        v: fv,
        label: '12м',
        forecast: true,
        valueLabel: formatBarChartValue(fv, {})
      });
    }
    return bars;
  }

  function analyticsPriceHorizonLabel(horizon) {
    if (horizon === 'day') return '1 день';
    if (horizon === 'month') return 'Месяц';
    return '5 лет';
  }

  function setSecurityChartTab(tab) {
    var tabs = document.getElementById('securityChartTabs');
    if (!tabs) return;
    tabs.querySelectorAll('[data-security-chart-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-security-chart-tab') === tab);
    });
    document.querySelectorAll('[data-security-chart-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.getAttribute('data-security-chart-panel') === tab);
    });
  }

  function getLatestBriefForTicker(ticker) {
    if (typeof getAllBriefs !== 'function') return null;
    var rows = getAllBriefs().filter(function (b) {
      return normalizeTicker(b.ticker) === normalizeTicker(ticker);
    }).sort(function (a, b) {
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
    return rows.length ? rows[0] : null;
  }

  function renderSecurityProfile(ticker, analytics) {
    var card = document.getElementById('securityProfileCard');
    var badgeRow = document.getElementById('securityProfileBadgeRow');
    var metrics = document.getElementById('securityProfileMetrics');
    if (!card || !badgeRow || !metrics) return;
    var inPortfolio = typeof findPortfolioPosition === 'function' && !!findPortfolioPosition(ticker);
    var lastBrief = getLatestBriefForTicker(ticker);
    var isUs = typeof Markets !== 'undefined' && Markets.isUsTicker(ticker);
    var type = (ticker.indexOf('OFZ') >= 0 || ticker.indexOf('SU') === 0)
      ? 'облигация'
      : (ticker === 'IMOEX' ? 'индекс' : 'акция');
    var turnover = analytics && analytics.quote && analytics.quote.valueToday != null
      ? (Number(analytics.quote.valueToday) / 1e9).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млрд ₽'
      : '—';
    var latestYield = analytics && analytics.divYieldByYear && analytics.divYieldByYear.length
      ? formatDivYieldPct(analytics.divYieldByYear[analytics.divYieldByYear.length - 1].yieldPct)
      : '—';
    badgeRow.innerHTML = '<span class="tag tag-importance">' + (inPortfolio ? 'Есть в портфеле' : 'В наблюдении') + '</span>';
    metrics.innerHTML =
      '<article class="security-metric-card"><span class="lbl">Тип</span><span class="val">' + escapeHtml(type) + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Рынок</span><span class="val">' + escapeHtml(isUs ? 'США' : 'Россия') + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Валюта</span><span class="val">' + escapeHtml(isUs ? '$' : '₽') + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Средняя дивдоходность 5 лет</span><span class="val">' + escapeHtml(analytics ? formatDivYieldPct(analytics.divAvg5y) : '—') + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Последняя дивидендная доходность</span><span class="val">' + escapeHtml(latestYield) + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Оборот торгов</span><span class="val">' + escapeHtml(turnover) + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Последнее важное событие</span><span class="val">' + escapeHtml(lastBrief ? lastBrief.title : 'События пока не найдены') + '</span></article>';
    card.hidden = false;
  }

  function renderAnalyticsDetail(ticker) {
    ticker = normalizeTicker(ticker);
    var sec = document.getElementById('analyticsDetailSection');
    var titleEl = document.getElementById('analyticsDetailTicker');
    var metaEl = document.getElementById('analyticsDetailMeta');
    var priceLbl = document.getElementById('analyticsPriceChartLbl');
    var priceCanvas = document.getElementById('analyticsPriceChart');
    var divCanvas = document.getElementById('analyticsDivChart');
    var volCanvas = document.getElementById('analyticsVolChart');
    var divNote = document.getElementById('analyticsDivNote');
    var volNote = document.getElementById('analyticsVolNote');
    if (!sec) return;
    if (titleEl) titleEl.textContent = ticker;
    if (metaEl) metaEl.textContent = 'Загрузка…';
    sec.hidden = false;
    setSecurityChartTab('price');

    var horizon = state.analyticsPriceHorizon || 'year';
    if (priceLbl) priceLbl.textContent = 'Цена · ' + analyticsPriceHorizonLabel(horizon);

    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      if (metaEl) metaEl.textContent = 'Рынок США · дивиденды и оборот МосБиржи недоступны';
      if (divNote) divNote.textContent = 'Используйте отчётность эмитента.';
      if (volNote) volNote.textContent = 'Данные по объёму торгов пока недоступны.';
      renderSecurityProfile(ticker, null);
      fetchMoexHistory(ticker, horizon).then(function (r) {
        if (priceCanvas) drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: horizon });
      });
      return;
    }

    if (typeof buildSecurityAnalytics !== 'function') return;
    buildSecurityAnalytics(ticker).then(function (a) {
      if (!a.eligible) {
        if (metaEl) metaEl.textContent = (a.name || getTickerSubtitle(ticker)) + ' · дивиденды и оборот TQBR недоступны для индексов';
        if (divNote) divNote.textContent = 'История дивидендов пока не добавлена.';
        if (volNote) volNote.textContent = 'Данные по объёму торгов пока недоступны.';
        if (divCanvas) {
          var dctx = divCanvas.getContext('2d');
          if (dctx) dctx.clearRect(0, 0, divCanvas.width, divCanvas.height);
        }
        if (volCanvas) {
          var vctx = volCanvas.getContext('2d');
          if (vctx) vctx.clearRect(0, 0, volCanvas.width, volCanvas.height);
        }
        renderSecurityProfile(ticker, a);
        return fetchMoexHistory(ticker, horizon);
      }
      if (metaEl) {
        var parts = [a.name || getTickerSubtitle(ticker)];
        if (a.divAvg5y != null) parts.push('Ср. див. 5л: ' + formatDivYieldPct(a.divAvg5y));
        if (a.divForecast && a.divForecast.amount != null) {
          parts.push('Прогноз: ' + formatDivRubPerShare(a.divForecast.amount));
        }
        metaEl.textContent = parts.join(' · ');
      }
      if (divCanvas) {
        drawFullBarChart(divCanvas, buildDividendRubSeries(a.divYieldByYear, a.divForecast), {
          color: CHART_COLOR_AUTUMN,
          forecastColor: CHART_COLOR_FORECAST,
          ySuffix: '₽/акц.',
          showValues: true
        });
      }
      if (divNote) {
        divNote.innerHTML = (a.divYieldByYear && a.divYieldByYear.length)
          ? (typeof formatDividendChartInfoHtml === 'function' ? formatDividendChartInfoHtml(a, null) : '')
          : 'История дивидендов пока не добавлена.';
        divNote.className = 'analytics-chart-note div-chart-info';
      }
      if (volCanvas) {
        var volBars = (a.volumeByDay || []).map(function (p) {
          return {
            v: p.v,
            date: p.date,
            label: p.label || '',
            valueLabel: p.v > 0 ? formatBarChartValue(p.v, { valueMode: 'bln' }) : '',
            forecast: false
          };
        });
        drawFullBarChart(volCanvas, volBars, {
          color: '#6B7A5A',
          ySuffix: 'млрд ₽',
          valueMode: 'bln',
          showLabels: false,
          showValues: false
        });
      }
      if (volNote) {
        volNote.textContent = a.volumeByDay && a.volumeByDay.length
          ? ('Оборот TQBR за год · ' + a.volumeByDay.length + ' торговых дней · наведите на столбец: дата и оборот в млрд ₽')
          : 'Данные по объёму торгов пока недоступны.';
        volNote.className = 'analytics-chart-note chart-info-readable';
      }
      renderSecurityProfile(ticker, a);
      return fetchMoexHistory(ticker, horizon);
    }).then(function (r) {
      if (priceCanvas && r && r.series) {
        drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: horizon });
      }
    }).catch(function () {
      if (metaEl) metaEl.textContent = 'Не удалось загрузить аналитику';
      if (divNote) divNote.textContent = 'История дивидендов пока не добавлена.';
      if (volNote) volNote.textContent = 'Данные по объёму торгов пока недоступны.';
    });
  }

  function renderPortfolioInsights(ticker) {
    var sec = document.getElementById('portfolioInsightsSection');
    if (!sec) return;
    ticker = normalizeTicker(ticker || '');
    if (!ticker) {
      sec.hidden = true;
      return;
    }
    var pos = typeof findPortfolioPosition === 'function' ? findPortfolioPosition(ticker) : null;
    if (!pos) {
      sec.hidden = true;
      return;
    }
    sec.hidden = false;
    var titleEl = document.getElementById('portfolioInsightsTicker');
    var metaEl = document.getElementById('portfolioInsightsMeta');
    var kpisEl = document.getElementById('portfolioInsightsKpis');
    var priceCanvas = document.getElementById('portfolioInsightPriceChart');
    var divCanvas = document.getElementById('portfolioInsightDivChart');
    var volCanvas = document.getElementById('portfolioInsightVolChart');
    var divNote = document.getElementById('portfolioInsightDivNote');
    var volNote = document.getElementById('portfolioInsightVolNote');
    if (titleEl) titleEl.textContent = ticker;
    if (metaEl) metaEl.textContent = 'Загрузка…';

    var ret = typeof getPositionReturnPct === 'function' ? getPositionReturnPct(pos) : null;
    var qty = isFinite(Number(pos.qty)) ? Number(pos.qty) : 0;

    fetchMoexHistory(ticker, 'year').then(function (r) {
      if (priceCanvas && r.series) drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: 'year' });
    });

    if (!isRuStockForAnalytics(ticker)) {
      if (metaEl) metaEl.textContent = 'US позиция · дивидендная аналитика МосБиржи недоступна';
      if (kpisEl) kpisEl.innerHTML = '';
      return;
    }

    buildSecurityAnalytics(ticker).then(function (a) {
      var fc = a.divForecast;
      var forecastTotal = fc && fc.amount != null && qty > 0 ? fc.amount * qty : null;
      var paidTotal = fc && fc.paid12m != null && qty > 0 ? fc.paid12m * qty : null;
      if (metaEl) {
        metaEl.textContent = [
          getTickerSubtitle(ticker),
          'Кол-во: ' + qty,
          ret != null ? 'Доходность: ' + formatSignedPct(ret, 2) : ''
        ].filter(Boolean).join(' · ');
      }
      if (kpisEl) {
        kpisEl.innerHTML =
          '<div class="insight-kpi"><span class="insight-kpi-lbl">Див. 5л ср.</span><span class="insight-kpi-val">' + escapeHtml(formatDivYieldPct(a.divAvg5y)) + '</span></div>' +
          '<div class="insight-kpi"><span class="insight-kpi-lbl">Прогноз 12 мес.</span><span class="insight-kpi-val">' + escapeHtml(formatDivRubPerShare(fc && fc.amount)) + '</span></div>' +
          '<div class="insight-kpi"><span class="insight-kpi-lbl">На позицию</span><span class="insight-kpi-val">' + escapeHtml(forecastTotal != null ? forecastTotal.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽' : '—') + '</span></div>' +
          '<div class="insight-kpi"><span class="insight-kpi-lbl">Выплачено 12 мес.</span><span class="insight-kpi-val">' + escapeHtml(paidTotal != null ? paidTotal.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽' : '—') + '</span></div>';
      }
      if (divCanvas) {
        drawFullBarChart(divCanvas, buildDividendRubSeries(a.divYieldByYear, a.divForecast), {
          color: CHART_COLOR_AUTUMN,
          forecastColor: CHART_COLOR_FORECAST,
          ySuffix: '₽/акц.',
          showValues: true
        });
      }
      if (divNote) {
        divNote.innerHTML = typeof formatDividendChartInfoHtml === 'function'
          ? formatDividendChartInfoHtml(a, qty)
          : '';
        divNote.className = 'analytics-chart-note div-chart-info';
      }
      if (volCanvas) {
        var volBars = (a.volumeByDay || []).map(function (p) {
          return {
            v: p.v,
            date: p.date,
            label: p.label || '',
            valueLabel: p.v > 0 ? formatBarChartValue(p.v, { valueMode: 'bln' }) : '',
            forecast: false
          };
        });
        drawFullBarChart(volCanvas, volBars, {
          color: '#6B7A5A',
          ySuffix: 'млрд ₽',
          valueMode: 'bln',
          showLabels: false,
          showValues: false
        });
      }
      if (volNote) {
        volNote.textContent = 'Оборот TQBR за год · ' + (a.volumeByDay ? a.volumeByDay.length : 0) +
          ' торговых дней · наведите на столбец: дата и оборот в млрд ₽';
        volNote.className = 'analytics-chart-note chart-info-readable';
      }
    });
    sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  window.paintQuoteMiniCharts = paintQuoteMiniCharts;
  window.openAnalyticsModal = openAnalyticsModal;
  window.closeAnalyticsModal = closeAnalyticsModal;
  window.drawMiniBarChart = drawMiniBarChart;
  window.drawFullBarChart = drawFullBarChart;
  window.renderAnalyticsDetail = renderAnalyticsDetail;
  window.renderPortfolioInsights = renderPortfolioInsights;
  window.setSecurityChartTab = setSecurityChartTab;



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
    if (grid.classList.contains('market-tiles--index-only')) return;
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
      if (typeof renderMarketMacro === 'function') renderMarketMacro(true);
    }
    if (tab === 'portfolio') {
      renderPortfolio();
      setupTickerAutocomplete('pfAddTicker');
    }
    if (tab === 'watchlist') {
      renderWatchlist();
      if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
      else if (typeof renderAnalyticsGrid === 'function') renderAnalyticsGrid();
    }
    if (tab === 'settings') renderAlerts();
    if (tab === 'articles' && typeof renderArticlesBlock === 'function') renderArticlesBlock();
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
    var valid = ['briefing', 'watchlist', 'portfolio', 'articles', 'settings'];
    if (valid.indexOf(hash) !== -1) switchTab(hash);
    else switchTab('briefing');
  }


