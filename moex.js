/* moex.js */
  function moexFormatDate(d) {
    return d.toISOString().slice(0, 10);
  }



  function moexCacheGet(key) {
    try {
      var raw = localStorage.getItem(MOEX_CACHE_PREFIX + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || Date.now() > parsed.expires) {
        localStorage.removeItem(MOEX_CACHE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  }



  function moexCacheSet(key, data, ttl) {
    try {
      localStorage.setItem(MOEX_CACHE_PREFIX + key, JSON.stringify({
        expires: Date.now() + (ttl || MOEX_CACHE_TTL),
        data: data
      }));
    } catch (e) { /* quota */ }
  }



  function moexFetchJson(url) {
    return fetch(url, { method: 'GET', credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('MOEX HTTP ' + res.status);
      return res.json();
    });
  }

  var acControllers = {};



  function kindLabel(kind) {
    if (kind === 'bond') return 'Облигация';
    if (kind === 'index') return 'Индекс';
    return 'Акция';
  }



  function searchLocalTickers(query) {
    var ql = String(query || '').trim().toLowerCase();
    if (!ql) return [];
    var out = [];
    if ('imoex'.indexOf(ql) === 0 || ql.indexOf('индекс') === 0 || ql.indexOf('мосбирж') >= 0) {
      out.push({ ticker: 'IMOEX', name: 'Индекс МосБиржи', kind: 'index' });
    }
    Object.keys(TICKER_SUBTITLES).forEach(function (t) {
      var name = TICKER_SUBTITLES[t];
      if (t.toLowerCase().indexOf(ql) >= 0 || name.toLowerCase().indexOf(ql) >= 0) {
        var kind = t === 'IMOEX' ? 'index' : (t.indexOf('OFZ') >= 0 || t.indexOf('SU') === 0 ? 'bond' : 'stock');
        out.push({ ticker: t, name: name, kind: kind });
      }
    });
    return out;
  }



  function cleanMoexShortName(shortname) {
    return String(shortname || '').replace(/^\++/, '').trim();
  }



  function moexPickDisplayName(shortname, secname, name, secid) {
    shortname = cleanMoexShortName(shortname);
    var candidates = [shortname, name, secname];
    var i;
    for (i = 0; i < candidates.length; i++) {
      var n = candidates[i];
      if (!n) continue;
      n = String(n).trim();
      if (!n || normalizeTicker(n) === normalizeTicker(secid)) continue;
      if (n.length < 2) continue;
      return n;
    }
    var fallback = shortname || secname || name;
    return fallback ? String(fallback).trim() : String(secid || '').trim();
  }



  function parseSingleMoexSecurityName(json, secid) {
    var sec = json.securities;
    if (sec && sec.columns && sec.data && sec.data.length) {
      var cols = sec.columns;
      function col(row, name) {
        var i = cols.indexOf(name);
        return i >= 0 ? row[i] : null;
      }
      var row = sec.data[0];
      return moexPickDisplayName(col(row, 'shortname'), col(row, 'secname'), col(row, 'name'), secid);
    }
    var desc = json.description;
    if (!desc || !desc.data) return '';
    var shortname = '';
    var name = '';
    var secname = '';
    desc.data.forEach(function (row) {
      var key = row[0];
      var val = row[2];
      if (key === 'SHORTNAME') shortname = val;
      else if (key === 'NAME') name = val;
      else if (key === 'SECNAME') secname = val;
    });
    return moexPickDisplayName(shortname, secname, name, secid);
  }



  function parseMoexSearchResults(json) {
    var sec = json.securities;
    if (!sec || !sec.columns || !sec.data) return [];
    var cols = sec.columns;
    function col(row, name) {
      var i = cols.indexOf(name);
      return i >= 0 ? row[i] : null;
    }
    var seen = {};
    var out = [];
    sec.data.forEach(function (row) {
      if (out.length >= 20) return;
      var secid = col(row, 'secid');
      if (!secid || seen[secid]) return;
      var group = String(col(row, 'group') || '');
      var board = String(col(row, 'primary_boardid') || col(row, 'boardid') || '');
      var isIndex = secid === 'IMOEX' || secid === 'RTSI';
      var isShare = group === 'stock_shares' && (board === 'TQBR' || board === 'SMAL' || board === 'TQTF');
      var isBond = group === 'stock_bonds' || board === 'TQOB' || board === 'TQCB';
      if (!isIndex && !isShare && !isBond) return;
      seen[secid] = true;
      var name = moexPickDisplayName(col(row, 'shortname'), col(row, 'secname'), col(row, 'name'), secid);
      out.push({
        ticker: normalizeTicker(secid),
        name: name,
        kind: isIndex ? 'index' : (isBond ? 'bond' : 'stock')
      });
    });
    return out;
  }



  function searchMoexSecurities(query) {
    var q = String(query || '').trim();
    if (q.length < 1) return Promise.resolve([]);
    var cacheKey = 'search.' + q.toLowerCase();
    var cached = moexCacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);
    var local = searchLocalTickers(q);
    return moexFetchJson(MOEX_ISS + '/securities.json?q=' + encodeURIComponent(q) + '&iss.meta=off&securities.columns=secid,shortname,secname,name,group,primary_boardid,boardid&limit=30')
      .then(function (json) {
        var merged = [];
        var seen = {};
        local.concat(parseMoexSearchResults(json)).forEach(function (it) {
          if (!seen[it.ticker]) {
            seen[it.ticker] = true;
            merged.push(it);
          }
        });
        merged = merged.slice(0, 12);
        moexCacheSet(cacheKey, merged, 10 * 60 * 1000);
        return merged;
      })
      .catch(function () { return local.slice(0, 12); });
  }



  function rememberTickerItem(item) {
    if (!item || !item.ticker) return;
    if (item.name) saveTickerName(item.ticker, item.name);
  }



  function fetchMoexTickerName(ticker) {
    ticker = normalizeTicker(ticker);
    if (!ticker) return Promise.resolve('');
    if (TICKER_SUBTITLES[ticker]) return Promise.resolve(TICKER_SUBTITLES[ticker]);
    var map = getTickerNamesMap();
    if (map[ticker]) return Promise.resolve(map[ticker]);
    var cacheKey = 'secname.' + ticker;
    var cached = moexCacheGet(cacheKey);
    if (cached) {
      saveTickerName(ticker, cached);
      return Promise.resolve(cached);
    }
    return moexFetchJson(
      MOEX_ISS + '/securities/' + encodeURIComponent(ticker) + '.json?iss.meta=off'
    ).then(function (json) {
      var name = parseSingleMoexSecurityName(json, ticker);
      if (name) {
        saveTickerName(ticker, name);
        moexCacheSet(cacheKey, name, 24 * 60 * 60 * 1000);
        return name;
      }
      return searchMoexSecurities(ticker).then(function (items) {
        var exact = null;
        for (var i = 0; i < items.length; i++) {
          if (items[i].ticker === ticker) { exact = items[i]; break; }
        }
        var pick = exact || items[0];
        if (pick && pick.name) {
          saveTickerName(ticker, pick.name);
          moexCacheSet(cacheKey, pick.name, 24 * 60 * 60 * 1000);
          return pick.name;
        }
        return '';
      });
    }).catch(function () { return ''; });
  }



  function resolveTickerFromInput(raw) {
    var trimmed = String(raw || '').trim();
    if (!trimmed) return Promise.resolve('');
    var t = normalizeTicker(trimmed);
    if (/^[A-Z0-9][A-Z0-9._-]*$/i.test(t) && t.length >= 2 && !/[А-Яа-яЁё]/.test(trimmed)) {
      return fetchMoexTickerName(t).then(function () { return t; });
    }
    return searchMoexSecurities(trimmed).then(function (items) {
      if (!items.length) return normalizeTicker(trimmed);
      var want = normalizeTicker(trimmed);
      var exact = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].ticker === want) { exact = items[i]; break; }
      }
      var pick = exact || items[0];
      rememberTickerItem(pick);
      return pick.ticker;
    });
  }



  function resolveMoexInstrument(ticker) {
    var t = normalizeTicker(ticker);
    if (t === 'IMOEX' || t === 'MOEX' || t === 'INDEX') {
      return Promise.resolve({ type: 'index', engine: 'stock', market: 'index', board: null, secid: IMOEX_SECID });
    }
    if (BOND_SECID_MAP[t]) {
      return Promise.resolve({ type: 'bond', engine: 'stock', market: 'bonds', board: 'TQOB', secid: BOND_SECID_MAP[t] });
    }
    if (t.indexOf('SU') === 0 && t.length > 8) {
      return Promise.resolve({ type: 'bond', engine: 'stock', market: 'bonds', board: 'TQOB', secid: t });
    }
    if (t.indexOf('OFZ') === 0) {
      var cached = moexCacheGet('inst.' + t);
      if (cached) return Promise.resolve(cached);
      return moexFetchJson(MOEX_ISS + '/securities.json?q=' + encodeURIComponent(t.replace(/_/g, ' ')) + '&iss.meta=off')
        .then(function (json) {
          var sec = json.securities;
          if (!sec || !sec.data || !sec.data.length) throw new Error('bond not found');
          var cols = sec.columns;
          var secidIdx = cols.indexOf('secid');
          var secid = sec.data[0][secidIdx];
          var inst = { type: 'bond', engine: 'stock', market: 'bonds', board: 'TQOB', secid: secid };
          moexCacheSet('inst.' + t, inst, 24 * 60 * 60 * 1000);
          return inst;
        });
    }
    return Promise.resolve({ type: 'stock', engine: 'stock', market: 'shares', board: 'TQBR', secid: t });
  }



  function moexCandlesUrl(inst) {
    if (inst.type === 'index') {
      return MOEX_ISS + '/engines/' + inst.engine + '/markets/' + inst.market + '/securities/' + inst.secid + '/candles.json';
    }
    return MOEX_ISS + '/engines/' + inst.engine + '/markets/' + inst.market + '/boards/' + inst.board + '/securities/' + inst.secid + '/candles.json';
  }



  function moexMarketdataUrl(inst) {
    var q = '?iss.only=marketdata,securities&iss.meta=off';
    if (inst.type === 'index') {
      return MOEX_ISS + '/engines/' + inst.engine + '/markets/' + inst.market + '/securities/' + inst.secid + '.json' + q;
    }
    return MOEX_ISS + '/engines/' + inst.engine + '/markets/' + inst.market + '/boards/' + inst.board + '/securities/' + inst.secid + '.json' + q;
  }



  function moexHorizonQuery(horizon) {
    var till = new Date();
    var from = new Date(till);
    if (horizon === 'day') {
      from.setDate(from.getDate() - 3);
      return { interval: 60, from: moexFormatDate(from), till: moexFormatDate(till) };
    }
    if (horizon === 'week') {
      from.setDate(from.getDate() - 12);
      return { interval: 24, from: moexFormatDate(from), till: moexFormatDate(till) };
    }
    if (horizon === 'month') {
      from.setDate(from.getDate() - 45);
      return { interval: 24, from: moexFormatDate(from), till: moexFormatDate(till) };
    }
    from.setDate(from.getDate() - 400);
    return { interval: 7, from: moexFormatDate(from), till: moexFormatDate(till) };
  }



  function parseMoexCandles(json) {
    var block = json.candles;
    if (!block || !block.columns || !block.data) return [];
    var closeIdx = block.columns.indexOf('close');
    var beginIdx = block.columns.indexOf('begin');
    if (closeIdx < 0 || beginIdx < 0) return [];
    return block.data.map(function (row) {
      return { t: new Date(row[beginIdx]).getTime(), price: Number(row[closeIdx]) };
    }).filter(function (p) { return p.t && isFinite(p.price); });
  }



  function parseMoexLastPrice(json) {
    var q = parseMoexQuoteFromMd(json);
    return q ? q.price : null;
  }



  function parseMoexQuoteFromMd(json) {
    var md = json.marketdata;
    if (!md || !md.data || !md.data.length) return null;
    var cols = md.columns;
    var row = md.data[0];
    function col(name) {
      var idx = cols.indexOf(name);
      return idx >= 0 ? row[idx] : null;
    }
    function secCol(name) {
      var sec = json.securities;
      if (!sec || !sec.columns || !sec.data || !sec.data.length) return null;
      var idx = sec.columns.indexOf(name);
      return idx >= 0 ? sec.data[0][idx] : null;
    }
    var priceKeys = ['LAST', 'LCURRENTPRICE', 'LEGALCLOSEPRICE', 'CURRENTVALUE', 'MARKETPRICE'];
    var price = null;
    for (var i = 0; i < priceKeys.length; i++) {
      var v = col(priceKeys[i]);
      if (v != null && isFinite(Number(v))) {
        price = Number(v);
        break;
      }
    }
    if (price == null) return null;

    var chg = resolveMoexDayChangePct(price, col, secCol);

    return {
      price: price,
      changePct: chg != null && isFinite(Number(chg)) ? Number(chg) : null
    };
  }



  function resolveMoexDayChangePct(price, col, secCol) {
    var prev = col('PREVPRICE') || col('PREVADMITTEDQUOTE') || col('PREVCLOSE') ||
      secCol('PREVPRICE') || secCol('PREVADMITTEDQUOTE') || secCol('PREVCLOSE') ||
      secCol('PREVLEGALCLOSEPRICE');
    if (prev != null && isFinite(Number(prev)) && Number(prev) !== 0) {
      return ((price - Number(prev)) / Number(prev)) * 100;
    }

    var absChg = col('LASTCHANGE');
    var absNum = absChg != null && isFinite(Number(absChg)) ? Number(absChg) : null;
    if (absNum != null) {
      var baseFromChg = price - absNum;
      if (baseFromChg > 0) return (absNum / baseFromChg) * 100;
    }

    var pct = col('LASTCHANGEPRCNT');
    if (pct != null && isFinite(Number(pct))) {
      var pctNum = Number(pct);
      if (Math.abs(pctNum) >= 0.0005 || absNum == null || Math.abs(absNum) < 1e-12) {
        return pctNum;
      }
    }

    var altPct = col('CHANGEPRCNT');
    if (altPct != null && isFinite(Number(altPct))) return Number(altPct);

    var open = col('OPEN') || col('OPENPRICE') || col('OPENVALUE');
    if (open != null && isFinite(Number(open)) && Number(open) !== 0) {
      return ((price - Number(open)) / Number(open)) * 100;
    }

    return null;
  }



  function fetchDayChangePctFromCandles(ticker, currentPrice) {
    return fetchMoexHistory(ticker, 'day').then(function (result) {
      var s = result.series;
      if (s.length < 2) {
        return fetchMoexHistory(ticker, 'week').then(function (weekResult) {
          var ws = weekResult.series;
          if (ws.length < 2) return null;
          var prevClose = ws[ws.length - 2].price;
          var last = currentPrice != null && isFinite(currentPrice) ? currentPrice : ws[ws.length - 1].price;
          if (!prevClose || !isFinite(prevClose) || prevClose === 0) return null;
          return ((last - prevClose) / prevClose) * 100;
        });
      }
      var prevClose = s[0].price;
      var last = currentPrice != null && isFinite(currentPrice) ? currentPrice : s[s.length - 1].price;
      if (!prevClose || !isFinite(prevClose) || prevClose === 0) return null;
      return ((last - prevClose) / prevClose) * 100;
    }).catch(function () { return null; });
  }



  function fetchMoexQuote(ticker) {
    return resolveMoexInstrument(ticker).then(function (inst) {
      return moexFetchJson(moexMarketdataUrl(inst)).then(function (json) {
        var quote = parseMoexQuoteFromMd(json);
        if (!quote) return null;
        if (quote.changePct != null) return quote;
        return fetchDayChangePctFromCandles(ticker, quote.price).then(function (pct) {
          if (pct != null) quote.changePct = pct;
          return quote;
        });
      });
    });
  }



  function formatDayChangePct(pct) {
    if (pct == null || !isFinite(pct)) return '—';
    var sign = pct > 0 ? '+' : '';
    var absPct = Math.abs(pct);
    var dec = absPct > 0 && absPct < 0.05 ? 3 : 2;
    return sign + pct.toFixed(dec).replace('.', ',') + '%';
  }



  function sliceSeriesForHorizon(series, horizon) {
    if (!series.length) return series;
    var now = Date.now();
    var cut = now;
    if (horizon === 'day') cut = now - 24 * 60 * 60 * 1000;
    else if (horizon === 'week') cut = now - 7 * 24 * 60 * 60 * 1000;
    else if (horizon === 'month') cut = now - 30 * 24 * 60 * 60 * 1000;
    else cut = now - 365 * 24 * 60 * 60 * 1000;
    var sliced = series.filter(function (p) { return p.t >= cut; });
    return sliced.length >= 2 ? sliced : series.slice(-Math.min(series.length, horizon === 'day' ? 24 : 30));
  }



  function fetchMoexHistory(ticker, horizon) {
    var cacheKey = 'candles.' + ticker + '.' + horizon;
    var cached = moexCacheGet(cacheKey);
    if (cached) return Promise.resolve({ series: cached, source: 'moex', cached: true });

    return resolveMoexInstrument(ticker).then(function (inst) {
      var q = moexHorizonQuery(horizon);
      var url = moexCandlesUrl(inst) + '?from=' + q.from + '&till=' + q.till + '&interval=' + q.interval + '&iss.meta=off';
      return moexFetchJson(url).then(function (json) {
        var series = sliceSeriesForHorizon(parseMoexCandles(json), horizon);
        if (series.length < 2) throw new Error('not enough candles');
        moexCacheSet(cacheKey, series);
        return { series: series, source: 'moex', inst: inst };
      });
    });
  }



  function fetchMoexLastPrice(ticker) {
    var cacheKey = 'last.' + ticker;
    var cached = moexCacheGet(cacheKey);
    if (cached != null) return Promise.resolve(cached);
    return resolveMoexInstrument(ticker).then(function (inst) {
      return moexFetchJson(moexMarketdataUrl(inst)).then(function (json) {
        var price = parseMoexLastPrice(json);
        if (price == null) throw new Error('no price');
        moexCacheSet(cacheKey, price, 5 * 60 * 1000);
        return price;
      });
    });
  }



  function updateChartStatsFromSeries(series, ticker, hoverIdx) {
    if (!series.length) return;
    var idx = hoverIdx != null && hoverIdx >= 0 && hoverIdx < series.length ? hoverIdx : series.length - 1;
    var first = series[0].price;
    var at = series[idx].price;
    var changePct = first ? ((at - first) / first) * 100 : 0;
    var min = Math.min.apply(null, series.map(function (p) { return p.price; }));
    var max = Math.max.apply(null, series.map(function (p) { return p.price; }));
    var changeEl = document.getElementById('chartStatChange');
    var sign = changePct >= 0 ? '+' : '';
    if (changeEl) {
      changeEl.textContent = sign + changePct.toFixed(2) + '%';
      changeEl.className = 'val ' + (changePct >= 0 ? 'pnl-pos' : 'pnl-neg');
    }
    var minEl = document.getElementById('chartStatMin');
    var maxEl = document.getElementById('chartStatMax');
    var lastEl = document.getElementById('chartStatLast');
    var lastLbl = document.querySelector('#portfolioChartStats .chart-stat:last-child .lbl');
    if (minEl) minEl.textContent = formatChartPrice(min, ticker);
    if (maxEl) maxEl.textContent = formatChartPrice(max, ticker);
    if (lastEl) lastEl.textContent = formatChartPrice(at, ticker);
    if (lastLbl) lastLbl.textContent = hoverIdx != null ? 'На дату' : 'Сейчас';
  }



  function setChartSourceLabel(text, isDemo) {
    var el = document.getElementById('chartSourceLabel');
    if (el) {
      el.textContent = text;
      el.style.color = isDemo ? 'var(--danger)' : 'var(--text-muted)';
    }
  }



  function renderMoexIndexBox() {
    var valueEl = document.getElementById('imoexValue');
    var dayEl = document.getElementById('imoexDayChange');
    var monthEl = document.getElementById('imoexMonthChange');
    var sourceEl = document.getElementById('imoexSource');
    var canvas = document.getElementById('imoexMiniChart');
    if (!valueEl || !canvas) return;

    var horizon = state.imoexHorizon || 'month';
    sourceEl.textContent = 'Загрузка данных МосБиржи…';

    Promise.all([
      moexFetchJson(moexMarketdataUrl({ type: 'index', engine: 'stock', market: 'index', secid: IMOEX_SECID })),
      fetchMoexHistory(IMOEX_SECID, horizon)
    ]).then(function (results) {
      var md = results[0];
      var hist = results[1];
      var cols = md.marketdata.columns;
      var row = md.marketdata.data[0];
      var valIdx = cols.indexOf('CURRENTVALUE');
      var chgIdx = cols.indexOf('LASTCHANGEPRC');
      var monthIdx = cols.indexOf('MONTHCHANGEPRC');
      var value = row[valIdx];
      var chg = row[chgIdx];
      var monthChg = row[monthIdx];
      valueEl.textContent = Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
      dayEl.textContent = (chg >= 0 ? '+' : '') + Number(chg).toFixed(2) + '% за день';
      dayEl.className = 'index-change ' + (chg >= 0 ? 'pnl-pos' : 'pnl-neg');
      monthEl.textContent = 'Месяц: ' + (monthChg >= 0 ? '+' : '') + Number(monthChg).toFixed(2) + '%';
      drawPriceChart(canvas, hist.series, { ticker: IMOEX_SECID, horizon: horizon });
      sourceEl.textContent = 'МосБиржа · IMOEX · ' + new Date().toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }).catch(function () {
      valueEl.textContent = '—';
      dayEl.textContent = 'Нет данных';
      dayEl.className = 'index-change muted';
      monthEl.textContent = '';
      sourceEl.textContent = 'Данные МосБиржи недоступны';
    });
  }



  function refreshPortfolioQuotes() {
    var portfolio = getPortfolio();
    if (!portfolio.positions.length) return Promise.resolve();
    var jobs = portfolio.positions.map(function (p) {
      return fetchMoexQuote(p.ticker).then(function (q) {
        if (q && q.price != null && isFinite(q.price)) p.currentPrice = q.price;
        if (q && q.changePct != null && isFinite(q.changePct)) p.dayChangePct = q.changePct;
        else delete p.dayChangePct;
      }).catch(function () { /* keep stored */ });
    });
    return Promise.all(jobs).then(function () {
      setPortfolio(portfolio);
    });
  }



  function getTickerSubtitle(ticker) {
    ticker = normalizeTicker(ticker);
    if (TICKER_SUBTITLES[ticker]) return TICKER_SUBTITLES[ticker];
    var saved = getTickerNamesMap()[ticker];
    if (saved) return saved;
    return 'Бумага · МосБиржа';
  }



  function updateMarketTileSubtitle(ticker, name) {
    if (!name) return;
    var el = document.getElementById('marketTiles');
    if (!el) return;
    var sub = el.querySelector('.market-tile-wrap[data-ticker="' + ticker + '"] .market-tile-sub');
    if (sub) sub.textContent = name;
  }



  function ensureTickerNames(tickers) {
    var need = [];
    (tickers || []).forEach(function (t) {
      t = normalizeTicker(t);
      if (!t || TICKER_SUBTITLES[t] || getTickerNamesMap()[t]) return;
      if (need.indexOf(t) === -1) need.push(t);
    });
    need.forEach(function (t) {
      fetchMoexTickerName(t).then(function (name) {
        if (name) updateMarketTileSubtitle(t, name);
      });
    });
  }



  function getMarketTickers() {
    var list = loadJSON(KEYS.marketTiles, null);
    if (!Array.isArray(list) || !list.length) return DEFAULT_MARKET_TICKERS.slice();
    return list.map(normalizeTicker).filter(Boolean);
  }



  function setMarketTickers(list) {
    var normalized = [];
    list.forEach(function (t) {
      t = normalizeTicker(t);
      if (t && normalized.indexOf(t) === -1) normalized.push(t);
    });
    if (!normalized.length) normalized = DEFAULT_MARKET_TICKERS.slice();
    if (normalized.indexOf('IMOEX') > 0) {
      normalized = ['IMOEX'].concat(normalized.filter(function (x) { return x !== 'IMOEX'; }));
    }
    saveJSON(KEYS.marketTiles, normalized);
    renderMarketTiles();
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function addMarketTicker(raw) {
    resolveTickerFromInput(raw).then(function (t) {
      t = normalizeTicker(t);
      if (!t) {
        showToast('Введите тикер или название');
        return;
      }
      var list = getMarketTickers();
      if (list.indexOf(t) !== -1) {
        showToast('Уже на панели котировок');
        return;
      }
      if (t === 'IMOEX') list.unshift(t);
      else list.push(t);
      setMarketTickers(list);
      var input = document.getElementById('marketTickerInput');
      if (input) input.value = '';
      if (acControllers.marketTickerInput) acControllers.marketTickerInput.close();
      showToast('Добавлено: ' + t);
    });
  }



  function removeMarketTicker(ticker) {
    ticker = normalizeTicker(ticker);
    var list = getMarketTickers();
    if (list.length <= 1) {
      showToast('Нельзя удалить последнюю бумагу');
      return;
    }
    setMarketTickers(list.filter(function (x) { return x !== ticker; }));
    showToast('Удалено: ' + ticker);
  }



  function resetMarketTickers() {
    setMarketTickers(DEFAULT_MARKET_TICKERS.slice());
    showToast('Панель котировок сброшена');
  }



  function buildMarketTileConfig(ticker) {
    return {
      ticker: ticker,
      title: ticker,
      subtitle: getTickerSubtitle(ticker),
      featured: ticker === 'IMOEX'
    };
  }



  function applyStarBorderHighlight(wrap, quote) {
    if (!wrap) return;
    wrap.classList.remove('star-border-up', 'star-border-down', 'star-border-flat', 'star-border-loading');
    if (!quote || quote.price == null) {
      wrap.classList.add('star-border-loading');
      return;
    }
    var pct = quote.changePct;
    if (pct == null || !isFinite(pct)) {
      wrap.classList.add('star-border-flat');
    } else if (pct > 0) {
      wrap.classList.add('star-border-up');
    } else if (pct < 0) {
      wrap.classList.add('star-border-down');
    } else {
      wrap.classList.add('star-border-flat');
    }
  }



  function updateMarketTileButton(btn, quote, ticker) {
    if (!btn) return;
    var wrap = btn.closest('.market-tile-wrap');
    var priceEl = btn.querySelector('[data-price]');
    var changeEl = btn.querySelector('[data-change]');
    if (!quote || quote.price == null) {
      if (priceEl) priceEl.textContent = '—';
      if (changeEl) {
        changeEl.textContent = 'нет данных';
        changeEl.className = 'market-tile-change muted';
      }
      applyStarBorderHighlight(wrap, quote);
      return;
    }
    if (priceEl) priceEl.textContent = formatChartPrice(quote.price, ticker);
    if (changeEl) {
      var pct = quote.changePct;
      changeEl.textContent = formatDayChangePct(pct);
      if (pct == null || !isFinite(pct)) {
        changeEl.className = 'market-tile-change muted';
      } else if (pct > 0) {
        changeEl.className = 'market-tile-change pnl-pos';
      } else if (pct < 0) {
        changeEl.className = 'market-tile-change pnl-neg';
      } else {
        changeEl.className = 'market-tile-change muted';
      }
    }
    applyStarBorderHighlight(wrap, quote);
  }

  var BENTO_GLOW_RGB = '61, 92, 71';
  var BENTO_SPOTLIGHT_RADIUS = 210;
  var marketTilesBentoCleanup = null;
  var briefingBentoCleanup = null;
  var portfolioPapersMagnetCleanup = null;



  function renderMarketTiles() {
    var el = document.getElementById('marketTiles');
    if (!el) return;
    destroyMarketTilesBento();
    var tickers = getMarketTickers();
    if (!tickers.length) {
      el.innerHTML = '<p class="market-tiles-empty">Добавьте тикер в поле выше</p>';
      return;
    }
    el.innerHTML = tickers.map(function (ticker) {
      var tile = buildMarketTileConfig(ticker);
      var wrapCls = 'market-tile-wrap magic-bento-card magic-bento-card--border-glow star-border-container star-border-loading' + (tile.featured ? ' featured' : '');
      return (
        '<div class="' + wrapCls + '" data-ticker="' + escapeHtml(tile.ticker) + '">' +
          '<div class="border-gradient-bottom" aria-hidden="true"></div>' +
          '<div class="border-gradient-top" aria-hidden="true"></div>' +
          '<button type="button" class="market-tile star-border-inner" data-ticker="' + escapeHtml(tile.ticker) + '" aria-label="' +
            escapeHtml(tile.title + ', ' + tile.subtitle) + '">' +
            '<div class="market-tile-top">' +
              '<span class="market-tile-ticker">' + escapeHtml(tile.title) + '</span>' +
              '<span class="market-tile-sub">' + escapeHtml(tile.subtitle) + '</span>' +
            '</div>' +
            '<span class="market-tile-price" data-price>…</span>' +
            '<span class="market-tile-change muted" data-change>загрузка</span>' +
          '</button>' +
          '<button type="button" class="market-tile-remove" data-remove-ticker="' + escapeHtml(tile.ticker) +
            '" aria-label="Удалить ' + escapeHtml(tile.ticker) + '">×</button>' +
        '</div>'
      );
    }).join('');

    ensureTickerNames(tickers);

    tickers.forEach(function (ticker) {
      fetchMoexQuote(ticker).then(function (quote) {
        var btn = el.querySelector('.market-tile[data-ticker="' + ticker + '"]');
        updateMarketTileButton(btn, quote, ticker);
      }).catch(function () {
        var btn = el.querySelector('.market-tile[data-ticker="' + ticker + '"]');
        updateMarketTileButton(btn, null, ticker);
      });
    });

    initMarketTilesBento();
  }



  function formatMacroChange(pct) {
    if (pct == null || !isFinite(pct)) return { text: '—', cls: 'muted' };
    var sign = pct > 0 ? '+' : '';
    return {
      text: sign + Number(pct).toFixed(2) + '%',
      cls: pct > 0 ? 'pnl-pos' : (pct < 0 ? 'pnl-neg' : 'muted')
    };
  }



  function fetchExternalText(url) {
    if (typeof fetchTextViaProxies === 'function') {
      return fetchTextViaProxies(url);
    }
    return fetch(url, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.text();
    });
  }



  function cbrDateReq(d) {
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
  }



  function parseCbrDailyXml(xml) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    var out = {};
    var nodes = doc.querySelectorAll('Valute');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var codeEl = node.querySelector('CharCode');
      var valEl = node.querySelector('Value');
      var nomEl = node.querySelector('Nominal');
      if (!codeEl || !valEl) continue;
      var code = (codeEl.textContent || '').trim();
      var nominal = parseFloat((nomEl && nomEl.textContent) ? nomEl.textContent : '1');
      var val = parseFloat(String(valEl.textContent || '').replace(',', '.'));
      if (!code || !isFinite(val)) continue;
      if (!isFinite(nominal) || nominal <= 0) nominal = 1;
      out[code] = val / nominal;
    }
    return out;
  }



  function parseCbrDailyJson(data) {
    if (!data || !data.Valute) return null;
    var result = { USD: null, EUR: null, CNY: null };
    ['USD', 'EUR', 'CNY'].forEach(function (code) {
      var v = data.Valute[code];
      if (!v) return;
      var nominal = Number(v.Nominal) || 1;
      var price = Number(v.Value) / nominal;
      if (!isFinite(price)) return;
      var prevRaw = Number(v.Previous);
      var changePct = null;
      if (isFinite(prevRaw) && prevRaw > 0) {
        var prev = prevRaw / nominal;
        changePct = ((price - prev) / prev) * 100;
      }
      result[code] = { price: price, changePct: changePct };
    });
    return result;
  }



  function fetchCbrFxRatesFromJson() {
    var timeoutMs = typeof RSS_FETCH_TIMEOUT_MS === 'number' ? RSS_FETCH_TIMEOUT_MS : 10000;
    var fetchP = fetch('https://www.cbr-xml-daily.ru/daily_json.js', {
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('cbr json ' + res.status);
      return res.json();
    });
    if (typeof fetchWithTimeout === 'function') {
      return fetchWithTimeout(fetchP, timeoutMs);
    }
    return fetchP;
  }



  function fetchCbrFxRatesViaXml() {
    var today = new Date();
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var urlToday = 'https://www.cbr.ru/scripts/XML_daily.asp?date_req=' + cbrDateReq(today);
    var urlPrev = 'https://www.cbr.ru/scripts/XML_daily.asp?date_req=' + cbrDateReq(yesterday);
    return fetchExternalText(urlToday).then(function (xml) {
      var todayRates = parseCbrDailyXml(xml);
      if (!todayRates) throw new Error('cbr parse');
      return fetchExternalText(urlPrev).catch(function () { return ''; }).then(function (prevXml) {
        var prevRates = prevXml ? parseCbrDailyXml(prevXml) : null;
        var result = { USD: null, EUR: null, CNY: null };
        ['USD', 'EUR', 'CNY'].forEach(function (code) {
          var cur = todayRates[code];
          if (!isFinite(cur)) return;
          var prev = prevRates && isFinite(prevRates[code]) ? prevRates[code] : null;
          var changePct = null;
          if (prev && prev > 0) changePct = ((cur - prev) / prev) * 100;
          result[code] = { price: cur, changePct: changePct };
        });
        return result;
      });
    });
  }



  function fetchCbrFxRates() {
    var cacheKey = 'cbr.fx';
    var cached = moexCacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);
    return fetchCbrFxRatesFromJson().then(function (data) {
      var result = parseCbrDailyJson(data);
      if (!result || (!result.USD && !result.EUR && !result.CNY)) throw new Error('cbr json empty');
      moexCacheSet(cacheKey, result, 60 * 60 * 1000);
      return result;
    }).catch(function () {
      return fetchCbrFxRatesViaXml().then(function (result) {
        moexCacheSet(cacheKey, result, 60 * 60 * 1000);
        return result;
      });
    });
  }



  function formatFxPrice(price) {
    if (price == null || !isFinite(price)) return '—';
    return Number(price).toFixed(2) + ' ₽';
  }



  function renderMacroTile(id, label, valueHtml, subHtml) {
    return (
      '<div class="macro-tile" data-macro-id="' + escapeHtml(id) + '">' +
        '<div class="macro-tile-lbl">' + escapeHtml(label) + '</div>' +
        '<div class="macro-tile-val">' + valueHtml + '</div>' +
        (subHtml ? '<div class="macro-tile-sub ' + (subHtml.cls || 'muted') + '">' + subHtml.text + '</div>' : '') +
      '</div>'
    );
  }



  function renderMarketMacro() {
    var row = document.getElementById('marketMacroRow');
    if (!row) return;
    row.innerHTML =
      renderMacroTile('imoex', 'Индекс', '…', { text: 'IMOEX', cls: 'muted' }) +
      renderMacroTile('rate', 'Ставка', escapeHtml(MACRO_KEY_RATE_LABEL), { text: 'Ключевая', cls: 'muted' }) +
      renderMacroTile('usd', 'USD', '…', { text: 'ЦБ РФ', cls: 'muted' }) +
      renderMacroTile('eur', 'EUR', '…', { text: 'ЦБ РФ', cls: 'muted' }) +
      renderMacroTile('cny', 'CNY', '…', { text: 'ЦБ РФ', cls: 'muted' }) +
      renderMacroTile('oil', 'Нефть', '…', { text: 'LKOH', cls: 'muted' });

    fetchMoexQuote('IMOEX').then(function (q) {
      var ch = formatMacroChange(q && q.changePct);
      var val = q && q.price != null ? formatChartPrice(q.price, 'IMOEX') : '—';
      patchMacroTile(row, 'imoex', val, ch);
    }).catch(function () { patchMacroTile(row, 'imoex', '—', { text: 'нет данных', cls: 'muted' }); });

    fetchMoexQuote('LKOH').then(function (q) {
      var ch = formatMacroChange(q && q.changePct);
      var val = q && q.price != null ? formatChartPrice(q.price, 'LKOH') : '—';
      patchMacroTile(row, 'oil', val, ch);
    }).catch(function () { patchMacroTile(row, 'oil', '—', { text: 'нет данных', cls: 'muted' }); });

    fetchCbrFxRates().then(function (fx) {
      if (!fx) return;
      ['USD', 'EUR', 'CNY'].forEach(function (code) {
        var item = fx[code];
        var id = code === 'USD' ? 'usd' : (code === 'EUR' ? 'eur' : 'cny');
        if (!item || item.price == null) {
          patchMacroTile(row, id, '—', { text: 'ЦБ РФ', cls: 'muted' });
          return;
        }
        patchMacroTile(row, id, formatFxPrice(item.price), formatMacroChange(item.changePct));
      });
    }).catch(function () {
      fetchMoexQuote('USD000UTSTOM').then(function (q) {
        if (!q || q.price == null) return fetchMoexQuote('SiM5');
        return q;
      }).then(function (q) {
        if (!q || q.price == null) return;
        patchMacroTile(row, 'usd', formatFxPrice(q.price), formatMacroChange(q.changePct));
      }).catch(function () {
        patchMacroTile(row, 'usd', '—', { text: 'нет данных', cls: 'muted' });
      });
    });
  }



  function patchMacroTile(row, id, value, change) {
    var tile = row.querySelector('[data-macro-id="' + id + '"]');
    if (!tile) return;
    var valEl = tile.querySelector('.macro-tile-val');
    var subEl = tile.querySelector('.macro-tile-sub');
    if (valEl) valEl.textContent = value;
    if (subEl && change) {
      subEl.textContent = change.text;
      subEl.className = 'macro-tile-sub ' + (change.cls || 'muted');
    }
  }


