/* ui.js */
  var CHART_COLOR_AUTUMN = '#D4873B';
  var CHART_COLOR_AUTUMN_SOFT = 'rgba(212, 135, 59, 0.42)';
  var CHART_COLOR_FORECAST = '#4A7356';

  function divAvg5yValHtml(analytics) {
    if (!analytics || analytics.divAvg5y == null || !isFinite(analytics.divAvg5y)) {
      return escapeHtml('—');
    }
    if (typeof formatDivAvg5yDisplayHtml === 'function') {
      var html = formatDivAvg5yDisplayHtml(analytics);
      if (html) return html;
    }
    return escapeHtml(formatDivYieldPct(analytics.divAvg5y));
  }

  function divAvg5yMetaSuffix(analytics) {
    if (!analytics || analytics.divAvg5y == null || !isFinite(analytics.divAvg5y)) return '';
    if (analytics.divDataSource === 'yahoo') return ' Yahoo';
    return ' MOEX';
  }

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
        if (typeof searchOfzCatalog === 'function') {
          shortItems = shortItems.concat(searchOfzCatalog(v));
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



  function formatChartMonthYear(d) {
    var month = d.toLocaleDateString('ru-RU', { month: 'long' });
    if (month.length) month = month.charAt(0).toLowerCase() + month.slice(1);
    return month + ' ' + d.getFullYear();
  }



  function formatChartAxisTime(ts, horizon) {
    var d = new Date(ts);
    if (horizon === 'day') {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    if (horizon === '5y' || horizon === 'year') {
      return formatChartMonthYear(d);
    }
    var day = d.getDate();
    var monthShort = d.toLocaleDateString('ru-RU', { month: 'short' }).replace(/\./g, '').trim();
    return day + ' ' + monthShort;
  }



  function pickChartAxisLabelIndices(series, horizon) {
    if (!series || !series.length) return [];
    if (series.length === 1) return [0];
    var candidates = [0, Math.floor((series.length - 1) / 2), series.length - 1];
    var seen = {};
    var out = [];
    candidates.forEach(function (idx) {
      if (idx < 0 || idx >= series.length) return;
      var lbl = formatChartAxisTime(series[idx].t, horizon);
      if (seen[lbl]) {
        for (var delta = 1; delta <= 24; delta++) {
          var alt = idx + delta;
          if (alt < series.length) {
            var altLbl = formatChartAxisTime(series[alt].t, horizon);
            if (!seen[altLbl]) {
              idx = alt;
              lbl = altLbl;
              break;
            }
          }
          alt = idx - delta;
          if (alt >= 0) {
            var altLbl2 = formatChartAxisTime(series[alt].t, horizon);
            if (!seen[altLbl2]) {
              idx = alt;
              lbl = altLbl2;
              break;
            }
          }
        }
      }
      if (!seen[lbl]) {
        seen[lbl] = true;
        out.push(idx);
      }
    });
    if (out.indexOf(0) < 0) out.unshift(0);
    if (out.indexOf(series.length - 1) < 0) out.push(series.length - 1);
    return out.sort(function (a, b) { return a - b; });
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
    var size = chartCanvasSize(canvas, 280, 160);
    var w = size.w;
    var h = size.h;
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
      bottom: (options.horizon === '5y' || options.horizon === 'year') ? 36 : 28,
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

    var labelIdx = pickChartAxisLabelIndices(series, options.horizon);
    ctx.fillStyle = '#6B6B6B';
    ctx.font = (options.horizon === '5y' || options.horizon === 'year')
      ? '9px Inter, Manrope, sans-serif'
      : '10px Inter, Manrope, sans-serif';
    ctx.textAlign = 'center';
    labelIdx.forEach(function (idx) {
      if (idx < 0 || idx >= series.length) return;
      ctx.fillText(formatChartAxisTime(series[idx].t, options.horizon), xAt(idx), h - 8);
    });

    bindChartHover(canvas);
  }



  function chartCanvasSize(canvas, minW, minH) {
    minW = minW || 200;
    minH = minH || 100;
    if (!canvas) return { w: minW, h: minH };
    var rect = canvas.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    if (w < 100) {
      var section = canvas.closest('.analytics-detail, .security-analytics-charts, #securityAnalyticsSection, .modal--analytics');
      if (section) {
        var sw = section.getBoundingClientRect().width;
        if (sw >= 100) w = Math.max(sw - 32, minW);
      }
    }
    if (h < 40) {
      var wrap = canvas.parentElement;
      if (wrap) {
        var wrapH = wrap.clientHeight || parseFloat(getComputedStyle(wrap).height);
        if (wrapH >= 40) h = wrapH;
      }
    }
    return {
      w: Math.max(w > 0 ? w : minW, minW),
      h: Math.max(h > 0 ? h : minH, minH)
    };
  }

  function buildVolumeBarSeries(volumeByDay) {
    return (volumeByDay || []).map(function (p) {
      var volStr = p.v > 0
        ? p.v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
        : '0';
      return {
        v: p.v,
        date: p.date,
        label: p.label || '',
        valueLabel: p.v > 0 ? formatBarChartValue(p.v, { valueMode: 'bln' }) : '',
        hoverLines: [
          formatBarHoverDate(p) || p.label || '',
          'Оборот: ' + volStr + ' млрд ₽'
        ],
        forecast: false
      };
    });
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

    if (securityChartIsBond(ticker)) {
      loadBondAnalyticsSnapshot(ticker).then(function (bond) {
        if (metaEl) metaEl.textContent = bond.error ? 'Не удалось загрузить данные по ОФЗ' : bondAnalyticsMetaText(ticker, bond);
        renderSecurityProfile(ticker, { bond: bond, eligible: true, quote: bond.quote || { price: bond.price, valueToday: bond.quote && bond.quote.valueToday, yieldPct: bond.yieldPct } });
        if (divCanvas) {
          if (bond.coupons && bond.coupons.length) renderBondCouponChart(divCanvas, bond);
          else {
            var dctx = divCanvas.getContext('2d');
            if (dctx) dctx.clearRect(0, 0, divCanvas.width, divCanvas.height);
          }
        }
        if (divNote) {
          divNote.textContent = bond.coupons && bond.coupons.length
            ? bondAnalyticsDivNote()
            : 'Расписание купонов по этому выпуску пока недоступно.';
          divNote.className = 'analytics-chart-note chart-info-readable';
        }
        if (volCanvas) {
          var vctx = volCanvas.getContext('2d');
          if (vctx) vctx.clearRect(0, 0, volCanvas.width, volCanvas.height);
        }
        if (volNote) volNote.textContent = bondAnalyticsVolNote();
        return fetchMoexHistory(ticker, 'month');
      }).then(function (r) {
        if (priceCanvas && r && r.series) {
          drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: 'month' });
        }
      }).catch(function () {
        if (metaEl) metaEl.textContent = 'Не удалось загрузить аналитику по ОФЗ';
      });
      return;
    }

    if (typeof buildSecurityAnalytics !== 'function') return;
    buildSecurityAnalytics(ticker).then(function (a) {
      if (metaEl) {
        var parts = [a.name || getTickerSubtitle(ticker)];
        if (a.divAvg5y != null) {
          parts.push('Ср. див. доходность 5л: ' + formatDivYieldPct(a.divAvg5y) + divAvg5yMetaSuffix(a));
        }
        metaEl.textContent = parts.join(' · ');
      }
      if (divCanvas) {
        drawFullBarChart(divCanvas, buildDividendRubSeries(a.divYieldByYear, a.divForecast), {
          color: CHART_COLOR_AUTUMN,
          forecastColor: CHART_COLOR_FORECAST,
          ySuffix: '₽/акц.',
          showValues: true,
          compactBars: true
        });
      }
      if (divNote) {
        divNote.innerHTML = typeof formatDividendChartInfoHtml === 'function'
          ? formatDividendChartInfoHtml(a, null)
          : ((a.divYieldByYear || []).map(function (y) {
            return y.year + ': ' + (y.yieldPct != null ? formatDivYieldPct(y.yieldPct) : '—');
          }).join(' · ') || '—');
        divNote.className = 'analytics-chart-note div-chart-info';
      }
      if (volCanvas) {
        drawFullBarChart(volCanvas, buildVolumeBarSeries(a.volumeByDay), {
          color: '#6B7A5A',
          ySuffix: 'млрд ₽',
          valueMode: 'bln',
          showLabels: false,
          showValues: false
        });
      }
      if (volNote) {
        volNote.textContent = (typeof formatVolumeFreshnessNote === 'function'
          ? formatVolumeFreshnessNote(a)
          : ('Оборот TQBR, млрд ₽ · ' + (a.volumeByDay.length || 0) + ' торговых дней'))
          + ' · наведите на столбец: дата и оборот';
        volNote.className = 'analytics-chart-note chart-info-readable' + (a.volumeStale ? ' data-stale-warning' : '');
      }
      return fetchMoexHistory(ticker, 'month');
    }).then(function (r) {
      if (priceCanvas && r && r.series) {
        drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: 'month' });
      }
      requestAnimationFrame(function () {
        if (divCanvas && divCanvas._barChartState) {
          drawFullBarChart(divCanvas, divCanvas._barChartState.series,
            Object.assign({}, divCanvas._barChartState.baseOptions, { _redraw: true }));
        }
        if (volCanvas && volCanvas._barChartState) {
          drawFullBarChart(volCanvas, volCanvas._barChartState.series,
            Object.assign({}, volCanvas._barChartState.baseOptions, { _redraw: true }));
        }
      });
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



  function formatBarHoverDate(point) {
    if (!point) return '';
    if (point.date && typeof formatTradeDateRu === 'function') {
      return formatTradeDateRu(point.date, true);
    }
    return formatBarChartDate(point);
  }



  function getBarHoverLines(point, v, options) {
    if (point && point.hoverLines && point.hoverLines.length) return point.hoverLines.slice();
    options = options || {};
    var dt = formatBarHoverDate(point);
    var val = point && point.valueLabel != null
      ? String(point.valueLabel)
      : formatBarChartValueWithUnit(v, options);
    if (dt && val) return [dt, val];
    if (val) return [val];
    return dt ? [dt] : [];
  }



  function ensureBarChartHoverTip(wrap) {
    var tip = wrap.querySelector('.bar-chart-hover-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'bar-chart-hover-tip';
      tip.setAttribute('aria-hidden', 'true');
      wrap.appendChild(tip);
    }
    return tip;
  }



  function hideBarChartHoverTip(canvas) {
    var wrap = canvas && canvas.parentElement;
    if (!wrap) return;
    var tip = wrap.querySelector('.bar-chart-hover-tip');
    if (tip) {
      tip.classList.remove('is-visible', 'bar-chart-hover-tip--below');
      tip.setAttribute('aria-hidden', 'true');
    }
  }



  function positionBarChartHoverTip(tip, wrap, cx, cy) {
    tip.classList.remove('bar-chart-hover-tip--below');
    tip.style.left = cx + 'px';
    tip.style.top = cy + 'px';
    tip.style.transform = 'translate(-50%, calc(-100% - 10px))';
    tip.classList.add('is-visible');
    tip.setAttribute('aria-hidden', 'false');

    var pad = 10;
    var wrapW = wrap.clientWidth;
    var wrapH = wrap.clientHeight;
    var tipW = tip.offsetWidth;
    var tipH = tip.offsetHeight;
    var left = cx - tipW / 2;
    if (left < pad) left = pad;
    if (left + tipW > wrapW - pad) left = wrapW - pad - tipW;
    tip.style.left = (left + tipW / 2) + 'px';

    var topAbove = cy - tipH - 12;
    if (topAbove < pad) {
      tip.classList.add('bar-chart-hover-tip--below');
      tip.style.top = (cy + 14) + 'px';
      tip.style.transform = 'translate(-50%, 0)';
      if (cy + 14 + tipH > wrapH - pad) {
        tip.style.top = Math.max(pad, wrapH - pad - tipH) + 'px';
        tip.style.transform = 'translate(-50%, 0)';
      }
    }
  }



  function showBarChartHoverTip(canvas, hitIndex) {
    var st = canvas._barChartState;
    if (!st || hitIndex < 0 || !st.bars[hitIndex]) {
      hideBarChartHoverTip(canvas);
      return;
    }
    var wrap = canvas.parentElement;
    if (!wrap) return;
    var tip = ensureBarChartHoverTip(wrap);
    var bar = st.bars[hitIndex];
    var point = st.series[hitIndex];
    var lines = getBarHoverLines(point, bar.v, st.baseOptions);
    tip.innerHTML = lines.map(function (ln, idx) {
      var cls = idx === 0 ? 'bar-chart-hover-tip__date' : 'bar-chart-hover-tip__val';
      return '<span class="' + cls + '">' + escapeHtml(ln) + '</span>';
    }).join('');
    positionBarChartHoverTip(tip, wrap, bar.x + bar.barW / 2, bar.y);
  }



  function drawBarValueLabel(ctx, text, cx, topY, plotWidth) {
    if (!text) return;
    ctx.save();
    ctx.font = '600 11px Manrope, Golos Text, sans-serif';
    var tw = ctx.measureText(text).width;
    var padX = 7;
    var padY = 3;
    var bw = tw + padX * 2;
    var bh = 16;
    var maxPlotW = plotWidth || 320;
    var bx = Math.max(4, Math.min(cx - bw / 2, maxPlotW - bw - 4));
    var by = Math.max(4, topY - bh - 6);
    ctx.fillStyle = 'rgba(255, 252, 248, 0.98)';
    ctx.strokeStyle = CHART_COLOR_AUTUMN_SOFT;
    ctx.lineWidth = 1;
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



  function bindBarChartResize(canvas) {
    if (!canvas || canvas._barResizeObs) return;
    canvas._barResizeObs = true;
    if (typeof ResizeObserver === 'undefined') return;
    var target = canvas.parentElement || canvas;
    var timer;
    var ro = new ResizeObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var st = canvas._barChartState;
        if (st && st.series) drawFullBarChart(canvas, st.series, st.baseOptions);
      }, 80);
    });
    ro.observe(target);
    canvas._barResizeObserver = ro;
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
      var i;
      for (i = 0; i < st.bars.length; i++) {
        var b = st.bars[i];
        if (mx >= b.x - 1 && mx <= b.x + b.barW + 1) return b.index;
      }
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
      var refBar = st.bars[0];
      var magnet = refBar ? Math.max(10, Math.min(28, refBar.barW * 2.5)) : 16;
      return bestDist <= magnet ? best : -1;
    }

    function setHover(hoverIdx) {
      var st = canvas._barChartState;
      if (!st) return;
      if (hoverIdx !== st.hover) {
        var opts = Object.assign({}, st.baseOptions, { hoverIndex: hoverIdx, _redraw: true });
        drawFullBarChart(canvas, st.series, opts);
      } else if (hoverIdx >= 0) {
        showBarChartHoverTip(canvas, hoverIdx);
      }
      if (hoverIdx < 0) hideBarChartHoverTip(canvas);
    }

    var wrap = parent || canvas.parentElement;
    (wrap || canvas).addEventListener('mousemove', function (e) {
      setHover(pickBar(e.clientX));
    });
    (wrap || canvas).addEventListener('mouseleave', function () {
      setHover(-1);
    });
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length) setHover(pickBar(e.touches[0].clientX));
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length) {
        e.preventDefault();
        setHover(pickBar(e.touches[0].clientX));
      }
    }, { passive: false });
    canvas.addEventListener('touchend', function () { setHover(-1); });
    canvas.addEventListener('touchcancel', function () { setHover(-1); });
  }



  function drawFullBarChart(canvas, series, options) {
    options = options || {};
    if (!canvas) return;
    var prevHover = options._redraw && canvas._barChartState ? canvas._barChartState.hover : -1;
    var hoverIndex = options.hoverIndex != null ? options.hoverIndex : prevHover;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var size = chartCanvasSize(canvas, 200, 100);
    var w = size.w;
    var h = size.h;
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
    var n = vals.length;
    var dense = n > 14;
    var compact = options.compactBars !== false && n <= 10;
    var alwaysValues = options.showValues === true;
    var showValues = options.showValues !== false && (alwaysValues || !dense);
    var padTop = showValues ? (compact ? 40 : 34) : 14;
    if (hoverIndex >= 0) padTop = Math.max(padTop, 44);
    var pad = { l: 40, r: 16, t: padTop, b: 30 };
    var plotW = w - pad.l - pad.r;
    var plotH = h - pad.t - pad.b;
    var stretchBars = options.stretchBars !== false && n > 14;
    var barGap = compact ? 14 : (stretchBars ? (n > 60 ? 1 : (n > 30 ? 2 : 3)) : (n > 20 ? 2 : (n > 14 ? 4 : 8)));
    var barW;
    var startX;
    if (stretchBars) {
      barW = Math.max(1, (plotW - barGap * Math.max(n - 1, 0)) / Math.max(n, 1));
      startX = pad.l;
    } else {
      var maxBarW = compact ? 48 : (n > 14 ? 28 : 40);
      var minBarW = compact ? 32 : 4;
      barW = Math.max(minBarW, Math.min(maxBarW, (plotW - barGap * Math.max(n - 1, 0)) / Math.max(n, 1)));
      var groupW = n * barW + barGap * Math.max(n - 1, 0);
      startX = pad.l + Math.max(0, (plotW - groupW) / 2);
    }
    var color = options.color || CHART_COLOR_AUTUMN;
    var forecastColor = options.forecastColor || CHART_COLOR_FORECAST;
    var barsMeta = [];

    vals.forEach(function (v, i) {
      var isHover = i === hoverIndex;
      var lift = isHover ? 5 : 0;
      var bh = Math.max(3, (v / max) * plotH) * (isHover ? 1.06 : 1);
      var x = startX + i * (barW + barGap);
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
      if (showVal && !isHover) {
        var valText = series[i].valueLabel != null
          ? String(series[i].valueLabel)
          : formatBarChartValue(v, options);
        if (valText) drawBarValueLabel(ctx, valText, x + barW / 2, y, w);
      }
      if (options.showLabels !== false || (isHover && options.showLabels === false)) {
        var lbl = series[i].label || String(i + 1);
        if (isHover || options.showLabels !== false) {
          ctx.fillStyle = isHover ? '#1F1E1C' : '#6B6B6B';
          ctx.font = (isHover ? '600 ' : '') + (compact ? '10px' : '9px') + ' Golos Text, sans-serif';
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
    if (!options._redraw) {
      bindBarChartMagnet(canvas);
      bindBarChartResize(canvas);
    }
    if (hoverIndex >= 0) showBarChartHoverTip(canvas, hoverIndex);
    else hideBarChartHoverTip(canvas);
  }



  function buildDividendRubSeries(yearly, forecast) {
    var bars = (yearly || []).filter(function (y) { return y.totalDiv > 0; }).map(function (y) {
      var v = y.totalDiv > 0 ? y.totalDiv : 0;
      return {
        v: v,
        label: String(y.year),
        forecast: false,
        valueLabel: v > 0 ? formatBarChartValue(v, {}) : '',
        hoverLines: v > 0
          ? ['Отчётный ' + String(y.year), formatBarChartValue(v, {}) + ' ₽/акц.']
          : ['Отчётный ' + String(y.year)]
      };
    });
    if (forecast && forecast.amount != null && isFinite(forecast.amount)) {
      var fv = forecast.amount;
      bars.push({
        v: fv,
        label: '12м',
        forecast: true,
        valueLabel: formatBarChartValue(fv, {}),
        hoverLines: ['Прогноз 12 мес.', formatBarChartValue(fv, {}) + ' ₽/акц.']
      });
    }
    return bars;
  }

  function resolveAnalyticsPriceHorizon(horizon) {
    horizon = horizon || '5y';
    if (horizon === 'year') return '5y';
    return horizon;
  }

  function analyticsPriceHorizonLabel(horizon) {
    horizon = resolveAnalyticsPriceHorizon(horizon);
    if (horizon === 'day') return '1 день';
    if (horizon === 'month') return 'Месяц';
    return '5 лет';
  }

  function securityChartSupportsStockAnalytics(ticker) {
    ticker = normalizeTicker(ticker);
    if (typeof isIndexQuoteTicker === 'function' && isIndexQuoteTicker(ticker)) return false;
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) return false;
    if (typeof isRuBondTicker === 'function' && isRuBondTicker(ticker)) return false;
    return true;
  }

  function securityChartIsBond(ticker) {
    return typeof isRuBondTicker === 'function' && isRuBondTicker(normalizeTicker(ticker));
  }

  function syncSecurityChartTabsForTicker(ticker) {
    var tabs = document.getElementById('securityChartTabs');
    if (!tabs) return;
    var stockAnalytics = securityChartSupportsStockAnalytics(ticker);
    var isBond = securityChartIsBond(ticker);
    tabs.querySelectorAll('[data-security-chart-tab]').forEach(function (btn) {
      var id = btn.getAttribute('data-security-chart-tab');
      if (id === 'dividends') {
        btn.textContent = isBond ? 'Купоны' : 'Дивиденды';
        var divDisabled = !stockAnalytics && !isBond;
        btn.disabled = divDisabled;
        btn.classList.toggle('security-chart-tab--disabled', divDisabled);
        btn.setAttribute('aria-disabled', divDisabled ? 'true' : 'false');
        if (divDisabled) btn.title = 'Дивиденды доступны только для акций';
        else if (isBond) btn.title = 'Купонные выплаты по выпуску ОФЗ';
        else btn.removeAttribute('title');
        return;
      }
      if (id === 'volume') {
        var volDisabled = !stockAnalytics;
        btn.disabled = volDisabled;
        btn.classList.toggle('security-chart-tab--disabled', volDisabled);
        btn.setAttribute('aria-disabled', volDisabled ? 'true' : 'false');
        if (volDisabled) {
          btn.title = isBond
            ? 'Оборот TQBR считается по акциям, не по ОФЗ'
            : 'Оборот TQBR доступен только для акций';
        } else btn.removeAttribute('title');
      }
    });
    if (!stockAnalytics && !isBond) setSecurityChartTab('price');
  }

  function setSecurityChartTab(tab) {
    var tabs = document.getElementById('securityChartTabs');
    if (!tabs) return;
    var target = tabs.querySelector('[data-security-chart-tab="' + tab + '"]');
    if (target && target.disabled) return;
    tabs.querySelectorAll('[data-security-chart-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-security-chart-tab') === tab);
    });
    document.querySelectorAll('[data-security-chart-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.getAttribute('data-security-chart-panel') === tab);
    });
    redrawSecurityChartTab(tab);
  }

  function redrawSecurityChartTab(tab) {
    requestAnimationFrame(function () {
      if (tab === 'price') {
        var priceCanvas = document.getElementById('analyticsPriceChart');
        var meta = priceCanvas && priceCanvas._chartMeta;
        if (priceCanvas && meta) {
          drawPriceChart(priceCanvas, meta.series, { ticker: meta.ticker, horizon: meta.horizon });
        }
      } else if (tab === 'dividends') {
        var divCanvas = document.getElementById('analyticsDivChart');
        var divSt = divCanvas && divCanvas._barChartState;
        if (divCanvas && divSt) {
          drawFullBarChart(divCanvas, divSt.series, Object.assign({}, divSt.baseOptions, { _redraw: true }));
        }
      } else if (tab === 'volume') {
        var volCanvas = document.getElementById('analyticsVolChart');
        var volSt = volCanvas && volCanvas._barChartState;
        if (volCanvas && volSt) {
          drawFullBarChart(volCanvas, volSt.series, Object.assign({}, volSt.baseOptions, { _redraw: true }));
        }
      }
    });
  }

  function indexAnalyticsDivNote() {
    return 'У индекса IMOEX нет дивидендов на акцию. Смотрите дивидендную доходность отдельных эмитентов из состава индекса.';
  }

  function indexAnalyticsVolNote() {
    return 'Оборот TQBR считается по акциям, не по индексу. Для динамики рынка используйте график цены IMOEX выше.';
  }

  function bondAnalyticsDivNote() {
    return 'Для ОФЗ показан график купонных выплат по выпуску. Доходность к погашению и цена — в карточке профиля и на графике цены.';
  }

  function bondAnalyticsVolNote() {
    return 'Оборот TQBR считается по акциям. Для сравнения выпусков ОФЗ используйте вкладку «ОФЗ» в разделе аналитики.';
  }

  function formatBondProfileDate(iso) {
    var s = String(iso || '').slice(0, 10);
    if (s.length < 10) return '—';
    return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
  }

  function formatBondCouponPct(v) {
    if (v == null || !isFinite(Number(v))) return '—';
    return Number(v).toFixed(2).replace('.', ',') + '%';
  }

  function loadBondAnalyticsSnapshot(ticker) {
    ticker = normalizeTicker(ticker);
    if (typeof fetchOfzBondSnapshot === 'function') {
      return fetchOfzBondSnapshot({ ticker: ticker });
    }
    if (typeof fetchMoexQuote !== 'function') {
      return Promise.resolve({ ticker: ticker, error: true });
    }
    return fetchMoexQuote(ticker).then(function (q) {
      return {
        ticker: ticker,
        label: getTickerSubtitle(ticker) || ticker,
        price: q && q.price,
        changePct: q && q.changePct,
        yieldPct: q && q.yieldPct,
        quote: q || {}
      };
    });
  }

  function renderBondCouponChart(canvas, bond) {
    if (!canvas || !bond || !bond.coupons || !bond.coupons.length) return;
    if (typeof buildOfzCouponBarSeries !== 'function') return;
    drawFullBarChart(canvas, buildOfzCouponBarSeries(bond.coupons, bond.faceValue || 1000), {
      color: CHART_COLOR_AUTUMN,
      forecastColor: CHART_COLOR_FORECAST,
      ySuffix: '₽',
      showValues: true,
      compactBars: true
    });
  }

  function bondAnalyticsMetaText(ticker, bond) {
    var parts = [bond.label || getTickerSubtitle(ticker) || ticker];
    if (bond.kindLabel) parts.push(bond.kindLabel);
    if (bond.yieldPct != null && isFinite(bond.yieldPct)) {
      parts.push('Доходность: ' + formatDivYieldPct(bond.yieldPct));
    }
    if (bond.couponPct != null && isFinite(bond.couponPct)) {
      parts.push('Купон: ' + formatBondCouponPct(bond.couponPct));
    }
    if (bond.matDate) parts.push('Погашение: ' + formatBondProfileDate(bond.matDate));
    return parts.join(' · ');
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

  function securityTurnoverPeriodLabel(ticker, tradeDate) {
    if (typeof isIndexQuoteTicker === 'function' && isIndexQuoteTicker(ticker)) {
      return 'Оборот торгов';
    }
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      return 'Оборот за сессию';
    }
    var iso = tradeDate ? String(tradeDate).slice(0, 10) : '';
    if (iso.length >= 10) {
      return 'Оборот торгов · ' + iso.slice(8, 10) + '.' + iso.slice(5, 7);
    }
    return 'Оборот торгов за текущий день';
  }

  function formatSecurityProfileTurnover(ticker, analytics) {
    if (typeof isIndexQuoteTicker === 'function' && isIndexQuoteTicker(ticker)) {
      return 'не применимо';
    }
    var v = analytics && analytics.quote && analytics.quote.valueToday != null
      ? Number(analytics.quote.valueToday)
      : null;
    if ((v == null || !isFinite(v)) && analytics && analytics.volumeByDay && analytics.volumeByDay.length) {
      var last = analytics.volumeByDay[analytics.volumeByDay.length - 1];
      if (last && isFinite(Number(last.v))) v = Number(last.v) * 1e9;
    }
    if (v == null || !isFinite(v)) return '—';
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      if (typeof formatUsdTurnoverShort === 'function') return formatUsdTurnoverShort(v);
      if (v >= 1e9) return (v / 1e9).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млрд $';
      if (v >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млн $';
      return v.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' $';
    }
    return (v / 1e9).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млрд ₽';
  }

  function renderSecurityProfile(ticker, analytics) {
    var card = document.getElementById('securityProfileCard');
    var badgeRow = document.getElementById('securityProfileBadgeRow');
    var metrics = document.getElementById('securityProfileMetrics');
    if (!card || !badgeRow || !metrics) return;
    var inPortfolio = typeof findPortfolioPosition === 'function' && !!findPortfolioPosition(ticker);
    var lastBrief = getLatestBriefForTicker(ticker);
    var isUs = typeof Markets !== 'undefined' && Markets.isUsTicker(ticker);
    var isIndex = typeof isIndexQuoteTicker === 'function' && isIndexQuoteTicker(ticker);
    var isBond = typeof isRuBondTicker === 'function' && isRuBondTicker(ticker);
    var type = isBond ? 'облигация' : (isIndex ? 'индекс' : 'акция');
    var turnover = formatSecurityProfileTurnover(ticker, analytics);
    var tradeDate = '';
    if (analytics) {
      if (typeof resolveQuoteTradeDate === 'function') tradeDate = resolveQuoteTradeDate(analytics);
      else if (analytics.quote && analytics.quote.tradeDate) tradeDate = analytics.quote.tradeDate;
      else if (analytics.dataAsOf) tradeDate = analytics.dataAsOf;
    }
    var turnoverLbl = securityTurnoverPeriodLabel(ticker, tradeDate);
    var latestPct = null;
    if (analytics) {
      if (typeof computeLatestDivYieldPct === 'function') {
        latestPct = analytics.divLatestYield != null ? analytics.divLatestYield : computeLatestDivYieldPct(analytics);
      } else if (analytics.divLatestYield != null) {
        latestPct = analytics.divLatestYield;
      }
    }
    var latestYield = isIndex ? 'не применимо' : formatDivYieldPct(latestPct);
    var divAvgHtml = isIndex ? '<span class="muted">не применимо</span>' : divAvg5yValHtml(analytics);
    badgeRow.innerHTML = '<span class="tag tag-importance">' + (inPortfolio ? 'Есть в портфеле' : 'В наблюдении') + '</span>';
    if (isBond) {
      var bond = analytics && analytics.bond;
      var ytm = bond && bond.yieldPct != null && isFinite(bond.yieldPct)
        ? formatDivYieldPct(bond.yieldPct)
        : (analytics && analytics.quote && analytics.quote.yieldPct != null
          ? formatDivYieldPct(analytics.quote.yieldPct)
          : '—');
      metrics.innerHTML =
        '<article class="security-metric-card"><span class="lbl">Тип</span><span class="val">' + escapeHtml(type) + (bond && bond.kindLabel ? ' · ' + escapeHtml(bond.kindLabel) : '') + '</span></article>' +
        '<article class="security-metric-card"><span class="lbl">Рынок</span><span class="val">Россия</span></article>' +
        '<article class="security-metric-card"><span class="lbl">Доходность к погашению</span><span class="val">' + escapeHtml(ytm) + '</span></article>' +
        '<article class="security-metric-card"><span class="lbl">Купон</span><span class="val">' + escapeHtml(formatBondCouponPct(bond && bond.couponPct)) + '</span></article>' +
        '<article class="security-metric-card"><span class="lbl">Погашение</span><span class="val">' + escapeHtml(formatBondProfileDate(bond && bond.matDate)) + '</span></article>' +
        '<article class="security-metric-card"><span class="lbl">' + escapeHtml(turnoverLbl) + '</span><span class="val">' + escapeHtml(turnover) + '</span></article>' +
        '<article class="security-metric-card"><span class="lbl">Последнее важное событие</span><span class="val">' + escapeHtml(lastBrief ? lastBrief.title : 'События пока не найдены') + '</span></article>';
      card.hidden = false;
      return;
    }
    metrics.innerHTML =
      '<article class="security-metric-card"><span class="lbl">Тип</span><span class="val">' + escapeHtml(type) + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Рынок</span><span class="val">' + escapeHtml(isUs ? 'США' : 'Россия') + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Валюта</span><span class="val">' + escapeHtml(isUs ? '$' : '₽') + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Средняя дивдоходность 5 лет</span><span class="val">' + divAvgHtml + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">Последняя дивидендная доходность</span><span class="val">' + escapeHtml(latestYield) + '</span></article>' +
      '<article class="security-metric-card"><span class="lbl">' + escapeHtml(turnoverLbl) + '</span><span class="val">' + escapeHtml(turnover) + '</span></article>' +
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
    syncSecurityChartTabsForTicker(ticker);
    setSecurityChartTab('price');

    var horizon = resolveAnalyticsPriceHorizon(state.analyticsPriceHorizon);
    if (priceLbl) priceLbl.textContent = 'Цена · ' + analyticsPriceHorizonLabel(horizon);

    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      if (metaEl) metaEl.textContent = 'Рынок США · дивиденды и оборот TQBR недоступны для американских бумаг';
      if (divNote) divNote.textContent = 'Дивиденды MOEX/TQBR не рассчитываются для бумаг США. Смотрите отчётность эмитента.';
      if (volNote) volNote.textContent = 'Оборот TQBR доступен только для акций на МосБирже.';
      renderSecurityProfile(ticker, null);
      if (typeof Markets.fetchUsQuoteExtended === 'function') {
        Markets.fetchUsQuoteExtended(ticker).then(function (q) {
          renderSecurityProfile(ticker, { quote: q || {}, divYieldByYear: [], eligible: true });
        }).catch(function () { /* profile already shown */ });
      }
      fetchMoexHistory(ticker, horizon).then(function (r) {
        if (priceCanvas) drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: horizon });
      });
      return;
    }

    if (securityChartIsBond(ticker)) {
      loadBondAnalyticsSnapshot(ticker).then(function (bond) {
        if (metaEl) metaEl.textContent = bond.error ? 'Не удалось загрузить данные по ОФЗ' : bondAnalyticsMetaText(ticker, bond);
        renderSecurityProfile(ticker, { bond: bond, eligible: true, quote: bond.quote || { price: bond.price, valueToday: bond.quote && bond.quote.valueToday, yieldPct: bond.yieldPct } });
        if (divCanvas) {
          if (bond.coupons && bond.coupons.length) renderBondCouponChart(divCanvas, bond);
          else {
            var dctx = divCanvas.getContext('2d');
            if (dctx) dctx.clearRect(0, 0, divCanvas.width, divCanvas.height);
          }
        }
        if (divNote) {
          divNote.textContent = bond.coupons && bond.coupons.length
            ? bondAnalyticsDivNote()
            : 'Расписание купонов по этому выпуску пока недоступно.';
          divNote.className = 'analytics-chart-note chart-info-readable';
        }
        if (volCanvas) {
          var vctx = volCanvas.getContext('2d');
          if (vctx) vctx.clearRect(0, 0, volCanvas.width, volCanvas.height);
        }
        if (volNote) volNote.textContent = bondAnalyticsVolNote();
        return fetchMoexHistory(ticker, horizon);
      }).then(function (r) {
        if (priceCanvas && r && r.series) {
          drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: horizon });
        }
        requestAnimationFrame(function () {
          var activeTab = document.querySelector('[data-security-chart-tab].active');
          if (activeTab) redrawSecurityChartTab(activeTab.getAttribute('data-security-chart-tab'));
        });
      }).catch(function () {
        if (metaEl) metaEl.textContent = 'Не удалось загрузить аналитику по ОФЗ';
        if (divNote) divNote.textContent = 'Данные по купонам пока недоступны.';
        if (volNote) volNote.textContent = bondAnalyticsVolNote();
      });
      return;
    }

    if (typeof buildSecurityAnalytics !== 'function') return;
    buildSecurityAnalytics(ticker).then(function (a) {
      if (!a.eligible) {
        if (metaEl) metaEl.textContent = (a.name || getTickerSubtitle(ticker)) + ' · для индекса доступен график цены';
        if (divNote) divNote.textContent = indexAnalyticsDivNote();
        if (volNote) volNote.textContent = indexAnalyticsVolNote();
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
        if (a.divAvg5y != null) {
          parts.push('Ср. див. 5л: ' + formatDivYieldPct(a.divAvg5y) + divAvg5yMetaSuffix(a));
        }
        if (a.divForecast && a.divForecast.amount != null) {
          parts.push('Прогноз: ' + formatDivRubPerShare(a.divForecast.amount));
        }
        if (a.dataAsOf && typeof AnalyticsCore !== 'undefined' && AnalyticsCore.formatIsoDateRu) {
          parts.push('данные MOEX на ' + AnalyticsCore.formatIsoDateRu(a.dataAsOf));
        }
        metaEl.textContent = parts.join(' · ');
      }
      if (divCanvas) {
        drawFullBarChart(divCanvas, buildDividendRubSeries(a.divYieldByYear, a.divForecast), {
          color: CHART_COLOR_AUTUMN,
          forecastColor: CHART_COLOR_FORECAST,
          ySuffix: '₽/акц.',
          showValues: true,
          compactBars: true
        });
      }
      if (divNote) {
        divNote.innerHTML = (a.divYieldByYear && a.divYieldByYear.length)
          ? (typeof formatDividendChartInfoHtml === 'function' ? formatDividendChartInfoHtml(a, null) : '')
          : 'История дивидендов пока не добавлена.';
        divNote.className = 'analytics-chart-note div-chart-info';
      }
      if (volCanvas) {
        drawFullBarChart(volCanvas, buildVolumeBarSeries(a.volumeByDay), {
          color: '#6B7A5A',
          ySuffix: 'млрд ₽',
          valueMode: 'bln',
          showLabels: false,
          showValues: false
        });
      }
      if (volNote) {
        var volText = typeof formatVolumeFreshnessNote === 'function'
          ? formatVolumeFreshnessNote(a)
          : ('Оборот TQBR за год · ' + (a.volumeByDay ? a.volumeByDay.length : 0) + ' торговых дней');
        volNote.textContent = volText + ' · наведите на столбец: дата и оборот в млрд ₽';
        volNote.className = 'analytics-chart-note chart-info-readable' + (a.volumeStale ? ' data-stale-warning' : '');
      }
      renderSecurityProfile(ticker, a);
      requestAnimationFrame(function () {
        if (divCanvas && divCanvas._barChartState) {
          drawFullBarChart(divCanvas, divCanvas._barChartState.series,
            Object.assign({}, divCanvas._barChartState.baseOptions, { _redraw: true }));
        }
        if (volCanvas && volCanvas._barChartState) {
          drawFullBarChart(volCanvas, volCanvas._barChartState.series,
            Object.assign({}, volCanvas._barChartState.baseOptions, { _redraw: true }));
        }
      });
      return fetchMoexHistory(ticker, horizon);
    }).then(function (r) {
      if (priceCanvas && r && r.series) {
        drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: horizon });
      }
      requestAnimationFrame(function () {
        var activeTab = document.querySelector('[data-security-chart-tab].active');
        if (activeTab) redrawSecurityChartTab(activeTab.getAttribute('data-security-chart-tab'));
      });
    }).catch(function () {
      if (metaEl) metaEl.textContent = 'Не удалось загрузить аналитику';
      if (divNote) divNote.textContent = 'История дивидендов пока не добавлена.';
      if (volNote) volNote.textContent = 'Данные по объёму торгов пока недоступны.';
    });
  }

  function portfolioInsightsMetaLine(ticker, pos, qty, ret, subtitle, opts) {
    opts = opts || {};
    var parts = [subtitle || getTickerSubtitle(ticker), 'Кол-во: ' + qty];
    var avg = Number(pos && pos.avgPrice);
    if (isFinite(avg) && avg > 0) {
      parts.push('Ср. цена покупки: ' + formatChartPrice(avg, ticker));
    }
    if (ret != null && typeof formatSignedPct === 'function') {
      parts.push((opts.returnLabel || 'Доходность') + ': ' + formatSignedPct(ret, 2));
    }
    if (opts.realized != null && isFinite(opts.realized) && typeof formatSignedRubAmount === 'function') {
      parts.push('Зафиксировано: ' + formatSignedRubAmount(opts.realized));
    }
    return parts.filter(Boolean).join(' · ');
  }



  function purchaseCandleIndexAtPoint(canvas, clientX, clientY) {
    var meta = canvas._purchaseChartMeta;
    if (!meta || !meta.candles || !meta.candles.length) return -1;
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    var best = -1;
    var bestDist = Infinity;
    meta.candles.forEach(function (c, idx) {
      if (x < c.hitLeft || x > c.hitRight || y < c.hitTop || y > c.hitBottom) return;
      var dx = x - c.x;
      var dy = y - c.y;
      var dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = idx;
      }
    });
    return best;
  }



  function formatPurchaseCandleHoverLabel(item, ticker) {
    if (!item) return '';
    var price = Number(item.avgPrice);
    var qty = isFinite(Number(item.qty)) && Number(item.qty) > 0 ? Number(item.qty) : null;
    var dateLbl = item.buyDate || '';
    try {
      if (item.buyDate) {
        dateLbl = new Date(item.buyDate + 'T12:00:00').toLocaleDateString('ru-RU');
      }
    } catch (e) { /* noop */ }
    var parts = [dateLbl, isFinite(price) ? formatChartPrice(price, ticker) : ''];
    if (qty != null) parts.push(qty + ' шт.');
    return parts.filter(Boolean).join(' · ');
  }



  function redrawPurchaseCandleChartWithHover(canvas, hoverIndex) {
    var meta = canvas._purchaseChartMeta;
    if (!meta) return;
    drawPurchaseCandleChart(canvas, meta.lots, {
      ticker: meta.ticker,
      currentPrice: meta.currentPrice,
      hoverIndex: hoverIndex
    });
  }



  function bindPurchaseCandleHover(canvas) {
    if (!canvas || canvas._purchaseCandleHoverBound) return;
    var wrap = canvas.parentElement;
    if (!wrap || !wrap.classList.contains('chart-canvas-wrap')) return;
    canvas._purchaseCandleHoverBound = true;

    var tip = wrap.querySelector('.chart-hover-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-hover-tip';
      tip.setAttribute('aria-hidden', 'true');
      wrap.appendChild(tip);
    }

    function hideHover() {
      canvas._purchaseHoverIndex = null;
      tip.classList.remove('is-visible');
      tip.setAttribute('aria-hidden', 'true');
      redrawPurchaseCandleChartWithHover(canvas, null);
    }

    function showHover(clientX, clientY) {
      var meta = canvas._purchaseChartMeta;
      if (!meta || !meta.candles || !meta.candles.length) {
        hideHover();
        return;
      }
      var idx = purchaseCandleIndexAtPoint(canvas, clientX, clientY);
      if (idx < 0) {
        hideHover();
        return;
      }
      if (canvas._purchaseHoverIndex !== idx) {
        canvas._purchaseHoverIndex = idx;
        redrawPurchaseCandleChartWithHover(canvas, idx);
      }
      tip.textContent = formatPurchaseCandleHoverLabel(meta.candles[idx].item, meta.ticker);
      tip.classList.add('is-visible');
      tip.setAttribute('aria-hidden', 'false');
      var wrapRect = wrap.getBoundingClientRect();
      var tipX = Math.min(Math.max(clientX - wrapRect.left, 56), wrapRect.width - 56);
      var tipY = Math.max(clientY - wrapRect.top - 12, 14);
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



  function drawPurchaseCandleChart(canvas, lots, options) {
    options = options || {};
    var ticker = options.ticker || '';
    var hoverIndex = options.hoverIndex;
    var size = chartCanvasSize(canvas, 320, 200);
    var wrap = canvas.parentElement;
    if (wrap) {
      var wrapRect = wrap.getBoundingClientRect();
      if (wrapRect.width >= 100 && wrapRect.height >= 40) {
        size.w = wrapRect.width;
        size.h = wrapRect.height;
      }
    }
    var w = size.w;
    var h = size.h;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = Math.round(w) + 'px';
    canvas.style.height = Math.round(h) + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    function snapX(v) { return Math.round(v) + 0.5; }
    function snapY(v) { return Math.round(v) + 0.5; }

    var items = (lots || []).filter(function (l) {
      var price = Number(l.avgPrice);
      return l.buyDate && isFinite(price) && price > 0;
    }).sort(function (a, b) {
      return a.buyDate < b.buyDate ? -1 : (a.buyDate > b.buyDate ? 1 : 0);
    });

    if (items.length < 2) {
      canvas._purchaseChartMeta = null;
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '14px Golos Text, IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Нужно 2+ покупки с датой и ценой', w / 2, h / 2);
      return;
    }

    var prices = items.map(function (it) { return Number(it.avgPrice); });
    var cur = Number(options.currentPrice);
    if (isFinite(cur)) prices.push(cur);
    var minP = Math.min.apply(null, prices);
    var maxP = Math.max.apply(null, prices);
    var range = maxP - minP || maxP * 0.02 || 1;
    minP -= range * 0.1;
    maxP += range * 0.1;

    var pad = { top: 16, right: 14, bottom: 42, left: getChartYAxisPad(ctx, minP, maxP, ticker) };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;
    var slotW = plotW / items.length;
    var bodyW = Math.max(12, Math.min(22, slotW * 0.42));
    var bodyH = 16;

    function yAt(price) {
      return pad.top + plotH - ((price - minP) / (maxP - minP)) * plotH;
    }

    var candles = items.map(function (item, i) {
      var price = Number(item.avgPrice);
      var x = pad.left + slotW * i + slotW / 2;
      var y = yAt(price);
      return {
        item: item,
        index: i,
        x: x,
        y: y,
        price: price,
        bodyW: bodyW,
        bodyH: bodyH,
        hitLeft: x - bodyW / 2 - 8,
        hitRight: x + bodyW / 2 + 8,
        hitTop: pad.top,
        hitBottom: pad.top + plotH + 24
      };
    });

    canvas._purchaseChartMeta = {
      lots: lots,
      ticker: ticker,
      currentPrice: options.currentPrice,
      candles: candles,
      pad: pad,
      plotW: plotW,
      plotH: plotH,
      w: w,
      h: h,
      minP: minP,
      maxP: maxP
    };

    ctx.strokeStyle = 'rgba(43, 43, 43, 0.1)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = snapY(pad.top + (plotH * g) / 4);
      ctx.beginPath();
      ctx.moveTo(snapX(pad.left), gy);
      ctx.lineTo(snapX(pad.left + plotW), gy);
      ctx.stroke();
      var labelVal = maxP - ((maxP - minP) * g) / 4;
      ctx.fillStyle = '#5A5A5A';
      ctx.font = '11px Inter, Manrope, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatChartPrice(labelVal, ticker), pad.left - 8, gy);
    }

    if (isFinite(cur)) {
      var curY = snapY(yAt(cur));
      ctx.strokeStyle = 'rgba(61, 92, 71, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(snapX(pad.left), curY);
      ctx.lineTo(snapX(pad.left + plotW), curY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#3D5C47';
      ctx.font = '11px Inter, Manrope, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('текущая ' + formatChartPrice(cur, ticker), pad.left + 4, curY - 4);
    }

    candles.forEach(function (c, i) {
      var price = c.price;
      var x = c.x;
      var y = c.y;
      var up = isFinite(cur) ? price <= cur : true;
      var isHover = hoverIndex === i;
      var fill = up ? (isHover ? '#4A7358' : '#3D5C47') : (isHover ? '#C45454' : '#A84848');
      var stroke = up ? '#2A4534' : '#7A3333';
      var bx = Math.round(x - bodyW / 2);
      var by = Math.round(y - bodyH / 2);

      ctx.strokeStyle = stroke;
      ctx.lineWidth = isHover ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(snapX(x), snapY(pad.top));
      ctx.lineTo(snapX(x), snapY(pad.top + plotH));
      ctx.stroke();

      ctx.fillStyle = fill;
      ctx.fillRect(bx, by, Math.round(bodyW), Math.round(bodyH));
      ctx.strokeRect(bx + 0.5, by + 0.5, Math.round(bodyW) - 1, Math.round(bodyH) - 1);

      if (isHover) {
        ctx.strokeStyle = '#faf8f4';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, Math.round(bodyW), Math.round(bodyH));
      }

      try {
        var d = new Date(c.item.buyDate + 'T12:00:00');
        var lbl = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
        ctx.fillStyle = isHover ? '#2B2B2B' : '#6B6B6B';
        ctx.font = (isHover ? 'bold ' : '') + '11px Inter, Manrope, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(lbl, Math.round(x), pad.top + plotH + 10);
      } catch (e) { /* noop */ }
    });

    bindPurchaseCandleHover(canvas);
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
    var divTitle = document.getElementById('portfolioInsightDivTitle');
    if (titleEl) titleEl.textContent = ticker;
    if (metaEl) metaEl.textContent = 'Загрузка…';

    var purchaseLots = typeof findPortfolioLots === 'function' ? findPortfolioLots(ticker) : [];
    var candlePanel = document.getElementById('portfolioPurchaseCandlesPanel');
    var candleCanvas = document.getElementById('portfolioPurchaseCandleChart');
    var candleNote = document.getElementById('portfolioPurchaseCandleNote');
    var ret = typeof getPositionReturnPct === 'function' ? getPositionReturnPct(pos) : null;
    var qty = isFinite(Number(pos.qty)) ? Number(pos.qty) : 0;
    var avgBuy = isFinite(Number(pos.avgPrice)) && Number(pos.avgPrice) > 0 ? Number(pos.avgPrice) : null;
    var tickerSales = typeof getPortfolioSales === 'function' ? getPortfolioSales(ticker) : [];
    var realizedTicker = typeof getTotalRealizedPnl === 'function' ? getTotalRealizedPnl(tickerSales) : null;

    if (candlePanel && candleCanvas) {
      var datedLots = purchaseLots.filter(function (l) {
        return l.buyDate && isFinite(Number(l.avgPrice)) && Number(l.avgPrice) > 0;
      });
      if (datedLots.length >= 2) {
        candlePanel.hidden = false;
        drawPurchaseCandleChart(candleCanvas, purchaseLots, {
          ticker: ticker,
          currentPrice: pos.currentPrice
        });
        if (candleNote) {
          var noteParts = [];
          if (avgBuy != null) noteParts.push('Ср. цена покупки: ' + formatChartPrice(avgBuy, ticker));
          noteParts.push(datedLots.length + ' покупки');
          noteParts.push('наведите на свечу — точная цена');
          candleNote.textContent = noteParts.join(' · ');
        }
      } else {
        candlePanel.hidden = true;
      }
    }

    if (metaEl) {
      metaEl.textContent = portfolioInsightsMetaLine(ticker, pos, qty, ret, null, { realized: realizedTicker });
    }

    fetchMoexHistory(ticker, '5y').then(function (r) {
      if (priceCanvas && r.series) drawPriceChart(priceCanvas, r.series, { ticker: ticker, horizon: '5y' });
    });

    if (!isRuStockForAnalytics(ticker)) {
      if (securityChartIsBond(ticker)) {
        if (divTitle) divTitle.textContent = 'Купоны · выплаты по выпуску';
        loadBondAnalyticsSnapshot(ticker).then(function (bond) {
          if (metaEl) {
            metaEl.textContent = portfolioInsightsMetaLine(
              ticker, pos, qty, ret, bond.label || getTickerSubtitle(ticker),
              { returnLabel: 'Доходность позиции', realized: realizedTicker }
            );
          }
          if (kpisEl) {
            kpisEl.innerHTML =
              '<div class="insight-kpi"><span class="insight-kpi-lbl">Доходность</span><span class="insight-kpi-val">' + escapeHtml(bond.yieldPct != null ? formatDivYieldPct(bond.yieldPct) : '—') + '</span></div>' +
              '<div class="insight-kpi"><span class="insight-kpi-lbl">Купон</span><span class="insight-kpi-val">' + escapeHtml(formatBondCouponPct(bond.couponPct)) + '</span></div>' +
              '<div class="insight-kpi"><span class="insight-kpi-lbl">Погашение</span><span class="insight-kpi-val">' + escapeHtml(formatBondProfileDate(bond.matDate)) + '</span></div>' +
              '<div class="insight-kpi"><span class="insight-kpi-lbl">Выплат в год</span><span class="insight-kpi-val">' + escapeHtml(bond.payCount != null ? String(bond.payCount) : '—') + '</span></div>';
          }
          if (divCanvas) renderBondCouponChart(divCanvas, bond);
          if (divNote) divNote.textContent = bond.coupons && bond.coupons.length ? bondAnalyticsDivNote() : 'Купоны по выпуску пока недоступны.';
          if (volNote) volNote.textContent = bondAnalyticsVolNote();
        });
        sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (metaEl) metaEl.textContent = 'US позиция · дивидендная аналитика МосБиржи недоступна';
      if (kpisEl) kpisEl.innerHTML = '';
      return;
    }

    if (divTitle) divTitle.textContent = 'Дивиденды · 5 лет и прогноз 12 мес.';
    buildSecurityAnalytics(ticker).then(function (a) {
      var fc = a.divForecast;
      var forecastTotal = fc && fc.amount != null && qty > 0 ? fc.amount * qty : null;
      var paidTotal = fc && fc.paid12m != null && qty > 0 ? fc.paid12m * qty : null;
      if (metaEl) {
        metaEl.textContent = portfolioInsightsMetaLine(ticker, pos, qty, ret, null, { realized: realizedTicker });
      }
      if (kpisEl) {
        kpisEl.innerHTML =
          '<div class="insight-kpi"><span class="insight-kpi-lbl">Див. 5л ср.</span><span class="insight-kpi-val">' + divAvg5yValHtml(a) + '</span></div>' +
          '<div class="insight-kpi"><span class="insight-kpi-lbl">Прогноз 12 мес.</span><span class="insight-kpi-val">' + escapeHtml(formatDivRubPerShare(fc && fc.amount)) + '</span></div>' +
          '<div class="insight-kpi"><span class="insight-kpi-lbl">На позицию</span><span class="insight-kpi-val">' + escapeHtml(forecastTotal != null ? forecastTotal.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽' : '—') + '</span></div>' +
          '<div class="insight-kpi"><span class="insight-kpi-lbl">Выплачено 12 мес.</span><span class="insight-kpi-val">' + escapeHtml(paidTotal != null ? paidTotal.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽' : '—') + '</span></div>';
      }
      if (divCanvas) {
        drawFullBarChart(divCanvas, buildDividendRubSeries(a.divYieldByYear, a.divForecast), {
          color: CHART_COLOR_AUTUMN,
          forecastColor: CHART_COLOR_FORECAST,
          ySuffix: '₽/акц.',
          showValues: true,
          compactBars: true
        });
      }
      if (divNote) {
        divNote.innerHTML = typeof formatDividendChartInfoHtml === 'function'
          ? formatDividendChartInfoHtml(a, qty)
          : '';
        divNote.className = 'analytics-chart-note div-chart-info';
      }
      if (volCanvas) {
        drawFullBarChart(volCanvas, buildVolumeBarSeries(a.volumeByDay), {
          color: '#6B7A5A',
          ySuffix: 'млрд ₽',
          valueMode: 'bln',
          showLabels: false,
          showValues: false
        });
      }
      if (volNote) {
        volNote.textContent = typeof formatVolumeFreshnessNote === 'function'
          ? formatVolumeFreshnessNote(a) + ' · наведите на столбец'
          : ('Оборот TQBR за год · ' + (a.volumeByDay ? a.volumeByDay.length : 0) + ' торговых дней');
        volNote.className = 'analytics-chart-note chart-info-readable' + (a.volumeStale ? ' data-stale-warning' : '');
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
  window.drawPurchaseCandleChart = drawPurchaseCandleChart;
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



  var ANALYTICS_SUBS = ['stocks', 'ofz', 'pifs'];

  function switchAnalyticsSub(sub, opts) {
    opts = opts || {};
    if (ANALYTICS_SUBS.indexOf(sub) === -1) sub = 'stocks';
    state.analyticsSub = sub;
    document.querySelectorAll('[data-analytics-sub]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-analytics-sub') === sub);
    });
    document.querySelectorAll('[data-analytics-subview]').forEach(function (el) {
      var isActive = el.getAttribute('data-analytics-subview') === sub;
      el.classList.toggle('active', isActive);
      el.hidden = !isActive;
    });
    if (!opts.skipHash) {
      var targetHash = 'analytics/' + sub;
      if (location.hash !== '#' + targetHash) {
        history.replaceState(null, '', '#' + targetHash);
      }
    }
    if (sub === 'stocks') {
      if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
      else if (typeof renderAnalyticsGrid === 'function') renderAnalyticsGrid();
    } else if (sub === 'ofz' && typeof renderOfzSection === 'function') {
      renderOfzSection();
    } else if (sub === 'pifs' && typeof renderPifSection === 'function') {
      renderPifSection();
    }
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
    if (tab === 'watchlist') {
      var analyticsHash = 'analytics/' + (state.analyticsSub || 'stocks');
      if (location.hash !== '#' + analyticsHash) {
        history.replaceState(null, '', '#' + analyticsHash);
      }
    } else if (location.hash !== '#' + tab) {
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
      switchAnalyticsSub(state.analyticsSub || 'stocks', { skipHash: true });
    }
    if (tab === 'settings') {
      renderAlerts();
      if (typeof renderAgentSettings === 'function') renderAgentSettings();
      if (typeof refreshWatchdogDevUI === 'function') refreshWatchdogDevUI();
    }
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
    var hash = (location.hash || '#briefing').replace(/^#/, '');
    var analyticsMatch = /^analytics\/(stocks|ofz|pifs)$/.exec(hash);
    if (analyticsMatch) {
      state.analyticsSub = analyticsMatch[1];
      switchTab('watchlist');
      return;
    }
    if (hash === 'watchlist') {
      state.analyticsSub = state.analyticsSub || 'stocks';
      switchTab('watchlist');
      history.replaceState(null, '', '#analytics/' + state.analyticsSub);
      return;
    }
    if (hash === 'pifs') {
      state.analyticsSub = 'pifs';
      switchTab('watchlist');
      history.replaceState(null, '', '#analytics/pifs');
      return;
    }
    var valid = ['briefing', 'portfolio', 'articles', 'settings'];
    if (valid.indexOf(hash) !== -1) switchTab(hash);
    else switchTab('briefing');
  }

  window.switchAnalyticsSub = switchAnalyticsSub;


