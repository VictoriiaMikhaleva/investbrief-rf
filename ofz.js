/* ofz.js — блок ОФЗ: доходность, купоны, сравнение выпусков */
(function () {
  'use strict';

  var OFZ_BONDS_FALLBACK = [
    { ticker: 'OFZ_26238', kind: 'fixed', kindLabel: 'Фиксированный купон' },
    { ticker: 'OFZ_26241', kind: 'fixed', kindLabel: 'Фиксированный купон' },
    { ticker: 'OFZ_26243', kind: 'fixed', kindLabel: 'Фиксированный купон' },
    { ticker: 'OFZ_26248', kind: 'fixed', kindLabel: 'Фиксированный купон' },
    { ticker: 'OFZ_26249', kind: 'fixed', kindLabel: 'Фиксированный купон' },
    { ticker: 'OFZ_29024', kind: 'indexed', kindLabel: 'ОФЗ-ИН · инфляция' },
    { ticker: 'OFZ_52001', kind: 'float', kindLabel: 'ОФЗ-ПД · плавающий' }
  ];

  var OFZ_USAGE = [
    { title: 'Федеральный бюджет', text: 'Часть средств идёт на текущие расходы бюджета: социальные программы, медицину, образование, оборону и инфраструктуру.' },
    { title: 'Государственный долг', text: 'Другая часть — на погашение и обслуживание ранее выпущенных облигаций (рефинансирование долга).' },
    { title: 'Прозрачность', text: 'Направления расходов бюджета публикует Минфин России. ОФЗ не привязаны к одному проекту — это займ государства в целом.' }
  ];

  var _selectedTicker = 'OFZ_26238';
  var _rows = [];
  var _loading = false;
  var _bound = false;
  var _loadError = '';
  var _visibilityBound = false;
  var OFZ_CATALOG_CACHE_KEY = 'ofz.catalog.tqob.v2';
  var _tableView = { sortBy: 'vol', sortDir: 'desc', kind: 'all', search: '' };
  var _filterSearchTimer = null;
  var _ofzSnapshotMeta = null;
  var _ofzLastFetchedAt = 0;
  var _ofzDataLive = false;
  var OFZ_REFRESH_MS = 5 * 60 * 1000;
  var _ofzRefreshTimer = null;

  function formatOfzPrice(price) {
    if (price == null || !isFinite(price)) return '—';
    return Number(price).toFixed(2).replace('.', ',') + '%';
  }

  function formatOfzYield(y) {
    if (y == null || !isFinite(y)) return '—';
    return Number(y).toFixed(2).replace('.', ',') + '%';
  }

  function formatOfzCouponPct(v) {
    if (v == null || !isFinite(v)) return '—';
    return Number(v).toFixed(2).replace('.', ',') + '%';
  }

  function formatOfzDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatOfzDateShort(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatOfzNum(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    return Number(v).toFixed(digits == null ? 2 : digits).replace('.', ',');
  }

  function formatOfzVolMln(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v / 1e6).toFixed(1).replace('.', ',');
  }

  function yearsToMaturity(matDate) {
    if (!matDate) return null;
    var end = new Date(matDate).getTime();
    if (!isFinite(end)) return null;
    return (end - Date.now()) / (365.25 * 86400000);
  }

  function couponYieldOnPrice(couponValue, pricePct, faceValue, payCount) {
    if (couponValue == null || pricePct == null || !faceValue || !payCount) return null;
    var priceRub = Number(pricePct) / 100 * Number(faceValue);
    if (!isFinite(priceRub) || priceRub <= 0) return null;
    return Number(couponValue) / priceRub * payCount * 100;
  }

  function ofzSortValue(row, key) {
    if (!row) return null;
    switch (key) {
      case 'label': return String(row.label || row.ticker || '').toLowerCase();
      case 'matDate': return row.matDate ? new Date(row.matDate).getTime() : null;
      case 'yearsToMat': return row.yearsToMat;
      case 'yieldPct': return row.yieldPct;
      case 'couponPct': return row.couponPct;
      case 'couponYieldLast': return row.couponYieldLast;
      case 'price': return row.price;
      case 'vol': return row.vol;
      case 'couponValue': return row.couponValue;
      case 'payCount': return row.payCount;
      case 'accruedInt': return row.accruedInt;
      case 'durationYears': return row.durationYears;
      case 'nextCoupon': return row.nextCoupon ? new Date(row.nextCoupon).getTime() : null;
      default: return null;
    }
  }

  function getFilteredSortedRows() {
    if (!_rows.length) return [];
    var list = _rows.slice();
    if (_tableView.kind && _tableView.kind !== 'all') {
      list = list.filter(function (r) { return r.kind === _tableView.kind; });
    }
    var q = String(_tableView.search || '').trim().toLowerCase();
    if (q) {
      list = list.filter(function (r) {
        var hay = (String(r.label || '') + ' ' + String(r.ticker || '') + ' ' + String(r.secid || '')).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    var key = _tableView.sortBy || 'vol';
    var dir = _tableView.sortDir === 'asc' ? 1 : -1;
    list.sort(function (a, b) {
      var va = ofzSortValue(a, key);
      var vb = ofzSortValue(b, key);
      var aEmpty = va == null || (typeof va === 'number' && !isFinite(va));
      var bEmpty = vb == null || (typeof vb === 'number' && !isFinite(vb));
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof va === 'string') return dir * va.localeCompare(vb, 'ru');
      return dir * (va - vb);
    });
    return list;
  }

  function syncTableViewFromUI() {
    var kindEl = document.getElementById('ofzFilterKind');
    var searchEl = document.getElementById('ofzFilterSearch');
    if (kindEl) _tableView.kind = kindEl.value || 'all';
    if (searchEl) _tableView.search = searchEl.value || '';
  }

  function updateOfzSortHeaders() {
    var table = document.getElementById('ofzCompareTable');
    if (!table) return;
    table.querySelectorAll('[data-ofz-sort]').forEach(function (th) {
      var key = th.getAttribute('data-ofz-sort');
      var base = th.getAttribute('data-ofz-label');
      if (!base) {
        base = th.textContent.replace(/\s*[↑↓]\s*$/, '').trim();
        th.setAttribute('data-ofz-label', base);
      }
      th.classList.toggle('ofz-sort-active', key === _tableView.sortBy);
      var arrow = key === _tableView.sortBy ? (_tableView.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
      th.textContent = base + arrow;
    });
  }

  function updateOfzTableFilterNote(shown, total) {
    var el = document.getElementById('ofzTableFilterNote');
    if (!el) return;
    if (_loading || !total) {
      el.textContent = '';
      return;
    }
    var parts = [];
    if (shown !== total) parts.push('Показано ' + shown + ' из ' + total);
    else parts.push(total + ' выпуск' + ofzPluralRu(total));
    el.textContent = parts.join(' · ');
  }

  function applyOfzTableView() {
    syncTableViewFromUI();
    var shown = getFilteredSortedRows();
    renderOfzTable();
    renderOfzYieldCurve(shown);
    updateOfzTableFilterNote(shown.length, _rows.length);
  }

  function setOfzTableSort(key) {
    if (!key) return;
    if (_tableView.sortBy === key) {
      _tableView.sortDir = _tableView.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      _tableView.sortBy = key;
      _tableView.sortDir = (key === 'label' || key === 'matDate' || key === 'nextCoupon') ? 'asc' : 'desc';
    }
    applyOfzTableView();
  }

  function resetOfzTableView() {
    _tableView = { sortBy: 'vol', sortDir: 'desc', kind: 'all', search: '' };
    var kindEl = document.getElementById('ofzFilterKind');
    var searchEl = document.getElementById('ofzFilterSearch');
    if (kindEl) kindEl.value = 'all';
    if (searchEl) searchEl.value = '';
    applyOfzTableView();
  }

  function bindOfzTableFilters() {
    if (document.getElementById('ofzSection') && document.getElementById('ofzSection')._ofzFiltersBound) return;
    var section = document.getElementById('ofzSection');
    if (section) section._ofzFiltersBound = true;

    var kindEl = document.getElementById('ofzFilterKind');
    if (kindEl) kindEl.addEventListener('change', applyOfzTableView);

    var searchEl = document.getElementById('ofzFilterSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        clearTimeout(_filterSearchTimer);
        _filterSearchTimer = setTimeout(applyOfzTableView, 180);
      });
    }

    var resetBtn = document.getElementById('ofzFilterResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetOfzTableView);

    var thead = document.querySelector('#ofzCompareTable thead');
    if (thead && !thead._ofzSortBound) {
      thead._ofzSortBound = true;
      thead.addEventListener('click', function (e) {
        var th = e.target.closest('[data-ofz-sort]');
        if (!th) return;
        setOfzTableSort(th.getAttribute('data-ofz-sort'));
      });
    }
  }

  var OFZ_TABLE_COLS = 16;

  function couponsPerYear(periodDays) {
    var p = Number(periodDays);
    if (!isFinite(p) || p <= 0) return null;
    var n = Math.round(365 / p);
    return n >= 1 && n <= 12 ? n : null;
  }

  function detectKindFromName(name, fallback) {
    var s = String(name || '').toUpperCase();
    if (s.indexOf('ОФЗ-ИН') >= 0 || s.indexOf('OFZ-IN') >= 0) return { kind: 'indexed', kindLabel: 'ОФЗ-ИН · инфляция' };
    if (s.indexOf('ОФЗ-ПД') >= 0 || s.indexOf('OFZ-PD') >= 0 || s.indexOf('ПД') >= 0) return { kind: 'float', kindLabel: 'ОФЗ-ПД · плавающий' };
    return fallback || { kind: 'fixed', kindLabel: 'Фиксированный купон' };
  }

  function ofzTickerFromBoard(secid, shortname) {
    var name = String(shortname || '');
    var m = name.match(/(\d{5})/);
    if (m) return 'OFZ_' + m[1];
    m = String(secid || '').match(/(\d{5})/);
    if (m) return 'OFZ_' + m[1];
    return String(secid || name || 'OFZ');
  }

  function registerOfzTicker(ticker, secid, shortname) {
    if (typeof BOND_SECID_MAP !== 'undefined' && ticker && secid) BOND_SECID_MAP[ticker] = secid;
    if (shortname && typeof saveTickerName === 'function') saveTickerName(ticker, shortname);
  }

  function fetchOfzBondCatalogFromSnapshot() {
    if (typeof getInvestbriefDataFile !== 'function') return Promise.resolve(null);
    return getInvestbriefDataFile('ofz.json').then(function (snapshot) {
      if (snapshot && snapshot.data && Array.isArray(snapshot.data.catalog) && snapshot.data.catalog.length) {
        return { catalog: snapshot.data.catalog, snapshot: snapshot };
      }
      return null;
    });
  }

  function fetchOfzBondCatalog(forceLive) {
    if (forceLive) {
      return fetchOfzBondCatalogDirect().then(function (catalog) {
        _ofzSnapshotMeta = null;
        _ofzDataLive = true;
        _ofzLastFetchedAt = Date.now();
        return catalog;
      }).catch(function () {
        return fetchOfzBondCatalogFromSnapshot().then(function (pack) {
          if (!pack) return fetchOfzBondCatalogDirect();
          _ofzSnapshotMeta = pack.snapshot;
          _ofzDataLive = false;
          return pack.catalog;
        });
      });
    }
    if (typeof getInvestbriefDataFile === 'function') {
      return fetchOfzBondCatalogFromSnapshot().then(function (pack) {
        if (pack) {
          _ofzSnapshotMeta = pack.snapshot;
          _ofzDataLive = false;
          return pack.catalog;
        }
        return fetchOfzBondCatalogDirect().then(function (catalog) {
          _ofzSnapshotMeta = null;
          _ofzDataLive = true;
          _ofzLastFetchedAt = Date.now();
          return catalog;
        });
      });
    }
    return fetchOfzBondCatalogDirect();
  }

  function fetchOfzBondCatalogDirect() {
    if (typeof moexCacheGet === 'function') {
      var cached = moexCacheGet(OFZ_CATALOG_CACHE_KEY);
      if (cached && cached.length) return Promise.resolve(cached);
    }
    var url = MOEX_ISS + '/engines/stock/markets/bonds/boards/TQOB/securities.json' +
      '?iss.meta=off&iss.only=securities,marketdata' +
      '&securities.columns=SECID,SHORTNAME,COUPONPERCENT,MATDATE,COUPONPERIOD,FACEVALUE,COUPONVALUE,NEXTCOUPON,ACCRUEDINT' +
      '&marketdata.columns=SECID,LAST,YIELDATWAPRICE,VALTODAY,DURATION,UPDATETIME' +
      '&limit=500';
    return moexFetchJson(url).then(function (json) {
      var secBlock = json.securities;
      var mdBlock = json.marketdata;
      if (!secBlock || !secBlock.columns || !secBlock.data || !secBlock.data.length) {
        return ofzFallbackCatalog();
      }
      var sCols = secBlock.columns;
      var si = sCols.indexOf('SECID');
      var sn = sCols.indexOf('SHORTNAME');
      var cp = sCols.indexOf('COUPONPERCENT');
      var mat = sCols.indexOf('MATDATE');
      var period = sCols.indexOf('COUPONPERIOD');
      var fv = sCols.indexOf('FACEVALUE');
      var cv = sCols.indexOf('COUPONVALUE');
      var nc = sCols.indexOf('NEXTCOUPON');
      var ai = sCols.indexOf('ACCRUEDINT');
      var mdMap = {};
      if (mdBlock && mdBlock.columns && mdBlock.data) {
        var mi = mdBlock.columns.indexOf('SECID');
        var li = mdBlock.columns.indexOf('LAST');
        var yi = mdBlock.columns.indexOf('YIELDATWAPRICE');
        var vi = mdBlock.columns.indexOf('VALTODAY');
        var di = mdBlock.columns.indexOf('DURATION');
        var ui = mdBlock.columns.indexOf('UPDATETIME');
        mdBlock.data.forEach(function (row) {
          mdMap[row[mi]] = {
            last: li >= 0 ? row[li] : null,
            yield: yi >= 0 ? row[yi] : null,
            vol: vi >= 0 ? row[vi] : null,
            duration: di >= 0 ? row[di] : null,
            updateTime: ui >= 0 ? row[ui] : null
          };
        });
      }
      var list = secBlock.data.filter(function (row) {
        var name = sn >= 0 ? String(row[sn] || '') : '';
        return /ОФЗ|OFZ/i.test(name);
      }).map(function (row) {
        var secid = si >= 0 ? row[si] : null;
        var shortname = sn >= 0 ? String(row[sn] || secid) : String(secid);
        var ticker = ofzTickerFromBoard(secid, shortname);
        registerOfzTicker(ticker, secid, shortname);
        var md = mdMap[secid] || {};
        return {
          ticker: ticker,
          secid: secid,
          shortname: shortname,
          couponPct: cp >= 0 && row[cp] != null ? Number(row[cp]) : null,
          matDate: mat >= 0 ? row[mat] : null,
          couponPeriod: period >= 0 && row[period] != null ? Number(row[period]) : null,
          faceValue: fv >= 0 && row[fv] != null ? Number(row[fv]) : 1000,
          couponValue: cv >= 0 && row[cv] != null ? Number(row[cv]) : null,
          nextCoupon: nc >= 0 ? row[nc] : null,
          accruedInt: ai >= 0 && row[ai] != null ? Number(row[ai]) : null,
          last: md.last != null ? Number(md.last) : null,
          yieldPct: md.yield != null ? Number(md.yield) : null,
          vol: md.vol != null ? Number(md.vol) : 0,
          durationDays: md.duration != null ? Number(md.duration) : null,
          updateTime: md.updateTime || null
        };
      }).sort(function (a, b) {
        return (b.vol || 0) - (a.vol || 0);
      });
      if (!list.length) return ofzFallbackCatalog();
      if (typeof moexCacheSet === 'function') {
        moexCacheSet(OFZ_CATALOG_CACHE_KEY, list, 5 * 60 * 1000);
      }
      return list;
    }).catch(function (err) {
      _loadError = 'МосБиржа недоступна — показан краткий список.';
      if (typeof moexCacheGet === 'function') {
        var stale = moexCacheGet(OFZ_CATALOG_CACHE_KEY);
        if (stale && stale.length) return stale;
      }
      return ofzFallbackCatalog();
    });
  }

  function rowFromCatalogEntry(entry) {
    var fallback = entry.kind ? { kind: entry.kind, kindLabel: entry.kindLabel } : null;
    var kindInfo = detectKindFromName(entry.shortname, fallback);
    var payCount = couponsPerYear(entry.couponPeriod);
    var durationYears = entry.durationDays != null && entry.durationDays > 0
      ? entry.durationDays / 365.25
      : null;
    return {
      ticker: entry.ticker,
      secid: entry.secid || null,
      label: entry.shortname || entry.ticker,
      kind: kindInfo.kind,
      kindLabel: kindInfo.kindLabel,
      price: entry.last,
      yieldPct: entry.yieldPct,
      couponPct: entry.couponPct,
      payCount: payCount,
      matDate: entry.matDate,
      faceValue: entry.faceValue || 1000,
      couponValue: entry.couponValue,
      couponYieldLast: couponYieldOnPrice(entry.couponValue, entry.last, entry.faceValue || 1000, payCount),
      yearsToMat: yearsToMaturity(entry.matDate),
      durationYears: durationYears,
      vol: entry.vol,
      accruedInt: entry.accruedInt,
      nextCoupon: entry.nextCoupon,
      updateTime: entry.updateTime,
      coupons: null
    };
  }

  function ofzPluralRu(n) {
    n = Math.abs(Number(n) || 0);
    if (n % 10 === 1 && n % 100 !== 11) return '';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'а';
    return 'ов';
  }

  function ofzFallbackCatalog() {
    return OFZ_BONDS_FALLBACK.map(function (b) {
      return {
        ticker: b.ticker,
        shortname: (typeof getTickerSubtitle === 'function' ? getTickerSubtitle(b.ticker) : null) || b.ticker,
        kind: b.kind,
        kindLabel: b.kindLabel
      };
    });
  }

  function updateOfzSectionLead(count, note) {
    var el = document.querySelector('.ofz-section-lead');
    if (!el) return;
    var statusEl = document.getElementById('ofzLoadStatus');
    if (_loading) {
      el.textContent = 'Загрузка выпусков ОФЗ с доски TQOB (МосБиржа ISS)…';
      if (statusEl) statusEl.textContent = '';
      return;
    }
    if (!count) {
      el.textContent = _loadError || 'Не удалось загрузить список ОФЗ. Нажмите ↻ для повторной попытки.';
      if (statusEl) statusEl.textContent = _loadError ? 'Ошибка загрузки' : '';
      return;
    }
    el.innerHTML = 'Это независимый проект для личного анализа ОФЗ.<br>ОФЗ — облигации федерального займа.<br>' +
      count + ' выпуск' + ofzPluralRu(count) +
      ' на TQOB · котировки и параметры — МосБиржа ISS.<br>Не является индивидуальной инвестиционной рекомендацией.';
    if (statusEl) {
      var updatedHm = '';
      if (_ofzDataLive && _ofzLastFetchedAt) {
        updatedHm = new Date(_ofzLastFetchedAt).toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        updatedHm = (typeof formatInvestbriefDataUpdatedHm === 'function')
          ? formatInvestbriefDataUpdatedHm(_ofzSnapshotMeta)
          : '';
      }
      var base = note || (updatedHm
        ? ('MOEX ISS · Обновлено: ' + updatedHm)
        : ('Обновлено: ' + count + ' выпуск' + ofzPluralRu(count)));
      if (!_ofzDataLive && typeof isInvestbriefDataStale === 'function' && isInvestbriefDataStale(_ofzSnapshotMeta)) {
        base += ' · Показываем последние доступные данные. Обновление задерживается.';
      }
      statusEl.textContent = base;
    }
  }

  function syncOfzBondSelect(rows) {
    var select = document.getElementById('ofzBondSelect');
    if (!select) return;
    var prev = select.value;
    select.innerHTML = rows.map(function (r) {
      return '<option value="' + escapeHtml(r.ticker) + '">' + escapeHtml(r.label || r.ticker) + '</option>';
    }).join('');
    var next = rows.some(function (r) { return r.ticker === _selectedTicker; })
      ? _selectedTicker
      : (rows.some(function (r) { return r.ticker === prev; }) ? prev : (rows[0] ? rows[0].ticker : ''));
    _selectedTicker = next || _selectedTicker;
    select.value = _selectedTicker;
  }

  function parseIssTable(block) {
    if (!block || !block.columns || !block.data || !block.data.length) return null;
    var cols = block.columns;
    var row = block.data[0];
    var out = {};
    cols.forEach(function (col, i) { out[col] = row[i]; });
    return out;
  }

  function parseIssRows(block) {
    if (!block || !block.columns || !block.data) return [];
    var cols = block.columns;
    return block.data.map(function (row) {
      var out = {};
      cols.forEach(function (col, i) { out[col] = row[i]; });
      return out;
    });
  }

  function fetchOfzSecurityMeta(secid) {
    return moexFetchJson(MOEX_ISS + '/securities/' + encodeURIComponent(secid) +
      '.json?iss.only=securities,description&iss.meta=off').then(function (json) {
      var sec = parseIssTable(json.securities);
      if (!sec) return {};
      return {
        secid: secid,
        shortname: sec.SHORTNAME || sec.SECNAME || secid,
        faceValue: sec.FACEVALUE != null ? Number(sec.FACEVALUE) : 1000,
        couponPct: sec.COUPONPERCENT != null ? Number(sec.COUPONPERCENT) : null,
        couponPeriod: sec.COUPONPERIOD != null ? Number(sec.COUPONPERIOD) : null,
        matDate: sec.MATDATE || null,
        issueDate: sec.ISSUEDATE || null
      };
    }).catch(function () { return {}; });
  }

  function fetchOfzCouponSchedule(secid) {
    return moexFetchJson(MOEX_ISS + '/securities/' + encodeURIComponent(secid) +
      '/bondization.json?iss.only=coupons&iss.meta=off&limit=500').then(function (json) {
      return parseIssRows(json.coupons).map(function (c) {
        return {
          date: c.coupondate,
          value: c.value != null ? Number(c.value) : null,
          valuePct: c.valueprc != null ? Number(c.valueprc) : null
        };
      }).filter(function (c) { return c.date; });
    }).catch(function () { return []; });
  }

  function fetchOfzBondSnapshot(cfg) {
    cfg = cfg || {};
    var ticker = cfg.ticker;
    var preset = cfg.preset || {};
    var instP = cfg.secid
      ? Promise.resolve({ type: 'bond', engine: 'stock', market: 'bonds', board: 'TQOB', secid: cfg.secid })
      : resolveRuBondInstrument(ticker);
    return instP.then(function (inst) {
      return Promise.all([
        fetchMoexQuote(ticker),
        fetchOfzSecurityMeta(inst.secid),
        fetchOfzCouponSchedule(inst.secid)
      ]).then(function (parts) {
        var quote = parts[0] || {};
        var meta = parts[1] || {};
        var coupons = parts[2] || [];
        var kindInfo = detectKindFromName(meta.shortname, preset);
        var payCount = couponsPerYear(meta.couponPeriod);
        if (!payCount && coupons.length >= 2) {
          var d1 = new Date(coupons[coupons.length - 1].date);
          var d2 = new Date(coupons[coupons.length - 2].date);
          var diff = Math.abs(d1 - d2) / (86400000);
          payCount = couponsPerYear(diff);
        }
        return {
          ticker: ticker,
          secid: inst.secid,
          label: meta.shortname || getTickerSubtitle(ticker) || ticker,
          kind: kindInfo.kind,
          kindLabel: preset.kindLabel || kindInfo.kindLabel,
          price: quote.price != null ? quote.price : cfg.price,
          changePct: quote.changePct,
          yieldPct: quote.yieldPct != null ? quote.yieldPct : cfg.yieldPct,
          couponPct: meta.couponPct != null ? meta.couponPct : cfg.couponPct,
          payCount: payCount != null ? payCount : cfg.payCount,
          matDate: meta.matDate || cfg.matDate,
          faceValue: meta.faceValue || cfg.faceValue || 1000,
          coupons: coupons
        };
      });
    }).catch(function () {
      return {
        ticker: ticker,
        label: getTickerSubtitle(ticker) || ticker,
        kind: preset.kind || 'fixed',
        kindLabel: preset.kindLabel || 'ОФЗ',
        error: true
      };
    });
  }

  function buildCouponBarSeries(coupons, faceValue) {
    faceValue = faceValue || 1000;
    var now = Date.now();
    var cutoffPast = now - 730 * 86400000;
    var cutoffFuture = now + 395 * 86400000;
    var list = (coupons || []).filter(function (c) {
      var t = new Date(c.date).getTime();
      return isFinite(t) && t >= cutoffPast && t <= cutoffFuture;
    });
    if (!list.length) return [];
    return list.map(function (c) {
      var t = new Date(c.date).getTime();
      var val = c.value != null && isFinite(c.value)
        ? c.value
        : (c.valuePct != null ? (faceValue * c.valuePct / 100) : 0);
      return {
        label: new Date(c.date).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
        v: val,
        valueLabel: val > 0 ? val.toFixed(0).replace('.', ',') + ' ₽' : '',
        forecast: t > now
      };
    });
  }

  function buildProfitSeries(priceSeries, coupons, faceValue, investRub) {
    faceValue = faceValue || 1000;
    investRub = investRub || 100000;
    if (!priceSeries || priceSeries.length < 2) return [];
    var nominalUnits = investRub / faceValue;
    var sortedCoupons = (coupons || []).slice().sort(function (a, b) {
      return new Date(a.date) - new Date(b.date);
    });
    var startPrice = priceSeries[0].price;
    var cumCoupon = 0;
    var ci = 0;
    return priceSeries.map(function (pt) {
      while (ci < sortedCoupons.length && new Date(sortedCoupons[ci].date).getTime() <= pt.t) {
        var c = sortedCoupons[ci];
        cumCoupon += c.value != null ? c.value * nominalUnits : 0;
        ci++;
      }
      var pricePnl = (pt.price - startPrice) / 100 * faceValue * nominalUnits;
      return {
        t: pt.t,
        price: cumCoupon + pricePnl
      };
    });
  }

  function drawOfzProfitChart(canvas, series) {
    if (!canvas || typeof drawPriceChart !== 'function') return;
    var mapped = (series || []).map(function (p) {
      return { t: p.t, price: p.price };
    });
    drawPriceChart(canvas, mapped, { ticker: '_RUB', horizon: 'year' });
  }

  function renderOfzIncomeTypes(selected) {
    var el = document.getElementById('ofzIncomeTypes');
    if (!el) return;
    var items = [
      {
        title: 'Купонный доход',
        paragraphs: [
          'Регулярные выплаты по расписанию.',
          'Для ОФЗ с фиксированным купоном размер известен заранее.'
        ]
      },
      {
        title: 'Переоценка',
        paragraphs: [
          'Цена ОФЗ меняется на рынке каждый день.',
          'Если продать облигацию дороже цены покупки, вы получите дополнительную прибыль.',
          'Если продать дешевле, зафиксируете убыток.',
          'При удержании до погашения обычно возвращается номинал, при выполнении государством обязательства.'
        ]
      },
      {
        title: selected && selected.kind === 'indexed' ? 'Индексация' : 'Ставка и срок',
        text: selected && selected.kind === 'indexed'
          ? 'ОФЗ-ИН дополнительно защищают от инфляции: номинал и купоны могут расти с индексом потребительских цен.'
          : (selected && selected.kind === 'float'
            ? 'ОФЗ-ПД привязаны к ключевой ставке: купон меняется при изменении ставки ЦБ.'
            : 'Доходность к погашению учитывает все будущие купоны и цену покупки.')
      }
    ];
    el.innerHTML = items.map(function (item) {
      var body = item.paragraphs
        ? item.paragraphs.map(function (p) { return escapeHtml(p); }).join('<br><br>')
        : escapeHtml(item.text || '');
      return (
        '<article class="ofz-income-card">' +
          '<h4 class="ofz-income-card__title">' + escapeHtml(item.title) + '</h4>' +
          '<p class="muted ofz-income-card__text">' + body + '</p>' +
        '</article>'
      );
    }).join('');
  }

  function renderOfzUsage() {
    var el = document.getElementById('ofzUsageList');
    if (!el) return;
    el.innerHTML = OFZ_USAGE.map(function (item) {
      return (
        '<li><strong>' + escapeHtml(item.title) + '.</strong> ' + escapeHtml(item.text) + '</li>'
      );
    }).join('');
  }

  function renderOfzKpis(row) {
    var el = document.getElementById('ofzKpis');
    if (!el) return;
    if (!row || row.error) {
      el.innerHTML = '<p class="muted">Не удалось загрузить данные по выпуску.</p>';
      return;
    }
    el.innerHTML = [
      { lbl: 'Цена', val: formatOfzPrice(row.price) },
      { lbl: 'Доходность', val: formatOfzYield(row.yieldPct) },
      { lbl: 'Купон', val: formatOfzCouponPct(row.couponPct) },
      { lbl: 'Дюрация', val: row.durationYears != null ? formatOfzNum(row.durationYears, 2) + ' лет' : '—' },
      { lbl: 'Выплат в год', val: row.payCount != null ? String(row.payCount) : '—' },
      { lbl: 'Погашение', val: formatOfzDate(row.matDate) }
    ].map(function (k) {
      return '<div class="ofz-kpi"><span class="ofz-kpi-lbl muted">' + escapeHtml(k.lbl) + '</span><span class="ofz-kpi-val">' + escapeHtml(k.val) + '</span></div>';
    }).join('');
  }

  function ofzWatchlistHas(ticker) {
    var t = normalizeTicker(ticker);
    var list = getWatchlist();
    if (typeof Markets !== 'undefined') return Markets.watchlistHasTicker(list, t, 'RU');
    return list.some(function (x) { return normalizeTicker(x) === t || normalizeTicker(x && x.ticker) === t; });
  }

  function ofzPortfolioHas(ticker) {
    var t = normalizeTicker(ticker);
    return (getPortfolio().positions || []).some(function (p) {
      return normalizeTicker(p.ticker) === t;
    });
  }

  function ofzActionBtn(kind, ticker, active, titleAdd, titleRemove) {
    var safe = String(ticker || '').replace(/[^A-Za-z0-9._-]/g, '');
    var cls = 'ofz-action-btn' + (active ? ' ofz-action-btn--on' : '');
    var label = active ? '−' : '+';
    var title = active ? titleRemove : titleAdd;
    return '<button type="button" class="' + cls + '" data-ofz-' + kind + '="' + safe + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '">' + label + '</button>';
  }

  function ofzFindRow(ticker) {
    var t = normalizeTicker(ticker);
    return _rows.find(function (r) { return normalizeTicker(r.ticker) === t; }) || null;
  }

  function ofzToggleWatchlist(ticker) {
    var t = normalizeTicker(ticker);
    if (!t) {
      showToast('Не удалось определить тикер');
      return;
    }
    if (ofzWatchlistHas(t)) {
      setWatchlist(getWatchlist().filter(function (x) {
        var n = typeof Markets !== 'undefined' ? Markets.normalizeWatchlistItem(x) : { ticker: x, market: 'RU' };
        if (!n) return false;
        return !(n.ticker === t && (n.market === 'RU' || !n.market));
      }));
      showToast('Удалено из наблюдения: ' + t);
    } else if (typeof addTicker === 'function') {
      addTicker(t);
    } else {
      var item = typeof Markets !== 'undefined'
        ? Markets.normalizeWatchlistItem({
          ticker: t,
          market: 'RU',
          currency: 'RUB',
          type: 'bond',
          kind: 'bond',
          name: (typeof getTickerSubtitle === 'function' ? getTickerSubtitle(t) : '') || t
        })
        : t;
      if (!item) {
        showToast('Не удалось добавить: ' + t);
        return;
      }
      var list = getWatchlist().slice();
      list.push(item);
      setWatchlist(list);
      showToast('Добавлено в наблюдение: ' + t);
    }
    setTimeout(function () {
      applyOfzTableView();
    }, 0);
  }

  function ofzTogglePortfolio(row) {
    if (!row || !row.ticker) {
      showToast('Данные выпуска не найдены');
      return;
    }
    var t = normalizeTicker(row.ticker);
    if (ofzPortfolioHas(t)) {
      var portfolio = getPortfolio();
      portfolio.positions = (portfolio.positions || []).filter(function (p) {
        return normalizeTicker(p.ticker) !== t;
      });
      setPortfolio(portfolio);
      showToast('Удалено из портфеля: ' + t);
    } else {
      var portfolioAdd = getPortfolio();
      if (!Array.isArray(portfolioAdd.positions)) portfolioAdd.positions = [];
      var price = row.price != null && isFinite(row.price) ? row.price : 100;
      var pos = normalizePosition({
        ticker: t,
        qty: 1,
        avgPrice: price,
        currentPrice: price,
        buyDate: new Date().toISOString().slice(0, 10),
        comment: '',
        market: 'RU',
        currency: 'RUB'
      });
      if (!pos) {
        showToast('Не удалось добавить в портфель: ' + t);
        return;
      }
      portfolioAdd.positions.push(pos);
      setPortfolio(portfolioAdd);
      showToast('Добавлено в портфель: ' + (row.label || t));
    }
    if (typeof renderPortfolio === 'function') renderPortfolio();
    applyOfzTableView();
  }

  function handleOfzTableClick(e) {
    var pfBtn = e.target.closest('[data-ofz-portfolio]');
    if (pfBtn) {
      e.preventDefault();
      e.stopPropagation();
      var pfRow = ofzFindRow(pfBtn.getAttribute('data-ofz-portfolio'));
      if (pfRow) ofzTogglePortfolio(pfRow);
      else showToast('Обновите таблицу ОФЗ (↻)');
      return;
    }
    var wlBtn = e.target.closest('[data-ofz-watch]');
    if (wlBtn) {
      e.preventDefault();
      e.stopPropagation();
      ofzToggleWatchlist(wlBtn.getAttribute('data-ofz-watch'));
      return;
    }
    var pick = e.target.closest('[data-ofz-pick]');
    if (pick) {
      e.preventDefault();
      selectOfzTicker(pick.getAttribute('data-ofz-pick'));
    }
  }

  function drawOfzYieldCurveChart(canvas, rows, selectedTicker) {
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(rect.width, 320);
    var h = Math.max(rect.height, 260);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var points = (rows || []).filter(function (r) {
      return r.durationYears > 0 && r.yieldPct > 0 && isFinite(r.durationYears) && isFinite(r.yieldPct);
    }).map(function (r) {
      var shortLabel = String(r.label || r.ticker).replace(/^ОФЗ\s*/i, '').trim();
      return { x: r.durationYears, y: r.yieldPct, row: r, label: shortLabel || r.ticker };
    });

    if (points.length < 2) {
      canvas._ofzYieldMeta = null;
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '14px Golos Text, IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Недостаточно данных для кривой', w / 2, h / 2);
      return;
    }

    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var padX = Math.max((maxX - minX) * 0.08, 0.25);
    var padY = Math.max((maxY - minY) * 0.15, 0.25);
    minX = Math.max(0, minX - padX);
    maxX += padX;
    minY -= padY;
    maxY += padY;

    var pad = { top: 16, right: 14, bottom: 38, left: 46 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    function xAt(v) { return pad.left + ((v - minX) / (maxX - minX || 1)) * plotW; }
    function yAt(v) { return pad.top + plotH - ((v - minY) / (maxY - minY || 1)) * plotH; }

    ctx.strokeStyle = 'rgba(43, 43, 43, 0.08)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = pad.top + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(pad.left + plotW, gy);
      ctx.stroke();
      var yVal = maxY - ((maxY - minY) * g) / 4;
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '10px Inter, Manrope, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(yVal.toFixed(1).replace('.', ',') + '%', pad.left - 6, gy + 3);
    }

    for (var gx = 0; gx <= 5; gx++) {
      var xVal = minX + ((maxX - minX) * gx) / 5;
      var gxPos = xAt(xVal);
      ctx.fillStyle = '#6B6B6B';
      ctx.textAlign = 'center';
      ctx.fillText(xVal.toFixed(1).replace('.', ','), gxPos, h - 12);
    }

    ctx.fillStyle = '#6B6B6B';
    ctx.font = '11px Inter, Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Дюрация, лет', pad.left + plotW / 2, h - 2);
    ctx.save();
    ctx.translate(12, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Доходность, %', 0, 0);
    ctx.restore();

    var sorted = points.slice().sort(function (a, b) { return a.x - b.x; });
    ctx.strokeStyle = 'rgba(61, 122, 153, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    sorted.forEach(function (p, i) {
      var px = xAt(p.x);
      var py = yAt(p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    points.forEach(function (p) {
      var selected = p.row.ticker === selectedTicker;
      var px = xAt(p.x);
      var py = yAt(p.y);
      ctx.beginPath();
      ctx.arc(px, py, selected ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#3D5C47' : 'rgba(61, 122, 153, 0.9)';
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = selected ? '#2B2B2B' : '#555';
      ctx.font = (selected ? '10px' : '8px') + ' Inter, Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, px, py - (selected ? 10 : 7));
    });

    canvas._ofzYieldMeta = {
      points: points,
      pad: pad,
      plotW: plotW,
      plotH: plotH,
      w: w,
      h: h,
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY
    };
  }

  function renderOfzYieldCurve(rows) {
    var canvas = document.getElementById('ofzYieldCurveChart');
    if (!canvas) return;
    drawOfzYieldCurveChart(canvas, rows, _selectedTicker);
    var note = document.getElementById('ofzYieldCurveNote');
    if (note) {
      var n = (rows || []).filter(function (r) {
        return r.durationYears > 0 && r.yieldPct > 0;
      }).length;
      note.textContent = n
        ? n + ' выпусков на графике · дюрация и доходность к погашению по данным TQOB'
        : 'Дюрация и доходность к погашению · TQOB';
    }
  }

  function bindOfzYieldCurveHover() {
    var canvas = document.getElementById('ofzYieldCurveChart');
    var tip = document.getElementById('ofzYieldCurveTip');
    var wrap = canvas && canvas.parentElement;
    if (!canvas || !wrap || canvas._ofzYieldHoverBound) return;
    canvas._ofzYieldHoverBound = true;

    function hideTip() {
      if (tip) tip.classList.remove('is-visible');
    }

    wrap.addEventListener('mousemove', function (e) {
      var meta = canvas._ofzYieldMeta;
      if (!meta || !meta.points || !meta.points.length) {
        hideTip();
        return;
      }
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var best = null;
      var bestDist = 999;
      meta.points.forEach(function (p) {
        var px = meta.pad.left + ((p.x - meta.minX) / (meta.maxX - meta.minX || 1)) * meta.plotW;
        var py = meta.pad.top + meta.plotH - ((p.y - meta.minY) / (meta.maxY - meta.minY || 1)) * meta.plotH;
        var dist = Math.hypot(mx - px, my - py);
        if (dist < bestDist) {
          bestDist = dist;
          best = { p: p, px: px, py: py };
        }
      });
      if (!best || bestDist > 18 || !tip) {
        hideTip();
        return;
      }
      tip.textContent = (best.p.row.label || best.p.row.ticker) +
        ' · дюр. ' + formatOfzNum(best.p.x, 2) + ' лет · дох. ' + formatOfzYield(best.p.y);
      tip.style.left = Math.min(Math.max(best.px, 40), meta.w - 40) + 'px';
      tip.style.top = Math.max(best.py - 8, 8) + 'px';
      tip.classList.add('is-visible');
    });
    wrap.addEventListener('mouseleave', hideTip);
  }

  function renderOfzTable() {
    var tbody = document.getElementById('ofzCompareBody');
    if (!tbody) return;
    if (_loading) {
      tbody.innerHTML = '<tr><td colspan="' + OFZ_TABLE_COLS + '" class="muted">Загрузка данных МосБиржи…</td></tr>';
      updateOfzTableFilterNote(0, 0);
      return;
    }
    var rows = getFilteredSortedRows();
    if (!_rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + OFZ_TABLE_COLS + '" class="muted">Нет данных</td></tr>';
      updateOfzTableFilterNote(0, 0);
      updateOfzSortHeaders();
      return;
    }
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + OFZ_TABLE_COLS + '" class="muted">Нет выпусков по фильтру — измените условия или нажмите «Сброс»</td></tr>';
      updateOfzTableFilterNote(0, _rows.length);
      updateOfzSortHeaders();
      return;
    }
    tbody.innerHTML = rows.map(function (r, idx) {
      var active = r.ticker === _selectedTicker ? ' class="ofz-row-active"' : '';
      var inPf = ofzPortfolioHas(r.ticker);
      var inWl = ofzWatchlistHas(r.ticker);
      return (
        '<tr data-ofz-ticker="' + escapeHtml(r.ticker) + '"' + active + '>' +
          '<td class="ofz-num muted">' + String(idx + 1) + '</td>' +
          '<td><button type="button" class="ofz-row-btn" data-ofz-pick="' + escapeHtml(r.ticker) + '">' + escapeHtml(r.label || r.ticker) + '</button></td>' +
          '<td class="ofz-num">' + escapeHtml(formatOfzDateShort(r.matDate)) + '</td>' +
          '<td class="ofz-num">' + escapeHtml(formatOfzNum(r.yearsToMat, 1)) + '</td>' +
          '<td class="ofz-num ofz-yield-val">' + escapeHtml(formatOfzYield(r.yieldPct)) + '</td>' +
          '<td class="ofz-num ofz-yield-val">' + escapeHtml(formatOfzCouponPct(r.couponPct)) + '</td>' +
          '<td class="ofz-num ofz-yield-val">' + escapeHtml(formatOfzYield(r.couponYieldLast)) + '</td>' +
          '<td class="ofz-num">' + escapeHtml(formatOfzPrice(r.price)) + '</td>' +
          '<td class="ofz-num">' + escapeHtml(formatOfzVolMln(r.vol)) + '</td>' +
          '<td class="ofz-num">' + escapeHtml(formatOfzNum(r.couponValue, 2)) + '</td>' +
          '<td class="ofz-num">' + escapeHtml(r.payCount != null ? String(r.payCount) : '—') + '</td>' +
          '<td class="ofz-num">' + escapeHtml(formatOfzNum(r.accruedInt, 1)) + '</td>' +
          '<td class="ofz-num">' + escapeHtml(formatOfzNum(r.durationYears, 2)) + '</td>' +
          '<td class="ofz-num">' + escapeHtml(formatOfzDateShort(r.nextCoupon)) + '</td>' +
          '<td class="ofz-action-cell">' + ofzActionBtn('portfolio', r.ticker, inPf, 'В портфель', 'Убрать из портфеля') + '</td>' +
          '<td class="ofz-action-cell">' + ofzActionBtn('watch', r.ticker, inWl, 'В наблюдение', 'Убрать из наблюдения') + '</td>' +
        '</tr>'
      );
    }).join('');
    updateOfzTableFilterNote(rows.length, _rows.length);
    updateOfzSortHeaders();
  }

  function renderOfzCharts(row) {
    if (!row || row.error) return Promise.resolve();
    var priceCanvas = document.getElementById('ofzPriceChart');
    var couponCanvas = document.getElementById('ofzCouponChart');
    var profitCanvas = document.getElementById('ofzProfitChart');
    var couponNote = document.getElementById('ofzCouponNote');
    var profitNote = document.getElementById('ofzProfitNote');

    return fetchMoexHistory(row.ticker, 'year').then(function (hist) {
      if (priceCanvas && hist.series && hist.series.length) {
        drawPriceChart(priceCanvas, hist.series, { ticker: row.ticker, horizon: 'year' });
      }
      var couponSeries = buildCouponBarSeries(row.coupons, row.faceValue);
      if (couponCanvas) {
        drawFullBarChart(couponCanvas, couponSeries, {
          showValues: couponSeries.length <= 14
        });
      }
      if (couponNote) {
        couponNote.textContent = couponSeries.length
          ? 'Купон на 1 облигацию (номинал ' + (row.faceValue || 1000) + ' ₽). Зелёные столбцы — будущие выплаты.'
          : 'Расписание купонов временно недоступно.';
      }
      var profitSeries = buildProfitSeries(hist.series, row.coupons, row.faceValue, 100000);
      if (profitCanvas && profitSeries.length) {
        drawOfzProfitChart(profitCanvas, profitSeries);
      }
      if (profitNote) {
        profitNote.textContent = 'Пример для вложения 100 000 ₽: купоны + переоценка по цене (% от номинала). Не является прогнозом.';
      }
    }).catch(function () {
      if (couponNote) couponNote.textContent = 'Не удалось построить графики.';
    });
  }

  function ensureOfzRowDetails(row) {
    if (!row || row.error) return Promise.resolve(row);
    if (row.coupons && row.coupons.length) return Promise.resolve(row);
    var ticker = row.ticker;
    return fetchOfzBondSnapshot({
      ticker: ticker,
      secid: row.secid,
      price: row.price,
      yieldPct: row.yieldPct,
      couponPct: row.couponPct,
      payCount: row.payCount,
      matDate: row.matDate,
      faceValue: row.faceValue
    }).then(function (full) {
      if (!full || full.error) return row;
      Object.keys(full).forEach(function (k) { row[k] = full[k]; });
      return row;
    }).catch(function () {
      return row;
    });
  }

  function renderOfzSelection(row) {
    applyOfzTableView();
    renderOfzIncomeTypes(row);
    renderOfzKpis(row);
  }

  function selectOfzTicker(ticker) {
    if (!ticker) return Promise.resolve();
    _selectedTicker = ticker;
    var select = document.getElementById('ofzBondSelect');
    if (select && select.value !== ticker) select.value = ticker;
    var row = _rows.find(function (r) { return r.ticker === ticker; }) || null;
    renderOfzSelection(row);
    if (!row) return Promise.resolve();
    return ensureOfzRowDetails(row).then(function (enriched) {
      if (_selectedTicker !== ticker) return null;
      renderOfzSelection(enriched);
      return renderOfzCharts(enriched);
    });
  }

  function applyOfzCatalog(catalog) {
    _rows = (catalog || []).map(rowFromCatalogEntry);
    _loading = false;
    _loadError = _rows.length ? '' : 'Пустой ответ МосБиржи.';
    updateOfzSectionLead(_rows.length, _loadError ? '' : undefined);
    if (_rows.length && !_rows.some(function (r) { return r.ticker === _selectedTicker; })) {
      _selectedTicker = _rows[0].ticker;
    }
    syncOfzBondSelect(_rows);
    applyOfzTableView();
    return selectOfzTicker(_selectedTicker);
  }

  function loadOfzData(force) {
    var section = document.getElementById('ofzSection');
    if (!section) return Promise.resolve();
    if (_loading && !force) return Promise.resolve();
    _loading = true;
    _loadError = '';
    updateOfzSectionLead(0);
    renderOfzTable();

    return fetchOfzBondCatalog(!!force).then(function (catalog) {
      return Promise.resolve(applyOfzCatalog(catalog)).then(function () {
        if (!force && !_ofzDataLive) {
          return fetchOfzBondCatalog(true).then(function (liveCatalog) {
            return applyOfzCatalog(liveCatalog);
          });
        }
      });
    }).catch(function () {
      _loading = false;
      _loadError = 'Ошибка загрузки данных МосБиржи.';
      updateOfzSectionLead(0);
      renderOfzTable();
    });
  }

  function bindOfzVisibilityRefresh() {
    if (_visibilityBound) return;
    var section = document.getElementById('ofzSection');
    var panel = document.getElementById('tab-watchlist');
    if (!section || !panel || typeof IntersectionObserver === 'undefined') return;
    _visibilityBound = true;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || !_rows.length) return;
        applyOfzTableView();
        var row = _rows.find(function (r) { return r.ticker === _selectedTicker; });
        if (row) renderOfzCharts(row);
      });
    }, { threshold: 0.12 });
    obs.observe(section);
  }

  function bindOfzUI() {
    if (_bound) return;
    _bound = true;
    renderOfzUsage();

    var tbody = document.getElementById('ofzCompareBody');
    if (tbody && !tbody._ofzClickBound) {
      tbody._ofzClickBound = true;
      tbody.addEventListener('click', handleOfzTableClick);
    }

    var section = document.getElementById('ofzSection');
    if (section) {
      section.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'ofzBondSelect') {
          selectOfzTicker(e.target.value);
        }
      });
    }

    var refreshBtn = document.getElementById('ofzRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        if (typeof moexCacheGet === 'function') {
          try { localStorage.removeItem((typeof MOEX_CACHE_PREFIX !== 'undefined' ? MOEX_CACHE_PREFIX : 'ibrf.moex.') + OFZ_CATALOG_CACHE_KEY); } catch (e) { /* */ }
        }
        loadOfzData(true);
      });
    }

    bindOfzYieldCurveHover();
    bindOfzVisibilityRefresh();
    bindOfzTableFilters();

    ['ofzPriceChart', 'ofzCouponChart', 'ofzProfitChart'].forEach(function (id) {
      var canvas = document.getElementById(id);
      if (canvas && typeof bindChartHover === 'function') bindChartHover(canvas);
    });
  }

  function scheduleOfzRefresh() {
    if (_ofzRefreshTimer) return;
    _ofzRefreshTimer = setInterval(function () {
      if (document.hidden) return;
      if (!state || state.tab !== 'watchlist' || state.analyticsSub !== 'ofz') return;
      loadOfzData(true);
    }, OFZ_REFRESH_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (!state || state.tab !== 'watchlist' || state.analyticsSub !== 'ofz') return;
      loadOfzData(true);
    });
  }

  function renderOfzSection() {
    var section = document.getElementById('ofzSection');
    if (!section) return;
    if (typeof Markets !== 'undefined' && !Markets.getMarketsEnabled().ru) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    bindOfzUI();
    scheduleOfzRefresh();
    if (!_rows.length && !_loading) loadOfzData(false);
    else if (_rows.length) selectOfzTicker(_selectedTicker);
    else updateOfzSectionLead(0);
  }

  window.renderOfzSection = renderOfzSection;
  window.loadOfzData = loadOfzData;
})();
