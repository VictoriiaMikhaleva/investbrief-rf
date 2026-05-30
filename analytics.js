/* analytics.js — дивиденды, оборот, карточки и вкладка аналитики */
(function () {
  'use strict';

  var ANALYTICS_CACHE_PREFIX = 'ibrf.analytics.v8.';
  var DIV_YIELD_MAX_SANE_PCT = 35;
  var DIV_PRICE_SCALE_BREAK_RATIO = 5;
  var ANALYTICS_TTL = 30 * 60 * 1000;
  var HISTORY_PAGE_LIMIT = 500;
  var VOLUME_YEAR_DAYS = 252;
  var YIELD_YEARS = 5;
  var ENRICH_CONCURRENCY = 4;
  var enrichQueue = [];
  var enrichActive = 0;

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

  function isIndexQuoteTicker(ticker) {
    ticker = normalizeTicker(ticker);
    return ticker === 'IMOEX' || ticker === 'INDEX';
  }

  function isRuBondTicker(ticker) {
    ticker = normalizeTicker(ticker);
    if (!ticker || isIndexQuoteTicker(ticker)) return false;
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) return false;
    if (typeof BOND_SECID_MAP !== 'undefined' && BOND_SECID_MAP[ticker]) return true;
    if (ticker.indexOf('OFZ') >= 0) return true;
    if (ticker.indexOf('SU') === 0 && ticker.length > 8) return true;
    return false;
  }

  function isRuStockForAnalytics(ticker) {
    ticker = normalizeTicker(ticker);
    if (!ticker || isIndexQuoteTicker(ticker)) return false;
    if (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker)) return false;
    if (isRuBondTicker(ticker)) return false;
    return true;
  }

  function formatDivYieldPct(pct) {
    if (pct == null || !isFinite(pct)) return '—';
    return pct.toFixed(1).replace('.', ',') + '%';
  }

  function formatDivYieldSourceBadge(source) {
    var label = source === 'yahoo' ? 'Yahoo' : 'MOEX';
    return '<span class="quote-div-src" title="Источник данных: ' + label + '">' + label + '</span>';
  }

  /** HTML: «8,7% MOEX» — только при валидном divAvg5y. */
  function formatDivAvg5yDisplayHtml(a) {
    if (!a || a.divDataSource === 'demo') return null;
    if (a.noMoexDividends || a.divAvg5y == null || !isFinite(a.divAvg5y)) return null;
    if (a.divYieldQuality === 'insufficient') return null;
    var src = a.divDataSource === 'yahoo' ? 'yahoo' : 'moex';
    return escapeHtml(formatDivYieldPct(a.divAvg5y)) + ' ' + formatDivYieldSourceBadge(src);
  }

  function formatBondYieldDisplayHtml(yieldPct) {
    if (yieldPct == null || !isFinite(yieldPct)) return null;
    return escapeHtml(formatDivYieldPct(yieldPct)) + ' ' + formatDivYieldSourceBadge('moex');
  }

  function setDivAvg5yElement(avgEl, a) {
    if (!avgEl) return;
    var html = formatDivAvg5yDisplayHtml(a);
    if (!html) {
      avgEl.textContent = 'нет данных';
      avgEl.className = 'quote-div-val muted';
      avgEl.title = a && a.divYieldQuality === 'partial'
        ? 'Недостаточно надёжных данных MOEX для средней за 5 лет'
        : '';
      return;
    }
    avgEl.innerHTML = html;
    avgEl.className = 'quote-div-val' + (a.divAvg5y > 0 ? ' pnl-pos' : '');
    avgEl.title = a.divYieldQuality === 'partial'
      ? 'Частичные данные MOEX (сплит, неполная история или аномалия)'
      : 'Средняя див. доходность за 5 завершённых лет · MOEX ISS';
  }

  /** Последняя (самая свежая) дивидендная доходность по бумаге. */
  function computeLatestDivYieldPct(a) {
    if (!a) return null;
    var yearly = a.divYieldByYear || [];
    var quotePrice = a.quote && a.quote.price;
    var i;
    for (i = yearly.length - 1; i >= 0; i--) {
      var y = yearly[i];
      if (y.yieldPct != null && isFinite(y.yieldPct) && y.yieldPct > 0) return y.yieldPct;
    }
    if (a.divForecast && a.divForecast.amount != null && isFinite(a.divForecast.amount) &&
        quotePrice != null && isFinite(quotePrice) && quotePrice > 0) {
      return (a.divForecast.amount / quotePrice) * 100;
    }
    if (a.monthlyForecast && a.monthlyForecast.months) {
      var withYield = a.monthlyForecast.months.filter(function (m) {
        return m.perShare > 0 && m.yieldPct != null && isFinite(m.yieldPct);
      });
      if (withYield.length) return withYield[withYield.length - 1].yieldPct;
    }
    if (a.quote && a.quote.divYieldPct != null && isFinite(a.quote.divYieldPct)) {
      return a.quote.divYieldPct;
    }
    if (a.quote && a.quote.yieldPct != null && isFinite(a.quote.yieldPct)) {
      return a.quote.yieldPct;
    }
    return null;
  }

  function formatDivRubPerShare(val) {
    if (val == null || !isFinite(val)) return '—';
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽/акц.';
  }

  function sumDividendsInYear(dividends, year) {
    var y = String(year);
    var sum = 0;
    (dividends || []).forEach(function (d) {
      if (!d.date || d.date.indexOf(y) !== 0 || !isFinite(d.value) || d.value <= 0) return;
      sum += d.value;
    });
    return sum;
  }



  function computeDividendForecast12m(dividends) {
    if (!dividends || !dividends.length) {
      return { amount: null, paid12m: null, upcoming12m: null, source: '' };
    }
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    var in12 = new Date(now);
    in12.setMonth(in12.getMonth() + 12);
    var back12 = new Date(now);
    back12.setFullYear(back12.getFullYear() - 1);

    var paid12m = 0;
    var upcoming12m = 0;

    dividends.forEach(function (d) {
      var dt = new Date(d.date + 'T12:00:00');
      if (isNaN(dt.getTime()) || !isFinite(d.value)) return;
      if (dt > back12 && dt <= now) paid12m += d.value;
      if (dt > now && dt <= in12) upcoming12m += d.value;
    });

    if (upcoming12m > 0) {
      return {
        amount: upcoming12m,
        paid12m: paid12m,
        upcoming12m: upcoming12m,
        source: 'объявленные выплаты (МосБиржа)'
      };
    }

    if (paid12m > 0) {
      return {
        amount: paid12m,
        paid12m: paid12m,
        upcoming12m: paid12m,
        source: 'оценка: выплачено за 12 мес.'
      };
    }

    var thisYear = now.getFullYear();
    var y;
    for (y = thisYear - 1; y >= thisYear - 6; y--) {
      var yearSum = sumDividendsInYear(dividends, y);
      if (yearSum > 0) {
        return {
          amount: yearSum,
          paid12m: paid12m,
          upcoming12m: yearSum,
          source: 'оценка по дивидендам ' + y + ' г. (МосБиржа)'
        };
      }
    }

    return { amount: null, paid12m: null, upcoming12m: null, source: '' };
  }



  function monthKeyFromDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }



  function formatMonthLabel(year, monthIndex) {
    var names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return names[monthIndex] + '.' + String(year).slice(-2);
  }



  function avgCloseInMonth(history, year, monthOneBased) {
    var prefix = year + '-' + String(monthOneBased).padStart(2, '0');
    var prices = (history || []).filter(function (h) {
      return h.date && h.date.indexOf(prefix) === 0 && h.close != null && h.close > 0;
    }).map(function (h) { return h.close; });
    if (!prices.length) return null;
    return prices.reduce(function (a, b) { return a + b; }, 0) / prices.length;
  }



  /** Помесячный план выплат на 12 мес. вперёд: ₽/акц. и доходность %. */
  function buildMonthlyDividendForecast12m(dividends, history, quotePrice) {
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    var months = [];
    var monthByKey = {};
    var i;
    for (i = 0; i < 12; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      var m = {
        key: monthKeyFromDate(d),
        label: formatMonthLabel(d.getFullYear(), d.getMonth()),
        year: d.getFullYear(),
        month: d.getMonth(),
        perShare: 0,
        items: [],
        estimated: false
      };
      months.push(m);
      monthByKey[m.key] = m;
    }
    var horizonEnd = new Date(now.getFullYear(), now.getMonth() + 12, 28);

    (dividends || []).forEach(function (div) {
      var dt = new Date(div.date + 'T12:00:00');
      if (isNaN(dt.getTime()) || !isFinite(div.value) || div.value <= 0) return;
      if (dt <= now || dt > horizonEnd) return;
      var bucket = monthByKey[monthKeyFromDate(dt)];
      if (!bucket) return;
      bucket.perShare += div.value;
      bucket.items.push({ date: div.date, value: div.value, announced: true });
    });

    var hasAnnounced = months.some(function (m) { return m.items.length > 0; });
    var source = hasAnnounced ? 'по датам отсечки (МосБиржа)' : '';

    if (!hasAnnounced) {
      var refYear = null;
      var yRef;
      for (yRef = now.getFullYear() - 1; yRef >= now.getFullYear() - 6; yRef--) {
        if (sumDividendsInYear(dividends, yRef) > 0) {
          refYear = yRef;
          break;
        }
      }
      if (refYear == null) refYear = now.getFullYear() - 1;
      (dividends || []).forEach(function (div) {
        if (div.date.indexOf(String(refYear)) !== 0) return;
        var dt = new Date(div.date + 'T12:00:00');
        if (isNaN(dt.getTime())) return;
        var bucket = monthByKey[monthKeyFromDate(new Date(now.getFullYear(), dt.getMonth(), 1))];
        if (!bucket) return;
        bucket.perShare += div.value;
        bucket.items.push({ date: div.date, value: div.value, estimated: true });
        bucket.estimated = true;
      });
      if (months.some(function (m) { return m.perShare > 0; })) {
        source = 'оценка: календарь выплат ' + refYear + ' г.';
      }
    }

    months.forEach(function (m) {
      var px = avgCloseInMonth(history, m.year, m.month + 1);
      if (px == null || !isFinite(px)) px = quotePrice;
      m.avgPrice = px;
      m.yieldPct = px != null && isFinite(px) && px > 0 && m.perShare > 0
        ? (m.perShare / px) * 100
        : null;
    });

    var totalPerShare = months.reduce(function (s, m) { return s + m.perShare; }, 0);
    return { months: months, source: source, totalPerShare: totalPerShare, hasAnnounced: hasAnnounced };
  }



  /** Фактический дивидендный доход по позиции за 5 лет (с учётом даты покупки). */
  function buildPassiveIncome5y(dividends, qty, buyDate) {
    qty = isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : 0;
    var cut = null;
    if (buyDate) {
      cut = new Date(buyDate + 'T12:00:00');
      if (isNaN(cut.getTime())) cut = null;
    }
    var now = new Date();
    var thisYear = now.getFullYear();
    var years = [];
    var y;
    for (y = thisYear - (YIELD_YEARS - 1); y <= thisYear; y++) years.push(y);

    return years.map(function (year) {
      var perShare = 0;
      var paymentCount = 0;
      (dividends || []).forEach(function (d) {
        if (d.date.indexOf(String(year)) !== 0) return;
        var dt = new Date(d.date + 'T12:00:00');
        if (isNaN(dt.getTime()) || dt > now) return;
        if (cut && dt < cut) return;
        if (!isFinite(d.value) || d.value <= 0) return;
        perShare += d.value;
        paymentCount++;
      });
      return {
        year: year,
        label: String(year),
        perShare: perShare,
        totalRub: qty > 0 ? perShare * qty : perShare,
        paymentCount: paymentCount
      };
    });
  }



  function monthNameFromDate(dateStr) {
    var d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return '—';
    var names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return names[d.getMonth()];
  }



  function formatDividendRubShort(val) {
    if (val == null || !isFinite(val) || val <= 0) return '—';
    return val.toFixed(2).replace('.', ',');
  }



  function formatDividendPaymentMonthsLine(dividends, reportingYear) {
    var y = String(reportingYear);
    var items = (dividends || []).filter(function (d) {
      return d.date && dividendReportingYear(d.date) === y;
    }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (!items.length) return '';
    return items.map(function (d) {
      return monthNameFromDate(d.date) + ' ' + formatDividendRubShort(d.value) + ' ₽';
    }).join(' · ');
  }



  /** Подпись к графику дивидендов: годы, % и месяцы выплат. */
  function formatDividendChartInfoHtml(a, qty) {
    if (!a || !a.eligible) {
      return '<p class="chart-info-empty muted">Нет дивидендных данных</p>';
    }
    var yearly = a.divYieldByYear || [];
    var fc = a.divForecast;
    var html = [];

    html.push('<div class="div-info-block div-info-years">');
    html.push('<div class="div-info-title">Выплаты по годам</div>');
    yearly.forEach(function (y) {
      var sum = y.totalDiv > 0
        ? formatDividendRubShort(y.totalDiv) + ' ₽/акц.'
        : (a.noMoexDividends ? '0 ₽/акц.' : '—');
      var yld = y.yieldPct != null && isFinite(y.yieldPct) ? formatDivYieldPct(y.yieldPct) : '';
      var months = formatDividendPaymentMonthsLine(a.dividends, y.year);
      html.push(
        '<div class="div-info-year">' +
          '<div class="div-info-year-head">' +
            '<span class="div-info-year-lbl">' + escapeHtml(String(y.year)) + '</span>' +
            '<span class="div-info-year-val">' + escapeHtml(sum) +
              (yld ? ' <span class="div-info-yield">(' + escapeHtml(yld) + ')</span>' : '') +
            '</span>' +
          '</div>' +
          (months
            ? '<div class="div-info-months"><span class="div-info-months-lbl">Месяцы выплат:</span> ' + escapeHtml(months) + '</div>'
            : '<div class="div-info-months muted">В этом году выплат не было</div>') +
        '</div>'
      );
    });
    if (fc && fc.amount != null && isFinite(fc.amount)) {
      html.push(
        '<div class="div-info-year div-info-year--forecast">' +
          '<div class="div-info-year-head">' +
            '<span class="div-info-year-lbl">Прогноз 12 мес.</span>' +
            '<span class="div-info-year-val">' + escapeHtml(formatDivRubPerShare(fc.amount)) + '</span>' +
          '</div>' +
          (fc.source ? '<div class="div-info-months muted">' + escapeHtml(fc.source) + '</div>' : '') +
        '</div>'
      );
    }
    html.push('</div>');

    if (a.monthlyForecast) {
      html.push('<div class="div-info-block div-info-plan">');
      html.push('<div class="div-info-title">Календарь на 12 месяцев вперёд</div>');
      html.push(formatDivMonthScheduleHtml(a.monthlyForecast, qty));
      html.push('</div>');
    }

    var winYears = getYieldWindowYears();
    html.push('<p class="div-info-hint">Доходность года = выплаты / средняя цена MOEX за год. Средняя 5 лет — по завершённым годам ' +
      winYears[0] + '–' + winYears[winYears.length - 1] + ' (MOEX ISS).</p>');
    return html.join('');
  }



  function formatDivMonthScheduleHtml(schedule, qty) {
    if (!schedule || !schedule.months || !schedule.months.length) {
      return '<p class="muted">Нет данных для прогноза</p>';
    }
    qty = isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : null;
    var withPay = schedule.months.filter(function (m) { return m.perShare > 0; });
    if (!withPay.length) {
      return '<p class="muted">В ближайшие 12 месяцев выплаты не запланированы (по данным МосБиржи)</p>';
    }
    var head =
      '<div class="div-schedule-head">' +
        '<span>Месяц</span><span>Выплаты</span><span>₽/акц.</span>' +
        (qty != null ? '<span>На позицию</span>' : '') +
        '<span>Доходн.</span>' +
      '</div>';
    var rows = withPay.map(function (m) {
      var payMonths = m.items.length
        ? m.items.map(function (it) {
            return monthNameFromDate(it.date) + ' ' + formatDividendRubShort(it.value) + ' ₽';
          }).join(' · ')
        : (m.estimated ? 'оценка' : '—');
      var dt = m.items.length && m.items[0].date
        ? String(m.items[0].date).slice(8, 10) + '.' + String(m.items[0].date).slice(5, 7) + '.' + String(m.items[0].date).slice(2, 4)
        : (m.estimated ? 'оценка' : '—');
      var posVal = qty != null ? (m.perShare * qty).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽' : '';
      return (
        '<div class="div-schedule-row' + (m.estimated ? ' div-schedule-row--est' : '') + '">' +
          '<span>' + escapeHtml(m.label) + '</span>' +
          '<span title="Отсечка ' + escapeHtml(dt) + '">' + escapeHtml(payMonths) + '</span>' +
          '<span>' + escapeHtml(formatDividendRubShort(m.perShare)) + '</span>' +
          (qty != null ? '<span>' + escapeHtml(posVal) + '</span>' : '') +
          '<span>' + escapeHtml(m.yieldPct != null ? formatDivYieldPct(m.yieldPct) : '—') + '</span>' +
        '</div>'
      );
    }).join('');
    var foot = schedule.source
      ? '<p class="div-schedule-src muted">' + escapeHtml(schedule.source) + '</p>'
      : '';
    return head + rows + foot;
  }

  function formatPortfolioDivCell(forecast, qty) {
    if (!forecast || forecast.amount == null) return '<span class="muted">—</span>';
    var q = isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : null;
    var perShare = formatDivRubPerShare(forecast.amount);
    var total = q != null ? (forecast.amount * q) : null;
    var paid = forecast.paid12m != null && isFinite(forecast.paid12m)
      ? 'выплачено ' + (q != null ? (forecast.paid12m * q).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : forecast.paid12m.toFixed(2)) + ' ₽'
      : '';
    var upcoming = forecast.upcoming12m != null && isFinite(forecast.upcoming12m)
      ? 'прогноз ' + (q != null ? (forecast.upcoming12m * q).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : forecast.upcoming12m.toFixed(2)) + ' ₽'
      : '';
    var lines = ['<span class="pf-div-forecast">' + escapeHtml(perShare) + '</span>'];
    if (paid || upcoming) {
      lines.push('<span class="pf-div-sub muted">' + escapeHtml([paid, upcoming].filter(Boolean).join(' · ')) + '</span>');
    }
    if (total != null) {
      lines.push('<span class="pf-div-sub muted">на позицию ~' + escapeHtml(total.toLocaleString('ru-RU', { maximumFractionDigits: 0 })) + ' ₽</span>');
    }
    return lines.join('');
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
      var rows = block.data.map(function (row) {
        return {
          date: String(row[iDate] || '').slice(0, 10),
          value: Number(row[iVal])
        };
      }).filter(function (d) { return d.date && isFinite(d.value) && d.value > 0; });
      return normalizeMoexDividends(rows);
    }).catch(function () { return []; });
  }

  /** Убирает повторы MOEX: та же сумма в пределах 14 дней. */
  function normalizeMoexDividends(dividends) {
    if (!dividends || !dividends.length) return [];
    var sorted = dividends.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    var out = [];
    sorted.forEach(function (d) {
      var dup = out.some(function (prev) {
        if (Math.abs(d.value - prev.value) > 0.001) return false;
        var t0 = new Date(prev.date + 'T12:00:00').getTime();
        var t1 = new Date(d.date + 'T12:00:00').getTime();
        if (isNaN(t0) || isNaN(t1)) return false;
        return Math.abs(t1 - t0) <= 14 * 24 * 60 * 60 * 1000;
      });
      if (!dup) out.push(d);
    });
    return out;
  }

  function moexHistoryLastTradeDate(rows) {
    if (!rows || !rows.length) return '';
    return String(rows[rows.length - 1].date || '').slice(0, 10);
  }

  function isMoexHistoryCacheStale(rows) {
    var last = moexHistoryLastTradeDate(rows);
    if (!last || last.length < 10) return true;
    var lastMs = new Date(last + 'T20:00:00').getTime();
    if (isNaN(lastMs)) return true;
    var now = new Date();
    var todayMsk = typeof moexFormatDateMsk === 'function' ? moexFormatDateMsk(now) : now.toISOString().slice(0, 10);
    var todayMs = new Date(todayMsk + 'T20:00:00').getTime();
    return todayMs - lastMs > 4 * 24 * 60 * 60 * 1000;
  }

  function fetchMoexShareHistoryDaily(ticker, yearsBack) {
    ticker = normalizeTicker(ticker);
    yearsBack = yearsBack || YIELD_YEARS;
    var cacheKey = 'hist.v2.' + ticker + '.' + yearsBack;
    var cached = analyticsCacheGet(cacheKey);
    if (cached && !isMoexHistoryCacheStale(cached)) return Promise.resolve(cached);

    var till = new Date();
    var from = new Date(till);
    from.setFullYear(from.getFullYear() - yearsBack);
    var fromStr = typeof moexFormatDateMsk === 'function' ? moexFormatDateMsk(from) : moexFormatDate(from);
    var tillStr = typeof moexFormatDateMsk === 'function' ? moexFormatDateMsk(till) : moexFormatDate(till);
    var baseUrl = MOEX_ISS + '/history/engines/stock/markets/shares/boards/TQBR/securities/' +
      encodeURIComponent(ticker) + '.json?from=' + fromStr + '&till=' + tillStr +
      '&iss.meta=off&history.columns=TRADEDATE,CLOSE,VALUE';

    var all = [];
    var start = 0;
    var iDate = -1;
    var iClose = -1;
    var iVal = -1;

    function fetchPage() {
      var url = baseUrl + '&start=' + start;
      return moexFetchJson(url).then(function (json) {
        var hist = json.history;
        if (!hist || !hist.data || !hist.data.length) return all;
        if (iDate < 0) {
          iDate = hist.columns.indexOf('TRADEDATE');
          iClose = hist.columns.indexOf('CLOSE');
          iVal = hist.columns.indexOf('VALUE');
        }
        hist.data.forEach(function (row) {
          var d = String(row[iDate] || '').slice(0, 10);
          var close = Number(row[iClose]);
          var val = Number(row[iVal]);
          if (!d) return;
          all.push({
            date: d,
            close: isFinite(close) ? close : null,
            value: isFinite(val) ? val : null,
            t: new Date(d + 'T12:00:00').getTime()
          });
        });
        var cur = json['history.cursor'] && json['history.cursor'].data && json['history.cursor'].data[0];
        var total = cur ? Number(cur[1]) : all.length;
        var pageSize = cur ? Number(cur[2]) : hist.data.length;
        if (pageSize > 0 && start + hist.data.length < total) {
          start += pageSize;
          return fetchPage();
        }
        return all;
      });
    }

    return fetchPage().then(function (rows) {
      var byDate = {};
      rows.forEach(function (r) { byDate[r.date] = r; });
      var out = Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
      analyticsCacheSet(cacheKey, out, 6 * 60 * 60 * 1000);
      return out;
    });
  }

  /*
   * Средняя див. доходность за 5 лет (divAvg5y), только MOEX ISS:
   * — окно: 5 последних завершённых календарных лет;
   * — выплата → отчётный год: янв–сен = год−1, окт–дек = текущий год;
   * — доходность года = Σ выплат / средняя цена CLOSE за тот же год × 100;
   * — год без выплат = 0%; год со сплитом (скачок средней цены ×5) исключается;
   * — divAvg5y = среднее по всем годам окна с достаточными ценами (включая нули).
   */
  function dividendReportingYear(paymentDateIso) {
    var parts = String(paymentDateIso || '').slice(0, 10).split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    if (!isFinite(y) || !isFinite(m)) return '';
    if (m >= 1 && m <= 9) return String(y - 1);
    return String(y);
  }

  function getYieldWindowYears() {
    var endYear = new Date().getFullYear() - 1;
    var years = [];
    for (var i = YIELD_YEARS - 1; i >= 0; i--) years.push(endYear - i);
    return years;
  }

  function yearEndClose(dailyHistory, year) {
    var y = String(year);
    var rows = dailyHistory.filter(function (h) {
      return h.date && h.date.indexOf(y) === 0 && h.close > 0;
    });
    if (!rows.length) return null;
    return rows[rows.length - 1].close;
  }

  function averageClose(dailyHistory, year) {
    var y = String(year);
    var prices = dailyHistory.filter(function (h) {
      return h.date && h.date.indexOf(y) === 0 && h.close > 0;
    }).map(function (h) { return h.close; });
    if (!prices.length) return null;
    return prices.reduce(function (a, b) { return a + b; }, 0) / prices.length;
  }

  function hasPriceScaleBreak(dailyHistory, year) {
    var prev = averageClose(dailyHistory, year - 1);
    var cur = averageClose(dailyHistory, year);
    if (prev == null || cur == null || prev <= 0 || cur <= 0) return false;
    var ratio = cur / prev;
    return ratio >= DIV_PRICE_SCALE_BREAK_RATIO || ratio <= (1 / DIV_PRICE_SCALE_BREAK_RATIO);
  }

  function isSaneYearYield(yieldPct) {
    return yieldPct != null && isFinite(yieldPct) && yieldPct >= 0 && yieldPct <= DIV_YIELD_MAX_SANE_PCT;
  }

  function computeYearlyDividendYields(dividends, dailyHistory, windowYears) {
    windowYears = windowYears || getYieldWindowYears();
    var byYearDiv = {};
    dividends.forEach(function (d) {
      var y = dividendReportingYear(d.date);
      if (!y) return;
      if (!byYearDiv[y]) byYearDiv[y] = 0;
      byYearDiv[y] += d.value;
    });

    return windowYears.map(function (yearNum) {
      var y = String(yearNum);
      var totalDiv = byYearDiv[y] || 0;
      var refPrice = averageClose(dailyHistory, yearNum);
      if (refPrice == null) refPrice = yearEndClose(dailyHistory, yearNum);
      var yieldPct = null;
      var unreliable = hasPriceScaleBreak(dailyHistory, yearNum);
      if (refPrice != null && refPrice > 0 && !unreliable) {
        var raw = totalDiv > 0 ? (totalDiv / refPrice) * 100 : 0;
        yieldPct = isSaneYearYield(raw) ? raw : null;
      }
      return {
        year: yearNum,
        yieldPct: yieldPct,
        totalDiv: totalDiv,
        refPrice: refPrice,
        unreliable: unreliable
      };
    });
  }

  function averageYield5y(yearly) {
    if (!yearly || !yearly.length) return null;
    var counted = yearly.filter(function (y) {
      return y.yieldPct != null && isFinite(y.yieldPct);
    });
    if (counted.length < Math.min(3, yearly.length)) return null;
    if (!counted.some(function (y) { return y.yieldPct > 0; })) return null;
    return counted.reduce(function (s, y) { return s + y.yieldPct; }, 0) / counted.length;
  }

  function assessDivYieldQuality(yearly, dividends) {
    if (!yearly || !yearly.length) return 'none';
    var counted = yearly.filter(function (y) {
      return y.yieldPct != null && isFinite(y.yieldPct);
    });
    if (!dividends || !dividends.length || counted.length < 3) return 'insufficient';
    if (yearly.some(function (y) { return y.unreliable; })) return 'partial';
    if (counted.length < yearly.length) return 'partial';
    return 'ok';
  }

  function finalizeDividendMetrics(dividends, yearly, forecast) {
    var quality = assessDivYieldQuality(yearly, dividends);
    var avg = averageYield5y(yearly);
    if (quality === 'insufficient') avg = null;
    if (dividends && dividends.length) {
      return {
        divAvg5y: avg,
        divYieldQuality: quality,
        divForecast: forecast,
        noMoexDividends: false
      };
    }
    return {
      divAvg5y: null,
      divYieldQuality: 'none',
      divForecast: forecast || {
        amount: 0,
        paid12m: 0,
        upcoming12m: 0,
        source: 'по данным МосБиржи выплат нет'
      },
      noMoexDividends: true
    };
  }

  function formatTurnoverBln(v) {
    if (v == null || !isFinite(Number(v))) return '—';
    return (Number(v) / 1e9).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млрд ₽';
  }

  /** Нужен год в подписи, если период > 1 года или затрагивает несколько календарных лет. */
  function tradeDateSeriesNeedsYear(rows) {
    if (!rows || rows.length < 2) return false;
    var first = String(rows[0].date || rows[0]).slice(0, 10);
    var last = String(rows[rows.length - 1].date || rows[rows.length - 1]).slice(0, 10);
    if (first.length < 10 || last.length < 10) return false;
    if (first.slice(0, 4) !== last.slice(0, 4)) return true;
    var t0 = new Date(first + 'T12:00:00').getTime();
    var t1 = new Date(last + 'T12:00:00').getTime();
    if (isNaN(t0) || isNaN(t1)) return false;
    return (t1 - t0) > 365 * 24 * 60 * 60 * 1000;
  }



  /** Дата торгов: 23.05 или 23.05.2026 */
  function formatTradeDateRu(iso, includeYear) {
    var s = String(iso || '').slice(0, 10);
    if (s.length < 10) return '';
    var dd = s.slice(8, 10);
    var mm = s.slice(5, 7);
    if (includeYear) return dd + '.' + mm + '.' + s.slice(0, 4);
    return dd + '.' + mm;
  }



  function sliceVolumeSeries(dailyHistory, days) {
    var rows = dailyHistory.filter(function (h) { return h.value != null && h.value > 0; });
    var slice = rows.slice(-days);
    var withYear = tradeDateSeriesNeedsYear(slice);
    return slice.map(function (h) {
      var iso = String(h.date || '').slice(0, 10);
      var label = formatTradeDateRu(iso, withYear);
      return {
        t: h.t,
        v: h.value / 1e9,
        date: iso,
        label: label,
        dateLabel: label,
        dateWithYear: withYear
      };
    });
  }

  function buildSecurityAnalytics(ticker) {
    ticker = normalizeTicker(ticker);
    if (!isRuStockForAnalytics(ticker)) {
      return Promise.resolve({
        ticker: ticker,
        eligible: false,
        divAvg5y: null,
        divForecast: null,
        divYieldByYear: [],
        volumeByDay: []
      });
    }
    var cacheKey = 'full.v5.' + ticker;
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
      var forecast = computeDividendForecast12m(dividends);
      var divMetrics = finalizeDividendMetrics(dividends, yearly, forecast);
      var out = {
        ticker: ticker,
        eligible: true,
        name: getTickerSubtitle(ticker),
        quote: quote,
        dividends: dividends,
        divAvg5y: divMetrics.divAvg5y,
        divYieldQuality: divMetrics.divYieldQuality,
        divForecast: divMetrics.divForecast,
        noMoexDividends: divMetrics.noMoexDividends,
        divYieldByYear: yearly,
        monthlyForecast: buildMonthlyDividendForecast12m(dividends, history, quote.price),
        volumeByDay: sliceVolumeSeries(history, VOLUME_YEAR_DAYS),
        divDataSource: dividends.length ? 'moex' : ''
      };
      out.divLatestYield = computeLatestDivYieldPct(out);
      analyticsCacheSet(cacheKey, out, ANALYTICS_TTL);
      return out;
    });
  }

  function applyBondMetricsToWrap(wrapEl, q) {
    if (!wrapEl) return;
    var avgEl = wrapEl.querySelector('[data-div-avg]');
    var turnoverEl = wrapEl.querySelector('[data-turnover]');
    if (!q || q.price == null) {
      if (avgEl) {
        avgEl.textContent = 'нет данных';
        avgEl.className = 'quote-div-val muted';
      }
      if (turnoverEl) {
        turnoverEl.textContent = '—';
        turnoverEl.className = 'quote-div-val muted';
      }
      return;
    }
    if (avgEl) {
      if (q.yieldPct != null && isFinite(q.yieldPct)) {
        var bondHtml = formatBondYieldDisplayHtml(q.yieldPct);
        if (bondHtml) {
          avgEl.innerHTML = bondHtml;
          avgEl.className = 'quote-div-val' + (q.yieldPct > 0 ? ' pnl-pos' : '');
          avgEl.title = 'Доходность к погашению · MOEX ISS';
        } else {
          avgEl.textContent = '—';
          avgEl.className = 'quote-div-val muted';
        }
      } else {
        avgEl.textContent = '—';
        avgEl.className = 'quote-div-val muted';
      }
    }
    if (turnoverEl) {
      turnoverEl.textContent = formatTurnoverBln(q.valueToday);
      turnoverEl.className = turnoverEl.textContent === '—' ? 'quote-div-val muted' : 'quote-div-val';
    }
  }

  function enrichRuBondQuoteCard(wrapEl, ticker) {
    if (typeof fetchMoexQuote !== 'function') {
      applyBondMetricsToWrap(wrapEl, null);
      return Promise.resolve();
    }
    return fetchMoexQuote(ticker).then(function (q) {
      applyBondMetricsToWrap(wrapEl, q);
    }).catch(function () {
      applyBondMetricsToWrap(wrapEl, null);
    });
  }

  function quoteCardDivMetricsHtml(opts) {
    opts = opts || {};
    var compact = !!opts.compact;
    var bond = !!opts.bond;
    var blockCls = 'quote-card-div-block' + (compact ? ' quote-card-div-block--compact' : '');
    var avgLbl = bond ? 'Доходность' : (opts.us ? 'Див. TTM' : (compact ? 'Див. 5л' : 'Див. доходность 5 лет'));
    var turnLbl = compact ? 'Оборот' : 'Оборот за день';
    return (
      '<div class="' + blockCls + '" data-div-block>' +
        '<div class="quote-div-line"><span class="quote-div-lbl">' + avgLbl + '</span><span class="quote-div-val" data-div-avg>…</span></div>' +
        '<div class="quote-div-line"><span class="quote-div-lbl">' + turnLbl + '</span><span class="quote-div-val" data-turnover>…</span></div>' +
      '</div>'
    );
  }

  function quoteCardChartsHtml() {
    return '';
  }

  function applyDivMetricsToWrap(wrapEl, a) {
    if (!wrapEl) return;
    var avgEl = wrapEl.querySelector('[data-div-avg]');
    var turnoverEl = wrapEl.querySelector('[data-turnover]');
    var legacy = wrapEl.querySelector('[data-div-yield]');
    if (legacy) legacy.style.display = 'none';

    if (!a || !a.eligible) {
      if (avgEl) avgEl.textContent = 'нет данных';
      if (turnoverEl) turnoverEl.textContent = '—';
      return;
    }
    if (avgEl) {
      if (a.divDataSource === 'demo') {
        avgEl.textContent = 'данные требуют проверки';
        avgEl.className = 'quote-div-val muted';
      } else {
        setDivAvg5yElement(avgEl, a);
      }
    }
    if (turnoverEl) {
      var v = a.quote && a.quote.valueToday != null ? a.quote.valueToday : null;
      if ((v == null || !isFinite(Number(v))) && a.volumeByDay && a.volumeByDay.length) {
        var last = a.volumeByDay[a.volumeByDay.length - 1];
        if (last && isFinite(Number(last.v))) v = Number(last.v) * 1e9;
      }
      var mk = wrapEl.getAttribute && wrapEl.getAttribute('data-market');
      var isUsWrap = mk === 'US' || (typeof Markets !== 'undefined' && Markets.isUsTicker(
        wrapEl.getAttribute && wrapEl.getAttribute('data-ticker')
      ));
      turnoverEl.textContent = isUsWrap ? formatUsdTurnoverShort(v) : formatTurnoverBln(v);
      if (turnoverEl.textContent === '—') turnoverEl.className = 'quote-div-val muted';
      else turnoverEl.className = 'quote-div-val';
    }
  }

  function drainEnrichQueue() {
    while (enrichActive < ENRICH_CONCURRENCY && enrichQueue.length) {
      var job = enrichQueue.shift();
      if (!job || !job.wrap) continue;
      enrichActive++;
      enrichQuoteCardImmediate(job.wrap, job.ticker, job.market).then(function () {
        enrichActive--;
        drainEnrichQueue();
      }, function () {
        enrichActive--;
        drainEnrichQueue();
      });
    }
  }



  function formatUsdTurnoverShort(value) {
    if (value == null || !isFinite(Number(value))) return '—';
    var v = Number(value);
    if (v >= 1e9) return (v / 1e9).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млрд $';
    if (v >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млн $';
    return v.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' $';
  }



  function enrichUsQuoteCard(wrapEl, ticker) {
    if (typeof Markets === 'undefined' || !Markets.fetchUsQuoteExtended) {
      applyDivMetricsToWrap(wrapEl, { eligible: false });
      return Promise.resolve();
    }
    return Markets.fetchUsQuoteExtended(ticker).then(function (q) {
      if (!q || q.price == null) {
        applyDivMetricsToWrap(wrapEl, { eligible: false });
        return;
      }
      applyDivMetricsToWrap(wrapEl, {
        eligible: true,
        divAvg5y: q.divYieldPct,
        noMoexDividends: q.divYieldPct == null,
        divDataSource: 'yahoo',
        divYieldQuality: q.divYieldPct != null ? 'partial' : 'insufficient',
        quote: { valueToday: q.volume }
      });
      var avgEl = wrapEl.querySelector('[data-div-avg]');
      if (avgEl && q.divYieldPct != null) {
        avgEl.title = 'Trailing 12M · Yahoo Finance (не средняя за 5 лет)';
      }
      var turnoverEl = wrapEl.querySelector('[data-turnover]');
      if (turnoverEl && q.volume != null) {
        turnoverEl.textContent = formatUsdTurnoverShort(q.volume);
        turnoverEl.className = 'quote-div-val';
      }
    }).catch(function () {
      applyDivMetricsToWrap(wrapEl, { eligible: false });
    });
  }



  function queueEnrichQuoteCard(wrapEl, ticker, market) {
    if (!wrapEl || !ticker) return;
    ticker = normalizeTicker(ticker);
    if (isIndexQuoteTicker(ticker)) return;
    var mk = market || (wrapEl.getAttribute && wrapEl.getAttribute('data-market')) || 'RU';
    enrichQueue.push({ wrap: wrapEl, ticker: ticker, market: mk });
    drainEnrichQueue();
  }



  function enrichQuoteCardImmediate(wrapEl, ticker, market) {
    return new Promise(function (resolve) {
      enrichQuoteCard(wrapEl, ticker);
      var mk = market || (wrapEl.getAttribute && wrapEl.getAttribute('data-market')) || 'RU';
      if (mk === 'US' || (typeof Markets !== 'undefined' && Markets.isUsTicker(ticker))) {
        enrichUsQuoteCard(wrapEl, ticker).then(resolve, resolve);
        return;
      }
      if (isRuBondTicker(ticker)) {
        enrichRuBondQuoteCard(wrapEl, ticker).then(resolve, resolve);
        return;
      }
      if (!isRuStockForAnalytics(ticker)) {
        resolve();
        return;
      }
      buildSecurityAnalytics(ticker).then(function (a) {
        applyDivMetricsToWrap(wrapEl, a);
        resolve();
      }).catch(function () {
        applyDivMetricsToWrap(wrapEl, { eligible: false });
        resolve();
      });
    });
  }



  function enrichQuoteCard(wrapEl, ticker) {
    if (!wrapEl || !ticker) return;
    ticker = normalizeTicker(ticker);
    var btn = wrapEl.querySelector('.market-tile, .quote-card');
    if (!btn) return;

    if (isIndexQuoteTicker(ticker)) {
      var idxBlock = wrapEl.querySelector('[data-div-block]');
      if (idxBlock) idxBlock.remove();
      wrapEl.querySelectorAll('.quote-card-charts').forEach(function (el) { el.remove(); });
      return;
    }

    var isBond = isRuBondTicker(ticker);
    var block = wrapEl.querySelector('[data-div-block]');
    if (!block) {
      var metrics = wrapEl.querySelector('.quote-card-metrics, .market-tile-metrics');
      var host = metrics || btn;
      if (host) {
        var tmp = document.createElement('div');
        tmp.innerHTML = quoteCardDivMetricsHtml({ bond: isBond });
        host.appendChild(tmp.firstChild);
      }
    } else if (isBond) {
      var lbl = block.querySelector('.quote-div-lbl');
      if (lbl) lbl.textContent = 'Доходность';
    }

    wrapEl.querySelectorAll('.quote-card-charts').forEach(function (el) { el.remove(); });

    if (isBond) {
      applyBondMetricsToWrap(wrapEl, null);
      return;
    }

    if (!isRuStockForAnalytics(ticker)) {
      applyDivMetricsToWrap(wrapEl, { eligible: false });
      return;
    }
    applyDivMetricsToWrap(wrapEl, { eligible: true, divAvg5y: null, divForecast: { amount: null } });
  }

  function getWatchlistTickersForAnalytics() {
    var list = typeof Markets !== 'undefined' ? Markets.getNormalizedWatchlist() : getWatchlist().map(function (t) {
      return { ticker: normalizeTicker(t), market: 'RU' };
    });
    var markets = typeof Markets !== 'undefined' ? Markets.getMarketsEnabled() : { ru: true, us: false };
    var tickers = [];
    list.forEach(function (item) {
      var t = typeof item === 'string' ? normalizeTicker(item) : normalizeTicker(item.ticker);
      if (!t || tickers.indexOf(t) >= 0) return;
      var mk = item.market === 'US' ? 'US' : 'RU';
      if (mk === 'US' && !markets.us) return;
      if (mk === 'RU' && !markets.ru) return;
      tickers.push(t);
    });
    return tickers;
  }

  function renderAnalyticsGrid() {
    var grid = document.getElementById('analyticsGrid');
    if (!grid) return;
    var tickers = getWatchlistTickersForAnalytics();

    enrichQueue = [];
    enrichActive = 0;

    if (!tickers.length) {
      grid.innerHTML = '<p class="muted analytics-grid-empty">Добавьте бумаги в список наблюдения — появятся дивидендная доходность и прогноз выплат.</p>';
      return;
    }

    grid.innerHTML = tickers.map(function (ticker) {
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
            '</div>' +
            quoteCardDivMetricsHtml({ bond: isRuBondTicker(ticker) }) +
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
      queueEnrichQuoteCard(wrap, ticker);
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
        if (state.analyticsTicker === t) {
          state.analyticsTicker = '';
          var sec = document.getElementById('analyticsDetailSection');
          if (sec) sec.hidden = true;
        }
      });
    });

    grid.querySelectorAll('.quote-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var t = card.getAttribute('data-ticker');
        if (t) selectAnalyticsTicker(t);
      });
    });
  }

  function selectAnalyticsTicker(ticker) {
    ticker = normalizeTicker(ticker);
    state.analyticsTicker = ticker;
    if (state.tab !== 'watchlist' && typeof switchTab === 'function') {
      switchTab('watchlist');
    }
    document.querySelectorAll('#analyticsGrid .quote-card-wrap').forEach(function (w) {
      w.classList.toggle('analytics-selected', w.getAttribute('data-ticker') === ticker);
    });
    if (typeof renderAnalyticsDetail === 'function') renderAnalyticsDetail(ticker);
    var sec = document.getElementById('analyticsDetailSection');
    if (sec) {
      sec.hidden = false;
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderAnalyticsPage() {
    if (typeof Markets !== 'undefined' && Markets.renderBriefingMarketTabs) {
      Markets.renderBriefingMarketTabs('analyticsMarketTabs');
    }
    var imoexBox = document.getElementById('moexIndexBox');
    if (imoexBox && typeof shouldShowRuBriefingMarketBlocks === 'function') {
      imoexBox.hidden = !shouldShowRuBriefingMarketBlocks();
    }
    if (typeof renderMoexIndexBox === 'function') renderMoexIndexBox();
    renderAnalyticsGrid();
    if (typeof renderOfzSection === 'function') renderOfzSection();
    if (state.analyticsTicker) selectAnalyticsTicker(state.analyticsTicker);
  }

  function openSecurityAnalyticsModal(ticker) {
    selectAnalyticsTicker(ticker);
  }

  function fetchPortfolioDivForecastHtml(ticker, qty) {
    ticker = normalizeTicker(ticker);
    if (!isRuStockForAnalytics(ticker)) {
      return Promise.resolve('<span class="muted">н/д</span>');
    }
    return buildSecurityAnalytics(ticker).then(function (a) {
      return formatPortfolioDivCell(a.divForecast, qty);
    }).catch(function () {
      return '<span class="muted">—</span>';
    });
  }

  window.isIndexQuoteTicker = isIndexQuoteTicker;
  window.isRuStockForAnalytics = isRuStockForAnalytics;
  window.isRuBondTicker = isRuBondTicker;
  window.formatDivYieldPct = formatDivYieldPct;
  window.formatDivAvg5yDisplayHtml = formatDivAvg5yDisplayHtml;
  window.computeLatestDivYieldPct = computeLatestDivYieldPct;
  window.formatDivRubPerShare = formatDivRubPerShare;
  window.buildSecurityAnalytics = buildSecurityAnalytics;
  window.enrichQuoteCard = enrichQuoteCard;
  window.renderAnalyticsGrid = renderAnalyticsGrid;
  window.renderAnalyticsPage = renderAnalyticsPage;
  window.selectAnalyticsTicker = selectAnalyticsTicker;
  window.openSecurityAnalyticsModal = openSecurityAnalyticsModal;
  window.quoteCardChartsHtml = quoteCardChartsHtml;
  window.queueEnrichQuoteCard = queueEnrichQuoteCard;
  window.fetchPortfolioDivForecastHtml = fetchPortfolioDivForecastHtml;
  window.computeDividendForecast12m = computeDividendForecast12m;
  window.buildMonthlyDividendForecast12m = buildMonthlyDividendForecast12m;
  window.buildPassiveIncome5y = buildPassiveIncome5y;
  window.formatDivMonthScheduleHtml = formatDivMonthScheduleHtml;
  window.formatDividendChartInfoHtml = formatDividendChartInfoHtml;
  window.formatTradeDateRu = formatTradeDateRu;
  window.tradeDateSeriesNeedsYear = tradeDateSeriesNeedsYear;
})();
