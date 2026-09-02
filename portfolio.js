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

  /** Face: pos/sale.faceValue → bondMeta.faceValue → 1000. avgPrice для ОФЗ остаётся в % номинала. */
  function resolveBondFaceValue(posOrSale, bondMeta) {
    var fromEntity = posOrSale && posOrSale.faceValue;
    if (fromEntity != null && isFinite(Number(fromEntity)) && Number(fromEntity) > 0) {
      return Number(fromEntity);
    }
    return getPortfolioBondFaceValue(bondMeta);
  }

  /** Рублёвая оценка позиции/сделки по цене в % номинала. */
  function bondRubFromPct(pct, qty, face) {
    var p = Number(pct);
    var q = Number(qty);
    var f = Number(face);
    if (!isFinite(p) || !isFinite(q) || q <= 0 || !isFinite(f) || f <= 0) return null;
    return q * (p / 100) * f;
  }

  function getPositionCostRub(pos, bondMeta) {
    var q = Number(pos && pos.qty);
    var a = Number(pos && pos.avgPrice);
    if (!isFinite(q) || q <= 0 || !isFinite(a) || a <= 0) return 0;
    if (isPortfolioBondPosition(pos)) {
      var rub = bondRubFromPct(a, q, resolveBondFaceValue(pos, bondMeta));
      return rub != null ? rub : 0;
    }
    return q * a;
  }

  /** (нереализ. + выплачено 12м) / вложено × 100; иначе null. */
  function computePricePlusPayoutsPct(unrealized, paid12m, remainCost) {
    if (remainCost == null || !isFinite(remainCost) || remainCost <= 0) return null;
    if (unrealized == null || !isFinite(unrealized)) return null;
    var paid = paid12m != null && isFinite(paid12m) ? Number(paid12m) : 0;
    return ((unrealized + paid) / remainCost) * 100;
  }

  function getPositionMarketValue(pos, bondMeta) {
    var qty = isFinite(Number(pos.qty)) && Number(pos.qty) > 0 ? Number(pos.qty) : 0;
    if (!qty) return 0;
    var price = Number(pos.currentPrice);
    if (!isFinite(price)) return 0;
    if (isPortfolioBondPosition(pos)) {
      var rub = bondRubFromPct(price, qty, resolveBondFaceValue(pos, bondMeta));
      return rub != null ? rub : 0;
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
    var realized = getTotalRealizedPnl(sales, bondMetaMap);
    if ((!positions || !positions.length) && realized == null) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    var stockValue = 0;
    var bondValue = 0;
    var remainCost = 0;
    (positions || []).forEach(function (p) {
      var meta = bondMetaMap[p.ticker];
      var val = getPositionMarketValue(p, meta);
      if (isPortfolioBondPosition(p)) bondValue += val;
      else stockValue += val;
      remainCost += getPositionCostRub(p, meta);
    });
    var totalValue = stockValue + bondValue;
    var stockShare = totalValue > 0 ? stockValue / totalValue * 100 : 0;
    var bondShare = totalValue > 0 ? bondValue / totalValue * 100 : 0;
    var unrealized = remainCost > 0 && totalValue > 0 ? totalValue - remainCost : null;
    var pricePlusPayouts = computePricePlusPayoutsPct(unrealized, incomeTotals.paid12m, remainCost);
    el.hidden = false;
    el.innerHTML =
      '<div class="portfolio-totals-grid">' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Текущая стоимость</span>' +
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
              '<span class="portfolio-total-lbl">Результат по текущим ценам</span>' +
              '<span class="portfolio-total-val ' + (unrealized >= 0 ? 'pnl-pos' : 'pnl-neg') + '">' + escapeHtml(formatSignedRubAmount(unrealized)) + '</span>' +
              '<span class="portfolio-total-sub muted">текущая стоимость минус вложено</span>' +
            '</div>'
          : '') +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">С учётом выплат</span>' +
          '<span class="portfolio-total-val' + (pricePlusPayouts != null ? (pricePlusPayouts >= 0 ? ' pnl-pos' : ' pnl-neg') : '') + '">' +
            escapeHtml(pricePlusPayouts != null ? formatSignedPct(pricePlusPayouts, 2) : '—') +
          '</span>' +
          '<span class="portfolio-total-sub muted">оценка к вложенному</span>' +
        '</div>' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Акции</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(stockValue)) + '</span>' +
          '<span class="portfolio-total-sub muted">' + escapeHtml(stockShare.toFixed(1).replace('.', ',') + '% портфеля') + '</span>' +
        '</div>' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Облигации</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(bondValue)) + '</span>' +
          '<span class="portfolio-total-sub muted">' + escapeHtml(bondShare.toFixed(1).replace('.', ',') + '% портфеля') + '</span>' +
        '</div>' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Выплаты за 12 мес.</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(incomeTotals.paid12m)) + '</span>' +
          '<span class="portfolio-total-sub muted">история по текущему количеству</span>' +
        '</div>' +
        '<div class="portfolio-total-card">' +
          '<span class="portfolio-total-lbl">Прогноз на 12 мес.</span>' +
          '<span class="portfolio-total-val">' + escapeHtml(formatPortfolioRubAmount(incomeTotals.forecast12m)) + '</span>' +
          '<span class="portfolio-total-sub muted">расчёт по текущему количеству</span>' +
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
    /* Мягкий sage — ближе к luxury/minimal портфеля */
    var folderColor = '#6a7f70';
    var backColor = '#5a6e61';
    var open = state.folderOpen;

    if (!positions.length) {
      scene.innerHTML =
        '<div class="portfolio-folder-empty">' +
          '<p class="muted portfolio-folder-empty-text">Добавьте бумаги в портфель (кроме индекса IMOEX)</p>' +
        '</div>';
      return;
    }

    var maxTickerLen = positions.reduce(function (max, p) {
      return Math.max(max, String(p.ticker || '').length);
    }, 4);

    var papersHtml = positions.map(function (p, i) {
      var tip = getPaperPnlTitle(p);
      var active = state.chartTicker === p.ticker ? ' paper-active' : '';
      return (
        '<div class="paper paper-' + (i + 1) + active + '" data-ticker="' + escapeHtml(p.ticker) + '" ' +
          'role="button" tabindex="0" ' +
          'aria-label="' + escapeHtml(p.ticker) + (tip ? ', ' + tip : '') + '" ' +
          'aria-pressed="' + (active ? 'true' : 'false') + '">' +
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
        'style="--folder-color:' + folderColor + ';--folder-back-color:' + backColor + '" ' +
        'role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '" ' +
        'aria-label="' + (open ? 'Свернуть бумаги портфеля' : 'Открыть бумаги портфеля') + '">' +
        '<div class="folder__back">' +
          '<div class="folder__front"></div>' +
          '<div class="folder__front right"></div>' +
        '</div>' +
      '</div>';

    initPortfolioPapersMagnet();
  }



  function selectPortfolioTicker(ticker, opts) {
    opts = opts || {};
    ticker = normalizeTicker(ticker);
    if (!findPortfolioPosition(ticker)) return;
    state.chartTicker = ticker;
    state.folderOpen = true;
    var label = document.getElementById('portfolioChartTickerLabel');
    if (label) label.textContent = ticker;
    var sel = document.getElementById('chartTickerSelect');
    if (sel) sel.value = ticker;
    renderPortfolioFolder();
    // Перерисовка аналитики без автоскролла; скролл только при явном выборе бумаги.
    renderPortfolioChart();
    if (opts.scroll === false) return;
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



  function getSaleRealizedPnl(sale, bondMeta) {
    var sell = Number(sale && sale.salePrice);
    if (!isFinite(sell) || sell <= 0) return { amount: null, pct: null };

    var isBond = isPortfolioBondPosition(sale || {});
    var face = isBond ? resolveBondFaceValue(sale, bondMeta) : null;

    if (sale.allocations && sale.allocations.length) {
      var amount = 0;
      var cost = 0;
      sale.allocations.forEach(function (a) {
        var q = Number(a.qty);
        var buy = Number(a.buyPrice);
        var sp = isFinite(Number(a.salePrice)) && Number(a.salePrice) > 0
          ? Number(a.salePrice) : sell;
        if (!isFinite(q) || q <= 0 || !isFinite(buy) || buy <= 0) return;
        if (isBond) {
          var rubPnl = bondRubFromPct(sp - buy, q, face);
          var rubCost = bondRubFromPct(buy, q, face);
          if (rubPnl != null) amount += rubPnl;
          if (rubCost != null) cost += rubCost;
        } else {
          amount += (sp - buy) * q;
          cost += buy * q;
        }
      });
      if (cost <= 0) return { amount: null, pct: null };
      return { amount: amount, pct: (amount / cost) * 100 };
    }

    var q = Number(sale && sale.qty);
    var buy = Number(sale && sale.buyPrice);
    if (!isFinite(q) || q <= 0 || !isFinite(buy) || buy <= 0) {
      return { amount: null, pct: null };
    }
    if (isBond) {
      var bondAmount = bondRubFromPct(sell - buy, q, face);
      var bondCost = bondRubFromPct(buy, q, face);
      if (bondAmount == null || bondCost == null || bondCost <= 0) {
        return { amount: null, pct: null };
      }
      return { amount: bondAmount, pct: (bondAmount / bondCost) * 100 };
    }
    var pnlAmount = (sell - buy) * q;
    return { amount: pnlAmount, pct: ((sell - buy) / buy) * 100 };
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



  function getTotalRealizedPnl(sales, bondMetaMap) {
    bondMetaMap = bondMetaMap || {};
    var total = 0;
    var has = false;
    (sales || []).forEach(function (s) {
      var t = typeof normalizeTicker === 'function' ? normalizeTicker(s.ticker) : String(s.ticker || '').toUpperCase();
      var pnl = getSaleRealizedPnl(s, bondMetaMap[t] || bondMetaMap[s.ticker]);
      if (pnl.amount != null && isFinite(pnl.amount)) {
        total += pnl.amount;
        has = true;
      }
    });
    return has ? total : null;
  }



  function getRemainingCostBasis(lots, bondMetaMap) {
    bondMetaMap = bondMetaMap || {};
    var totalCost = 0;
    var has = false;
    (lots || []).forEach(function (l) {
      var t = typeof normalizeTicker === 'function' ? normalizeTicker(l.ticker) : String(l.ticker || '').toUpperCase();
      var cost = getPositionCostRub(l, bondMetaMap[t] || bondMetaMap[l.ticker]);
      if (cost > 0) {
        totalCost += cost;
        has = true;
      }
    });
    return has ? totalCost : null;
  }

  /**
   * Волна 2.1: read-only сводка истории по тикеру для UI.
   * Не мутирует positions/sales и не пишет в storage.
   * bondMeta — опционально (faceValue для ОФЗ).
   */
  function summarizeTickerHistory(ticker, positions, sales, bondMeta) {
    ticker = typeof normalizeTicker === 'function'
      ? normalizeTicker(ticker)
      : String(ticker || '').trim().toUpperCase();
    var empty = {
      ticker: ticker || '',
      openLots: [],
      sales: [],
      openQty: 0,
      openMarketValueRub: 0,
      openCostRub: 0,
      unrealizedPnlRub: 0,
      realizedPnlRub: 0,
      totalBoughtQty: 0,
      totalSoldQty: 0,
      saleCount: 0,
      lotCount: 0
    };
    if (!ticker) return empty;

    var openLots = (positions || []).filter(function (p) {
      if ((typeof normalizeTicker === 'function' ? normalizeTicker(p.ticker) : String(p.ticker || '').toUpperCase()) !== ticker) {
        return false;
      }
      var q = Number(p.qty);
      return isFinite(q) && q > 1e-9;
    });
    var tickerSales = (sales || []).filter(function (s) {
      return (typeof normalizeTicker === 'function' ? normalizeTicker(s.ticker) : String(s.ticker || '').toUpperCase()) === ticker;
    });

    var openQty = 0;
    var openCostRub = 0;
    var openMarketValueRub = 0;
    openLots.forEach(function (lot) {
      var q = Number(lot.qty);
      if (isFinite(q) && q > 0) openQty += q;
      openCostRub += getPositionCostRub(lot, bondMeta);
      openMarketValueRub += getPositionMarketValue(lot, bondMeta);
    });

    var totalSoldQty = 0;
    var realizedPnlRub = 0;
    tickerSales.forEach(function (sale) {
      var q = Number(sale.qty);
      if (isFinite(q) && q > 0) totalSoldQty += q;
      var pnl = getSaleRealizedPnl(sale, bondMeta);
      if (pnl.amount != null && isFinite(pnl.amount)) realizedPnlRub += pnl.amount;
    });

    return {
      ticker: ticker,
      openLots: openLots,
      sales: tickerSales,
      openQty: openQty,
      openMarketValueRub: openMarketValueRub,
      openCostRub: openCostRub,
      unrealizedPnlRub: openMarketValueRub - openCostRub,
      realizedPnlRub: realizedPnlRub,
      totalBoughtQty: openQty + totalSoldQty,
      totalSoldQty: totalSoldQty,
      saleCount: tickerSales.length,
      lotCount: openLots.length
    };
  }

  function timelineIsoDate(raw) {
    if (typeof normalizePortfolioDate === 'function') {
      return normalizePortfolioDate(raw) || '';
    }
    var s = String(raw == null ? '' : raw).trim();
    if (!s || /^invalid\b/i.test(s) || s === 'Invalid Date') return '';
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
      var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (!m) return '';
      return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    }
    return '';
  }

  function timelinePriceKey(price) {
    var n = Number(price);
    if (!isFinite(n)) return '';
    return String(Math.round(n * 1e6) / 1e6);
  }

  function computeTimelineAmountRub(ticker, qty, price, faceHint, bondMeta) {
    var q = Number(qty);
    var p = Number(price);
    if (!isFinite(q) || q <= 0 || !isFinite(p) || p < 0) return null;
    var entity = { ticker: ticker, qty: q, avgPrice: p };
    if (faceHint != null && isFinite(Number(faceHint)) && Number(faceHint) > 0) {
      entity.faceValue = Number(faceHint);
    }
    if (isPortfolioBondPosition(entity)) {
      var rub = bondRubFromPct(p, q, resolveBondFaceValue(entity, bondMeta));
      return rub != null ? rub : null;
    }
    return q * p;
  }

  /**
   * Read-only хронология покупок/продаж по тикеру.
   * Восстанавливает представление из positions + sales (включая allocations).
   * Не мутирует JSON, не создаёт transactions[], не додумывает недостающие поля.
   */
  function buildTickerOperationTimeline(ticker, positions, sales, bondMeta) {
    ticker = typeof normalizeTicker === 'function'
      ? normalizeTicker(ticker)
      : String(ticker || '').trim().toUpperCase();
    if (!ticker) return [];

    var RECONSTRUCTED_NOTE = 'история восстановлена по доступным данным';
    var isBond = isPortfolioBondPosition({ ticker: ticker });
    var seq = 0;
    var groups = [];
    var groupByKey = {};

    function fallbackBuyKey(date, price, source, face) {
      var dk = date || '';
      var pk = timelinePriceKey(price);
      if (!dk && !pk) return '';
      return 'fb:' + ticker + '|' + dk + '|' + pk + '|' + (source || '') + '|' +
        (face != null && isFinite(Number(face)) ? String(Number(face)) : '');
    }

    function getOrCreateGroup(key, seed) {
      seed = seed || {};
      if (key && groupByKey[key]) return groupByKey[key];
      var g = {
        key: key || ('uniq:buy:' + seq),
        lotId: seed.lotId ? String(seed.lotId) : '',
        date: '',
        source: '',
        fee: null,
        faceValue: null,
        openQty: 0,
        soldQty: 0,
        remainingPrice: null,
        allocParts: [],
        quality: 'ok',
        note: '',
        _seq: seq++
      };
      groups.push(g);
      if (key) groupByKey[key] = g;
      return g;
    }

    function takeFace(entity) {
      if (!entity) return null;
      var f = entity.faceValue;
      if (f != null && isFinite(Number(f)) && Number(f) > 0) return Number(f);
      return null;
    }

    (positions || []).forEach(function (lot) {
      if (!lot) return;
      var t = typeof normalizeTicker === 'function'
        ? normalizeTicker(lot.ticker)
        : String(lot.ticker || '').toUpperCase();
      if (t !== ticker) return;
      var q = Number(lot.qty);
      if (!isFinite(q) || q <= 1e-9) return;
      var lotId = lot.lotId ? String(lot.lotId) : '';
      var date = timelineIsoDate(lot.buyDate);
      var price = Number(lot.avgPrice);
      var source = lot.source ? String(lot.source) : '';
      var face = takeFace(lot);
      var key = lotId ? ('lot:' + lotId) : fallbackBuyKey(date, price, source, face);
      var g = getOrCreateGroup(key, { lotId: lotId });
      g.openQty += q;
      if (lotId && !g.lotId) g.lotId = lotId;
      if (date && !g.date) g.date = date;
      if (source && !g.source) g.source = source;
      if (g.fee == null && lot.fee != null && isFinite(Number(lot.fee))) g.fee = Number(lot.fee);
      if (g.faceValue == null && face != null) g.faceValue = face;
      if (isFinite(price)) g.remainingPrice = price;
    });

    (sales || []).forEach(function (sale) {
      if (!sale) return;
      var t = typeof normalizeTicker === 'function'
        ? normalizeTicker(sale.ticker)
        : String(sale.ticker || '').toUpperCase();
      if (t !== ticker) return;
      var saleFace = takeFace(sale);
      if (sale.allocations && sale.allocations.length) {
        sale.allocations.forEach(function (alloc) {
          if (!alloc) return;
          var aq = Number(alloc.qty);
          if (!isFinite(aq) || aq <= 1e-9) return;
          var lotId = alloc.lotId ? String(alloc.lotId) : '';
          var date = timelineIsoDate(alloc.buyDate);
          var price = Number(alloc.buyPrice);
          var face = takeFace(alloc) != null ? takeFace(alloc) : saleFace;
          var key = lotId ? ('lot:' + lotId) : fallbackBuyKey(date, price, '', face);
          var g = getOrCreateGroup(key, { lotId: lotId });
          g.soldQty += aq;
          if (lotId && !g.lotId) g.lotId = lotId;
          if (date && !g.date) g.date = date;
          if (g.faceValue == null && face != null) g.faceValue = face;
          g.allocParts.push({
            qty: aq,
            price: isFinite(price) ? price : null
          });
        });
        return;
      }
      var saleLotId = sale.lotId ? String(sale.lotId) : '';
      if (!saleLotId) return;
      var sq = Number(sale.qty);
      if (!isFinite(sq) || sq <= 1e-9) return;
      var sDate = timelineIsoDate(sale.buyDate);
      var sPrice = Number(sale.buyPrice);
      var key = 'lot:' + saleLotId;
      var g = getOrCreateGroup(key, { lotId: saleLotId });
      g.soldQty += sq;
      if (sDate && !g.date) g.date = sDate;
      if (g.faceValue == null && saleFace != null) g.faceValue = saleFace;
      if (isFinite(sPrice)) {
        g.allocParts.push({ qty: sq, price: sPrice });
      }
    });

    var ops = [];
    groups.forEach(function (g) {
      var qty = g.openQty + g.soldQty;
      if (!(qty > 1e-9)) return;

      var allocPrices = [];
      var allocCost = 0;
      var allocQty = 0;
      g.allocParts.forEach(function (part) {
        if (part.price == null || !isFinite(part.price)) return;
        allocPrices.push(Math.round(part.price * 1e6) / 1e6);
        allocCost += part.price * part.qty;
        allocQty += part.qty;
      });
      var uniqueAlloc = [];
      allocPrices.forEach(function (p) {
        if (uniqueAlloc.indexOf(p) === -1) uniqueAlloc.push(p);
      });

      var price = null;
      if (uniqueAlloc.length === 1) {
        price = uniqueAlloc[0];
      } else if (uniqueAlloc.length > 1) {
        price = allocQty > 0 ? allocCost / allocQty : null;
        g.quality = 'partial';
        g.note = RECONSTRUCTED_NOTE;
      } else if (g.remainingPrice != null && isFinite(g.remainingPrice)) {
        price = g.remainingPrice;
      }

      if (!g.lotId || (g.key && g.key.indexOf('fb:') === 0)) {
        g.quality = 'partial';
        g.note = RECONSTRUCTED_NOTE;
      }

      var faceHint = g.faceValue;
      ops.push({
        type: 'buy',
        date: g.date || '',
        ticker: ticker,
        qty: qty,
        price: price,
        amountRub: computeTimelineAmountRub(ticker, qty, price, faceHint, bondMeta),
        fee: g.fee,
        source: g.source || '',
        lotId: g.lotId || '',
        saleId: '',
        realizedPnlRub: null,
        realizedPnlPct: null,
        remainingQtyAfter: null,
        note: g.note || '',
        quality: g.quality,
        isBond: isBond,
        _seq: g._seq
      });
    });

    (sales || []).forEach(function (sale) {
      if (!sale) return;
      var t = typeof normalizeTicker === 'function'
        ? normalizeTicker(sale.ticker)
        : String(sale.ticker || '').toUpperCase();
      if (t !== ticker) return;
      var q = Number(sale.qty);
      var salePx = Number(sale.salePrice);
      var pnl = getSaleRealizedPnl(sale, bondMeta);
      var fee = sale.fee != null && isFinite(Number(sale.fee)) ? Number(sale.fee) : null;
      var faceHint = takeFace(sale);
      ops.push({
        type: 'sell',
        date: timelineIsoDate(sale.saleDate),
        ticker: ticker,
        qty: isFinite(q) && q > 0 ? q : null,
        price: isFinite(salePx) ? salePx : null,
        amountRub: computeTimelineAmountRub(
          ticker,
          isFinite(q) && q > 0 ? q : null,
          isFinite(salePx) ? salePx : null,
          faceHint,
          bondMeta
        ),
        fee: fee,
        source: sale.source ? String(sale.source) : '',
        lotId: sale.lotId ? String(sale.lotId) : '',
        saleId: sale.saleId ? String(sale.saleId) : '',
        realizedPnlRub: pnl && pnl.amount != null && isFinite(pnl.amount) ? pnl.amount : null,
        realizedPnlPct: pnl && pnl.pct != null && isFinite(pnl.pct) ? pnl.pct : null,
        remainingQtyAfter: null,
        note: '',
        quality: 'ok',
        isBond: isBond,
        _seq: seq++
      });
    });

    ops.sort(function (a, b) {
      var da = a.date || '';
      var db = b.date || '';
      if (!da && !db) {
        if (a.type !== b.type) return a.type === 'buy' ? -1 : 1;
        return a._seq - b._seq;
      }
      if (!da) return 1;
      if (!db) return -1;
      if (da !== db) return da < db ? -1 : 1;
      if (a.type !== b.type) return a.type === 'buy' ? -1 : 1;
      return a._seq - b._seq;
    });

    var openQty = 0;
    (positions || []).forEach(function (lot) {
      if (!lot) return;
      var t = typeof normalizeTicker === 'function'
        ? normalizeTicker(lot.ticker)
        : String(lot.ticker || '').toUpperCase();
      if (t !== ticker) return;
      var q = Number(lot.qty);
      if (isFinite(q) && q > 0) openQty += q;
    });

    var remaining = 0;
    var remainingOk = true;
    ops.forEach(function (op) {
      var q = Number(op.qty);
      if (!remainingOk || op.qty == null || !isFinite(q) || q < 0) {
        remainingOk = false;
        return;
      }
      if (op.type === 'buy') remaining += q;
      else remaining -= q;
      if (remaining < -1e-6) remainingOk = false;
    });
    if (remainingOk && Math.abs(remaining - openQty) > 1e-6) remainingOk = false;

    if (remainingOk) {
      remaining = 0;
      ops.forEach(function (op) {
        var q = Number(op.qty);
        if (op.type === 'buy') remaining += q;
        else remaining -= q;
        op.remainingQtyAfter = remaining;
      });
    }

    return ops.map(function (op) {
      return {
        type: op.type,
        date: op.date,
        ticker: op.ticker,
        qty: op.qty,
        price: op.price,
        amountRub: op.amountRub,
        fee: op.fee,
        source: op.source,
        lotId: op.lotId,
        saleId: op.saleId,
        realizedPnlRub: op.realizedPnlRub,
        realizedPnlPct: op.realizedPnlPct,
        remainingQtyAfter: op.remainingQtyAfter,
        note: op.note,
        quality: op.quality,
        isBond: op.isBond
      };
    });
  }

  var ASOF_SKIP_TICKERS = { IMOEX: true, MOEX: true, INDEX: true };
  var ASOF_INCOMPLETE_NOTE = 'часть операций без корректной даты не включена в расчёт';
  var ASOF_LOTS_NOTE = 'надёжно распределить продажи по лотам нельзя';

  function asOfNormTicker(ticker) {
    return typeof normalizeTicker === 'function'
      ? normalizeTicker(ticker)
      : String(ticker || '').trim().toUpperCase();
  }

  function asOfRoundQty(n) {
    if (n == null || !isFinite(Number(n))) return 0;
    return Math.round(Number(n) * 1e8) / 1e8;
  }

  function asOfTakeFace(entity) {
    if (!entity) return null;
    var f = entity.faceValue;
    if (f != null && isFinite(Number(f)) && Number(f) > 0) return Number(f);
    return null;
  }

  /**
   * Группы покупок (оригинальный qty = остаток + проданное через allocations).
   * Read-only, lotId не выдумывается.
   */
  function reconstructTickerBuyGroups(ticker, positions, sales) {
    ticker = asOfNormTicker(ticker);
    var seq = 0;
    var groups = [];
    var groupByKey = {};

    function fallbackBuyKey(date, price, source, face) {
      var dk = date || '';
      var pk = timelinePriceKey(price);
      if (!dk && !pk) return '';
      return 'fb:' + ticker + '|' + dk + '|' + pk + '|' + (source || '') + '|' +
        (face != null && isFinite(Number(face)) ? String(Number(face)) : '');
    }

    function getOrCreateGroup(key, seed) {
      seed = seed || {};
      if (key && groupByKey[key]) return groupByKey[key];
      var g = {
        key: key || ('uniq:buy:' + seq),
        lotId: seed.lotId ? String(seed.lotId) : '',
        date: '',
        source: '',
        faceValue: null,
        openQty: 0,
        soldAllQty: 0,
        soldUpToDate: 0,
        remainingPrice: null,
        allocPrices: [],
        _seq: seq++
      };
      groups.push(g);
      if (key) groupByKey[key] = g;
      return g;
    }

    function findGroup(lotId, date, price, face) {
      if (lotId) {
        var byLot = groupByKey['lot:' + lotId];
        if (byLot) return byLot;
      }
      var fb = fallbackBuyKey(date, price, '', face);
      if (fb && groupByKey[fb]) return groupByKey[fb];
      return null;
    }

    (positions || []).forEach(function (lot) {
      if (!lot) return;
      if (asOfNormTicker(lot.ticker) !== ticker) return;
      var q = Number(lot.qty);
      if (!isFinite(q) || q <= 1e-9) return;
      var lotId = lot.lotId ? String(lot.lotId) : '';
      var date = timelineIsoDate(lot.buyDate);
      var price = Number(lot.avgPrice);
      var source = lot.source ? String(lot.source) : '';
      var face = asOfTakeFace(lot);
      var key = lotId ? ('lot:' + lotId) : fallbackBuyKey(date, price, source, face);
      var g = getOrCreateGroup(key, { lotId: lotId });
      g.openQty += q;
      if (lotId && !g.lotId) g.lotId = lotId;
      if (date && !g.date) g.date = date;
      if (source && !g.source) g.source = source;
      if (g.faceValue == null && face != null) g.faceValue = face;
      if (isFinite(price)) g.remainingPrice = price;
    });

    (sales || []).forEach(function (sale) {
      if (!sale) return;
      if (asOfNormTicker(sale.ticker) !== ticker) return;
      var saleFace = asOfTakeFace(sale);
      if (sale.allocations && sale.allocations.length) {
        sale.allocations.forEach(function (alloc) {
          if (!alloc) return;
          var aq = Number(alloc.qty);
          if (!isFinite(aq) || aq <= 1e-9) return;
          var lotId = alloc.lotId ? String(alloc.lotId) : '';
          var date = timelineIsoDate(alloc.buyDate);
          var price = Number(alloc.buyPrice);
          var face = asOfTakeFace(alloc) != null ? asOfTakeFace(alloc) : saleFace;
          var key = lotId ? ('lot:' + lotId) : fallbackBuyKey(date, price, '', face);
          var g = getOrCreateGroup(key, { lotId: lotId });
          g.soldAllQty += aq;
          if (lotId && !g.lotId) g.lotId = lotId;
          if (date && !g.date) g.date = date;
          if (g.faceValue == null && face != null) g.faceValue = face;
          if (isFinite(price)) g.allocPrices.push(price);
        });
        return;
      }
      var saleLotId = sale.lotId ? String(sale.lotId) : '';
      if (!saleLotId) return;
      var sq = Number(sale.qty);
      if (!isFinite(sq) || sq <= 1e-9) return;
      var sDate = timelineIsoDate(sale.buyDate);
      var sPrice = Number(sale.buyPrice);
      var g = getOrCreateGroup('lot:' + saleLotId, { lotId: saleLotId });
      g.soldAllQty += sq;
      if (sDate && !g.date) g.date = sDate;
      if (g.faceValue == null && saleFace != null) g.faceValue = saleFace;
      if (isFinite(sPrice)) g.allocPrices.push(sPrice);
    });

    groups.forEach(function (g) {
      var price = null;
      if (g.allocPrices.length) {
        var uniq = [];
        var cost = 0;
        var q = 0;
        g.allocPrices.forEach(function (p) {
          var r = Math.round(p * 1e6) / 1e6;
          if (uniq.indexOf(r) === -1) uniq.push(r);
        });
        if (uniq.length === 1) price = uniq[0];
        else {
          g.allocPrices.forEach(function (p, i) {
            cost += p;
            q += 1;
          });
          price = q > 0 ? cost / q : null;
        }
      }
      if (price == null && g.remainingPrice != null && isFinite(g.remainingPrice)) {
        price = g.remainingPrice;
      }
      g.avgPrice = price;
      g.originalQty = asOfRoundQty(g.openQty + g.soldAllQty);
    });

    return { groups: groups, findGroup: findGroup };
  }

  function applyDatedSalesToGroups(ticker, sales, targetIso, reconstructed) {
    var incomplete = false;
    var lotsReliable = true;
    ticker = asOfNormTicker(ticker);

    (sales || []).forEach(function (sale) {
      if (!sale || asOfNormTicker(sale.ticker) !== ticker) return;
      var saleDate = timelineIsoDate(sale.saleDate);
      if (!saleDate) {
        incomplete = true;
        return;
      }
      if (saleDate > targetIso) return;

      if (sale.allocations && sale.allocations.length) {
        sale.allocations.forEach(function (alloc) {
          if (!alloc) return;
          var aq = Number(alloc.qty);
          if (!isFinite(aq) || aq <= 1e-9) return;
          var lotId = alloc.lotId ? String(alloc.lotId) : '';
          var date = timelineIsoDate(alloc.buyDate);
          var price = Number(alloc.buyPrice);
          var face = asOfTakeFace(alloc) != null ? asOfTakeFace(alloc) : asOfTakeFace(sale);
          var g = reconstructed.findGroup(lotId, date, price, face);
          if (g) g.soldUpToDate += aq;
          else lotsReliable = false;
        });
        return;
      }

      var q = Number(sale.qty);
      if (!isFinite(q) || q <= 1e-9) return;
      if (sale.lotId) {
        var gLot = reconstructed.findGroup(String(sale.lotId), '', NaN, null);
        if (gLot) gLot.soldUpToDate += q;
        else lotsReliable = false;
        return;
      }
      lotsReliable = false;
    });

    return { incomplete: incomplete, lotsReliable: lotsReliable };
  }

  /**
   * Read-only состав портфеля на дату (qty, без стоимости и рыночных цен).
   * portfolio: { positions, sales } или массив positions (+ options.sales).
   */
  function buildPortfolioCompositionAtDate(portfolio, targetDate, options) {
    options = options || {};
    var positions = [];
    var sales = [];
    if (Array.isArray(portfolio)) {
      positions = portfolio;
      sales = options.sales || [];
    } else if (portfolio && typeof portfolio === 'object') {
      positions = portfolio.positions || [];
      sales = portfolio.sales || options.sales || [];
    }
    var bondMetaMap = options.bondMetaMap || {};
    var iso = timelineIsoDate(targetDate);
    var empty = {
      targetDate: iso,
      invalidDate: !iso,
      hasIncompleteHistory: false,
      notes: [],
      items: []
    };
    if (!iso) return empty;

    var tickers = {};
    function addTicker(raw) {
      var t = asOfNormTicker(raw);
      if (!t || ASOF_SKIP_TICKERS[t]) return;
      tickers[t] = true;
    }
    (positions || []).forEach(function (p) { if (p) addTicker(p.ticker); });
    (sales || []).forEach(function (s) { if (s) addTicker(s.ticker); });

    var items = [];
    var anyIncomplete = false;
    var globalNotes = [];

    Object.keys(tickers).sort().forEach(function (ticker) {
      var bondMeta = bondMetaMap[ticker] || null;
      var ops = buildTickerOperationTimeline(ticker, positions, sales, bondMeta);
      var boughtQty = 0;
      var soldQty = 0;
      var firstBuyDate = '';
      var lastOperationDate = '';
      var incomplete = false;
      var notes = [];

      ops.forEach(function (op) {
        var d = timelineIsoDate(op.date);
        if (!d) {
          incomplete = true;
          return;
        }
        if (d > iso) return;
        var q = Number(op.qty);
        if (op.qty == null || !isFinite(q) || q < 0) {
          incomplete = true;
          return;
        }
        if (op.type === 'buy') {
          boughtQty += q;
          if (!firstBuyDate || d < firstBuyDate) firstBuyDate = d;
        } else if (op.type === 'sell') {
          soldQty += q;
        }
        if (!lastOperationDate || d > lastOperationDate) lastOperationDate = d;
      });

      var reconstructed = reconstructTickerBuyGroups(ticker, positions, sales);
      var applied = applyDatedSalesToGroups(ticker, sales, iso, reconstructed);
      if (applied.incomplete) incomplete = true;

      var openLotsAtDate = [];
      reconstructed.groups.forEach(function (g) {
        var originalQty = asOfRoundQty(g.originalQty);
        if (!(originalQty > 1e-9)) return;
        var buyDate = g.date || '';
        if (!buyDate) {
          incomplete = true;
          return;
        }
        if (buyDate > iso) return;
        var soldUp = asOfRoundQty(g.soldUpToDate);
        var qtyAtLot = asOfRoundQty(originalQty - soldUp);
        if (qtyAtLot < 0 && qtyAtLot > -1e-6) qtyAtLot = 0;
        if (qtyAtLot <= 1e-9) return;
        var lotIncomplete = !applied.lotsReliable || (!g.lotId && g.key && String(g.key).indexOf('fb:') === 0);
        openLotsAtDate.push({
          lotId: g.lotId || '',
          buyDate: buyDate,
          qtyAtDate: qtyAtLot,
          originalQty: originalQty,
          soldQtyUpToDate: soldUp,
          avgPrice: g.avgPrice != null && isFinite(g.avgPrice) ? g.avgPrice : null,
          faceValue: g.faceValue,
          source: g.source || '',
          hasIncompleteHistory: !!lotIncomplete
        });
      });
      openLotsAtDate.sort(function (a, b) {
        if (a.buyDate !== b.buyDate) return a.buyDate < b.buyDate ? -1 : 1;
        return String(a.lotId).localeCompare(String(b.lotId));
      });

      boughtQty = asOfRoundQty(boughtQty);
      soldQty = asOfRoundQty(soldQty);
      var qtyAtDate = asOfRoundQty(boughtQty - soldQty);
      if (qtyAtDate < 0 && qtyAtDate > -1e-6) qtyAtDate = 0;

      if (incomplete) {
        anyIncomplete = true;
        notes.push(ASOF_INCOMPLETE_NOTE);
      }
      if (!applied.lotsReliable) {
        notes.push(ASOF_LOTS_NOTE);
      }

      if (!(qtyAtDate > 1e-9)) return;

      var sample = null;
      (positions || []).some(function (p) {
        if (p && asOfNormTicker(p.ticker) === ticker) { sample = p; return true; }
        return false;
      });
      if (!sample) {
        (sales || []).some(function (s) {
          if (s && asOfNormTicker(s.ticker) === ticker) { sample = s; return true; }
          return false;
        });
      }
      var name = '';
      if (typeof getTickerSubtitle === 'function') {
        try { name = getTickerSubtitle(ticker) || ''; } catch (e) { name = ''; }
      }
      var isBond = isPortfolioBondPosition({ ticker: ticker });
      var market = sample && sample.market ? String(sample.market) : '';
      items.push({
        ticker: ticker,
        name: name || ticker,
        type: isBond ? 'bond' : (sample ? 'stock' : ''),
        market: market,
        qtyAtDate: qtyAtDate,
        openLotsAtDate: openLotsAtDate,
        boughtQtyUpToDate: boughtQty,
        soldQtyUpToDate: soldQty,
        firstBuyDate: firstBuyDate,
        lastOperationDate: lastOperationDate,
        hasIncompleteHistory: incomplete || !applied.lotsReliable,
        notes: notes
      });
    });

    if (anyIncomplete) globalNotes.push(ASOF_INCOMPLETE_NOTE);

    return {
      targetDate: iso,
      invalidDate: false,
      hasIncompleteHistory: anyIncomplete,
      notes: globalNotes,
      items: items
    };
  }

  var ASOF_PREV_CLOSE_NOTE_PREFIX = 'Использована цена закрытия на ближайшую предыдущую торговую дату: ';
  var ASOF_OFZ_CLEAN_NOTE = 'без исторического НКД';
  var ASOF_MISSING_PRICE_NOTE = 'Нет цены закрытия на дату';
  var ASOF_UNSUPPORTED_NOTE = 'Инструмент пока не поддерживается';

  function asOfRoundRub(n) {
    if (n == null || !isFinite(Number(n))) return null;
    return Math.round(Number(n) * 100) / 100;
  }

  function asOfIsoToRu(iso) {
    var n = timelineIsoDate(iso);
    if (!n || n.length < 10) return '';
    return n.slice(8, 10) + '.' + n.slice(5, 7) + '.' + n.slice(0, 4);
  }

  function asOfFaceValueForItem(item, bondMeta) {
    var lots = item && item.openLotsAtDate ? item.openLotsAtDate : [];
    var i;
    for (i = 0; i < lots.length; i++) {
      var fromLot = asOfTakeFace(lots[i]);
      if (fromLot) return resolveBondFaceValue({ ticker: item.ticker, faceValue: fromLot }, bondMeta);
    }
    return resolveBondFaceValue({ ticker: item && item.ticker }, bondMeta);
  }

  function asOfPriceMetaForItem(item) {
    var meta = {};
    if (item && item.type === 'bond') {
      meta.type = 'ofz';
      meta.board = 'TQOB';
    } else if (item && item.type === 'stock') {
      meta.type = 'stock';
    }
    return meta;
  }

  function asOfFetchPriceAtDate(ticker, targetDate, meta, options) {
    if (options && typeof options.getInstrumentPriceAtDate === 'function') {
      return Promise.resolve(options.getInstrumentPriceAtDate(ticker, targetDate, meta, options));
    }
    var priceOpts = {};
    if (options && options.historyByTicker && options.historyByTicker[ticker]) {
      priceOpts.history = options.historyByTicker[ticker];
    }
    if (typeof getInstrumentPriceAtDate === 'function') {
      return Promise.resolve(getInstrumentPriceAtDate(ticker, targetDate, meta, priceOpts));
    }
    return Promise.resolve({
      ticker: ticker,
      requestedDate: targetDate,
      price: null,
      priceDate: null,
      status: 'missing',
      note: ASOF_MISSING_PRICE_NOTE
    });
  }

  function asOfValueFromPrice(item, priceRes, faceValue) {
    var qty = Number(item && item.qtyAtDate);
    var status = priceRes && priceRes.status ? String(priceRes.status) : 'missing';
    if (status === 'invalid-date') status = 'missing';
    var price = priceRes && priceRes.price != null ? Number(priceRes.price) : null;
    var unit = priceRes && priceRes.unit ? String(priceRes.unit) : '';
    var isBond = !!(item && item.type === 'bond');
    var valueRub = null;

    if (status === 'ok' && price != null && isFinite(price) && qty > 0) {
      if (isBond) {
        if (unit === 'pct-of-face-value') {
          valueRub = bondRubFromPct(price, qty, faceValue);
        } else {
          status = 'missing';
        }
      } else if (unit === 'rub' || !unit) {
        valueRub = qty * price;
      } else if (unit === 'pct-of-face-value') {
        status = 'missing';
      }
    }

    if (status === 'ok' && (valueRub == null || !isFinite(valueRub))) {
      status = 'missing';
      valueRub = null;
    }
    if (status === 'ok') valueRub = asOfRoundRub(valueRub);
    else valueRub = null;

    return { status: status, valueRub: valueRub, price: status === 'ok' ? price : null, unit: unit };
  }

  /**
   * Read-only оценка портфеля на дату (qty × CLOSE / % номинала).
   * Не пишет в JSON, не использует LAST, live-хвост и цену покупки.
   */
  function buildPortfolioValueAtDate(portfolio, targetDate, options) {
    options = options || {};
    var iso = timelineIsoDate(targetDate);
    var empty = {
      targetDate: iso,
      invalidDate: !iso,
      totalValueRub: iso ? 0 : null,
      pricedValueRub: iso ? 0 : null,
      missingValueRub: null,
      pricedItemsCount: 0,
      missingItemsCount: 0,
      unsupportedItemsCount: 0,
      hasIncompleteHistory: false,
      isPartial: false,
      notes: [],
      items: []
    };
    if (!iso) return Promise.resolve(empty);

    var composition = options.composition;
    if (!composition) {
      composition = buildPortfolioCompositionAtDate(portfolio, iso, options);
    }
    if (!composition || composition.invalidDate) {
      empty.invalidDate = true;
      empty.totalValueRub = null;
      empty.pricedValueRub = null;
      empty.targetDate = composition && composition.targetDate ? composition.targetDate : iso;
      return Promise.resolve(empty);
    }

    var bondMetaMap = options.bondMetaMap || {};
    var sourceItems = composition.items || [];
    if (!sourceItems.length) {
      return Promise.resolve({
        targetDate: iso,
        invalidDate: false,
        totalValueRub: 0,
        pricedValueRub: 0,
        missingValueRub: null,
        pricedItemsCount: 0,
        missingItemsCount: 0,
        unsupportedItemsCount: 0,
        hasIncompleteHistory: !!composition.hasIncompleteHistory,
        isPartial: false,
        notes: (composition.notes || []).slice(),
        items: []
      });
    }

    var jobs = sourceItems.map(function (compItem) {
      var ticker = compItem.ticker;
      var meta = asOfPriceMetaForItem(compItem);
      var bondMeta = bondMetaMap[ticker] || null;
      var faceValue = (compItem.type === 'bond') ? asOfFaceValueForItem(compItem, bondMeta) : null;
      return asOfFetchPriceAtDate(ticker, iso, meta, options).then(function (priceRes) {
        priceRes = priceRes || {};
        var mapped = asOfValueFromPrice(compItem, priceRes, faceValue);
        var notes = [];
        (compItem.notes || []).forEach(function (n) {
          if (n && notes.indexOf(n) < 0) notes.push(n);
        });
        if (mapped.status === 'ok' && priceRes.priceDate && priceRes.priceDate !== iso) {
          var ru = asOfIsoToRu(priceRes.priceDate);
          notes.push(ASOF_PREV_CLOSE_NOTE_PREFIX + (ru || priceRes.priceDate));
        }
        if (mapped.status === 'ok' && compItem.type === 'bond') {
          notes.push(ASOF_OFZ_CLEAN_NOTE);
        }
        if (mapped.status === 'missing') notes.push(ASOF_MISSING_PRICE_NOTE);
        if (mapped.status === 'unsupported') notes.push(ASOF_UNSUPPORTED_NOTE);

        return {
          ticker: ticker,
          name: compItem.name || ticker,
          type: compItem.type || '',
          market: compItem.market || '',
          qtyAtDate: compItem.qtyAtDate,
          boughtQtyUpToDate: compItem.boughtQtyUpToDate,
          soldQtyUpToDate: compItem.soldQtyUpToDate,
          firstBuyDate: compItem.firstBuyDate,
          lastOperationDate: compItem.lastOperationDate,
          openLotsAtDate: compItem.openLotsAtDate,
          hasIncompleteHistory: !!compItem.hasIncompleteHistory,
          price: mapped.price,
          priceDate: mapped.status === 'ok' ? (priceRes.priceDate || null) : null,
          priceType: mapped.status === 'ok' ? (priceRes.priceType || 'close') : null,
          unit: mapped.status === 'ok' ? (mapped.unit || priceRes.unit || null) : (priceRes.unit || null),
          faceValue: faceValue,
          valueRub: mapped.valueRub,
          status: mapped.status,
          note: notes.join('; '),
          notes: notes
        };
      });
    });

    return Promise.all(jobs).then(function (items) {
      var priced = 0;
      var missing = 0;
      var unsupported = 0;
      var total = 0;
      items.forEach(function (row) {
        if (row.status === 'ok') {
          priced += 1;
          total += Number(row.valueRub) || 0;
        } else if (row.status === 'unsupported') unsupported += 1;
        else missing += 1;
      });
      total = asOfRoundRub(total);
      var notes = (composition.notes || []).slice();
      if (missing > 0) {
        notes.push('Оценка рассчитана частично: по ' + missing + ' ' +
          (missing === 1 ? 'бумаге' : 'бумагам') + ' нет цены на выбранную дату');
      }
      if (unsupported > 0) {
        notes.push('Некоторые инструменты пока не поддерживаются для оценки на дату');
      }
      return {
        targetDate: iso,
        invalidDate: false,
        totalValueRub: total,
        pricedValueRub: total,
        missingValueRub: null,
        pricedItemsCount: priced,
        missingItemsCount: missing,
        unsupportedItemsCount: unsupported,
        hasIncompleteHistory: !!composition.hasIncompleteHistory,
        isPartial: (missing + unsupported) > 0,
        notes: notes,
        items: items
      };
    });
  }

  function asOfUniqueNotes(lists) {
    var out = [];
    var seen = {};
    (lists || []).forEach(function (list) {
      (list || []).forEach(function (n) {
        var t = String(n || '').trim();
        if (!t || seen[t]) return;
        seen[t] = true;
        out.push(t);
      });
    });
    return out;
  }

  /**
   * Детализация сравнения: объединяет тикеры двух оценок.
   * Нет позиции → qty/value 0; нет CLOSE → value/change null, без подстановки LAST.
   */
  function buildPortfolioValueChangeDetails(fromResult, toResult) {
    var map = {};
    var order = [];
    function take(row, side) {
      if (!row) return;
      var ticker = String(row.ticker || '').trim();
      if (!ticker) return;
      var key = ticker.toUpperCase();
      if (!map[key]) {
        map[key] = {
          ticker: ticker,
          name: row.name || ticker,
          type: row.type || '',
          fromPresent: false,
          toPresent: false,
          qtyFrom: 0,
          qtyTo: 0,
          valueFrom: 0,
          valueTo: 0,
          notes: []
        };
        order.push(key);
      }
      var rec = map[key];
      if (row.name && rec.name === rec.ticker) rec.name = row.name;
      if (row.type && !rec.type) rec.type = row.type;
      var ok = row.status === 'ok' && row.valueRub != null && isFinite(Number(row.valueRub));
      var qty = row.qtyAtDate;
      if (side === 'from') {
        rec.fromPresent = true;
        rec.qtyFrom = qty;
        rec.valueFrom = ok ? Number(row.valueRub) : null;
      } else {
        rec.toPresent = true;
        rec.qtyTo = qty;
        rec.valueTo = ok ? Number(row.valueRub) : null;
      }
      if (row.status === 'missing') rec.notes.push(ASOF_MISSING_PRICE_NOTE);
      if (row.status === 'unsupported') rec.notes.push(ASOF_UNSUPPORTED_NOTE);
    }
    ((fromResult && fromResult.items) || []).forEach(function (row) { take(row, 'from'); });
    ((toResult && toResult.items) || []).forEach(function (row) { take(row, 'to'); });
    return order.map(function (key) {
      var rec = map[key];
      if (!rec.fromPresent) {
        rec.qtyFrom = 0;
        rec.valueFrom = 0;
      }
      if (!rec.toPresent) {
        rec.qtyTo = 0;
        rec.valueTo = 0;
      }
      var canDiff = rec.valueFrom != null && rec.valueTo != null &&
        isFinite(Number(rec.valueFrom)) && isFinite(Number(rec.valueTo));
      return {
        ticker: rec.ticker,
        name: rec.name,
        type: rec.type,
        qtyFrom: rec.qtyFrom,
        qtyTo: rec.qtyTo,
        valueFrom: rec.valueFrom,
        valueTo: rec.valueTo,
        changeRub: canDiff ? asOfRoundRub(Number(rec.valueTo) - Number(rec.valueFrom)) : null,
        note: asOfUniqueNotes([rec.notes]).join('; ')
      };
    });
  }

  /**
   * Read-only сравнение оценочной стоимости между двумя датами.
   * changeRub = to.totalValueRub − from.totalValueRub; не доходность и не разложение причин.
   */
  function buildPortfolioValueChangeBetweenDates(portfolio, fromDate, toDate, options) {
    options = options || {};
    var fromIso = timelineIsoDate(fromDate);
    var toIso = timelineIsoDate(toDate);
    var valueFn = typeof options.buildPortfolioValueAtDate === 'function'
      ? options.buildPortfolioValueAtDate
      : buildPortfolioValueAtDate;

    return Promise.all([
      Promise.resolve(valueFn(portfolio, fromDate, options)),
      Promise.resolve(valueFn(portfolio, toDate, options))
    ]).then(function (pair) {
      var fromResult = pair[0] || {};
      var toResult = pair[1] || {};
      var invalidDate = !fromIso || !toIso || !!fromResult.invalidDate || !!toResult.invalidDate;
      var fromValue = fromResult.totalValueRub;
      var toValue = toResult.totalValueRub;
      var changeRub = null;
      var changePct = null;
      if (!invalidDate && fromValue != null && toValue != null &&
          isFinite(Number(fromValue)) && isFinite(Number(toValue))) {
        changeRub = asOfRoundRub(Number(toValue) - Number(fromValue));
        var fromNum = Number(fromValue);
        if (fromNum !== 0) changePct = (changeRub / fromNum) * 100;
      } else if (invalidDate) {
        fromValue = fromResult.invalidDate || !fromIso ? null : fromValue;
        toValue = toResult.invalidDate || !toIso ? null : toValue;
      }
      var notes = asOfUniqueNotes([fromResult.notes, toResult.notes]);
      if (invalidDate) notes.push('Укажите корректные даты для сравнения.');
      return {
        fromDate: fromIso || '',
        toDate: toIso || '',
        fromValue: fromValue != null && isFinite(Number(fromValue)) ? Number(fromValue) : null,
        toValue: toValue != null && isFinite(Number(toValue)) ? Number(toValue) : null,
        changeRub: changeRub,
        changePct: changePct,
        isPartial: !!(fromResult.isPartial || toResult.isPartial),
        invalidDate: !!invalidDate,
        hasIncompleteHistory: !!(fromResult.hasIncompleteHistory || toResult.hasIncompleteHistory),
        notes: notes,
        items: invalidDate ? [] : buildPortfolioValueChangeDetails(fromResult, toResult),
        fromResult: fromResult,
        toResult: toResult
      };
    });
  }

  var CMP_EXPLAIN_EPS = 1e-9;
  var CMP_EXPLAIN_TICKER_LIMIT = 5;

  function cmpExplainQty(n) {
    var x = Number(n);
    return isFinite(x) ? x : 0;
  }

  function cmpExplainAbsSum(rows) {
    var sum = 0;
    (rows || []).forEach(function (row) {
      if (row && row.changeRub != null && isFinite(Number(row.changeRub))) {
        sum += Math.abs(Number(row.changeRub));
      }
    });
    return sum;
  }

  function cmpExplainTickerList(rows, limit) {
    limit = limit || CMP_EXPLAIN_TICKER_LIMIT;
    var copy = (rows || []).slice().sort(function (a, b) {
      var aa = a && a.changeRub != null && isFinite(Number(a.changeRub)) ? Math.abs(Number(a.changeRub)) : -1;
      var bb = b && b.changeRub != null && isFinite(Number(b.changeRub)) ? Math.abs(Number(b.changeRub)) : -1;
      return bb - aa;
    });
    var names = [];
    copy.forEach(function (row) {
      if (names.length >= limit) return;
      var t = row && String(row.ticker || '').trim();
      if (t && names.indexOf(t) < 0) names.push(t);
    });
    return names.join(', ');
  }

  function cmpExplainRubAbs(n) {
    var abs = Math.abs(Number(n));
    if (!isFinite(abs)) return '';
    return abs.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  }

  function cmpExplainHasUnknownPrice(row) {
    if (!row) return true;
    var st = String(row.status || '').toLowerCase();
    if (st === 'missing' || st === 'unsupported' || st === 'partial') return true;
    return row.changeRub == null || !isFinite(Number(row.changeRub));
  }

  function cmpExplainPhrase(rows, one, many) {
    var list = cmpExplainTickerList(rows);
    if (!list) return '';
    return ((rows || []).length === 1 ? one : many) + list + '.';
  }

  function cmpExplainTickerListWithExtra(rows, limit) {
    limit = limit || CMP_EXPLAIN_TICKER_LIMIT;
    var copy = (rows || []).slice().sort(function (a, b) {
      var aa = a && a.changeRub != null && isFinite(Number(a.changeRub)) ? Math.abs(Number(a.changeRub)) : -1;
      var bb = b && b.changeRub != null && isFinite(Number(b.changeRub)) ? Math.abs(Number(b.changeRub)) : -1;
      return bb - aa;
    });
    var names = [];
    copy.forEach(function (row) {
      var t = row && String(row.ticker || '').trim();
      if (t && names.indexOf(t) < 0) names.push(t);
    });
    if (!names.length) return '';
    if (names.length <= limit) return names.join(', ');
    return names.slice(0, limit).join(', ') + ' и ещё ' + (names.length - limit);
  }

  function cmpExplainCollectTickers(portfolio, items) {
    var seen = {};
    var out = [];
    function add(raw) {
      var t = asOfNormTicker(raw);
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    }
    (items || []).forEach(function (row) { add(row && row.ticker); });
    (((portfolio && portfolio.positions) || [])).forEach(function (p) { add(p && p.ticker); });
    (((portfolio && portfolio.sales) || [])).forEach(function (s) { add(s && s.ticker); });
    return out;
  }

  function cmpExplainOpInPeriod(date, fromIso, toIso) {
    if (!date || !fromIso || !toIso) return false;
    return date > fromIso && date <= toIso;
  }

  function collectComparePeriodOperations(portfolio, fromDate, toDate, options) {
    options = options || {};
    var fromIso = timelineIsoDate(fromDate);
    var toIso = timelineIsoDate(toDate);
    var empty = { buys: [], sells: [], buyOps: [], sellOps: [], incomplete: false };
    if (!fromIso || !toIso) return empty;
    var positions = (portfolio && portfolio.positions) || [];
    var sales = (portfolio && portfolio.sales) || [];
    var bondMetaMap = options.bondMetaMap || {};
    var incomplete = false;
    var buyOps = [];
    var sellOps = [];

    cmpExplainCollectTickers(portfolio, options.items).forEach(function (ticker) {
      var ops = buildTickerOperationTimeline(ticker, positions, sales, bondMetaMap[ticker] || null);
      (ops || []).forEach(function (op) {
        if (!op) return;
        if (!op.date) {
          incomplete = true;
          return;
        }
        if (!cmpExplainOpInPeriod(op.date, fromIso, toIso)) return;
        if (op.type === 'buy') buyOps.push(op);
        else if (op.type === 'sell') sellOps.push(op);
      });
    });

    function aggregate(raw) {
      var byTicker = {};
      var order = [];
      (raw || []).forEach(function (op) {
        var t = String(op.ticker || '').trim();
        if (!t) return;
        if (!byTicker[t]) {
          byTicker[t] = { ticker: t, qty: 0, amountRub: 0, amountKnown: true, ops: [] };
          order.push(t);
        }
        var rec = byTicker[t];
        rec.ops.push(op);
        var q = Number(op.qty);
        if (isFinite(q) && q > 0) rec.qty += q;
        var px = Number(op.price);
        if (op.amountRub != null && isFinite(Number(op.amountRub)) && isFinite(px) && px > 0) {
          rec.amountRub += Number(op.amountRub);
        } else {
          rec.amountKnown = false;
        }
      });
      return order.map(function (t) {
        var rec = byTicker[t];
        rec.qty = asOfRoundQty(rec.qty);
        rec.amountRub = rec.amountKnown ? asOfRoundRub(rec.amountRub) : null;
        return rec;
      }).sort(function (a, b) {
        var aa = a.amountRub != null ? Math.abs(Number(a.amountRub)) : Number(a.qty) || 0;
        var bb = b.amountRub != null ? Math.abs(Number(b.amountRub)) : Number(b.qty) || 0;
        return bb - aa;
      });
    }

    return {
      buys: aggregate(buyOps),
      sells: aggregate(sellOps),
      buyOps: buyOps,
      sellOps: sellOps,
      incomplete: incomplete
    };
  }

  function cmpExplainQtyPart(ticker, qty) {
    var t = String(ticker || '').trim();
    if (!t) return '';
    if (qty != null && isFinite(Number(qty)) && Number(qty) > 0) {
      return t + ' — ' + formatAsOfQtyDisplay(qty) + ' шт.';
    }
    return t;
  }

  function cmpExplainOpPart(row) {
    var part = cmpExplainQtyPart(row.ticker, row.qty);
    if (!part) return '';
    if (row.amountRub != null && isFinite(Number(row.amountRub))) {
      return part + ' на ' + cmpExplainRubAbs(row.amountRub);
    }
    return part;
  }

  function cmpExplainJoinLimited(parts, limit) {
    limit = limit || CMP_EXPLAIN_TICKER_LIMIT;
    parts = (parts || []).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length <= limit) return parts.join('; ');
    return parts.slice(0, limit).join('; ') + '; и ещё ' + (parts.length - limit);
  }

  function cmpExplainQtyDeltaParts(rows, direction) {
    var copy = (rows || []).slice().sort(function (a, b) {
      var aa = a && a.changeRub != null && isFinite(Number(a.changeRub)) ? Math.abs(Number(a.changeRub)) : Number(a && a.qtyTo) || 0;
      var bb = b && b.changeRub != null && isFinite(Number(b.changeRub)) ? Math.abs(Number(b.changeRub)) : Number(b && b.qtyTo) || 0;
      return bb - aa;
    });
    return copy.map(function (row) {
      var delta = direction === 'add'
        ? cmpExplainQty(row.qtyTo) - cmpExplainQty(row.qtyFrom)
        : cmpExplainQty(row.qtyFrom) - cmpExplainQty(row.qtyTo);
      return cmpExplainQtyPart(row.ticker, delta > CMP_EXPLAIN_EPS ? delta : null);
    }).filter(Boolean);
  }

  function cmpExplainClassifyItems(items) {
    var groups = {
      appeared: [],
      disappeared: [],
      qtyUp: [],
      qtyDown: [],
      priceUp: [],
      priceDown: [],
      unknown: []
    };
    (items || []).forEach(function (row) {
      if (!row) return;
      var qtyFrom = cmpExplainQty(row.qtyFrom);
      var qtyTo = cmpExplainQty(row.qtyTo);
      var unknownPrice = cmpExplainHasUnknownPrice(row);
      if (qtyFrom <= CMP_EXPLAIN_EPS && qtyTo > CMP_EXPLAIN_EPS) {
        groups.appeared.push(row);
        if (unknownPrice) groups.unknown.push(row);
        return;
      }
      if (qtyFrom > CMP_EXPLAIN_EPS && qtyTo <= CMP_EXPLAIN_EPS) {
        groups.disappeared.push(row);
        if (unknownPrice) groups.unknown.push(row);
        return;
      }
      if (qtyTo > qtyFrom + CMP_EXPLAIN_EPS && qtyFrom > CMP_EXPLAIN_EPS) {
        groups.qtyUp.push(row);
        if (unknownPrice) groups.unknown.push(row);
        return;
      }
      if (qtyTo < qtyFrom - CMP_EXPLAIN_EPS && qtyTo > CMP_EXPLAIN_EPS) {
        groups.qtyDown.push(row);
        if (unknownPrice) groups.unknown.push(row);
        return;
      }
      if (unknownPrice) {
        groups.unknown.push(row);
        return;
      }
      var ch = Number(row.changeRub);
      if (ch > CMP_EXPLAIN_EPS) groups.priceUp.push(row);
      else if (ch < -CMP_EXPLAIN_EPS) groups.priceDown.push(row);
    });
    return groups;
  }

  /**
   * Read-only краткий итог сравнения дат.
   * Берёт готовые items и, если передан portfolio, операции из buildTickerOperationTimeline.
   * Не считает доходность, дивиденды, купоны и не подставляет CLOSE/LAST вместо цены сделки.
   */
  function buildPortfolioValueChangeExplanation(changeResult, options) {
    changeResult = changeResult || {};
    options = options || {};
    var items = changeResult.items || [];
    var portfolio = options.portfolio || changeResult.portfolio || null;
    var bondMetaMap = options.bondMetaMap || changeResult.bondMetaMap || {};
    var groups = cmpExplainClassifyItems(items);
    var periodOps = collectComparePeriodOperations(portfolio, changeResult.fromDate, changeResult.toDate, {
      items: items,
      bondMetaMap: bondMetaMap
    });
    var hasPeriodBuys = periodOps.buys.length > 0;
    var hasPeriodSells = periodOps.sells.length > 0;
    var hasPeriodOperations = hasPeriodBuys || hasPeriodSells;
    var hasCompositionChanges = groups.appeared.length + groups.disappeared.length +
      groups.qtyUp.length + groups.qtyDown.length > 0 || hasPeriodOperations;
    var hasPriceChanges = groups.priceUp.length + groups.priceDown.length > 0;
    var hasOnlyPriceChanges = !hasCompositionChanges && !hasPeriodOperations && hasPriceChanges;
    var warnings = [];
    var noteGap = (items || []).some(function (row) {
      return /нет цены|не поддерживается/i.test(String(row && row.note || ''));
    });
    if (changeResult.isPartial || groups.unknown.length || noteGap) {
      warnings.push('Вывод неполный: по части бумаг нет цены на одну из дат.');
    }
    if (changeResult.hasIncompleteHistory || periodOps.incomplete) {
      warnings.push('Часть операций без корректной даты не включена в расчёт.');
    }

    var scores = {
      'composition-add': cmpExplainAbsSum(groups.appeared) + cmpExplainAbsSum(groups.qtyUp),
      'composition-remove': cmpExplainAbsSum(groups.disappeared) + cmpExplainAbsSum(groups.qtyDown),
      'price-up': cmpExplainAbsSum(groups.priceUp),
      'price-down': cmpExplainAbsSum(groups.priceDown)
    };
    var dominantReason = 'unchanged';
    var best = -1;
    Object.keys(scores).forEach(function (key) {
      if (scores[key] > best) {
        best = scores[key];
        dominantReason = key;
      }
    });
    if (hasPeriodBuys && !hasPeriodSells && scores['composition-add'] >= best) {
      dominantReason = 'composition-add';
    } else if (hasPeriodSells && !hasPeriodBuys && scores['composition-remove'] >= best) {
      dominantReason = 'composition-remove';
    }
    if (best <= 0 && !hasPeriodOperations) {
      dominantReason = groups.unknown.length || periodOps.incomplete ? 'unknown' : 'unchanged';
    } else if ((hasCompositionChanges || hasPeriodOperations) && hasPriceChanges) {
      var compScore = scores['composition-add'] + scores['composition-remove'];
      var priceScore = scores['price-up'] + scores['price-down'];
      if (compScore > 0 && priceScore > 0 && Math.min(compScore, priceScore) / Math.max(compScore, priceScore) > 0.35) {
        dominantReason = 'mixed';
      }
    }

    var bullets = [];
    var changeRub = changeResult.changeRub;
    if (changeRub != null && isFinite(Number(changeRub))) {
      var ch = Number(changeRub);
      if (ch > CMP_EXPLAIN_EPS) {
        bullets.push('Стоимость выросла на ' + cmpExplainRubAbs(ch) + '.');
      } else if (ch < -CMP_EXPLAIN_EPS) {
        bullets.push('Стоимость снизилась на ' + cmpExplainRubAbs(ch) + '.');
      } else {
        bullets.push('Итоговая стоимость не изменилась.');
      }
    } else if (changeResult.invalidDate) {
      bullets.push('Недостаточно данных для краткого итога.');
    }

    var addedRows = groups.appeared.concat(groups.qtyUp);
    var removedRows = groups.disappeared.concat(groups.qtyDown);
    var addedList = cmpExplainTickerListWithExtra(addedRows);
    var removedList = cmpExplainTickerListWithExtra(removedRows);

    function tickersSet(rows) {
      var set = {};
      (rows || []).forEach(function (row) {
        var t = String(row && row.ticker || '').trim();
        if (t) set[t] = true;
      });
      return set;
    }
    var buySet = tickersSet(periodOps.buys);
    var sellSet = tickersSet(periodOps.sells);

    if (hasPeriodBuys) {
      bullets.push('Покупки за период: ' + cmpExplainJoinLimited(periodOps.buys.map(cmpExplainOpPart)) + '.');
      var extraAdds = addedRows.filter(function (row) {
        return !buySet[String(row.ticker || '').trim()];
      });
      if (extraAdds.length) {
        bullets.push('Куплены или увеличены позиции: ' + cmpExplainJoinLimited(cmpExplainQtyDeltaParts(extraAdds, 'add')) + '.');
      }
    } else if (addedRows.length) {
      bullets.push('Куплены или увеличены позиции: ' + cmpExplainJoinLimited(cmpExplainQtyDeltaParts(addedRows, 'add')) + '.');
    }

    if (hasPeriodSells) {
      bullets.push('Продажи за период: ' + cmpExplainJoinLimited(periodOps.sells.map(cmpExplainOpPart)) + '.');
      var extraRemoves = removedRows.filter(function (row) {
        return !sellSet[String(row.ticker || '').trim()];
      });
      if (extraRemoves.length) {
        bullets.push('Проданы или уменьшены позиции: ' + cmpExplainJoinLimited(cmpExplainQtyDeltaParts(extraRemoves, 'remove')) + '.');
      }
    } else if (removedRows.length) {
      bullets.push('Проданы или уменьшены позиции: ' + cmpExplainJoinLimited(cmpExplainQtyDeltaParts(removedRows, 'remove')) + '.');
    }

    var sameQtyPriceRows = groups.priceUp.concat(groups.priceDown);
    if (hasOnlyPriceChanges) {
      bullets.push('Состав портфеля между датами не менялся. Изменение связано с ценами закрытия бумаг.');
      var priceTickers = cmpExplainTickerListWithExtra(sameQtyPriceRows);
      if (priceTickers) {
        bullets.push('По бумагам без изменения количества разница связана с ценой закрытия: ' + priceTickers + '.');
      }
    } else if (sameQtyPriceRows.length) {
      var mixedPriceTickers = cmpExplainTickerListWithExtra(sameQtyPriceRows);
      if (mixedPriceTickers) {
        bullets.push('По бумагам без изменения количества разница связана с ценой закрытия: ' + mixedPriceTickers + '.');
      }
    }

    if (!bullets.length) {
      bullets.push('По таблице ниже видно детализацию по бумагам.');
    }

    var footnote = hasPeriodOperations
      ? 'Это сравнение стоимости, а не доходность: покупки и продажи внутри периода тоже меняют итоговую сумму.'
      : 'Это не доходность, а сравнение стоимости портфеля между датами.';

    var summaryText = bullets[0] || '';
    if (hasOnlyPriceChanges) {
      summaryText = 'Состав портфеля между датами не менялся. Изменение связано с ценами закрытия бумаг.';
    } else if (hasPeriodBuys && !hasPeriodSells) {
      summaryText = 'Куплены или увеличены позиции: ' +
        cmpExplainTickerListWithExtra(periodOps.buys.map(function (row) {
          return { ticker: row.ticker, changeRub: row.amountRub };
        })) + '.';
    } else if (hasPeriodSells && !hasPeriodBuys) {
      summaryText = 'Проданы или уменьшены позиции: ' +
        cmpExplainTickerListWithExtra(periodOps.sells.map(function (row) {
          return { ticker: row.ticker, changeRub: row.amountRub };
        })) + '.';
    } else if (hasPeriodBuys && hasPeriodSells) {
      summaryText = 'За период были покупки и продажи.';
    } else if (addedList && !removedList) {
      summaryText = 'Куплены или увеличены позиции: ' + addedList + '.';
    } else if (removedList && !addedList) {
      summaryText = 'Проданы или уменьшены позиции: ' + removedList + '.';
    } else if (hasCompositionChanges) {
      var mixedTickers = cmpExplainTickerListWithExtra(items, 5);
      summaryText = 'Изменение стоимости связано и с составом портфеля, и с оценкой бумаг' +
        (mixedTickers ? ': ' + mixedTickers : '') + '.';
    }

    var rawOpsCount = periodOps.buyOps.length + periodOps.sellOps.length;
    var hiddenTickers = Math.max(0, periodOps.buys.length - CMP_EXPLAIN_TICKER_LIMIT) +
      Math.max(0, periodOps.sells.length - CMP_EXPLAIN_TICKER_LIMIT);

    return {
      title: 'Что изменилось',
      summaryText: summaryText,
      bullets: bullets,
      footnote: footnote,
      dominantReason: dominantReason,
      hasCompositionChanges: hasCompositionChanges,
      hasOnlyPriceChanges: hasOnlyPriceChanges,
      hasPeriodOperations: hasPeriodOperations,
      periodOps: periodOps,
      showAllOperations: hiddenTickers > 0 || rawOpsCount > CMP_EXPLAIN_TICKER_LIMIT,
      warnings: asOfUniqueNotes([warnings])
    };
  }


  /** UI-настройки портфеля (не часть portfolio JSON). */
  var PF_UI_STORAGE_KEY = 'ibrf.portfolioUi.v1';

  function getPortfolioUiSettings() {
    try {
      var raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PF_UI_STORAGE_KEY) : null;
      if (!raw) return { hiddenClosedTickers: [] };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { hiddenClosedTickers: [] };
      }
      var list = Array.isArray(parsed.hiddenClosedTickers) ? parsed.hiddenClosedTickers : [];
      var seen = {};
      var cleaned = [];
      list.forEach(function (t) {
        var n = typeof normalizeTicker === 'function'
          ? normalizeTicker(t)
          : String(t || '').trim().toUpperCase();
        if (!n || seen[n]) return;
        seen[n] = true;
        cleaned.push(n);
      });
      return { hiddenClosedTickers: cleaned };
    } catch (e) {
      return { hiddenClosedTickers: [] };
    }
  }

  function setPortfolioUiSettings(next) {
    var ui = getPortfolioUiSettings();
    if (next && typeof next === 'object') {
      if (Array.isArray(next.hiddenClosedTickers)) {
        ui.hiddenClosedTickers = next.hiddenClosedTickers;
      }
    }
    var seen = {};
    ui.hiddenClosedTickers = (ui.hiddenClosedTickers || []).map(function (t) {
      return typeof normalizeTicker === 'function'
        ? normalizeTicker(t)
        : String(t || '').trim().toUpperCase();
    }).filter(function (t) {
      if (!t || seen[t]) return false;
      seen[t] = true;
      return true;
    });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PF_UI_STORAGE_KEY, JSON.stringify({
          hiddenClosedTickers: ui.hiddenClosedTickers
        }));
      }
    } catch (e) { /* quota / private mode */ }
    return ui;
  }

  function hideClosedPortfolioTicker(ticker) {
    ticker = typeof normalizeTicker === 'function'
      ? normalizeTicker(ticker)
      : String(ticker || '').trim().toUpperCase();
    if (!ticker) return getPortfolioUiSettings();
    var ui = getPortfolioUiSettings();
    if (ui.hiddenClosedTickers.indexOf(ticker) === -1) {
      ui.hiddenClosedTickers.push(ticker);
      setPortfolioUiSettings(ui);
    }
    return getPortfolioUiSettings();
  }

  function restoreClosedPortfolioTicker(ticker) {
    ticker = typeof normalizeTicker === 'function'
      ? normalizeTicker(ticker)
      : String(ticker || '').trim().toUpperCase();
    if (!ticker) return getPortfolioUiSettings();
    var ui = getPortfolioUiSettings();
    ui.hiddenClosedTickers = ui.hiddenClosedTickers.filter(function (t) { return t !== ticker; });
    return setPortfolioUiSettings(ui);
  }

  function isClosedPortfolioTickerHidden(ticker) {
    ticker = typeof normalizeTicker === 'function'
      ? normalizeTicker(ticker)
      : String(ticker || '').trim().toUpperCase();
    return getPortfolioUiSettings().hiddenClosedTickers.indexOf(ticker) !== -1;
  }

  /**
   * Закрытые позиции: openQty = 0 и есть sales[] по тикеру.
   * Расчёты только через summarizeTickerHistory (без дублирования PnL).
   */
  function listClosedPortfolioPositions(positions, sales, bondMetaMap) {
    bondMetaMap = bondMetaMap || {};
    sales = sales || [];
    var tickers = {};
    sales.forEach(function (s) {
      var t = typeof normalizeTicker === 'function'
        ? normalizeTicker(s.ticker)
        : String(s.ticker || '').trim().toUpperCase();
      if (t) tickers[t] = true;
    });
    var out = [];
    Object.keys(tickers).forEach(function (t) {
      var hist = summarizeTickerHistory(t, positions, sales, bondMetaMap[t] || null);
      if (hist.openQty > 1e-9) return;
      if (!hist.sales.length) return;
      var lastSaleDate = '';
      hist.sales.forEach(function (s) {
        var d = s && s.saleDate ? String(s.saleDate).slice(0, 10) : '';
        if (d && d > lastSaleDate) lastSaleDate = d;
      });
      out.push({
        ticker: t,
        hist: hist,
        lastSaleDate: lastSaleDate,
        isBond: isPortfolioBondPosition({ ticker: t }),
        hidden: isClosedPortfolioTickerHidden(t)
      });
    });
    out.sort(function (a, b) {
      if (a.lastSaleDate !== b.lastSaleDate) {
        return a.lastSaleDate < b.lastSaleDate ? 1 : -1;
      }
      return a.ticker.localeCompare(b.ticker);
    });
    return out;
  }

  /**
   * Read-only «Недавние операции»: покупки из positions[] + продажи из sales[].
   * Не мутирует исходные данные, не создаёт transactions[].
   * options: { days, fallbackLimit, todayYmd, bondMetaMap }
   */
  function collectRecentPortfolioOperations(positions, sales, options) {
    options = options || {};
    var days = options.days != null && isFinite(Number(options.days)) ? Math.max(0, Number(options.days)) : 7;
    var fallbackLimit = options.fallbackLimit != null && isFinite(Number(options.fallbackLimit))
      ? Math.max(0, Number(options.fallbackLimit))
      : 5;
    var bondMetaMap = options.bondMetaMap || {};
    var todayYmd = options.todayYmd || localPortfolioTodayYmd();

    function toIsoDate(raw) {
      if (typeof normalizePortfolioDate === 'function') {
        return normalizePortfolioDate(raw) || '';
      }
      var s = String(raw == null ? '' : raw).trim();
      if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
        var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!m) return '';
        return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
      }
      return '';
    }

    function shiftYmd(fromYmd, deltaDays) {
      var parts = String(fromYmd || '').split('-');
      if (parts.length < 3) return '';
      var y = Number(parts[0]);
      var mo = Number(parts[1]);
      var d = Number(parts[2]);
      if (!isFinite(y) || !isFinite(mo) || !isFinite(d)) return '';
      var dt = new Date(Date.UTC(y, mo - 1, d));
      if (!isFinite(dt.getTime())) return '';
      dt.setUTCDate(dt.getUTCDate() + deltaDays);
      return dt.getUTCFullYear() + '-' +
        String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(dt.getUTCDate()).padStart(2, '0');
    }

    var cutoff = days > 0 ? shiftYmd(todayYmd, -days) : '';
    var ops = [];
    var seq = 0;

    (positions || []).forEach(function (p, idx) {
      if (!p) return;
      var ticker = typeof normalizeTicker === 'function'
        ? normalizeTicker(p.ticker)
        : String(p.ticker || '').trim().toUpperCase();
      if (!ticker) return;
      var qty = Number(p.qty);
      var price = Number(p.avgPrice);
      ops.push({
        kind: 'buy',
        ticker: ticker,
        date: toIsoDate(p.buyDate),
        qty: isFinite(qty) ? qty : null,
        price: isFinite(price) ? price : null,
        buyPrice: isFinite(price) ? price : null,
        salePrice: null,
        realizedPnlRub: null,
        comment: p.comment ? String(p.comment) : '',
        isBond: isPortfolioBondPosition(p),
        lotId: p.lotId ? String(p.lotId) : '',
        saleId: '',
        _seq: seq++,
        _srcIdx: idx
      });
    });

    (sales || []).forEach(function (s, idx) {
      if (!s) return;
      var ticker = typeof normalizeTicker === 'function'
        ? normalizeTicker(s.ticker)
        : String(s.ticker || '').trim().toUpperCase();
      if (!ticker) return;
      var qty = Number(s.qty);
      var salePx = Number(s.salePrice);
      var buyPx = Number(s.buyPrice);
      var pnl = getSaleRealizedPnl(s, bondMetaMap[ticker] || null);
      ops.push({
        kind: 'sale',
        ticker: ticker,
        date: toIsoDate(s.saleDate),
        qty: isFinite(qty) ? qty : null,
        price: isFinite(salePx) ? salePx : null,
        buyPrice: isFinite(buyPx) ? buyPx : null,
        salePrice: isFinite(salePx) ? salePx : null,
        realizedPnlRub: pnl && pnl.amount != null && isFinite(pnl.amount) ? pnl.amount : null,
        comment: s.comment ? String(s.comment) : '',
        isBond: isPortfolioBondPosition(s),
        lotId: s.lotId ? String(s.lotId) : '',
        saleId: s.saleId ? String(s.saleId) : '',
        _seq: seq++,
        _srcIdx: idx
      });
    });

    ops.sort(function (a, b) {
      var da = a.date || '';
      var db = b.date || '';
      if (!da && !db) return a._seq - b._seq;
      if (!da) return 1;
      if (!db) return -1;
      if (da !== db) return da < db ? 1 : -1;
      return a._seq - b._seq;
    });

    var recent = cutoff
      ? ops.filter(function (op) { return op.date && op.date >= cutoff; })
      : ops.slice();
    var picked = recent.length ? recent : ops.slice(0, fallbackLimit);

    return picked.map(function (op) {
      return {
        kind: op.kind,
        ticker: op.ticker,
        date: op.date,
        qty: op.qty,
        price: op.price,
        buyPrice: op.buyPrice,
        salePrice: op.salePrice,
        realizedPnlRub: op.realizedPnlRub,
        comment: op.comment,
        isBond: !!op.isBond,
        lotId: op.lotId,
        saleId: op.saleId
      };
    });
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



  function renderPortfolioChart(opts) {
    opts = opts || {};
    if (typeof renderPortfolioInsights === 'function') {
      renderPortfolioInsights(state.chartTicker, { scroll: !!opts.scroll });
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
    if (typeof safeFormatPortfolioDate === 'function') {
      return safeFormatPortfolioDate(p && p.buyDate);
    }
    var iso = typeof normalizePortfolioDate === 'function'
      ? normalizePortfolioDate(p && p.buyDate)
      : (p && p.buyDate ? String(p.buyDate).slice(0, 10) : '');
    if (!iso) return '—';
    try {
      var lbl = new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU');
      return lbl && !/invalid/i.test(lbl) ? lbl : '—';
    } catch (e) {
      return '—';
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
    var rawDate = String(f.buyDate || '').trim();
    var buyDate = typeof normalizePortfolioDate === 'function'
      ? normalizePortfolioDate(rawDate)
      : '';
    return {
      ticker: f.ticker,
      qty: isFinite(f.qty) ? f.qty : null,
      avg: isFinite(f.avg) ? f.avg : null,
      buyDate: buyDate,
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
    var buyDate = typeof normalizePortfolioDate === 'function'
      ? normalizePortfolioDate(captured.buyDate)
      : '';
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
      editingLot.buyDate = buyDate;
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



  /** Сегодняшняя дата пользователя (локальная TZ), YYYY-MM-DD. Не toISOString. */
  function localPortfolioTodayYmd() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /**
   * Чистая логика автоподстановки для новой позиции.
   * editing → no-op; пустые поля → today / quote.price (акции ₽, ОФЗ % как в котировке).
   */
  function computePortfolioNewLotPrefill(opts) {
    opts = opts || {};
    if (opts.editing) {
      return { skipped: true, buyDate: null, avgPrice: null };
    }
    var buyDate = null;
    if (!opts.dateValue || String(opts.dateValue).trim() === '') {
      var today = localPortfolioTodayYmd();
      buyDate = typeof normalizePortfolioDate === 'function'
        ? normalizePortfolioDate(today)
        : today;
    }
    var avgPrice = null;
    var avgEmpty = !opts.avgValue || String(opts.avgValue).trim() === '';
    if (avgEmpty && opts.quotePrice != null && isFinite(Number(opts.quotePrice))) {
      avgPrice = Number(opts.quotePrice);
    }
    return { skipped: false, buyDate: buyDate, avgPrice: avgPrice };
  }

  /**
   * ОФЗ-подсказки в форме — только для облигаций.
   * Явный kind/type stock|index → false; bond / купонные виды ОФЗ → true;
   * иначе — isRuBondTicker / normalizeBondTickerInput.
   */
  function isPortfolioFormBondTicker(ticker, item) {
    if (item) {
      var k = item.kind || item.type;
      if (k === 'stock' || k === 'index' || k === 'share' || k === 'etf') return false;
      if (k === 'bond' || k === 'fixed' || k === 'indexed' || k === 'float') return true;
    }
    ticker = typeof normalizeTicker === 'function'
      ? normalizeTicker(ticker)
      : String(ticker || '').trim().toUpperCase();
    if (!ticker) {
      var tickerEl = document.getElementById('pfAddTicker');
      ticker = tickerEl ? String(tickerEl.value || '').trim() : '';
      if (typeof normalizeTicker === 'function') ticker = normalizeTicker(ticker);
    }
    if (!ticker) return false;
    if (typeof normalizeBondTickerInput === 'function') {
      var bondQuick = normalizeBondTickerInput(ticker);
      if (bondQuick) ticker = bondQuick;
    }
    return typeof isRuBondTicker === 'function' && !!isRuBondTicker(ticker);
  }

  function updatePortfolioOfzPriceHint(ticker, item) {
    var hint = document.getElementById('pfAddOfzPriceHint');
    var isBond = isPortfolioFormBondTicker(ticker, item);
    if (hint) hint.hidden = !isBond;
    updatePortfolioOfzAvgWarn(ticker, item);
  }

  /** Порог: значение > 200 для ОФЗ похоже на рубли, а не на % номинала. */
  function shouldWarnOfzAvgLooksLikeRubles(isBond, avgRaw) {
    if (!isBond) return false;
    var s = String(avgRaw == null ? '' : avgRaw).trim().replace(',', '.');
    if (!s) return false;
    var n = Number(s);
    if (!isFinite(n)) return false;
    return n > 200;
  }

  function updatePortfolioOfzAvgWarn(ticker, item) {
    var warn = document.getElementById('pfAddOfzPriceWarn');
    if (!warn) return;
    var avgEl = document.getElementById('pfAddAvg');
    var isBond = isPortfolioFormBondTicker(ticker, item);
    var show = shouldWarnOfzAvgLooksLikeRubles(isBond, avgEl ? avgEl.value : '');
    warn.hidden = !show;
  }

  /** Автоподстановка даты/цены только для новой позиции; не затирает ручной ввод. */
  function prefillPortfolioNewLotDefaults(prefix, opts) {
    opts = opts || {};
    if (state.pfEditLotId) {
      return computePortfolioNewLotPrefill({ editing: true });
    }
    prefix = prefix == null ? '' : prefix;
    var dateEl = document.getElementById(pfFieldId(prefix, 'Date'));
    var avgEl = document.getElementById(pfFieldId(prefix, 'Avg'));
    var plan = computePortfolioNewLotPrefill({
      editing: false,
      dateValue: dateEl ? dateEl.value : '',
      avgValue: avgEl ? avgEl.value : '',
      quotePrice: opts.quotePrice
    });
    if (plan.buyDate && dateEl && !String(dateEl.value || '').trim()) {
      dateEl.value = plan.buyDate;
    }
    if (plan.avgPrice != null && avgEl && !String(avgEl.value || '').trim()) {
      avgEl.value = String(plan.avgPrice);
    }
    updatePortfolioOfzAvgWarn();
    return plan;
  }

  function onPortfolioAddTickerSelected(item) {
    if (state.pfEditLotId) return;
    var ticker = item && (item.ticker || item.secid);
    ticker = typeof normalizeTicker === 'function' ? normalizeTicker(ticker) : String(ticker || '').trim().toUpperCase();
    if (!ticker) return;
    updatePortfolioOfzPriceHint(ticker, item);
    prefillPortfolioNewLotDefaults('', {});
    if (typeof fetchMoexQuote !== 'function') return;
    fetchMoexQuote(ticker).then(function (q) {
      if (state.pfEditLotId) return;
      var price = q && q.price != null && isFinite(Number(q.price)) ? Number(q.price) : null;
      if (price == null) return;
      prefillPortfolioNewLotDefaults('', { quotePrice: price });
      updatePortfolioOfzAvgWarn(ticker, item);
    }).catch(function () { /* цена недоступна — поле не трогаем */ });
  }



  function fillPortfolioForm(prefix, pos) {
    var tickerEl = document.getElementById(pfFieldId(prefix, 'Ticker'));
    if (tickerEl) tickerEl.value = pos.ticker || '';
    var qtyEl = document.getElementById(pfFieldId(prefix, 'Qty'));
    if (qtyEl) qtyEl.value = pos.qty != null && isFinite(Number(pos.qty)) ? String(pos.qty) : '';
    var avgEl = document.getElementById(pfFieldId(prefix, 'Avg'));
    if (avgEl) avgEl.value = pos.avgPrice != null && isFinite(Number(pos.avgPrice)) ? String(pos.avgPrice) : '';
    var dateEl = document.getElementById(pfFieldId(prefix, 'Date'));
    if (dateEl) {
      dateEl.value = typeof normalizePortfolioDate === 'function'
        ? normalizePortfolioDate(pos.buyDate)
        : (pos.buyDate || '');
    }
    var commentEl = document.getElementById(pfFieldId(prefix, 'Comment'));
    if (commentEl) commentEl.value = pos.comment || '';
    if (!prefix) updatePortfolioOfzPriceHint(pos.ticker);
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
    var hintNew = document.getElementById('pfAddAvgHintNew');
    var hintEdit = document.getElementById('pfAddAvgHintEdit');
    if (hintNew) hintNew.hidden = editing;
    if (hintEdit) hintEdit.hidden = !editing;
    var tickerEl = document.getElementById('pfAddTicker');
    updatePortfolioOfzPriceHint(tickerEl ? tickerEl.value : '');
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
    updatePortfolioOfzPriceHint(pos.ticker, {
      kind: typeof isRuBondTicker === 'function' && isRuBondTicker(pos.ticker) ? 'bond' : 'stock'
    });
    showToast('Редактирование покупки: ' + pos.ticker);
    scrollPortfolioEditFormIntoView(formPrefix || '');
  }

  /** Плавный скролл к форме редактирования + фокус на количестве. */
  function scrollPortfolioEditFormIntoView(prefix) {
    prefix = prefix == null ? '' : prefix;
    var title = document.getElementById(pfFieldId(prefix, 'FormTitle'));
    var form = title
      ? title.closest('.portfolio-add-form') || title.closest('[data-pf-form]')
      : document.querySelector('.portfolio-add-form');
    if (form && typeof form.scrollIntoView === 'function') {
      try {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        form.scrollIntoView(true);
      }
    }
    var focusEl = document.getElementById(pfFieldId(prefix, 'Qty')) ||
      document.getElementById(pfFieldId(prefix, 'Avg'));
    if (focusEl && typeof focusEl.focus === 'function') {
      setTimeout(function () {
        try { focusEl.focus({ preventScroll: true }); } catch (e2) {
          try { focusEl.focus(); } catch (e3) { /* noop */ }
        }
      }, 280);
    }
  }



  function cancelPortfolioEdit() {
    state.pfEditTicker = '';
    state.pfEditLotId = '';
    state.pfEditPrefix = '';
    clearAllPortfolioForms();
    updatePortfolioFormChrome();
    var ofzHint = document.getElementById('pfAddOfzPriceHint');
    var ofzWarn = document.getElementById('pfAddOfzPriceWarn');
    if (ofzHint) ofzHint.hidden = true;
    if (ofzWarn) ofzWarn.hidden = true;
    prefillPortfolioNewLotDefaults('', {});
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



  function computeProportionalSaleTakes(lots, sellQty, totalQty) {
    if (!lots.length || totalQty <= 0) return [];
    var allInt = Math.abs(sellQty - Math.round(sellQty)) < 1e-9 &&
      lots.every(function (l) {
        var q = Number(l.qty);
        return isFinite(q) && Math.abs(q - Math.round(q)) < 1e-9;
      });
    if (!allInt) {
      var left = sellQty;
      return lots.map(function (lot, idx) {
        var lotQty = Number(lot.qty);
        var take = idx === lots.length - 1
          ? left
          : Math.round((sellQty * lotQty / totalQty) * 10000) / 10000;
        take = Math.min(take, lotQty, left);
        left -= take;
        return take;
      });
    }
    var sellInt = Math.round(sellQty);
    var exact = lots.map(function (l) {
      return sellInt * Number(l.qty) / totalQty;
    });
    var takes = exact.map(function (x) { return Math.floor(x + 1e-9); });
    var rem = sellInt - takes.reduce(function (s, n) { return s + n; }, 0);
    var order = exact.map(function (x, i) {
      return { i: i, f: x - Math.floor(x + 1e-9) };
    }).sort(function (a, b) { return b.f - a.f; });
    var k = 0;
    while (rem > 0 && k < order.length) {
      takes[order[k].i] += 1;
      rem -= 1;
      k += 1;
    }
    var leftInt = sellInt;
    takes = takes.map(function (take, idx) {
      take = Math.min(take, Number(lots[idx].qty), leftInt);
      leftInt -= take;
      return take;
    });
    var i = 0;
    while (leftInt > 0 && i < lots.length) {
      var cap = Number(lots[i].qty) - takes[i];
      var add = Math.min(cap, leftInt);
      takes[i] += add;
      leftInt -= add;
      i += 1;
    }
    return takes;
  }



  function allocateSaleAcrossLots(portfolio, ticker, sellQty, salePricePerShare) {
    ticker = normalizeTicker(ticker);
    var lots = findPortfolioLots(ticker, portfolio.positions).filter(function (l) {
      var q = Number(l.qty);
      return isFinite(q) && q > 0;
    });
    if (!lots.length) return null;
    var totalQty = lots.reduce(function (s, l) { return s + Number(l.qty); }, 0);
    if (!isFinite(sellQty) || sellQty <= 0 || sellQty > totalQty + 1e-6) return null;

    var totalCostBefore = lots.reduce(function (s, l) {
      var q = Number(l.qty);
      var a = Number(l.avgPrice);
      return s + (isFinite(q) && q > 0 && isFinite(a) && a > 0 ? q * a : 0);
    }, 0);
    var weightedAvgBefore = totalQty > 0 ? totalCostBefore / totalQty : computeLotsWeightedAvg(lots);
    var salePx = isFinite(Number(salePricePerShare)) && Number(salePricePerShare) > 0
      ? Number(salePricePerShare) : null;
    var takes = computeProportionalSaleTakes(lots, sellQty, totalQty);
    var allocations = [];
    var remaining = [];

    lots.forEach(function (lot, idx) {
      var take = takes[idx] || 0;
      var lotQtyOnly = Number(lot.qty);
      if (take <= 1e-9) {
        if (isFinite(lotQtyOnly) && lotQtyOnly > 1e-9) {
          remaining.push(normalizePosition({
            lotId: lot.lotId,
            ticker: lot.ticker,
            qty: lotQtyOnly,
            avgPrice: lot.avgPrice,
            currentPrice: lot.currentPrice,
            buyDate: lot.buyDate,
            comment: lot.comment,
            market: lot.market,
            currency: lot.currency,
            dayChangePct: lot.dayChangePct
          }));
        }
        return;
      }
      allocations.push({
        lotId: lot.lotId,
        qty: take,
        buyPrice: isFinite(Number(lot.avgPrice)) ? Number(lot.avgPrice) : null,
        salePrice: salePx,
        buyDate: lot.buyDate || ''
      });
      var remainQty = lotQtyOnly - take;
      if (isFinite(remainQty) && remainQty > 1e-9) {
        remaining.push(normalizePosition({
          lotId: lot.lotId,
          ticker: lot.ticker,
          qty: remainQty,
          avgPrice: lot.avgPrice,
          currentPrice: lot.currentPrice,
          buyDate: lot.buyDate,
          comment: lot.comment,
          market: lot.market,
          currency: lot.currency,
          dayChangePct: lot.dayChangePct
        }));
      }
    });

    remaining = remaining.filter(Boolean);
    var rawRemainCost = remaining.reduce(function (s, l) {
      var q = Number(l.qty);
      var a = Number(l.avgPrice);
      return s + (isFinite(q) && q > 0 && isFinite(a) && a > 0 ? q * a : 0);
    }, 0);
    var remainQtyTotal = totalQty - sellQty;
    if (remainQtyTotal > 1e-9 && rawRemainCost > 1e-9 && salePx != null) {
      var targetRemainCost = Math.max(0, totalCostBefore - salePx * sellQty);
      var factor = targetRemainCost / rawRemainCost;
      remaining = remaining.map(function (l) {
        var ap = Number(l.avgPrice);
        return normalizePosition({
          lotId: l.lotId,
          ticker: l.ticker,
          qty: l.qty,
          avgPrice: isFinite(ap) && ap > 0 ? ap * factor : l.avgPrice,
          currentPrice: l.currentPrice,
          buyDate: l.buyDate,
          comment: l.comment,
          market: l.market,
          currency: l.currency,
          dayChangePct: l.dayChangePct
        });
      }).filter(Boolean);
    }

    portfolio.positions = portfolio.positions.filter(function (p) {
      return normalizeTicker(p.ticker) !== ticker;
    }).concat(remaining);

    var weightedAvgAfter = computeLotsWeightedAvg(
      findPortfolioLots(ticker, portfolio.positions)
    );
    var realizedPnl = salePx != null && weightedAvgBefore != null
      ? (salePx - weightedAvgBefore) * sellQty
      : null;

    return {
      allocations: allocations,
      weightedAvgBefore: weightedAvgBefore,
      weightedAvgAfter: weightedAvgAfter,
      realizedPnl: realizedPnl,
      salePricePerShare: salePx
    };
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
    updatePortfolioSellAllBtn(totalQty);
    if (form) {
      form.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      showToast('Форма продажи не загружена — обновите страницу (Ctrl+F5)');
    }
    updatePortfolioSalePreview();
  }

  function getPortfolioSellableQty(ticker) {
    ticker = normalizeTicker(ticker || state.pfSaleTicker || '');
    if (!ticker) return 0;
    return findPortfolioLots(ticker).reduce(function (s, l) {
      var q = Number(l.qty);
      return s + (isFinite(q) && q > 0 ? q : 0);
    }, 0);
  }

  function updatePortfolioSaleAvailableHint(totalQty) {
    var hint = document.getElementById('pfSaleAvailableHint');
    var saleBtn = document.getElementById('pfSaleBtn');
    if (totalQty == null) totalQty = getPortfolioSellableQty();
    var ok = isFinite(totalQty) && totalQty > 0;
    if (hint) {
      if (!state.pfSaleTicker) {
        hint.hidden = true;
        hint.textContent = '';
      } else {
        hint.hidden = false;
        hint.textContent = 'Доступно: ' + (ok ? String(totalQty) : '0') + ' шт.';
      }
    }
    if (saleBtn) {
      saleBtn.disabled = !state.pfSaleTicker || !ok;
      if (saleBtn.disabled) {
        saleBtn.title = 'Нет доступного количества для продажи';
      } else {
        saleBtn.removeAttribute('title');
      }
    }
  }

  function updatePortfolioSellAllBtn(totalQty) {
    var btn = document.getElementById('pfSaleAllBtn');
    if (totalQty == null) totalQty = getPortfolioSellableQty();
    var ok = isFinite(totalQty) && totalQty > 0;
    if (btn) {
      btn.hidden = !ok;
      btn.disabled = !ok;
      if (ok) {
        btn.setAttribute('data-pf-sell-all-qty', String(totalQty));
        btn.title = 'Подставить весь остаток: ' + totalQty + ' шт.';
      } else {
        btn.removeAttribute('data-pf-sell-all-qty');
        btn.title = '';
      }
    }
    updatePortfolioSaleAvailableHint(totalQty);
  }

  /** Только подставляет количество в форму продажи, не фиксирует сделку. */
  function fillPortfolioSaleAllQty() {
    var qtyEl = document.getElementById('pfSaleQty');
    if (!qtyEl || !state.pfSaleTicker) return;
    var totalQty = getPortfolioSellableQty(state.pfSaleTicker);
    if (!(totalQty > 0)) {
      updatePortfolioSellAllBtn(0);
      return;
    }
    qtyEl.value = String(totalQty);
    updatePortfolioSalePreview();
    try { qtyEl.focus({ preventScroll: true }); } catch (e) {
      try { qtyEl.focus(); } catch (e2) { /* noop */ }
    }
  }



  function updatePortfolioSalePreview() {
    var hint = document.getElementById('pfSaleLotHint');
    if (!hint || !state.pfSaleTicker) return;
    var ticker = normalizeTicker(state.pfSaleTicker);
    var lots = findPortfolioLots(ticker).filter(function (l) {
      var q = Number(l.qty);
      return isFinite(q) && q > 0;
    });
    if (!lots.length) {
      updatePortfolioSellAllBtn(0);
      return;
    }
    var totalQty = lots.reduce(function (s, l) { return s + Number(l.qty); }, 0);
    updatePortfolioSellAllBtn(totalQty);
    var agg = aggregatePortfolioLots(lots);
    var avgBefore = computeLotsWeightedAvg(lots);
    var captured = capturePortfolioSaleInput();
    var sellQty = captured.qty;
    var salePx = captured.price;
    var parts = [
      ticker + ' · остаток ' + totalQty + ' шт.',
      'ср. цена покупки ' + formatPositionAvg(agg || { ticker: ticker, avgPrice: avgBefore, currency: 'RUB' })
    ];
    if (salePx != null && isFinite(salePx) && salePx > 0) {
      parts.push('продажа ' + formatPositionAvg({ avgPrice: salePx, currency: agg && agg.currency, ticker: ticker }) + '/шт');
    }
    if (sellQty != null && isFinite(sellQty) && sellQty > 0 && salePx != null && isFinite(salePx) && salePx > 0) {
      if (sellQty > totalQty + 1e-6) {
        parts.push('кол-во больше остатка');
      } else if (avgBefore != null && isFinite(avgBefore)) {
        var pnl = (salePx - avgBefore) * sellQty;
        parts.push('результат ' + formatSignedRubAmount(pnl));
        var remainQty = totalQty - sellQty;
        if (remainQty > 1e-9) {
          var totalCost = avgBefore * totalQty;
          var remainCost = Math.max(0, totalCost - salePx * sellQty);
          var avgAfter = remainCost / remainQty;
          parts.push('ср. цена остатка после продажи ' +
            formatPositionAvg({ avgPrice: avgAfter, currency: agg && agg.currency, ticker: ticker }));
        }
      }
    }
    hint.textContent = parts.join(' · ');
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
    updatePortfolioSellAllBtn(0);
  }



  function capturePortfolioSaleInput() {
    var qty = parseFloat(String((document.getElementById('pfSaleQty') || {}).value || '').replace(',', '.'));
    var price = parseFloat(String((document.getElementById('pfSalePrice') || {}).value || '').replace(',', '.'));
    var rawDate = String((document.getElementById('pfSaleDate') || {}).value || '').trim();
    var date = typeof normalizePortfolioDate === 'function'
      ? normalizePortfolioDate(rawDate)
      : '';
    return {
      qty: isFinite(qty) ? qty : null,
      price: isFinite(price) ? price : null,
      date: date,
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
    var saleDate = typeof normalizePortfolioDate === 'function'
      ? (normalizePortfolioDate(captured.date) || new Date().toISOString().slice(0, 10))
      : (captured.date || new Date().toISOString().slice(0, 10));
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
    var allocResult = allocateSaleAcrossLots(portfolio, ticker, qty, salePrice);
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
    var pnl = getSaleRealizedPnl(sale, null);
    cancelPortfolioSale();
    var msg = 'Продажа зафиксирована: ' + ticker;
    if (salePrice != null && isFinite(salePrice)) {
      msg += ' · ' + formatPositionAvg({ avgPrice: salePrice, currency: refLot.currency, ticker: ticker }) + '/шт';
    }
    if (allocResult.weightedAvgAfter != null && isFinite(allocResult.weightedAvgAfter)) {
      msg += ' · ср. цена остатка ' +
        formatPositionAvg({ avgPrice: allocResult.weightedAvgAfter, currency: refLot.currency, ticker: ticker });
    }
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



  /**
   * Куда вести из «Недавних операций»: открытая / закрытая / скрытая закрытая.
   * Не мутирует portfolio JSON и hiddenClosedTickers.
   */
  function resolvePortfolioHistoryNavTarget(ticker, positions, sales) {
    ticker = typeof normalizeTicker === 'function'
      ? normalizeTicker(ticker)
      : String(ticker || '').trim().toUpperCase();
    if (!ticker) return { kind: 'none', ticker: '' };
    var hist = summarizeTickerHistory(ticker, positions, sales, null);
    if (hist.openQty > 1e-9) return { kind: 'open', ticker: ticker };
    if (hist.sales && hist.sales.length) {
      var hidden = typeof isClosedPortfolioTickerHidden === 'function'
        ? isClosedPortfolioTickerHidden(ticker)
        : false;
      return { kind: hidden ? 'closed-hidden' : 'closed', ticker: ticker };
    }
    return { kind: 'none', ticker: ticker };
  }

  function findPortfolioTickerScrollTarget(ticker) {
    ticker = normalizeTicker(ticker);
    if (!ticker) return null;
    var closed = document.querySelector(
      '#portfolioClosedSection .portfolio-closed-card[data-pf-closed-ticker="' + ticker + '"]'
    );
    if (closed) return closed;

    var cardsHost = document.getElementById('portfolioCards');
    if (cardsHost) {
      var cardsVisible = true;
      try {
        cardsVisible = window.getComputedStyle(cardsHost).display !== 'none';
      } catch (e) { /* noop */ }
      if (cardsVisible) {
        var mobileCard = cardsHost.querySelector('.portfolio-card[data-chart-ticker="' + ticker + '"]');
        if (mobileCard) return mobileCard;
      }
    }

    var detailRow = document.querySelector(
      '#portfolioTableBody tr.pf-ticker-detail-row[data-pf-detail-ticker="' + ticker + '"]'
    );
    if (detailRow) return detailRow;

    var primary = document.querySelector(
      '#portfolioTableBody tr.pf-lot-primary[data-chart-ticker="' + ticker + '"]'
    );
    if (primary) return primary;

    return document.querySelector(
      '#portfolioTableBody tr[data-chart-ticker="' + ticker + '"]'
    );
  }

  function scrollPortfolioTickerIntoView(ticker, opts) {
    opts = opts || {};
    var left = opts.retries != null ? opts.retries : 3;
    function attempt() {
      var el = findPortfolioTickerScrollTarget(ticker);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (left > 0) {
        left -= 1;
        setTimeout(attempt, 140);
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(attempt);
    } else {
      setTimeout(attempt, 0);
    }
  }

  /**
   * Переход из «Недавних операций» → раскрыть «Подробнее» по тикеру и проскроллить.
   * Не вызывает selectPortfolioTicker / не скроллит к аналитике.
   */
  function openPortfolioTickerDetailsFromRecent(ticker) {
    ticker = normalizeTicker(ticker);
    if (!ticker) return;

    if (typeof switchTab === 'function' && state.tab && state.tab !== 'portfolio') {
      switchTab('portfolio');
    }

    var positions = typeof getPortfolio === 'function' ? (getPortfolio().positions || []) : [];
    var sales = typeof getPortfolio === 'function' ? (getPortfolio().sales || []) : [];
    var nav = resolvePortfolioHistoryNavTarget(ticker, positions, sales);

    if (nav.kind === 'none') {
      if (typeof showToast === 'function') {
        showToast('Позиция по ' + ticker + ' не найдена в портфеле');
      }
      return;
    }

    if (!state.pfHistoryTickers) state.pfHistoryTickers = {};
    state.pfHistoryTickers[ticker] = true;

    if (nav.kind === 'closed-hidden') {
      state.pfShowHiddenClosed = true;
    }

    renderPortfolioTableBody();
    scrollPortfolioTickerIntoView(ticker, { retries: 4 });
  }

  /** Enter/Space на фокусе всей карточки «Недавние операции». */
  function handlePortfolioRecentKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('button, a, input, select, textarea')) return;
    var card = e.target.closest('.portfolio-recent-card[data-pf-open-history]');
    if (!card || e.target !== card) return;
    e.preventDefault();
    e.stopPropagation();
    openPortfolioTickerDetailsFromRecent(card.getAttribute('data-pf-open-history'));
  }



  function handlePortfolioTableClick(e) {
    // Action-кнопки / контролы внутри карточки: не открывать аналитику и не скроллить.
    var actionEl = e.target.closest(
      'button, a, input, select, textarea, label,' +
      '[data-pf-open-history],' +
      '[data-pf-toggle-history], [data-pf-hide-closed], [data-pf-restore-closed],' +
      '[data-pf-show-hidden-closed], [data-pf-collapse-hidden-closed],' +
      '[data-pf-expand-lots], [data-pf-collapse-lots],' +
      '[data-pf-sell-ticker], [data-pf-sell-lot], [data-pf-undo-sale],' +
      '[data-pf-edit-lot], [data-pf-remove-lot],' +
      '.portfolio-card-actions, .portfolio-closed-card-actions,' +
      '.portfolio-card-detail, .portfolio-closed-card-detail,' +
      '.pf-row-actions, .pf-lot-toggle-row, .pf-sale-row, .pf-ticker-detail-row,' +
      '.pf-ticker-manage, .pf-ticker-manage-summary'
    );

    var openHistoryBtn = e.target.closest('[data-pf-open-history]');
    if (openHistoryBtn) {
      e.preventDefault();
      e.stopPropagation();
      openPortfolioTickerDetailsFromRecent(openHistoryBtn.getAttribute('data-pf-open-history'));
      return;
    }
    var historyBtn = e.target.closest('[data-pf-toggle-history]');
    if (historyBtn) {
      e.preventDefault();
      e.stopPropagation();
      var tHist = normalizeTicker(historyBtn.getAttribute('data-pf-toggle-history'));
      if (!state.pfHistoryTickers) state.pfHistoryTickers = {};
      state.pfHistoryTickers[tHist] = !state.pfHistoryTickers[tHist];
      renderPortfolioTableBody();
      return;
    }
    var hideClosedBtn = e.target.closest('[data-pf-hide-closed]');
    if (hideClosedBtn) {
      e.preventDefault();
      e.stopPropagation();
      hideClosedPortfolioTicker(hideClosedBtn.getAttribute('data-pf-hide-closed'));
      renderPortfolioTableBody();
      return;
    }
    var restoreClosedBtn = e.target.closest('[data-pf-restore-closed]');
    if (restoreClosedBtn) {
      e.preventDefault();
      e.stopPropagation();
      restoreClosedPortfolioTicker(restoreClosedBtn.getAttribute('data-pf-restore-closed'));
      renderPortfolioTableBody();
      return;
    }
    var showHiddenClosedBtn = e.target.closest('[data-pf-show-hidden-closed]');
    if (showHiddenClosedBtn) {
      e.preventDefault();
      e.stopPropagation();
      state.pfShowHiddenClosed = true;
      renderPortfolioTableBody();
      return;
    }
    var collapseHiddenClosedBtn = e.target.closest('[data-pf-collapse-hidden-closed]');
    if (collapseHiddenClosedBtn) {
      e.preventDefault();
      e.stopPropagation();
      state.pfShowHiddenClosed = false;
      renderPortfolioTableBody();
      return;
    }
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
    if (e.target.closest('summary, .pf-ticker-manage-summary')) {
      e.stopPropagation();
      return;
    }
    if (actionEl) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var card = e.target.closest('.portfolio-card[data-chart-ticker]');
    if (card) {
      if (state.tab === 'watchlist') switchTab('portfolio');
      selectPortfolioTicker(card.getAttribute('data-chart-ticker'));
      return;
    }
    var row = e.target.closest('tr[data-chart-ticker]');
    if (row) {
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
    // В основной таблице только быстрые действия; Изменить/Удалить — в «Подробнее».
    var sellActions = lotIndex === 0
      ? '<button type="button" class="ghost small pf-btn pf-btn-edit" data-pf-sell-ticker="' + escapeHtml(group.ticker) + '">Продать</button> ' +
        buildPortfolioHistoryToggleBtn(group.ticker)
      : '';
    var weightedAvgCell = lotIndex === 0
      ? '<td class="pf-weighted-avg" rowspan="' + (opts.rowSpan || 1) + '">' + escapeHtml(weightedAvg) + '</td>'
      : '';
    return '<tr class="pf-table-row pf-lot-row' + editActive + (opts.groupClass || '') +
      '" data-chart-ticker="' + escapeHtml(group.ticker) + '" data-pf-lot="' + escapeHtml(p.lotId || '') + '">' +
      tickerCell +
      '<td class="pf-weight">' + escapeHtml(weight) + '</td>' +
      '<td>' + escapeHtml(formatPortfolioQty(p)) + '</td>' +
      '<td class="pf-buy-price">' + escapeHtml(purchasePrice) + '</td>' +
      weightedAvgCell +
      '<td>' + escapeHtml(formatPortfolioDate(p)) + '</td>' +
      '<td>' + escapeHtml(cur) + '</td>' +
      '<td>' + returnCell + '</td>' +
      bondCols +
      incomeCell +
      '<td class="pf-comment">' + escapeHtml(p.comment || '—') + '</td>' +
      '<td class="pf-row-actions">' + sellActions + '</td></tr>';
  }



  function formatPortfolioSaleDate(sale) {
    if (typeof safeFormatPortfolioDate === 'function') {
      return safeFormatPortfolioDate(sale && sale.saleDate);
    }
    var iso = typeof normalizePortfolioDate === 'function'
      ? normalizePortfolioDate(sale && sale.saleDate)
      : (sale && sale.saleDate ? String(sale.saleDate).slice(0, 10) : '');
    if (!iso) return '—';
    try {
      var lbl = new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU');
      return lbl && !/invalid/i.test(lbl) ? lbl : '—';
    } catch (e) {
      return '—';
    }
  }

  /** Вклад allocation в зафиксированный результат (₽), тем же правилом что getSaleRealizedPnl. */
  function getSaleAllocationPnlRub(alloc, sale, bondMeta) {
    if (!alloc || !sale) return null;
    var isBond = isPortfolioBondPosition(sale);
    var face = isBond ? resolveBondFaceValue(sale, bondMeta) : null;
    var q = Number(alloc.qty);
    var buy = Number(alloc.buyPrice);
    var sell = isFinite(Number(alloc.salePrice)) && Number(alloc.salePrice) > 0
      ? Number(alloc.salePrice)
      : Number(sale.salePrice);
    if (!isFinite(q) || q <= 0 || !isFinite(buy) || buy <= 0 || !isFinite(sell) || sell <= 0) {
      return null;
    }
    if (isBond) return bondRubFromPct(sell - buy, q, face);
    return (sell - buy) * q;
  }

  function formatPortfolioHistoryPrice(price, ticker, isBond, currency) {
    if (price == null || !isFinite(Number(price))) return '—';
    return formatPositionAvg({
      avgPrice: Number(price),
      currency: currency || 'RUB',
      ticker: ticker
    }, { bond: !!isBond });
  }

  function buildPortfolioHistoryToggleBtn(ticker) {
    ticker = normalizeTicker(ticker);
    var open = !!(state.pfHistoryTickers && state.pfHistoryTickers[ticker]);
    return '<button type="button" class="small pf-btn pf-history-toggle' + (open ? ' pf-history-toggle--open' : '') +
      '" data-pf-toggle-history="' + escapeHtml(ticker) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      (open ? 'Скрыть' : 'Подробнее') + '</button>';
  }

  function formatTimelineOpDate(iso) {
    if (typeof safeFormatPortfolioDate === 'function') return safeFormatPortfolioDate(iso);
    return formatRecentOperationDate(iso);
  }

  function formatTimelineOpQty(qty, type) {
    if (qty == null || !isFinite(Number(qty))) return '—';
    var n = Number(qty);
    var s = String(n);
    return type === 'sell' ? '−' + s : s;
  }

  function formatTimelineOpResult(op) {
    if (!op || op.type !== 'sell') return '—';
    if (op.realizedPnlRub == null || !isFinite(op.realizedPnlRub)) return '—';
    var text = formatSignedRubAmount(op.realizedPnlRub);
    if (op.realizedPnlPct != null && isFinite(op.realizedPnlPct)) {
      text += ' · ' + formatSignedPct(op.realizedPnlPct, 2);
    }
    return text;
  }

  function formatTimelineRemainingQty(qty) {
    if (qty == null || !isFinite(Number(qty))) return '—';
    return String(Number(qty));
  }

  function buildPortfolioTickerTimelineHtml(ops, ticker, isBond, stack) {
    var html = '<div class="pf-ticker-detail-section pf-history-section--timeline">' +
      '<h4 class="pf-ticker-detail-h">История операций</h4>';
    if (!ops || !ops.length) {
      html += '<p class="muted pf-ticker-detail-empty">Операций по этой бумаге пока нет.</p></div>';
      return html;
    }
    if (stack) {
      html += '<div class="pf-stack-list pf-timeline-cards">';
      ops.forEach(function (op) {
        var isBuy = op.type === 'buy';
        var badge = isBuy
          ? '<span class="pf-op-badge pf-op-badge--buy">Покупка</span>'
          : '<span class="pf-op-badge pf-op-badge--sale">Продажа</span>';
        var pnlCls = '';
        if (!isBuy && op.realizedPnlRub != null && isFinite(op.realizedPnlRub)) {
          pnlCls = op.realizedPnlRub >= 0 ? 'pnl-pos' : 'pnl-neg';
        }
        html += '<div class="pf-stack-item pf-op-card pf-timeline-card ' +
          (isBuy ? 'pf-open-lot' : 'pf-sale-row') + '">' +
          '<div class="pf-timeline-card-head">' +
            '<span class="pf-timeline-card-date">' + escapeHtml(formatTimelineOpDate(op.date)) + '</span>' +
            badge +
          '</div>' +
          '<div class="pf-stack-meta pf-timeline-card-meta">' +
            '<span><span class="lbl">Кол-во</span> ' + escapeHtml(formatTimelineOpQty(op.qty, op.type)) + '</span>' +
            '<span><span class="lbl">Цена</span> ' +
              escapeHtml(formatPortfolioHistoryPrice(op.price, ticker, isBond)) + '</span>' +
            '<span><span class="lbl">Сумма</span> ' +
              escapeHtml(formatPortfolioRubAmount(op.amountRub)) + '</span>' +
          '</div>';
        if (!isBuy) {
          html += '<div class="pf-timeline-card-result ' + (pnlCls || 'muted') + '">' +
            '<span class="lbl">Результат</span> ' + escapeHtml(formatTimelineOpResult(op)) +
            '</div>';
        }
        html += '<div class="pf-timeline-card-remain muted">' +
          '<span class="lbl">Остаток после операции</span> ' +
          escapeHtml(formatTimelineRemainingQty(op.remainingQtyAfter)) +
          '</div>';
        if (op.note) {
          html += '<div class="pf-timeline-note muted">' + escapeHtml(op.note) + '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
      return html;
    }

    html += '<div class="pf-timeline-table-wrap"><table class="pf-mini-table pf-mini-table--timeline"><thead><tr>' +
      '<th>Дата</th><th>Операция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th>Результат</th><th>Остаток после операции</th>' +
      '</tr></thead><tbody>';
    ops.forEach(function (op) {
      var isBuy = op.type === 'buy';
      var badge = isBuy
        ? '<span class="pf-op-badge pf-op-badge--buy">Покупка</span>'
        : '<span class="pf-op-badge pf-op-badge--sale">Продажа</span>';
      var pnlCls = 'muted';
      if (!isBuy && op.realizedPnlRub != null && isFinite(op.realizedPnlRub)) {
        pnlCls = op.realizedPnlRub >= 0 ? 'pnl-pos' : 'pnl-neg';
      }
      html += '<tr class="pf-timeline-row ' + (isBuy ? 'pf-timeline-row--buy' : 'pf-timeline-row--sell') + '">' +
        '<td>' + escapeHtml(formatTimelineOpDate(op.date)) + '</td>' +
        '<td>' + badge + '</td>' +
        '<td>' + escapeHtml(formatTimelineOpQty(op.qty, op.type)) + '</td>' +
        '<td>' + escapeHtml(formatPortfolioHistoryPrice(op.price, ticker, isBond)) + '</td>' +
        '<td>' + escapeHtml(formatPortfolioRubAmount(op.amountRub)) + '</td>' +
        '<td class="' + (isBuy ? 'muted' : pnlCls) + '">' + escapeHtml(formatTimelineOpResult(op)) + '</td>' +
        '<td>' + escapeHtml(formatTimelineRemainingQty(op.remainingQtyAfter)) + '</td>' +
        '</tr>';
      if (op.note) {
        html += '<tr class="pf-timeline-note-row"><td colspan="7" class="muted pf-timeline-note">' +
          escapeHtml(op.note) + '</td></tr>';
      }
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function buildPortfolioTickerDetailHtml(ticker, positions, sales, bondMeta, isBond, opts) {
    opts = opts || {};
    var stack = opts.layout === 'stack';
    var hist = summarizeTickerHistory(ticker, positions, sales, bondMeta);
    var timeline = buildTickerOperationTimeline(ticker, positions, sales, bondMeta);
    var uCls = hist.unrealizedPnlRub >= 0 ? 'pnl-pos' : 'pnl-neg';
    var rCls = hist.realizedPnlRub >= 0 ? 'pnl-pos' : 'pnl-neg';
    var html = '<div class="pf-ticker-detail' + (stack ? ' pf-ticker-detail--stack' : '') + '">' +
      (stack ? '' : '<div class="pf-ticker-detail-title">Подробнее по ' + escapeHtml(hist.ticker) + '</div>') +
      (isBond
        ? '<p class="pf-ticker-detail-note muted">Цены ОФЗ указаны в % от номинала, суммы — в ₽.</p>'
        : '') +
      '<div class="pf-ticker-detail-summary">' +
        '<div class="pf-ticker-detail-kpi"><span class="lbl">Остаток</span><span class="val">' +
          escapeHtml(String(hist.openQty)) + ' шт.</span></div>' +
        '<div class="pf-ticker-detail-kpi"><span class="lbl">Куплено всего</span><span class="val">' +
          escapeHtml(String(hist.totalBoughtQty)) + ' шт.</span></div>' +
        '<div class="pf-ticker-detail-kpi"><span class="lbl">Продано</span><span class="val">' +
          escapeHtml(String(hist.totalSoldQty)) + ' шт.</span></div>' +
        '<div class="pf-ticker-detail-kpi"><span class="lbl">Текущая стоимость</span><span class="val">' +
          escapeHtml(formatPortfolioRubAmount(hist.openMarketValueRub)) + '</span></div>' +
        '<div class="pf-ticker-detail-kpi"><span class="lbl">Вложено в остаток</span><span class="val">' +
          escapeHtml(formatPortfolioRubAmount(hist.openCostRub)) + '</span></div>' +
        '<div class="pf-ticker-detail-kpi"><span class="lbl">Результат по текущим ценам</span>' +
          '<span class="val ' + uCls + '">' + escapeHtml(formatSignedRubAmount(hist.unrealizedPnlRub)) + '</span></div>' +
        '<div class="pf-ticker-detail-kpi"><span class="lbl">Зафиксированный результат</span>' +
          '<span class="val ' + rCls + '">' + escapeHtml(formatSignedRubAmount(hist.realizedPnlRub)) + '</span></div>' +
      '</div>';

    html += buildPortfolioTickerTimelineHtml(timeline, hist.ticker, isBond, stack);

    html += '<details class="pf-ticker-manage">' +
      '<summary class="pf-ticker-manage-summary">' +
        '<span class="pf-ticker-manage-copy">' +
          '<span class="pf-ticker-manage-title">Управление лотами и продажами</span>' +
          '<span class="pf-ticker-manage-hint muted">Редактирование покупок, удаление лотов и отмена продаж</span>' +
        '</span>' +
      '</summary>' +
      '<div class="pf-ticker-manage-body">';

    html += '<div class="pf-ticker-detail-section pf-history-section--open-lots"><h4 class="pf-ticker-detail-h">Открытые покупки</h4>';
    if (!hist.openLots.length) {
      html += '<p class="muted pf-ticker-detail-empty">Открытых позиций по этой бумаге нет.</p>';
    } else if (stack) {
      html += '<div class="pf-stack-list">';
      hist.openLots.forEach(function (lot) {
        html += '<div class="pf-stack-item pf-op-card pf-open-lot">' +
          '<div class="pf-stack-meta">' +
            '<span class="pf-op-badge pf-op-badge--buy">покупка</span>' +
            '<span><span class="lbl">Дата</span> ' + escapeHtml(formatPortfolioDate(lot)) + '</span>' +
            '<span><span class="lbl">Кол-во</span> ' + escapeHtml(formatPortfolioQty(lot)) + '</span>' +
            '<span><span class="lbl">Цена</span> ' + escapeHtml(formatPositionAvg(lot, { bond: isBond })) + '</span>' +
          '</div>' +
          (lot.comment
            ? '<div class="pf-stack-comment muted">' + escapeHtml(lot.comment) + '</div>'
            : '') +
          '<div class="pf-row-actions">' +
            '<button type="button" class="ghost small pf-btn pf-btn-edit" data-pf-edit-lot="' + escapeHtml(lot.lotId || '') + '">Изменить</button> ' +
            '<button type="button" class="small pf-btn pf-btn-danger" data-pf-remove-lot="' + escapeHtml(lot.lotId || '') + '">Удалить</button>' +
          '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<table class="pf-mini-table pf-mini-table--open-lots"><thead><tr>' +
        '<th>Дата</th><th>Кол-во</th><th>Цена покупки</th><th>Комментарий</th><th></th>' +
        '</tr></thead><tbody>';
      hist.openLots.forEach(function (lot) {
        html += '<tr class="pf-open-lot-row">' +
          '<td>' + escapeHtml(formatPortfolioDate(lot)) + '</td>' +
          '<td>' + escapeHtml(formatPortfolioQty(lot)) + '</td>' +
          '<td>' + escapeHtml(formatPositionAvg(lot, { bond: isBond })) + '</td>' +
          '<td class="pf-comment">' + escapeHtml(lot.comment || '—') + '</td>' +
          '<td class="pf-row-actions">' +
            '<button type="button" class="ghost small pf-btn pf-btn-edit" data-pf-edit-lot="' + escapeHtml(lot.lotId || '') + '">Изменить</button> ' +
            '<button type="button" class="small pf-btn pf-btn-danger" data-pf-remove-lot="' + escapeHtml(lot.lotId || '') + '">Удалить</button>' +
          '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="pf-ticker-detail-section pf-history-section--sales"><h4 class="pf-ticker-detail-h">Продажи</h4>';
    if (!hist.sales.length) {
      html += '<p class="muted pf-ticker-detail-empty">Продаж по этой бумаге пока нет.</p>';
    } else {
      var sortedSales = hist.sales.slice().sort(function (a, b) {
        var da = a.saleDate || '';
        var db = b.saleDate || '';
        return da < db ? 1 : (da > db ? -1 : 0);
      });
      if (stack) {
        html += '<div class="pf-stack-list">';
        sortedSales.forEach(function (sale) {
          var pnl = getSaleRealizedPnl(sale, bondMeta);
          var pnlCls = pnl.amount != null && pnl.amount >= 0 ? 'pnl-pos' : 'pnl-neg';
          var buyLbl = formatPortfolioHistoryPrice(sale.buyPrice, sale.ticker, isBond, sale.currency);
          var sellLbl = formatPortfolioHistoryPrice(sale.salePrice, sale.ticker, isBond, sale.currency);
          html += '<div class="pf-stack-item pf-op-card pf-sale-row">' +
            '<div class="pf-stack-meta">' +
              '<span class="pf-op-badge pf-op-badge--sale">продажа</span>' +
              '<span><span class="lbl">Дата</span> ' + escapeHtml(formatPortfolioSaleDate(sale)) + '</span>' +
              '<span class="pf-sale-qty"><span class="lbl">Кол-во</span> −' + escapeHtml(String(sale.qty)) + '</span>' +
              '<span><span class="lbl">Продажа</span> ' + escapeHtml(sellLbl) + '</span>' +
              '<span><span class="lbl">Покупка</span> ' + escapeHtml(buyLbl) + '</span>' +
              '<span class="' + pnlCls + '"><span class="lbl">Результат</span> ' +
                escapeHtml(pnl.amount != null ? formatSignedRubAmount(pnl.amount) : '—') + '</span>' +
            '</div>' +
            '<div class="pf-row-actions">' +
              '<button type="button" class="ghost small pf-btn pf-btn-cancel" data-pf-undo-sale="' + escapeHtml(sale.saleId || '') + '">Отменить</button>' +
            '</div>';
          if (sale.allocations && sale.allocations.length) {
            html += '<div class="pf-alloc-box pf-allocation-box">' +
              '<div class="pf-alloc-title muted">Разбивка по покупкам</div>' +
              '<div class="pf-stack-list pf-stack-list--nested">';
            sale.allocations.forEach(function (alloc) {
              var allocPnl = getSaleAllocationPnlRub(alloc, sale, bondMeta);
              var aCls = allocPnl != null && allocPnl >= 0 ? 'pnl-pos' : 'pnl-neg';
              var allocDate = typeof safeFormatPortfolioDate === 'function'
                ? safeFormatPortfolioDate(alloc.buyDate)
                : (alloc.buyDate || '—');
              html += '<div class="pf-stack-item pf-stack-item--nested">' +
                '<div class="pf-stack-meta">' +
                  '<span><span class="lbl">Дата</span> ' + escapeHtml(allocDate || '—') + '</span>' +
                  '<span><span class="lbl">Кол-во</span> ' + escapeHtml(String(alloc.qty != null ? alloc.qty : '—')) + '</span>' +
                  '<span><span class="lbl">Цена</span> ' +
                    escapeHtml(formatPortfolioHistoryPrice(alloc.buyPrice, sale.ticker, isBond, sale.currency)) + '</span>' +
                  '<span class="' + (allocPnl != null ? aCls : 'muted') + '"><span class="lbl">Вклад</span> ' +
                    escapeHtml(allocPnl != null ? formatSignedRubAmount(allocPnl) : '—') + '</span>' +
                '</div></div>';
            });
            html += '</div></div>';
          }
          html += '</div>';
        });
        html += '</div>';
      } else {
        html += '<table class="pf-mini-table pf-mini-table--sales"><thead><tr>' +
          '<th>Дата</th><th>Кол-во</th><th>Цена продажи</th><th>Цена покупки</th><th>Результат</th><th></th>' +
          '</tr></thead><tbody>';
        sortedSales.forEach(function (sale) {
          var pnl = getSaleRealizedPnl(sale, bondMeta);
          var pnlCls = pnl.amount != null && pnl.amount >= 0 ? 'pnl-pos' : 'pnl-neg';
          var buyLbl = formatPortfolioHistoryPrice(sale.buyPrice, sale.ticker, isBond, sale.currency);
          var sellLbl = formatPortfolioHistoryPrice(sale.salePrice, sale.ticker, isBond, sale.currency);
          html += '<tr class="pf-sale-row">' +
            '<td><span class="pf-op-badge pf-op-badge--sale">продажа</span> ' +
              escapeHtml(formatPortfolioSaleDate(sale)) + '</td>' +
            '<td class="pf-sale-qty">−' + escapeHtml(String(sale.qty)) + '</td>' +
            '<td>' + escapeHtml(sellLbl) + '</td>' +
            '<td>' + escapeHtml(buyLbl) + '</td>' +
            '<td class="' + pnlCls + '">' +
              escapeHtml(pnl.amount != null ? formatSignedRubAmount(pnl.amount) : '—') +
            '</td>' +
            '<td class="pf-row-actions">' +
              '<button type="button" class="ghost small pf-btn pf-btn-cancel" data-pf-undo-sale="' + escapeHtml(sale.saleId || '') + '">Отменить</button>' +
            '</td></tr>';
          if (sale.allocations && sale.allocations.length) {
            html += '<tr class="pf-alloc-row"><td colspan="6"><div class="pf-alloc-box pf-allocation-box">' +
              '<div class="pf-alloc-title muted">Разбивка по покупкам</div>' +
              '<table class="pf-mini-table pf-mini-table--nested"><thead><tr>' +
              '<th>Дата покупки</th><th>Кол-во</th><th>Цена покупки</th><th>Вклад в результат</th>' +
              '</tr></thead><tbody>';
            sale.allocations.forEach(function (alloc) {
              var allocPnl = getSaleAllocationPnlRub(alloc, sale, bondMeta);
              var aCls = allocPnl != null && allocPnl >= 0 ? 'pnl-pos' : 'pnl-neg';
              var allocDate = typeof safeFormatPortfolioDate === 'function'
                ? safeFormatPortfolioDate(alloc.buyDate)
                : (alloc.buyDate || '—');
              html += '<tr>' +
                '<td>' + escapeHtml(allocDate || '—') + '</td>' +
                '<td>' + escapeHtml(String(alloc.qty != null ? alloc.qty : '—')) + '</td>' +
                '<td>' + escapeHtml(formatPortfolioHistoryPrice(alloc.buyPrice, sale.ticker, isBond, sale.currency)) + '</td>' +
                '<td class="' + (allocPnl != null ? aCls : 'muted') + '">' +
                  escapeHtml(allocPnl != null ? formatSignedRubAmount(allocPnl) : '—') +
                '</td></tr>';
            });
            html += '</tbody></table></div></td></tr>';
          }
        });
        html += '</tbody></table>';
      }
    }
    html += '</div></div></details></div>';
    return html;
  }

  function buildPortfolioMobileCardHtml(agg, bondMeta, sleeveTotal, allPositions, allSales) {
    var ticker = normalizeTicker(agg && agg.ticker);
    if (!ticker) return '';
    var isBond = isPortfolioBondPosition(agg);
    var marketVal = getPositionMarketValue(agg, bondMeta);
    var weight = formatPortfolioWeightPct(marketVal, sleeveTotal);
    var pnl = isBond ? null : getPositionReturnPct(agg);
    var cls = pnl != null && pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
    var avg = formatPositionAvg(agg, { bond: isBond });
    var cur = formatPositionPrice(agg, { bond: isBond });
    var mBadge = typeof Markets !== 'undefined'
      ? ' <span class="market-badge market-badge--' + (agg.market === 'US' ? 'us' : 'ru') + '">' +
          escapeHtml(Markets.marketBadgeLabel(agg.market || 'RU')) + '</span>'
      : '';
    var extra = isBond
      ? '<span>Погашение</span><span>' + (bondMeta && bondMeta.matDate
        ? escapeHtml(typeof formatOfzDate === 'function' ? formatOfzDate(bondMeta.matDate) : bondMeta.matDate)
        : '—') + '</span>'
      : '<span>Доходность</span><span class="' + cls + '">' + escapeHtml(formatSignedPct(pnl, 2)) + '</span>';
    var open = !!(state.pfHistoryTickers && state.pfHistoryTickers[ticker]);
    var sellable = getPortfolioSellableQty(ticker);
    var actions = '<div class="portfolio-card-actions pf-row-actions">' +
      (sellable > 0
        ? '<button type="button" class="ghost small pf-btn pf-btn-edit" data-pf-sell-ticker="' +
            escapeHtml(ticker) + '">Продать</button> '
        : '') +
      buildPortfolioHistoryToggleBtn(ticker) +
      '</div>';
    var detail = open
      ? buildPortfolioTickerDetailHtml(ticker, allPositions, allSales, bondMeta, isBond, { layout: 'stack' })
      : '';
    return '<div class="portfolio-card' + (open ? ' portfolio-card--open' : '') +
      '" data-chart-ticker="' + escapeHtml(ticker) + '">' +
      '<div class="ticker">' + escapeHtml(ticker) + mBadge + '</div>' +
      '<div class="grid"><span>Доля</span><span>' + escapeHtml(weight) + '</span>' +
      '<span>Ср. цена</span><span>' + escapeHtml(avg) + '</span>' +
      '<span>Текущая</span><span>' + escapeHtml(cur) + '</span>' +
      extra + '</div>' +
      actions +
      (detail ? '<div class="portfolio-card-detail">' + detail + '</div>' : '') +
      '</div>';
  }

  function buildPortfolioTickerDetailRow(ticker, positions, sales, bondMeta, isBond, opts) {
    opts = opts || {};
    var t = normalizeTicker(ticker);
    return '<tr class="pf-ticker-detail-row' + (opts.groupClass || '') +
      '" data-pf-detail-ticker="' + escapeHtml(t) + '">' +
      '<td colspan="' + PF_TABLE_COLS + '">' +
        buildPortfolioTickerDetailHtml(t, positions, sales, bondMeta, isBond) +
      '</td></tr>';
  }



  function buildPortfolioSectionRows(positions, sectionKind, bondMetaMap, sales) {
    bondMetaMap = bondMetaMap || {};
    sales = sales || [];
    // Только открытые лоты (qty > 0). Полностью проданные — в блоке «Закрытые позиции».
    var groups = groupPortfolioLotsForTable(positions, sectionKind);
    if (!groups.length) {
      return '<tr class="pf-section-empty"><td colspan="' + PF_TABLE_COLS + '" class="muted">Нет открытых позиций</td></tr>';
    }
    var isBond = sectionKind === 'bonds';
    var sleeveTotal = 0;
    groups.forEach(function (g) {
      g.lots.forEach(function (p) {
        sleeveTotal += getPositionMarketValue(p, bondMetaMap[g.ticker]);
      });
    });

    var html = '';
    groups.forEach(function (group, groupIdx) {
      var lots = group.lots;
      var zebra = groupIdx % 2 === 0 ? ' pf-zebra-a' : ' pf-zebra-b';
      var groupBase = ' pf-ticker-group pf-card-group' + zebra;
      if (groupIdx > 0) {
        html += '<tr class="pf-card-gap" aria-hidden="true"><td colspan="' + PF_TABLE_COLS + '"></td></tr>';
      }
      // Продажи не дублируем в обзорной таблице — только в «Подробнее» / «Закрытые» / «Недавние».
      var expanded = state.pfExpandedTickers && state.pfExpandedTickers[group.ticker];
      var collapsible = lots.length > PF_LOT_COLLAPSE_THRESHOLD;
      var visibleLots = collapsible && !expanded ? lots.slice(0, PF_LOT_COLLAPSE_THRESHOLD) : lots;
      var hiddenCount = collapsible && !expanded ? lots.length - visibleLots.length : 0;
      var visibleRowSpan = visibleLots.length || 1;
      var hasDetail = !!(state.pfHistoryTickers && state.pfHistoryTickers[group.ticker]);
      var hasToggle = hiddenCount > 0 || (collapsible && expanded);
      var endKind = hasDetail ? 'detail' : (hasToggle ? 'toggle' : 'lot');

      visibleLots.forEach(function (p, idx) {
        var isPrimary = idx === 0;
        var isEnd = endKind === 'lot' && idx === visibleLots.length - 1;
        html += buildPortfolioLotRow(p, group, {
          isBond: isBond,
          bondMetaMap: bondMetaMap,
          sleeveTotal: sleeveTotal,
          lotIndex: idx,
          rowSpan: visibleRowSpan,
          incomeRowSpan: visibleRowSpan,
          showIncome: isPrimary,
          groupClass: groupBase +
            (isPrimary ? ' pf-ticker-group-start pf-lot-primary' : ' pf-lot-nested') +
            (isEnd ? ' pf-ticker-group-end' : '')
        });
      });

      if (hiddenCount > 0) {
        html += '<tr class="pf-lot-toggle-row' + groupBase +
          (endKind === 'toggle' ? ' pf-ticker-group-end' : '') +
          '"><td colspan="' + PF_TABLE_COLS + '">' +
          '<button type="button" class="ghost small pf-lot-toggle" data-pf-expand-lots="' + escapeHtml(group.ticker) + '">' +
          'Показать ещё ' + hiddenCount + ' ' + (hiddenCount === 1 ? 'покупку' : (hiddenCount < 5 ? 'покупки' : 'покупок')) +
          '</button></td></tr>';
      } else if (collapsible && expanded) {
        html += '<tr class="pf-lot-toggle-row' + groupBase +
          (endKind === 'toggle' ? ' pf-ticker-group-end' : '') +
          '"><td colspan="' + PF_TABLE_COLS + '">' +
          '<button type="button" class="ghost small pf-lot-toggle" data-pf-collapse-lots="' + escapeHtml(group.ticker) + '">' +
          'Свернуть покупки ' + escapeHtml(group.ticker) +
          '</button></td></tr>';
      }

      if (hasDetail) {
        html += buildPortfolioTickerDetailRow(
          group.ticker,
          positions,
          sales,
          bondMetaMap[group.ticker] || null,
          isBond,
          { groupClass: groupBase + (endKind === 'detail' ? ' pf-ticker-group-end' : '') }
        );
      }
    });
    return html;
  }

  function buildPortfolioColumnSubheadRow() {
    var cols = [
      'Тикер', 'Доля', 'Кол-во', 'Цена покупки', 'Ср. цена', 'Дата',
      'Текущая', 'Доходн.', 'Погашение', 'Выплаты 12 мес.', 'Коммент.', ''
    ];
    return '<tr class="pf-col-subhead">' +
      cols.map(function (label) {
        return '<th scope="col">' + escapeHtml(label) + '</th>';
      }).join('') +
      '</tr>';
  }

  function buildPortfolioTableHtml(positions, bondMetaMap, sales) {
    sales = sales || [];
    var openStocks = groupPortfolioLotsForTable(positions, 'stocks');
    var openBonds = groupPortfolioLotsForTable(positions, 'bonds');
    if (!openStocks.length && !openBonds.length) {
      var hasAnyData = (positions && positions.length) || sales.length;
      return '<tr><td colspan="' + PF_TABLE_COLS + '" class="muted">' +
        (hasAnyData
          ? 'Нет открытых позиций — закрытые бумаги ниже'
          : 'Портфель пуст — добавьте позицию выше') +
        '</td></tr>';
    }
    var html = '';
    if (openStocks.length) {
      html += '<tr class="pf-section-head"><th colspan="' + PF_TABLE_COLS + '">Акции · доля внутри класса</th></tr>';
      html += buildPortfolioSectionRows(positions, 'stocks', bondMetaMap, sales);
    }
    if (openBonds.length) {
      html += '<tr class="pf-section-head"><th colspan="' + PF_TABLE_COLS + '">Облигации (ОФЗ) · доля внутри класса</th></tr>';
      html += buildPortfolioColumnSubheadRow();
      html += buildPortfolioSectionRows(positions, 'bonds', bondMetaMap, sales);
    }
    return html;
  }

  function buildPortfolioClosedCardHtml(item, positions, sales, bondMeta) {
    var ticker = item.ticker;
    var hist = item.hist;
    var isBond = !!item.isBond;
    var open = !!(state.pfHistoryTickers && state.pfHistoryTickers[ticker]);
    var rCls = hist.realizedPnlRub >= 0 ? 'pnl-pos' : 'pnl-neg';
    var lastLbl = formatPortfolioSaleDate({ saleDate: item.lastSaleDate });
    var actions = '<div class="portfolio-closed-card-actions pf-row-actions">' +
      buildPortfolioHistoryToggleBtn(ticker) + ' ';
    if (item.hidden) {
      actions += '<button type="button" class="ghost small pf-btn pf-btn-restore-closed" data-pf-restore-closed="' +
        escapeHtml(ticker) + '">Вернуть в список</button>';
    } else {
      actions += '<button type="button" class="ghost small pf-btn pf-btn-hide-closed" data-pf-hide-closed="' +
        escapeHtml(ticker) + '">Скрыть из списка</button>';
    }
    actions += '</div>';
    var detail = open
      ? '<div class="portfolio-closed-card-detail portfolio-card-detail">' +
          buildPortfolioTickerDetailHtml(ticker, positions, sales, bondMeta, isBond, { layout: 'stack' }) +
        '</div>'
      : '';
    return '<div class="portfolio-closed-card' + (open ? ' portfolio-closed-card--open' : '') +
      (item.hidden ? ' portfolio-closed-card--hidden' : '') +
      '" data-pf-closed-ticker="' + escapeHtml(ticker) + '">' +
      '<div class="ticker">' + escapeHtml(ticker) +
        (item.hidden ? ' <span class="pf-closed-hidden-badge muted">скрыто</span>' : '') +
      '</div>' +
      '<div class="grid portfolio-closed-card-grid">' +
        '<span>Продано всего</span><span>' + escapeHtml(String(hist.totalSoldQty)) + ' шт.</span>' +
        '<span>Зафиксированный результат</span>' +
          '<span class="' + rCls + '">' + escapeHtml(formatSignedRubAmount(hist.realizedPnlRub)) + '</span>' +
        '<span>Последняя продажа</span><span>' + escapeHtml(lastLbl) + '</span>' +
      '</div>' +
      actions +
      detail +
      '</div>';
  }

  function buildPortfolioClosedSectionHtml(closedItems, positions, sales, bondMetaMap) {
    closedItems = closedItems || [];
    if (!closedItems.length) return '';
    bondMetaMap = bondMetaMap || {};
    var showHidden = !!state.pfShowHiddenClosed;
    var hiddenCount = 0;
    closedItems.forEach(function (c) { if (c.hidden) hiddenCount += 1; });
    var visible = closedItems.filter(function (c) {
      return showHidden ? true : !c.hidden;
    });

    var html = '<div class="portfolio-closed-head">' +
      '<h3 class="portfolio-closed-title">Закрытые позиции</h3>' +
      '<p class="muted portfolio-closed-desc">Бумаги, по которым весь остаток продан. История сделок сохраняется.</p>' +
      '</div>';

    if (hiddenCount > 0 && !showHidden) {
      html += '<div class="portfolio-closed-toolbar">' +
        '<button type="button" class="ghost small pf-btn pf-show-hidden-closed" data-pf-show-hidden-closed>' +
        'Показать скрытые закрытые позиции' +
        (hiddenCount > 1 ? ' (' + hiddenCount + ')' : '') +
        '</button></div>';
    } else if (hiddenCount > 0 && showHidden) {
      html += '<div class="portfolio-closed-toolbar">' +
        '<button type="button" class="ghost small pf-btn" data-pf-collapse-hidden-closed>' +
        'Скрыть скрытые закрытые позиции</button></div>';
    }

    if (!visible.length) {
      html += '<p class="muted portfolio-closed-empty">Все закрытые позиции скрыты из списка.</p>';
      return html;
    }

    html += '<div class="portfolio-closed-list">';
    visible.forEach(function (item) {
      html += buildPortfolioClosedCardHtml(item, positions, sales, bondMetaMap[item.ticker] || null);
    });
    html += '</div>';
    return html;
  }

  function renderPortfolioClosedPositions(positions, sales, bondMetaMap) {
    var section = document.getElementById('portfolioClosedSection');
    if (!section) return;
    var closedItems = listClosedPortfolioPositions(positions, sales, bondMetaMap);
    if (!closedItems.length) {
      section.hidden = true;
      section.innerHTML = '';
      return;
    }
    section.hidden = false;
    section.innerHTML = buildPortfolioClosedSectionHtml(closedItems, positions, sales, bondMetaMap);
  }

  function formatRecentOperationDate(iso) {
    if (!iso) return '—';
    if (typeof safeFormatPortfolioDate === 'function') return safeFormatPortfolioDate(iso);
    try {
      var lbl = new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU');
      return lbl && !/invalid/i.test(lbl) ? lbl : '—';
    } catch (e) {
      return '—';
    }
  }

  function formatRecentOperationPrice(price, isBond, ticker) {
    if (price == null || !isFinite(Number(price))) return '—';
    return formatPositionAvg({
      avgPrice: Number(price),
      currency: 'RUB',
      ticker: ticker || ''
    }, { bond: !!isBond });
  }

  function buildRecentOperationCardHtml(op, idx) {
    if (!op) return '';
    var isBuy = op.kind === 'buy';
    var zebra = (idx % 2 === 0) ? ' pf-zebra-a' : ' pf-zebra-b';
    var badge = isBuy
      ? '<span class="pf-op-badge pf-op-badge--buy">покупка</span>'
      : '<span class="pf-op-badge pf-op-badge--sale">продажа</span>';
    var qtyLbl = op.qty != null && isFinite(op.qty)
      ? (isBuy ? String(op.qty) : '−' + String(op.qty)) + ' шт.'
      : '—';
    var priceLbl = formatRecentOperationPrice(op.price, op.isBond, op.ticker);
    var dateLbl = formatRecentOperationDate(op.date);
    var pnlHtml = '';
    if (!isBuy) {
      var rCls = op.realizedPnlRub != null && op.realizedPnlRub >= 0 ? 'pnl-pos' : 'pnl-neg';
      pnlHtml = '<span class="portfolio-recent-kpi"><span class="lbl">Результат</span> ' +
        '<span class="' + (op.realizedPnlRub != null ? rCls : 'muted') + '">' +
        escapeHtml(op.realizedPnlRub != null ? formatSignedRubAmount(op.realizedPnlRub) : '—') +
        '</span></span>';
    }
    var buyPxHtml = '';
    if (!isBuy && op.buyPrice != null && isFinite(op.buyPrice)) {
      buyPxHtml = '<span class="portfolio-recent-kpi"><span class="lbl">Покупка</span> ' +
        escapeHtml(formatRecentOperationPrice(op.buyPrice, op.isBond, op.ticker)) + '</span>';
    }
    var commentHtml = op.comment
      ? '<div class="portfolio-recent-comment muted">' + escapeHtml(op.comment) + '</div>'
      : '';
    return '<div class="portfolio-recent-card portfolio-recent-card--interactive pf-op-card ' +
      (isBuy ? 'pf-open-lot' : 'pf-sale-row') + zebra +
      '" data-pf-open-history="' + escapeHtml(op.ticker) +
      '" role="button" tabindex="0" aria-label="Подробнее по ' + escapeHtml(op.ticker) + '">' +
      '<div class="portfolio-recent-meta">' +
        '<span class="portfolio-recent-date">' + escapeHtml(dateLbl) + '</span>' +
        '<span class="portfolio-recent-ticker pf-recent-open-history">' + escapeHtml(op.ticker) + '</span>' +
        badge +
        '<span class="portfolio-recent-more">Подробнее</span>' +
      '</div>' +
      '<div class="portfolio-recent-kpis">' +
        '<span class="portfolio-recent-kpi"><span class="lbl">Кол-во</span> ' + escapeHtml(qtyLbl) + '</span>' +
        '<span class="portfolio-recent-kpi"><span class="lbl">' + (isBuy ? 'Цена' : 'Продажа') + '</span> ' +
          escapeHtml(priceLbl) + '</span>' +
        buyPxHtml +
        pnlHtml +
      '</div>' +
      commentHtml +
      '</div>';
  }

  function buildPortfolioRecentSectionHtml(ops) {
    var html = '<div class="portfolio-recent-head">' +
      '<h3 class="portfolio-recent-title">Недавние операции</h3>' +
      '<p class="muted portfolio-recent-desc">Покупки и продажи из вашего портфеля.</p>' +
      '</div>';
    if (!ops || !ops.length) {
      html += '<p class="muted portfolio-recent-empty">Операций пока нет. Добавьте покупку или зафиксируйте продажу — они появятся здесь.</p>';
      return html;
    }
    html += '<div class="portfolio-recent-list">';
    ops.forEach(function (op, idx) {
      html += buildRecentOperationCardHtml(op, idx);
    });
    html += '</div>';
    return html;
  }

  function renderPortfolioRecentOperations(positions, sales, bondMetaMap) {
    var section = document.getElementById('portfolioRecentSection');
    if (!section) return;
    var ops = collectRecentPortfolioOperations(positions, sales, {
      bondMetaMap: bondMetaMap || {}
    });
    section.hidden = false;
    section.innerHTML = buildPortfolioRecentSectionHtml(ops);
  }

  function buildPortfolioTableRows(positions) {
    return buildPortfolioTableHtml(positions, {});
  }



  function renderPortfolioTableBody() {
    var renderId = ++state.pfTableRenderId;
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
          renderPortfolioClosedPositions([], [], {});
      renderPortfolioRecentOperations([], [], {});
      refreshPortfolioAsOfIfShown();
      return;
    }

    renderPortfolioClosedPositions(positions, sales, {});
    renderPortfolioRecentOperations(positions, sales, {});

    var closedSeed = listClosedPortfolioPositions(positions, sales, {});
    var bondMetaSeed = (positions || []).slice();
    closedSeed.forEach(function (c) {
      if (!c.isBond) return;
      bondMetaSeed.push({ ticker: c.ticker, qty: 0 });
    });

    Promise.all([
      loadPortfolioBondMetaMap(bondMetaSeed),
      loadPortfolioIncomeTotals(positions)
    ]).then(function (parts) {
      if (renderId !== state.pfTableRenderId) return;
      positions = getFilteredPortfolioPositions();
      sales = getPortfolio().sales || [];
      var bondMetaMap = parts[0] || {};
      var incomeTotals = parts[1] || { paid12m: 0, forecast12m: 0 };
      var html = buildPortfolioTableHtml(positions, bondMetaMap, sales);
      ['portfolioTableBody', 'portfolioWatchTableBody'].forEach(function (id) {
        var tbody = document.getElementById(id);
        if (tbody) tbody.innerHTML = html;
      });
      renderPortfolioSummary(positions, bondMetaMap, incomeTotals, sales);
      renderPortfolioClosedPositions(positions, sales, bondMetaMap);
      renderPortfolioRecentOperations(positions, sales, bondMetaMap);
      refreshPortfolioAsOfIfShown();

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
          if (aggQty <= 1e-9) return;
          fetchFn(t, aggQty).then(function (cellHtml) {
            document.querySelectorAll('[data-pf-div-cell="' + t + '"]').forEach(function (cell) {
              cell.innerHTML = cellHtml;
            });
          });
        });
      }

      var cards = document.getElementById('portfolioCards');
      if (!cards) return;
      var paperPositions = getPortfolioPaperPositions().filter(function (p) {
        var q = Number(p.qty);
        return isFinite(q) && q > 1e-9;
      });
      cards.innerHTML = paperPositions.map(function (p) {
        var isBond = isPortfolioBondPosition(p);
        var bondMeta = bondMetaMap[p.ticker] || null;
        var sleeveTotal = isBond ? bondTotal : stockTotal;
        return buildPortfolioMobileCardHtml(p, bondMeta, sleeveTotal, positions, sales);
      }).join('');
    });
  }

  var pfAsOfShown = false;
  var pfAsOfSeq = 0;
  var PF_ASOF_BTN_IDLE = 'Показать состав';
  var PF_ASOF_BTN_BUSY = 'Считаю…';
  var PF_ASOF_BUSY_HINT = 'Подбираем цены закрытия на выбранную дату…';
  var PF_ASOF_REFRESH_HINT = 'Обновляем расчёт…';
  var PF_ASOF_ERROR = 'Не удалось рассчитать стоимость на дату. Попробуйте ещё раз.';
  var PF_ASOF_EMPTY = 'На выбранную дату открытых позиций нет';
  var PF_ASOF_BELOW = 'Ниже — состав и стоимость каждой позиции на выбранную дату.';
  var PF_ASOF_FOOT = 'Оценка считается по цене закрытия на выбранную или ближайшую предыдущую торговую дату. Для облигаций — по чистой цене, без исторического НКД.';

  function formatAsOfQtyDisplay(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    return String(asOfRoundQty(n));
  }

  function formatAsOfDateDisplay(iso) {
    if (typeof safeFormatPortfolioDate === 'function') return safeFormatPortfolioDate(iso);
    var n = timelineIsoDate(iso);
    if (!n) return '—';
    try {
      var lbl = new Date(n + 'T12:00:00').toLocaleDateString('ru-RU');
      return lbl && !/invalid/i.test(lbl) ? lbl : '—';
    } catch (e) {
      return '—';
    }
  }

  function initPortfolioAsOfDateDefault() {
    var input = document.getElementById('pfAsOfDate');
    if (!input) return;
    if (input.value && timelineIsoDate(input.value)) {
      syncPortfolioAsOfDateChip();
      return;
    }
    var today = localPortfolioTodayYmd();
    var iso = typeof normalizePortfolioDate === 'function' ? normalizePortfolioDate(today) : today;
    if (iso) input.value = iso;
    syncPortfolioAsOfDateChip();
  }

  function syncPortfolioAsOfDateChip() {
    var chip = document.getElementById('pfAsOfDateChip');
    var input = document.getElementById('pfAsOfDate');
    if (!chip) return;
    var iso = input ? timelineIsoDate(input.value) : '';
    chip.textContent = iso ? formatAsOfDateDisplay(iso) : '—';
  }

  function revealPortfolioAsOfPanel() {
    var panel = document.getElementById('pfAsOfPanel');
    var block = document.getElementById('portfolioAsOfBlock');
    if (panel) panel.hidden = false;
    if (block) block.classList.add('pf-asof-block--open');
  }

  function ruCountWord(n, one, few, many) {
    var abs = Math.abs(Number(n)) % 100;
    var n1 = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (n1 === 1) return one;
    if (n1 >= 2 && n1 <= 4) return few;
    return many;
  }

  function asOfRowType(row) {
    return row && (row.type === 'bond' || row.type === 'stock') ? row.type : '';
  }

  function asOfAllTypesKnown(items) {
    return !!(items && items.length && items.every(function (row) {
      return !!asOfRowType(row);
    }));
  }

  function asOfRowNoteText(row) {
    var notes = row && Array.isArray(row.notes) ? row.notes.slice() : [];
    if (!notes.length && row && row.note) notes = [row.note];
    return notes.filter(function (n) {
      var t = String(n || '').trim();
      return t && t !== '—';
    }).join('; ');
  }

  function asOfShouldShowNotes(items) {
    return (items || []).some(function (row) {
      if (!row) return false;
      if (row.hasIncompleteHistory) return true;
      if (row.status === 'missing' || row.status === 'unsupported') return true;
      return !!asOfRowNoteText(row);
    });
  }

  function formatAsOfClosePriceDisplay(row) {
    if (!row || row.status !== 'ok' || row.price == null || !isFinite(Number(row.price))) return '—';
    var n = Number(row.price);
    var num = n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (row.unit === 'pct-of-face-value') return num + '%';
    return num + ' ₽';
  }

  function formatAsOfValueDisplay(row) {
    if (!row || row.status !== 'ok' || row.valueRub == null || !isFinite(Number(row.valueRub))) return '—';
    return formatPortfolioRubAmount(row.valueRub);
  }

  function sortAsOfItemsForDisplay(items) {
    var copy = (items || []).slice();
    if (!asOfAllTypesKnown(copy)) return copy;
    copy.sort(function (a, b) {
      var ga = asOfRowType(a) === 'bond' ? 1 : 0;
      var gb = asOfRowType(b) === 'bond' ? 1 : 0;
      if (ga !== gb) return ga - gb;
      return String(a.ticker || '').localeCompare(String(b.ticker || ''), 'ru');
    });
    return copy;
  }

  function asOfShouldShowGroups(items) {
    if (!asOfAllTypesKnown(items)) return false;
    var hasStock = items.some(function (row) { return asOfRowType(row) === 'stock'; });
    var hasBond = items.some(function (row) { return asOfRowType(row) === 'bond'; });
    return hasStock && hasBond;
  }

  function asOfMiniKpiHtml(lbl, val, extraClass) {
    return '<div class="pf-asof-kpi pf-asof-kpi--mini' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<span class="pf-asof-kpi-lbl">' + escapeHtml(lbl) + '</span>' +
      '<span class="pf-asof-kpi-val">' + escapeHtml(val) + '</span>' +
    '</div>';
  }

  function buildPortfolioAsOfBoardHtml(result, items) {
    items = items || [];
    var n = items.length;
    var dateLbl = formatAsOfDateDisplay(result && result.targetDate);
    var dateSub = dateLbl && dateLbl !== '—' ? 'на ' + dateLbl : '';
    var hasValue = !!(result && result.totalValueRub != null && isFinite(Number(result.totalValueRub)));
    var mainClass = 'pf-asof-kpi pf-asof-kpi--main';
    var lbl;
    var val;
    var sub;
    if (!n) {
      mainClass += ' pf-asof-kpi--empty';
      lbl = 'Стоимость портфеля на дату';
      val = PF_ASOF_EMPTY;
      sub = dateSub;
    } else if (result && result.isPartial) {
      mainClass += ' pf-asof-kpi--partial';
      lbl = 'Оценено на дату';
      val = hasValue ? formatPortfolioRubAmount(result.totalValueRub) : '—';
      sub = 'часть бумаг без цены';
    } else {
      lbl = 'Стоимость портфеля на дату';
      val = hasValue ? formatPortfolioRubAmount(result.totalValueRub) : '—';
      sub = dateSub;
    }
    var side = '';
    if (n) {
      side += asOfMiniKpiHtml('Бумаг', String(n));
      if (asOfAllTypesKnown(items)) {
        var stocks = items.filter(function (row) { return asOfRowType(row) === 'stock'; }).length;
        var bonds = items.filter(function (row) { return asOfRowType(row) === 'bond'; }).length;
        side += asOfMiniKpiHtml('Акции', String(stocks));
        side += asOfMiniKpiHtml('ОФЗ', String(bonds));
      }
      var noPrice = Number((result && result.missingItemsCount) || 0) +
        Number((result && result.unsupportedItemsCount) || 0);
      if (noPrice > 0) side += asOfMiniKpiHtml('Без цены', String(noPrice), 'pf-asof-kpi--warn');
    }
    return '<div class="pf-asof-board">' +
      '<div class="' + mainClass + '">' +
        '<span class="pf-asof-kpi-lbl">' + escapeHtml(lbl) + '</span>' +
        '<span class="pf-asof-kpi-val">' + escapeHtml(val) + '</span>' +
        (sub ? '<span class="pf-asof-kpi-sub">' + escapeHtml(sub) + '</span>' : '') +
      '</div>' +
      (side ? '<div class="pf-asof-kpis-side">' + side + '</div>' : '') +
    '</div>';
  }

  function asOfPaperCellHtml(row) {
    var paper = '<span class="pf-asof-ticker">' + escapeHtml(row.ticker) + '</span>';
    if (row.name && row.name !== row.ticker) {
      paper += ' <span class="muted pf-asof-name">' + escapeHtml(row.name) + '</span>';
    }
    return paper;
  }

  function buildPortfolioAsOfCardsHtml(items, showNotes, showGroups) {
    var html = '';
    var lastGroup = '';
    (items || []).forEach(function (row) {
      var kind = asOfRowType(row);
      if (showGroups && kind && kind !== lastGroup) {
        lastGroup = kind;
        html += '<p class="pf-asof-card-group">' + (kind === 'bond' ? 'ОФЗ' : 'Акции') + '</p>';
      }
      var note = showNotes ? asOfRowNoteText(row) : '';
      html += '<article class="pf-asof-card' + (kind ? ' pf-asof-card--' + kind : '') + '">' +
        '<div class="pf-asof-card-head">' +
          asOfPaperCellHtml(row) +
        '</div>' +
        '<div class="pf-asof-card-kpis">' +
          '<span class="pf-asof-card-qty"><span class="lbl">Кол-во на дату</span> ' + escapeHtml(formatAsOfQtyDisplay(row.qtyAtDate)) + '</span>' +
          '<span class="pf-asof-card-value"><span class="lbl">Стоимость позиции на дату</span> ' + escapeHtml(formatAsOfValueDisplay(row)) + '</span>' +
          '<span><span class="lbl">Цена за 1 шт. на дату</span> ' + escapeHtml(formatAsOfClosePriceDisplay(row)) + '</span>' +
          '<span><span class="lbl">Дата цены</span> ' + escapeHtml(formatAsOfDateDisplay(row.priceDate)) + '</span>' +
          '<span><span class="lbl">Куплено</span> ' + escapeHtml(formatAsOfQtyDisplay(row.boughtQtyUpToDate)) + '</span>' +
          '<span><span class="lbl">Продано</span> ' + escapeHtml(formatAsOfQtyDisplay(row.soldQtyUpToDate)) + '</span>' +
          '<span><span class="lbl">Первая покупка</span> ' + escapeHtml(formatAsOfDateDisplay(row.firstBuyDate)) + '</span>' +
          '<span><span class="lbl">Последняя операция</span> ' + escapeHtml(formatAsOfDateDisplay(row.lastOperationDate)) + '</span>' +
        '</div>' +
        (note ? '<p class="muted pf-asof-card-note">' + escapeHtml(note) + '</p>' : '') +
      '</article>';
    });
    return html;
  }

  function buildPortfolioAsOfTableHtml(items) {
    items = sortAsOfItemsForDisplay(items);
    var showNotes = asOfShouldShowNotes(items);
    var showGroups = asOfShouldShowGroups(items);
    var colCount = showNotes ? 10 : 9;
    var lastGroup = '';
    var rows = items.map(function (row) {
      var kind = asOfRowType(row);
      var html = '';
      if (showGroups && kind && kind !== lastGroup) {
        lastGroup = kind;
        html += '<tr class="pf-asof-group"><td colspan="' + colCount + '">' +
          (kind === 'bond' ? 'ОФЗ' : 'Акции') +
        '</td></tr>';
      }
      html += '<tr class="pf-asof-row' + (kind ? ' pf-asof-row--' + kind : '') +
        (row.status === 'missing' || row.status === 'unsupported' ? ' pf-asof-row--muted' : '') + '">' +
        '<td class="pf-asof-td-paper">' + asOfPaperCellHtml(row) + '</td>' +
        '<td class="pf-asof-td-qty">' + escapeHtml(formatAsOfQtyDisplay(row.qtyAtDate)) + '</td>' +
        '<td class="pf-asof-col-ops">' + escapeHtml(formatAsOfQtyDisplay(row.boughtQtyUpToDate)) + '</td>' +
        '<td class="pf-asof-col-ops">' + escapeHtml(formatAsOfQtyDisplay(row.soldQtyUpToDate)) + '</td>' +
        '<td class="pf-asof-td-price">' + escapeHtml(formatAsOfClosePriceDisplay(row)) + '</td>' +
        '<td class="pf-asof-td-pdate">' + escapeHtml(formatAsOfDateDisplay(row.priceDate)) + '</td>' +
        '<td class="pf-asof-td-value">' + escapeHtml(formatAsOfValueDisplay(row)) + '</td>' +
        '<td class="pf-asof-col-hist">' + escapeHtml(formatAsOfDateDisplay(row.firstBuyDate)) + '</td>' +
        '<td class="pf-asof-col-hist">' + escapeHtml(formatAsOfDateDisplay(row.lastOperationDate)) + '</td>' +
        (showNotes
          ? '<td class="muted pf-asof-td-note">' + escapeHtml(asOfRowNoteText(row) || '—') + '</td>'
          : '') +
      '</tr>';
      return html;
    }).join('');
    return '<div class="pf-asof-table-wrap">' +
      '<table class="pf-asof-table' + (showNotes ? '' : ' pf-asof-table--no-notes') + '">' +
        '<thead><tr>' +
          '<th>Бумага</th><th>Кол-во на дату</th>' +
          '<th class="pf-asof-col-ops">Куплено</th><th class="pf-asof-col-ops">Продано</th>' +
          '<th class="pf-asof-th-price"><span class="pf-asof-th-full">Цена за 1 шт. на дату</span><span class="pf-asof-th-short">Цена за 1 шт.</span></th>' +
          '<th>Дата цены</th>' +
          '<th class="pf-asof-th-value"><span class="pf-asof-th-full">Стоимость позиции на дату</span><span class="pf-asof-th-short">Стоимость позиции</span></th>' +
          '<th class="pf-asof-col-hist">Первая покупка</th><th class="pf-asof-col-hist">Последняя операция</th>' +
          (showNotes ? '<th>Примечание</th>' : '') +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="pf-asof-cards">' + buildPortfolioAsOfCardsHtml(items, showNotes, showGroups) + '</div>';
  }

  function setPortfolioAsOfBusy(on, refreshing) {
    var btn = document.getElementById('pfAsOfBtn');
    var status = document.getElementById('pfAsOfStatus');
    var host = document.getElementById('pfAsOfResultHost');
    var overlay = document.getElementById('pfAsOfOverlay');
    var block = document.getElementById('portfolioAsOfBlock');
    var overlayOn = !!(on && refreshing);
    if (btn) {
      btn.disabled = !!on;
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
      btn.textContent = on ? PF_ASOF_BTN_BUSY : PF_ASOF_BTN_IDLE;
    }
    if (status) {
      if (on) {
        status.hidden = false;
        status.textContent = overlayOn ? PF_ASOF_REFRESH_HINT : PF_ASOF_BUSY_HINT;
      } else {
        status.hidden = true;
        status.textContent = '';
      }
    }
    if (block) block.classList.toggle('pf-asof-block--busy', !!on);
    if (host) {
      host.classList.toggle('pf-asof-result-host--busy', overlayOn);
      host.setAttribute('aria-busy', overlayOn ? 'true' : 'false');
    }
    if (overlay) overlay.hidden = !overlayOn;
  }

  function renderPortfolioAsOfResult(result, errorText) {
    var out = document.getElementById('pfAsOfResult');
    var warn = document.getElementById('pfAsOfWarn');
    revealPortfolioAsOfPanel();
    syncPortfolioAsOfDateChip();
    if (warn) {
      warn.hidden = true;
      warn.textContent = '';
    }
    if (!out) return;
    if (errorText) {
      out.innerHTML = '<p class="muted pf-asof-empty">' + escapeHtml(errorText) + '</p>';
      return;
    }
    if (!result || result.invalidDate) {
      out.innerHTML = '<p class="muted pf-asof-empty">Укажите корректную дату.</p>';
      return;
    }
    if (result.hasIncompleteHistory && warn) {
      warn.hidden = false;
      warn.textContent = 'Часть операций без корректной даты не включена в расчёт состава на дату.';
    }
    var items = result.items || [];
    var extra = '';
    if (result.isPartial && result.missingItemsCount > 0) {
      extra += '<p class="pf-asof-partial" role="status">Оценка рассчитана частично: по ' +
        escapeHtml(String(result.missingItemsCount)) + ' ' +
        escapeHtml(ruCountWord(result.missingItemsCount, 'бумаге', 'бумагам', 'бумагам')) +
        ' нет цены на выбранную дату.</p>';
    }
    if (result.unsupportedItemsCount > 0) {
      extra += '<p class="pf-asof-partial" role="status">Некоторые инструменты пока не поддерживаются для оценки на дату.</p>';
    }
    var foot = '<p class="pf-asof-foot">' + escapeHtml(PF_ASOF_FOOT) + '</p>';
    var below = items.length
      ? '<p class="pf-asof-below">' + escapeHtml(PF_ASOF_BELOW) + '</p>'
      : '';
    if (!items.length) {
      out.innerHTML = buildPortfolioAsOfBoardHtml(result, []) + extra + foot;
      return;
    }
    out.innerHTML = buildPortfolioAsOfBoardHtml(result, items) + extra + below + buildPortfolioAsOfTableHtml(items) + foot;
  }

  function showPortfolioAsOfComposition() {
    initPortfolioAsOfDateDefault();
    var input = document.getElementById('pfAsOfDate');
    var raw = input ? String(input.value || '').trim() : '';
    var iso = timelineIsoDate(raw);
    var seq = ++pfAsOfSeq;
    if (!iso) {
      setPortfolioAsOfBusy(false);
      pfAsOfShown = true;
      renderPortfolioAsOfResult(null, 'Укажите корректную дату.');
      return Promise.resolve();
    }
    var panel = document.getElementById('pfAsOfPanel');
    var refreshing = !!(pfAsOfShown && panel && !panel.hidden && document.getElementById('pfAsOfResult') &&
      document.getElementById('pfAsOfResult').innerHTML);
    var pf = typeof getPortfolio === 'function' ? getPortfolio() : { positions: [], sales: [] };
    pfAsOfShown = true;
    setPortfolioAsOfBusy(true, refreshing);
    return buildPortfolioValueAtDate(pf, iso).then(function (result) {
      if (seq !== pfAsOfSeq) return;
      setPortfolioAsOfBusy(false);
      renderPortfolioAsOfResult(result);
    }).catch(function () {
      if (seq !== pfAsOfSeq) return;
      setPortfolioAsOfBusy(false);
      renderPortfolioAsOfResult(null, PF_ASOF_ERROR);
    });
  }

  function refreshPortfolioAsOfIfShown() {
    if (!pfAsOfShown) return;
    showPortfolioAsOfComposition();
  }

  var PF_CMP_BTN_IDLE = 'Сравнить';
  var PF_CMP_BTN_BUSY = 'Сравниваем…';
  var PF_CMP_BUSY_HINT = 'Считаем стоимость портфеля на две даты…';
  var PF_CMP_ERROR = 'Не удалось сравнить даты. Попробуйте ещё раз.';
  var PF_CMP_EXPLAIN = 'Изменение включает не только движение цен, но и изменение состава портфеля между датами: покупки и продажи также влияют на итоговую сумму.';
  var PF_CMP_PARTIAL = 'Сравнение рассчитано частично: по части бумаг нет цены на одну из дат.';
  var PF_CMP_INCOMPLETE = 'Часть операций без корректной даты не включена в расчёт.';
  var PF_CMP_ZERO_PCT = 'процент не рассчитан: на начальную дату стоимость 0 ₽';
  var pfCmpSeq = 0;

  function shiftPortfolioIsoByMonths(iso, months) {
    var n = timelineIsoDate(iso);
    if (!n) return '';
    var y = Number(n.slice(0, 4));
    var m = Number(n.slice(5, 7));
    var d = Number(n.slice(8, 10));
    m += Number(months) || 0;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    var last = new Date(y, m, 0).getDate();
    if (d > last) d = last;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function initPortfolioCompareDatesDefault() {
    var fromInput = document.getElementById('pfCmpFromDate');
    var toInput = document.getElementById('pfCmpToDate');
    if (!fromInput || !toInput) return;
    var today = localPortfolioTodayYmd();
    var toIso = typeof normalizePortfolioDate === 'function' ? normalizePortfolioDate(today) : today;
    if (!toInput.value || !timelineIsoDate(toInput.value)) {
      if (toIso) toInput.value = toIso;
    }
    if (!fromInput.value || !timelineIsoDate(fromInput.value)) {
      var fromIso = shiftPortfolioIsoByMonths(toInput.value || toIso, -1);
      if (fromIso) fromInput.value = fromIso;
    }
  }

  function setPortfolioCompareBusy(on) {
    var btn = document.getElementById('pfCmpBtn');
    var status = document.getElementById('pfCmpStatus');
    if (btn) {
      btn.disabled = !!on;
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
      btn.textContent = on ? PF_CMP_BTN_BUSY : PF_CMP_BTN_IDLE;
    }
    if (status) {
      if (on) {
        status.hidden = false;
        status.textContent = PF_CMP_BUSY_HINT;
      } else {
        status.hidden = true;
        status.textContent = '';
      }
    }
  }

  function revealPortfolioComparePanel() {
    var panel = document.getElementById('pfCmpPanel');
    var block = document.getElementById('portfolioCompareBlock');
    if (panel) panel.hidden = false;
    if (block) block.classList.add('pf-cmp-block--open');
  }

  function formatCmpPctDisplay(pct) {
    if (pct == null || !isFinite(Number(pct))) return '';
    var n = Number(pct);
    var sign = n > 0 ? '+' : '';
    return sign + n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
  }

  function formatCmpSignedRub(val) {
    if (typeof formatSignedRubAmount === 'function') return formatSignedRubAmount(val);
    if (val == null || !isFinite(Number(val))) return '—';
    var n = Number(val);
    var sign = n > 0 ? '+' : '';
    return sign + n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  }

  function cmpChangeTone(n) {
    if (n == null || !isFinite(Number(n)) || Number(n) === 0) return 'zero';
    return Number(n) > 0 ? 'up' : 'down';
  }

  function buildPortfolioCompareKpiHtml(lbl, val, sub, extraClass) {
    return '<div class="pf-cmp-kpi' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<span class="pf-cmp-kpi-lbl">' + escapeHtml(lbl) + '</span>' +
      '<span class="pf-cmp-kpi-val">' + escapeHtml(val) + '</span>' +
      (sub ? '<span class="pf-cmp-kpi-sub">' + escapeHtml(sub) + '</span>' : '') +
    '</div>';
  }

  function buildPortfolioCompareDetailsCardsHtml(items) {
    return (items || []).map(function (row) {
      var tone = cmpChangeTone(row.changeRub);
      return '<article class="pf-cmp-card">' +
        '<div class="pf-cmp-card-head">' +
          '<span class="pf-cmp-ticker">' + escapeHtml(row.ticker) + '</span>' +
          (row.name && row.name !== row.ticker
            ? ' <span class="muted pf-cmp-name">' + escapeHtml(row.name) + '</span>'
            : '') +
        '</div>' +
        '<div class="pf-cmp-card-kpis">' +
          '<span><span class="lbl">Кол-во на начало</span> ' + escapeHtml(formatAsOfQtyDisplay(row.qtyFrom)) + '</span>' +
          '<span><span class="lbl">Стоимость на начало</span> ' +
            escapeHtml(row.valueFrom == null ? '—' : formatPortfolioRubAmount(row.valueFrom)) + '</span>' +
          '<span><span class="lbl">Кол-во на конец</span> ' + escapeHtml(formatAsOfQtyDisplay(row.qtyTo)) + '</span>' +
          '<span><span class="lbl">Стоимость на конец</span> ' +
            escapeHtml(row.valueTo == null ? '—' : formatPortfolioRubAmount(row.valueTo)) + '</span>' +
          '<span class="pf-cmp-card-change pf-cmp-change--' + tone + '"><span class="lbl">Изменение</span> ' +
            escapeHtml(row.changeRub == null ? '—' : formatCmpSignedRub(row.changeRub)) + '</span>' +
        '</div>' +
        (row.note ? '<p class="muted pf-cmp-card-note">' + escapeHtml(row.note) + '</p>' : '') +
      '</article>';
    }).join('');
  }

  function buildPortfolioCompareDetailsHtml(items) {
    items = items || [];
    if (!items.length) {
      return '<p class="muted pf-cmp-empty">На выбранных датах нет бумаг для детализации.</p>';
    }
    var rows = items.map(function (row) {
      var tone = cmpChangeTone(row.changeRub);
      return '<tr class="pf-cmp-row">' +
        '<td class="pf-cmp-td-paper">' +
          '<span class="pf-cmp-ticker">' + escapeHtml(row.ticker) + '</span>' +
          (row.name && row.name !== row.ticker
            ? '<span class="muted pf-cmp-name">' + escapeHtml(row.name) + '</span>'
            : '') +
        '</td>' +
        '<td>' + escapeHtml(formatAsOfQtyDisplay(row.qtyFrom)) + '</td>' +
        '<td>' + escapeHtml(row.valueFrom == null ? '—' : formatPortfolioRubAmount(row.valueFrom)) + '</td>' +
        '<td>' + escapeHtml(formatAsOfQtyDisplay(row.qtyTo)) + '</td>' +
        '<td>' + escapeHtml(row.valueTo == null ? '—' : formatPortfolioRubAmount(row.valueTo)) + '</td>' +
        '<td class="pf-cmp-td-change pf-cmp-change--' + tone + '">' +
          escapeHtml(row.changeRub == null ? '—' : formatCmpSignedRub(row.changeRub)) +
        '</td>' +
      '</tr>';
    }).join('');
    return '<div class="pf-cmp-table-wrap">' +
      '<table class="pf-cmp-table">' +
        '<thead><tr>' +
          '<th>Бумага</th>' +
          '<th>Кол-во на начало</th><th>Стоимость на начало</th>' +
          '<th>Кол-во на конец</th><th>Стоимость на конец</th>' +
          '<th>Изменение</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="pf-cmp-cards">' + buildPortfolioCompareDetailsCardsHtml(items) + '</div>';
  }

  function insightLineKind(line) {
    var s = String(line || '');
    if (/^Покупки за период|^Куплены или увеличены/i.test(s)) return 'buy';
    if (/^Продажи за период|^Проданы или уменьшены/i.test(s)) return 'sell';
    if (/^Стоимость выросла/i.test(s)) return 'up';
    if (/^Стоимость снизилась/i.test(s)) return 'down';
    return '';
  }

  function insightBulletHtml(line) {
    var kind = insightLineKind(line);
    var escaped = escapeHtml(line);
    var cls = kind === 'buy' || kind === 'up' ? 'pf-cmp-insight-amt--up'
      : (kind === 'sell' || kind === 'down' ? 'pf-cmp-insight-amt--down' : '');
    if (cls) {
      escaped = escaped.replace(/(\d[\d\u00a0\s]*[.,]\d{2}\s*₽)/g, '<span class="' + cls + '">$1</span>');
    }
    return '<li class="pf-cmp-insight-li' + (kind ? ' pf-cmp-insight-li--' + kind : '') + '">' +
      escaped + '</li>';
  }

  function cmpExplainOpDetailLine(op) {
    if (!op) return '';
    var kind = op.type === 'sell' ? 'продажа' : 'покупка';
    var date = formatAsOfDateDisplay(op.date);
    var qty = op.qty != null && isFinite(Number(op.qty)) && Number(op.qty) > 0
      ? formatAsOfQtyDisplay(op.qty) + ' шт.'
      : '';
    var line = (date && date !== '—' ? date + ' · ' : '') + kind + ' ' + String(op.ticker || '');
    if (qty) line += ' — ' + qty;
    if (op.amountRub != null && isFinite(Number(op.amountRub))) {
      line += ' на ' + cmpExplainRubAbs(op.amountRub);
    }
    return line;
  }

  function buildPortfolioCompareInsightOpsHtml(expl) {
    if (!expl || !expl.showAllOperations || !expl.periodOps) return '';
    var ops = (expl.periodOps.buyOps || []).concat(expl.periodOps.sellOps || []).slice().sort(function (a, b) {
      var da = a && a.date || '';
      var db = b && b.date || '';
      if (da !== db) return da < db ? -1 : 1;
      if (a.type !== b.type) return a.type === 'buy' ? -1 : 1;
      return String(a.ticker || '').localeCompare(String(b.ticker || ''));
    });
    if (!ops.length) return '';
    var rows = ops.map(function (op) {
      var kind = op.type === 'sell' ? 'sell' : 'buy';
      return '<li class="pf-cmp-insight-op pf-cmp-insight-op--' + kind + '">' +
        escapeHtml(cmpExplainOpDetailLine(op)) + '</li>';
    }).join('');
    return '<details class="pf-cmp-insight-ops">' +
      '<summary>Показать все операции за период</summary>' +
      '<ul class="pf-cmp-insight-ops-list">' + rows + '</ul>' +
    '</details>';
  }

  function buildPortfolioCompareInsightHtml(result) {
    if (typeof buildPortfolioValueChangeExplanation !== 'function') return '';
    var pf = typeof getPortfolio === 'function' ? getPortfolio() : { positions: [], sales: [] };
    var expl = buildPortfolioValueChangeExplanation(result, { portfolio: pf });
    if (!expl) return '';
    var items = (expl.bullets || []).map(insightBulletHtml).join('');
    var warn = (expl.warnings || []).map(function (line) {
      return '<p class="pf-cmp-insight-warn">' + escapeHtml(line) + '</p>';
    }).join('');
    var foot = expl.footnote
      ? '<p class="pf-cmp-insight-foot">' + escapeHtml(expl.footnote) + '</p>'
      : '';
    if (!items && !warn && !foot) return '';
    return '<section class="pf-cmp-insight" aria-label="Что изменилось">' +
      '<h4 class="pf-cmp-insight-title">' + escapeHtml(expl.title || 'Что изменилось') + '</h4>' +
      (items ? '<ul class="pf-cmp-insight-list">' + items + '</ul>' : '') +
      buildPortfolioCompareInsightOpsHtml(expl) +
      foot +
      warn +
    '</section>';
  }

  function renderPortfolioCompareResult(result, errorText) {
    var out = document.getElementById('pfCmpResult');
    var warn = document.getElementById('pfCmpWarn');
    revealPortfolioComparePanel();
    if (warn) {
      warn.hidden = true;
      warn.textContent = '';
    }
    if (!out) return;
    if (errorText) {
      out.innerHTML = '<p class="muted pf-cmp-empty">' + escapeHtml(errorText) + '</p>';
      return;
    }
    if (!result || result.invalidDate) {
      out.innerHTML = '<p class="muted pf-cmp-empty">Укажите корректные даты.</p>';
      return;
    }
    var extra = '';
    if (result.hasIncompleteHistory) {
      extra += '<p class="pf-cmp-partial" role="status">' + escapeHtml(PF_CMP_INCOMPLETE) + '</p>';
    }
    if (result.isPartial) {
      extra += '<p class="pf-cmp-partial" role="status">' + escapeHtml(PF_CMP_PARTIAL) + '</p>';
    }
    var fromLbl = formatAsOfDateDisplay(result.fromDate);
    var toLbl = formatAsOfDateDisplay(result.toDate);
    var fromVal = result.fromValue == null ? '—' : formatPortfolioRubAmount(result.fromValue);
    var toVal = result.toValue == null ? '—' : formatPortfolioRubAmount(result.toValue);
    var changeVal = result.changeRub == null ? '—' : formatCmpSignedRub(result.changeRub);
    var changeSub;
    if (result.fromValue === 0) changeSub = PF_CMP_ZERO_PCT;
    else if (result.changePct == null) changeSub = '';
    else changeSub = formatCmpPctDisplay(result.changePct);
    var tone = cmpChangeTone(result.changeRub);
    var board = '<div class="pf-cmp-board">' +
      buildPortfolioCompareKpiHtml('Стоимость на начало', fromVal, fromLbl) +
      buildPortfolioCompareKpiHtml('Стоимость на конец', toVal, toLbl) +
      buildPortfolioCompareKpiHtml('Изменение', changeVal, changeSub, 'pf-cmp-kpi--change pf-cmp-kpi--' + tone) +
    '</div>';
    out.innerHTML = board + extra +
      '<p class="pf-cmp-explain">' + escapeHtml(PF_CMP_EXPLAIN) + '</p>' +
      buildPortfolioCompareInsightHtml(result) +
      buildPortfolioCompareDetailsHtml(result.items || []);
  }

  function showPortfolioValueCompare() {
    initPortfolioCompareDatesDefault();
    var fromInput = document.getElementById('pfCmpFromDate');
    var toInput = document.getElementById('pfCmpToDate');
    var fromRaw = fromInput ? String(fromInput.value || '').trim() : '';
    var toRaw = toInput ? String(toInput.value || '').trim() : '';
    var seq = ++pfCmpSeq;
    if (!timelineIsoDate(fromRaw) || !timelineIsoDate(toRaw)) {
      setPortfolioCompareBusy(false);
      renderPortfolioCompareResult(null, 'Укажите корректные даты.');
      return Promise.resolve();
    }
    var pf = typeof getPortfolio === 'function' ? getPortfolio() : { positions: [], sales: [] };
    setPortfolioCompareBusy(true);
    return buildPortfolioValueChangeBetweenDates(pf, fromRaw, toRaw).then(function (result) {
      if (seq !== pfCmpSeq) return;
      setPortfolioCompareBusy(false);
      renderPortfolioCompareResult(result);
    }).catch(function () {
      if (seq !== pfCmpSeq) return;
      setPortfolioCompareBusy(false);
      renderPortfolioCompareResult(null, PF_CMP_ERROR);
    });
  }

  function renderPortfolio() {
    if (typeof Markets !== 'undefined' && Markets.renderBriefingMarketTabs) {
      Markets.renderBriefingMarketTabs('portfolioMarketTabs');
    }
    initPortfolioAsOfDateDefault();
    initPortfolioCompareDatesDefault();
    renderPortfolioTableBody();
    renderPortfolioFolder();
    renderPortfolioChart();
    refreshPortfolioQuotes().then(function () {
      renderPortfolioTableBody();
      renderPortfolioFolder();
      if (state.chartTicker) renderPortfolioChart();
    });
  }


