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
  /** Временно отключено: котировки США через Yahoo нестабильны */
  var US_MARKET_AVAILABLE = false;

  function isUsMarketAvailable() {
    return US_MARKET_AVAILABLE;
  }

  function normalizeMarketsSettings(raw) {
    var m = raw && raw.markets && typeof raw.markets === 'object' ? raw.markets : {};
    var ru = m.ru !== false;
    var us = !!m.us;
    if (!ru && !us) ru = true;
    return { ru: ru, us: us };
  }

  function getMarketsEnabled() {
    var m = normalizeMarketsSettings(typeof getSettings === 'function' ? getSettings() : {});
    if (!US_MARKET_AVAILABLE) {
      m.us = false;
      if (!m.ru) m.ru = true;
    }
    return m;
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
        type: item.type || item.kind || (usInfo ? usInfo.type : 'stock'),
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
      return {
        ok: false,
        message: US_MARKET_AVAILABLE
          ? 'Включите рынок США в настройках, чтобы добавить американские акции.'
          : 'Рынок США временно недоступен.'
      };
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
        var isBond = t.indexOf('OFZ') >= 0 || (t.indexOf('SU') === 0 && t.length > 8);
        return {
          ticker: t,
          name: getTickerNamesMap()[t] || TICKER_SUBTITLES[t] || '',
          market: 'RU',
          currency: 'RUB',
          type: isBond ? 'bond' : 'stock',
          kind: isBond ? 'bond' : 'stock'
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
      if (Math.abs(n) >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
      if (Math.abs(n) > 0 && Math.abs(n) < 0.1) return '$' + n.toFixed(4);
      if (Math.abs(n) < 10) return '$' + n.toFixed(3);
      return '$' + n.toFixed(2);
    }
    if (Math.abs(n) >= 1000) return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
    if (Math.abs(n) > 0 && Math.abs(n) < 0.1) return n.toFixed(4).replace('.', ',') + ' ₽';
    if (Math.abs(n) < 10) return n.toFixed(3).replace('.', ',') + ' ₽';
    return n.toFixed(2).replace('.', ',') + ' ₽';
  }

  function getAppState() {
    if (typeof globalThis !== 'undefined' && globalThis.state) return globalThis.state;
    if (typeof window !== 'undefined' && window.state) return window.state;
    return null;
  }

  function normalizeNewsMarketFilter(filter, markets) {
    markets = markets || getMarketsEnabled();
    if (!markets.ru && !markets.us) return 'all';
    if (!markets.ru) return 'US';
    if (!markets.us) return 'RU';
    if (filter === 'RU' || filter === 'US' || filter === 'all') return filter;
    return 'all';
  }

  function filterBriefsByMarket(briefs) {
    var markets = getMarketsEnabled();
    var appState = getAppState();
    var filter = normalizeNewsMarketFilter(
      appState && appState.newsMarketFilter ? appState.newsMarketFilter : 'all',
      markets
    );
    function run(f) {
      return briefs.filter(function (b) {
        var mk = b.market === 'US' ? 'US' : 'RU';
        if (mk === 'US' && !markets.us) return false;
        if (mk === 'RU' && !markets.ru) return false;
        if (f === 'RU' && mk !== 'RU') return false;
        if (f === 'US') {
          if (mk === 'US') return true;
          if (b.category === 'Международные рынки') return true;
          return false;
        }
        return true;
      });
    }
    var out = run(filter);
    if (!out.length && markets.ru && markets.us && filter !== 'all') {
      var fallback = run('all');
      if (fallback.length) {
        filter = 'all';
        if (appState) appState.newsMarketFilter = 'all';
        out = fallback;
      }
    }
    return out;
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
    if (!US_MARKET_AVAILABLE && (mode === 'US' || mode === 'BOTH')) mode = 'RU';
    var ru = mode === 'RU' || mode === 'BOTH';
    var us = US_MARKET_AVAILABLE && (mode === 'US' || mode === 'BOTH');
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
    var appState = getAppState();
    if (appState) {
      if (mode === 'BOTH') appState.newsMarketFilter = 'all';
      else if (mode === 'US') appState.newsMarketFilter = 'US';
      else appState.newsMarketFilter = 'RU';
    }
    if (typeof loadMarketsToUI === 'function') loadMarketsToUI();
    renderBriefingMarketTabs();
    if (typeof renderNewsMarketFilterTabs === 'function') renderNewsMarketFilterTabs();
    var newsTabs = document.getElementById('newsMarketFilterTabs');
    if (newsTabs && appState) {
      var activeFilter = normalizeNewsMarketFilter(appState.newsMarketFilter, { ru: ru, us: us });
      appState.newsMarketFilter = activeFilter;
      newsTabs.querySelectorAll('[data-news-market]').forEach(function (b) {
        if (b.hidden) return;
        b.classList.toggle('active', b.getAttribute('data-news-market') === activeFilter);
      });
    }
    if (typeof renderMarketMacro === 'function') renderMarketMacro(true);
    if (typeof renderHomePage === 'function') renderHomePage();
    if (typeof renderMarketTiles === 'function') renderMarketTiles();
    if (typeof renderWatchlist === 'function') renderWatchlist();
    if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
    if (typeof renderPortfolio === 'function') renderPortfolio();
  }



  function syncUsMarketUi() {
    var available = US_MARKET_AVAILABLE;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.toggle('us-market-unavailable', !available);
    }
    document.querySelectorAll('[data-briefing-market="US"], [data-briefing-market="BOTH"]').forEach(function (btn) {
      btn.hidden = !available;
    });
    document.querySelectorAll('[data-news-market="US"]').forEach(function (btn) {
      btn.hidden = !available;
    });
    document.querySelectorAll('.briefing-market-toolbar').forEach(function (toolbar) {
      toolbar.hidden = !available;
    });
    var usCard = document.getElementById('marketUsCard');
    if (usCard) usCard.hidden = !available;
    var hint = document.getElementById('marketUsHint');
    if (hint) hint.hidden = !available;
  }



  function renderBriefingMarketTabs(rootId) {
    syncUsMarketUi();
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

  var US_CACHE_PREFIX = 'ibrf.us.v2.';
  var US_FETCH_MS = 12000;
  var US_YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';

  var US_TOP_VOL_TICKERS = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'AMD', 'GOOGL', 'AVGO', 'BRK-B',
    'JPM', 'V', 'XOM', 'UNH', 'MA', 'HD', 'LLY', 'COST', 'BAC', 'NFLX', 'CRM', 'ORCL'
  ];

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

  function usIsLocalDevHost() {
    try {
      var h = window.location.hostname;
      return h === 'localhost' || h === '127.0.0.1';
    } catch (e) {
      return false;
    }
  }

  function usParseYahooResponse(res) {
    if (!res.ok) throw new Error('http ' + res.status);
    return res.text().then(function (txt) {
      var data;
      try {
        data = JSON.parse(txt);
      } catch (e) {
        throw new Error('invalid json');
      }
      if (data && data.chart) return data;
      if (data && typeof data.contents === 'string') {
        try {
          return JSON.parse(data.contents);
        } catch (e2) {
          throw new Error('invalid wrapped json');
        }
      }
      return data;
    });
  }

  function usFetchJson(url) {
    var altUrl = url.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com');
    var attempts = [];
    if (usIsLocalDevHost()) attempts.push(url);
    attempts.push('https://api.cors.lol/?url=' + encodeURIComponent(url));
    if (altUrl !== url) {
      attempts.push('https://api.cors.lol/?url=' + encodeURIComponent(altUrl));
    }
    if (!usIsLocalDevHost()) attempts.push(url);
    attempts.push('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));

    var i = 0;
    function tryNext() {
      if (i >= attempts.length) return Promise.reject(new Error('us fetch failed'));
      var fetchUrl = attempts[i++];
      return usFetchWithTimeout(
        fetch(fetchUrl, {
          credentials: 'omit',
          cache: 'no-store',
          headers: { Accept: 'application/json,text/plain,*/*' }
        }).then(usParseYahooResponse),
        US_FETCH_MS
      ).catch(tryNext);
    }
    return tryNext();
  }

  function toYahooChartSymbol(ticker) {
    ticker = normalizeTicker(ticker);
    if (ticker === 'VIX') return '^VIX';
    return ticker;
  }

  function yahooChartUrl(ticker, range, interval) {
    return US_YAHOO_CHART + encodeURIComponent(toYahooChartSymbol(ticker)) +
      '?range=' + range + '&interval=' + interval + '&includePrePost=false';
  }

  function mapPool(items, limit, fn) {
    var out = new Array(items.length);
    var idx = 0;
    var active = 0;
    return new Promise(function (resolve) {
      function pump() {
        while (active < limit && idx < items.length) {
          (function (pos) {
            active++;
            Promise.resolve(fn(items[pos], pos)).then(function (val) {
              out[pos] = val;
              active--;
              if (idx >= items.length && active === 0) resolve(out);
              else pump();
            }, function () {
              out[pos] = null;
              active--;
              if (idx >= items.length && active === 0) resolve(out);
              else pump();
            });
          })(idx++);
        }
        if (!items.length) resolve(out);
      }
      pump();
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
    var volume = m.regularMarketVolume != null ? Number(m.regularMarketVolume) : null;
    if (volume != null && !isFinite(volume)) volume = null;
    var divYieldPct = null;
    if (m.trailingAnnualDividendYield != null && isFinite(Number(m.trailingAnnualDividendYield))) {
      divYieldPct = Number(m.trailingAnnualDividendYield) * 100;
    } else if (m.dividendYield != null && isFinite(Number(m.dividendYield))) {
      divYieldPct = Number(m.dividendYield) * 100;
    }
    return { price: price, changePct: changePct, volume: volume, divYieldPct: divYieldPct };
  }

  function yahooParamsForHorizon(horizon) {
    if (horizon === 'day') return { range: '1d', interval: '5m' };
    if (horizon === 'week') return { range: '5d', interval: '1d' };
    if (horizon === 'month') return { range: '1mo', interval: '1d' };
    if (horizon === '5y') return { range: '5y', interval: '1wk' };
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
    else if (horizon === 'year') cut = now - 366 * 24 * 60 * 60 * 1000;
    else if (horizon === '5y') cut = now - 5 * 365.25 * 24 * 60 * 60 * 1000;
    else cut = now - 366 * 24 * 60 * 60 * 1000;
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

  function fetchUsQuoteExtended(ticker) {
    return fetchUsQuote(ticker).then(function (q) {
      if (!q) return q;
      return {
        price: q.price,
        changePct: q.changePct,
        volume: q.volume != null ? q.volume : null,
        divYieldPct: q.divYieldPct != null ? q.divYieldPct : null
      };
    });
  }

  function fetchUsTopStocksByVolume(limit, skipCache) {
    limit = limit || 20;
    var cacheKey = 'topvol.' + limit;
    if (!skipCache) {
      var cached = usCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    var tickers = US_LIQUID_TICKERS.slice();
    var idx = 0;
    var batchSize = 5;
    var rows = [];

    function nextBatch() {
      var chunk = tickers.slice(idx, idx + batchSize);
      idx += batchSize;
      if (!chunk.length) {
        rows.sort(function (a, b) { return b.valToday - a.valToday; });
        var top = rows.slice(0, limit);
        if (!top.length) return Promise.reject(new Error('no us volume'));
        usCacheSet(cacheKey, top, 5 * 60 * 1000);
        return top;
      }
      return Promise.all(chunk.map(function (sym) {
        return fetchUsQuoteExtended(sym).then(function (q) {
          if (!q || q.price == null || q.volume == null || !isFinite(q.volume) || q.volume <= 0) return null;
          var info = getUsTickerInfo(sym);
          return {
            ticker: sym,
            name: info ? info.name : sym,
            price: q.price,
            changePct: q.changePct,
            valToday: q.volume,
            divYieldPct: q.divYieldPct,
            market: 'US'
          };
        }).catch(function () { return null; });
      })).then(function (part) {
        part.forEach(function (r) { if (r) rows.push(r); });
        return nextBatch();
      });
    }

    return nextBatch();
  }

  function fetchUsQuote(ticker) {
    ticker = normalizeTicker(ticker);
    var yahooSym = toYahooChartSymbol(ticker);
    var isMacro = yahooSym === '^VIX' || isUsTicker(ticker);
    if (!isMacro) return Promise.resolve({ price: null, changePct: null });
    var cacheKey = 'quote.' + yahooSym;
    var cached = usCacheGet(cacheKey);
    if (cached && cached.price != null && isFinite(cached.price)) return Promise.resolve(cached);

    var url = yahooChartUrl(yahooSym, '1d', '5m');

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
    US_MARKET_AVAILABLE: US_MARKET_AVAILABLE,
    isUsMarketAvailable: isUsMarketAvailable,
    syncUsMarketUi: syncUsMarketUi,
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
    getAppState: getAppState,
    normalizeNewsMarketFilter: normalizeNewsMarketFilter,
    filterBriefsByMarket: filterBriefsByMarket,
    getVisibleMarketTickers: getVisibleMarketTickers,
    briefingMarketsModeFromSettings: briefingMarketsModeFromSettings,
    applyBriefingMarkets: applyBriefingMarkets,
    renderBriefingMarketTabs: renderBriefingMarketTabs,
    bindMarketTabs: bindMarketTabs,
    defaultCurrencyForMarket: defaultCurrencyForMarket,
    fetchUsQuote: fetchUsQuote,
    fetchUsQuoteExtended: fetchUsQuoteExtended,
    fetchUsTopStocksByVolume: fetchUsTopStocksByVolume,
    fetchUsHistory: fetchUsHistory
  };

  if (typeof document !== 'undefined' && document.documentElement) {
    syncUsMarketUi();
  }
})(typeof window !== 'undefined' ? window : globalThis);
