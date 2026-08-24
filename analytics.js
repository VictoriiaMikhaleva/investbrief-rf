/* analytics.js — дивиденды, оборот, карточки и вкладка аналитики */
(function () {
  'use strict';

  var ANALYTICS_CACHE_PREFIX = 'ibrf.analytics.v17.';
  var DIV_YIELD_MAX_SANE_PCT = 35;
  var DIV_PRICE_SCALE_BREAK_RATIO = 5;
  var ANALYTICS_TTL = 30 * 60 * 1000;
  var HISTORY_PAGE_LIMIT = 500;
  var VOLUME_YEAR_DAYS = 252;
  var YIELD_YEARS = 5;
  /** TQTF — история БПИФ до перевода на TQBR; TQBR перекрывает свежие даты. */
  var SHARE_HISTORY_BOARDS = ['TQTF', 'TQBR'];
  var ENRICH_CONCURRENCY = 4;
  var ANALYTICS_API_TIMEOUT_MS = 6000;
  var enrichQueue = [];
  var enrichActive = 0;
  var C = typeof AnalyticsCore !== 'undefined' ? AnalyticsCore : null;

  function requireAnalyticsCore() {
    if (!C) throw new Error('[InvestBrief] analytics-core.js не загружен');
    return C;
  }

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

  function analyticsCacheRemove(key) {
    try {
      localStorage.removeItem(ANALYTICS_CACHE_PREFIX + key);
    } catch (e) { /* */ }
  }

  function invalidateAnalyticsTickerCache(ticker) {
    ticker = normalizeTicker(ticker);
    analyticsCacheRemove('full.v15.' + ticker);
    analyticsCacheRemove('hist.v13.' + ticker + '.' + YIELD_YEARS);
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

  /** Месяц.год последней выплаты, напр. 07.2024 */
  function formatDivPaymentMonthYear(iso) {
    var s = String(iso || '').slice(0, 10);
    if (s.length < 10) return '';
    return s.slice(5, 7) + '.' + s.slice(0, 4);
  }

  function getLastDividendPayment(dividends) {
    var last = null;
    (dividends || []).forEach(function (d) {
      if (!d.date || !isFinite(d.value) || d.value <= 0) return;
      if (!last || d.date > last.date) last = { date: String(d.date).slice(0, 10), value: d.value };
    });
    return last;
  }

  /** HTML: «12,50 ₽ · 07.2024 MOEX» — последняя выплата, если нет средней за 5 лет. */
  function formatDivLastPaymentDisplayHtml(a) {
    if (!a || a.divDataSource === 'demo') return null;
    var pay = getLastDividendPayment(a.dividends || []);
    if (!pay) return null;
    var monthYear = formatDivPaymentMonthYear(pay.date);
    if (!monthYear) return null;
    return escapeHtml(formatDividendRubShort(pay.value) + ' ₽ · ' + monthYear) +
      ' ' + formatDivYieldSourceBadge('moex');
  }

  /** Текст вместо «нет данных»: «без дивидендов». null — ещё грузится. */
  function formatDivAvg5yFallbackText(a) {
    if (!a) return '—';
    if (a.divDataSource === 'demo') return 'данные требуют проверки';
    if (a.dividends === undefined && a.noMoexDividends !== true && a.divYieldQuality == null) return null;
    if (getLastDividendPayment(a.dividends || [])) return null;
    if (a.noMoexDividends || a.divYieldQuality === 'none') return 'без дивидендов';
    return 'без дивидендов';
  }

  function setDivAvg5yElement(avgEl, a) {
    if (!avgEl) return;
    var html = formatDivAvg5yDisplayHtml(a);
    if (html) {
      avgEl.innerHTML = html;
      avgEl.className = 'quote-div-val' + (a.divAvg5y > 0 ? ' pnl-pos' : '');
      avgEl.title = a.divYieldQuality === 'partial'
        ? 'Частичные данные MOEX (сплит, неполная история или аномалия)'
        : 'Средняя див. доходность за 5 завершённых лет · MOEX ISS';
      return;
    }
    var lastPayHtml = formatDivLastPaymentDisplayHtml(a);
    if (lastPayHtml) {
      avgEl.innerHTML = lastPayHtml;
      avgEl.className = 'quote-div-val';
      avgEl.title = 'Последняя выплата · средняя за 5 лет недоступна';
      return;
    }
    var fallback = formatDivAvg5yFallbackText(a);
    if (fallback === null) {
      avgEl.textContent = '…';
      avgEl.className = 'quote-div-val muted';
      avgEl.title = '';
      return;
    }
    avgEl.textContent = fallback;
    avgEl.className = fallback === 'без дивидендов' ? 'quote-div-val quote-div-val--nodivs' : 'quote-div-val muted';
    if (fallback === 'без дивидендов') {
      avgEl.title = a && a.divDataSource === 'yahoo'
        ? 'По данным Yahoo дивидендная доходность TTM не определена'
        : 'По данным MOEX дивидендных выплат нет';
    } else {
      avgEl.title = '';
    }
  }

  /** Последняя (самая свежая) дивидендная доходность по бумаге. */
  function computeLatestDivYieldPct(a) {
    if (!a) return null;
    var yearly = a.divYieldByYear || [];
    var quotePrice = a.quote && a.quote.price;
    var i;
    for (i = yearly.length - 1; i >= 0; i--) {
      var y = yearly[i];
      if (y.open || (y.expectedDiv > 0 && !(y.actualDiv > 0))) continue;
      if (y.yieldPct != null && isFinite(y.yieldPct) && y.yieldPct > 0) return y.yieldPct;
    }
    if (a.divForecast && a.divForecast.amount != null && isFinite(a.divForecast.amount) &&
        a.divForecast.amount > 0 &&
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

  function sumDividendsInReportingYear(dividends, reportingYear) {
    return requireAnalyticsCore().sumDividendsInReportingYear(dividends, reportingYear);
  }

  function getLastDividendPaymentDate(dividends) {
    return requireAnalyticsCore().getLastDividendPaymentDate(dividends);
  }

  function monthsSinceIsoDate(isoDate) {
    return requireAnalyticsCore().monthsSinceIsoDate(isoDate);
  }

  function computeDividendForecast12m(dividends) {
    return requireAnalyticsCore().computeDividendForecast12m(dividends);
  }

  function monthKeyFromDate(d) {
    return requireAnalyticsCore().monthKeyFromDate(d);
  }

  function formatMonthLabel(year, monthIndex) {
    return requireAnalyticsCore().formatMonthLabel(year, monthIndex);
  }

  function avgCloseInMonth(history, year, monthOneBased) {
    return requireAnalyticsCore().avgCloseInMonth(history, year, monthOneBased);
  }

  function buildMonthlyDividendForecast12m(dividends, history, quotePrice) {
    return requireAnalyticsCore().buildMonthlyDividendForecast12m(dividends, history, quotePrice);
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



  function formatDividendPaymentMonthsLine(dividends, reportingYear, yearRow) {
    if (yearRow && yearRow.items && yearRow.items.length) {
      return yearRow.items.map(function (d) {
        var iso = String(d.date).slice(0, 10);
        var dateRu = iso.length === 10
          ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4)
          : monthNameFromDate(d.date);
        var mark = d.estimated ? ' (ожид.)' : '';
        return dateRu + ' · ' + formatDividendRubShort(d.value) + ' ₽' + mark;
      }).join('; ');
    }
    var y = String(reportingYear);
    var items = (dividends || []).filter(function (d) {
      return d.date && dividendReportingYear(d.date) === y;
    }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (!items.length) return '';
    return items.map(function (d) {
      var iso = String(d.date).slice(0, 10);
      var dateRu = iso.length === 10
        ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4)
        : monthNameFromDate(d.date);
      return dateRu + ' · ' + formatDividendRubShort(d.value) + ' ₽';
    }).join('; ');
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
    html.push('<div class="div-info-title">Выплаты по датам отсечки</div>');
    yearly.forEach(function (y) {
      var sum = y.totalDiv > 0
        ? formatDividendRubShort(y.totalDiv) + ' ₽/акц.'
        : (a.noMoexDividends ? '0 ₽/акц.' : '—');
      var yld = y.yieldPct != null && isFinite(y.yieldPct) ? formatDivYieldPct(y.yieldPct) : '';
      var months = formatDividendPaymentMonthsLine(a.dividends, y.year, y);
      var yearLbl = String(y.year);
      var detail;
      if (months) {
        detail = '<div class="div-info-months"><span class="div-info-months-lbl">Даты отсечек:</span> ' +
          escapeHtml(months) + '</div>';
      } else if (y.year === new Date().getFullYear()) {
        detail = '<div class="div-info-months muted">В этом календарном году выплат по отсечке пока нет</div>';
      } else {
        detail = '<div class="div-info-months muted">В этом календарном году выплат нет</div>';
      }
      html.push(
        '<div class="div-info-year">' +
          '<div class="div-info-year-head">' +
            '<span class="div-info-year-lbl">' + escapeHtml(yearLbl) + '</span>' +
            '<span class="div-info-year-val">' + escapeHtml(sum) +
              (yld ? ' <span class="div-info-yield">(' + escapeHtml(yld) + ')</span>' : '') +
            '</span>' +
          '</div>' +
          detail +
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
    html.push('<p class="div-info-hint">Столбцы и список — фактические выплаты по календарным датам отсечки (MOEX ISS; при запаздывании ISS — дополнение из Smart-Lab/раскрытия). Ожидаемые даты — в календаре на 12 месяцев. Средняя доходность 5 лет считается по завершённым отчётным годам ' +
      winYears[0] + '–' + winYears[winYears.length - 1] + ' (янв–сен → прошлый отчётный год, окт–дек → текущий).</p>');
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
      ? 'история 12 мес. ' + formatPortfolioRubTotal(forecast.paid12m, q)
      : '';
    var upcoming = forecast.upcoming12m != null && isFinite(forecast.upcoming12m)
      ? 'прогноз ' + formatPortfolioRubTotal(forecast.upcoming12m, q)
      : (forecast.amount != null && isFinite(forecast.amount)
        ? 'прогноз ' + formatPortfolioRubTotal(forecast.amount, q)
        : '');
    var lines = ['<span class="pf-div-forecast">' + escapeHtml(perShare) + '</span>'];
    if (paid || upcoming) {
      lines.push('<span class="pf-div-sub muted">' + escapeHtml([paid, upcoming].filter(Boolean).join(' · ')) + '</span>');
    }
    if (total != null) {
      lines.push('<span class="pf-div-sub muted">на позицию ~' + escapeHtml(formatPortfolioRubTotal(total, null)) + '</span>');
    }
    return lines.join('');
  }

  function formatPortfolioRubTotal(perUnitOrTotal, qty) {
    var val = perUnitOrTotal;
    if (qty != null && isFinite(Number(qty)) && Number(qty) > 0) {
      val = perUnitOrTotal * Number(qty);
    }
    if (val == null || !isFinite(val)) return '—';
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  }

  function formatPortfolioBondIncomeCell(bond, qty) {
    if (!bond || bond.error) return '<span class="muted">—</span>';
    var sums = typeof computeBondCoupons12m === 'function'
      ? computeBondCoupons12m(bond.coupons, qty, bond.faceValue || 1000)
      : null;
    if (!sums) return '<span class="muted">—</span>';
    var q = isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : null;
    var perBond = q != null && q > 0 ? sums.upcoming12m / q : sums.amount;
    var lines = [];
    if (perBond != null && isFinite(perBond) && perBond > 0) {
      lines.push('<span class="pf-div-forecast">' + escapeHtml(perBond.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽/шт.') + '</span>');
    } else {
      lines.push('<span class="pf-div-forecast muted">—</span>');
    }
    var paid = sums.paid12m != null && isFinite(sums.paid12m) && sums.paid12m > 0
      ? 'история 12 мес. ' + formatPortfolioRubTotal(sums.paid12m, null)
      : '';
    var upcoming = sums.upcoming12m != null && isFinite(sums.upcoming12m) && sums.upcoming12m > 0
      ? 'прогноз ' + formatPortfolioRubTotal(sums.upcoming12m, null)
      : '';
    if (paid || upcoming) {
      lines.push('<span class="pf-div-sub muted">' + escapeHtml([paid, upcoming].filter(Boolean).join(' · ')) + '</span>');
    }
    if (q != null && sums.upcoming12m > 0) {
      lines.push('<span class="pf-div-sub muted">на позицию ~' + escapeHtml(formatPortfolioRubTotal(sums.upcoming12m, null)) + '</span>');
    }
    return lines.join('');
  }

  function fetchPortfolioIncomeCell(ticker, qty) {
    ticker = normalizeTicker(ticker);
    if (typeof isRuBondTicker === 'function' && isRuBondTicker(ticker)) {
      if (typeof fetchOfzBondSnapshot !== 'function') {
        return Promise.resolve('<span class="muted">—</span>');
      }
      return fetchOfzBondSnapshot({ ticker: ticker }).then(function (bond) {
        return formatPortfolioBondIncomeCell(bond, qty);
      }).catch(function () {
        return '<span class="muted">—</span>';
      });
    }
    if (!isRuStockForAnalytics(ticker)) {
      return Promise.resolve('<span class="muted">н/д</span>');
    }
    return buildSecurityAnalytics(ticker).then(function (a) {
      return formatPortfolioDivCell(a.divForecast, qty);
    }).catch(function () {
      return '<span class="muted">—</span>';
    });
  }

  var _dividendPatchesCache = null;
  var _dividendPatchesInflight = null;

  function loadDividendPatches() {
    if (_dividendPatchesCache) return Promise.resolve(_dividendPatchesCache);
    if (_dividendPatchesInflight) return _dividendPatchesInflight;
    var url = 'data/dividend-patches.json';
    try {
      if (typeof window !== 'undefined' && window.IBRF_ASSET_VERSION) {
        url += '?v=' + encodeURIComponent(window.IBRF_ASSET_VERSION);
      }
    } catch (e) { /* */ }
    _dividendPatchesInflight = fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('patches http');
      return r.json();
    }).then(function (json) {
      _dividendPatchesCache = json && typeof json === 'object' ? json : { byTicker: {} };
      _dividendPatchesInflight = null;
      return _dividendPatchesCache;
    }).catch(function () {
      _dividendPatchesCache = { byTicker: {} };
      _dividendPatchesInflight = null;
      return _dividendPatchesCache;
    });
    return _dividendPatchesInflight;
  }

  function fetchMoexDividends(ticker) {
    ticker = normalizeTicker(ticker);
    var url = MOEX_ISS + '/securities/' + encodeURIComponent(ticker) + '/dividends.json?iss.meta=off';
    return Promise.all([
      moexFetchJson(url).then(function (json) {
        var block = json.dividends;
        if (!block || !block.data || !block.data.length) return [];
        var cols = block.columns;
        var iDate = cols.indexOf('registryclosedate');
        var iVal = cols.indexOf('value');
        return block.data.map(function (row) {
          return {
            date: String(row[iDate] || '').slice(0, 10),
            value: Number(row[iVal])
          };
        }).filter(function (d) { return d.date && isFinite(d.value) && d.value > 0; });
      }).catch(function () { return []; }),
      loadDividendPatches()
    ]).then(function (parts) {
      var patchRows = parts[1] && parts[1].byTicker && parts[1].byTicker[ticker]
        ? parts[1].byTicker[ticker]
        : [];
      return requireAnalyticsCore().mergeDividendPatches(parts[0], patchRows);
    });
  }

  function normalizeMoexDividends(dividends) {
    return requireAnalyticsCore().normalizeMoexDividends(dividends);
  }

  function moexHistoryLastTradeDate(rows) {
    return requireAnalyticsCore().moexHistoryLastTradeDate(rows);
  }

  function isMoexHistoryCacheStale(rows) {
    var todayMsk = typeof moexFormatDateMsk === 'function'
      ? moexFormatDateMsk(new Date())
      : new Date().toISOString().slice(0, 10);
    return requireAnalyticsCore().isMoexHistoryCacheStale(rows, todayMsk);
  }

  function isAnalyticsFullCacheStale(cached) {
    var todayMsk = typeof moexFormatDateMsk === 'function'
      ? moexFormatDateMsk(new Date())
      : new Date().toISOString().slice(0, 10);
    return requireAnalyticsCore().isAnalyticsFullCacheStale(cached, todayMsk);
  }

  function isoNextDay(iso) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + 1);
    return typeof moexFormatDateMsk === 'function' ? moexFormatDateMsk(d) : d.toISOString().slice(0, 10);
  }

  function mergeHistoryByDate(base, extra) {
    var byDate = {};
    (base || []).forEach(function (r) { byDate[r.date] = r; });
    (extra || []).forEach(function (r) { byDate[r.date] = r; });
    return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
  }

  function fetchMoexShareHistoryRange(ticker, fromStr, tillStr, board) {
    ticker = normalizeTicker(ticker);
    board = board || 'TQBR';
    var baseUrl = MOEX_ISS + '/history/engines/stock/markets/shares/boards/' + board + '/securities/' +
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
      return mergeHistoryByDate([], rows);
    });
  }

  function backfillHistoryVolumeTail(history, ticker, tillStr) {
    var core = requireAnalyticsCore();
    if (!history || !history.length || !core.isHistoryVolumeBehindQuotes(history)) {
      return Promise.resolve(history);
    }
    var lastVol = core.moexHistoryLastVolumeDate(history);
    if (!lastVol) return Promise.resolve(history);
    return fetchMoexShareHistoryRange(ticker, isoNextDay(lastVol), tillStr).then(function (tail) {
      if (!tail.length) return history;
      return mergeHistoryByDate(history, tail);
    });
  }

  function fetchMoexShareHistoryDaily(ticker, yearsBack) {
    ticker = normalizeTicker(ticker);
    yearsBack = yearsBack || YIELD_YEARS;
    var cacheKey = 'hist.v13.' + ticker + '.' + yearsBack;
    var cached = analyticsCacheGet(cacheKey);
    if (cached && !isMoexHistoryCacheStale(cached)) return Promise.resolve(cached);

    var till = new Date();
    var windowYears = requireAnalyticsCore().getYieldWindowYears();
    var fromYear = windowYears[0] - 1;
    var from = new Date(fromYear, 0, 1);
    var fromStr = typeof moexFormatDateMsk === 'function' ? moexFormatDateMsk(from) : moexFormatDate(from);
    var tillStr = typeof moexFormatDateMsk === 'function' ? moexFormatDateMsk(till) : moexFormatDate(till);

    var chain = Promise.resolve([]);
    SHARE_HISTORY_BOARDS.forEach(function (board) {
      chain = chain.then(function (merged) {
        return fetchMoexShareHistoryRange(ticker, fromStr, tillStr, board).then(function (rows) {
          return mergeHistoryByDate(merged, rows);
        });
      });
    });

    return chain.then(function (out) {
      return backfillHistoryVolumeTail(out, ticker, tillStr);
    }).then(function (out) {
      analyticsCacheSet(cacheKey, out, 6 * 60 * 60 * 1000);
      return out;
    });
  }

  function dividendReportingYear(paymentDateIso) {
    return requireAnalyticsCore().dividendReportingYear(paymentDateIso);
  }

  function getYieldWindowYears() {
    return requireAnalyticsCore().getYieldWindowYears();
  }

  function computeYearlyDividendYields(dividends, dailyHistory, windowYears) {
    return requireAnalyticsCore().computeYearlyDividendYields(dividends, dailyHistory, windowYears);
  }

  function averageYield5y(yearly) {
    return requireAnalyticsCore().averageYield5y(yearly);
  }

  function assessDivYieldQuality(yearly, dividends) {
    return requireAnalyticsCore().assessDivYieldQuality(yearly, dividends);
  }

  function finalizeDividendMetrics(dividends, yearly, forecast) {
    return requireAnalyticsCore().finalizeDividendMetrics(dividends, yearly, forecast);
  }

  function formatTurnoverBln(v) {
    if (v == null || !isFinite(Number(v))) return '—';
    return (Number(v) / 1e9).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' млрд ₽';
  }

  function resolveQuoteTradeDate(source) {
    if (!source) return '';
    if (source.quote && source.quote.tradeDate) return String(source.quote.tradeDate).slice(0, 10);
    if (source.tradeDate) return String(source.tradeDate).slice(0, 10);
    if (source.dataAsOf) return String(source.dataAsOf).slice(0, 10);
    if (source.volumeByDay && source.volumeByDay.length) {
      var last = source.volumeByDay[source.volumeByDay.length - 1];
      if (last && last.date) return String(last.date).slice(0, 10);
    }
    return '';
  }

  function quoteCardTurnoverLabel(opts) {
    opts = opts || {};
    var ticker = opts.ticker || '';
    var tradeDate = opts.tradeDate ? String(opts.tradeDate).slice(0, 10) : '';
    var compact = !!opts.compact;
    var bond = !!opts.bond;
    var us = !!opts.us || (typeof Markets !== 'undefined' && ticker && Markets.isUsTicker(ticker));
    var isIndex = typeof isIndexQuoteTicker === 'function' && ticker && isIndexQuoteTicker(ticker);

    if (isIndex) return compact ? 'Оборот' : 'Оборот торгов';
    if (us) return compact ? 'Оборот' : 'Оборот за сессию';
    if (tradeDate.length >= 10) {
      var ddmm = tradeDate.slice(8, 10) + '.' + tradeDate.slice(5, 7);
      return compact ? 'Оборот · ' + ddmm : 'Оборот торгов · ' + ddmm;
    }
    return compact ? 'Оборот' : 'Оборот торгов за текущий день';
  }

  function setQuoteCardTurnoverLabel(wrapEl, opts) {
    if (!wrapEl) return;
    var lblEl = wrapEl.querySelector('[data-turnover-lbl]');
    if (!lblEl) return;
    opts = opts || {};
    var ticker = opts.ticker || (wrapEl.getAttribute && wrapEl.getAttribute('data-ticker')) || '';
    var mk = opts.market || (wrapEl.getAttribute && wrapEl.getAttribute('data-market'));
    var block = wrapEl.querySelector('[data-div-block]');
    lblEl.textContent = quoteCardTurnoverLabel({
      ticker: ticker,
      tradeDate: opts.tradeDate,
      compact: opts.compact != null ? opts.compact : !!(block && block.classList.contains('quote-card-div-block--compact')),
      bond: opts.bond,
      us: mk === 'US' || opts.us
    });
  }

  function tradeDateSeriesNeedsYear(rows) {
    return requireAnalyticsCore().tradeDateSeriesNeedsYear(rows);
  }

  function formatTradeDateRu(iso, includeYear) {
    return requireAnalyticsCore().formatTradeDateRu(iso, includeYear);
  }

  function sliceVolumeSeries(dailyHistory, days) {
    return requireAnalyticsCore().sliceVolumeSeries(dailyHistory, days);
  }

  function formatVolumeFreshnessNote(analytics) {
    return requireAnalyticsCore().formatVolumeFreshnessNote(analytics);
  }

  function buildSecurityAnalyticsLocal(ticker, cacheKey) {
    return Promise.all([
      fetchMoexDividends(ticker),
      fetchMoexShareHistoryDaily(ticker, YIELD_YEARS),
      fetchMoexQuote(ticker)
    ]).then(function (results) {
      var dividends = results[0];
      var history = results[1];
      var quote = results[2] || {};
      var metrics = requireAnalyticsCore().buildMetricsFromMoex(dividends, history, quote.price);
      var out = {
        ticker: ticker,
        eligible: true,
        name: getTickerSubtitle(ticker),
        quote: quote,
        dividends: metrics.dividends,
        divAvg5y: metrics.divAvg5y,
        divYieldQuality: metrics.divYieldQuality,
        divForecast: metrics.divForecast,
        noMoexDividends: metrics.noMoexDividends,
        totalReturn12m: metrics.totalReturn12m,
        divYieldByYear: metrics.divYieldByYear,
        monthlyForecast: metrics.monthlyForecast,
        volumeByDay: metrics.volumeByDay,
        dataAsOf: metrics.dataAsOf,
        volumeStale: metrics.volumeStale,
        divDataSource: metrics.dividends.length ? 'moex' : '',
        source: 'client'
      };
      out.divLatestYield = computeLatestDivYieldPct(out);
      analyticsCacheSet(cacheKey, out, ANALYTICS_TTL);
      return out;
    });
  }

  function getAnalyticsApiBase() {
    if (typeof window.INVESTBRIEF_ANALYTICS_API === 'string' && window.INVESTBRIEF_ANALYTICS_API.trim()) {
      return window.INVESTBRIEF_ANALYTICS_API.trim().replace(/\/$/, '');
    }
    return '/api/analytics';
  }

  function shouldUseServerAnalytics() {
    if (window.INVESTBRIEF_USE_SERVER_ANALYTICS === false) return false;
    if (window.INVESTBRIEF_USE_SERVER_ANALYTICS === true) return true;
    try {
      var host = String(location.hostname || '').toLowerCase();
      if (host.endsWith('github.io') || host.endsWith('githubpages.io')) return false;
    } catch (e) { /* */ }
    return true;
  }

  function fetchWithTimeout(url, opts, timeoutMs) {
    opts = opts || {};
    timeoutMs = timeoutMs || ANALYTICS_API_TIMEOUT_MS;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
    var fetchOpts = {
      credentials: opts.credentials != null ? opts.credentials : 'omit',
      cache: opts.cache != null ? opts.cache : 'no-store'
    };
    if (ctrl) fetchOpts.signal = ctrl.signal;
    return fetch(url, fetchOpts).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function fetchSecurityAnalyticsFromApi(ticker, forceRefresh) {
    var base = getAnalyticsApiBase();
    var isCloudFn = base.indexOf('cloudfunctions.net') >= 0;
    var url = isCloudFn
      ? base + '?ticker=' + encodeURIComponent(ticker)
      : base + '/' + encodeURIComponent(ticker);
    if (forceRefresh) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'refresh=1';
    return fetchWithTimeout(url, null, ANALYTICS_API_TIMEOUT_MS).then(function (res) {
      if (!res.ok) throw new Error('analytics_api_' + res.status);
      return res.json();
    }).then(function (data) {
      if (data && data.error) throw new Error(data.error);
      return data;
    });
  }

  function enrichServerAnalytics(api, ticker) {
    var out = api;
    out.ticker = ticker;
    out.name = out.name || getTickerSubtitle(ticker);
    out.eligible = out.eligible !== false;

    function finish() {
      out.divLatestYield = computeLatestDivYieldPct(out);
      return out;
    }

    function mergeQuote(q) {
      if (q && q.tradeDate) {
        out.quote = Object.assign({}, out.quote || {}, { tradeDate: q.tradeDate });
      }
      if ((!out.quote || out.quote.price == null) && q) out.quote = q;
      return finish();
    }

    if (!out.quote || out.quote.price == null) {
      return fetchMoexQuote(ticker).then(function (q) {
        return mergeQuote(q || null);
      });
    }
    if (!out.quote.tradeDate) {
      return fetchMoexQuote(ticker).then(function (q) {
        return mergeQuote(q || null);
      }).catch(function () {
        return finish();
      });
    }
    return Promise.resolve(finish());
  }

  function buildSecurityAnalytics(ticker, opts) {
    opts = opts || {};
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
    var cacheKey = 'full.v15.' + ticker;
    var cached = analyticsCacheGet(cacheKey);
    if (cached && !isAnalyticsFullCacheStale(cached) && !opts.forceRefresh) return Promise.resolve(cached);

    var useServer = shouldUseServerAnalytics();
    if (useServer) {
      return fetchSecurityAnalyticsFromApi(ticker, opts.forceRefresh).then(function (api) {
        var core = requireAnalyticsCore();
        if (api && api.coreVersion && api.coreVersion !== core.VERSION) {
          return buildSecurityAnalyticsLocal(ticker, cacheKey);
        }
        return enrichServerAnalytics(api, ticker).then(function (out) {
          analyticsCacheSet(cacheKey, out, ANALYTICS_TTL);
          return out;
        });
      }).catch(function () {
        return buildSecurityAnalyticsLocal(ticker, cacheKey);
      });
    }
    return buildSecurityAnalyticsLocal(ticker, cacheKey);
  }

  /** Spot-check GAZP/SBER — серверный API или локальный MOEX. */
  function runAnalyticsSpotCheck(forceRefresh) {
    var base = getAnalyticsApiBase();
    var spotUrl = base.indexOf('cloudfunctions.net') >= 0
      ? base + '?spot=1'
      : base.replace(/\/$/, '') + '/spot-check';
    if (forceRefresh && spotUrl.indexOf('?') >= 0) spotUrl += '&refresh=1';

    function runLocalSpotCheck() {
      var tickers = ['GAZP', 'SBER'];
      if (forceRefresh) {
        tickers.forEach(function (t) { invalidateAnalyticsTickerCache(t); });
      }
      return Promise.all(tickers.map(function (ticker) {
        return Promise.all([
          fetchMoexDividends(ticker),
          fetchMoexShareHistoryDaily(ticker, YIELD_YEARS)
        ]).then(function (res) {
          var metrics = requireAnalyticsCore().buildMetricsFromMoex(res[0], res[1], null);
          var errors = requireAnalyticsCore().validateSpotCheck(ticker, metrics);
          return { ticker: ticker, ok: !errors.length, errors: errors, metrics: metrics };
        }).catch(function (err) {
          return {
            ticker: ticker,
            ok: false,
            errors: [ticker + ': ' + (err && err.message ? err.message : 'fetch_error')],
            metrics: null
          };
        });
      })).then(function (results) {
        var allErrors = [];
        results.forEach(function (r) {
          if (r.errors && r.errors.length) allErrors = allErrors.concat(r.errors);
        });
        return { ok: !allErrors.length, results: results, errors: allErrors, checkedAt: Date.now() };
      });
    }

    if (window.INVESTBRIEF_USE_SERVER_ANALYTICS === false) {
      return runLocalSpotCheck();
    }

    return fetch(spotUrl, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('spot_api_' + res.status);
      return res.json();
    }).catch(function () {
      return runLocalSpotCheck();
    });
  }

  function applyBondMetricsToWrap(wrapEl, q) {
    if (!wrapEl) return;
    var avgEl = wrapEl.querySelector('[data-div-avg]');
    var turnoverEl = wrapEl.querySelector('[data-turnover]');
    var totalReturnLine = wrapEl.querySelector('[data-total-return-indicator]');
    if (totalReturnLine && totalReturnLine.closest) {
      var line = totalReturnLine.closest('.quote-div-line');
      if (line) line.remove();
    }
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
    setQuoteCardTurnoverLabel(wrapEl, {
      ticker: wrapEl.getAttribute && wrapEl.getAttribute('data-ticker'),
      tradeDate: q.tradeDate,
      bond: true
    });
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
    var turnLbl = quoteCardTurnoverLabel({
      compact: compact,
      us: opts.us,
      bond: bond,
      ticker: opts.ticker || '',
      tradeDate: opts.tradeDate
    });
    var totalReturnLine = bond ? '' : (
      '<div class="quote-div-line"><span class="quote-div-lbl">Полн. доходн. 12м <span class="quote-div-tip" title="Формула: (цена сейчас + дивиденды за 12 мес. - цена 12 мес. назад) / цена 12 мес. назад">?</span></span><span class="quote-div-val muted" data-total-return-indicator>—</span></div>'
    );
    return (
      '<div class="' + blockCls + '" data-div-block>' +
        '<div class="quote-div-line"><span class="quote-div-lbl">' + avgLbl + '</span><span class="quote-div-val" data-div-avg>…</span></div>' +
        '<div class="quote-div-line"><span class="quote-div-lbl" data-turnover-lbl>' + turnLbl + '</span><span class="quote-div-val" data-turnover>…</span></div>' +
        totalReturnLine +
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
    var totalReturnEl = wrapEl.querySelector('[data-total-return-indicator]');
    var legacy = wrapEl.querySelector('[data-div-yield]');
    if (legacy) legacy.style.display = 'none';

    var pinned = wrapEl.getAttribute && wrapEl.getAttribute('data-val-today');
    var pinnedNum = pinned != null ? Number(pinned) : null;
    var hasPinnedTurnover = isFinite(pinnedNum) && pinnedNum > 0;
    var mk = wrapEl.getAttribute && wrapEl.getAttribute('data-market');
    var isUsWrap = mk === 'US' || (typeof Markets !== 'undefined' && Markets.isUsTicker(
      wrapEl.getAttribute && wrapEl.getAttribute('data-ticker')
    ));

    function paintPinnedOrClearTurnover(clearIfMissing) {
      if (!turnoverEl) return;
      if (hasPinnedTurnover) {
        turnoverEl.textContent = isUsWrap ? formatUsdTurnoverShort(pinnedNum) : formatTurnoverBln(pinnedNum);
        turnoverEl.className = turnoverEl.textContent === '—' ? 'quote-div-val muted' : 'quote-div-val';
        setQuoteCardTurnoverLabel(wrapEl, {
          ticker: wrapEl.getAttribute && wrapEl.getAttribute('data-ticker'),
          tradeDate: resolveQuoteTradeDate(a) || undefined,
          market: mk
        });
        return;
      }
      if (clearIfMissing) {
        turnoverEl.textContent = '—';
        turnoverEl.className = 'quote-div-val muted';
      }
    }

    if (!a || !a.eligible) {
      if (avgEl) {
        avgEl.textContent = '—';
        avgEl.className = 'quote-div-val muted';
        avgEl.title = '';
      }
      // Топ‑20: не затирать VALTODAY ранжирования, если enrich неуспешен.
      paintPinnedOrClearTurnover(true);
      if (totalReturnEl) {
        totalReturnEl.textContent = '—';
        totalReturnEl.className = 'quote-div-val muted';
      }
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
      var v = null;
      // Ранг топ‑20 фиксирует VALTODAY в data-val-today — он приоритетнее кэша аналитики.
      if (hasPinnedTurnover) {
        v = pinnedNum;
      } else {
        v = a.quote && a.quote.valueToday != null ? a.quote.valueToday : null;
        if ((v == null || !isFinite(Number(v))) && a.volumeByDay && a.volumeByDay.length) {
          var last = a.volumeByDay[a.volumeByDay.length - 1];
          if (last && isFinite(Number(last.v))) v = Number(last.v) * 1e9;
        }
      }
      turnoverEl.textContent = isUsWrap ? formatUsdTurnoverShort(v) : formatTurnoverBln(v);
      if (turnoverEl.textContent === '—') turnoverEl.className = 'quote-div-val muted';
      else turnoverEl.className = 'quote-div-val';
      setQuoteCardTurnoverLabel(wrapEl, {
        ticker: wrapEl.getAttribute && wrapEl.getAttribute('data-ticker'),
        tradeDate: resolveQuoteTradeDate(a),
        market: mk
      });
    }
    if (totalReturnEl) {
      var tr = a.totalReturn12m && isFinite(a.totalReturn12m.pct) ? Number(a.totalReturn12m.pct) : null;
      if (tr === 0 && a.totalReturn12m && !String(a.totalReturn12m.source || '').trim()) tr = null;
      if (tr == null) {
        totalReturnEl.textContent = '—';
        totalReturnEl.className = 'quote-div-val muted';
        totalReturnEl.title = a.noMoexDividends
          ? 'Недостаточно истории торгов для расчёта за 12 месяцев'
          : '';
      } else {
        totalReturnEl.textContent = formatDivYieldPct(tr);
        totalReturnEl.className = 'quote-div-val' + (tr >= 0 ? ' pnl-pos' : ' pnl-neg');
        totalReturnEl.title = a.totalReturn12m.source || 'Цена + дивиденды за 12 месяцев';
      }
    }
  }

  function resetEnrichQueue() {
    enrichQueue = [];
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
      if (!wrapEl || !wrapEl.isConnected) {
        resolve();
        return;
      }
      var expectedTicker = normalizeTicker(ticker);
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
        if (!wrapEl.isConnected) {
          resolve();
          return;
        }
        if (normalizeTicker(wrapEl.getAttribute && wrapEl.getAttribute('data-ticker')) !== expectedTicker) {
          resolve();
          return;
        }
        applyDivMetricsToWrap(wrapEl, a);
        resolve();
      }).catch(function () {
        if (wrapEl.isConnected) {
          applyDivMetricsToWrap(wrapEl, { eligible: false });
        }
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
      var totalReturnEl = wrapEl.querySelector('[data-total-return-indicator]');
      if (totalReturnEl && totalReturnEl.closest) {
        var trLine = totalReturnEl.closest('.quote-div-line');
        if (trLine) trLine.remove();
      }
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

    resetEnrichQueue();
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
        if (q && q.tradeDate && typeof setQuoteCardTurnoverLabel === 'function') {
          setQuoteCardTurnoverLabel(wrap, { ticker: ticker, tradeDate: q.tradeDate });
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
      state.analyticsSub = 'stocks';
      switchTab('watchlist');
    } else if (state.analyticsSub !== 'stocks' && typeof switchAnalyticsSub === 'function') {
      switchAnalyticsSub('stocks');
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
    if (state.analyticsTicker) selectAnalyticsTicker(state.analyticsTicker);
  }

  function openSecurityAnalyticsModal(ticker) {
    selectAnalyticsTicker(ticker);
  }

  function fetchPortfolioDivForecastHtml(ticker, qty) {
    return fetchPortfolioIncomeCell(ticker, qty);
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
  window.quoteCardDivMetricsHtml = quoteCardDivMetricsHtml;
  window.quoteCardTurnoverLabel = quoteCardTurnoverLabel;
  window.resolveQuoteTradeDate = resolveQuoteTradeDate;
  window.setQuoteCardTurnoverLabel = setQuoteCardTurnoverLabel;
  window.queueEnrichQuoteCard = queueEnrichQuoteCard;
  window.resetEnrichQueue = resetEnrichQueue;
  window.fetchPortfolioDivForecastHtml = fetchPortfolioDivForecastHtml;
  window.fetchPortfolioIncomeCell = fetchPortfolioIncomeCell;
  window.formatPortfolioBondIncomeCell = formatPortfolioBondIncomeCell;
  window.computeDividendForecast12m = computeDividendForecast12m;
  window.buildMonthlyDividendForecast12m = buildMonthlyDividendForecast12m;
  window.buildPassiveIncome5y = buildPassiveIncome5y;
  window.formatDivMonthScheduleHtml = formatDivMonthScheduleHtml;
  window.formatDividendChartInfoHtml = formatDividendChartInfoHtml;
  window.formatTradeDateRu = formatTradeDateRu;
  window.tradeDateSeriesNeedsYear = tradeDateSeriesNeedsYear;
  window.formatVolumeFreshnessNote = formatVolumeFreshnessNote;
  window.runAnalyticsSpotCheck = runAnalyticsSpotCheck;
})();
