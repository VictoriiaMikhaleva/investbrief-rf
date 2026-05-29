/* moex.js */
  function moexFormatDate(d) {
    return d.toISOString().slice(0, 10);
  }



  function moexFormatDateMsk(d) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(d);
    } catch (e) {
      return moexFormatDate(d);
    }
  }



  var IMOEX_TURNOVER_CACHE_MS = 5 * 60 * 1000;



  function invalidateImoexVolumeCaches() {
    ['imoex.turnover.week', 'moex.topvol.20'].forEach(function (key) {
      try { localStorage.removeItem(MOEX_CACHE_PREFIX + key); } catch (e) { /* */ }
    });
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
    if (typeof Markets !== 'undefined') {
      return Markets.resolveSecurityFromInput(raw).then(function (item) {
        return item ? item.ticker : '';
      });
    }
    var trimmed = String(raw || '').trim();
    if (!trimmed) return Promise.resolve('');
    var t = normalizeTicker(trimmed);
    if (/^[A-Z0-9][A-Z0-9._-]*$/i.test(t) && t.length >= 2 && !/[А-Яа-яЁё]/.test(trimmed)) {
      return fetchMoexTickerName(t).then(function () { return t; });
    }
    return searchMoexSecurities(trimmed).then(function (items) {
      if (!items.length) return normalizeTicker(trimmed);
      var pick = items[0];
      rememberTickerItem(pick);
      return pick.ticker;
    });
  }



  function isMoexBondTicker(ticker) {
    ticker = normalizeTicker(ticker);
    return ticker.indexOf('OFZ') >= 0 || (ticker.indexOf('SU') === 0 && ticker.length > 8);
  }



  function extractOfzIssueNumber(ticker) {
    var t = normalizeTicker(ticker);
    var m = t.match(/(\d{5})/);
    return m ? m[1] : null;
  }



  function pickBondFromMoexSearch(json, ticker) {
    var sec = json.securities;
    if (!sec || !sec.columns || !sec.data || !sec.data.length) return null;
    var cols = sec.columns;
    var secidIdx = cols.indexOf('secid');
    var shortIdx = cols.indexOf('shortname');
    var groupIdx = cols.indexOf('group');
    var boardIdx = cols.indexOf('primary_boardid');
    var issueNum = extractOfzIssueNumber(ticker);
    var t = normalizeTicker(ticker);
    var candidates = [];

    sec.data.forEach(function (row) {
      var group = groupIdx >= 0 ? String(row[groupIdx] || '') : '';
      if (group && group !== 'stock_bonds') return;
      var secid = secidIdx >= 0 ? row[secidIdx] : null;
      if (!secid) return;
      var shortname = shortIdx >= 0 ? String(row[shortIdx] || '') : '';
      if (issueNum && shortname.indexOf(issueNum) < 0 && String(secid).indexOf(issueNum) < 0) return;
      candidates.push({
        secid: secid,
        board: boardIdx >= 0 && row[boardIdx] ? row[boardIdx] : 'TQOB',
        shortname: shortname
      });
    });

    if (!candidates.length) {
      var secid = sec.data[0][secidIdx >= 0 ? secidIdx : 0];
      var board = boardIdx >= 0 && sec.data[0][boardIdx] ? sec.data[0][boardIdx] : 'TQOB';
      if (!secid) return null;
      return { secid: secid, board: board };
    }

    if (t.indexOf('SU') === 0) {
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].secid === t) return candidates[i];
      }
    }
    if (typeof BOND_SECID_MAP !== 'undefined' && BOND_SECID_MAP[t]) {
      var mapped = BOND_SECID_MAP[t];
      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j].secid === mapped) return candidates[j];
      }
    }
    return candidates[0];
  }



  function resolveRuBondInstrument(ticker) {
    var t = normalizeTicker(ticker);
    var cached = moexCacheGet('inst.bond.v3.' + t);
    if (cached) return Promise.resolve(cached);

    var issueNum = extractOfzIssueNumber(t);
    var query = issueNum || (t.indexOf('SU') === 0 ? t : t.replace(/^OFZ_?/i, '').replace(/_/g, ' '));

    return moexFetchJson(MOEX_ISS + '/securities.json?q=' + encodeURIComponent(query) +
      '&iss.meta=off&securities.columns=secid,shortname,primary_boardid,group&limit=24')
      .then(function (json) {
        var pick = pickBondFromMoexSearch(json, t);
        if (!pick) throw new Error('bond not found');
        var inst = { type: 'bond', engine: 'stock', market: 'bonds', board: pick.board || 'TQOB', secid: pick.secid };
        moexCacheSet('inst.bond.v3.' + t, inst, 24 * 60 * 60 * 1000);
        if (typeof BOND_SECID_MAP !== 'undefined') BOND_SECID_MAP[t] = pick.secid;
        if (pick.shortname && typeof saveTickerName === 'function') saveTickerName(t, pick.shortname);
        return inst;
      });
  }



  function resolveMoexInstrument(ticker) {
    var t = normalizeTicker(ticker);
    if (t === 'IMOEX' || t === 'INDEX') {
      return Promise.resolve({ type: 'index', engine: 'stock', market: 'index', board: null, secid: IMOEX_SECID });
    }
    if (isMoexBondTicker(t)) {
      return resolveRuBondInstrument(t);
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
    if (horizon === 'year') {
      from.setFullYear(from.getFullYear() - 5);
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



  function fetchMoexCandlesAll(url) {
    var allRows = [];
    var start = 0;
    var closeIdx = -1;
    var beginIdx = -1;
    var pageSize = 500;

    function fetchPage() {
      var pageUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'start=' + start;
      return moexFetchJson(pageUrl).then(function (json) {
        var block = json.candles;
        if (!block || !block.data || !block.data.length) return allRows;
        if (closeIdx < 0) {
          closeIdx = block.columns.indexOf('close');
          beginIdx = block.columns.indexOf('begin');
        }
        allRows = allRows.concat(block.data);
        if (block.data.length >= pageSize) {
          start += block.data.length;
          return fetchPage();
        }
        return allRows;
      });
    }

    return fetchPage().then(function (rows) {
      if (closeIdx < 0 || beginIdx < 0 || !rows.length) return [];
      return rows.map(function (row) {
        return { t: new Date(row[beginIdx]).getTime(), price: Number(row[closeIdx]) };
      }).filter(function (p) { return p.t && isFinite(p.price); });
    });
  }



  function mergeLiveQuoteIntoSeries(series, quote) {
    if (!series.length || !quote || quote.price == null || !isFinite(quote.price)) return series;
    var out = series.slice();
    var last = out[out.length - 1];
    var liveTs = Date.now();
    var lastDay = new Date(last.t);
    var liveDay = new Date(liveTs);
    var sameDay =
      lastDay.getFullYear() === liveDay.getFullYear() &&
      lastDay.getMonth() === liveDay.getMonth() &&
      lastDay.getDate() === liveDay.getDate();
    if (sameDay) {
      out[out.length - 1] = { t: liveTs, price: quote.price };
      return out;
    }
    if (liveTs - last.t > 12 * 60 * 60 * 1000) {
      out.push({ t: liveTs, price: quote.price });
    }
    return out;
  }



  function parseMoexLastPrice(json) {
    var q = parseMoexQuoteFromMd(json);
    return q ? q.price : null;
  }



  function parseMoexQuoteFromMd(json, isBond) {
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
    var priceKeys = isBond
      ? ['LAST', 'WAPRICE', 'LCURRENTPRICE', 'MARKETPRICE', 'LEGALCLOSEPRICE', 'CURRENTVALUE']
      : ['LAST', 'LCURRENTPRICE', 'LEGALCLOSEPRICE', 'CURRENTVALUE', 'MARKETPRICE'];
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
    var yld = col('YIELDATWAPRICE');
    if (yld == null || !isFinite(Number(yld))) yld = col('YIELD');
    if (yld == null || !isFinite(Number(yld))) yld = col('YIELDLASTCOUPON');

    return {
      price: price,
      changePct: chg != null && isFinite(Number(chg)) ? Number(chg) : null,
      yieldPct: yld != null && isFinite(Number(yld)) ? Number(yld) : null,
      valueToday: (function () {
        var v = col('VALTODAY');
        if (v == null) v = col('VALTODAY_RUR');
        if (v == null) v = col('VALUE');
        return v != null && isFinite(Number(v)) ? Number(v) : null;
      })()
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
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      return Markets.fetchUsQuote(ticker).then(function (q) {
        return q || { price: null, changePct: null };
      });
    }
    return resolveMoexInstrument(ticker).then(function (inst) {
      return moexFetchJson(moexMarketdataUrl(inst)).then(function (json) {
        var quote = parseMoexQuoteFromMd(json, inst.type === 'bond');
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
    else if (horizon === 'year') cut = now - 5 * 365 * 24 * 60 * 60 * 1000;
    else cut = now - 365 * 24 * 60 * 60 * 1000;
    var sliced = series.filter(function (p) { return p.t >= cut; });
    return sliced.length >= 2 ? sliced : series.slice(-Math.min(series.length, horizon === 'day' ? 24 : 30));
  }



  function fetchMoexHistory(ticker, horizon) {
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      return Markets.fetchUsHistory(ticker, horizon);
    }
    var cacheKey = 'candles.v2.' + ticker + '.' + horizon;
    var cached = moexCacheGet(cacheKey);
    if (cached) return Promise.resolve({ series: cached, source: 'moex', cached: true });

    return resolveMoexInstrument(ticker).then(function (inst) {
      var q = moexHorizonQuery(horizon);
      var url = moexCandlesUrl(inst) + '?from=' + q.from + '&till=' + q.till + '&interval=' + q.interval + '&iss.meta=off';
      return fetchMoexCandlesAll(url).then(function (rawSeries) {
        var series = sliceSeriesForHorizon(rawSeries, horizon);
        if (series.length < 2) throw new Error('not enough candles');
        return fetchMoexLastPrice(ticker).then(function (price) {
          series = mergeLiveQuoteIntoSeries(series, price != null ? { price: price } : null);
          moexCacheSet(cacheKey, series, horizon === 'year' ? 30 * 60 * 1000 : undefined);
          return { series: series, source: 'moex', inst: inst };
        }).catch(function () {
          moexCacheSet(cacheKey, series, horizon === 'year' ? 30 * 60 * 1000 : undefined);
          return { series: series, source: 'moex', inst: inst };
        });
      });
    });
  }



  function fetchMoexLastPrice(ticker) {
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      return Markets.fetchUsQuote(ticker).then(function (q) {
        return q && q.price != null ? q.price : null;
      });
    }
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
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      var us = Markets.getUsTickerInfo(ticker);
      return us ? us.name : 'Рынок США';
    }
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
      title: ticker === 'IMOEX' ? 'Индекс МосБиржи' : ticker,
      subtitle: ticker === 'IMOEX' ? 'IMOEX' : getTickerSubtitle(ticker),
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
        var noDataLbl = (ticker && isMoexBondTicker(ticker)) ? '—' : 'нет данных';
        changeEl.textContent = noDataLbl;
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



  function getBriefingQuoteTickers() {
    return (typeof BRIEFING_QUOTE_TICKERS !== 'undefined' && BRIEFING_QUOTE_TICKERS.length)
      ? BRIEFING_QUOTE_TICKERS.slice()
      : ['IMOEX'];
  }



  function renderMarketTiles() {
    var el = document.getElementById('marketTiles');
    if (!el) return;
    destroyMarketTilesBento();
    var tickers = getBriefingQuoteTickers();
    if (!tickers.length) {
      el.innerHTML = '<p class="market-tiles-empty muted">Индекс недоступен</p>';
      return;
    }
    el.innerHTML = tickers.map(function (ticker) {
      var tile = buildMarketTileConfig(ticker);
      var wrapCls = 'market-tile-wrap magic-bento-card magic-bento-card--border-glow star-border-container star-border-loading' + (tile.featured ? ' featured' : '');
      var showDiv = typeof window.isIndexQuoteTicker === 'function'
        ? !window.isIndexQuoteTicker(ticker)
        : (ticker !== 'IMOEX' && ticker !== 'INDEX');
      var divHtml = showDiv && typeof window.quoteCardDivMetricsHtml === 'function'
        ? window.quoteCardDivMetricsHtml()
        : '';
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
            '<div class="market-tile-metrics">' +
              '<span class="market-tile-price" data-price>…</span>' +
              '<span class="market-tile-change muted" data-change>загрузка</span>' +
            '</div>' +
            divHtml +
          '</button>' +
        '</div>'
      );
    }).join('');

    ensureTickerNames(tickers);

    tickers.forEach(function (ticker) {
      var wrap = el.querySelector('.market-tile-wrap[data-ticker="' + ticker + '"]');
      fetchMoexQuote(ticker).then(function (quote) {
        var btn = el.querySelector('.market-tile[data-ticker="' + ticker + '"]');
        updateMarketTileButton(btn, quote, ticker);
      }).catch(function () {
        var btn = el.querySelector('.market-tile[data-ticker="' + ticker + '"]');
        updateMarketTileButton(btn, null, ticker);
      });
      var skipDiv = typeof window.isIndexQuoteTicker === 'function'
        ? window.isIndexQuoteTicker(ticker)
        : (ticker === 'IMOEX' || ticker === 'INDEX');
      if (!skipDiv) {
        if (typeof queueEnrichQuoteCard === 'function' && wrap) queueEnrichQuoteCard(wrap, ticker);
        else if (typeof enrichQuoteCard === 'function' && wrap) enrichQuoteCard(wrap, ticker);
      }
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



  var MACRO_HTTP_TIMEOUT_MS = 6000;
  var MACRO_HTTP_DIRECT_MS = 4500;



  function fetchWithTimeoutMs(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms);
      })
    ]);
  }



  function promiseAny(promises) {
    return new Promise(function (resolve, reject) {
      if (!promises.length) return reject(new Error('empty'));
      var fails = 0;
      var lastErr;
      promises.forEach(function (p) {
        Promise.resolve(p).then(resolve).catch(function (e) {
          lastErr = e;
          fails++;
          if (fails >= promises.length) reject(lastErr || new Error('all failed'));
        });
      });
    });
  }



  function hasLocalMacroApi() {
    if (location.protocol === 'file:') return false;
    var host = (location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  }



  /** Быстрее, чем RSS-прокси (12 с): прямой запрос, затем параллельно cors-прокси. */
  function fetchExternalTextFast(url) {
    var enc = encodeURIComponent(url);
    var proxyFetches = [
      fetchWithTimeoutMs(
        fetch('https://api.allorigins.win/raw?url=' + enc, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
          if (!res.ok) throw new Error('allorigins ' + res.status);
          return res.text();
        }),
        MACRO_HTTP_TIMEOUT_MS
      ),
      fetchWithTimeoutMs(
        fetch('https://corsproxy.io/?' + enc, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
          if (!res.ok) throw new Error('corsproxy ' + res.status);
          return res.text();
        }),
        MACRO_HTTP_TIMEOUT_MS
      )
    ];
    if (hasLocalMacroApi()) {
      proxyFetches.unshift(
        fetchWithTimeoutMs(
          fetch('/api/rss?url=' + enc, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
            if (!res.ok) throw new Error('api rss ' + res.status);
            return res.text();
          }),
          MACRO_HTTP_TIMEOUT_MS
        )
      );
    }
    return fetchWithTimeoutMs(
      fetch(url, { credentials: 'omit', cache: 'default' }).then(function (res) {
        if (!res.ok) throw new Error('direct ' + res.status);
        return res.text();
      }),
      MACRO_HTTP_DIRECT_MS
    ).catch(function () {
      return promiseAny(proxyFetches);
    });
  }



  function fetchExternalText(url) {
    if (/cbr\.ru/i.test(url)) return fetchExternalTextFast(url);
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



  var MOEX_FX_SPOT = {
    USD: { secid: 'USD000UTSTOM', min: 50, max: 150 },
    EUR: { secid: 'EUR000UTSTOM', min: 50, max: 150 },
    CNY: { secid: 'CNYRUB_TOM', min: 5, max: 20 }
  };

  var MACRO_REFRESH_MS = 5 * 60 * 1000;
  var macroRefreshTimer = null;



  function moexSeltSpotUrl(secid) {
    return MOEX_ISS + '/engines/currency/markets/selt/boards/CETS/securities/' +
      encodeURIComponent(secid) + '.json?iss.only=marketdata&iss.meta=off' +
      '&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,PREVPRICE,OPEN';
  }



  function isFxPriceSane(code, price) {
    var band = MOEX_FX_SPOT[code];
    if (!band || price == null || !isFinite(price)) return false;
    return price >= band.min && price <= band.max;
  }



  function fetchMoexFxSpot(code) {
    var cfg = MOEX_FX_SPOT[code];
    if (!cfg) return Promise.resolve(null);
    var cacheKey = 'moex.fx.' + code;
    var cached = moexCacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);
    return moexFetchJson(moexSeltSpotUrl(cfg.secid)).then(function (json) {
      var quote = parseMoexQuoteFromMd(json);
      if (!quote || quote.price == null || !isFxPriceSane(code, quote.price)) return null;
      var out = { price: quote.price, changePct: quote.changePct, source: 'МосБиржа' };
      moexCacheSet(cacheKey, out, 2 * 60 * 1000);
      return out;
    }).catch(function () { return null; });
  }



  function fetchCbrFxRates(skipCache) {
    var cacheKey = 'cbr.fx';
    if (!skipCache) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    return fetchCbrFxRatesFromJson().then(function (data) {
      var result = parseCbrDailyJson(data);
      if (!result || (!result.USD && !result.EUR && !result.CNY)) throw new Error('cbr json empty');
      var dated = data && data.Date ? String(data.Date).slice(0, 10) : '';
      ['USD', 'EUR', 'CNY'].forEach(function (code) {
        if (result[code]) result[code].source = dated ? 'ЦБ РФ · ' + dated : 'ЦБ РФ';
      });
      moexCacheSet(cacheKey, result, 30 * 60 * 1000);
      return result;
    }).catch(function () {
      return fetchCbrFxRatesViaXml().then(function (result) {
        ['USD', 'EUR', 'CNY'].forEach(function (code) {
          if (result[code]) result[code].source = 'ЦБ РФ';
        });
        moexCacheSet(cacheKey, result, 30 * 60 * 1000);
        return result;
      });
    });
  }



  function fetchMacroFxRates(force) {
    var cacheKey = 'macro.fx';
    if (!force) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    return Promise.all([
      fetchMoexFxSpot('USD'),
      fetchMoexFxSpot('EUR'),
      fetchMoexFxSpot('CNY'),
      fetchCbrFxRates(force)
    ]).then(function (parts) {
      var moexUsd = parts[0];
      var moexEur = parts[1];
      var moexCny = parts[2];
      var cbr = parts[3] || {};
      var merged = {};
      ['USD', 'EUR', 'CNY'].forEach(function (code) {
        var live = code === 'USD' ? moexUsd : (code === 'EUR' ? moexEur : moexCny);
        var official = cbr[code];
        if (live && live.price != null) {
          merged[code] = live;
        } else if (official && official.price != null) {
          merged[code] = official;
        }
      });
      moexCacheSet(cacheKey, merged, 2 * 60 * 1000);
      return merged;
    });
  }



  function invalidateMacroLiveCaches(hard) {
    var keys = ['macro.fx', 'imoex.turnover.week', 'moex.topvol.20',
      'moex.fx.USD', 'moex.fx.EUR', 'moex.fx.CNY'];
    if (hard) keys.push('cbr.fx', 'cbr.keyrate');
    keys.forEach(function (key) {
      try { localStorage.removeItem(MOEX_CACHE_PREFIX + key); } catch (e) { /* */ }
    });
  }



  function applyMacroBootstrap(row) {
    if (!row) return;
    var kr = moexCacheGet('cbr.keyrate');
    if (kr && isFinite(kr.rate)) {
      patchMacroTile(row, 'rate', formatKeyRateLabel(kr.rate),
        macroChangeWithSource(kr.changePct, 'ЦБ РФ'));
    }
    var fx = moexCacheGet('macro.fx');
    if (!fx) {
      var cbr = moexCacheGet('cbr.fx');
      if (cbr) fx = cbr;
    }
    if (fx) {
      ['USD', 'EUR', 'CNY'].forEach(function (code) {
        var item = fx[code];
        var id = code === 'USD' ? 'usd' : (code === 'EUR' ? 'eur' : 'cny');
        if (!item || item.price == null) return;
        patchMacroTile(row, id, formatFxPrice(item.price),
          macroChangeWithSource(item.changePct, item.source || 'ЦБ РФ'));
      });
    }
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



  function formatKeyRateLabel(rate) {
    if (rate == null || !isFinite(rate)) return '—';
    return Number(rate).toFixed(2).replace('.', ',') + '%';
  }



  function parseCbrKeyRateFromHtml(html) {
    if (!html) return null;
    var re = /<td[^>]*>\s*(\d{2}\.\d{2}\.\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d]+[,.][\d]+)\s*<\/td>/gi;
    var rows = [];
    var m;
    while ((m = re.exec(html)) !== null) {
      rows.push({ date: m[1], rate: parseFloat(String(m[2]).replace(',', '.')) });
    }
    if (!rows.length) return null;
    var latest = rows[0];
    var prev = rows.length > 1 ? rows[1] : null;
    var changePct = null;
    if (prev && isFinite(prev.rate) && prev.rate > 0 && isFinite(latest.rate)) {
      changePct = ((latest.rate - prev.rate) / prev.rate) * 100;
    }
    return { rate: latest.rate, changePct: changePct, date: latest.date };
  }



  var keyRateInflight = null;

  function fetchCbrKeyRate() {
    var cacheKey = 'cbr.keyrate';
    var cached = moexCacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);
    if (keyRateInflight) return keyRateInflight;
    var url = 'https://www.cbr.ru/hd_base/KeyRate/';
    keyRateInflight = fetchExternalTextFast(url).then(function (html) {
      var parsed = parseCbrKeyRateFromHtml(html);
      if (!parsed || !isFinite(parsed.rate)) throw new Error('cbr keyrate parse');
      moexCacheSet(cacheKey, parsed, 6 * 60 * 60 * 1000);
      return parsed;
    }).then(function (r) {
      keyRateInflight = null;
      return r;
    }, function (e) {
      keyRateInflight = null;
      throw e;
    });
    return keyRateInflight;
  }



  function getBriefingNewsMarketFilter() {
    var markets = typeof Markets !== 'undefined' ? Markets.getMarketsEnabled() : { ru: true, us: false };
    return typeof Markets !== 'undefined' && Markets.normalizeNewsMarketFilter
      ? Markets.normalizeNewsMarketFilter(state && state.newsMarketFilter, markets)
      : (state && state.newsMarketFilter ? state.newsMarketFilter : 'all');
  }



  function shouldShowRuBriefingMarketBlocks() {
    if (typeof Markets === 'undefined') return true;
    var markets = Markets.getMarketsEnabled();
    if (!markets.ru) return false;
    return getBriefingNewsMarketFilter() !== 'US';
  }



  function shouldShowUsBriefingMarketBlocks() {
    if (typeof Markets === 'undefined') return false;
    var markets = Markets.getMarketsEnabled();
    if (!markets.us) return false;
    return getBriefingNewsMarketFilter() === 'US';
  }



  function formatVolTradeDate(iso, includeYear) {
    if (!iso) return '—';
    if (typeof formatTradeDateRu === 'function') {
      var lbl = formatTradeDateRu(iso, !!includeYear);
      return lbl || '—';
    }
    var parts = String(iso).trim().split('-');
    if (parts.length >= 3) {
      var day = parts[2].replace(/T.*/, '').slice(0, 2);
      var month = parts[1];
      var base = day + '.' + month;
      return includeYear ? base + '.' + parts[0] : base;
    }
    return String(iso);
  }



  function formatBlnRub(value) {
    if (value == null || !isFinite(value)) return '—';
    return (Number(value) / 1e9).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }



  function formatUsdVolume(value) {
    if (value == null || !isFinite(value)) return '—';
    var v = Number(value);
    if (v >= 1e9) return (v / 1e9).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млрд $';
    if (v >= 1e6) return (v / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млн $';
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' $';
  }



  function fetchImoexTurnoverWeek(skipCache) {
    var cacheKey = 'imoex.turnover.week';
    if (!skipCache) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    var till = new Date();
    var from = new Date(till);
    from.setDate(from.getDate() - 21);
    var baseUrl = 'https://iss.moex.com/iss/history/engines/stock/markets/index/securities/IMOEX.json' +
      '?from=' + moexFormatDateMsk(from) + '&till=' + moexFormatDateMsk(till) +
      '&iss.meta=off&history.columns=TRADEDATE,VALUE';
    var allRows = [];
    var start = 0;
    var idxDate = -1;
    var idxVal = -1;

    function fetchPage() {
      var url = baseUrl + '&start=' + start;
      return moexFetchJson(url).then(function (json) {
        var hist = json.history;
        if (!hist || !hist.data || !hist.data.length) return allRows;
        if (idxDate < 0) {
          idxDate = hist.columns.indexOf('TRADEDATE');
          idxVal = hist.columns.indexOf('VALUE');
        }
        allRows = allRows.concat(hist.data);
        var cur = json['history.cursor'] && json['history.cursor'].data && json['history.cursor'].data[0];
        var total = cur ? Number(cur[1]) : allRows.length;
        var pageSize = cur ? Number(cur[2]) : hist.data.length;
        if (pageSize > 0 && start + hist.data.length < total) {
          start += pageSize;
          return fetchPage();
        }
        return allRows;
      });
    }

    return fetchPage().then(function (rows) {
      if (!rows.length) throw new Error('no imoex history');
      var days = rows.map(function (row) {
        return {
          date: row[idxDate],
          value: row[idxVal] != null ? Number(row[idxVal]) : null
        };
      }).filter(function (d) { return d.value != null && isFinite(d.value); });
      days = days.slice(-7);
      if (!days.length) throw new Error('no turnover days');
      moexCacheSet(cacheKey, days, IMOEX_TURNOVER_CACHE_MS);
      return days;
    });
  }



  function fetchTopMoexSharesByVolume(limit, skipCache) {
    limit = limit || 20;
    var cacheKey = 'moex.topvol.' + limit;
    if (!skipCache) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    var all = [];
    var start = 0;
    var page = 100;

    function pageFetch() {
      var url = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json' +
        '?iss.meta=off&securities.columns=SECID,SHORTNAME' +
        '&marketdata.columns=SECID,LAST,VALTODAY,LASTTOPREVPRICE&start=' + start + '&limit=' + page;
      return moexFetchJson(url).then(function (json) {
        if (!json.marketdata || !json.marketdata.data.length) return all;
        var cols = json.marketdata.columns;
        var names = {};
        (json.securities.data || []).forEach(function (r) { names[r[0]] = r[1]; });
        var iSec = cols.indexOf('SECID');
        var iLast = cols.indexOf('LAST');
        var iVal = cols.indexOf('VALTODAY');
        var iChg = cols.indexOf('LASTTOPREVPRICE');
        json.marketdata.data.forEach(function (row) {
          var ticker = row[iSec];
          var val = row[iVal];
          var last = row[iLast];
          if (!ticker || val == null || !isFinite(val) || val <= 0 || last == null || !isFinite(last)) return;
          all.push({
            ticker: ticker,
            name: names[ticker] || getTickerSubtitle(ticker),
            valToday: val,
            price: last,
            changePct: row[iChg] != null && isFinite(Number(row[iChg])) ? Number(row[iChg]) : null
          });
        });
        var cursor = json.marketdata.cursor && json.marketdata.cursor.data && json.marketdata.cursor.data[0];
        if (cursor && start + page < cursor[1]) {
          start += page;
          return pageFetch();
        }
        return all;
      });
    }

    return pageFetch().then(function (list) {
      list.sort(function (a, b) { return b.valToday - a.valToday; });
      var top = list.slice(0, limit);
      if (!top.length) throw new Error('no top volume');
      moexCacheSet(cacheKey, top, IMOEX_TURNOVER_CACHE_MS);
      return top;
    });
  }



  function renderImoexVolumeBars(days) {
    var el = document.getElementById('imoexVolumeBars');
    if (!el) return;
    if (!days || !days.length) {
      el.className = 'imoex-volume-bars';
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
      el.innerHTML = '<p class="muted">Нет данных по обороту</p>';
      return;
    }
    var max = Math.max.apply(null, days.map(function (d) { return d.value; }));
    el.className = 'imoex-volume-bars imoex-volume-bars--vertical';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Оборот IMOEX за 7 торговых дней, млрд ₽');
    var withYear = typeof tradeDateSeriesNeedsYear === 'function' && tradeDateSeriesNeedsYear(days);
    el.innerHTML = days.map(function (d) {
      var dt = formatVolTradeDate(d.date, withYear);
      var bln = formatBlnRub(d.value);
      var pct = max > 0 ? Math.max(6, (d.value / max) * 100) : 0;
      return (
        '<div class="imoex-vol-col">' +
          '<span class="imoex-vol-val">' + escapeHtml(bln) + '</span>' +
          '<div class="imoex-vol-track" aria-hidden="true">' +
            '<div class="imoex-vol-bar" style="height:' + pct.toFixed(1) + '%"></div>' +
          '</div>' +
          '<span class="imoex-vol-date">' + escapeHtml(dt) + '</span>' +
        '</div>'
      );
    }).join('');
  }



  function renderImoexTopVolumeTable(rows, market) {
    market = market || 'RU';
    var isUs = market === 'US';
    var grid = document.getElementById('imoexTopVolumeCards');
    var tbody = document.getElementById('imoexTopVolumeBody');
    if (!rows || !rows.length) {
      if (grid) grid.innerHTML = '<p class="muted">Нет данных</p>';
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="muted">Нет данных</td></tr>';
      return;
    }
    if (grid) {
      grid.innerHTML = rows.map(function (r, i) {
        var ch = formatMacroChange(r.changePct);
        var divHtml = typeof window.quoteCardDivMetricsHtml === 'function'
          ? window.quoteCardDivMetricsHtml({ compact: isUs })
          : '';
        return (
          '<div class="quote-card-wrap imoex-top-card" data-ticker="' + escapeHtml(r.ticker) + '" data-market="' + market + '">' +
            '<button type="button" class="quote-card" data-ticker="' + escapeHtml(r.ticker) + '">' +
              '<div class="quote-card-top">' +
                '<span class="quote-card-ticker">#' + (i + 1) + ' ' + escapeHtml(r.ticker) + '</span>' +
                '<span class="quote-card-sub">' + escapeHtml(r.name || '') + '</span>' +
              '</div>' +
              '<div class="quote-card-metrics">' +
                '<span class="quote-card-price">' + escapeHtml(formatChartPrice(r.price, r.ticker)) + '</span>' +
                '<span class="quote-card-change ' + ch.cls + '">' + escapeHtml(ch.text) + '</span>' +
                (!isUs
                  ? ('<span class="quote-card-meta muted">Оборот ' + escapeHtml(formatBlnRub(r.valToday)) + ' млрд</span>')
                  : '') +
              '</div>' +
              divHtml +
            '</button>' +
          '</div>'
        );
      }).join('');
      rows.forEach(function (r) {
        var wrap = grid.querySelector('.quote-card-wrap[data-ticker="' + r.ticker + '"]');
        if (wrap && typeof queueEnrichQuoteCard === 'function') queueEnrichQuoteCard(wrap, r.ticker, market);
        else if (wrap && typeof enrichQuoteCard === 'function') enrichQuoteCard(wrap, r.ticker);
        if (wrap && isUs && r.divYieldPct != null) {
          var avgEl = wrap.querySelector('[data-div-avg]');
          var turnoverEl = wrap.querySelector('[data-turnover]');
          if (avgEl) {
            avgEl.textContent = (r.divYieldPct).toFixed(1).replace('.', ',') + '%';
            avgEl.className = 'quote-div-val' + (r.divYieldPct > 0 ? ' pnl-pos' : '');
          }
          if (turnoverEl) turnoverEl.textContent = formatUsdVolume(r.valToday);
        }
      });
      grid.querySelectorAll('.quote-card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var t = btn.getAttribute('data-ticker');
          if (t && typeof openSecurityAnalyticsModal === 'function') openSecurityAnalyticsModal(t);
        });
      });
    }
    if (!tbody) return;
    tbody.innerHTML = rows.map(function (r, i) {
      var ch = formatMacroChange(r.changePct);
      return (
        '<tr data-chart-ticker="' + escapeHtml(r.ticker) + '" class="imoex-top-row" tabindex="0" role="button">' +
          '<td>' + (i + 1) + '</td>' +
          '<td class="ticker">' + escapeHtml(r.ticker) + '</td>' +
          '<td>' + escapeHtml(r.name || '—') + '</td>' +
          '<td>' + escapeHtml(formatBlnRub(r.valToday)) + '</td>' +
          '<td>' + escapeHtml(formatChartPrice(r.price, r.ticker)) + '</td>' +
          '<td class="' + ch.cls + '">' + escapeHtml(ch.text) + '</td>' +
        '</tr>'
      );
    }).join('');
    tbody.querySelectorAll('.imoex-top-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var t = row.getAttribute('data-chart-ticker');
        if (t && typeof openSecurityAnalyticsModal === 'function') openSecurityAnalyticsModal(t);
      });
    });
  }



  function setBriefingLeadersPanelMode(mode) {
    var panel = document.getElementById('imoexMarketPanel');
    if (!panel) return;
    var title = panel.querySelector('.imoex-panel-title');
    var hintVol = panel.querySelector('.imoex-panel-hint');
    var subTitle = panel.querySelector('.imoex-subtitle');
    var hintDiv = panel.querySelector('.imoex-panel-hint--one-line');
    if (mode === 'US') {
      if (title) title.textContent = 'Рынок США · лидеры по обороту';
      if (hintVol) {
        hintVol.textContent = 'Оборот за текущую сессию по ликвидным бумагам (USD, Yahoo Finance).';
        hintVol.style.display = 'none';
      }
      if (subTitle) subTitle.textContent = 'Топ‑20 по обороту за сессию';
      if (hintDiv) {
        hintDiv.textContent = 'Див. доходность — trailing 12M по Yahoo. Нажмите для подробной аналитики.';
      }
    } else {
      if (title) title.textContent = 'Объём торгов · оборот и лидеры';
      if (hintVol) {
        hintVol.textContent = 'Оборот бумаг индекса IMOEX за 7 торговых дней (млрд ₽/день, МосБиржа)';
        hintVol.style.display = '';
      }
      if (subTitle) subTitle.textContent = 'Топ‑20 по обороту за сутки';
      if (hintDiv) {
        hintDiv.textContent = 'Средняя див. доходность за 5 лет и прогноз дивидендов на 12 мес. Нажмите для подробной аналитики.';
      }
    }
  }



  function renderUsMarketPanel(forceRefresh) {
    var panel = document.getElementById('imoexMarketPanel');
    if (!panel || typeof Markets === 'undefined' || !Markets.fetchUsTopStocksByVolume) return;
    setBriefingLeadersPanelMode('US');
    panel.hidden = false;
    var bars = document.getElementById('imoexVolumeBars');
    var src = document.getElementById('imoexMarketSource');
    var grid = document.getElementById('imoexTopVolumeCards');
    if (bars) bars.innerHTML = '';
    if (grid) grid.innerHTML = '<p class="muted">Загрузка…</p>';
    if (src) src.textContent = 'Загрузка данных Yahoo Finance…';

    Markets.fetchUsTopStocksByVolume(20, !!forceRefresh).then(function (rows) {
      renderImoexTopVolumeTable(rows, 'US');
      if (src) {
        src.textContent = 'Yahoo Finance · топ по обороту сессии · обновлено ' +
          new Date().toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }
    }).catch(function () {
      if (grid) {
        grid.innerHTML = '<p class="muted analytics-grid-empty">Данные США временно недоступны. Обновите страницу или попробуйте позже — котировки идут через Yahoo Finance.</p>';
      }
      if (src) src.textContent = 'Yahoo Finance недоступен — обновите страницу (Ctrl+F5)';
    });
  }



  function renderImoexMarketPanel(forceRefresh) {
    var panel = document.getElementById('imoexMarketPanel');
    if (!panel) return;
    if (shouldShowUsBriefingMarketBlocks()) {
      renderUsMarketPanel(forceRefresh);
      return;
    }
    if (!shouldShowRuBriefingMarketBlocks()) {
      panel.hidden = true;
      return;
    }
    setBriefingLeadersPanelMode('RU');
    if (forceRefresh) invalidateImoexVolumeCaches();
    panel.hidden = false;
    var bars = document.getElementById('imoexVolumeBars');
    var src = document.getElementById('imoexMarketSource');
    if (bars) {
      bars.style.display = '';
      bars.innerHTML = '<p class="muted">Загрузка…</p>';
    }
    if (src) src.textContent = 'Загрузка данных МосБиржи…';

    Promise.all([
      fetchImoexTurnoverWeek(!!forceRefresh),
      fetchTopMoexSharesByVolume(20, !!forceRefresh)
    ]).then(function (results) {
      renderImoexVolumeBars(results[0]);
      renderImoexTopVolumeTable(results[1], 'RU');
      if (src) {
        src.textContent = 'МосБиржа · оборот IMOEX и топ TQBR · обновлено ' +
          new Date().toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }
    }).catch(function () {
      if (bars) bars.innerHTML = '<p class="muted hint-frame">Объём торгов временно недоступен</p>';
      renderImoexTopVolumeTable([], 'RU');
      if (src) src.textContent = 'Данные МосБиржи недоступны';
    });
  }



  function renderUsMarketMacro(forceRefresh) {
    var row = document.getElementById('marketMacroRow');
    if (!row || typeof Markets === 'undefined') return;
    row.hidden = false;
    row.innerHTML =
      renderMacroTile('spy', 'S&P 500', '…', { text: 'ETF SPY · США', cls: 'muted' }) +
      renderMacroTile('qqq', 'Nasdaq 100', '…', { text: 'ETF QQQ · США', cls: 'muted' }) +
      renderMacroTile('vix', 'VIX', '…', { text: 'волатильность · США', cls: 'muted' });

    applyMacroBootstrap(row);

    [['spy', 'SPY'], ['qqq', 'QQQ'], ['vix', '^VIX']].forEach(function (pair) {
      Markets.fetchUsQuote(pair[1]).then(function (q) {
        var val = q && q.price != null ? formatChartPrice(q.price, pair[1]) : '—';
        patchMacroTile(row, pair[0], val, macroChangeWithSource(q && q.changePct, 'Yahoo'));
      }).catch(function () {
        patchMacroTile(row, pair[0], '—', { text: 'нет данных', cls: 'muted' });
      });
    });

    renderImoexMarketPanel(forceRefresh);
  }



  function renderMarketMacro(forceRefresh) {
    var row = document.getElementById('marketMacroRow');
    if (!row) return;
    if (shouldShowUsBriefingMarketBlocks()) {
      renderUsMarketMacro(forceRefresh);
      return;
    }
    if (!shouldShowRuBriefingMarketBlocks()) {
      row.hidden = true;
      renderImoexMarketPanel(forceRefresh);
      return;
    }
    if (forceRefresh) invalidateMacroLiveCaches(false);
    row.hidden = false;
    row.innerHTML =
      renderMacroTile('imoex', 'Индекс', '…', { text: 'IMOEX · МосБиржа', cls: 'muted' }) +
      renderMacroTile('rate', 'Ставка', '…', { text: 'ключевая · ЦБ РФ', cls: 'muted' }) +
      renderMacroTile('usd', 'USD', '…', { text: 'загрузка…', cls: 'muted' }) +
      renderMacroTile('eur', 'EUR', '…', { text: 'загрузка…', cls: 'muted' }) +
      renderMacroTile('cny', 'CNY', '…', { text: 'загрузка…', cls: 'muted' });

    applyMacroBootstrap(row);

    fetchCbrKeyRate().then(function (kr) {
      patchMacroTile(row, 'rate', formatKeyRateLabel(kr.rate),
        macroChangeWithSource(kr.changePct, 'ЦБ РФ'));
    }).catch(function () {
      patchMacroTile(row, 'rate', '—', { text: 'ЦБ РФ', cls: 'muted' });
    });

    fetchMoexQuote('IMOEX').then(function (q) {
      var val = q && q.price != null ? formatChartPrice(q.price, 'IMOEX') : '—';
      patchMacroTile(row, 'imoex', val, macroChangeWithSource(q && q.changePct, 'МосБиржа'));
    }).catch(function () { patchMacroTile(row, 'imoex', '—', { text: 'нет данных', cls: 'muted' }); });

    fetchCbrFxRatesFromJson().then(function (data) {
      var quick = parseCbrDailyJson(data);
      if (!quick) return;
      var dated = data && data.Date ? String(data.Date).slice(0, 10) : '';
      var src = dated ? 'ЦБ РФ · ' + dated : 'ЦБ РФ';
      ['USD', 'EUR', 'CNY'].forEach(function (code) {
        var item = quick[code];
        var id = code === 'USD' ? 'usd' : (code === 'EUR' ? 'eur' : 'cny');
        if (!item || item.price == null) return;
        patchMacroTile(row, id, formatFxPrice(item.price),
          macroChangeWithSource(item.changePct, src));
      });
    }).catch(function () { /* moex spot ниже */ });

    fetchMacroFxRates(!!forceRefresh).then(function (fx) {
      if (!fx) return;
      ['USD', 'EUR', 'CNY'].forEach(function (code) {
        var item = fx[code];
        var id = code === 'USD' ? 'usd' : (code === 'EUR' ? 'eur' : 'cny');
        if (!item || item.price == null) {
          patchMacroTile(row, id, '—', { text: 'нет данных', cls: 'muted' });
          return;
        }
        patchMacroTile(row, id, formatFxPrice(item.price),
          macroChangeWithSource(item.changePct, item.source || 'ЦБ РФ'));
      });
    }).catch(function () {
      ['usd', 'eur', 'cny'].forEach(function (id) {
        patchMacroTile(row, id, '—', { text: 'нет данных', cls: 'muted' });
      });
    });

    renderImoexMarketPanel(forceRefresh);
  }

  window.renderMarketMacro = renderMarketMacro;



  function patchMacroTile(row, id, value, change, sourceHint) {
    var tile = row.querySelector('[data-macro-id="' + id + '"]');
    if (!tile) return;
    var valEl = tile.querySelector('.macro-tile-val');
    var subEl = tile.querySelector('.macro-tile-sub');
    if (valEl) valEl.textContent = value;
    if (!subEl) return;
    if (change && (change.text != null || change.source)) {
      var line = change.text != null ? change.text : '—';
      if (change.source) line = line + ' · ' + change.source;
      subEl.textContent = line;
      subEl.className = 'macro-tile-sub ' + (change.cls || 'muted');
    } else if (sourceHint) {
      subEl.textContent = sourceHint;
      subEl.className = 'macro-tile-sub muted';
    }
  }



  function macroChangeWithSource(pct, source) {
    var ch = formatMacroChange(pct);
    ch.source = source || '';
    return ch;
  }



  function scheduleMarketMacroRefresh() {
    if (macroRefreshTimer) clearInterval(macroRefreshTimer);
    macroRefreshTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (!state || state.tab !== 'briefing') return;
      if (typeof renderMarketMacro !== 'function') return;
      invalidateImoexVolumeCaches();
      renderMarketMacro(false);
    }, MACRO_REFRESH_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (!state || state.tab !== 'briefing') return;
      invalidateImoexVolumeCaches();
      if (typeof renderMarketMacro === 'function') renderMarketMacro(false);
    });
  }

  window.scheduleMarketMacroRefresh = scheduleMarketMacroRefresh;


