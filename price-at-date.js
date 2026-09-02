/* price-at-date.js — read-only дневной CLOSE инструмента на дату (EOD / ISS history).
 * Не считает стоимость позиции/портфеля. Не пишет в portfolio JSON / storage.
 * Не использует LAST, свечи, live-хвост графика и цену покупки.
 */
(function (root) {
  'use strict';

  var ISS_BASE = 'https://iss.moex.com/iss';
  var SHARE_BOARDS = ['TQTF', 'TQBR'];
  var BOND_BOARD = 'TQOB';
  var HISTORY_FROM_FLOOR = '1992-01-01';
  var LOOKBACK_DAYS = 15 * 365;
  var PIF_KINDS = {
    pif: true,
    opif: true,
    ipif: true,
    zpif: true,
    'mutual-fund': true,
    mutual_fund: true,
    'mutualfund': true
  };
  var SHARE_KINDS = {
    stock: true,
    share: true,
    equity: true,
    etf: true,
    bpif: true,
    fund: true,
    shares: true
  };
  var BOND_KINDS = {
    bond: true,
    bonds: true,
    ofz: true,
    'ofz-bond': true
  };
  var MISSING_NOTE = 'Нет цены закрытия на выбранную дату или ранее';

  function issBase() {
    return (typeof MOEX_ISS !== 'undefined' && MOEX_ISS) ? MOEX_ISS : ISS_BASE;
  }

  function normTicker(raw) {
    if (typeof normalizeTicker === 'function') return normalizeTicker(raw);
    return String(raw == null ? '' : raw).trim().toUpperCase();
  }

  function isoDate(raw) {
    if (typeof normalizePortfolioDate === 'function') {
      var n = normalizePortfolioDate(raw);
      return n || '';
    }
    var s = String(raw == null ? '' : raw).trim();
    if (!s || /^invalid\b/i.test(s) || s === 'Invalid Date') return '';
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return m[1] + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function isoAddDays(iso, days) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + days);
    var y = d.getFullYear();
    var mo = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function emptyResult(ticker, requestedDate, status, note, extra) {
    extra = extra || {};
    return {
      ticker: ticker || '',
      requestedDate: requestedDate || '',
      priceDate: extra.priceDate != null ? extra.priceDate : null,
      price: extra.price != null ? extra.price : null,
      priceType: extra.priceType != null ? extra.priceType : null,
      unit: extra.unit != null ? extra.unit : null,
      currency: extra.currency != null ? extra.currency : null,
      source: extra.source != null ? extra.source : null,
      status: status,
      note: note || ''
    };
  }

  function isIndexTicker(ticker) {
    if (typeof isIndexQuoteTicker === 'function') return isIndexQuoteTicker(ticker);
    return ticker === 'IMOEX' || ticker === 'INDEX';
  }

  function isUs(ticker) {
    return typeof Markets !== 'undefined' && Markets.isUsTicker && Markets.isUsTicker(ticker);
  }

  function isOfzTicker(ticker) {
    if (typeof isRuBondTicker === 'function') return isRuBondTicker(ticker);
    if (typeof isMoexBondTicker === 'function') return isMoexBondTicker(ticker);
    return ticker.indexOf('OFZ') >= 0 || (ticker.indexOf('SU') === 0 && ticker.length > 8);
  }

  function bondSecid(ticker, meta) {
    meta = meta || {};
    if (meta.secid) return String(meta.secid).trim();
    if (typeof BOND_SECID_MAP !== 'undefined' && BOND_SECID_MAP[ticker]) {
      return String(BOND_SECID_MAP[ticker]);
    }
    return ticker;
  }

  function metaKind(meta) {
    meta = meta || {};
    return String(meta.type || meta.kind || '').trim().toLowerCase();
  }

  function classifyInstrument(ticker, meta) {
    meta = meta || {};
    var kind = metaKind(meta);
    if (PIF_KINDS[kind]) {
      return { className: 'pif' };
    }
    if (kind === 'index' || isIndexTicker(ticker)) {
      return { className: 'index' };
    }
    if (kind === 'us' || isUs(ticker)) {
      return { className: 'us' };
    }
    var board = String(meta.board || meta.boardid || '').trim().toUpperCase();
    if (BOND_KINDS[kind] || isOfzTicker(ticker)) {
      if (board && board !== BOND_BOARD) {
        return { className: 'bond-other-board', board: board };
      }
      if (!board && kind === 'bond' && !isOfzTicker(ticker)) {
        return { className: 'bond-no-board' };
      }
      return {
        className: 'bond',
        board: BOND_BOARD,
        secid: bondSecid(ticker, meta)
      };
    }
    if (SHARE_KINDS[kind] || !kind) {
      return { className: 'share' };
    }
    return { className: 'unsupported', kind: kind };
  }

  function pickCloseOnOrBefore(rows, targetIso) {
    if (typeof AnalyticsCore !== 'undefined' && AnalyticsCore.nearestCloseOnOrBefore) {
      return AnalyticsCore.nearestCloseOnOrBefore(rows, targetIso);
    }
    var target = String(targetIso || '').slice(0, 10);
    if (target.length < 10) return null;
    var picked = null;
    (rows || []).forEach(function (h) {
      var d = String(h && h.date || '').slice(0, 10);
      if (d.length < 10 || d > target || !isFinite(h.close) || h.close <= 0) return;
      if (!picked || d > picked.date) picked = { date: d, close: Number(h.close) };
    });
    return picked;
  }

  function mergeHistoryByDate(base, extra) {
    var byDate = {};
    (base || []).forEach(function (r) { if (r && r.date) byDate[r.date] = r; });
    (extra || []).forEach(function (r) { if (r && r.date) byDate[r.date] = r; });
    return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
  }

  function parseHistoryBlock(json) {
    var hist = json && json.history;
    if (!hist || !hist.columns || !hist.data || !hist.data.length) return { rows: [], cursor: null };
    var iDate = hist.columns.indexOf('TRADEDATE');
    var iClose = hist.columns.indexOf('CLOSE');
    var iVal = hist.columns.indexOf('VALUE');
    var rows = [];
    hist.data.forEach(function (row) {
      var d = String(row[iDate] || '').slice(0, 10);
      var close = Number(row[iClose]);
      var val = iVal >= 0 ? Number(row[iVal]) : NaN;
      if (!d) return;
      rows.push({
        date: d,
        close: isFinite(close) ? close : null,
        value: isFinite(val) ? val : null
      });
    });
    var cur = json['history.cursor'] && json['history.cursor'].data && json['history.cursor'].data[0];
    return { rows: rows, cursor: cur };
  }

  function getFetchJson(options) {
    if (options && typeof options.fetchJson === 'function') return options.fetchJson;
    if (typeof moexFetchJson === 'function') return moexFetchJson;
    return null;
  }

  function fetchIssHistoryRange(market, board, secid, fromStr, tillStr, options) {
    if (options && typeof options.fetchHistory === 'function') {
      return Promise.resolve(options.fetchHistory({
        market: market,
        board: board,
        ticker: secid,
        from: fromStr,
        till: tillStr
      })).then(function (rows) { return rows || []; });
    }
    var fetchJson = getFetchJson(options);
    if (!fetchJson) return Promise.resolve([]);
    var baseUrl = issBase() + '/history/engines/stock/markets/' + market + '/boards/' + board +
      '/securities/' + encodeURIComponent(secid) +
      '.json?from=' + fromStr + '&till=' + tillStr +
      '&iss.meta=off&history.columns=TRADEDATE,CLOSE,VALUE';
    var all = [];
    var start = 0;

    function fetchPage() {
      return Promise.resolve(fetchJson(baseUrl + '&start=' + start)).then(function (json) {
        var parsed = parseHistoryBlock(json);
        all = all.concat(parsed.rows);
        var cur = parsed.cursor;
        var total = cur ? Number(cur[1]) : all.length;
        var pageSize = cur ? Number(cur[2]) : (parsed.rows.length || 0);
        if (pageSize > 0 && start + parsed.rows.length < total) {
          start += pageSize;
          return fetchPage();
        }
        return mergeHistoryByDate([], all);
      });
    }

    return fetchPage().catch(function () { return []; });
  }

  function historyWindow(targetIso) {
    var from = isoAddDays(targetIso, -LOOKBACK_DAYS);
    if (from < HISTORY_FROM_FLOOR) from = HISTORY_FROM_FLOOR;
    if (from > targetIso) from = HISTORY_FROM_FLOOR;
    return { from: from, till: targetIso };
  }

  function okResult(ticker, requestedDate, picked, unit, source) {
    var note = '';
    if (picked.date !== requestedDate) {
      note = 'Ближайший торговый день не позже выбранной даты';
    }
    return {
      ticker: ticker,
      requestedDate: requestedDate,
      priceDate: picked.date,
      price: picked.close,
      priceType: 'close',
      unit: unit,
      currency: 'RUB',
      source: source,
      status: 'ok',
      note: note
    };
  }

  function loadHistoryRows(ticker, requestedDate, cls, options) {
    if (options && Array.isArray(options.history)) {
      return Promise.resolve(options.history);
    }
    var win = historyWindow(requestedDate);
    if (cls.className === 'bond') {
      return fetchIssHistoryRange('bonds', BOND_BOARD, cls.secid || ticker, win.from, win.till, options);
    }
    var chain = Promise.resolve([]);
    SHARE_BOARDS.forEach(function (board) {
      chain = chain.then(function (merged) {
        return fetchIssHistoryRange('shares', board, ticker, win.from, win.till, options).then(function (rows) {
          return mergeHistoryByDate(merged, rows);
        });
      });
    });
    return chain;
  }

  function getInstrumentPriceAtDate(ticker, targetDate, instrumentMeta, options) {
    options = options || {};
    instrumentMeta = instrumentMeta || {};
    var requestedDate = isoDate(targetDate);
    if (!requestedDate) {
      return Promise.resolve(emptyResult(
        normTicker(ticker),
        '',
        'invalid-date',
        'Укажите корректную дату'
      ));
    }
    var t = normTicker(ticker);
    if (!t) {
      return Promise.resolve(emptyResult('', requestedDate, 'missing', MISSING_NOTE));
    }

    var cls = classifyInstrument(t, instrumentMeta);
    if (cls.className === 'pif') {
      return Promise.resolve(emptyResult(
        t, requestedDate, 'unsupported',
        'Обычный ПИФ: историческая цена пая на дату пока не поддерживается'
      ));
    }
    if (cls.className === 'index') {
      return Promise.resolve(emptyResult(
        t, requestedDate, 'unsupported',
        'Индекс: цена на дату пока не поддерживается'
      ));
    }
    if (cls.className === 'us') {
      return Promise.resolve(emptyResult(
        t, requestedDate, 'unsupported',
        'Зарубежные бумаги: цена на дату пока не поддерживается'
      ));
    }
    if (cls.className === 'bond-other-board') {
      return Promise.resolve(emptyResult(
        t, requestedDate, 'unsupported',
        'Облигации вне TQOB пока не поддерживаются'
      ));
    }
    if (cls.className === 'bond-no-board') {
      return Promise.resolve(emptyResult(
        t, requestedDate, 'unsupported',
        'Для облигации не определён board TQOB'
      ));
    }
    if (cls.className === 'unsupported') {
      return Promise.resolve(emptyResult(
        t, requestedDate, 'unsupported',
        'Инструмент пока не поддерживается'
      ));
    }

    var unit = cls.className === 'bond' ? 'pct-of-face-value' : 'rub';
    var source = cls.className === 'bond' ? 'moex-iss-history-bonds' : 'moex-iss-history-shares';

    return loadHistoryRows(t, requestedDate, cls, options).then(function (rows) {
      var picked = pickCloseOnOrBefore(rows, requestedDate);
      if (!picked) {
        return emptyResult(t, requestedDate, 'missing', MISSING_NOTE, {
          unit: unit,
          currency: 'RUB',
          source: source
        });
      }
      return okResult(t, requestedDate, picked, unit, source);
    }).catch(function () {
      return emptyResult(t, requestedDate, 'missing', MISSING_NOTE, {
        unit: unit,
        currency: 'RUB',
        source: source
      });
    });
  }

  root.pickCloseOnOrBefore = pickCloseOnOrBefore;
  root.getInstrumentPriceAtDate = getInstrumentPriceAtDate;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
