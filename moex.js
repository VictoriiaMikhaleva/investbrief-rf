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
  /** Топ‑20 по VALTODAY: короткий TTL, чтобы ранг отражал текущую сессию. */
  var TOP_VOLUME_CACHE_MS = 60 * 1000;
  /** Live-обновление карточек топ‑20 на главной (VALTODAY меняется в течение сессии). */
  var TOP_VOLUME_LIVE_REFRESH_MS = 60 * 1000;
  var topVolumeRefreshTimer = null;
  var IMOEX_VOLUME_DAYS = 10;
  /** Короткая info-плашка у рыночных данных (полная формулировка — в legal/terms/футере). */
  var OPEN_MARKET_DATA_HINT = 'Данные могут отображаться с задержкой. Источники: открытые данные, включая MOEX ISS.';
  window.INVESTBRIEF_OPEN_MARKET_DATA_HINT = OPEN_MARKET_DATA_HINT;



  function invalidateImoexVolumeCaches() {
    ['imoex.turnover.week', 'imoex.turnover.v14', 'imoex.turnover.v10', 'moex.topvol.20', 'imoex.valtoday'].forEach(function (key) {
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

  var _dataFileCache = {};
  var DATA_FILE_TTL_MS = 60 * 1000;
  var _topTurnoverSnapshotMeta = null;
  var _topTurnoverFetchedAt = 0;
  var _topTurnoverDataLive = false;
  var _marketSnapshotMeta = null;
  var _marketMacroFetchedAt = 0;
  var _marketMacroDataLive = false;
  var _marketMacroCbrFxDate = '';

  function fetchInvestbriefDataFile(filename, force) {
    force = !!force;
    var now = Date.now();
    var cache = _dataFileCache[filename];
    if (!force && cache && now - cache.ts < DATA_FILE_TTL_MS) {
      return Promise.resolve(cache.payload);
    }
    return fetch((function () {
      try {
        return new URL('data/' + filename, window.location.href).toString();
      } catch (e) {
        return './data/' + filename;
      }
    })() + '?ts=' + Math.floor(now / 10000), {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('data file http ' + res.status);
      return res.json();
    }).then(function (json) {
      _dataFileCache[filename] = { ts: now, payload: json };
      return json;
    }).catch(function () {
      return null;
    });
  }

  function isDataSnapshotStale(snapshot) {
    return !!(snapshot && snapshot.status === 'stale');
  }

  function formatSnapshotUpdatedHm(snapshot) {
    if (!snapshot || !snapshot.updatedAt) return '';
    var d = new Date(snapshot.updatedAt);
    if (!isFinite(d.getTime())) return '';
    return d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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
      var ticker = normalizeTicker(secid);
      if (isBond && /OFZ|ОФЗ/i.test(name)) {
        var issue = String(name).match(/(\d{5})/) || String(secid).match(/(\d{5})/);
        if (issue) {
          ticker = 'OFZ_' + issue[1];
          if (typeof BOND_SECID_MAP !== 'undefined') BOND_SECID_MAP[ticker] = secid;
        }
      }
      out.push({
        ticker: ticker,
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
      return { interval: 60, from: moexFormatDateMsk(from), till: moexFormatDateMsk(till) };
    }
    if (horizon === 'week') {
      from.setDate(from.getDate() - 12);
      return { interval: 24, from: moexFormatDateMsk(from), till: moexFormatDateMsk(till) };
    }
    if (horizon === 'month') {
      from.setDate(from.getDate() - 45);
      return { interval: 24, from: moexFormatDateMsk(from), till: moexFormatDateMsk(till) };
    }
    if (horizon === 'year') {
      from.setFullYear(from.getFullYear() - 1);
      from.setDate(from.getDate() - 14);
      return { interval: 24, from: moexFormatDateMsk(from), till: moexFormatDateMsk(till) };
    }
    if (horizon === '5y') {
      from.setFullYear(from.getFullYear() - 5);
      return { interval: 24, from: moexFormatDateMsk(from), till: moexFormatDateMsk(till) };
    }
    from.setDate(from.getDate() - 400);
    return { interval: 7, from: moexFormatDateMsk(from), till: moexFormatDateMsk(till) };
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
      : ['LAST', 'LCURRENTPRICE', 'LEGALCLOSEPRICE', 'CURRENTVALUE', 'MARKETPRICETODAY', 'MARKETPRICE', 'WAPRICE', 'CLOSEPRICE'];
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
    var sysTime = col('SYSTIME');
    var tradeDate = '';
    if (sysTime) {
      var m = String(sysTime).match(/(\d{4}-\d{2}-\d{2})/);
      if (m) tradeDate = m[1];
    }

    return {
      price: price,
      changePct: chg != null && isFinite(Number(chg)) ? Number(chg) : null,
      yieldPct: yld != null && isFinite(Number(yld)) ? Number(yld) : null,
      valueToday: (function () {
        var v = col('VALTODAY');
        if (v == null) v = col('VALTODAY_RUR');
        if (v == null) v = col('VALUE');
        return v != null && isFinite(Number(v)) ? Number(v) : null;
      })(),
      tradeDate: tradeDate || undefined
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
    else if (horizon === 'year') cut = now - 366 * 24 * 60 * 60 * 1000;
    else if (horizon === '5y') cut = now - 5 * 365.25 * 24 * 60 * 60 * 1000;
    else cut = now - 365 * 24 * 60 * 60 * 1000;
    var sliced = series.filter(function (p) { return p.t >= cut; });
    return sliced.length >= 2 ? sliced : series.slice(-Math.min(series.length, horizon === 'day' ? 24 : 30));
  }



  function fetchMoexHistory(ticker, horizon) {
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) {
      return Markets.fetchUsHistory(ticker, horizon);
    }
    var cacheKey = 'candles.v4.' + ticker + '.' + horizon;
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
          moexCacheSet(cacheKey, series, (horizon === '5y' || horizon === 'year') ? 30 * 60 * 1000 : undefined);
          return { series: series, source: 'moex', inst: inst };
        }).catch(function () {
          moexCacheSet(cacheKey, series, (horizon === '5y' || horizon === 'year') ? 30 * 60 * 1000 : undefined);
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
    }).catch(function () { return null; });
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
    sourceEl.textContent = 'Загрузка…';

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
      sourceEl.textContent = OPEN_MARKET_DATA_HINT + ' · обновлено ' +
        new Date().toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }).catch(function () {
      valueEl.textContent = '—';
      dayEl.textContent = 'Нет данных';
      dayEl.className = 'index-change muted';
      monthEl.textContent = '';
      sourceEl.textContent = OPEN_MARKET_DATA_HINT + ' Данные временно недоступны.';
    });
  }



  function refreshPortfolioQuotes() {
    var snapshot = getPortfolio();
    if (!snapshot.positions.length) return Promise.resolve();
    var tickers = [];
    snapshot.positions.forEach(function (p) {
      var t = normalizeTicker(p.ticker);
      if (t && tickers.indexOf(t) === -1) tickers.push(t);
    });
    var quotes = {};
    var jobs = tickers.map(function (t) {
      return fetchMoexQuote(t).then(function (q) {
        quotes[t] = q;
      }).catch(function () {
        quotes[t] = null;
      });
    });
    return Promise.all(jobs).then(function () {
      var portfolio = getPortfolio();
      var touched = false;
      portfolio.positions.forEach(function (p) {
        var q = quotes[normalizeTicker(p.ticker)];
        if (!q) return;
        if (q.price != null && isFinite(q.price)) {
          p.currentPrice = q.price;
          touched = true;
        }
        if (q.changePct != null && isFinite(q.changePct)) p.dayChangePct = q.changePct;
        else delete p.dayChangePct;
      });
      if (touched) setPortfolio(portfolio);
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
    if (typeof window.resetEnrichQueue === 'function') window.resetEnrichQueue();
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
        ? window.quoteCardDivMetricsHtml({ ticker: ticker })
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
        if (quote && quote.tradeDate && typeof setQuoteCardTurnoverLabel === 'function') {
          setQuoteCardTurnoverLabel(wrap, { ticker: ticker, tradeDate: quote.tradeDate });
        }
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

  function refreshMarketTilesQuotes() {
    var el = document.getElementById('marketTiles');
    if (!el) return;
    var tickers = getBriefingQuoteTickers();
    if (!tickers.length) return;
    var missingDom = false;
    tickers.forEach(function (ticker) {
      if (!el.querySelector('.market-tile[data-ticker="' + ticker + '"]')) missingDom = true;
    });
    if (missingDom) {
      renderMarketTiles();
      return;
    }
    tickers.forEach(function (ticker) {
      var btn = el.querySelector('.market-tile[data-ticker="' + ticker + '"]');
      if (!btn) return;
      fetchMoexQuote(ticker).then(function (quote) {
        updateMarketTileButton(btn, quote, ticker);
      }).catch(function () {
        updateMarketTileButton(btn, null, ticker);
      });
    });
  }



  function formatMacroChange(pct) {
    if (pct == null || !isFinite(pct)) return { text: '—', cls: 'muted' };
    var sign = pct > 0 ? '+' : '';
    return {
      text: sign + Number(pct).toFixed(2).replace('.', ',') + '%',
      cls: pct > 0 ? 'pnl-pos' : (pct < 0 ? 'pnl-neg' : 'muted')
    };
  }

  function resolveTopVolumeChangeView(row, events) {
    var tradeDate = row && row.tradeDate ? row.tradeDate : getMoexSessionTradeDateIso();
    if (typeof formatSplitDayChangeDisplay === 'function') {
      var splitView = formatSplitDayChangeDisplay(
        row && row.ticker,
        tradeDate,
        row && row.changePct,
        events
      );
      if (splitView) return splitView;
    }
    return formatMacroChange(row && row.changePct);
  }

  function ensureSplitEventsForTopVolume(onReady) {
    if (typeof loadSplitEvents !== 'function') {
      onReady([]);
      return;
    }
    if (typeof hasSplitEventsLoaded === 'function' && hasSplitEventsLoaded()) {
      onReady(typeof getSplitEventsSync === 'function' ? getSplitEventsSync() : []);
      return;
    }
    loadSplitEvents().then(function (events) {
      onReady(events || []);
    }).catch(function () {
      onReady([]);
    });
  }



  function macroMeta(pct, source, tag, note) {
    return {
      changePct: pct,
      source: source || '',
      tag: tag || '',
      note: note || ''
    };
  }



  function buildMacroMetaHtml(meta) {
    if (!meta) return '';
    var html = '';
    if (meta.changeText != null) {
      html += '<div class="macro-tile-line macro-tile-chg ' + (meta.changeCls || 'muted') + '">' +
        escapeHtml(meta.changeText) + '</div>';
    } else if (meta.changePct != null || meta.changePct === 0) {
      var ch = formatMacroChange(meta.changePct);
      html += '<div class="macro-tile-line macro-tile-chg ' + ch.cls + '">' + escapeHtml(ch.text) + '</div>';
    } else if (meta.showChangePlaceholder) {
      html += '<div class="macro-tile-line macro-tile-chg muted">…</div>';
    }
    if (meta.source) {
      html += '<div class="macro-tile-line macro-tile-src muted">' + escapeHtml(meta.source) + '</div>';
    }
    if (meta.tag) {
      html += '<div class="macro-tile-line macro-tile-tag muted">' + escapeHtml(meta.tag) + '</div>';
    }
    if (meta.note) {
      html += '<div class="macro-tile-line macro-tile-note muted">' + escapeHtml(meta.note) + '</div>';
    }
    return html;
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
    USD: { secid: 'USD000UTSTOM', alt: ['USD000UTSTOD'], min: 50, max: 150 },
    EUR: { secid: 'EUR_RUB__TOM', alt: ['EUR_RUB__TOD', 'EUR000UTSTOM'], min: 50, max: 150 },
    CNY: { secid: 'CNYRUB_TOM', alt: ['CNYRUB_TOD'], min: 5, max: 20 }
  };

  var MACRO_REFRESH_MS = 5 * 60 * 1000;
  var macroRefreshTimer = null;
  var macroVisibilityBound = false;



  function moexSeltSpotUrl(secid) {
    return MOEX_ISS + '/engines/currency/markets/selt/boards/CETS/securities/' +
      encodeURIComponent(secid) + '.json?iss.only=marketdata,securities&iss.meta=off' +
      '&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,PREVPRICE,OPEN,MARKETPRICE,MARKETPRICETODAY,WAPRICE,CLOSEPRICE' +
      '&securities.columns=SECID,PREVPRICE,PREVWAPRICE';
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
    var ids = [cfg.secid].concat(cfg.alt || []);
    var i = 0;

    function tryNext() {
      if (i >= ids.length) return Promise.resolve(null);
      var secid = ids[i++];
      return moexFetchJson(moexSeltSpotUrl(secid)).then(function (json) {
        var quote = parseMoexQuoteFromMd(json);
        if (!quote || quote.price == null || !isFxPriceSane(code, quote.price)) {
          return tryNext();
        }
        var out = { price: quote.price, changePct: quote.changePct, source: 'МосБиржа' };
        moexCacheSet(cacheKey, out, 2 * 60 * 1000);
        return out;
      }).catch(function () {
        return tryNext();
      });
    }

    return tryNext();
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
      if (dated) _marketMacroCbrFxDate = dated;
      ['USD', 'EUR', 'CNY'].forEach(function (code) {
        if (result[code]) result[code].source = 'ЦБ РФ';
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
    var keys = ['macro.fx', 'imoex.turnover.week', 'imoex.turnover.v14', 'imoex.turnover.v10', 'imoex.valtoday', 'moex.topvol.20',
      'moex.fx.USD', 'moex.fx.EUR', 'moex.fx.CNY', 'forts.rows', 'macro.commodities',
      'last.IMOEX', 'cbr.keyrate'];
    if (hard) keys.push('cbr.fx');
    keys.forEach(function (key) {
      try { localStorage.removeItem(MOEX_CACHE_PREFIX + key); } catch (e) { /* */ }
    });
  }



  function applyMacroBootstrap(row) {
    if (!row) return;
    var kr = moexCacheGet('cbr.keyrate');
    if (kr && isFinite(kr.rate)) {
      patchMacroTile(row, 'rate', formatKeyRateLabel(kr.rate), buildKeyRateMeta(kr));
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
          macroMeta(item.changePct, (item.source || 'ЦБ РФ').split(' · ')[0], 'валюта'));
      });
    }
    var commodities = moexCacheGet('macro.commodities');
    if (commodities) applyMacroCommodityBootstrap(row, commodities);
  }



  var MACRO_METAL_TILES = [
    { id: 'gold', label: 'Золото', asset: 'GOLD', tag: 'Au · FORTS' },
    { id: 'silver', label: 'Серебро', asset: 'SILV', tag: 'Ag · FORTS' },
    { id: 'nickel', label: 'Никель', asset: 'NICKEL', tag: 'Ni · FORTS' }
  ];

  var MACRO_COMMODITY_TILE_IDS = ['oil', 'coffee', 'cocoa'].concat(
    MACRO_METAL_TILES.map(function (m) { return m.id; })
  );

  function formatCommodityMacroPrice(kind, price) {
    if (price == null || !isFinite(price)) return '—';
    var n = Number(price);
    if (kind === 'oil') return n.toFixed(2).replace('.', ',') + ' $/барр.';
    if (kind === 'coffee') return n.toFixed(2).replace('.', ',') + ' $/фунт';
    if (kind === 'cocoa') return n.toFixed(1).replace('.', ',') + ' $/100 кг';
    if (kind === 'metal') {
      return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' $';
    }
    return n.toFixed(2).replace('.', ',');
  }



  function renderMacroCommodityTilesHtml() {
    var html = renderMacroTile('oil', 'Нефть', '…', macroMeta(null, 'МосБиржа', 'FORTS', 'Brent'));
    MACRO_METAL_TILES.forEach(function (m) {
      html += renderMacroTile(m.id, m.label, '…', macroMeta(null, 'МосБиржа', 'FORTS', m.tag.split(' · ')[0]));
    });
    html += renderMacroTile('coffee', 'Кофе', '…', macroMeta(null, 'МосБиржа', 'FORTS', 'арабика'));
    html += renderMacroTile('cocoa', 'Какао', '…', macroMeta(null, 'МосБиржа', 'FORTS', 'фьючерс'));
    return html;
  }



  function fetchMoexFortsRows(skipCache) {
    var cacheKey = 'forts.rows';
    if (!skipCache) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    var all = [];
    var start = 0;
    var pageSize = 100;

    function pageFetch() {
      var url = MOEX_ISS + '/engines/futures/markets/forts/securities.json' +
        '?iss.meta=off&securities.columns=SECID,SHORTNAME,ASSETCODE' +
        '&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VALTODAY&start=' + start + '&limit=' + pageSize;
      return moexFetchJson(url).then(function (json) {
        var sec = json.securities;
        var md = json.marketdata;
        if (!md || !md.data || !md.data.length) return all;
        var secCols = sec.columns;
        var mdCols = md.columns;
        var iAsset = secCols.indexOf('ASSETCODE');
        var iName = secCols.indexOf('SHORTNAME');
        var iSecMd = mdCols.indexOf('SECID');
        var iLast = mdCols.indexOf('LAST');
        var iChg = mdCols.indexOf('LASTTOPREVPRICE');
        var iVal = mdCols.indexOf('VALTODAY');
        var names = {};
        var assets = {};
        (sec.data || []).forEach(function (row) {
          names[row[0]] = row[secCols.indexOf('SHORTNAME')] || row[0];
          if (iAsset >= 0) assets[row[0]] = row[iAsset];
        });
        md.data.forEach(function (row) {
          var secid = row[iSecMd];
          var price = row[iLast];
          if (!secid || price == null || !isFinite(Number(price)) || Number(price) <= 0) return;
          var chg = row[iChg];
          all.push({
            secid: secid,
            name: names[secid] || secid,
            assetCode: assets[secid] || '',
            price: Number(price),
            changePct: chg != null && isFinite(Number(chg)) ? Number(chg) : null,
            valToday: row[iVal] != null && isFinite(Number(row[iVal])) ? Number(row[iVal]) : 0
          });
        });
        var cursor = md.cursor && md.cursor.data && md.cursor.data[0];
        if (cursor && start + pageSize < cursor[1]) {
          start += pageSize;
          return pageFetch();
        }
        moexCacheSet(cacheKey, all, IMOEX_TURNOVER_CACHE_MS);
        return all;
      });
    }

    return pageFetch();
  }



  function pickFortsByAsset(rows, assetCode) {
    var best = null;
    rows.forEach(function (r) {
      if (r.assetCode !== assetCode) return;
      if (!best || (r.valToday || 0) > (best.valToday || 0)) best = r;
    });
    return best;
  }



  function buildMacroCommoditySnapshot(rows) {
    var oil = pickFortsByAsset(rows, 'BR');
    var coffee = pickFortsByAsset(rows, 'COFFEE');
    var cocoa = pickFortsByAsset(rows, 'COCOA');
    var snap = {
      oil: oil ? { price: oil.price, changePct: oil.changePct } : null,
      coffee: coffee ? { price: coffee.price, changePct: coffee.changePct } : null,
      cocoa: cocoa ? { price: cocoa.price, changePct: cocoa.changePct } : null
    };
    MACRO_METAL_TILES.forEach(function (m) {
      var pick = pickFortsByAsset(rows, m.asset);
      snap[m.id] = pick ? { price: pick.price, changePct: pick.changePct } : null;
    });
    return snap;
  }



  function applyMacroCommodityBootstrap(row, snap) {
    if (!row || !snap) return;
    if (snap.oil) {
      patchMacroTile(row, 'oil', formatCommodityMacroPrice('oil', snap.oil.price),
        macroMeta(snap.oil.changePct, 'МосБиржа', 'FORTS', 'Brent'));
    }
    MACRO_METAL_TILES.forEach(function (m) {
      var item = snap[m.id];
      if (!item) return;
      patchMacroTile(row, m.id, formatCommodityMacroPrice('metal', item.price),
        macroMeta(item.changePct, 'МосБиржа', 'FORTS', m.tag.split(' · ')[0]));
    });
    if (snap.coffee) {
      patchMacroTile(row, 'coffee', formatCommodityMacroPrice('coffee', snap.coffee.price),
        macroMeta(snap.coffee.changePct, 'МосБиржа', 'FORTS', 'арабика'));
    }
    if (snap.cocoa) {
      patchMacroTile(row, 'cocoa', formatCommodityMacroPrice('cocoa', snap.cocoa.price),
        macroMeta(snap.cocoa.changePct, 'МосБиржа', 'FORTS', 'фьючерс'));
    }
  }



  function fetchMacroCommodities(forceRefresh) {
    var cacheKey = 'macro.commodities';
    if (!forceRefresh) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    return fetchMoexFortsRows(!!forceRefresh).then(function (rows) {
      var snap = buildMacroCommoditySnapshot(rows);
      moexCacheSet(cacheKey, snap, IMOEX_TURNOVER_CACHE_MS);
      return snap;
    }).catch(function () { return null; });
  }



  function patchMacroCommodityTiles(row, forceRefresh) {
    if (!row) return Promise.resolve();
    return fetchMacroCommodities(!!forceRefresh).then(function (snap) {
      if (!snap) {
        MACRO_COMMODITY_TILE_IDS.forEach(function (id) {
          patchMacroTile(row, id, '—', { changeText: 'нет данных', changeCls: 'muted' });
        });
        return;
      }
      markMarketMacroLive();
      applyMacroCommodityBootstrap(row, snap);
    });
  }



  function formatFxPrice(price) {
    if (price == null || !isFinite(price)) return '—';
    return Number(price).toFixed(2) + ' ₽';
  }



  function renderMacroTile(id, label, valueHtml, meta) {
    var metaHtml = meta
      ? '<div class="macro-tile-meta">' + buildMacroMetaHtml(meta) + '</div>'
      : '';
    return (
      '<div class="macro-tile" data-macro-id="' + escapeHtml(id) + '">' +
        '<div class="macro-tile-lbl">' + escapeHtml(label) + '</div>' +
        '<div class="macro-tile-val">' + valueHtml + '</div>' +
        metaHtml +
      '</div>'
    );
  }



  function formatKeyRateLabel(rate) {
    if (rate == null || !isFinite(rate)) return '—';
    return Number(rate).toFixed(2).replace('.', ',') + '%';
  }



  function parseRuPressDateToIsoParts(text) {
    if (!text) return null;
    var m = String(text).match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i);
    if (!m) return null;
    var months = {
      января: '01', февраля: '02', марта: '03', апреля: '04', мая: '05', июня: '06',
      июля: '07', августа: '08', сентября: '09', октября: '10', ноября: '11', декабря: '12'
    };
    var dd = String(m[1]).padStart(2, '0');
    var mm = months[m[2].toLowerCase()];
    if (!mm) return null;
    return { date: dd + '.' + mm + '.' + m[3], iso: m[3] + '-' + mm + '-' + dd };
  }



  function parseCbrKeyRateFromPressHtml(html) {
    if (!html) return null;
    var t = String(html)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#160;/gi, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/&thinsp;|&#8201;/gi, '')
      .replace(/<\/?em>/gi, '')
      .replace(/\s+/g, ' ');

    var dateInfo = parseRuPressDateToIsoParts(t);
    // \w в JS не матчит кириллицу — только [а-яё]
    var cut = t.match(/снизить\s+ключев[а-яё]*\s+ставк[а-яё]*\s+на\s+(\d+(?:[.,]\d+)?)\s*б\.?\s*п\.?\s*,?\s*до\s+(\d+[.,]\d+)/i);
    var hike = t.match(/повысить\s+ключев[а-яё]*\s+ставк[а-яё]*\s+на\s+(\d+(?:[.,]\d+)?)\s*б\.?\s*п\.?\s*,?\s*до\s+(\d+[.,]\d+)/i);
    var keep = t.match(/сохранить\s+ключев[а-яё]*\s+ставк[а-яё]*[^\d]{0,40}(\d+[.,]\d+)/i);
    var rate = null;
    var deltaPp = null;

    if (cut) {
      rate = parseFloat(String(cut[2]).replace(',', '.'));
      deltaPp = -parseFloat(String(cut[1]).replace(',', '.')) / 100;
    } else if (hike) {
      rate = parseFloat(String(hike[2]).replace(',', '.'));
      deltaPp = parseFloat(String(hike[1]).replace(',', '.')) / 100;
    } else if (keep) {
      rate = parseFloat(String(keep[1]).replace(',', '.'));
      deltaPp = 0;
    } else {
      var loose = t.match(/ключев[а-яё]*\s+ставк[а-яё]*[^\d]{0,80}до\s+(\d+[.,]\d+)\s*%/i);
      if (loose) rate = parseFloat(String(loose[1]).replace(',', '.'));
    }

    if (rate == null || !isFinite(rate) || rate < 1 || rate > 40) return null;
    var changePct = null;
    if (deltaPp != null && isFinite(deltaPp) && rate - deltaPp > 0) {
      changePct = (deltaPp / (rate - deltaPp)) * 100;
    }
    return {
      rate: rate,
      changePct: changePct,
      deltaPp: deltaPp,
      date: dateInfo ? dateInfo.date : '',
      fromPress: true,
      source: 'ЦБ РФ · решение'
    };
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
    var deltaPp = null;
    if (prev && isFinite(prev.rate) && isFinite(latest.rate)) {
      deltaPp = latest.rate - prev.rate;
      if (prev.rate > 0) changePct = (deltaPp / prev.rate) * 100;
    }
    return {
      rate: latest.rate,
      changePct: changePct,
      deltaPp: deltaPp,
      date: latest.date,
      fromPress: false,
      source: 'ЦБ РФ'
    };
  }



  var KEY_RATE_HINT =
    'После решения ЦБ новая ключевая ставка обычно применяется со следующего рабочего дня. До этой даты в карточке может быть показано объявленное решение.';



  function buildKeyRateMeta(kr) {
    if (!kr || kr.rate == null || !isFinite(kr.rate)) {
      return { changeText: '—', changeCls: 'muted', source: 'ЦБ РФ', tag: 'ключевая' };
    }
    var changeText = '—';
    var changeCls = 'muted';
    if (kr.deltaPp != null && isFinite(kr.deltaPp)) {
      var sign = kr.deltaPp > 0 ? '+' : '';
      changeText = sign + Number(kr.deltaPp).toFixed(2).replace('.', ',') + ' п.п.';
      changeCls = kr.deltaPp > 0 ? 'pnl-pos' : (kr.deltaPp < 0 ? 'pnl-neg' : 'muted');
    } else if (kr.changePct != null && isFinite(kr.changePct)) {
      var ch = formatMacroChange(kr.changePct);
      changeText = ch.text;
      changeCls = ch.cls;
    }
    return {
      changeText: changeText,
      changeCls: changeCls,
      source: kr.source || 'ЦБ РФ',
      tag: kr.fromPress ? 'решение' : 'ключевая',
      note: kr.date || ''
    };
  }



  function setMarketKeyRateHintVisible(visible) {
    var hint = document.getElementById('marketKeyRateHint');
    if (hint) hint.hidden = !visible;
  }



  function pickPreferredKeyRate(press, table) {
    if (press && isFinite(press.rate) && table && isFinite(table.rate)) {
      // После решения ЦБ таблица KeyRate запаздывает до даты вступления — берём пресс-релиз.
      if (Math.abs(press.rate - table.rate) > 1e-6) return press;
      return Object.assign({}, table, {
        deltaPp: press.deltaPp != null ? press.deltaPp : table.deltaPp,
        changePct: press.changePct != null ? press.changePct : table.changePct,
        fromPress: !!press.fromPress,
        source: press.source || table.source
      });
    }
    return press || table || null;
  }



  var keyRateInflight = null;

  function fetchCbrKeyRate() {
    var cacheKey = 'cbr.keyrate';
    var cached = moexCacheGet(cacheKey);
    if (cached && isFinite(cached.rate)) return Promise.resolve(cached);
    if (keyRateInflight) return keyRateInflight;

    keyRateInflight = Promise.all([
      fetchExternalTextFast('https://www.cbr.ru/press/keypr/').then(parseCbrKeyRateFromPressHtml).catch(function () { return null; }),
      fetchExternalTextFast('https://www.cbr.ru/hd_base/KeyRate/').then(parseCbrKeyRateFromHtml).catch(function () { return null; })
    ]).then(function (parts) {
      var parsed = pickPreferredKeyRate(parts[0], parts[1]);
      if (!parsed || !isFinite(parsed.rate)) throw new Error('cbr keyrate parse');
      moexCacheSet(cacheKey, parsed, MACRO_REFRESH_MS);
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



  function fetchImoexTurnoverWeekFromSnapshot() {
    return fetchInvestbriefDataFile('top-turnover.json', false).then(function (snapshot) {
      if (snapshot && snapshot.data && Array.isArray(snapshot.data.turnoverWeek) && snapshot.data.turnoverWeek.length) {
        return { rows: snapshot.data.turnoverWeek, snapshot: snapshot };
      }
      return null;
    });
  }

  function fetchImoexTurnoverWeek(skipCache) {
    function withLiveDay(rows) {
      return fetchImoexValTodayLive(!!skipCache).then(function (live) {
        return mergeImoexTurnoverWithLive(rows, live);
      }).catch(function () {
        return (rows || []).slice(-IMOEX_VOLUME_DAYS);
      });
    }
    function fromDirect() {
      return fetchImoexTurnoverWeekDirect(!!skipCache).then(function (rows) {
        _topTurnoverDataLive = true;
        _topTurnoverSnapshotMeta = null;
        _topTurnoverFetchedAt = Date.now();
        return withLiveDay(rows);
      });
    }
    function fromSnapshotOrDirect() {
      return fetchImoexTurnoverWeekFromSnapshot().then(function (pack) {
        if (pack && pack.rows && pack.rows.length >= IMOEX_VOLUME_DAYS) {
          _topTurnoverSnapshotMeta = pack.snapshot;
          _topTurnoverDataLive = false;
          return withLiveDay(pack.rows);
        }
        return fromDirect().catch(function () {
          if (!pack) throw new Error('no imoex turnover');
          _topTurnoverSnapshotMeta = pack.snapshot;
          _topTurnoverDataLive = false;
          return withLiveDay(pack.rows);
        });
      });
    }
    if (skipCache) {
      return fromDirect().catch(function () {
        return fetchImoexTurnoverWeekFromSnapshot().then(function (pack) {
          if (!pack) throw new Error('no imoex turnover');
          _topTurnoverSnapshotMeta = pack.snapshot;
          _topTurnoverDataLive = false;
          return withLiveDay(pack.rows);
        });
      });
    }
    return fromSnapshotOrDirect();
  }

  function fetchImoexValTodayLive(skipCache) {
    var cacheKey = 'imoex.valtoday';
    if (!skipCache) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    var url = MOEX_ISS + '/engines/stock/markets/index/securities/' + encodeURIComponent(IMOEX_SECID) +
      '.json?iss.only=marketdata&iss.meta=off' +
      '&marketdata.columns=SECID,VALTODAY,TRADEDATE,TRADE_SESSION_DATE,UPDATETIME';
    return moexFetchJson(url).then(function (json) {
      var md = json && json.marketdata;
      if (!md || !md.columns || !md.data || !md.data[0]) throw new Error('no imoex valtoday');
      var cols = md.columns;
      var row = md.data[0];
      var iVal = cols.indexOf('VALTODAY');
      var iDate = cols.indexOf('TRADE_SESSION_DATE');
      if (iDate < 0) iDate = cols.indexOf('TRADEDATE');
      var value = iVal >= 0 ? Number(row[iVal]) : null;
      var date = iDate >= 0 && row[iDate] ? String(row[iDate]).slice(0, 10) : moexFormatDateMsk(new Date());
      if (value == null || !isFinite(value) || value <= 0) throw new Error('empty imoex valtoday');
      var out = { date: date, value: value, live: true };
      moexCacheSet(cacheKey, out, IMOEX_TURNOVER_CACHE_MS);
      return out;
    });
  }



  function mergeImoexTurnoverWithLive(days, live) {
    var out = (days || []).slice();
    if (!live || !live.date || live.value == null || !isFinite(live.value) || live.value <= 0) {
      return out.slice(-IMOEX_VOLUME_DAYS);
    }
    var idx = -1;
    for (var i = 0; i < out.length; i++) {
      if (out[i].date === live.date) { idx = i; break; }
    }
    var point = { date: live.date, value: live.value, live: true };
    if (idx >= 0) out[idx] = point;
    else out.push(point);
    out.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
    return out.slice(-IMOEX_VOLUME_DAYS);
  }



  function fetchImoexTurnoverWeekDirect(skipCache) {
    var cacheKey = 'imoex.turnover.v10';
    if (!skipCache) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    var till = new Date();
    var from = new Date(till);
    from.setDate(from.getDate() - 45);
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
      days = days.slice(-IMOEX_VOLUME_DAYS);
      if (!days.length) throw new Error('no turnover days');
      moexCacheSet(cacheKey, days, IMOEX_TURNOVER_CACHE_MS);
      return days;
    });
  }



  function fetchTopMoexSharesByVolumeFromSnapshot() {
    return fetchInvestbriefDataFile('top-turnover.json', false).then(function (snapshot) {
      if (snapshot && snapshot.data && Array.isArray(snapshot.data.top) && snapshot.data.top.length) {
        return { top: snapshot.data.top, snapshot: snapshot };
      }
      return null;
    });
  }

  function fetchTopMoexSharesByVolume(limit, skipCache) {
    limit = limit || 20;
    // Сначала live ISS (VALTODAY с начала сессии), снимок — только запасной канал.
    return fetchTopMoexSharesByVolumeDirect(limit, !!skipCache).then(function (top) {
      _topTurnoverDataLive = true;
      _topTurnoverSnapshotMeta = null;
      _topTurnoverFetchedAt = Date.now();
      return top;
    }).catch(function () {
      return fetchTopMoexSharesByVolumeFromSnapshot().then(function (pack) {
        if (!pack) throw new Error('no top volume');
        _topTurnoverSnapshotMeta = pack.snapshot;
        _topTurnoverDataLive = false;
        return pack.top.slice(0, limit);
      });
    });
  }

  function fetchTopMoexSharesByVolumeDirect(limit, skipCache) {
    limit = limit || 20;
    var cacheKey = 'moex.topvol.' + limit;
    if (!skipCache) {
      var cached = moexCacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
    }
    var iss = (typeof MOEX_ISS !== 'undefined' && MOEX_ISS) ? MOEX_ISS : 'https://iss.moex.com/iss';
    // Один запрос с сортировкой VALTODAY на стороне MOEX — быстрее и точнее полного обхода TQBR.
    var fetchLimit = Math.max(limit * 4, 60);
    var url = iss + '/engines/stock/markets/shares/boards/TQBR/securities.json' +
      '?iss.meta=off&securities.columns=SECID,SHORTNAME' +
      '&marketdata.columns=SECID,LAST,VALTODAY,LASTTOPREVPRICE' +
      '&sort_column=VALTODAY&sort_order=desc&limit=' + fetchLimit;

    return moexFetchJson(url).then(function (json) {
      if (!json.marketdata || !json.marketdata.data || !json.marketdata.data.length) {
        throw new Error('no top volume');
      }
      var cols = json.marketdata.columns;
      var names = {};
      (json.securities.data || []).forEach(function (r) { names[r[0]] = r[1]; });
      var iSec = cols.indexOf('SECID');
      var iLast = cols.indexOf('LAST');
      var iVal = cols.indexOf('VALTODAY');
      var iChg = cols.indexOf('LASTTOPREVPRICE');
      var list = [];
      json.marketdata.data.forEach(function (row) {
        var ticker = row[iSec];
        var val = row[iVal];
        var last = row[iLast];
        if (!ticker || val == null || !isFinite(val) || val <= 0 || last == null || !isFinite(last)) return;
        list.push({
          ticker: ticker,
          name: names[ticker] || getTickerSubtitle(ticker),
          valToday: val,
          price: last,
          changePct: row[iChg] != null && isFinite(Number(row[iChg])) ? Number(row[iChg]) : null,
          tradeDate: getMoexSessionTradeDateIso()
        });
      });
      list.sort(function (a, b) { return b.valToday - a.valToday; });
      var top = list.slice(0, limit);
      if (!top.length) throw new Error('no top volume');
      moexCacheSet(cacheKey, top, TOP_VOLUME_CACHE_MS);
      return top;
    });
  }



  function getMoexSessionTradeDateIso() {
    return moexFormatDateMsk(new Date());
  }

  function topVolumeCardsFingerprint(rows) {
    return (rows || []).map(function (r, i) {
      return (i + 1) + ':' + r.ticker + ':' + Math.round(Number(r.valToday) || 0);
    }).join('|');
  }

  function patchTopVolumeCardWrap(wrap, r, rank) {
    if (!wrap || !r) return;
    if (r.valToday != null && isFinite(Number(r.valToday))) {
      wrap.setAttribute('data-val-today', String(Number(r.valToday)));
    }
    var rankEl = wrap.querySelector('.quote-card-ticker');
    if (rankEl) rankEl.textContent = '#' + rank + ' ' + r.ticker;
    var subEl = wrap.querySelector('.quote-card-sub');
    if (subEl && r.name) subEl.textContent = r.name;
    var priceEl = wrap.querySelector('.quote-card-price');
    var changeEl = wrap.querySelector('.quote-card-change');
    if (priceEl) priceEl.textContent = formatChartPrice(r.price, r.ticker);
    if (changeEl) {
      var events = typeof getSplitEventsSync === 'function' ? getSplitEventsSync() : [];
      var ch = resolveTopVolumeChangeView(r, events);
      changeEl.textContent = ch.text;
      changeEl.className = 'quote-card-change ' + ch.cls;
      if (ch.title) changeEl.setAttribute('title', ch.title);
      else changeEl.removeAttribute('title');
    }
    var turnoverEl = wrap.querySelector('[data-turnover]');
    if (turnoverEl && r.valToday != null && isFinite(Number(r.valToday))) {
      turnoverEl.textContent = formatBlnRub(r.valToday) + ' млрд ₽';
      turnoverEl.className = 'quote-div-val';
    }
    if (typeof setQuoteCardTurnoverLabel === 'function') {
      setQuoteCardTurnoverLabel(wrap, {
        ticker: r.ticker,
        tradeDate: r.tradeDate || getMoexSessionTradeDateIso(),
        market: wrap.getAttribute('data-market') || 'RU'
      });
    }
  }

  function quoteCardNeedsEnrich(wrap) {
    if (!wrap) return true;
    var avgEl = wrap.querySelector('[data-div-avg]');
    if (!avgEl) return true;
    var txt = (avgEl.textContent || '').trim();
    return !txt || txt === '…';
  }

  function paintTopVolumeSourceLine() {
    var src = document.getElementById('imoexMarketSource');
    if (!src) return;
    var updatedHm = '';
    if (_topTurnoverDataLive && _topTurnoverFetchedAt) {
      updatedHm = new Date(_topTurnoverFetchedAt).toLocaleString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (_topTurnoverSnapshotMeta) {
      updatedHm = formatSnapshotUpdatedHm(_topTurnoverSnapshotMeta);
    } else {
      updatedHm = new Date().toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    var base = OPEN_MARKET_DATA_HINT + ' · обновлено ' + updatedHm;
    if (!_topTurnoverDataLive && isDataSnapshotStale(_topTurnoverSnapshotMeta)) {
      base += ' · Показываем последние доступные данные.';
    }
    src.textContent = base;
  }



  function refreshTopVolumeCardsLive() {
    if (document.visibilityState !== 'visible') return Promise.resolve();
    if (!state || state.tab !== 'briefing') return Promise.resolve();
    if (typeof shouldShowRuBriefingMarketBlocks === 'function' && !shouldShowRuBriefingMarketBlocks()) {
      return Promise.resolve();
    }
    var sessionDate = getMoexSessionTradeDateIso();
    return fetchTopMoexSharesByVolume(20, true).then(function (top) {
      if (!top || !top.length) return;
      top.forEach(function (r) {
        if (!r.tradeDate) r.tradeDate = sessionDate;
      });
      var grid = document.getElementById('imoexTopVolumeCards');
      var fp = topVolumeCardsFingerprint(top);
      if (grid && grid.getAttribute('data-topvol-fp') === fp) {
        paintTopVolumeSourceLine();
        return;
      }
      if (grid && grid.querySelectorAll('.quote-card-wrap').length === top.length) {
        var orderSame = top.every(function (r, i) {
          var wrap = grid.querySelector('.quote-card-wrap:nth-child(' + (i + 1) + ')');
          return wrap && wrap.getAttribute('data-ticker') === r.ticker;
        });
        if (orderSame) {
          top.forEach(function (r, i) {
            patchTopVolumeCardWrap(
              grid.querySelector('.quote-card-wrap[data-ticker="' + r.ticker + '"]'),
              r,
              i + 1
            );
          });
          grid.setAttribute('data-topvol-fp', fp);
          paintTopVolumeSourceLine();
          return;
        }
      }
      renderImoexTopVolumeTable(top, 'RU');
      if (grid) grid.setAttribute('data-topvol-fp', fp);
      paintTopVolumeSourceLine();
    }).catch(function () { /* оставляем последний успешный ряд */ });
  }



  function scheduleTopVolumeLiveRefresh() {
    if (topVolumeRefreshTimer) clearInterval(topVolumeRefreshTimer);
    topVolumeRefreshTimer = setInterval(function () {
      refreshTopVolumeCardsLive();
    }, TOP_VOLUME_LIVE_REFRESH_MS);
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
    el.setAttribute('aria-label', 'Оборот IMOEX за ' + days.length + ' торговых дней, млрд ₽');
    var withYear = typeof tradeDateSeriesNeedsYear === 'function' && tradeDateSeriesNeedsYear(days);
    el.innerHTML = days.map(function (d) {
      var dt = formatVolTradeDate(d.date, withYear);
      var bln = formatBlnRub(d.value);
      var pct = max > 0 ? Math.max(6, (d.value / max) * 100) : 0;
      var liveCls = d.live ? ' imoex-vol-col--live' : '';
      var liveTip = d.live ? ' · текущая сессия' : '';
      return (
        '<div class="imoex-vol-col' + liveCls + '" title="' + escapeHtml(dt + ' · ' + bln + ' млрд ₽' + liveTip) + '">' +
          '<span class="imoex-vol-val">' + escapeHtml(bln) + '</span>' +
          '<div class="imoex-vol-track" aria-hidden="true">' +
            '<div class="imoex-vol-bar" style="height:' + pct.toFixed(1) + '%"></div>' +
          '</div>' +
          '<span class="imoex-vol-date">' + escapeHtml(dt) + (d.live ? '*' : '') + '</span>' +
        '</div>'
      );
    }).join('');
  }



  function renderImoexTopVolumeTable(rows, market, opts) {
    opts = opts || {};
    market = market || 'RU';
    var isUs = market === 'US';
    var sessionDate = getMoexSessionTradeDateIso();
    if (opts.resetEnrich !== false && typeof window.resetEnrichQueue === 'function') {
      window.resetEnrichQueue();
    }
    var grid = document.getElementById('imoexTopVolumeCards');
    var tbody = document.getElementById('imoexTopVolumeBody');
    if (!rows || !rows.length) {
      if (grid) grid.innerHTML = '<p class="muted">Нет данных</p>';
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="muted">Нет данных</td></tr>';
      return;
    }
    var splitEvents = opts.splitEvents;
    if (!splitEvents) {
      splitEvents = typeof getSplitEventsSync === 'function' ? getSplitEventsSync() : [];
      if (typeof hasSplitEventsLoaded !== 'function' || !hasSplitEventsLoaded()) {
        ensureSplitEventsForTopVolume(function (loaded) {
          renderImoexTopVolumeTable(rows, market, {
            resetEnrich: false,
            splitEvents: loaded || []
          });
        });
      }
    }
    if (grid) {
      grid.innerHTML = rows.map(function (r, i) {
        var ch = resolveTopVolumeChangeView(r, splitEvents);
        var divHtml = typeof window.quoteCardDivMetricsHtml === 'function'
          ? window.quoteCardDivMetricsHtml({
            compact: isUs,
            us: isUs,
            ticker: r.ticker,
            tradeDate: r.tradeDate || sessionDate
          })
          : '';
        return (
          '<div class="quote-card-wrap imoex-top-card" data-ticker="' + escapeHtml(r.ticker) + '" data-market="' + market + '"' +
            (r.valToday != null && isFinite(Number(r.valToday)) ? ' data-val-today="' + Number(r.valToday) + '"' : '') + '>' +
            '<button type="button" class="quote-card" data-ticker="' + escapeHtml(r.ticker) + '">' +
              '<div class="quote-card-top">' +
                '<span class="quote-card-ticker">#' + (i + 1) + ' ' + escapeHtml(r.ticker) + '</span>' +
                '<span class="quote-card-sub">' + escapeHtml(r.name || '') + '</span>' +
              '</div>' +
              '<div class="quote-card-metrics">' +
                '<span class="quote-card-price">' + escapeHtml(formatChartPrice(r.price, r.ticker)) + '</span>' +
                '<span class="quote-card-change ' + ch.cls + '"' +
                  (ch.title ? ' title="' + escapeHtml(ch.title) + '"' : '') + '>' +
                  escapeHtml(ch.text) + '</span>' +
              '</div>' +
              divHtml +
            '</button>' +
          '</div>'
        );
      }).join('');
      rows.forEach(function (r) {
        var wrap = grid.querySelector('.quote-card-wrap[data-ticker="' + r.ticker + '"]');
        if (wrap && !isUs && r.valToday != null) {
          var turnoverEl = wrap.querySelector('[data-turnover]');
          if (turnoverEl) {
            turnoverEl.textContent = formatBlnRub(r.valToday) + ' млрд ₽';
            turnoverEl.className = 'quote-div-val';
          }
          if (typeof setQuoteCardTurnoverLabel === 'function') {
            setQuoteCardTurnoverLabel(wrap, {
              ticker: r.ticker,
              tradeDate: r.tradeDate || sessionDate,
              market: market
            });
          }
        }
        if (wrap && typeof queueEnrichQuoteCard === 'function' && quoteCardNeedsEnrich(wrap)) {
          queueEnrichQuoteCard(wrap, r.ticker, market);
        } else if (wrap && typeof enrichQuoteCard === 'function' && quoteCardNeedsEnrich(wrap)) {
          enrichQuoteCard(wrap, r.ticker);
        }
        if (wrap && isUs && r.divYieldPct != null) {
          var avgEl = wrap.querySelector('[data-div-avg]');
          var turnoverElUs = wrap.querySelector('[data-turnover]');
          if (avgEl) {
            avgEl.textContent = (r.divYieldPct).toFixed(1).replace('.', ',') + '%';
            avgEl.className = 'quote-div-val' + (r.divYieldPct > 0 ? ' pnl-pos' : '');
          }
          if (turnoverElUs) turnoverElUs.textContent = formatUsdVolume(r.valToday);
        }
      });
      grid.querySelectorAll('.quote-card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var t = btn.getAttribute('data-ticker');
          if (t && typeof openSecurityAnalyticsModal === 'function') openSecurityAnalyticsModal(t);
        });
      });
      grid.setAttribute('data-topvol-fp', topVolumeCardsFingerprint(rows));
    }
    if (!tbody) return;
    tbody.innerHTML = rows.map(function (r, i) {
      var ch = resolveTopVolumeChangeView(r, splitEvents);
      return (
        '<tr data-chart-ticker="' + escapeHtml(r.ticker) + '" class="imoex-top-row" tabindex="0" role="button">' +
          '<td>' + (i + 1) + '</td>' +
          '<td class="ticker">' + escapeHtml(r.ticker) + '</td>' +
          '<td>' + escapeHtml(r.name || '—') + '</td>' +
          '<td>' + escapeHtml(formatBlnRub(r.valToday)) + '</td>' +
          '<td>' + escapeHtml(formatChartPrice(r.price, r.ticker)) + '</td>' +
          '<td class="' + ch.cls + '"' +
            (ch.title ? ' title="' + escapeHtml(ch.title) + '"' : '') + '>' +
            escapeHtml(ch.text) + '</td>' +
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
        hintVol.textContent = 'Оборот бумаг индекса IMOEX за 10 торговых дней (млрд ₽/день, МосБиржа). * — оборот текущей сессии (VALTODAY).';
        hintVol.style.display = '';
      }
      if (subTitle) subTitle.textContent = 'Топ‑20 по обороту сегодня (в моменте)';
      if (hintDiv) {
        hintDiv.textContent = 'Ранг по обороту с начала сегодняшней сессии (VALTODAY). Средняя див. доходность за 5 лет и прогноз — по клику на карточку.';
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
    if (bars && !forceRefresh) {
      bars.style.display = '';
      bars.innerHTML = '<p class="muted">Загрузка…</p>';
    }
    if (src && !forceRefresh) src.textContent = 'Загрузка…';

    Promise.all([
      fetchImoexTurnoverWeek(!!forceRefresh),
      fetchTopMoexSharesByVolume(20, !!forceRefresh)
    ]).then(function (results) {
      function paintImoexData(rows) {
        renderImoexVolumeBars(rows[0]);
        renderImoexTopVolumeTable(rows[1], 'RU');
        paintTopVolumeSourceLine();
      }
      paintImoexData(results);
      if (forceRefresh && _topTurnoverDataLive) return;
      return fetchTopMoexSharesByVolume(20, true).then(function (top) {
        if (!top || !top.length) return;
        renderImoexTopVolumeTable(top, 'RU');
        paintTopVolumeSourceLine();
      }).catch(function () { /* snapshot или прошлый live */ });
    }).catch(function () {
      if (bars) bars.innerHTML = '<p class="muted hint-frame">Объём торгов временно недоступен</p>';
      renderImoexTopVolumeTable([], 'RU');
      if (src) src.textContent = OPEN_MARKET_DATA_HINT + ' Данные временно недоступны.';
    });
  }



  function renderUsMarketMacro(forceRefresh) {
    var row = document.getElementById('marketMacroRow');
    if (!row || typeof Markets === 'undefined') return;
    var macroSrcShow = document.getElementById('marketMacroSource');
    if (macroSrcShow) macroSrcShow.hidden = false;
    setMarketKeyRateHintVisible(false);
    updateMarketMacroSource('loading');
    row.hidden = false;
    row.innerHTML =
      renderMacroTile('spy', 'S&P 500', '…', macroMeta(null, 'Yahoo', 'ETF SPY', 'США')) +
      renderMacroTile('qqq', 'Nasdaq 100', '…', macroMeta(null, 'Yahoo', 'ETF QQQ', 'США')) +
      renderMacroTile('vix', 'VIX', '…', macroMeta(null, 'Yahoo', 'индекс', 'волатильность')) +
      renderMacroCommodityTilesHtml();

    applyMacroBootstrap(row);
    var usJobs = [
      patchMacroCommodityTiles(row, !!forceRefresh)
    ];
    [['spy', 'SPY'], ['qqq', 'QQQ'], ['vix', '^VIX']].forEach(function (pair) {
      usJobs.push(Markets.fetchUsQuote(pair[1]).then(function (q) {
        if (q && q.price != null) markMarketMacroLive();
        var val = q && q.price != null ? formatChartPrice(q.price, pair[1]) : '—';
        patchMacroTile(row, pair[0], val, macroMeta(q && q.changePct, 'Yahoo', pair[1] === '^VIX' ? 'индекс' : 'ETF ' + pair[1]));
      }).catch(function () {
        patchMacroTile(row, pair[0], '—', { changeText: 'нет данных', changeCls: 'muted', source: 'Yahoo' });
      }));
    });

    Promise.all(usJobs).finally(function () {
      updateMarketMacroSource();
    });

    renderImoexMarketPanel(forceRefresh);
  }

  function applyMarketSnapshotData(row, snapshot) {
    if (!snapshot || !snapshot.data) return false;
    _marketSnapshotMeta = snapshot;
    _marketMacroDataLive = false;
    var d = snapshot.data || {};
    if (d.keyRate && d.keyRate.rate != null) {
      try { moexCacheSet('cbr.keyrate', d.keyRate, MACRO_REFRESH_MS); } catch (e) { /* noop */ }
      patchMacroTile(row, 'rate', formatKeyRateLabel(d.keyRate.rate), buildKeyRateMeta(d.keyRate));
    }
    if (d.imoex && d.imoex.price != null) {
      patchMacroTile(row, 'imoex', formatChartPrice(d.imoex.price, 'IMOEX'),
        macroMeta(d.imoex.changePct, 'snapshot', 'IMOEX'));
    }
    ['USD', 'EUR', 'CNY'].forEach(function (code) {
      var item = d.fx && d.fx[code];
      if (!item || item.price == null) return;
      var id = code === 'USD' ? 'usd' : (code === 'EUR' ? 'eur' : 'cny');
      patchMacroTile(row, id, formatFxPrice(item.price), macroMeta(item.changePct, 'snapshot', 'валюта'));
    });
    if (isDataSnapshotStale(snapshot) && typeof showToast === 'function') {
      showToast('Показываем последние доступные данные. Обновление задерживается.');
    }
    updateMarketMacroSource();
    return true;
  }

  function applyMarketSnapshotFromFile(row, forceRefresh) {
    if (forceRefresh) return Promise.resolve(false);
    return fetchInvestbriefDataFile('market-snapshot.json', false).then(function (snapshot) {
      return applyMarketSnapshotData(row, snapshot);
    });
  }

  function applyMarketSnapshotFallback(row) {
    return fetchInvestbriefDataFile('market-snapshot.json', true).then(function (snapshot) {
      return applyMarketSnapshotData(row, snapshot);
    }).catch(function () { return false; });
  }

  function markMarketMacroLive() {
    _marketMacroDataLive = true;
    _marketSnapshotMeta = null;
    _marketMacroFetchedAt = Date.now();
  }

  function formatCbrFxDateRu(iso) {
    var s = String(iso || '').slice(0, 10);
    if (s.length < 10) return '';
    return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
  }

  function updateMarketMacroSource(mode) {
    var el = document.getElementById('marketMacroSource');
    if (!el) return;
    if (mode === 'loading') {
      el.textContent = shouldShowUsBriefingMarketBlocks()
        ? 'Загрузка данных Yahoo Finance…'
        : 'Загрузка…';
      return;
    }
    if (shouldShowUsBriefingMarketBlocks()) {
      var usHm = _marketMacroDataLive && _marketMacroFetchedAt
        ? new Date(_marketMacroFetchedAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      el.textContent = 'Данные могут отображаться с задержкой. Источники: Yahoo Finance и открытые данные, включая MOEX ISS. · обновлено ' + usHm;
      return;
    }
    var updatedHm = '';
    if (_marketMacroDataLive && _marketMacroFetchedAt) {
      updatedHm = new Date(_marketMacroFetchedAt).toLocaleString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (_marketSnapshotMeta) {
      updatedHm = formatSnapshotUpdatedHm(_marketSnapshotMeta);
    } else {
      updatedHm = new Date().toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    var base = OPEN_MARKET_DATA_HINT + ' · ЦБ РФ · обновлено ' + updatedHm;
    if (_marketMacroCbrFxDate) {
      base += ' · курс валют ЦБ на ' + formatCbrFxDateRu(_marketMacroCbrFxDate);
    }
    if (!_marketMacroDataLive && isDataSnapshotStale(_marketSnapshotMeta)) {
      base += ' · Показываем последние доступные данные.';
    }
    el.textContent = base;
  }



  function hasMacroTileRealValue(row, id) {
    if (!row) return false;
    var valEl = row.querySelector('[data-macro-id="' + id + '"] .macro-tile-val');
    var cur = valEl && String(valEl.textContent || '').trim();
    return !!(cur && cur !== '…' && cur !== '—' && cur !== '-');
  }

  /** Если live-парсинг ЦБ недоступен (CORS/прокси), оставляем snapshot/кэш. */
  function restoreKeyRateFromSnapshot(row) {
    return fetchInvestbriefDataFile('market-snapshot.json', true).then(function (snapshot) {
      var kr = snapshot && snapshot.data && snapshot.data.keyRate;
      if (!kr || kr.rate == null || !isFinite(Number(kr.rate))) return false;
      try { moexCacheSet('cbr.keyrate', kr, MACRO_REFRESH_MS); } catch (e) { /* noop */ }
      patchMacroTile(row, 'rate', formatKeyRateLabel(kr.rate), buildKeyRateMeta(kr));
      return true;
    }).catch(function () { return false; });
  }

  function renderMarketMacro(forceRefresh) {
    var row = document.getElementById('marketMacroRow');
    if (!row) return;
    updateMarketMacroSource('loading');
    if (shouldShowUsBriefingMarketBlocks()) {
      renderUsMarketMacro(forceRefresh);
      return;
    }
    if (!shouldShowRuBriefingMarketBlocks()) {
      row.hidden = true;
      var macroSrcHide = document.getElementById('marketMacroSource');
      if (macroSrcHide) macroSrcHide.hidden = true;
      setMarketKeyRateHintVisible(false);
      renderImoexMarketPanel(forceRefresh);
      return;
    }
    var macroSrcShow = document.getElementById('marketMacroSource');
    if (macroSrcShow) macroSrcShow.hidden = false;
    setMarketKeyRateHintVisible(true);
    if (forceRefresh) invalidateMacroLiveCaches(false);
    row.hidden = false;
    var keepDom = !!(forceRefresh && row.querySelector('[data-macro-id="imoex"]'));
    if (!keepDom) {
      row.innerHTML =
        renderMacroTile('imoex', 'Индекс', '…', macroMeta(null, 'МосБиржа', 'IMOEX')) +
        renderMacroTile('rate', 'Ставка', '…', macroMeta(null, 'ЦБ РФ', 'ключевая')) +
        renderMacroTile('usd', 'USD', '…', macroMeta(null, 'МосБиржа', 'валюта')) +
        renderMacroTile('eur', 'EUR', '…', macroMeta(null, 'МосБиржа', 'валюта')) +
        renderMacroTile('cny', 'CNY', '…', macroMeta(null, 'МосБиржа', 'валюта')) +
        renderMacroCommodityTilesHtml();
      applyMacroBootstrap(row);
    }
    if (!forceRefresh) applyMarketSnapshotFromFile(row, false);

    var macroLiveFailed = false;
    var macroJobs = [
      patchMacroCommodityTiles(row, !!forceRefresh),
      fetchCbrKeyRate().then(function (kr) {
        patchMacroTile(row, 'rate', formatKeyRateLabel(kr.rate), buildKeyRateMeta(kr));
      }).catch(function () {
        // Не затираем snapshot/кэш прочерками, если live CBR (CORS/прокси) недоступен.
        if (hasMacroTileRealValue(row, 'rate')) return;
        return restoreKeyRateFromSnapshot(row).then(function (ok) {
          if (ok) return;
          patchMacroTile(row, 'rate', '—', { changeText: '—', changeCls: 'muted', source: 'ЦБ РФ', tag: 'ключевая' });
        });
      }),

      fetchMoexQuote('IMOEX').then(function (q) {
        if (q && q.price != null) markMarketMacroLive();
        var val = q && q.price != null ? formatChartPrice(q.price, 'IMOEX') : '—';
        patchMacroTile(row, 'imoex', val, macroMeta(q && q.changePct, 'МосБиржа', 'IMOEX'));
      }).catch(function () {
        macroLiveFailed = true;
        patchMacroTile(row, 'imoex', '—', { changeText: 'нет данных', changeCls: 'muted', source: 'МосБиржа' });
      }),

      fetchCbrFxRatesFromJson().then(function (data) {
        var quick = parseCbrDailyJson(data);
        if (!quick) return;
        var dated = data && data.Date ? String(data.Date).slice(0, 10) : '';
        if (dated) _marketMacroCbrFxDate = dated;
        ['USD', 'EUR', 'CNY'].forEach(function (code) {
          var item = quick[code];
          var id = code === 'USD' ? 'usd' : (code === 'EUR' ? 'eur' : 'cny');
          if (!item || item.price == null) return;
          patchMacroTile(row, id, formatFxPrice(item.price),
            macroMeta(item.changePct, 'ЦБ РФ', 'валюта'));
        });
      }).catch(function () { /* moex spot ниже */ }),

      fetchMacroFxRates(!!forceRefresh).then(function (fx) {
        if (!fx) return;
        if (Object.keys(fx).length) markMarketMacroLive();
        ['USD', 'EUR', 'CNY'].forEach(function (code) {
          var item = fx[code];
          var id = code === 'USD' ? 'usd' : (code === 'EUR' ? 'eur' : 'cny');
          if (!item || item.price == null) {
            patchMacroTile(row, id, '—', { changeText: 'нет данных', changeCls: 'muted', source: 'МосБиржа' });
            return;
          }
          var src = String(item.source || 'МосБиржа').split(' · ')[0];
          patchMacroTile(row, id, formatFxPrice(item.price),
            macroMeta(item.changePct, src, 'валюта'));
        });
      }).catch(function () {
        macroLiveFailed = true;
        ['usd', 'eur', 'cny'].forEach(function (id) {
          patchMacroTile(row, id, '—', { changeText: 'нет данных', changeCls: 'muted', source: 'МосБиржа' });
        });
      }).then(function () {
        if (forceRefresh && macroLiveFailed && !_marketMacroDataLive) {
          return applyMarketSnapshotFallback(row);
        }
      })
    ];

    Promise.all(macroJobs).finally(function () {
      updateMarketMacroSource();
    });

    renderImoexMarketPanel(forceRefresh);
  }

  window.renderMarketMacro = renderMarketMacro;



  function patchMacroTile(row, id, value, meta, valNote) {
    var tile = row.querySelector('[data-macro-id="' + id + '"]');
    if (!tile) return;
    if (id === 'rate') {
      tile.title = KEY_RATE_HINT;
      tile.setAttribute('aria-description', KEY_RATE_HINT);
    }
    var valEl = tile.querySelector('.macro-tile-val');
    if (valEl) valEl.textContent = value;
    var noteEl = tile.querySelector('.macro-tile-val-note');
    if (valNote) {
      if (!noteEl) {
        noteEl = document.createElement('div');
        noteEl.className = 'macro-tile-val-note muted';
        if (valEl && valEl.parentNode) valEl.insertAdjacentElement('afterend', noteEl);
      }
      noteEl.textContent = valNote;
    } else if (noteEl) {
      noteEl.remove();
    }
    var metaEl = tile.querySelector('.macro-tile-meta');
    if (!metaEl) {
      metaEl = document.createElement('div');
      metaEl.className = 'macro-tile-meta';
      tile.appendChild(metaEl);
    }
    if (meta && typeof meta === 'object' && (meta.text != null || meta.cls)) {
      meta = { changeText: meta.text, changeCls: meta.cls || 'muted' };
    }
    metaEl.innerHTML = buildMacroMetaHtml(meta || {});
  }



  function macroChangeWithSource(pct, source) {
    return macroMeta(pct, source, '');
  }



  function refreshBriefingMarketData(force) {
    force = !!force;
    if (force) {
      invalidateImoexVolumeCaches();
      invalidateMacroLiveCaches(false);
    }
    if (typeof renderMarketMacro === 'function') renderMarketMacro(force);
    refreshMarketTilesQuotes();
  }

  function scheduleMarketMacroRefresh() {
    if (macroRefreshTimer) clearInterval(macroRefreshTimer);
    macroRefreshTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (state && state.tab === 'briefing') {
        refreshBriefingMarketData(true);
      }
      if (state && state.tab === 'watchlist' && typeof renderMoexIndexBox === 'function') {
        renderMoexIndexBox();
      }
    }, MACRO_REFRESH_MS);
    scheduleTopVolumeLiveRefresh();
    if (!macroVisibilityBound) {
      macroVisibilityBound = true;
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        if (state && state.tab === 'briefing') {
          refreshBriefingMarketData(true);
          refreshTopVolumeCardsLive();
        }
        if (state && state.tab === 'watchlist' && typeof renderMoexIndexBox === 'function') {
          renderMoexIndexBox();
        }
      });
    }
  }



  function refreshMacroDataSilent(force) {
    force = !!force;
    if (!state || state.tab !== 'briefing') return Promise.resolve();
    return Promise.all([
      fetchCbrKeyRate().catch(function () { return null; }),
      fetchMoexQuote('IMOEX').catch(function () { return null; }),
      fetchMacroFxRates(force).catch(function () { return null; }),
      fetchMacroCommodities(force).catch(function () { return null; }),
      fetchTopMoexSharesByVolume(20, force).catch(function () { return null; })
    ]).then(function () {
      refreshBriefingMarketData(force);
    });
  }

  window.scheduleMarketMacroRefresh = scheduleMarketMacroRefresh;
  window.refreshBriefingMarketData = refreshBriefingMarketData;
  window.fetchTopMoexSharesByVolume = fetchTopMoexSharesByVolume;
  window.resolveTopVolumeChangeView = resolveTopVolumeChangeView;
  window.refreshMacroDataSilent = refreshMacroDataSilent;
  window.getInvestbriefDataFile = fetchInvestbriefDataFile;
  window.isInvestbriefDataStale = isDataSnapshotStale;
  window.formatInvestbriefDataUpdatedHm = formatSnapshotUpdatedHm;


