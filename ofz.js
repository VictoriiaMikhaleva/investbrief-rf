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
  var _detailLoadingTicker = null;

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

  function fetchOfzBondCatalog() {
    var url = MOEX_ISS + '/engines/stock/markets/bonds/boards/TQOB/securities.json' +
      '?iss.meta=off&iss.only=securities,marketdata' +
      '&securities.columns=SECID,SHORTNAME,COUPONPERCENT,MATDATE,COUPONPERIOD,FACEVALUE' +
      '&marketdata.columns=SECID,LAST,YIELDATWAPRICE,VALTODAY' +
      '&limit=500';
    return moexFetchJson(url).then(function (json) {
      var secBlock = json.securities;
      var mdBlock = json.marketdata;
      if (!secBlock || !secBlock.columns || !secBlock.data) return [];
      var sCols = secBlock.columns;
      var si = sCols.indexOf('SECID');
      var sn = sCols.indexOf('SHORTNAME');
      var cp = sCols.indexOf('COUPONPERCENT');
      var mat = sCols.indexOf('MATDATE');
      var period = sCols.indexOf('COUPONPERIOD');
      var fv = sCols.indexOf('FACEVALUE');
      var mdMap = {};
      if (mdBlock && mdBlock.columns && mdBlock.data) {
        var mi = mdBlock.columns.indexOf('SECID');
        var li = mdBlock.columns.indexOf('LAST');
        var yi = mdBlock.columns.indexOf('YIELDATWAPRICE');
        var vi = mdBlock.columns.indexOf('VALTODAY');
        mdBlock.data.forEach(function (row) {
          mdMap[row[mi]] = {
            last: li >= 0 ? row[li] : null,
            yield: yi >= 0 ? row[yi] : null,
            vol: vi >= 0 ? row[vi] : null
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
          last: md.last != null ? Number(md.last) : null,
          yieldPct: md.yield != null ? Number(md.yield) : null,
          vol: md.vol != null ? Number(md.vol) : 0
        };
      }).sort(function (a, b) {
        return (b.vol || 0) - (a.vol || 0);
      });
      return list;
    }).catch(function () {
      return OFZ_BONDS_FALLBACK.map(function (b) {
        return {
          ticker: b.ticker,
          shortname: (typeof getTickerSubtitle === 'function' ? getTickerSubtitle(b.ticker) : null) || b.ticker,
          kind: b.kind,
          kindLabel: b.kindLabel
        };
      });
    });
  }

  function rowFromCatalogEntry(entry) {
    var fallback = entry.kind ? { kind: entry.kind, kindLabel: entry.kindLabel } : null;
    var kindInfo = detectKindFromName(entry.shortname, fallback);
    return {
      ticker: entry.ticker,
      secid: entry.secid || null,
      label: entry.shortname || entry.ticker,
      kind: kindInfo.kind,
      kindLabel: kindInfo.kindLabel,
      price: entry.last,
      yieldPct: entry.yieldPct,
      couponPct: entry.couponPct,
      payCount: couponsPerYear(entry.couponPeriod),
      matDate: entry.matDate,
      faceValue: entry.faceValue || 1000,
      coupons: null
    };
  }

  function updateOfzSectionLead(count) {
    var el = document.querySelector('.ofz-section-lead');
    if (!el || !count) return;
    el.textContent = count + ' выпуск' + (count % 10 === 1 && count % 100 !== 11 ? '' : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'а' : 'ов')) +
      ' на TQOB: доходность, купоны и сравнение. Не является индивидуальной инвестиционной рекомендацией.';
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
        text: 'Регулярные выплаты по расписанию. Для ОФЗ с фиксированным купоном размер известен заранее.'
      },
      {
        title: 'Переоценка',
        text: 'Изменение рыночной цены облигации. Если продать дороже покупки — дополнительная прибыль (или убыток).'
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
      return (
        '<article class="ofz-income-card">' +
          '<h4 class="ofz-income-card__title">' + escapeHtml(item.title) + '</h4>' +
          '<p class="muted ofz-income-card__text">' + escapeHtml(item.text) + '</p>' +
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
      { lbl: 'Выплат в год', val: row.payCount != null ? String(row.payCount) : '—' },
      { lbl: 'Погашение', val: formatOfzDate(row.matDate) }
    ].map(function (k) {
      return '<div class="ofz-kpi"><span class="ofz-kpi-lbl muted">' + escapeHtml(k.lbl) + '</span><span class="ofz-kpi-val">' + escapeHtml(k.val) + '</span></div>';
    }).join('');
  }

  function renderOfzTable(rows) {
    var tbody = document.getElementById('ofzCompareBody');
    if (!tbody) return;
    if (_loading) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">Загрузка данных МосБиржи…</td></tr>';
      return;
    }
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">Нет данных</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var active = r.ticker === _selectedTicker ? ' class="ofz-row-active"' : '';
      return (
        '<tr data-ofz-ticker="' + escapeHtml(r.ticker) + '"' + active + '>' +
          '<td><button type="button" class="ofz-row-btn" data-ofz-pick="' + escapeHtml(r.ticker) + '">' + escapeHtml(r.label || r.ticker) + '</button></td>' +
          '<td>' + escapeHtml(r.kindLabel || '—') + '</td>' +
          '<td>' + escapeHtml(formatOfzPrice(r.price)) + '</td>' +
          '<td>' + escapeHtml(formatOfzYield(r.yieldPct)) + '</td>' +
          '<td>' + escapeHtml(formatOfzCouponPct(r.couponPct)) + '</td>' +
          '<td>' + escapeHtml(r.payCount != null ? String(r.payCount) : '—') + '</td>' +
          '<td>' + escapeHtml(formatOfzDate(r.matDate)) + '</td>' +
        '</tr>'
      );
    }).join('');
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
    if (_detailLoadingTicker === row.ticker) return Promise.resolve(row);
    _detailLoadingTicker = row.ticker;
    return fetchOfzBondSnapshot({
      ticker: row.ticker,
      secid: row.secid,
      price: row.price,
      yieldPct: row.yieldPct,
      couponPct: row.couponPct,
      payCount: row.payCount,
      matDate: row.matDate,
      faceValue: row.faceValue
    }).then(function (full) {
      if (_detailLoadingTicker === row.ticker) _detailLoadingTicker = null;
      if (!full || full.error) return row;
      Object.keys(full).forEach(function (k) { row[k] = full[k]; });
      return row;
    }).catch(function () {
      if (_detailLoadingTicker === row.ticker) _detailLoadingTicker = null;
      return row;
    });
  }

  function selectOfzTicker(ticker) {
    _selectedTicker = ticker;
    var select = document.getElementById('ofzBondSelect');
    if (select) select.value = ticker;
    var row = _rows.find(function (r) { return r.ticker === ticker; }) || null;
    renderOfzTable(_rows);
    renderOfzIncomeTypes(row);
    renderOfzKpis(row);
    if (!row) return Promise.resolve();
    return ensureOfzRowDetails(row).then(function (enriched) {
      renderOfzTable(_rows);
      renderOfzIncomeTypes(enriched);
      renderOfzKpis(enriched);
      return renderOfzCharts(enriched);
    });
  }

  function loadOfzData(force) {
    var section = document.getElementById('ofzSection');
    if (!section) return Promise.resolve();
    if (_loading && !force) return Promise.resolve();
    _loading = true;
    renderOfzTable(_rows);

    return fetchOfzBondCatalog().then(function (catalog) {
      _rows = catalog.map(rowFromCatalogEntry);
      _loading = false;
      updateOfzSectionLead(_rows.length);
      if (!_rows.some(function (r) { return r.ticker === _selectedTicker; })) {
        _selectedTicker = _rows.length ? _rows[0].ticker : '';
      }
      var select = document.getElementById('ofzBondSelect');
      if (select) {
        select.innerHTML = _rows.map(function (r) {
          return '<option value="' + escapeHtml(r.ticker) + '">' + escapeHtml(r.label || r.ticker) + '</option>';
        }).join('');
        select.value = _selectedTicker;
      }
      renderOfzTable(_rows);
      return selectOfzTicker(_selectedTicker);
    }).catch(function () {
      _loading = false;
      renderOfzTable(_rows);
    });
  }

  function bindOfzUI() {
    if (_bound) return;
    _bound = true;
    renderOfzUsage();

    var select = document.getElementById('ofzBondSelect');
    if (select) {
      select.addEventListener('change', function () {
        selectOfzTicker(select.value);
      });
    }
    var refreshBtn = document.getElementById('ofzRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { loadOfzData(true); });
    }
    document.addEventListener('click', function (e) {
      var pick = e.target.closest('[data-ofz-pick]');
      if (!pick) return;
      selectOfzTicker(pick.getAttribute('data-ofz-pick'));
    });

    ['ofzPriceChart', 'ofzCouponChart', 'ofzProfitChart'].forEach(function (id) {
      var canvas = document.getElementById(id);
      if (canvas && typeof bindChartHover === 'function') bindChartHover(canvas);
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
    if (!_rows.length) loadOfzData(false);
    else selectOfzTicker(_selectedTicker);
  }

  window.renderOfzSection = renderOfzSection;
  window.loadOfzData = loadOfzData;
})();
