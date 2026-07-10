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

  function formatPositionPrice(pos, opts) {
    opts = opts || {};
    var cur = Number(pos.currentPrice);
    var currency = pos.currency || (typeof Markets !== 'undefined' && Markets.isUsPosition(pos) ? 'USD' : 'RUB');
    if (opts.bond || (typeof isRuBondTicker === 'function' && isRuBondTicker(pos.ticker))) {
      if (!isFinite(cur)) return '—';
      return cur.toFixed(2).replace('.', ',') + '%';
    }
    if (typeof Markets !== 'undefined') {
      return Markets.formatMoneyValue(isFinite(cur) ? cur : null, currency);
    }
    return isFinite(cur) ? cur.toFixed(2) : '—';
  }

  function formatPositionAvg(pos, opts) {
    opts = opts || {};
    var avg = Number(pos.avgPrice);
    var currency = pos.currency || 'RUB';
    if (opts.bond || (typeof isRuBondTicker === 'function' && isRuBondTicker(pos.ticker))) {
      if (!isFinite(avg)) return '—';
      return avg.toFixed(2).replace('.', ',') + '%';
    }
    if (typeof Markets !== 'undefined') {
      return Markets.formatMoneyValue(isFinite(avg) ? avg : null, currency);
    }
    return isFinite(avg) ? avg.toFixed(2) : '—';
  }

  function isPortfolioBondPosition(pos) {
    return typeof isRuBondTicker === 'function' && isRuBondTicker(pos.ticker);
  }

  function getPortfolioBondFaceValue(bondMeta) {
    return bondMeta && bondMeta.faceValue != null && isFinite(Number(bondMeta.faceValue))
      ? Number(bondMeta.faceValue)
      : 1000;
  }

  function getPositionMarketValue(pos, bondMeta) {
    var qty = isFinite(Number(pos.qty)) && Number(pos.qty) > 0 ? Number(pos.qty) : 0;
    if (!qty) return 0;
    var price = Number(pos.currentPrice);
    if (!isFinite(price)) return 0;
    if (isPortfolioBondPosition(pos)) {
      var face = getPortfolioBondFaceValue(bondMeta);
      return qty * (price / 100) * face;
    }
    return qty * price;
  }

  function formatPortfolioWeightPct(part, total) {
    if (!total || !isFinite(total) || total <= 0 || part == null || !isFinite(part)) return '—';
    return (part / total * 100).toFixed(1).replace('.', ',') + '%';
  }

  function formatPortfolioRubAmount(val) {
    if (val == null || !isFinite(val)) return '—';
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  }

  function formatBondMaturityCell(bondMeta) {
    if (!bondMeta || !bondMeta.matDate) return '—';
    var date = typeof formatOfzDate === 'function'
      ? formatOfzDate(bondMeta.matDate)
      : String(bondMeta.matDate).slice(0, 10);
    var years = typeof yearsToMaturity === 'function' ? yearsToMaturity(bondMeta.matDate) : null;
    var term = typeof classifyOfzMaturityTerm === 'function' ? classifyOfzMaturityTerm(years) : null;
    var termLbl = typeof formatOfzMaturityTermLabel === 'function'
      ? formatOfzMaturityTermLabel(term)
      : '';
    if (termLbl && termLbl !== '—') {
      return escapeHtml(date) + '<span class="pf-bond-term muted"> · ' + escapeHtml(termLbl) + '</span>';
    }
    return escapeHtml(date);
  }

  function formatBondReturnCell(pos, bondMeta) {
    if (bondMeta && bondMeta.yieldPct != null && isFinite(bondMeta.yieldPct)) {
      var ytm = typeof formatDivYieldPct === 'function'
        ? formatDivYieldPct(bondMeta.yieldPct)
        : bondMeta.yieldPct.toFixed(1) + '%';
      return '<span class="pf-bond-ytm" title="Доходность к погашению · MOEX">' + escapeHtml(ytm) + '</span>';
    }
    var pnl = getPositionReturnPct(pos);
    if (pnl == null) return '<span class="muted">—</span>';
    var cls = pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
    return '<span class="' + cls + '" title="Изменение цены от средней покупки">' + escapeHtml(formatSignedPct(pnl, 2)) + '</span>';
  }

  function loadPortfolioBondMetaMap(positions) {
    var bonds = (positions || []).filter(isPortfolioBondPosition);
    var map = {};
    if (!bonds.length || typeof fetchOfzBondSnapshot !== 'function') {
      return Promise.resolve(map);
    }
    return Promise.all(bonds.map(function (p) {
      return fetchOfzBondSnapshot({ ticker: p.ticker }).then(function (bond) {
        map[p.ticker] = bond || {};
      }).catch(function () {
        map[p.ticker] = {};
      });
    })).then(function () { return map; });
  }

  function loadPortfolioIncomeTotals(positions) {
    var paid = 0;
    var forecast = 0;
    var jobs = (positions || []).map(function (p) {
      if (isPortfolioBondPosition(p)) {
        if (typeof fetchOfzBondSnapshot !== 'function') return Promise.resolve();
        return fetchOfzBondSnapshot({ ticker: p.ticker }).then(function (bond) {
          if (!bond || typeof computeBondCoupons12m !== 'function') return;
          var sums = computeBondCoupons12m(bond.coupons, p.qty, bond.faceValue || 1000);
          if (sums.paid12m != null && isFinite(sums.paid12m)) paid += sums.paid12m;
          if (sums.upcoming12m != null && isFinite(sums.upcoming12m)) forecast += sums.upcoming12m;
        }).catch(function () {});
      }
      if (typeof isRuStockForAnalytics === 'function' && !isRuStockForAnalytics(p.ticker)) {
        return Promise.resolve();
      }
      if (typeof buildSecurityAnalytics !== 'function') return Promise.resolve();
      return buildSecurityAnalytics(p.ticker).then(function (a) {
        var fc = a && a.divForecast;
        var q = isFinite(Number(p.qty)) && Number(p.qty) > 0 ? Number(p.qty) : 0;
        if (!q || !fc) return;
        if (fc.paid12m != null && isFinite(fc.paid12m)) paid += fc.paid12m * q;
        var upcoming = fc.upcoming12m != null && isFinite(fc.upcoming12m) ? fc.upcoming12m : fc.amount;
        if (upcoming != null && isFinite(upcoming)) forecast += upcoming * q;
      }).catch(function () {});
    });
    return Promise.all(jobs).then(function () {
      return { paid12m: paid, forecast12m: forecast };
    });
  }

  function renderPortfolioSummary(positions, bondMetaMap, incomeTotals, sales) {
    var el = document.getElementById('portfolioTotals');
    if (!el) return;
    bondMetaMap = bondMetaMap || {};
    incomeTotals = incomeTotals || { paid12m: 0, forecast12m: 0 };
    sales = sales || [];
    var realized = getTotalRealizedPnl(sales);
    if ((!positions || !positions.length) && realized == null) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    var stockValue = 0;
    var bondValue = 0;
    var remainCost = 0;
    (positions || []).forEach(function (p) {
      var val = getPositionMarketValue(p, bondMetaMap[p.ticker]);
      if (isPortfolioBondPosition(p)) bondValue += val;
      else stockValue += val;
      var q = Number(p.qty);
      var a = Number(p.avgPrice);
      if (isFinite(q) && q > 0 && isFinite(a) && a > 0) remainCost += q * a;
    });
    var totalValue = stockValue + bondValue;
    var stockShare = totalValue > 0 ? stockValue / totalValue * 100 : 0;
    var bondShare = totalValue > 0 ? bondValue / totalValue * 100 : 0;
    var unrealized = remainCost > 0 && totalValue > 0 ? totalValue - remainCost : null;
    el.hidden = false;
    el.innerHTML =
      '<div class="portfolio-totals-grid">' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Остаток (рынок)</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(totalValue)) + '</span>' +
          (remainCost > 0 ? '<span class="portfolio-total-sub muted">вложено ' + escapeHtml(formatPortfolioRubAmount(remainCost)) + '</span>' : '') +
        '</div>' +
        (realized != null
          ? '<div class="portfolio-total-card">' +
              '<span class="portfolio-total-lbl">Зафиксировано (продажи)</span>' +
              '<span class="portfolio-total-val ' + (realized >= 0 ? 'pnl-pos' : 'pnl-neg') + '">' + escapeHtml(formatSignedRubAmount(realized)) + '</span>' +
              '<span class="portfolio-total-sub muted">' + escapeHtml(sales.length + ' ' + (sales.length === 1 ? 'сделка' : (sales.length < 5 ? 'сделки' : 'сделок'))) + '</span>' +
            '</div>'
          : '') +
        (unrealized != null
          ? '<div class="portfolio-total-card">' +
              '<span class="portfolio-total-lbl">Нереализовано</span>' +
              '<span class="portfolio-total-val ' + (unrealized >= 0 ? 'pnl-pos' : 'pnl-neg') + '">' + escapeHtml(formatSignedRubAmount(unrealized)) + '</span>' +
              '<span class="portfolio-total-sub muted">остаток к вложенному</span>' +
            '</div>'
          : '') +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Акции</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(stockValue)) + '</span>' +
          '<span class="portfolio-total-sub muted">' + escapeHtml(stockShare.toFixed(1).replace('.', ',') + '% остатка') + '</span>' +
        '</div>' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Облигации</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(bondValue)) + '</span>' +
          '<span class="portfolio-total-sub muted">' + escapeHtml(bondShare.toFixed(1).replace('.', ',') + '% остатка') + '</span>' +
        '</div>' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Выплачено за 12 мес.</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(incomeTotals.paid12m)) + '</span>' +
          '<span class="portfolio-total-sub muted">дивиденды и купоны</span>' +
        '</div>' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Прогноз на 12 мес.</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(incomeTotals.forecast12m)) + '</span>' +
          '<span class="portfolio-total-sub muted">дивиденды и купоны</span>' +
        '</div>' +
      '</div>';
  }



  function formatSignedRubAmount(val) {
    if (val == null || !isFinite(val)) return '—';
    var sign = val > 0 ? '+' : '';
    return sign + val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
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
      var lots = findPortfolioLots(ticker, portfolio.positions);
      if (!lots.length) return;
      lots.forEach(function (p) {
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
        } else {
          delete p.dayChangePct;
        }
      });
      setPortfolio(portfolio);
    }).catch(function () { /* keep chart price */ });
  }



  function getPortfolioPaperPositions() {
    var positions = getPortfolio().positions.filter(function (p) {
      var t = normalizeTicker(p.ticker);
      return t !== 'IMOEX' && t !== 'MOEX' && t !== 'INDEX';
    });
    var seen = {};
    var out = [];
    positions.forEach(function (p) {
      var t = normalizeTicker(p.ticker);
      if (seen[t]) return;
      seen[t] = true;
      var agg = aggregatePortfolioLots(findPortfolioLots(t, positions));
      if (agg) out.push(agg);
    });
    return out;
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
      el.innerHTML = '<span class="muted analytics-grid-empty">Список пуст</span>';
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



  function getLotReturnPct(lot) {
    var avg = Number(lot && lot.avgPrice);
    var cur = Number(lot && lot.currentPrice);
    if (!isFinite(avg) || avg <= 0 || !isFinite(cur)) return null;
    return ((cur - avg) / avg) * 100;
  }



  function getSaleRealizedPnl(sale) {
    var q = Number(sale && sale.qty);
    var buy = Number(sale && sale.buyPrice);
    var sell = Number(sale && sale.salePrice);
    if (!isFinite(q) || q <= 0 || !isFinite(buy) || buy <= 0 || !isFinite(sell)) {
      return { amount: null, pct: null };
    }
    var amount = (sell - buy) * q;
    return { amount: amount, pct: ((sell - buy) / buy) * 100 };
  }



  function getPortfolioSales(ticker) {
    var sales = getPortfolio().sales || [];
    if (!ticker) return sales.slice();
    ticker = normalizeTicker(ticker);
    return sales.filter(function (s) { return normalizeTicker(s.ticker) === ticker; });
  }



  function findPortfolioSale(saleId, sales) {
    saleId = String(saleId || '');
    if (!saleId) return null;
    var list = sales || getPortfolio().sales || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].saleId === saleId) return list[i];
    }
    return null;
  }



  function getTotalRealizedPnl(sales) {
    var total = 0;
    var has = false;
    (sales || []).forEach(function (s) {
      var pnl = getSaleRealizedPnl(s);
      if (pnl.amount != null && isFinite(pnl.amount)) {
        total += pnl.amount;
        has = true;
      }
    });
    return has ? total : null;
  }



  function getRemainingCostBasis(lots) {
    var totalQty = 0;
    var totalCost = 0;
    (lots || []).forEach(function (l) {
      var q = Number(l.qty);
      var a = Number(l.avgPrice);
      if (isFinite(q) && q > 0 && isFinite(a) && a > 0) {
        totalQty += q;
        totalCost += q * a;
      }
    });
    return totalQty > 0 ? totalCost : null;
  }



  function findPortfolioLots(ticker, positions) {
    ticker = normalizeTicker(ticker);
    if (!ticker) return [];
    var list = positions || getPortfolio().positions;
    return list.filter(function (p) {
      return normalizeTicker(p.ticker) === ticker;
    });
  }



  function findPortfolioLot(lotId, positions) {
    lotId = String(lotId || '');
    if (!lotId) return null;
    var list = positions || getPortfolio().positions;
    for (var i = 0; i < list.length; i++) {
      if (list[i].lotId === lotId) return list[i];
    }
    return null;
  }



  function computeLotsWeightedAvg(lots) {
    var totalQty = 0;
    var totalCost = 0;
    (lots || []).forEach(function (l) {
      var q = Number(l.qty);
      var a = Number(l.avgPrice);
      if (isFinite(q) && q > 0 && isFinite(a) && a > 0) {
        totalQty += q;
        totalCost += q * a;
      }
    });
    return totalQty > 0 ? totalCost / totalQty : null;
  }



  function aggregatePortfolioLots(lots) {
    if (!lots || !lots.length) return null;
    var base = lots[0];
    var totalQty = 0;
    var cur = null;
    var dayChg = null;
    lots.forEach(function (l) {
      var q = Number(l.qty);
      if (isFinite(q) && q > 0) totalQty += q;
      if (isFinite(Number(l.currentPrice))) cur = Number(l.currentPrice);
      if (l.dayChangePct != null && isFinite(Number(l.dayChangePct))) dayChg = Number(l.dayChangePct);
    });
    var weightedAvg = computeLotsWeightedAvg(lots);
    var dates = lots.map(function (l) { return l.buyDate; }).filter(Boolean).sort();
    return {
      lotId: base.lotId,
      ticker: normalizeTicker(base.ticker),
      qty: totalQty > 0 ? totalQty : base.qty,
      avgPrice: weightedAvg != null ? weightedAvg : base.avgPrice,
      currentPrice: cur != null ? cur : base.currentPrice,
      buyDate: dates.length ? dates[dates.length - 1] : base.buyDate,
      comment: lots.map(function (l) { return l.comment; }).filter(Boolean).join(' · '),
      market: base.market,
      currency: base.currency,
      dayChangePct: dayChg
    };
  }



  function findPortfolioPosition(ticker, positions) {
    return aggregatePortfolioLots(findPortfolioLots(ticker, positions));
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
    positions = positions.filter(function (p) {
      var q = Number(p.qty);
      return isFinite(q) && q > 0;
    });
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
        findPortfolioLots(pos.ticker, portfolio.positions).forEach(function (live) {
          live.currentPrice = result.series[result.series.length - 1].price;
        });
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
    if (typeof acControllers !== 'undefined') {
      var ac = acControllers[pfFieldId(prefix, 'Ticker')];
      if (ac) ac.close();
    }
  }

  function safeClearPortfolioForms(prefix) {
    try {
      clearPortfolioForm(prefix);
      clearPortfolioForm(prefix === 'Watch' ? '' : 'Watch');
    } catch (e) { /* не блокируем сохранение */ }
  }

  function handlePortfolioAddError(err) {
    if (err && (err.code === 'storage_quota' || err.name === 'QuotaExceededError')) {
      showToast('Не удалось сохранить: память браузера переполнена. Очистите данные сайта (F12 → Application → Local Storage).');
      return;
    }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[InvestBrief] portfolio add failed:', err);
    }
    showToast('Не удалось добавить позицию — проверьте тикер');
  }

  function normalizeBondTickerInput(input) {
    var s = String(input || '').trim().toUpperCase();
    if (!s) return '';
    var m = s.match(/(\d{5})/);
    if (m) return 'OFZ_' + m[1];
    if (/^OFZ_\d{5}$/.test(s)) return s;
    if (s.indexOf('SU') === 0 && s.length > 8) {
      var m2 = s.match(/(\d{5})/);
      if (m2) return 'OFZ_' + m2[1];
    }
    return '';
  }

  function isLikelyRuStockTicker(raw) {
    var t = normalizeTicker(raw);
    if (!t || normalizeBondTickerInput(t)) return false;
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(t)) return false;
    return /^[A-Z0-9._-]{1,12}$/.test(t) && !/[А-Яа-яЁё]/.test(String(raw || ''));
  }

  function commitPortfolioPosition(sec, captured, prefix) {
    if (!sec || !sec.ticker) {
      showToast('Укажите тикер');
      return;
    }
    var t = normalizeTicker(sec.ticker);
    var qty = captured.qty;
    var avg = captured.avg;
    var buyDate = captured.buyDate;
    var comment = captured.comment;
    var hasQty = qty != null && isFinite(qty) && qty > 0;
    var hasAvg = avg != null && isFinite(avg) && avg > 0;
    var portfolio = getPortfolio();
    var existingLots = findPortfolioLots(t, portfolio.positions);
    var editingLot = state.pfEditLotId
      ? findPortfolioLot(state.pfEditLotId, portfolio.positions)
      : null;
    var editing = !!editingLot;

    if (existingLots.length && !editing && !hasQty && !hasAvg) {
      showToast('Для докупки укажите количество и цену покупки');
      return;
    }

    if (editing) {
      if (!editingLot) {
        cancelPortfolioEdit();
        return;
      }
      if (qty != null) editingLot.qty = qty;
      if (avg != null) editingLot.avgPrice = avg;
      if (buyDate) editingLot.buyDate = buyDate;
      editingLot.comment = comment;
      setPortfolio(portfolio);
      cancelPortfolioEdit();
      showToast('Покупка обновлена: ' + t);
      try { renderPortfolio(); } catch (e) { /* noop */ }
      return;
    }

    var isUs = typeof Markets !== 'undefined' && sec.market === 'US';
    var isBond = !isUs && (
      sec.type === 'bond' || sec.kind === 'bond' ||
      (typeof isRuBondTicker === 'function' && isRuBondTicker(t))
    );

    function finishRuAdd(cur) {
      var refLot = existingLots.length ? existingLots[existingLots.length - 1] : null;
      var finalCur = cur != null && isFinite(cur) ? cur : (hasAvg ? avg : (refLot && isFinite(Number(refLot.currentPrice)) ? Number(refLot.currentPrice) : 100));
      var avgPrice = hasAvg ? avg : finalCur;
      var lotDate = buyDate || new Date().toISOString().slice(0, 10);

      if (existingLots.length) {
        var newLot = normalizePosition({
          ticker: t,
          qty: qty,
          avgPrice: avgPrice,
          currentPrice: finalCur,
          buyDate: lotDate,
          comment: comment,
          market: 'RU',
          currency: 'RUB'
        });
        if (!newLot) throw new Error('invalid_position');
        portfolio.positions.push(newLot);
        setPortfolio(portfolio);
        safeClearPortfolioForms(prefix);
        showToast('Докупка добавлена: ' + t);
      } else {
        var pos = normalizePosition({
          ticker: t,
          qty: qty,
          avgPrice: avgPrice,
          currentPrice: finalCur,
          buyDate: lotDate,
          comment: comment,
          market: 'RU',
          currency: 'RUB'
        });
        if (!pos) throw new Error('invalid_position');
        portfolio.positions.push(pos);
        setPortfolio(portfolio);
        safeClearPortfolioForms(prefix);
        showToast('Добавлено в портфель: ' + t);
      }
      state.chartTicker = t;
      state.folderOpen = true;
      try { renderPortfolio(); } catch (e) { /* noop */ }
    }

    function finishUsAdd(cur, dayPct) {
      var refLot = existingLots.length ? existingLots[existingLots.length - 1] : null;
      var lotDate = buyDate || new Date().toISOString().slice(0, 10);
      if (existingLots.length) {
        var usLot = normalizePosition({
          ticker: t,
          qty: qty,
          avgPrice: avg != null ? avg : (cur != null && isFinite(cur) ? cur : null),
          currentPrice: cur != null && isFinite(cur) ? cur : null,
          buyDate: lotDate,
          comment: comment,
          market: 'US',
          currency: 'USD'
        });
        if (!usLot) throw new Error('invalid_position');
        if (dayPct != null && isFinite(dayPct)) usLot.dayChangePct = dayPct;
        portfolio.positions.push(usLot);
      } else {
        var usPos = normalizePosition({
          ticker: t,
          qty: qty,
          avgPrice: avg != null ? avg : (cur != null && isFinite(cur) ? cur : null),
          currentPrice: cur != null && isFinite(cur) ? cur : null,
          buyDate: lotDate,
          comment: comment,
          market: 'US',
          currency: 'USD'
        });
        if (!usPos) throw new Error('invalid_position');
        if (dayPct != null && isFinite(dayPct)) usPos.dayChangePct = dayPct;
        portfolio.positions.push(usPos);
      }
      setPortfolio(portfolio);
      safeClearPortfolioForms(prefix);
      showToast(existingLots.length ? 'Докупка добавлена: ' + t : 'Добавлено в портфель: ' + t);
      state.chartTicker = t;
      state.folderOpen = true;
      try { renderPortfolio(); } catch (e) { /* noop */ }
    }

    if (isUs) {
      return Markets.fetchUsQuote(t).then(function (q) {
        var cur = q && q.price != null ? q.price : null;
        finishUsAdd(cur, q && q.changePct != null ? q.changePct : null);
      }).catch(function () {
        finishUsAdd(null, null);
      });
    }

    if (isBond) {
      finishRuAdd(avg != null && isFinite(avg) ? avg : null);
      fetchMoexLastPrice(t).catch(function () { return null; }).then(function (live) {
        if (live == null || !isFinite(live)) return;
        var p = getPortfolio();
        findPortfolioLots(t, p.positions).forEach(function (pos) {
          pos.currentPrice = live;
        });
        try { setPortfolio(p); } catch (e) { /* noop */ }
        try { renderPortfolio(); } catch (e2) { /* noop */ }
      });
      return Promise.resolve();
    }

    finishRuAdd(avg != null && isFinite(avg) ? avg : null);
    fetchMoexLastPrice(t).catch(function () { return null; }).then(function (live) {
      if (live == null || !isFinite(live)) return;
      var p = getPortfolio();
      findPortfolioLots(t, p.positions).forEach(function (pos) {
        pos.currentPrice = live;
      });
      try { setPortfolio(p); } catch (e) { /* noop */ }
      try { renderPortfolio(); } catch (e2) { /* noop */ }
    });
    return Promise.resolve();
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
    var editing = !!state.pfEditLotId;
    PF_FORM_PREFIXES.forEach(function (prefix) {
      var title = document.getElementById(pfFieldId(prefix, 'FormTitle'));
      var btn = document.getElementById(pfFieldId(prefix, 'Btn'));
      var cancel = document.getElementById(pfFieldId(prefix, 'CancelEditBtn'));
      if (title) title.textContent = editing ? 'Редактировать покупку' : 'Новая позиция';
      if (btn) btn.textContent = editing ? 'Сохранить изменения' : 'Добавить позицию в портфель';
      if (cancel) cancel.hidden = !editing;
    });
  }



  function startEditPortfolioPosition(lotId, formPrefix) {
    var pos = findPortfolioLot(lotId) || findPortfolioPosition(lotId);
    if (!pos) return;
    cancelPortfolioSale();
    state.pfEditLotId = pos.lotId || '';
    state.pfEditTicker = normalizeTicker(pos.ticker);
    state.pfEditPrefix = formPrefix || '';
    fillAllPortfolioForms(pos);
    updatePortfolioFormChrome();
    showToast('Редактирование покупки: ' + pos.ticker);
  }



  function cancelPortfolioEdit() {
    state.pfEditTicker = '';
    state.pfEditLotId = '';
    state.pfEditPrefix = '';
    clearAllPortfolioForms();
    updatePortfolioFormChrome();
  }



  function removePortfolioLot(lotId) {
    lotId = String(lotId || '');
    if (!lotId) return;
    var portfolio = getPortfolio();
    var removed = findPortfolioLot(lotId, portfolio.positions);
    if (!removed) return;
    var ticker = normalizeTicker(removed.ticker);
    portfolio.positions = portfolio.positions.filter(function (p) { return p.lotId !== lotId; });
    setPortfolio(portfolio);
    if (state.chartTicker === ticker && !findPortfolioPosition(ticker)) state.chartTicker = '';
    if (state.pfEditLotId === lotId) cancelPortfolioEdit();
    showToast('Покупка удалена: ' + ticker);
    renderPortfolio();
  }



  function removePortfolioPosition(ticker) {
    ticker = normalizeTicker(ticker);
    var portfolio = getPortfolio();
    var next = portfolio.positions.filter(function (p) { return normalizeTicker(p.ticker) !== ticker; });
    if (next.length === portfolio.positions.length) return;
    portfolio.positions = next;
    portfolio.sales = (portfolio.sales || []).filter(function (s) { return normalizeTicker(s.ticker) !== ticker; });
    setPortfolio(portfolio);
    if (state.chartTicker === ticker) state.chartTicker = '';
    if (state.pfEditTicker === ticker) cancelPortfolioEdit();
    if (state.pfSaleTicker) cancelPortfolioSale();
    showToast('Удалено из портфеля: ' + ticker);
    renderPortfolio();
  }



  function allocateSaleAcrossLots(portfolio, ticker, sellQty) {
    ticker = normalizeTicker(ticker);
    var lots = findPortfolioLots(ticker, portfolio.positions).filter(function (l) {
      var q = Number(l.qty);
      return isFinite(q) && q > 0;
    });
    if (!lots.length) return null;
    var totalQty = lots.reduce(function (s, l) { return s + Number(l.qty); }, 0);
    if (!isFinite(sellQty) || sellQty <= 0 || sellQty > totalQty + 1e-6) return null;

    var weightedAvgBefore = computeLotsWeightedAvg(lots);
    var allocations = [];
    var left = sellQty;

    lots.forEach(function (lot, idx) {
      var lotQty = Number(lot.qty);
      var take = idx === lots.length - 1
        ? left
        : Math.round((sellQty * lotQty / totalQty) * 10000) / 10000;
      take = Math.min(take, lotQty, left);
      if (take <= 1e-9) return;
      lot.qty = lotQty - take;
      left -= take;
      allocations.push({
        lotId: lot.lotId,
        qty: take,
        buyPrice: isFinite(Number(lot.avgPrice)) ? Number(lot.avgPrice) : null,
        buyDate: lot.buyDate || ''
      });
    });

    portfolio.positions = portfolio.positions.filter(function (p) {
      var q = Number(p.qty);
      return isFinite(q) && q > 1e-9;
    });

    return { allocations: allocations, weightedAvgBefore: weightedAvgBefore };
  }



  function startSalePortfolioTicker(ticker) {
    ticker = normalizeTicker(ticker || '');
    if (!ticker) {
      showToast('Не удалось определить тикер');
      return;
    }
    var lots = findPortfolioLots(ticker);
    var totalQty = lots.reduce(function (s, l) {
      var q = Number(l.qty);
      return s + (isFinite(q) && q > 0 ? q : 0);
    }, 0);
    if (totalQty <= 0) {
      showToast('По ' + ticker + ' нечего продавать');
      return;
    }
    cancelPortfolioEdit();
    state.pfSaleTicker = ticker;
    var agg = aggregatePortfolioLots(lots);
    var form = document.getElementById('portfolioSaleForm');
    var hint = document.getElementById('pfSaleLotHint');
    if (hint) {
      hint.textContent = ticker + ' · остаток ' + totalQty + ' шт. · ср. цена ' +
        formatPositionAvg(agg || { ticker: ticker, avgPrice: computeLotsWeightedAvg(lots), currency: 'RUB' }) +
        ' · списание пропорционально по всем покупкам';
    }
    var qtyEl = document.getElementById('pfSaleQty');
    var priceEl = document.getElementById('pfSalePrice');
    var dateEl = document.getElementById('pfSaleDate');
    var commentEl = document.getElementById('pfSaleComment');
    if (qtyEl) qtyEl.value = '';
    if (priceEl) {
      priceEl.value = agg && isFinite(Number(agg.currentPrice)) ? String(Number(agg.currentPrice)) : '';
    }
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
    if (commentEl) commentEl.value = '';
    if (form) {
      form.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      showToast('Форма продажи не загружена — обновите страницу (Ctrl+F5)');
    }
  }



  function startSalePortfolioLot(lotId) {
    var lot = findPortfolioLot(lotId);
    if (!lot) {
      showToast('Покупка не найдена — обновите страницу (Ctrl+F5)');
      return;
    }
    startSalePortfolioTicker(lot.ticker);
  }



  function cancelPortfolioSale() {
    state.pfSaleTicker = '';
    var form = document.getElementById('portfolioSaleForm');
    if (form) form.hidden = true;
    var qtyEl = document.getElementById('pfSaleQty');
    var priceEl = document.getElementById('pfSalePrice');
    var dateEl = document.getElementById('pfSaleDate');
    var commentEl = document.getElementById('pfSaleComment');
    if (qtyEl) qtyEl.value = '';
    if (priceEl) priceEl.value = '';
    if (dateEl) dateEl.value = '';
    if (commentEl) commentEl.value = '';
  }



  function capturePortfolioSaleInput() {
    var qty = parseFloat(String((document.getElementById('pfSaleQty') || {}).value || '').replace(',', '.'));
    var price = parseFloat(String((document.getElementById('pfSalePrice') || {}).value || '').replace(',', '.'));
    return {
      qty: isFinite(qty) ? qty : null,
      price: isFinite(price) ? price : null,
      date: String((document.getElementById('pfSaleDate') || {}).value || '').trim(),
      comment: String((document.getElementById('pfSaleComment') || {}).value || '').trim()
    };
  }



  function commitPortfolioSale(ticker, captured) {
    ticker = normalizeTicker(ticker || state.pfSaleTicker || '');
    captured = captured || capturePortfolioSaleInput();
    if (!ticker) {
      showToast('Укажите тикер для продажи');
      return;
    }
    var portfolio = getPortfolio();
    var lots = findPortfolioLots(ticker, portfolio.positions).filter(function (l) {
      var q = Number(l.qty);
      return isFinite(q) && q > 0;
    });
    if (!lots.length) {
      showToast('По ' + ticker + ' нечего продавать');
      cancelPortfolioSale();
      return;
    }
    var qty = captured.qty;
    var salePrice = captured.price;
    var saleDate = captured.date || new Date().toISOString().slice(0, 10);
    if (qty == null || !isFinite(qty) || qty <= 0) {
      showToast('Укажите количество для продажи');
      return;
    }
    if (salePrice == null || !isFinite(salePrice) || salePrice <= 0) {
      showToast('Укажите цену продажи');
      return;
    }
    var totalQty = lots.reduce(function (s, l) { return s + Number(l.qty); }, 0);
    if (qty > totalQty + 1e-6) {
      showToast('Нельзя продать больше остатка по ' + ticker + ': ' + formatPortfolioQty({ qty: totalQty }) + ' шт.');
      return;
    }
    var allocResult = allocateSaleAcrossLots(portfolio, ticker, qty);
    if (!allocResult || !allocResult.allocations.length) {
      showToast('Не удалось распределить продажу по покупкам');
      return;
    }
    var refLot = lots[0];
    var sale = normalizeSale({
      ticker: ticker,
      qty: qty,
      buyPrice: allocResult.weightedAvgBefore,
      salePrice: salePrice,
      saleDate: saleDate,
      comment: captured.comment,
      market: refLot.market,
      currency: refLot.currency,
      allocations: allocResult.allocations
    });
    if (!sale) {
      showToast('Не удалось зафиксировать продажу');
      return;
    }
    if (!portfolio.sales) portfolio.sales = [];
    portfolio.sales.push(sale);
    setPortfolio(portfolio);
    var pnl = getSaleRealizedPnl(sale);
    cancelPortfolioSale();
    var msg = 'Продажа зафиксирована: ' + ticker;
    if (pnl.amount != null) msg += ' · ' + formatSignedRubAmount(pnl.amount);
    showToast(msg);
    try { renderPortfolio(); } catch (e) { /* noop */ }
  }



  function removePortfolioSale(saleId) {
    saleId = String(saleId || '');
    var portfolio = getPortfolio();
    var sale = findPortfolioSale(saleId, portfolio.sales);
    if (!sale) return;
    portfolio.sales = (portfolio.sales || []).filter(function (s) { return s.saleId !== saleId; });

    function restoreAlloc(alloc) {
      var lot = findPortfolioLot(alloc.lotId, portfolio.positions);
      if (lot) {
        var q = Number(lot.qty);
        lot.qty = (isFinite(q) && q > 0 ? q : 0) + alloc.qty;
      } else {
        portfolio.positions.push(normalizePosition({
          lotId: alloc.lotId,
          ticker: sale.ticker,
          qty: alloc.qty,
          avgPrice: alloc.buyPrice,
          currentPrice: sale.salePrice,
          buyDate: alloc.buyDate || '',
          comment: '',
          market: sale.market,
          currency: sale.currency
        }));
      }
    }

    if (sale.allocations && sale.allocations.length) {
      sale.allocations.forEach(restoreAlloc);
    } else if (sale.lotId) {
      restoreAlloc({
        lotId: sale.lotId,
        qty: sale.qty,
        buyPrice: sale.buyPrice,
        buyDate: sale.buyDate || ''
      });
    }
    setPortfolio(portfolio);
    showToast('Продажа отменена: ' + sale.ticker);
    renderPortfolio();
  }



  function clearPortfolio() {
    if (!confirm('Удалить все позиции из портфеля?')) return;
    setPortfolio({ positions: [], sales: [] });
    cancelPortfolioEdit();
    cancelPortfolioSale();
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

    if (/офз|ofz/i.test(rawTicker) && !normalizeBondTickerInput(rawTicker)) {
      showToast('Укажите полный тикер ОФЗ, например OFZ_26247');
      return;
    }

    var bondTickerQuick = normalizeBondTickerInput(rawTicker);
    if (bondTickerQuick) {
      try {
        commitPortfolioPosition({
          ticker: bondTickerQuick,
          market: 'RU',
          currency: 'RUB',
          type: 'bond',
          kind: 'bond'
        }, captured, prefix);
      } catch (err) {
        handlePortfolioAddError(err);
      }
      return;
    }

    if (isLikelyRuStockTicker(rawTicker)) {
      try {
        commitPortfolioPosition({
          ticker: normalizeTicker(rawTicker),
          market: 'RU',
          currency: 'RUB',
          type: 'stock',
          kind: 'stock'
        }, captured, prefix);
      } catch (err) {
        handlePortfolioAddError(err);
      }
      return;
    }

    var resolveFn = typeof Markets !== 'undefined' ? Markets.resolveSecurityFromInput : function (r) {
      return resolveTickerFromInput(r).then(function (tk) {
        return tk ? { ticker: tk, market: 'RU', currency: 'RUB', type: 'stock' } : null;
      });
    };
    resolveFn(rawTicker).then(function (sec) {
      return commitPortfolioPosition(sec, captured, prefix);
    }).catch(function (err) {
      handlePortfolioAddError(err);
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
    var expandBtn = e.target.closest('[data-pf-expand-lots]');
    if (expandBtn) {
      e.preventDefault();
      e.stopPropagation();
      var tExpand = expandBtn.getAttribute('data-pf-expand-lots');
      if (!state.pfExpandedTickers) state.pfExpandedTickers = {};
      state.pfExpandedTickers[tExpand] = true;
      renderPortfolioTableBody();
      return;
    }
    var collapseBtn = e.target.closest('[data-pf-collapse-lots]');
    if (collapseBtn) {
      e.preventDefault();
      e.stopPropagation();
      var tCollapse = collapseBtn.getAttribute('data-pf-collapse-lots');
      if (state.pfExpandedTickers) state.pfExpandedTickers[tCollapse] = false;
      renderPortfolioTableBody();
      return;
    }
    var sellBtn = e.target.closest('[data-pf-sell-ticker]');
    if (sellBtn) {
      e.preventDefault();
      e.stopPropagation();
      startSalePortfolioTicker(sellBtn.getAttribute('data-pf-sell-ticker'));
      return;
    }
    var sellLotBtn = e.target.closest('[data-pf-sell-lot]');
    if (sellLotBtn) {
      e.preventDefault();
      e.stopPropagation();
      startSalePortfolioLot(sellLotBtn.getAttribute('data-pf-sell-lot'));
      return;
    }
    var undoSaleBtn = e.target.closest('[data-pf-undo-sale]');
    if (undoSaleBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (confirm('Отменить эту продажу и вернуть бумаги в остаток?')) {
        removePortfolioSale(undoSaleBtn.getAttribute('data-pf-undo-sale'));
      }
      return;
    }
    var editBtn = e.target.closest('[data-pf-edit-lot]');
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      var wrap = editBtn.closest('[data-pf-form]');
      var formPrefix = wrap ? wrap.getAttribute('data-pf-form') || '' : '';
      startEditPortfolioPosition(editBtn.getAttribute('data-pf-edit-lot'), formPrefix);
      return;
    }
    var removeBtn = e.target.closest('[data-pf-remove-lot]');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      var lotId = removeBtn.getAttribute('data-pf-remove-lot');
      if (confirm('Удалить эту покупку из портфеля?')) {
        removePortfolioLot(lotId);
      }
      return;
    }
    if (e.target.closest('.pf-lot-toggle-row')) return;
    if (e.target.closest('.pf-sale-row')) return;
    var row = e.target.closest('tr[data-chart-ticker]');
    if (row && !e.target.closest('.pf-row-actions')) {
      if (state.tab === 'watchlist') switchTab('portfolio');
      selectPortfolioTicker(row.getAttribute('data-chart-ticker'));
    }
  }



  var PF_TABLE_COLS = 12;
  var PF_LOT_COLLAPSE_THRESHOLD = 3;



  function groupPortfolioLotsForTable(positions, sectionKind) {
    var filtered = (positions || []).filter(function (p) {
      var isBond = isPortfolioBondPosition(p);
      if (sectionKind === 'bonds' ? !isBond : isBond) return false;
      var q = Number(p.qty);
      return isFinite(q) && q > 0;
    });
    var groups = [];
    var map = {};
    filtered.forEach(function (p) {
      var t = normalizeTicker(p.ticker);
      if (!map[t]) {
        map[t] = { ticker: t, lots: [] };
        groups.push(map[t]);
      }
      map[t].lots.push(p);
    });
    groups.forEach(function (g) {
      g.lots.sort(function (a, b) {
        var da = a.buyDate || '';
        var db = b.buyDate || '';
        if (da !== db) return da < db ? -1 : 1;
        return String(a.lotId || '').localeCompare(String(b.lotId || ''));
      });
      g.weightedAvg = computeLotsWeightedAvg(g.lots);
    });
    return groups;
  }



  function buildPortfolioLotRow(p, group, opts) {
    opts = opts || {};
    var isBond = opts.isBond;
    var bondMetaMap = opts.bondMetaMap || {};
    var sleeveTotal = opts.sleeveTotal || 0;
    var lotIndex = opts.lotIndex || 0;
    var showIncome = !!opts.showIncome;
    var bondMeta = bondMetaMap[group.ticker] || null;
    var marketVal = getPositionMarketValue(p, bondMeta);
    var weight = formatPortfolioWeightPct(marketVal, sleeveTotal);
    var purchasePrice = formatPositionAvg(p, { bond: isBond });
    var weightedAvg = group.weightedAvg != null
      ? formatPositionAvg({ avgPrice: group.weightedAvg, currency: p.currency, ticker: p.ticker }, { bond: isBond })
      : '—';
    var cur = formatPositionPrice(p, { bond: isBond });
    var lotRet = isBond ? null : getLotReturnPct(p);
    var pnlCls = lotRet != null && lotRet >= 0 ? 'pnl-pos' : 'pnl-neg';
    var mBadge = typeof Markets !== 'undefined'
      ? ' <span class="market-badge market-badge--' + (p.market === 'US' ? 'us' : 'ru') + '">' + escapeHtml(Markets.marketBadgeLabel(p.market || 'RU')) + '</span>'
      : '';
    var editActive = state.pfEditLotId === p.lotId ? ' pf-row-editing' : '';
    var returnCell = isBond
      ? formatBondReturnCell(p, bondMeta)
      : '<span class="' + pnlCls + '">' + escapeHtml(formatSignedPct(lotRet, 2)) + '</span>';
    var bondCols = '<td class="pf-bond-mat">' + (isBond ? formatBondMaturityCell(bondMeta) : '<span class="muted">—</span>') + '</td>';
    var tickerCell = lotIndex === 0
      ? '<td class="ticker" rowspan="' + (opts.rowSpan || 1) + '">' + escapeHtml(group.ticker) + mBadge + '</td>'
      : '';
    var incomeCell = showIncome
      ? '<td class="pf-div-cell" rowspan="' + (opts.incomeRowSpan || 1) + '" data-pf-div-cell="' + escapeHtml(group.ticker) + '"><span class="muted">…</span></td>'
      : '';
    var sellActions = lotIndex === 0
      ? '<button type="button" class="ghost small" data-pf-sell-ticker="' + escapeHtml(group.ticker) + '">Продать</button> '
      : '';
    return '<tr class="pf-table-row pf-lot-row' + editActive + '" data-chart-ticker="' + escapeHtml(group.ticker) + '" data-pf-lot="' + escapeHtml(p.lotId || '') + '">' +
      tickerCell +
      '<td class="pf-weight">' + escapeHtml(weight) + '</td>' +
      '<td>' + escapeHtml(formatPortfolioQty(p)) + '</td>' +
      '<td class="pf-buy-price">' + escapeHtml(purchasePrice) + '</td>' +
      '<td class="pf-weighted-avg">' + escapeHtml(weightedAvg) + '</td>' +
      '<td>' + escapeHtml(formatPortfolioDate(p)) + '</td>' +
      '<td>' + escapeHtml(cur) + '</td>' +
      '<td>' + returnCell + '</td>' +
      bondCols +
      incomeCell +
      '<td class="pf-comment">' + escapeHtml(p.comment || '—') + '</td>' +
      '<td class="pf-row-actions">' +
        sellActions +
        '<button type="button" class="ghost small" data-pf-edit-lot="' + escapeHtml(p.lotId || '') + '">Изменить</button> ' +
        '<button type="button" class="danger small" data-pf-remove-lot="' + escapeHtml(p.lotId || '') + '">Удалить</button>' +
      '</td></tr>';
  }



  function formatPortfolioSaleDate(sale) {
    if (!sale || !sale.saleDate) return '—';
    try {
      return new Date(sale.saleDate + 'T12:00:00').toLocaleDateString('ru-RU');
    } catch (e) {
      return sale.saleDate;
    }
  }



  function buildPortfolioSaleRow(sale, group, opts) {
    opts = opts || {};
    var isBond = opts.isBond;
    var pnl = getSaleRealizedPnl(sale);
    var pnlCls = pnl.amount != null && pnl.amount >= 0 ? 'pnl-pos' : 'pnl-neg';
    var buyLbl = sale.buyPrice != null && isFinite(Number(sale.buyPrice))
      ? formatPositionAvg({ avgPrice: sale.buyPrice, currency: sale.currency, ticker: sale.ticker }, { bond: isBond })
      : '—';
    var sellLbl = formatPositionAvg({ avgPrice: sale.salePrice, currency: sale.currency, ticker: sale.ticker }, { bond: isBond });
    var retCell = pnl.amount != null
      ? '<span class="' + pnlCls + '" title="Реализованный результат от ср. цены">' +
          escapeHtml(formatSignedRubAmount(pnl.amount)) +
          (pnl.pct != null ? ' · ' + escapeHtml(formatSignedPct(pnl.pct, 2)) : '') +
        '</span>'
      : '<span class="muted">—</span>';
    return '<tr class="pf-table-row pf-sale-row" data-pf-sale="' + escapeHtml(sale.saleId) + '">' +
      '<td class="ticker pf-sale-lbl"><span class="pf-lot-marker">↳</span> продажа</td>' +
      '<td class="pf-weight muted">—</td>' +
      '<td class="pf-sale-qty">−' + escapeHtml(String(sale.qty)) + '</td>' +
      '<td class="pf-buy-price muted">—</td>' +
      '<td class="pf-weighted-avg" title="Ср. цена покупки на момент продажи">' + escapeHtml(buyLbl) + '</td>' +
      '<td>' + escapeHtml(formatPortfolioSaleDate(sale)) + '</td>' +
      '<td class="pf-sale-price">' + escapeHtml(sellLbl) + '</td>' +
      '<td>' + retCell + '</td>' +
      '<td class="pf-bond-mat"><span class="muted">—</span></td>' +
      '<td class="muted">—</td>' +
      '<td class="pf-comment">' + escapeHtml(sale.comment || '—') + '</td>' +
      '<td class="pf-row-actions">' +
        '<button type="button" class="ghost small" data-pf-undo-sale="' + escapeHtml(sale.saleId) + '">Отменить</button>' +
      '</td></tr>';
  }



  function buildPortfolioSectionRows(positions, sectionKind, bondMetaMap, sales) {
    bondMetaMap = bondMetaMap || {};
    sales = sales || [];
    var groups = groupPortfolioLotsForTable(positions, sectionKind);
    var tickerInSection = {};
    groups.forEach(function (g) { tickerInSection[g.ticker] = true; });
    sales.forEach(function (s) {
      var t = normalizeTicker(s.ticker);
      if (tickerInSection[t]) return;
      var isBond = isPortfolioBondPosition({ ticker: t });
      if (sectionKind === 'bonds' ? !isBond : isBond) return;
      groups.push({ ticker: t, lots: [], salesOnly: true });
      tickerInSection[t] = true;
    });
    if (!groups.length) {
      return '<tr class="pf-section-empty"><td colspan="' + PF_TABLE_COLS + '" class="muted">Нет позиций</td></tr>';
    }
    var isBond = sectionKind === 'bonds';
    var sleeveTotal = 0;
    groups.forEach(function (g) {
      g.lots.forEach(function (p) {
        sleeveTotal += getPositionMarketValue(p, bondMetaMap[g.ticker]);
      });
    });

    var html = '';
    groups.forEach(function (group) {
      var lots = group.lots;
      var tickerSales = sales.filter(function (s) { return normalizeTicker(s.ticker) === group.ticker; })
        .sort(function (a, b) {
          var da = a.saleDate || '';
          var db = b.saleDate || '';
          return da < db ? 1 : (da > db ? -1 : 0);
        });
      var expanded = state.pfExpandedTickers && state.pfExpandedTickers[group.ticker];
      var collapsible = lots.length > PF_LOT_COLLAPSE_THRESHOLD;
      var visibleLots = collapsible && !expanded ? lots.slice(0, PF_LOT_COLLAPSE_THRESHOLD) : lots;
      var hiddenCount = collapsible && !expanded ? lots.length - visibleLots.length : 0;
      var visibleRowSpan = visibleLots.length || 1;

      if (lots.length) {
        visibleLots.forEach(function (p, idx) {
          html += buildPortfolioLotRow(p, group, {
            isBond: isBond,
            bondMetaMap: bondMetaMap,
            sleeveTotal: sleeveTotal,
            lotIndex: idx,
            rowSpan: visibleRowSpan,
            incomeRowSpan: visibleRowSpan,
            showIncome: idx === 0
          });
        });
      } else if (group.salesOnly) {
        html += '<tr class="pf-table-row pf-sales-only-head" data-chart-ticker="' + escapeHtml(group.ticker) + '">' +
          '<td class="ticker">' + escapeHtml(group.ticker) + '</td>' +
          '<td colspan="' + (PF_TABLE_COLS - 1) + '" class="muted">все продано · история сделок ниже</td></tr>';
      }

      tickerSales.forEach(function (sale) {
        html += buildPortfolioSaleRow(sale, group, { isBond: isBond });
      });

      if (hiddenCount > 0) {
        html += '<tr class="pf-lot-toggle-row"><td colspan="' + PF_TABLE_COLS + '">' +
          '<button type="button" class="ghost small pf-lot-toggle" data-pf-expand-lots="' + escapeHtml(group.ticker) + '">' +
          'Показать ещё ' + hiddenCount + ' ' + (hiddenCount === 1 ? 'покупку' : (hiddenCount < 5 ? 'покупки' : 'покупок')) +
          '</button></td></tr>';
      } else if (collapsible && expanded) {
        html += '<tr class="pf-lot-toggle-row"><td colspan="' + PF_TABLE_COLS + '">' +
          '<button type="button" class="ghost small pf-lot-toggle" data-pf-collapse-lots="' + escapeHtml(group.ticker) + '">' +
          'Свернуть покупки ' + escapeHtml(group.ticker) +
          '</button></td></tr>';
      }
    });
    return html;
  }

  function buildPortfolioTableHtml(positions, bondMetaMap, sales) {
    sales = sales || [];
    var hasLots = positions && positions.length;
    var hasSales = sales.length > 0;
    if (!hasLots && !hasSales) {
      return '<tr><td colspan="' + PF_TABLE_COLS + '" class="muted">Портфель пуст — добавьте позицию выше</td></tr>';
    }
    var stocks = (positions || []).filter(function (p) { return !isPortfolioBondPosition(p); });
    var bonds = (positions || []).filter(isPortfolioBondPosition);
    var stockSales = sales.filter(function (s) { return !isPortfolioBondPosition({ ticker: s.ticker }); });
    var bondSales = sales.filter(function (s) { return isPortfolioBondPosition({ ticker: s.ticker }); });
    var html = '';
    if (stocks.length || stockSales.length) {
      html += '<tr class="pf-section-head"><th colspan="' + PF_TABLE_COLS + '">Акции · доля внутри класса</th></tr>';
      html += buildPortfolioSectionRows(positions, 'stocks', bondMetaMap, sales);
    }
    if (bonds.length || bondSales.length) {
      html += '<tr class="pf-section-head"><th colspan="' + PF_TABLE_COLS + '">Облигации (ОФЗ) · доля внутри класса</th></tr>';
      html += buildPortfolioSectionRows(positions, 'bonds', bondMetaMap, sales);
    }
    return html;
  }

  function buildPortfolioTableRows(positions) {
    return buildPortfolioTableHtml(positions, {});
  }



  function renderPortfolioTableBody() {
    var positions = getFilteredPortfolioPositions();
    var sales = getPortfolio().sales || [];
    var placeholderHtml = buildPortfolioTableHtml(positions, {}, sales);
    ['portfolioTableBody', 'portfolioWatchTableBody'].forEach(function (id) {
      var tbody = document.getElementById(id);
      if (tbody) tbody.innerHTML = placeholderHtml;
    });

    if (!positions.length && !sales.length) {
      renderPortfolioSummary([], {}, { paid12m: 0, forecast12m: 0 }, []);
      var cardsEmpty = document.getElementById('portfolioCards');
      if (cardsEmpty) cardsEmpty.innerHTML = '';
      return;
    }

    Promise.all([
      loadPortfolioBondMetaMap(positions),
      loadPortfolioIncomeTotals(positions)
    ]).then(function (parts) {
      var bondMetaMap = parts[0] || {};
      var incomeTotals = parts[1] || { paid12m: 0, forecast12m: 0 };
      var html = buildPortfolioTableHtml(positions, bondMetaMap, sales);
      ['portfolioTableBody', 'portfolioWatchTableBody'].forEach(function (id) {
        var tbody = document.getElementById(id);
        if (tbody) tbody.innerHTML = html;
      });
      renderPortfolioSummary(positions, bondMetaMap, incomeTotals, sales);

      var stockTotal = 0;
      var bondTotal = 0;
      positions.forEach(function (p) {
        var val = getPositionMarketValue(p, bondMetaMap[p.ticker]);
        if (isPortfolioBondPosition(p)) bondTotal += val;
        else stockTotal += val;
      });

      var fetchFn = typeof fetchPortfolioIncomeCell === 'function'
        ? fetchPortfolioIncomeCell
        : fetchPortfolioDivForecastHtml;
      var incomeTickersSeen = {};
      if (typeof fetchFn === 'function') {
        positions.forEach(function (p) {
          var t = normalizeTicker(p.ticker);
          if (incomeTickersSeen[t]) return;
          incomeTickersSeen[t] = true;
          var aggQty = findPortfolioLots(t, positions).reduce(function (sum, lot) {
            var q = Number(lot.qty);
            return sum + (isFinite(q) && q > 0 ? q : 0);
          }, 0);
          fetchFn(t, aggQty).then(function (cellHtml) {
            document.querySelectorAll('[data-pf-div-cell="' + t + '"]').forEach(function (cell) {
              cell.innerHTML = cellHtml;
            });
          });
        });
      }

      var cards = document.getElementById('portfolioCards');
      if (!cards) return;
      var paperPositions = getPortfolioPaperPositions();
      cards.innerHTML = paperPositions.map(function (p) {
        var isBond = isPortfolioBondPosition(p);
        var bondMeta = bondMetaMap[p.ticker] || null;
        var sleeveTotal = isBond ? bondTotal : stockTotal;
        var marketVal = getPositionMarketValue(p, bondMeta);
        var weight = formatPortfolioWeightPct(marketVal, sleeveTotal);
        var pnl = isBond ? null : getPositionReturnPct(p);
        var cls = pnl != null && pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
        var avg = formatPositionAvg(p, { bond: isBond });
        var cur = formatPositionPrice(p, { bond: isBond });
        var mBadge = typeof Markets !== 'undefined'
          ? ' <span class="market-badge market-badge--' + (p.market === 'US' ? 'us' : 'ru') + '">' + escapeHtml(Markets.marketBadgeLabel(p.market || 'RU')) + '</span>'
          : '';
        var extra = isBond
          ? '<span>Погашение</span><span>' + (bondMeta && bondMeta.matDate
            ? escapeHtml(typeof formatOfzDate === 'function' ? formatOfzDate(bondMeta.matDate) : bondMeta.matDate)
            : '—') + '</span>'
          : '<span>Доходность</span><span class="' + cls + '">' + escapeHtml(formatSignedPct(pnl, 2)) + '</span>';
        return '<div class="portfolio-card" data-chart-ticker="' + escapeHtml(p.ticker) + '"><div class="ticker">' + escapeHtml(p.ticker) + mBadge + '</div>' +
          '<div class="grid"><span>Доля</span><span>' + escapeHtml(weight) + '</span>' +
          '<span>Ср. цена</span><span>' + escapeHtml(avg) + '</span>' +
          '<span>Текущая</span><span>' + escapeHtml(cur) + '</span>' +
          extra + '</div></div>';
      }).join('');
    });
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


