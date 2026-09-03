/* split-events.js — read-only справочник корпоративных дроблений.
 * Не пишет в portfolio JSON / storage. Не корректирует qty и avgPrice.
 */
(function (root) {
  'use strict';

  var SPLIT_EVENTS_FILE = 'split-events.json';
  var SPLIT_CHANGE_TOLERANCE_PP = 5;
  var SPLIT_NEXT_SESSION_MAX_DAYS = 3;
  var SPLIT_BADGE_TEXT = 'сплит';

  var _splitEventsCache = null;
  var _splitEventsLoaded = false;
  var _splitEventsInflight = null;

  function splitNormTicker(raw) {
    if (typeof normalizeTicker === 'function') {
      try {
        var n = normalizeTicker(raw);
        if (n) return String(n).toUpperCase();
      } catch (e) { /* */ }
    }
    return String(raw == null ? '' : raw).trim().toUpperCase();
  }

  function splitIsoDate(raw) {
    if (raw == null) return '';
    if (typeof normalizePortfolioDate === 'function') {
      try {
        var n = normalizePortfolioDate(raw);
        if (n) return n;
      } catch (e) { /* */ }
    }
    var s = String(raw).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return m[1] + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function splitAddDays(iso, days) {
    var n = splitIsoDate(iso);
    var add = Number(days);
    if (!n || !isFinite(add)) return '';
    var y = Number(n.slice(0, 4));
    var m = Number(n.slice(5, 7)) - 1;
    var d = Number(n.slice(8, 10));
    var dt = new Date(y, m, d + add);
    if (isNaN(dt.getTime())) return '';
    return dt.getFullYear() + '-' +
      String(dt.getMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getDate()).padStart(2, '0');
  }

  function splitEventType(ev) {
    var t = ev && ev.type != null ? String(ev.type).trim().toLowerCase() : 'split';
    return t || 'split';
  }

  function splitEventCoversTicker(ev, ticker) {
    if (!ev) return false;
    var t = splitNormTicker(ticker);
    if (!t) return false;
    if (splitNormTicker(ev.ticker) === t) return true;
    var aliases = ev.aliases;
    if (!aliases || !aliases.length) return false;
    var i;
    for (i = 0; i < aliases.length; i++) {
      if (splitNormTicker(aliases[i]) === t) return true;
    }
    return false;
  }

  function parseSplitEventsCatalog(json) {
    var src = json;
    if (Array.isArray(json)) src = { events: json };
    if (!src || typeof src !== 'object') return [];
    var rows = src.events;
    if (!Array.isArray(rows)) return [];
    var out = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var raw = rows[i];
      if (!raw || typeof raw !== 'object') continue;
      var ticker = splitNormTicker(raw.ticker);
      var effectiveDate = splitIsoDate(raw.effectiveDate);
      var ratio = Number(raw.ratio);
      if (!ticker || !effectiveDate || !isFinite(ratio) || ratio <= 1) continue;
      var aliases = [];
      var seen = {};
      seen[ticker] = true;
      (Array.isArray(raw.aliases) ? raw.aliases : []).forEach(function (a) {
        var al = splitNormTicker(a);
        if (!al || seen[al]) return;
        seen[al] = true;
        aliases.push(al);
      });
      out.push({
        ticker: ticker,
        aliases: aliases,
        isin: raw.isin ? String(raw.isin).trim() : '',
        effectiveDate: effectiveDate,
        ratio: ratio,
        type: splitEventType(raw),
        note: raw.note ? String(raw.note) : '',
        source: raw.source ? String(raw.source) : ''
      });
    }
    return out;
  }

  function setSplitEventsCatalog(json) {
    _splitEventsCache = parseSplitEventsCatalog(json);
    _splitEventsLoaded = true;
    _splitEventsInflight = null;
    return _splitEventsCache;
  }

  function hasSplitEventsLoaded() {
    return !!_splitEventsLoaded;
  }

  function getSplitEventsSync() {
    return _splitEventsCache || [];
  }

  function splitEventsUrl() {
    var url = 'data/' + SPLIT_EVENTS_FILE;
    try {
      if (typeof window !== 'undefined' && window.IBRF_ASSET_VERSION) {
        url += (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(window.IBRF_ASSET_VERSION);
      }
    } catch (e) { /* */ }
    try {
      if (typeof window !== 'undefined' && window.location && window.location.href) {
        return new URL(url, window.location.href).toString();
      }
    } catch (e2) { /* */ }
    return './' + url;
  }

  function loadSplitEvents(options) {
    options = options || {};
    if (options.catalog) {
      return Promise.resolve(setSplitEventsCatalog(options.catalog));
    }
    if (_splitEventsLoaded && !options.force) {
      return Promise.resolve(getSplitEventsSync());
    }
    if (_splitEventsInflight && !options.force) return _splitEventsInflight;
    var fetchFn = options.fetch || (typeof fetch === 'function' ? fetch : null);
    if (typeof fetchFn !== 'function') {
      if (!_splitEventsLoaded) {
        _splitEventsCache = [];
        _splitEventsLoaded = true;
      }
      return Promise.resolve(getSplitEventsSync());
    }
    _splitEventsInflight = Promise.resolve()
      .then(function () {
        return fetchFn(splitEventsUrl(), { cache: 'no-store', credentials: 'omit' });
      })
      .then(function (res) {
        if (!res || !res.ok) throw new Error('split-events http');
        return res.json();
      })
      .then(function (json) {
        setSplitEventsCatalog(json);
        return getSplitEventsSync();
      })
      .catch(function () {
        if (!_splitEventsLoaded) {
          _splitEventsCache = [];
          _splitEventsLoaded = true;
        }
        _splitEventsInflight = null;
        return getSplitEventsSync();
      });
    return _splitEventsInflight;
  }

  function getSplitEventsForTicker(ticker, events) {
    var list = Array.isArray(events) ? events : getSplitEventsSync();
    var t = splitNormTicker(ticker);
    if (!t) return [];
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (splitEventCoversTicker(list[i], t)) out.push(list[i]);
    }
    return out;
  }

  function findSplitEventForDate(ticker, date, events, options) {
    options = options || {};
    var iso = splitIsoDate(date);
    if (!iso) return null;
    var list = getSplitEventsForTicker(ticker, events);
    if (!list.length) return null;
    var allowNext = options.allowNextSession !== false;
    var exact = null;
    var near = null;
    var i;
    for (i = 0; i < list.length; i++) {
      var ev = list[i];
      var eff = splitIsoDate(ev && ev.effectiveDate);
      if (!eff) continue;
      if (iso === eff) {
        exact = ev;
        break;
      }
      if (allowNext && iso > eff && iso <= splitAddDays(eff, SPLIT_NEXT_SESSION_MAX_DAYS)) {
        if (!near) near = ev;
      }
    }
    return exact || near;
  }

  function splitShiftYears(iso, years) {
    var n = splitIsoDate(iso);
    var add = Number(years);
    if (!n || !isFinite(add)) return '';
    var y = Number(n.slice(0, 4)) + add;
    var mo = Number(n.slice(5, 7));
    var day = Number(n.slice(8, 10));
    if (!isFinite(y) || mo < 1 || mo > 12) return '';
    var leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    var dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var max = dim[mo - 1] || 31;
    if (day > max) day = max;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function formatSplitDateRu(iso) {
    var n = splitIsoDate(iso);
    if (!n) return '';
    return n.slice(8, 10) + '.' + n.slice(5, 7) + '.' + n.slice(0, 4);
  }

  function findSplitEventInPeriod(ticker, fromDate, toDate, events) {
    var fromIso = splitIsoDate(fromDate);
    var toIso = splitIsoDate(toDate);
    if (!fromIso || !toIso) return null;
    if (fromIso > toIso) {
      var tmp = fromIso;
      fromIso = toIso;
      toIso = tmp;
    }
    var list = getSplitEventsForTicker(ticker, events);
    var i;
    for (i = 0; i < list.length; i++) {
      var ev = list[i];
      var eff = splitIsoDate(ev && ev.effectiveDate);
      if (!eff) continue;
      if (eff >= fromIso && eff <= toIso) return ev;
    }
    return null;
  }

  function formatSplitHiddenTotalReturn12m(ticker, toDate, events) {
    var toIso = splitIsoDate(toDate);
    if (!toIso) return null;
    var fromIso = splitShiftYears(toIso, -1);
    if (!fromIso) return null;
    var ev = findSplitEventInPeriod(ticker, fromIso, toIso, events);
    if (!ev) return null;
    var ratioText = formatSplitRatioText(ev);
    var dateRu = formatSplitDateRu(ev.effectiveDate);
    var title = '12-месячная доходность не показана: период пересекает дробление акций' +
      (ratioText ? ' ' + ratioText : '') +
      '. Сырая историческая цена не сопоставима с текущей ценой за 1 акцию, поэтому процент не показан.';
    if (ratioText || dateRu) {
      title += ' Дробление акций' +
        (ratioText ? ' ' + ratioText : '') +
        (dateRu ? ', ' + dateRu : '') + '.';
    }
    return {
      text: SPLIT_BADGE_TEXT,
      cls: 'quote-div-val muted quote-div-val--split',
      title: title,
      splitEvent: ev,
      fromDate: fromIso,
      toDate: toIso
    };
  }

  function expectedSplitDayChangePct(ev) {
    if (!ev) return null;
    var ratio = Number(ev.ratio);
    if (!isFinite(ratio) || ratio <= 0) return null;
    var type = splitEventType(ev);
    if (type === 'reverse') return (ratio - 1) * 100;
    return (1 / ratio - 1) * 100;
  }

  function formatSplitRatioText(ev) {
    if (!ev) return '';
    var ratio = Number(ev.ratio);
    if (!isFinite(ratio) || ratio <= 0) return '';
    var nice = Math.abs(ratio - Math.round(ratio)) < 1e-9 ? String(Math.round(ratio)) : String(ratio);
    return '1:' + nice;
  }

  function formatSplitChangeHint(ev) {
    var ratioText = formatSplitRatioText(ev);
    if (ratioText) return 'Техническое изменение цены после дробления акций ' + ratioText;
    return 'Техническое изменение цены после дробления акций';
  }

  function isSplitAffectedChange(ticker, tradeDate, changePct, events) {
    var ev = findSplitEventForDate(ticker, tradeDate, events, { allowNextSession: true });
    if (!ev) return null;
    if (changePct == null || !isFinite(Number(changePct))) return ev;
    var expected = expectedSplitDayChangePct(ev);
    if (expected == null || !isFinite(expected)) return ev;
    if (Math.abs(Number(changePct) - expected) <= SPLIT_CHANGE_TOLERANCE_PP) return ev;
    return null;
  }

  function formatSplitDayChangeDisplay(ticker, tradeDate, changePct, events) {
    var ev = isSplitAffectedChange(ticker, tradeDate, changePct, events);
    if (!ev) return null;
    return {
      text: SPLIT_BADGE_TEXT,
      cls: 'muted quote-card-change--split',
      title: formatSplitChangeHint(ev),
      splitEvent: ev
    };
  }

  var api = {
    SPLIT_CHANGE_TOLERANCE_PP: SPLIT_CHANGE_TOLERANCE_PP,
    SPLIT_NEXT_SESSION_MAX_DAYS: SPLIT_NEXT_SESSION_MAX_DAYS,
    parseSplitEventsCatalog: parseSplitEventsCatalog,
    setSplitEventsCatalog: setSplitEventsCatalog,
    hasSplitEventsLoaded: hasSplitEventsLoaded,
    getSplitEventsSync: getSplitEventsSync,
    loadSplitEvents: loadSplitEvents,
    getSplitEventsForTicker: getSplitEventsForTicker,
    findSplitEventForDate: findSplitEventForDate,
    expectedSplitDayChangePct: expectedSplitDayChangePct,
    formatSplitRatioText: formatSplitRatioText,
    formatSplitChangeHint: formatSplitChangeHint,
    isSplitAffectedChange: isSplitAffectedChange,
    formatSplitDayChangeDisplay: formatSplitDayChangeDisplay,
    findSplitEventInPeriod: findSplitEventInPeriod,
    formatSplitHiddenTotalReturn12m: formatSplitHiddenTotalReturn12m,
    formatSplitDateRu: formatSplitDateRu,
    splitEventCoversTicker: splitEventCoversTicker
  };

  root.SplitEvents = api;
  root.parseSplitEventsCatalog = parseSplitEventsCatalog;
  root.setSplitEventsCatalog = setSplitEventsCatalog;
  root.hasSplitEventsLoaded = hasSplitEventsLoaded;
  root.getSplitEventsSync = getSplitEventsSync;
  root.loadSplitEvents = loadSplitEvents;
  root.getSplitEventsForTicker = getSplitEventsForTicker;
  root.findSplitEventForDate = findSplitEventForDate;
  root.findSplitEventInPeriod = findSplitEventInPeriod;
  root.expectedSplitDayChangePct = expectedSplitDayChangePct;
  root.formatSplitRatioText = formatSplitRatioText;
  root.formatSplitChangeHint = formatSplitChangeHint;
  root.formatSplitDateRu = formatSplitDateRu;
  root.isSplitAffectedChange = isSplitAffectedChange;
  root.formatSplitDayChangeDisplay = formatSplitDayChangeDisplay;
  root.formatSplitHiddenTotalReturn12m = formatSplitHiddenTotalReturn12m;
  root.splitEventCoversTicker = splitEventCoversTicker;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
