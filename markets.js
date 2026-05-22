/* markets.js — рынки RU/US, справочник США, нормализация watchlist */
(function (global) {
  'use strict';

  var US_CATALOG = [
    { ticker: 'AAPL', name: 'Apple', type: 'stock' },
    { ticker: 'MSFT', name: 'Microsoft', type: 'stock' },
    { ticker: 'NVDA', name: 'NVIDIA', type: 'stock' },
    { ticker: 'TSLA', name: 'Tesla', type: 'stock' },
    { ticker: 'AMZN', name: 'Amazon', type: 'stock' },
    { ticker: 'GOOGL', name: 'Alphabet', type: 'stock' },
    { ticker: 'META', name: 'Meta', type: 'stock' },
    { ticker: 'NFLX', name: 'Netflix', type: 'stock' },
    { ticker: 'JPM', name: 'JPMorgan Chase', type: 'stock' },
    { ticker: 'BAC', name: 'Bank of America', type: 'stock' },
    { ticker: 'XOM', name: 'Exxon Mobil', type: 'stock' },
    { ticker: 'KO', name: 'Coca-Cola', type: 'stock' },
    { ticker: 'PEP', name: 'PepsiCo', type: 'stock' },
    { ticker: 'SPY', name: 'S&P 500 ETF', type: 'stock' },
    { ticker: 'QQQ', name: 'Nasdaq 100 ETF', type: 'stock' }
  ];

  var US_BY_TICKER = {};
  US_CATALOG.forEach(function (item) {
    US_BY_TICKER[item.ticker] = item;
  });

  var DEFAULT_MARKETS = { ru: true, us: false };
  var DEFAULT_BASE_CURRENCY = 'RUB';

  function normalizeMarketsSettings(raw) {
    var m = raw && raw.markets && typeof raw.markets === 'object' ? raw.markets : {};
    var ru = m.ru !== false;
    var us = !!m.us;
    if (!ru && !us) ru = true;
    return { ru: ru, us: us };
  }

  function getMarketsEnabled() {
    return normalizeMarketsSettings(typeof getSettings === 'function' ? getSettings() : {});
  }

  function isMarketEnabled(code) {
    var m = getMarketsEnabled();
    if (code === 'US') return m.us;
    return m.ru;
  }

  function isUsTicker(ticker) {
    return !!US_BY_TICKER[normalizeTicker(ticker)];
  }

  function getUsTickerInfo(ticker) {
    return US_BY_TICKER[normalizeTicker(ticker)] || null;
  }

  function inferMarketFromTicker(ticker) {
    return isUsTicker(ticker) ? 'US' : 'RU';
  }

  function defaultCurrencyForMarket(market) {
    return market === 'US' ? 'USD' : 'RUB';
  }

  function marketBadgeLabel(market) {
    return market === 'US' ? 'США' : 'Россия';
  }

  function normalizeWatchlistItem(item) {
    if (!item) return null;
    if (typeof item === 'string') {
      var t = normalizeTicker(item);
      if (!t) return null;
      var market = inferMarketFromTicker(t);
      var info = market === 'US' ? getUsTickerInfo(t) : null;
      return {
        ticker: t,
        market: market,
        currency: defaultCurrencyForMarket(market),
        type: info ? info.type : (t.indexOf('OFZ') >= 0 || (t.indexOf('SU') === 0 && t.length > 8) ? 'bond' : 'stock'),
        name: info ? info.name : (getTickerNamesMap()[t] || TICKER_SUBTITLES[t] || '')
      };
    }
    if (typeof item === 'object') {
      var tk = normalizeTicker(item.ticker);
      if (!tk) return null;
      var mk = item.market === 'US' ? 'US' : 'RU';
      if (mk === 'US' && !isUsTicker(tk)) mk = 'RU';
      var usInfo = mk === 'US' ? getUsTickerInfo(tk) : null;
      return {
        ticker: tk,
        market: mk,
        currency: item.currency === 'USD' ? 'USD' : defaultCurrencyForMarket(mk),
        type: item.type || (usInfo ? usInfo.type : 'stock'),
        name: String(item.name || '').trim() || (usInfo ? usInfo.name : '')
      };
    }
    return null;
  }

  function normalizeWatchlist(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    var seen = {};
    list.forEach(function (item) {
      var n = normalizeWatchlistItem(item);
      if (!n) return;
      var key = n.market + ':' + n.ticker;
      if (seen[key]) return;
      seen[key] = true;
      out.push(n);
    });
    return out;
  }

  function watchlistTickerKey(item) {
    var n = normalizeWatchlistItem(item);
    return n ? n.ticker : '';
  }

  function watchlistHasTicker(list, ticker, market) {
    ticker = normalizeTicker(ticker);
    if (!ticker) return false;
    return normalizeWatchlist(list).some(function (item) {
      if (item.ticker !== ticker) return false;
      if (market) return item.market === market;
      return true;
    });
  }

  function getNormalizedWatchlist() {
    return normalizeWatchlist(typeof getWatchlist === 'function' ? getWatchlist() : []);
  }

  function canAddUsSecurities() {
    return isMarketEnabled('US');
  }

  function validateSecurityMarket(item) {
    if (!item || !item.ticker) {
      return { ok: false, message: 'Введите тикер или название' };
    }
    if (item.market === 'US' && !canAddUsSecurities()) {
      return { ok: false, message: 'Включите рынок США в настройках, чтобы добавить американские акции.' };
    }
    if (item.market === 'RU' && !isMarketEnabled('RU')) {
      return { ok: false, message: 'Включите российский рынок в настройках.' };
    }
    return { ok: true };
  }

  function searchUsSecurities(query) {
    var ql = String(query || '').trim().toLowerCase();
    if (!ql || !isMarketEnabled('US')) return [];
    var out = [];
    US_CATALOG.forEach(function (item) {
      if (out.length >= 12) return;
      if (item.ticker.toLowerCase().indexOf(ql) >= 0 || item.name.toLowerCase().indexOf(ql) >= 0) {
        out.push({
          ticker: item.ticker,
          name: item.name,
          kind: item.type,
          market: 'US',
          currency: 'USD'
        });
      }
    });
    return out;
  }

  function mergeSearchResults(local, remote) {
    var merged = [];
    var seen = {};
    (local || []).concat(remote || []).forEach(function (it) {
      var key = (it.market || 'RU') + ':' + it.ticker;
      if (!it.ticker || seen[key]) return;
      seen[key] = true;
      merged.push(it);
    });
    return merged.slice(0, 12);
  }

  function searchSecurities(query) {
    var q = String(query || '').trim();
    if (q.length < 1) return Promise.resolve([]);
    var markets = getMarketsEnabled();
    var jobs = [];
    if (markets.ru) {
      jobs.push(typeof searchMoexSecurities === 'function' ? searchMoexSecurities(q) : Promise.resolve([]));
    } else {
      jobs.push(Promise.resolve([]));
    }
    var usLocal = markets.us ? searchUsSecurities(q) : [];
    return Promise.all(jobs).then(function (results) {
      var moexItems = (results[0] || []).map(function (it) {
        return {
          ticker: it.ticker,
          name: it.name,
          kind: it.kind,
          market: 'RU',
          currency: 'RUB'
        };
      });
      return mergeSearchResults(usLocal, moexItems);
    });
  }

  function pickSearchItem(items, trimmed) {
    if (!items.length) return null;
    var want = normalizeTicker(trimmed);
    var exact = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].ticker === want) { exact = items[i]; break; }
    }
    return exact || items[0];
  }

  function resolveSecurityFromInput(raw) {
    var trimmed = String(raw || '').trim();
    if (!trimmed) return Promise.resolve(null);
    var t = normalizeTicker(trimmed);
    var usInfo = isUsTicker(t) ? getUsTickerInfo(t) : null;
    if (usInfo && /^[A-Z0-9][A-Z0-9._-]*$/i.test(t) && t.length >= 1 && !/[А-Яа-яЁё]/.test(trimmed)) {
      var usItem = {
        ticker: usInfo.ticker,
        name: usInfo.name,
        kind: usInfo.type,
        market: 'US',
        currency: 'USD',
        type: usInfo.type
      };
      var v = validateSecurityMarket(usItem);
      if (!v.ok) {
        if (typeof showToast === 'function') showToast(v.message);
        return Promise.resolve(null);
      }
      return Promise.resolve(usItem);
    }
    if (!isMarketEnabled('RU')) {
      return searchSecurities(trimmed).then(function (items) {
        var pick = pickSearchItem(items, trimmed);
        if (!pick) {
          if (typeof showToast === 'function') showToast('Бумага не найдена');
          return null;
        }
        var item = {
          ticker: pick.ticker,
          name: pick.name,
          kind: pick.kind,
          market: pick.market || 'RU',
          currency: pick.currency || defaultCurrencyForMarket(pick.market),
          type: pick.kind || 'stock'
        };
        var check = validateSecurityMarket(item);
        if (!check.ok) {
          if (typeof showToast === 'function') showToast(check.message);
          return null;
        }
        if (item.name && typeof rememberTickerItem === 'function') rememberTickerItem(item);
        return item;
      });
    }
    if (/^[A-Z0-9][A-Z0-9._-]*$/i.test(t) && t.length >= 2 && !/[А-Яа-яЁё]/.test(trimmed)) {
      return (typeof fetchMoexTickerName === 'function' ? fetchMoexTickerName(t) : Promise.resolve('')).then(function () {
        if (isUsTicker(t) && isMarketEnabled('US')) {
          var info = getUsTickerInfo(t);
          return {
            ticker: info.ticker,
            name: info.name,
            market: 'US',
            currency: 'USD',
            type: info.type,
            kind: info.type
          };
        }
        return {
          ticker: t,
          name: getTickerNamesMap()[t] || TICKER_SUBTITLES[t] || '',
          market: 'RU',
          currency: 'RUB',
          type: 'stock',
          kind: 'stock'
        };
      });
    }
    return searchSecurities(trimmed).then(function (items) {
      if (!items.length) return { ticker: normalizeTicker(trimmed), market: 'RU', currency: 'RUB', type: 'stock', kind: 'stock', name: '' };
      var pick = pickSearchItem(items, trimmed);
      var item = {
        ticker: pick.ticker,
        name: pick.name,
        market: pick.market || inferMarketFromTicker(pick.ticker),
        currency: pick.currency || defaultCurrencyForMarket(pick.market),
        type: pick.kind || 'stock',
        kind: pick.kind || 'stock'
      };
      var check = validateSecurityMarket(item);
      if (!check.ok) {
        if (typeof showToast === 'function') showToast(check.message);
        return null;
      }
      if (typeof rememberTickerItem === 'function') rememberTickerItem(pick);
      return item;
    });
  }

  function resolveTickerFromInputCompat(raw) {
    return resolveSecurityFromInput(raw).then(function (item) {
      return item ? item.ticker : '';
    });
  }

  function normalizePositionMarket(raw, ticker) {
    ticker = normalizeTicker(ticker || (raw && raw.ticker));
    var market = raw && raw.market === 'US' ? 'US' : (ticker && isUsTicker(ticker) ? 'US' : 'RU');
    if (market === 'US' && !isUsTicker(ticker)) market = 'RU';
    return {
      market: market,
      currency: raw && raw.currency ? raw.currency : defaultCurrencyForMarket(market)
    };
  }

  function isUsPosition(pos) {
    return pos && (pos.market === 'US' || isUsTicker(pos.ticker));
  }

  function formatMoneyValue(value, currency) {
    if (value == null || !isFinite(Number(value))) return '—';
    var n = Number(value);
    if (currency === 'USD') {
      if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
      return '$' + n.toFixed(2);
    }
    if (n >= 1000) return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
    return n.toFixed(2) + ' ₽';
  }

  function filterBriefsByMarket(briefs) {
    var markets = getMarketsEnabled();
    var filter = state && state.newsMarketFilter ? state.newsMarketFilter : 'all';
    return briefs.filter(function (b) {
      var mk = b.market === 'US' ? 'US' : 'RU';
      if (mk === 'US' && !markets.us) return false;
      if (mk === 'RU' && !markets.ru) return false;
      if (filter === 'RU' && mk !== 'RU') return false;
      if (filter === 'US' && mk !== 'US') return false;
      return true;
    });
  }

  function getVisibleMarketTickers(list) {
    list = (list || []).map(normalizeTicker).filter(Boolean);
    var markets = getMarketsEnabled();
    return list.filter(function (t) {
      if (isUsTicker(t)) return markets.us;
      return markets.ru;
    });
  }



  function briefingMarketsModeFromSettings() {
    var m = getMarketsEnabled();
    if (m.ru && m.us) return 'BOTH';
    if (m.us) return 'US';
    return 'RU';
  }



  function applyBriefingMarkets(mode) {
    var ru = mode === 'RU' || mode === 'BOTH';
    var us = mode === 'US' || mode === 'BOTH';
    if (!ru && !us) ru = true;
    var s = typeof getSettings === 'function' ? getSettings() : {};
    if (typeof setSettings === 'function') {
      setSettings({
        briefFormat: s.briefFormat,
        briefingScope: s.briefingScope,
        essayStyle: s.essayStyle,
        riskProfile: s.riskProfile,
        markets: { ru: ru, us: us },
        baseCurrency: us && !ru ? 'USD' : 'RUB'
      });
    }
    if (typeof state !== 'undefined') {
      state.newsMarketFilter = mode === 'US' ? 'US' : (mode === 'RU' ? 'RU' : 'all');
    }
    if (typeof loadMarketsToUI === 'function') loadMarketsToUI();
    renderBriefingMarketTabs();
    if (typeof renderNewsMarketFilterTabs === 'function') renderNewsMarketFilterTabs();
    var newsTabs = document.getElementById('newsMarketFilterTabs');
    if (newsTabs && typeof state !== 'undefined') {
      newsTabs.querySelectorAll('[data-news-market]').forEach(function (b) {
        if (b.hidden) return;
        b.classList.toggle('active', b.getAttribute('data-news-market') === (state.newsMarketFilter || 'all'));
      });
    }
    if (typeof renderMarketMacro === 'function') renderMarketMacro(true);
    if (typeof renderHomePage === 'function') renderHomePage();
    if (typeof renderMarketTiles === 'function') renderMarketTiles();
    if (typeof renderWatchlist === 'function') renderWatchlist();
    if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
    if (typeof renderPortfolio === 'function') renderPortfolio();
  }



  function renderBriefingMarketTabs(rootId) {
    var el = document.getElementById(rootId || 'briefingMarketTabs');
    if (!el) return;
    var mode = briefingMarketsModeFromSettings();
    el.querySelectorAll('[data-briefing-market]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-briefing-market') === mode);
    });
  }

  function bindMarketTabs(rootId, onApplied) {
    var el = document.getElementById(rootId);
    if (!el) return;
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-briefing-market]');
      if (!btn) return;
      applyBriefingMarkets(btn.getAttribute('data-briefing-market'));
      renderBriefingMarketTabs(rootId);
      ['briefingMarketTabs', 'analyticsMarketTabs', 'portfolioMarketTabs'].forEach(function (id) {
        renderBriefingMarketTabs(id);
      });
      if (typeof onApplied === 'function') onApplied();
    });
  }

  var US_CACHE_PREFIX = 'ibrf.us.';
  var US_FETCH_MS = 14000;

  function usCacheGet(key) {
    try {
      var raw = localStorage.getItem(US_CACHE_PREFIX + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || Date.now() > parsed.expires) {
        localStorage.removeItem(US_CACHE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function usCacheSet(key, data, ttl) {
    try {
      localStorage.setItem(US_CACHE_PREFIX + key, JSON.stringify({
        expires: Date.now() + (ttl || 5 * 60 * 1000),
        data: data
      }));
    } catch (e) { /* quota */ }
  }

  function usFetchWithTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms || US_FETCH_MS);
      })
    ]);
  }

  function usFetchJson(url) {
    function loadFrom(fetchUrl) {
      return usFetchWithTimeout(
        fetch(fetchUrl, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
          if (!res.ok) throw new Error('http ' + res.status);
          return res.json();
        }),
        US_FETCH_MS
      );
    }
    return loadFrom(url).catch(function () {
      return loadFrom('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
    }).catch(function () {
      return loadFrom('https://corsproxy.io/?' + encodeURIComponent(url));
    });
  }

  function parseYahooChartBlock(json) {
    return json && json.chart && json.chart.result && json.chart.result[0] ? json.chart.result[0] : null;
  }

  function parseYahooQuoteFromMeta(block) {
    if (!block || !block.meta) return null;
    var m = block.meta;
    var price = Number(m.regularMarketPrice);
    if (!isFinite(price)) return null;
    var changePct = m.regularMarketChangePercent != null ? Number(m.regularMarketChangePercent) : null;
    if (!isFinite(changePct) && m.chartPreviousClose) {
      var prev = Number(m.chartPreviousClose);
      if (isFinite(prev) && prev !== 0) changePct = ((price - prev) / prev) * 100;
    }
    if (!isFinite(changePct)) changePct = null;
    return { price: price, changePct: changePct };
  }

  function yahooParamsForHorizon(horizon) {
    if (horizon === 'day') return { range: '1d', interval: '5m' };
    if (horizon === 'week') return { range: '5d', interval: '1d' };
    if (horizon === 'month') return { range: '1mo', interval: '1d' };
    return { range: '1y', interval: '1d' };
  }

  function parseYahooChartSeries(json) {
    var block = parseYahooChartBlock(json);
    if (!block) return [];
    var ts = block.timestamp || [];
    var closes = block.indicators && block.indicators.quote && block.indicators.quote[0]
      ? block.indicators.quote[0].close
      : [];
    var out = [];
    for (var i = 0; i < ts.length; i++) {
      var c = closes[i];
      if (c == null || !isFinite(Number(c))) continue;
      out.push({ t: Number(ts[i]) * 1000, price: Number(c) });
    }
    return out;
  }

  function sliceUsSeries(series, horizon) {
    if (!series.length) return series;
    var now = Date.now();
    var cut = now;
    if (horizon === 'day') cut = now - 24 * 60 * 60 * 1000;
    else if (horizon === 'week') cut = now - 7 * 24 * 60 * 60 * 1000;
    else if (horizon === 'month') cut = now - 30 * 24 * 60 * 60 * 1000;
    else cut = now - 365 * 24 * 60 * 60 * 1000;
    var sliced = series.filter(function (p) { return p.t >= cut; });
    return sliced.length >= 2 ? sliced : series.slice(-Math.min(series.length, horizon === 'day' ? 48 : 30));
  }

  function fetchUsHistory(ticker, horizon) {
    ticker = normalizeTicker(ticker);
    if (!isUsTicker(ticker)) return Promise.reject(new Error('not us'));
    horizon = horizon || 'week';
    var cacheKey = 'hist.' + ticker + '.' + horizon;
    var cached = usCacheGet(cacheKey);
    if (cached) return Promise.resolve({ series: cached, source: 'us' });

    var p = yahooParamsForHorizon(horizon);
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) +
      '?range=' + p.range + '&interval=' + p.interval + '&includePrePost=false';

    return usFetchJson(url).then(function (json) {
      var series = sliceUsSeries(parseYahooChartSeries(json), horizon);
      if (series.length < 2) throw new Error('not enough points');
      usCacheSet(cacheKey, series, 10 * 60 * 1000);
      return { series: series, source: 'us' };
    });
  }

  function fetchUsQuote(ticker) {
    ticker = normalizeTicker(ticker);
    if (!isUsTicker(ticker)) return Promise.resolve({ price: null, changePct: null });
    var cacheKey = 'quote.' + ticker;
    var cached = usCacheGet(cacheKey);
    if (cached && cached.price != null && isFinite(cached.price)) return Promise.resolve(cached);

    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) +
      '?range=1d&interval=5m&includePrePost=false';

    return usFetchJson(url).then(function (json) {
      var block = parseYahooChartBlock(json);
      var fromMeta = parseYahooQuoteFromMeta(block);
      if (fromMeta) {
        usCacheSet(cacheKey, fromMeta, 3 * 60 * 1000);
        return fromMeta;
      }
      var s = parseYahooChartSeries(json);
      if (!s.length) throw new Error('no quote');
      var last = s[s.length - 1];
      var prev = s.length > 1 ? s[s.length - 2] : null;
      var changePct = prev && prev.price ? ((last.price - prev.price) / prev.price) * 100 : null;
      var out = { price: last.price, changePct: changePct };
      usCacheSet(cacheKey, out, 3 * 60 * 1000);
      return out;
    }).catch(function () {
      return fetchUsHistory(ticker, 'week').then(function (hist) {
        var series = hist.series;
        if (!series.length) throw new Error('no series');
        var last = series[series.length - 1];
        var prev = series.length > 1 ? series[series.length - 2] : null;
        var changePct = prev && prev.price ? ((last.price - prev.price) / prev.price) * 100 : null;
        var out = { price: last.price, changePct: changePct };
        usCacheSet(cacheKey, out, 3 * 60 * 1000);
        return out;
      });
    }).catch(function () {
      return { price: null, changePct: null };
    });
  }

  global.Markets = {
    US_CATALOG: US_CATALOG,
    normalizeMarketsSettings: normalizeMarketsSettings,
    getMarketsEnabled: getMarketsEnabled,
    isMarketEnabled: isMarketEnabled,
    isUsTicker: isUsTicker,
    getUsTickerInfo: getUsTickerInfo,
    inferMarketFromTicker: inferMarketFromTicker,
    marketBadgeLabel: marketBadgeLabel,
    normalizeWatchlistItem: normalizeWatchlistItem,
    normalizeWatchlist: normalizeWatchlist,
    watchlistTickerKey: watchlistTickerKey,
    watchlistHasTicker: watchlistHasTicker,
    getNormalizedWatchlist: getNormalizedWatchlist,
    validateSecurityMarket: validateSecurityMarket,
    searchUsSecurities: searchUsSecurities,
    searchSecurities: searchSecurities,
    resolveSecurityFromInput: resolveSecurityFromInput,
    resolveTickerFromInputCompat: resolveTickerFromInputCompat,
    normalizePositionMarket: normalizePositionMarket,
    isUsPosition: isUsPosition,
    formatMoneyValue: formatMoneyValue,
    filterBriefsByMarket: filterBriefsByMarket,
    getVisibleMarketTickers: getVisibleMarketTickers,
    briefingMarketsModeFromSettings: briefingMarketsModeFromSettings,
    applyBriefingMarkets: applyBriefingMarkets,
    renderBriefingMarketTabs: renderBriefingMarketTabs,
    bindMarketTabs: bindMarketTabs,
    defaultCurrencyForMarket: defaultCurrencyForMarket,
    fetchUsQuote: fetchUsQuote,
    fetchUsHistory: fetchUsHistory
  };
})(typeof window !== 'undefined' ? window : globalThis);
