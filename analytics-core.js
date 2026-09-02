/**
 * analytics-core.js — единый источник расчётов дивидендов и оборота (MOEX ISS).
 * Подключается перед analytics.js; тестируется через scripts/test-analytics.mjs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnalyticsCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.5.1';
  /** Минимальный интервал между якорными датами для полной доходности 12м (~11 мес.). */
  var TOTAL_RETURN_MIN_SPAN_DAYS = 330;
  var DIV_YIELD_MAX_SANE_PCT = 35;
  var DIV_PRICE_SCALE_BREAK_RATIO = 5;
  var YIELD_YEARS = 5;
  var VOLUME_YEAR_DAYS = 252;
  var STALE_TRADE_DAYS = 4;
  var FORECAST_STALE_MONTHS = 18;

  function dividendReportingYear(paymentDateIso) {
    var parts = String(paymentDateIso || '').slice(0, 10).split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    if (!isFinite(y) || !isFinite(m)) return '';
    // Янв–сен: выплата за предыдущий отчётный год; окт–дек — за текущий.
    if (m >= 1 && m <= 9) return String(y - 1);
    return String(y);
  }

  /** Последний завершённый отчётный год: год Y закрывается после сентября Y+1. */
  function getLastCompletedReportingYear(now) {
    now = now || new Date();
    var y = now.getFullYear();
    var m = now.getMonth() + 1;
    if (m >= 10) return y - 1;
    return y - 2;
  }

  function getYieldWindowYears(now) {
    now = now || new Date();
    var endYear = getLastCompletedReportingYear(now);
    var years = [];
    for (var i = YIELD_YEARS - 1; i >= 0; i--) years.push(endYear - i);
    return years;
  }

  /** Открытые отчётные годы (для средней 5л не используются). */
  function getOpenReportingYears(now) {
    now = now || new Date();
    var last = getLastCompletedReportingYear(now);
    var calYear = now.getFullYear();
    var end = Math.max(calYear, last + 1);
    var years = [];
    var y;
    for (y = last + 1; y <= end; y++) years.push(y);
    return years;
  }

  function isoDateFromParts(y, m, d) {
    return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /** Следующее наступление того же месяца/дня строго после now. */
  function nextFutureOccurrenceIso(isoTemplate, now) {
    now = now || new Date();
    now.setHours(12, 0, 0, 0);
    var parts = String(isoTemplate || '').slice(0, 10).split('-');
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    if (!isFinite(m) || !isFinite(d)) return '';
    var y = now.getFullYear();
    var candidate = new Date(y, m - 1, d, 12, 0, 0, 0);
    if (isNaN(candidate.getTime()) || candidate.getTime() <= now.getTime()) {
      candidate = new Date(y + 1, m - 1, d, 12, 0, 0, 0);
    }
    if (isNaN(candidate.getTime()) || candidate.getTime() <= now.getTime()) return '';
    return isoDateFromParts(candidate.getFullYear(), candidate.getMonth() + 1, candidate.getDate());
  }

  function findReferenceReportingYear(dividends, now) {
    var windowYears = getYieldWindowYears(now);
    var i;
    for (i = windowYears.length - 1; i >= 0; i--) {
      if (sumDividendsInReportingYear(dividends, windowYears[i]) > 0) return windowYears[i];
    }
    return null;
  }

  function paymentsInReportingYear(dividends, reportingYear) {
    var y = String(reportingYear);
    return (dividends || []).filter(function (d) {
      return d.date && dividendReportingYear(d.date) === y && isFinite(d.value) && d.value > 0;
    }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  function paymentsInCalendarYear(dividends, calendarYear) {
    var y = String(calendarYear);
    return (dividends || []).filter(function (d) {
      return d.date && String(d.date).slice(0, 4) === y && isFinite(d.value) && d.value > 0;
    }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  /** Ожидаемые отсечки в будущем — по датам календаря последнего закрытого отчётного года. */
  function projectExpectedCalendarPayments(dividends, now) {
    now = now || new Date();
    now.setHours(12, 0, 0, 0);
    var lastPay = getLastDividendPaymentDate(dividends);
    if (!lastPay || monthsSinceIsoDate(lastPay, now) > FORECAST_STALE_MONTHS) return [];
    var refYear = findReferenceReportingYear(dividends, now);
    if (refYear == null) return [];
    var refPays = paymentsInReportingYear(dividends, refYear);
    if (!refPays.length) return [];
    var out = [];
    refPays.forEach(function (div) {
      var projected = nextFutureOccurrenceIso(div.date, now);
      if (!projected) return;
      var projYear = Number(String(projected).slice(0, 4));
      var actualInYear = paymentsInCalendarYear(dividends, projYear);
      // Если в календарном году уже есть полный набор фактов — не дублируем оценкой.
      if (actualInYear.length >= refPays.length) return;
      var nearActual = (dividends || []).some(function (a) {
        if (!a.date || !isFinite(a.value)) return false;
        var t0 = new Date(a.date + 'T12:00:00').getTime();
        var t1 = new Date(projected + 'T12:00:00').getTime();
        if (isNaN(t0) || isNaN(t1)) return false;
        return Math.abs(t1 - t0) <= 60 * 24 * 60 * 60 * 1000;
      });
      if (nearActual) return;
      if (out.some(function (p) { return p.date === projected; })) return;
      out.push({ date: projected, value: div.value, estimated: true });
    });
    return out.sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  /**
   * Отображение: календарные годы по фактическим датам отсечки (MOEX + патчи).
   * Ожидания — только в monthlyForecast (календарь на 12 мес.).
   * Средняя 5л по-прежнему по отчётным годам (divYieldByYearCompleted).
   */
  function buildDividendDisplayYears(dividends, dailyHistory, now) {
    now = now || new Date();
    var calYear = now.getFullYear();
    var startYear = calYear - (YIELD_YEARS - 1);
    var yearSet = {};
    var y;
    for (y = startYear; y <= calYear; y++) yearSet[y] = true;
    (dividends || []).forEach(function (d) {
      if (!d.date || !isFinite(d.value) || d.value <= 0) return;
      var yy = Number(String(d.date).slice(0, 4));
      if (isFinite(yy) && yy >= startYear && yy <= calYear) yearSet[yy] = true;
    });
    return Object.keys(yearSet).map(Number).sort(function (a, b) { return a - b; }).map(function (yearNum) {
      var actualItems = paymentsInCalendarYear(dividends, yearNum).map(function (d) {
        return { date: d.date, value: d.value, estimated: false };
      });
      var actualDiv = actualItems.reduce(function (s, d) { return s + d.value; }, 0);
      var totalDiv = actualDiv;
      var refPrice = averageClose(dailyHistory, yearNum);
      if (refPrice == null) refPrice = yearEndClose(dailyHistory, yearNum);
      var yieldPct = null;
      var unreliable = hasPriceScaleBreak(dailyHistory, yearNum);
      if (refPrice != null && refPrice > 0 && !unreliable && actualDiv > 0) {
        var raw = (actualDiv / refPrice) * 100;
        yieldPct = isSaneYearYield(raw) ? raw : null;
      }
      return {
        year: yearNum,
        yieldPct: yieldPct,
        totalDiv: totalDiv,
        actualDiv: actualDiv,
        expectedDiv: 0,
        refPrice: refPrice,
        unreliable: unreliable,
        open: false,
        calendar: true,
        items: actualItems
      };
    }).filter(function (row) {
      return row.totalDiv > 0 || row.year === calYear;
    });
  }

  function yearEndClose(dailyHistory, year) {
    var y = String(year);
    var rows = (dailyHistory || []).filter(function (h) {
      return h.date && h.date.indexOf(y) === 0 && h.close > 0;
    });
    if (!rows.length) return null;
    return rows[rows.length - 1].close;
  }

  function averageClose(dailyHistory, year) {
    var y = String(year);
    var prices = (dailyHistory || []).filter(function (h) {
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

  /** Дополняет ленту MOEX патчами (когда ISS запаздывает). */
  function mergeDividendPatches(moexDividends, patchRows) {
    var merged = (moexDividends || []).concat(patchRows || []).map(function (d) {
      return {
        date: String(d.date || '').slice(0, 10),
        value: Number(d.value)
      };
    }).filter(function (d) {
      return d.date.length === 10 && isFinite(d.value) && d.value > 0;
    });
    return normalizeMoexDividends(merged);
  }

  function sumDividendsInReportingYear(dividends, reportingYear) {
    var y = String(reportingYear);
    var sum = 0;
    (dividends || []).forEach(function (d) {
      if (dividendReportingYear(d.date) !== y) return;
      if (!isFinite(d.value) || d.value <= 0) return;
      sum += d.value;
    });
    return sum;
  }

  function getLastDividendPaymentDate(dividends) {
    var last = '';
    (dividends || []).forEach(function (d) {
      if (!d.date || !isFinite(d.value) || d.value <= 0) return;
      if (!last || d.date > last) last = d.date;
    });
    return last;
  }

  function monthsSinceIsoDate(isoDate, now) {
    var dt = new Date(String(isoDate || '').slice(0, 10) + 'T12:00:00');
    if (isNaN(dt.getTime())) return Infinity;
    now = now || new Date();
    now.setHours(12, 0, 0, 0);
    return (now.getFullYear() - dt.getFullYear()) * 12 + (now.getMonth() - dt.getMonth());
  }

  function computeDividendForecast12m(dividends, now) {
    if (!dividends || !dividends.length) {
      return { amount: null, paid12m: null, upcoming12m: null, source: '' };
    }
    now = now || new Date();
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

    var lastPay = getLastDividendPaymentDate(dividends);
    if (lastPay && monthsSinceIsoDate(lastPay, now) > FORECAST_STALE_MONTHS) {
      return {
        amount: null,
        paid12m: null,
        upcoming12m: null,
        source: 'новых выплат не объявлено (МосБиржа)'
      };
    }

    var windowYears = getYieldWindowYears(now);
    var i;
    for (i = windowYears.length - 1; i >= 0; i--) {
      var yearSum = sumDividendsInReportingYear(dividends, windowYears[i]);
      if (yearSum > 0) {
        return {
          amount: yearSum,
          paid12m: paid12m,
          upcoming12m: yearSum,
          source: 'оценка по дивидендам ' + windowYears[i] + ' г. (МосБиржа)'
        };
      }
    }

    return { amount: null, paid12m: null, upcoming12m: null, source: '' };
  }

  function nearestCloseOnOrBefore(dailyHistory, isoDate) {
    var target = String(isoDate || '').slice(0, 10);
    if (target.length < 10) return null;
    var picked = null;
    (dailyHistory || []).forEach(function (h) {
      var d = String(h && h.date || '').slice(0, 10);
      if (d.length < 10 || d > target || !isFinite(h.close) || h.close <= 0) return;
      if (!picked || d > picked.date) picked = { date: d, close: Number(h.close) };
    });
    return picked;
  }

  function computeTotalReturn12m(dividends, dailyHistory, now) {
    now = now || new Date();
    now.setHours(12, 0, 0, 0);
    var endIso = now.toISOString().slice(0, 10);
    var start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    var startIso = start.toISOString().slice(0, 10);

    var startPoint = nearestCloseOnOrBefore(dailyHistory, startIso);
    var endPoint = nearestCloseOnOrBefore(dailyHistory, endIso);
    if (!startPoint || !endPoint || !isFinite(startPoint.close) || startPoint.close <= 0) {
      return { pct: null, priceReturnPct: null, divPaid12m: null, source: '' };
    }

    var anchorStartMs = new Date(startPoint.date + 'T12:00:00').getTime();
    var anchorEndMs = new Date(endPoint.date + 'T12:00:00').getTime();
    if (isNaN(anchorStartMs) || isNaN(anchorEndMs) ||
        anchorEndMs - anchorStartMs < TOTAL_RETURN_MIN_SPAN_DAYS * 24 * 60 * 60 * 1000) {
      return { pct: null, priceReturnPct: null, divPaid12m: null, source: '' };
    }

    var paid12m = 0;
    var startMs = new Date(startIso + 'T12:00:00').getTime();
    var endMs = new Date(endIso + 'T12:00:00').getTime();
    (dividends || []).forEach(function (d) {
      var dt = new Date(String(d.date || '').slice(0, 10) + 'T12:00:00');
      if (isNaN(dt.getTime()) || !isFinite(d.value) || d.value <= 0) return;
      var ms = dt.getTime();
      if (ms > startMs && ms <= endMs) paid12m += Number(d.value);
    });

    var startClose = Number(startPoint.close);
    var endClose = Number(endPoint.close);
    var priceReturnPct = ((endClose - startClose) / startClose) * 100;
    var totalReturnPct = ((endClose + paid12m - startClose) / startClose) * 100;
    return {
      pct: isFinite(totalReturnPct) ? totalReturnPct : null,
      priceReturnPct: isFinite(priceReturnPct) ? priceReturnPct : null,
      divPaid12m: paid12m,
      source: 'цена + дивиденды за 12 мес. (MOEX)'
    };
  }

  function computeYearlyDividendYields(dividends, dailyHistory, windowYears) {
    windowYears = windowYears || getYieldWindowYears();
    var byYearDiv = {};
    (dividends || []).forEach(function (d) {
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

  function moexHistoryLastTradeDate(rows) {
    if (!rows || !rows.length) return '';
    return String(rows[rows.length - 1].date || '').slice(0, 10);
  }

  function moexHistoryLastVolumeDate(rows) {
    if (!rows || !rows.length) return '';
    var i;
    for (i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      if (!r || !r.date) continue;
      var raw = r.value != null ? r.value : null;
      if ((raw == null || !isFinite(raw) || raw <= 0) && r.v != null && isFinite(r.v) && r.v > 0) {
        raw = r.v * 1e9;
      }
      if (raw != null && isFinite(raw) && raw > 0) return String(r.date).slice(0, 10);
    }
    return '';
  }

  function isHistoryVolumeBehindQuotes(history) {
    if (!history || !history.length) return true;
    var lastTrade = moexHistoryLastTradeDate(history);
    var lastVol = moexHistoryLastVolumeDate(history);
    if (!lastTrade || !lastVol) return true;
    if (lastVol >= lastTrade) return false;
    var tradeMs = new Date(lastTrade + 'T20:00:00').getTime();
    var volMs = new Date(lastVol + 'T20:00:00').getTime();
    if (isNaN(tradeMs) || isNaN(volMs)) return true;
    return tradeMs - volMs > STALE_TRADE_DAYS * 24 * 60 * 60 * 1000;
  }

  function isMoexHistoryCacheStale(rows, todayIso) {
    var last = moexHistoryLastTradeDate(rows);
    if (!last || last.length < 10) return true;
    var lastMs = new Date(last + 'T20:00:00').getTime();
    if (isNaN(lastMs)) return true;
    var todayMsk = todayIso || new Date().toISOString().slice(0, 10);
    var todayMs = new Date(todayMsk + 'T20:00:00').getTime();
    if (todayMs - lastMs > STALE_TRADE_DAYS * 24 * 60 * 60 * 1000) return true;
    if (rows[0] && rows[0].value !== undefined) {
      var lastVol = moexHistoryLastVolumeDate(rows);
      if (lastVol && lastVol < last) {
        var volMs = new Date(lastVol + 'T20:00:00').getTime();
        if (!isNaN(volMs) && lastMs - volMs > STALE_TRADE_DAYS * 24 * 60 * 60 * 1000) return true;
      }
    }
    return false;
  }

  function isAnalyticsFullCacheStale(cached, todayIso) {
    if (!cached) return true;
    if (isMoexHistoryCacheStale(cached.volumeByDay, todayIso)) return true;
    if (cached.dataAsOf && cached.volumeByDay && cached.volumeByDay.length) {
      var volLast = moexHistoryLastTradeDate(cached.volumeByDay);
      var dataAsOf = String(cached.dataAsOf).slice(0, 10);
      if (volLast && dataAsOf > volLast) {
        var gapMs = new Date(dataAsOf + 'T20:00:00').getTime() - new Date(volLast + 'T20:00:00').getTime();
        if (gapMs > STALE_TRADE_DAYS * 24 * 60 * 60 * 1000) return true;
      }
    }
    return false;
  }

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

  function formatTradeDateRu(iso, includeYear) {
    var s = String(iso || '').slice(0, 10);
    if (s.length < 10) return '';
    var dd = s.slice(8, 10);
    var mm = s.slice(5, 7);
    if (includeYear) return dd + '.' + mm + '.' + s.slice(0, 4);
    return dd + '.' + mm;
  }

  function formatIsoDateRu(iso) {
    return formatTradeDateRu(iso, true);
  }

  function sliceVolumeSeries(dailyHistory, days) {
    days = days || VOLUME_YEAR_DAYS;
    var rows = (dailyHistory || []).filter(function (h) { return h.value != null && h.value > 0; });
    var slice = rows.slice(-days);
    var withYear = tradeDateSeriesNeedsYear(slice);
    return slice.map(function (h) {
      var iso = String(h.date || '').slice(0, 10);
      var label = formatTradeDateRu(iso, withYear);
      return {
        t: h.t != null ? h.t : new Date(iso + 'T12:00:00').getTime(),
        v: h.value / 1e9,
        date: iso,
        label: label,
        dateLabel: label,
        dateWithYear: withYear
      };
    });
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

  function buildMonthlyDividendForecast12m(dividends, history, quotePrice, now) {
    now = now || new Date();
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
      var expected = projectExpectedCalendarPayments(dividends, now);
      expected.forEach(function (div) {
        var projectedDt = new Date(div.date + 'T12:00:00');
        if (isNaN(projectedDt.getTime()) || projectedDt > horizonEnd) return;
        var bucket = monthByKey[monthKeyFromDate(projectedDt)];
        if (!bucket) return;
        bucket.perShare += div.value;
        bucket.items.push({ date: div.date, value: div.value, estimated: true });
        bucket.estimated = true;
      });
      if (months.some(function (m) { return m.perShare > 0; })) {
        var refYearLabel = findReferenceReportingYear(dividends, now);
        source = refYearLabel != null
          ? 'оценка: календарь выплат ' + refYearLabel + ' г.'
          : 'оценка по календарю выплат';
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

  function buildMetricsFromMoex(dividends, history, quotePrice, now) {
    dividends = normalizeMoexDividends(dividends || []);
    history = history || [];
    var yearly = computeYearlyDividendYields(dividends, history, getYieldWindowYears(now));
    var displayYears = buildDividendDisplayYears(dividends, history, now);
    var forecast = computeDividendForecast12m(dividends, now);
    var divMetrics = finalizeDividendMetrics(dividends, yearly, forecast);
    var volumeByDay = sliceVolumeSeries(history, VOLUME_YEAR_DAYS);
    var dataAsOf = moexHistoryLastTradeDate(history);
    var volumeStale = isMoexHistoryCacheStale(volumeByDay, now ? now.toISOString().slice(0, 10) : undefined)
      || isHistoryVolumeBehindQuotes(history);
    return {
      dividends: dividends,
      divYieldByYear: displayYears,
      divYieldByYearCompleted: yearly,
      divAvg5y: divMetrics.divAvg5y,
      divYieldQuality: divMetrics.divYieldQuality,
      divForecast: divMetrics.divForecast,
      noMoexDividends: divMetrics.noMoexDividends,
      totalReturn12m: computeTotalReturn12m(dividends, history, now),
      monthlyForecast: buildMonthlyDividendForecast12m(dividends, history, quotePrice, now),
      volumeByDay: volumeByDay,
      dataAsOf: dataAsOf,
      volumeStale: volumeStale
    };
  }

  function formatVolumeFreshnessNote(analytics) {
    if (!analytics || !analytics.volumeByDay || !analytics.volumeByDay.length) {
      return 'Данные по объёму торгов пока недоступны.';
    }
    var last = moexHistoryLastTradeDate(analytics.volumeByDay);
    var dateRu = formatIsoDateRu(last);
    var base = 'Оборот TQBR за год · ' + analytics.volumeByDay.length + ' торговых дней';
    if (dateRu) base += ' · данные MOEX на ' + dateRu;
    if (analytics.volumeStale) base += ' · обновление задерживается';
    return base;
  }

  /** Эталоны для CI / watchdog (допуск ±0.4 п.п.). */
  var SPOT_CHECK_RULES = {
    GAZP: {
      divAvg5y: { min: 9.1, max: 9.9 },
      forecastNull: true,
      forbidForecastAmount: 103.56
    },
    SBER: {
      divAvg5y: { min: 11.5, max: 12.5 },
      forecastNull: false
    }
  };

  function validateSpotCheck(ticker, metrics) {
    var errors = [];
    var rule = SPOT_CHECK_RULES[ticker];
    if (!rule) return errors;
    if (!metrics) {
      errors.push(ticker + ': нет метрик');
      return errors;
    }
    if (metrics.volumeStale) {
      errors.push(ticker + ': устаревший оборот (last=' + (metrics.dataAsOf || '?') + ')');
    }
    if (rule.divAvg5y) {
      var avg = metrics.divAvg5y;
      if (avg == null || !isFinite(avg)) {
        errors.push(ticker + ': divAvg5y отсутствует');
      } else if (avg < rule.divAvg5y.min || avg > rule.divAvg5y.max) {
        errors.push(ticker + ': divAvg5y=' + avg.toFixed(1) + '% вне ' + rule.divAvg5y.min + '–' + rule.divAvg5y.max + '%');
      }
    }
    var fc = metrics.divForecast;
    if (rule.forecastNull && fc && fc.amount != null) {
      errors.push(ticker + ': прогноз должен быть пустым, получено ' + fc.amount);
    }
    if (rule.forecastNull === false && (!fc || fc.amount == null || fc.amount <= 0)) {
      errors.push(ticker + ': ожидается актуальный прогноз дивидендов');
    }
    if (rule.forbidForecastAmount != null && fc && fc.amount != null &&
        Math.abs(fc.amount - rule.forbidForecastAmount) < 0.02) {
      errors.push(ticker + ': ошибочный прогноз ' + fc.amount + ' (дубль календарного года)');
    }
    return errors;
  }

  return {
    VERSION: VERSION,
    DIV_YIELD_MAX_SANE_PCT: DIV_YIELD_MAX_SANE_PCT,
    DIV_PRICE_SCALE_BREAK_RATIO: DIV_PRICE_SCALE_BREAK_RATIO,
    YIELD_YEARS: YIELD_YEARS,
    VOLUME_YEAR_DAYS: VOLUME_YEAR_DAYS,
    STALE_TRADE_DAYS: STALE_TRADE_DAYS,
    FORECAST_STALE_MONTHS: FORECAST_STALE_MONTHS,
    SPOT_CHECK_RULES: SPOT_CHECK_RULES,
    dividendReportingYear: dividendReportingYear,
    getLastCompletedReportingYear: getLastCompletedReportingYear,
    getYieldWindowYears: getYieldWindowYears,
    getOpenReportingYears: getOpenReportingYears,
    yearEndClose: yearEndClose,
    averageClose: averageClose,
    hasPriceScaleBreak: hasPriceScaleBreak,
    isSaneYearYield: isSaneYearYield,
    normalizeMoexDividends: normalizeMoexDividends,
    mergeDividendPatches: mergeDividendPatches,
    sumDividendsInReportingYear: sumDividendsInReportingYear,
    getLastDividendPaymentDate: getLastDividendPaymentDate,
    monthsSinceIsoDate: monthsSinceIsoDate,
    computeDividendForecast12m: computeDividendForecast12m,
    nearestCloseOnOrBefore: nearestCloseOnOrBefore,
    computeTotalReturn12m: computeTotalReturn12m,
    computeYearlyDividendYields: computeYearlyDividendYields,
    buildDividendDisplayYears: buildDividendDisplayYears,
    averageYield5y: averageYield5y,
    assessDivYieldQuality: assessDivYieldQuality,
    finalizeDividendMetrics: finalizeDividendMetrics,
    moexHistoryLastTradeDate: moexHistoryLastTradeDate,
    moexHistoryLastVolumeDate: moexHistoryLastVolumeDate,
    isHistoryVolumeBehindQuotes: isHistoryVolumeBehindQuotes,
    isMoexHistoryCacheStale: isMoexHistoryCacheStale,
    isAnalyticsFullCacheStale: isAnalyticsFullCacheStale,
    tradeDateSeriesNeedsYear: tradeDateSeriesNeedsYear,
    formatTradeDateRu: formatTradeDateRu,
    formatIsoDateRu: formatIsoDateRu,
    sliceVolumeSeries: sliceVolumeSeries,
    buildMonthlyDividendForecast12m: buildMonthlyDividendForecast12m,
    buildMetricsFromMoex: buildMetricsFromMoex,
    formatVolumeFreshnessNote: formatVolumeFreshnessNote,
    validateSpotCheck: validateSpotCheck
  };
});
