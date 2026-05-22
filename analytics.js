/* analytics.js — дивиденды, оборот, карточки котировок */
(function () {
  'use strict';

  var ANALYTICS_CACHE_PREFIX = 'ibrf.analytics.';
  var ANALYTICS_TTL = 30 * 60 * 1000;
  var VOLUME_DAYS = 30;
  var YIELD_YEARS = 5;

  function analyticsCacheGet(key) {
    try {
      var raw = localStorage.getItem(ANALYTICS_CACHE_PREFIX + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || Date.now() > parsed.expires) {
        localStorage.removeItem(ANALYTICS_CACHE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function analyticsCacheSet(key, data, ttl) {
    try {
      localStorage.setItem(ANALYTICS_CACHE_PREFIX + key, JSON.stringify({
        expires: Date.now() + (ttl || ANALYTICS_TTL),
        data: data
      }));
    } catch (e) { /* quota */ }
  }

  function isRuStockForAnalytics(ticker) {
    ticker = normalizeTicker(ticker);
    if (!ticker || ticker === 'IMOEX' || ticker === 'MOEX' || ticker === 'INDEX') return false;
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) return false;
    if (ticker.indexOf('OFZ') >= 0) return false;
    if (ticker.indexOf('SU') === 0 && ticker.length > 8) return false;
    return true;
  }

  function formatDivYieldPct(pct) {
    if (pct == null || !isFinite(pct)) return '—';
    return pct.toFixed(1).replace('.', ',') + '%';
  }

  function fetchMoexDividends(ticker) {
    ticker = normalizeTicker(ticker);
    var url = MOEX_ISS + '/securities/' + encodeURIComponent(ticker) + '/dividends.json?iss.meta=off';
    return moexFetchJson(url).then(function (json) {
      var block = json.dividends;
      if (!block || !block.data || !block.data.length) return [];
      var cols = block.columns;
      var iDate = cols.indexOf('registryclosedate');
      var iVal = cols.indexOf('value');
      return block.data.map(function (row) {
        return {
          date: String(row[iDate] || '').slice(0, 10),
          value: Number(row[iVal])
        };
      }).filter(function (d) { return d.date && isFinite(d.value) && d.value > 0; });
    }).catch(function () { return []; });
  }

  function fetchMoexShareHistoryDaily(ticker, yearsBack) {
    ticker = normalizeTicker(ticker);
    var cacheKey = 'hist.' + ticker + '.' + (yearsBack || YIELD_YEARS);
    var cached = analyticsCacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);

    var till = new Date();
    var from = new Date(till);
    from.setFullYear(from.getFullYear() - (yearsBack || YIELD_YEARS));

    function loadPage(start) {
      var url = MOEX_ISS + '/history/engines/stock/markets/shares/securities/' +
        encodeURIComponent(ticker) + '.json?from=' + moexFormatDate(from) +
        '&till=' + moexFormatDate(till) +
        '&iss.meta=off&history.columns=TRADEDATE,CLOSE,VALUE,BOARDID&start=' + start + '&limit=500';
      return moexFetchJson(url).then(function (json) {
        var hist = json.history;
        if (!hist || !hist.data) return { rows: [], total: 0, next: start };
        var cols = hist.columns;
        var iDate = cols.indexOf('TRADEDATE');
        var iClose = cols.indexOf('CLOSE');
        var iVal = cols.indexOf('VALUE');
        var iBoard = cols.indexOf('BOARDID');
        var rows = [];
        hist.data.forEach(function (row) {
          if (row[iBoard] !== 'TQBR') return;
          var d = String(row[iDate] || '').slice(0, 10);
          var close = Number(row[iClose]);
          var val = Number(row[iVal]);
          if (!d) return;
          rows.push({
            date: d,
            close: isFinite(close) ? close : null,
            value: isFinite(val) ? val : null,
            t: new Date(d + 'T12:00:00').getTime()
          });
        });
        var cur = hist.cursor && hist.cursor.data && hist.cursor.data[0];
        var total = cur ? cur[1] : rows.length;
        var next = start + rows.length;
        return { rows: rows, total: total, next: next };
      });
    }

    var all = [];
    var start = 0;
    function loop() {
      return loadPage(start).then(function (page) {
        all = all.concat(page.rows);
        if (page.rows.length && page.next < page.total && page.next > start) {
          start = page.next;
          return loop();
        }
        var byDate = {};
        all.forEach(function (r) {
          byDate[r.date] = r;
        });
        var out = Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
        analyticsCacheSet(cacheKey, out, 12 * 60 * 60 * 1000);
        return out;
      });
    }
    return loop();
  }

  function computeYearlyDividendYields(dividends, dailyHistory) {
    var thisYear = new Date().getFullYear();
    var years = [];
    for (var y = thisYear - (YIELD_YEARS - 1); y <= thisYear; y++) years.push(String(y));

    var byYearDiv = {};
    dividends.forEach(function (d) {
      var y = d.date.slice(0, 4);
      if (!byYearDiv[y]) byYearDiv[y] = 0;
      byYearDiv[y] += d.value;
    });

    var out = [];
    years.forEach(function (y) {
      var totalDiv = byYearDiv[y] || 0;
      var prices = dailyHistory.filter(function (h) { return h.date.indexOf(y) === 0 && h.close > 0; })
        .map(function (h) { return h.close; });
      var yieldPct = null;
      if (prices.length && totalDiv > 0) {
        var avg = prices.reduce(function (a, b) { return a + b; }, 0) / prices.length;
        yieldPct = (totalDiv / avg) * 100;
      } else if (totalDiv > 0) {
        yieldPct = null;
      } else {
        yieldPct = 0;
      }
      out.push({ year: Number(y), yieldPct: yieldPct, totalDiv: totalDiv });
    });
    return out;
  }

  function averageYield5y(yearly) {
    var vals = yearly.map(function (y) { return y.yieldPct; })
      .filter(function (v) { return v != null && isFinite(v); });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  function sliceVolumeSeries(dailyHistory, days) {
    var rows = dailyHistory.filter(function (h) { return h.value != null && h.value > 0; });
    return rows.slice(-days).map(function (h) {
      return { t: h.t, v: h.value / 1e9 };
    });
  }

  function buildSecurityAnalytics(ticker) {
    ticker = normalizeTicker(ticker);
    if (!isRuStockForAnalytics(ticker)) {
      return Promise.resolve({
        ticker: ticker,
        eligible: false,
        divAvg5y: null,
        divYieldByYear: [],
        volumeByDay: []
      });
    }
    var cacheKey = 'full.' + ticker;
    var cached = analyticsCacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);

    return Promise.all([
      fetchMoexDividends(ticker),
      fetchMoexShareHistoryDaily(ticker, YIELD_YEARS),
      fetchMoexQuote(ticker)
    ]).then(function (results) {
      var dividends = results[0];
      var history = results[1];
      var quote = results[2] || {};
      var yearly = computeYearlyDividendYields(dividends, history);
      var out = {
        ticker: ticker,
        eligible: true,
        name: getTickerSubtitle(ticker),
        quote: quote,
        divAvg5y: averageYield5y(yearly),
        divYieldByYear: yearly,
        volumeByDay: sliceVolumeSeries(history, VOLUME_DAYS)
      };
      analyticsCacheSet(cacheKey, out);
      return out;
    });
  }

  function quoteCardChartsHtml(ticker) {
    return (
      '<div class="quote-card-charts" data-ticker="' + escapeHtml(ticker) + '">' +
        '<div class="quote-mini-chart-wrap" title="Дивидендная доходность по годам">' +
          '<span class="quote-mini-lbl">див.</span>' +
          '<canvas class="quote-mini-chart" data-mini-chart="div" aria-hidden="true"></canvas>' +
        '</div>' +
        '<div class="quote-mini-chart-wrap" title="Оборот за 30 дней, млрд ₽">' +
          '<span class="quote-mini-lbl">оборот</span>' +
          '<canvas class="quote-mini-chart" data-mini-chart="vol" aria-hidden="true"></canvas>' +
        '</div>' +
      '</div>'
    );
  }

  function enrichQuoteCard(wrapEl, ticker) {
    if (!wrapEl || !ticker) return;
    ticker = normalizeTicker(ticker);
    var btn = wrapEl.querySelector('.market-tile, .quote-card');
    if (!btn) return;

    var divEl = wrapEl.querySelector('[data-div-yield]');
    if (!divEl) {
      var metrics = wrapEl.querySelector('.quote-card-metrics, .market-tile-metrics');
      if (!metrics) {
        var priceEl = wrapEl.querySelector('[data-price]');
        if (priceEl && priceEl.parentNode) {
          metrics = document.createElement('div');
          metrics.className = wrapEl.classList.contains('market-tile-wrap') ? 'market-tile-metrics' : 'quote-card-metrics';
          priceEl.parentNode.insertBefore(metrics, priceEl);
          metrics.appendChild(priceEl);
          var ch = wrapEl.querySelector('[data-change]');
          if (ch) metrics.appendChild(ch);
        }
      }
      if (metrics) {
        divEl = document.createElement('span');
        divEl.className = 'quote-card-div muted';
        divEl.setAttribute('data-div-yield', '');
        divEl.textContent = 'Див. 5л: …';
        metrics.appendChild(divEl);
      }
    }

    var chartsHost = wrapEl.querySelector('.quote-card-charts');
    if (!chartsHost) {
      var host = document.createElement('div');
      host.innerHTML = quoteCardChartsHtml(ticker);
      var inner = btn.querySelector('.star-border-inner') || btn;
      inner.appendChild(host.firstChild);
      chartsHost = wrapEl.querySelector('.quote-card-charts');
    }

    if (divEl) divEl.textContent = 'Див. 5л: …';

    if (!isRuStockForAnalytics(ticker)) {
      if (divEl) divEl.textContent = 'Див. 5л: н/д';
      return;
    }

    buildSecurityAnalytics(ticker).then(function (a) {
      if (divEl) {
        divEl.textContent = 'Див. 5л: ' + formatDivYieldPct(a.divAvg5y);
        divEl.classList.remove('muted', 'pnl-pos', 'pnl-neg');
        if (a.divAvg5y != null && a.divAvg5y > 0) divEl.classList.add('pnl-pos');
      }
      if (typeof paintQuoteMiniCharts === 'function') {
        paintQuoteMiniCharts(wrapEl, a);
      }
    }).catch(function () {
      if (divEl) divEl.textContent = 'Див. 5л: —';
    });
  }

  function renderAnalyticsGrid() {
    var grid = document.getElementById('analyticsGrid');
    if (!grid) return;
    var list = typeof Markets !== 'undefined' ? Markets.getNormalizedWatchlist() : getWatchlist().map(function (t) {
      return { ticker: normalizeTicker(t), market: 'RU' };
    });
    var tickers = [];
    list.forEach(function (item) {
      var t = typeof item === 'string' ? normalizeTicker(item) : normalizeTicker(item.ticker);
      if (!t || tickers.indexOf(t) >= 0) return;
      if (typeof Markets !== 'undefined' && item.market === 'US') return;
      tickers.push(t);
    });

    if (!tickers.length) {
      grid.innerHTML = '<p class="muted hint-frame">Добавьте бумаги в список наблюдения — здесь появятся дивидендная доходность и графики оборота.</p>';
      return;
    }

    grid.innerHTML = tickers.map(function (ticker, i) {
      var wrapCls = 'quote-card-wrap magic-bento-card magic-bento-card--border-glow star-border-container star-border-loading';
      return (
        '<div class="' + wrapCls + '" data-ticker="' + escapeHtml(ticker) + '">' +
          '<div class="border-gradient-bottom" aria-hidden="true"></div>' +
          '<div class="border-gradient-top" aria-hidden="true"></div>' +
          '<button type="button" class="quote-card star-border-inner" data-ticker="' + escapeHtml(ticker) + '">' +
            '<div class="quote-card-top">' +
              '<span class="quote-card-ticker">' + escapeHtml(ticker) + '</span>' +
              '<span class="quote-card-sub">' + escapeHtml(getTickerSubtitle(ticker)) + '</span>' +
            '</div>' +
            '<div class="quote-card-metrics">' +
              '<span class="quote-card-price" data-price>…</span>' +
              '<span class="quote-card-change muted" data-change>загрузка</span>' +
              '<span class="quote-card-div muted" data-div-yield>Див. 5л: …</span>' +
            '</div>' +
            quoteCardChartsHtml(ticker) +
          '</button>' +
          '<button type="button" class="quote-card-remove" data-remove-analytics="' + escapeHtml(ticker) + '" aria-label="Удалить">×</button>' +
        '</div>'
      );
    }).join('');

    tickers.forEach(function (ticker) {
      var wrap = grid.querySelector('.quote-card-wrap[data-ticker="' + ticker + '"]');
      if (!wrap) return;
      fetchMoexQuote(ticker).then(function (q) {
        var btn = wrap.querySelector('.quote-card');
        if (typeof updateMarketTileButton === 'function') {
          updateMarketTileButton(btn, q, ticker);
        }
      }).catch(function () {});
      enrichQuoteCard(wrap, ticker);
    });

    grid.querySelectorAll('.quote-card-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var t = btn.getAttribute('data-remove-analytics');
        setWatchlist(getWatchlist().filter(function (x) {
          var n = typeof Markets !== 'undefined' ? Markets.normalizeWatchlistItem(x) : { ticker: x };
          return n.ticker !== t;
        }));
        showToast('Удалено из наблюдения: ' + t);
        renderWatchlist();
        renderAnalyticsGrid();
      });
    });
  }

  function openSecurityAnalyticsModal(ticker) {
    ticker = normalizeTicker(ticker);
    if (typeof openAnalyticsModal === 'function') {
      openAnalyticsModal(ticker);
      return;
    }
    if (typeof openPortfolioChart === 'function') openPortfolioChart(ticker);
  }

  window.isRuStockForAnalytics = isRuStockForAnalytics;
  window.formatDivYieldPct = formatDivYieldPct;
  window.buildSecurityAnalytics = buildSecurityAnalytics;
  window.enrichQuoteCard = enrichQuoteCard;
  window.renderAnalyticsGrid = renderAnalyticsGrid;
  window.openSecurityAnalyticsModal = openSecurityAnalyticsModal;
  window.quoteCardChartsHtml = quoteCardChartsHtml;
})();
