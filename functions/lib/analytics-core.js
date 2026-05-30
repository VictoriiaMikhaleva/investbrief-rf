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

  var VERSION = '1.0.0';
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
    if (m >= 1 && m <= 9) return String(y - 1);
    return String(y);
  }

  function getYieldWindowYears(now) {
    now = now || new Date();
    var endYear = now.getFullYear() - 1;
    var years = [];
    for (var i = YIELD_YEARS - 1; i >= 0; i--) years.push(endYear - i);
    return years;
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

  function isMoexHistoryCacheStale(rows, todayIso) {
    var last = moexHistoryLastTradeDate(rows);
    if (!last || last.length < 10) return true;
    var lastMs = new Date(last + 'T20:00:00').getTime();
    if (isNaN(lastMs)) return true;
    var todayMsk = todayIso || new Date().toISOString().slice(0, 10);
    var todayMs = new Date(todayMsk + 'T20:00:00').getTime();
    return todayMs - lastMs > STALE_TRADE_DAYS * 24 * 60 * 60 * 1000;
  }

  function isAnalyticsFullCacheStale(cached, todayIso) {
    if (!cached) return true;
    if (isMoexHistoryCacheStale(cached.volumeByDay, todayIso)) return true;
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
      var lastPay = getLastDividendPaymentDate(dividends);
      if (lastPay && monthsSinceIsoDate(lastPay, now) <= FORECAST_STALE_MONTHS) {
        var refYear = null;
        var windowYears = getYieldWindowYears(now);
        var yRef;
        for (yRef = windowYears.length - 1; yRef >= 0; yRef--) {
          if (sumDividendsInReportingYear(dividends, windowYears[yRef]) > 0) {
            refYear = windowYears[yRef];
            break;
          }
        }
        if (refYear != null) {
          (dividends || []).forEach(function (div) {
            if (dividendReportingYear(div.date) !== String(refYear)) return;
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
    var yearly = computeYearlyDividendYields(dividends, history);
    var forecast = computeDividendForecast12m(dividends, now);
    var divMetrics = finalizeDividendMetrics(dividends, yearly, forecast);
    var volumeByDay = sliceVolumeSeries(history, VOLUME_YEAR_DAYS);
    var dataAsOf = moexHistoryLastTradeDate(history);
    return {
      dividends: dividends,
      divYieldByYear: yearly,
      divAvg5y: divMetrics.divAvg5y,
      divYieldQuality: divMetrics.divYieldQuality,
      divForecast: divMetrics.divForecast,
      noMoexDividends: divMetrics.noMoexDividends,
      monthlyForecast: buildMonthlyDividendForecast12m(dividends, history, quotePrice, now),
      volumeByDay: volumeByDay,
      dataAsOf: dataAsOf,
      volumeStale: isMoexHistoryCacheStale(volumeByDay, now ? now.toISOString().slice(0, 10) : undefined)
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
      divAvg5y: { min: 7.9, max: 8.5 },
      forecastNull: true,
      forbidForecastAmount: 103.56
    },
    SBER: {
      divAvg5y: { min: 7.5, max: 10.5 },
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
    getYieldWindowYears: getYieldWindowYears,
    yearEndClose: yearEndClose,
    averageClose: averageClose,
    hasPriceScaleBreak: hasPriceScaleBreak,
    isSaneYearYield: isSaneYearYield,
    normalizeMoexDividends: normalizeMoexDividends,
    sumDividendsInReportingYear: sumDividendsInReportingYear,
    getLastDividendPaymentDate: getLastDividendPaymentDate,
    monthsSinceIsoDate: monthsSinceIsoDate,
    computeDividendForecast12m: computeDividendForecast12m,
    computeYearlyDividendYields: computeYearlyDividendYields,
    averageYield5y: averageYield5y,
    assessDivYieldQuality: assessDivYieldQuality,
    finalizeDividendMetrics: finalizeDividendMetrics,
    moexHistoryLastTradeDate: moexHistoryLastTradeDate,
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
