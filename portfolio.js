/* portfolio.js */
  function getPositionReturnPct(pos) {
    if (typeof Markets !== 'undefined' && Markets.isUsPosition(pos)) {
      var curUs = Number(pos.currentPrice);
      if (!isFinite(curUs)) return null;
    }
    var avg = Number(pos.avgPrice);
    var cur = Number(pos.currentPrice);
    if (!isFinite(avg) || !isFinite(cur) || avg <= 0) return null;
    return ((cur - avg) / avg) * 100;
  }

  function formatPositionPrice(pos) {
    var cur = Number(pos.currentPrice);
    var currency = pos.currency || (typeof Markets !== 'undefined' && Markets.isUsPosition(pos) ? 'USD' : 'RUB');
    if (typeof Markets !== 'undefined') {
      return Markets.formatMoneyValue(isFinite(cur) ? cur : null, currency);
    }
    return isFinite(cur) ? cur.toFixed(2) : '—';
  }

  function formatPositionAvg(pos) {
    var avg = Number(pos.avgPrice);
    var currency = pos.currency || 'RUB';
    if (typeof Markets !== 'undefined') {
      return Markets.formatMoneyValue(isFinite(avg) ? avg : null, currency);
    }
    return isFinite(avg) ? avg.toFixed(2) : '—';
  }



  function formatSignedPct(pct, decimals) {
    if (pct == null || !isFinite(pct)) return '—';
    if (decimals == null) {
      var absPct = Math.abs(pct);
      decimals = absPct > 0 && absPct < 0.05 ? 3 : 2;
    }
    var sign = pct > 0 ? '+' : '';
    return sign + pct.toFixed(decimals) + '%';
  }



  function getPaperDisplayPct(pos) {
    var day = pos.dayChangePct;
    if (day != null && isFinite(Number(day))) return Number(day);
    return getPositionReturnPct(pos);
  }



  function getPaperPnlTitle(pos) {
    var parts = [];
    var cur = Number(pos.currentPrice);
    if (isFinite(cur)) {
      parts.push('Цена: ' + formatPositionPrice(pos));
    }
    var day = pos.dayChangePct;
    if (day != null && isFinite(Number(day))) {
      parts.push('За сутки: ' + formatSignedPct(Number(day)));
    }
    var ret = getPositionReturnPct(pos);
    if (ret != null) parts.push('В портфеле (к цене покупки): ' + formatSignedPct(ret));
    return parts.join(' · ');
  }



  function buildPaperPnlHtml(pos) {
    var day = pos.dayChangePct;
    var port = getPositionReturnPct(pos);
    var hasDay = day != null && isFinite(Number(day));
    var hasPort = port != null && isFinite(port);
    var hasCur = isFinite(Number(pos.currentPrice));
    var rows = [];

    if (hasDay) {
      day = Number(day);
      rows.push({
        lbl: 'сутки',
        text: formatSignedPct(day, 2),
        cls: day >= 0 ? 'pnl-pos' : 'pnl-neg'
      });
    } else if (hasCur) {
      rows.push({ lbl: 'цена', text: formatPositionPrice(pos), cls: '' });
    }

    if (hasPort) {
      rows.push({
        lbl: 'портфель',
        text: formatSignedPct(port, 2),
        cls: port >= 0 ? 'pnl-pos' : 'pnl-neg'
      });
    } else if (hasDay && hasCur) {
      rows.push({ lbl: 'цена', text: formatPositionPrice(pos), cls: '' });
    }

    if (!rows.length) {
      rows.push({ lbl: 'сутки', text: '—', cls: 'muted' });
      rows.push({ lbl: 'портфель', text: '—', cls: 'muted' });
    }

    return (
      '<span class="paper-pnl-rows">' +
      rows.map(function (row) {
        return (
          '<span class="paper-pnl-row">' +
            '<span class="paper-pnl-lbl">' + escapeHtml(row.lbl) + '</span>' +
            '<span class="paper-pnl-val ' + (row.cls || 'muted') + '">' + escapeHtml(row.text) + '</span>' +
          '</span>'
        );
      }).join('') +
      '</span>'
    );
  }



  function syncPositionQuoteFromMarket(ticker, histResult) {
    ticker = normalizeTicker(ticker);
    return fetchMoexQuote(ticker).then(function (q) {
      var portfolio = getPortfolio();
      var p = findPortfolioPosition(ticker);
      if (!p) return;
      if (q && q.price != null && isFinite(q.price)) p.currentPrice = q.price;
      if (q && q.changePct != null && isFinite(q.changePct)) {
        p.dayChangePct = q.changePct;
      } else if (
        histResult && histResult.series && histResult.series.length >= 2 &&
        state.chartHorizon === 'day'
      ) {
        var s = histResult.series;
        var first = s[0].price;
        var last = s[s.length - 1].price;
        if (first && isFinite(first) && first !== 0) {
          p.dayChangePct = ((last - first) / first) * 100;
        }
      }
      setPortfolio(portfolio);
    }).catch(function () { /* keep chart price */ });
  }



  function getPortfolioPaperPositions() {
    return getPortfolio().positions.filter(function (p) {
      var t = normalizeTicker(p.ticker);
      return t !== 'IMOEX' && t !== 'MOEX' && t !== 'INDEX';
    });
  }



  function renderPortfolioFolder() {
    destroyPortfolioPapersMagnet();
    var scene = document.getElementById('portfolioFolderScene');
    if (!scene) return;
    var positions = getPortfolioPaperPositions();
    var folderColor = '#3D5C47';
    var backColor = darkenColor(folderColor, 0.08);
    var open = state.folderOpen;

    if (!positions.length) {
      scene.innerHTML =
        '<div class="portfolio-folder-empty" style="display:flex;justify-content:center;align-items:center;width:100%;">' +
          '<p class="muted hint-frame" style="padding:1rem;margin:0 auto;text-align:center;">Добавьте бумаги в портфель (кроме индекса IMOEX)</p>' +
        '</div>';
      return;
    }

    var maxTickerLen = positions.reduce(function (max, p) {
      return Math.max(max, String(p.ticker || '').length);
    }, 4);

    var papersHtml = positions.map(function (p, i) {
      var tip = getPaperPnlTitle(p);
      var active = state.chartTicker === p.ticker ? ' paper-active' : '';
      var bg = i % 3 === 0 ? darkenColor('#ffffff', 0.1) : (i % 3 === 1 ? darkenColor('#ffffff', 0.05) : '#ffffff');
      return (
        '<div class="paper paper-' + (i + 1) + active + '" data-ticker="' + escapeHtml(p.ticker) + '" ' +
          'style="--paper-bg:' + bg + ';" role="button" tabindex="0" ' +
          'aria-label="' + escapeHtml(p.ticker) + (tip ? ', ' + tip : '') + '">' +
          '<span class="paper-ticker">' + escapeHtml(p.ticker) + '</span>' +
          '<span class="paper-pnl"' + (tip ? ' title="' + escapeHtml(tip) + '"' : '') + '>' +
            buildPaperPnlHtml(p) +
          '</span>' +
        '</div>'
      );
    }).join('');

    scene.innerHTML =
      '<div class="pf-papers-strip' + (open ? ' is-open' : '') + '" aria-hidden="' + (open ? 'false' : 'true') + '" style="--paper-ch:' + (maxTickerLen + 1) + '">' +
        papersHtml +
      '</div>' +
      '<div class="pf-folder folder' + (open ? ' open' : '') + '" id="portfolioFolder" ' +
        'style="--folder-color:' + folderColor + ';--folder-back-color:' + backColor + '">' +
        '<div class="folder__back">' +
          '<div class="folder__front"></div>' +
          '<div class="folder__front right"></div>' +
        '</div>' +
      '</div>';

    initPortfolioPapersMagnet();
  }



  function selectPortfolioTicker(ticker) {
    ticker = normalizeTicker(ticker);
    if (!findPortfolioPosition(ticker)) return;
    state.chartTicker = ticker;
    state.folderOpen = true;
    var label = document.getElementById('portfolioChartTickerLabel');
    if (label) label.textContent = ticker;
    var sel = document.getElementById('chartTickerSelect');
    if (sel) sel.value = ticker;
    renderPortfolioFolder();
    renderPortfolioChart();
    var section = document.getElementById('portfolioInsightsSection');
    if (section && !section.hidden) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }



  function renderWatchlist() {
    var list = getWatchlist();
    var el = document.getElementById('watchlistChips');
    if (list.length === 0) {
      el.innerHTML = '<span class="muted hint-frame">Список пуст</span>';
      return;
    }
    el.innerHTML = list.map(function (item) {
      var n = typeof Markets !== 'undefined' ? Markets.normalizeWatchlistItem(item) : { ticker: item, market: 'RU' };
      if (!n) return '';
      var badge = typeof Markets !== 'undefined'
        ? '<span class="market-badge market-badge--' + (n.market === 'US' ? 'us' : 'ru') + '">' + escapeHtml(Markets.marketBadgeLabel(n.market)) + '</span>'
        : '';
      return '<span class="chip">' + escapeHtml(n.ticker) + badge +
        '<button type="button" data-remove="' + escapeHtml(n.ticker) + '" data-remove-market="' + escapeHtml(n.market) + '" aria-label="Удалить">×</button></span>';
    }).join('');
    el.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ticker = btn.getAttribute('data-remove');
        var market = btn.getAttribute('data-remove-market');
        setWatchlist(getWatchlist().filter(function (x) {
          var n = typeof Markets !== 'undefined' ? Markets.normalizeWatchlistItem(x) : { ticker: x, market: 'RU' };
          if (!n) return false;
          if (market && n.market !== market) return true;
          return n.ticker !== ticker;
        }));
        showToast('Удалено: ' + ticker);
        if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
        else if (typeof renderAnalyticsGrid === 'function') renderAnalyticsGrid();
      });
    });
    if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
    else if (typeof renderAnalyticsGrid === 'function') renderAnalyticsGrid();
  }



  function addTicker(raw) {
    var resolveFn = typeof Markets !== 'undefined' ? Markets.resolveSecurityFromInput : function (r) {
      return resolveTickerFromInput(r).then(function (t) {
        return t ? { ticker: t, market: 'RU', currency: 'RUB', type: 'stock', name: '' } : null;
      });
    };
    resolveFn(raw).then(function (item) {
      if (!item || !item.ticker) return;
      var list = getWatchlist();
      if (typeof Markets !== 'undefined' && Markets.watchlistHasTicker(list, item.ticker, item.market)) {
        showToast('Уже в списке');
        return;
      }
      list.push(typeof Markets !== 'undefined' ? Markets.normalizeWatchlistItem(item) : item.ticker);
      setWatchlist(list);
      showToast('Добавлено: ' + item.ticker);
      renderWatchlist();
      document.getElementById('tickerInput').value = '';
      if (acControllers.tickerInput) acControllers.tickerInput.close();
    });
  }



  var PRESET_LABELS = {
    bluechips: 'Голубые фишки',
    bonds: 'Облигации',
    dividends: 'Дивиденды'
  };

  function applyPreset(name) {
    var preset = PRESETS[name];
    if (!preset) return;
    var list = getWatchlist().slice();
    preset.forEach(function (t) {
      var n = normalizeTicker(t);
      if (list.indexOf(n) === -1) list.push(n);
    });
    setWatchlist(list);
    showToast('Добавлена подборка: ' + (PRESET_LABELS[name] || name));
    renderWatchlist();
  }



  function chartSeed(ticker) {
    var s = 0;
    for (var i = 0; i < ticker.length; i++) s += ticker.charCodeAt(i);
    return s;
  }



  function chartNoise(seed, i) {
    var x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }



  function generatePriceHistory(ticker, endPrice, horizon) {
    var cfg = CHART_HORIZONS[horizon] || CHART_HORIZONS.week;
    var seed = chartSeed(ticker);
    var vol = ticker.indexOf('OFZ') >= 0 ? 0.0045 : 0.017;
    var now = Date.now();
    var startPrice = endPrice * (0.9 + chartNoise(seed, 0) * 0.12);
    var series = [];
    var price = startPrice;
    for (var i = 0; i < cfg.points; i++) {
      if (i === cfg.points - 1) price = endPrice;
      else if (i > 0) {
        var drift = (chartNoise(seed, i + 1) - 0.5) * vol * 2;
        price = price * (1 + drift);
      }
      series.push({
        t: now - (cfg.points - 1 - i) * cfg.stepMs,
        price: price
      });
    }
    series[series.length - 1].price = endPrice;
    return series;
  }



  function findPortfolioPosition(ticker) {
    var positions = getPortfolio().positions;
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].ticker === ticker) return positions[i];
    }
    return null;
  }



  function ensurePositionForChart(ticker) {
    ticker = normalizeTicker(ticker);
    if (findPortfolioPosition(ticker)) return Promise.resolve(ticker);
    return fetchMoexLastPrice(ticker).catch(function () { return null; }).then(function (price) {
      var p = price != null && isFinite(price) ? price : 100;
      var portfolio = getPortfolio();
      portfolio.positions.unshift(normalizePosition({ ticker: ticker, avgPrice: p, currentPrice: p }));
      setPortfolio(portfolio);
      return ticker;
    });
  }



  function openPortfolioChart(ticker) {
    ticker = normalizeTicker(ticker);
    if (ticker === 'IMOEX' || ticker === 'INDEX') {
      if (typeof switchTab === 'function') switchTab('watchlist');
      if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
      var box = document.getElementById('moexIndexBox');
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (typeof selectAnalyticsTicker === 'function') {
      selectAnalyticsTicker(ticker);
      return;
    }
    ensurePositionForChart(ticker).then(function (t) {
      state.folderOpen = true;
      selectPortfolioTicker(t);
      switchTab('portfolio');
    });
  }



  function getFilteredPortfolioPositions() {
    var positions = getPortfolio().positions || [];
    if (typeof Markets === 'undefined') return positions;
    var markets = Markets.getMarketsEnabled();
    return positions.filter(function (p) {
      var mk = p.market === 'US' || Markets.isUsPosition(p) ? 'US' : 'RU';
      if (mk === 'US') return markets.us;
      return markets.ru;
    });
  }



  function renderPortfolioChart() {
    if (typeof renderPortfolioInsights === 'function') {
      renderPortfolioInsights(state.chartTicker);
      return;
    }
    var positions = getPortfolioPaperPositions();
    var select = document.getElementById('chartTickerSelect');
    var emptyEl = document.getElementById('portfolioChartEmpty');
    var wrap = document.getElementById('portfolioChartWrap');
    var statsEl = document.getElementById('portfolioChartStats');
    var canvas = document.getElementById('portfolioPriceChart');
    var toolbar = document.getElementById('chartToolbar');
    var label = document.getElementById('portfolioChartTickerLabel');

    if (!select || !canvas) return;

    if (!positions.length) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = '<span class="hint-frame">' + escapeHtml('Добавьте бумаги в портфель (кроме IMOEX)') + '</span>';
      }
      if (wrap) wrap.hidden = true;
      if (statsEl) statsEl.hidden = true;
      if (toolbar) toolbar.hidden = true;
      select.innerHTML = '';
      if (label) label.textContent = '—';
      setChartSourceLabel('');
      return;
    }

    select.innerHTML = positions.map(function (p) {
      return '<option value="' + escapeHtml(p.ticker) + '">' + escapeHtml(p.ticker) + '</option>';
    }).join('');

    if (!state.chartTicker || !findPortfolioPosition(state.chartTicker)) {
      if (positions.length === 1) state.chartTicker = positions[0].ticker;
    }

    if (!state.chartTicker || !findPortfolioPosition(state.chartTicker)) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = '<span class="hint-frame">' + escapeHtml('Выберите бумагу в папке') + '</span>';
      }
      if (wrap) wrap.hidden = true;
      if (statsEl) statsEl.hidden = true;
      if (toolbar) toolbar.hidden = true;
      if (label) label.textContent = '—';
      setChartSourceLabel('Выберите бумагу из портфеля');
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (wrap) wrap.hidden = false;
    if (statsEl) statsEl.hidden = false;
    if (toolbar) toolbar.hidden = false;
    select.value = state.chartTicker;
    if (label) label.textContent = state.chartTicker;

    var pos = findPortfolioPosition(state.chartTicker);
    if (!pos) return;

    var reqId = ++state.chartRequestId;
    setChartSourceLabel('Загрузка…', false);

    var ctx = canvas.getContext('2d');
    var rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6B6B6B';
    ctx.font = '14px Golos Text, IBM Plex Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Загрузка…', rect.width / 2 || 140, (rect.height || 160) / 2);

    fetchMoexHistory(pos.ticker, state.chartHorizon).then(function (result) {
      if (reqId !== state.chartRequestId) return;
      canvas._chartStatsSeries = result.series;
      canvas._chartHoverIndex = null;
      drawPriceChart(canvas, result.series, { ticker: pos.ticker, horizon: state.chartHorizon });
      updateChartStatsFromSeries(result.series, pos.ticker);
      var srcLabel = typeof Markets !== 'undefined' && Markets.isUsPosition(pos)
        ? ('Рынок США · ' + pos.ticker)
        : ('МосБиржа · ' + pos.ticker);
      setChartSourceLabel(srcLabel, false);
      if (result.series.length) {
        var portfolio = getPortfolio();
        var live = findPortfolioPosition(pos.ticker);
        if (live) live.currentPrice = result.series[result.series.length - 1].price;
        setPortfolio(portfolio);
      }
      return syncPositionQuoteFromMarket(pos.ticker, result);
    }).then(function () {
      if (reqId !== state.chartRequestId) return;
      renderPortfolioFolder();
      renderPortfolioTableBody();
    }).catch(function () {
      if (reqId !== state.chartRequestId) return;
      if (typeof Markets !== 'undefined' && Markets.isUsPosition(pos)) {
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.innerHTML = '<span class="hint-frame">' + escapeHtml('Не удалось загрузить котировки по рынку США. Проверьте подключение к интернету и попробуйте позже.') + '</span>';
        }
        if (wrap) wrap.hidden = true;
        if (statsEl) statsEl.hidden = true;
        if (toolbar) toolbar.hidden = true;
        setChartSourceLabel('Котировки недоступны');
        return;
      }
      var fallback = generatePriceHistory(pos.ticker, pos.currentPrice, state.chartHorizon);
      canvas._chartStatsSeries = fallback;
      canvas._chartHoverIndex = null;
      drawPriceChart(canvas, fallback, { ticker: pos.ticker, horizon: state.chartHorizon });
      updateChartStatsFromSeries(fallback, pos.ticker);
      setChartSourceLabel('Приблизительная кривая — котировки временно недоступны', true);
    });

    document.querySelectorAll('#portfolioTableBody tr').forEach(function (row) {
      row.classList.toggle('chart-row-active', row.getAttribute('data-chart-ticker') === state.chartTicker);
    });
  }



  function formatPortfolioQty(p) {
    if (p.qty == null || !isFinite(Number(p.qty))) return '—';
    return String(Number(p.qty));
  }



  function formatPortfolioDate(p) {
    if (!p.buyDate) return '—';
    try {
      return new Date(p.buyDate + 'T12:00:00').toLocaleDateString('ru-RU');
    } catch (e) {
      return p.buyDate;
    }
  }



  var PF_FORM_PREFIXES = ['', 'Watch'];



  function pfFieldId(prefix, field) {
    if (field === 'CancelEditBtn') return prefix ? 'pfWatchCancelEditBtn' : 'pfCancelEditBtn';
    if (field === 'Btn') return prefix ? 'pfWatchAddBtn' : 'pfAddBtn';
    if (field === 'FormTitle') return prefix ? 'pfWatchAddFormTitle' : 'pfAddFormTitle';
    return 'pf' + prefix + 'Add' + field;
  }



  function readPortfolioForm(prefix) {
    var tickerEl = document.getElementById(pfFieldId(prefix, 'Ticker'));
    var qtyRaw = (document.getElementById(pfFieldId(prefix, 'Qty')) || {}).value;
    var avgRaw = (document.getElementById(pfFieldId(prefix, 'Avg')) || {}).value;
    return {
      ticker: tickerEl ? tickerEl.value : '',
      qty: parseFloat(String(qtyRaw == null ? '' : qtyRaw).replace(',', '.')),
      avg: parseFloat(String(avgRaw == null ? '' : avgRaw).replace(',', '.')),
      buyDate: ((document.getElementById(pfFieldId(prefix, 'Date')) || {}).value) || '',
      comment: ((document.getElementById(pfFieldId(prefix, 'Comment')) || {}).value || '').trim()
    };
  }



  function readPortfolioFormMerged(primaryPrefix) {
    var a = readPortfolioForm(primaryPrefix);
    var altPrefix = primaryPrefix === 'Watch' ? '' : 'Watch';
    var b = readPortfolioForm(altPrefix);
    function pickNum(x, y) {
      if (isFinite(x)) return x;
      if (isFinite(y)) return y;
      return NaN;
    }
    return {
      ticker: String(a.ticker || b.ticker || '').trim(),
      qty: pickNum(a.qty, b.qty),
      avg: pickNum(a.avg, b.avg),
      buyDate: a.buyDate || b.buyDate || '',
      comment: a.comment || b.comment || ''
    };
  }



  function capturePortfolioFormInput(primaryPrefix) {
    var f = readPortfolioFormMerged(primaryPrefix);
    return {
      ticker: f.ticker,
      qty: isFinite(f.qty) ? f.qty : null,
      avg: isFinite(f.avg) ? f.avg : null,
      buyDate: String(f.buyDate || '').trim(),
      comment: f.comment
    };
  }



  function clearPortfolioForm(prefix) {
    var tickerEl = document.getElementById(pfFieldId(prefix, 'Ticker'));
    if (tickerEl) tickerEl.value = '';
    ['Qty', 'Avg', 'Comment', 'Date'].forEach(function (field) {
      var el = document.getElementById(pfFieldId(prefix, field));
      if (el) el.value = '';
    });
    var ac = acControllers[pfFieldId(prefix, 'Ticker')];
    if (ac) ac.close();
  }



  function clearAllPortfolioForms() {
    PF_FORM_PREFIXES.forEach(clearPortfolioForm);
  }



  function fillPortfolioForm(prefix, pos) {
    var tickerEl = document.getElementById(pfFieldId(prefix, 'Ticker'));
    if (tickerEl) tickerEl.value = pos.ticker || '';
    var qtyEl = document.getElementById(pfFieldId(prefix, 'Qty'));
    if (qtyEl) qtyEl.value = pos.qty != null && isFinite(Number(pos.qty)) ? String(pos.qty) : '';
    var avgEl = document.getElementById(pfFieldId(prefix, 'Avg'));
    if (avgEl) avgEl.value = pos.avgPrice != null && isFinite(Number(pos.avgPrice)) ? String(pos.avgPrice) : '';
    var dateEl = document.getElementById(pfFieldId(prefix, 'Date'));
    if (dateEl) dateEl.value = pos.buyDate || '';
    var commentEl = document.getElementById(pfFieldId(prefix, 'Comment'));
    if (commentEl) commentEl.value = pos.comment || '';
  }



  function fillAllPortfolioForms(pos) {
    PF_FORM_PREFIXES.forEach(function (prefix) {
      fillPortfolioForm(prefix, pos);
    });
  }



  function updatePortfolioFormChrome() {
    var editing = !!state.pfEditTicker;
    PF_FORM_PREFIXES.forEach(function (prefix) {
      var title = document.getElementById(pfFieldId(prefix, 'FormTitle'));
      var btn = document.getElementById(pfFieldId(prefix, 'Btn'));
      var cancel = document.getElementById(pfFieldId(prefix, 'CancelEditBtn'));
      if (title) title.textContent = editing ? 'Редактировать позицию' : 'Новая позиция';
      if (btn) btn.textContent = editing ? 'Сохранить изменения' : 'Добавить позицию в портфель';
      if (cancel) cancel.hidden = !editing;
    });
  }



  function startEditPortfolioPosition(ticker, formPrefix) {
    ticker = normalizeTicker(ticker);
    var pos = findPortfolioPosition(ticker);
    if (!pos) return;
    state.pfEditTicker = ticker;
    state.pfEditPrefix = formPrefix || '';
    fillAllPortfolioForms(pos);
    updatePortfolioFormChrome();
    showToast('Редактирование: ' + ticker);
  }



  function cancelPortfolioEdit() {
    state.pfEditTicker = '';
    state.pfEditPrefix = '';
    clearAllPortfolioForms();
    updatePortfolioFormChrome();
  }



  function mergePositionPurchase(existing, qty, avg, buyDate, comment) {
    var oldQty = existing.qty;
    var oldAvg = Number(existing.avgPrice);
    var hasQty = qty != null && isFinite(qty) && qty > 0;
    var hasAvg = avg != null && isFinite(avg);
    if (hasQty && hasAvg && isFinite(oldQty) && oldQty > 0 && isFinite(oldAvg)) {
      var totalQty = oldQty + qty;
      existing.avgPrice = (oldQty * oldAvg + qty * avg) / totalQty;
      existing.qty = totalQty;
    } else if (hasQty) {
      existing.qty = isFinite(oldQty) && oldQty > 0 ? oldQty + qty : qty;
      if (hasAvg) existing.avgPrice = avg;
    } else if (hasAvg) {
      existing.avgPrice = avg;
    }
    if (buyDate) existing.buyDate = buyDate;
    if (comment) {
      existing.comment = existing.comment
        ? existing.comment + ' · ' + comment
        : comment;
    }
    return existing;
  }



  function removePortfolioPosition(ticker) {
    ticker = normalizeTicker(ticker);
    var portfolio = getPortfolio();
    var next = portfolio.positions.filter(function (p) { return p.ticker !== ticker; });
    if (next.length === portfolio.positions.length) return;
    portfolio.positions = next;
    setPortfolio(portfolio);
    if (state.chartTicker === ticker) state.chartTicker = '';
    if (state.pfEditTicker === ticker) cancelPortfolioEdit();
    showToast('Удалено из портфеля: ' + ticker);
    renderPortfolio();
  }



  function clearPortfolio() {
    if (!confirm('Удалить все позиции из портфеля?')) return;
    setPortfolio({ positions: [] });
    cancelPortfolioEdit();
    state.chartTicker = '';
    state.folderOpen = false;
    renderPortfolio();
    showToast('Портфель очищен');
  }



  function addPortfolioPosition(raw, opts) {
    opts = opts || {};
    var prefix = opts.prefix != null ? opts.prefix : '';
    var captured = capturePortfolioFormInput(prefix);
    var rawTicker = raw != null ? String(raw).trim() : captured.ticker;
    if (!rawTicker) {
      showToast('Укажите тикер');
      return;
    }
    var resolveFn = typeof Markets !== 'undefined' ? Markets.resolveSecurityFromInput : function (r) {
      return resolveTickerFromInput(r).then(function (tk) {
        return tk ? { ticker: tk, market: 'RU', currency: 'RUB', type: 'stock' } : null;
      });
    };
    resolveFn(rawTicker).then(function (sec) {
      if (!sec || !sec.ticker) {
        showToast('Укажите тикер');
        return;
      }
      var t = sec.ticker;
      var qty = captured.qty;
      var avg = captured.avg;
      var buyDate = captured.buyDate;
      var comment = captured.comment;
      var portfolio = getPortfolio();
      var existing = findPortfolioPosition(t);
      var editing = state.pfEditTicker && normalizeTicker(state.pfEditTicker) === t;

      function clearFormsAfterSave() {
        clearPortfolioForm(prefix);
        clearPortfolioForm(prefix === 'Watch' ? '' : 'Watch');
      }

      if (editing) {
        if (!existing) {
          cancelPortfolioEdit();
          return;
        }
        if (qty != null) existing.qty = qty;
        if (avg != null) existing.avgPrice = avg;
        if (buyDate) existing.buyDate = buyDate;
        existing.comment = comment;
        setPortfolio(portfolio);
        cancelPortfolioEdit();
        showToast('Позиция обновлена: ' + t);
        renderPortfolio();
        return;
      }

      var isUs = typeof Markets !== 'undefined' && sec.market === 'US';
      function finishUsAdd(cur, dayPct) {
        if (existing) {
          mergePositionPurchase(existing, qty, avg, buyDate, comment);
          existing.market = 'US';
          existing.currency = 'USD';
          if (cur != null && isFinite(cur)) existing.currentPrice = cur;
          if (dayPct != null && isFinite(dayPct)) existing.dayChangePct = dayPct;
        } else {
          portfolio.positions.push(normalizePosition({
            ticker: t,
            qty: qty,
            avgPrice: avg != null ? avg : (cur != null && isFinite(cur) ? cur : null),
            currentPrice: cur != null && isFinite(cur) ? cur : null,
            buyDate: buyDate,
            comment: comment,
            market: 'US',
            currency: 'USD'
          }));
        }
        setPortfolio(portfolio);
        clearFormsAfterSave();
        showToast(existing ? 'Докупка учтена, обновлена ср. цена: ' + t : 'Добавлено в портфель: ' + t);
        state.chartTicker = t;
        state.folderOpen = true;
        renderPortfolio();
      }

      if (isUs) {
        Markets.fetchUsQuote(t).then(function (q) {
          var cur = q && q.price != null ? q.price : null;
          finishUsAdd(cur, q && q.changePct != null ? q.changePct : null);
        }).catch(function () {
          finishUsAdd(null, null);
        });
        return;
      }

      fetchMoexLastPrice(t).catch(function () { return null; }).then(function (price) {
        var cur = price != null && isFinite(price) ? price : (avg != null ? avg : 100);
        var avgPrice = avg != null ? avg : cur;

        if (existing) {
          mergePositionPurchase(existing, qty, avgPrice, buyDate, comment);
          if (cur != null && isFinite(cur)) existing.currentPrice = cur;
          setPortfolio(portfolio);
          clearFormsAfterSave();
          showToast('Докупка учтена, обновлена ср. цена: ' + t);
        } else {
          portfolio.positions.push(normalizePosition({
            ticker: t,
            qty: qty,
            avgPrice: avgPrice,
            currentPrice: cur,
            buyDate: buyDate,
            comment: comment,
            market: 'RU',
            currency: 'RUB'
          }));
          setPortfolio(portfolio);
          clearFormsAfterSave();
          showToast('Добавлено в портфель: ' + t);
        }
        state.chartTicker = t;
        state.folderOpen = true;
        renderPortfolio();
      });
    });
  }



  function addPortfolioFromWatchInput() {
    var raw = document.getElementById('tickerInput').value;
    resolveTickerFromInput(raw).then(function (t) {
      t = normalizeTicker(t);
      if (!t) {
        showToast('Введите тикер или название');
        return;
      }
      fillPortfolioForm('Watch', { ticker: t });
      fillPortfolioForm('', { ticker: t });
      addPortfolioPosition(null, { prefix: 'Watch' });
    });
  }



  function handlePortfolioTableClick(e) {
    var editBtn = e.target.closest('[data-pf-edit]');
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      var wrap = editBtn.closest('[data-pf-form]');
      var formPrefix = wrap ? wrap.getAttribute('data-pf-form') || '' : '';
      startEditPortfolioPosition(editBtn.getAttribute('data-pf-edit'), formPrefix);
      return;
    }
    var removeBtn = e.target.closest('[data-pf-remove]');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      var ticker = removeBtn.getAttribute('data-pf-remove');
      if (confirm('Удалить позицию ' + ticker + ' из портфеля?')) {
        removePortfolioPosition(ticker);
      }
      return;
    }
    var row = e.target.closest('tr[data-chart-ticker]');
    if (row && !e.target.closest('.pf-row-actions')) {
      if (state.tab === 'watchlist') switchTab('portfolio');
      selectPortfolioTicker(row.getAttribute('data-chart-ticker'));
    }
  }



  function buildPortfolioTableRows(positions) {
    if (!positions || !positions.length) {
      return '<tr><td colspan="9" class="muted">Портфель пуст — добавьте позицию выше</td></tr>';
    }
    return positions.map(function (p) {
      var pnl = getPositionReturnPct(p);
      var cls = pnl != null && pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
      var avg = formatPositionAvg(p);
      var cur = formatPositionPrice(p);
      var mBadge = typeof Markets !== 'undefined'
        ? ' <span class="market-badge market-badge--' + (p.market === 'US' ? 'us' : 'ru') + '">' + escapeHtml(Markets.marketBadgeLabel(p.market || 'RU')) + '</span>'
        : '';
      var editActive = state.pfEditTicker === p.ticker ? ' pf-row-editing' : '';
      return '<tr class="pf-table-row' + editActive + '" data-chart-ticker="' + escapeHtml(p.ticker) + '" data-pf-ticker="' + escapeHtml(p.ticker) + '">' +
        '<td class="ticker">' + escapeHtml(p.ticker) + mBadge + '</td>' +
        '<td>' + escapeHtml(formatPortfolioQty(p)) + '</td>' +
        '<td>' + escapeHtml(avg) + '</td>' +
        '<td>' + escapeHtml(formatPortfolioDate(p)) + '</td>' +
        '<td>' + escapeHtml(p.comment || '—') + '</td>' +
        '<td>' + escapeHtml(cur) + '</td>' +
        '<td class="' + cls + '">' + escapeHtml(formatSignedPct(pnl, 2)) + '</td>' +
        '<td class="pf-div-cell" data-pf-div-cell="' + escapeHtml(p.ticker) + '"><span class="muted">…</span></td>' +
        '<td class="pf-row-actions">' +
          '<button type="button" class="ghost small" data-pf-edit="' + escapeHtml(p.ticker) + '">Изменить</button> ' +
          '<button type="button" class="danger small" data-pf-remove="' + escapeHtml(p.ticker) + '">Удалить</button>' +
        '</td></tr>';
    }).join('');
  }



  function renderPortfolioTableBody() {
    var positions = getFilteredPortfolioPositions();
    var html = buildPortfolioTableRows(positions);
    ['portfolioTableBody', 'portfolioWatchTableBody'].forEach(function (id) {
      var tbody = document.getElementById(id);
      if (tbody) tbody.innerHTML = html;
    });
    positions.forEach(function (p) {
      if (typeof fetchPortfolioDivForecastHtml !== 'function') return;
      fetchPortfolioDivForecastHtml(p.ticker, p.qty).then(function (html) {
        document.querySelectorAll('[data-pf-div-cell="' + p.ticker + '"]').forEach(function (cell) {
          cell.innerHTML = html;
        });
      });
    });

    var cards = document.getElementById('portfolioCards');
    if (!cards) return;
    cards.innerHTML = positions.map(function (p) {
      var pnl = getPositionReturnPct(p);
      var cls = pnl != null && pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
      var avg = formatPositionAvg(p);
      var cur = formatPositionPrice(p);
      var mBadge = typeof Markets !== 'undefined'
        ? ' <span class="market-badge market-badge--' + (p.market === 'US' ? 'us' : 'ru') + '">' + escapeHtml(Markets.marketBadgeLabel(p.market || 'RU')) + '</span>'
        : '';
      return '<div class="portfolio-card"><div class="ticker">' + escapeHtml(p.ticker) + mBadge + '</div>' +
        '<div class="grid"><span>Ср. цена</span><span>' + escapeHtml(avg) + '</span>' +
        '<span>Текущая</span><span>' + escapeHtml(cur) + '</span>' +
        '<span>Доходность</span><span class="' + cls + '">' + escapeHtml(formatSignedPct(pnl, 2)) + '</span></div></div>';
    }).join('');
  }



  function renderPortfolio() {
    if (typeof Markets !== 'undefined' && Markets.renderBriefingMarketTabs) {
      Markets.renderBriefingMarketTabs('portfolioMarketTabs');
    }
    renderPortfolioTableBody();
    renderPortfolioFolder();
    renderPortfolioChart();
    refreshPortfolioQuotes().then(function () {
      renderPortfolioTableBody();
      renderPortfolioFolder();
      if (state.chartTicker) renderPortfolioChart();
    });
  }


