'use strict';

const Core = require('./analytics-core');
const moex = require('./moex-fetch');

const ANALYTICS_TTL_MS = 15 * 60 * 1000;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  cache.set(key, { expires: Date.now() + ANALYTICS_TTL_MS, data: data });
}

function isIndexTicker(ticker) {
  return ticker === 'IMOEX' || ticker === 'INDEX';
}

function buildAnalyticsPayload(ticker, quote, metrics) {
  return {
    ticker: ticker,
    eligible: true,
    quote: quote || { price: null, changePct: null, valueToday: null },
    dividends: metrics.dividends,
    divAvg5y: metrics.divAvg5y,
    divYieldQuality: metrics.divYieldQuality,
    divForecast: metrics.divForecast,
    noMoexDividends: metrics.noMoexDividends,
    divYieldByYear: metrics.divYieldByYear,
    monthlyForecast: metrics.monthlyForecast,
    volumeByDay: metrics.volumeByDay,
    dataAsOf: metrics.dataAsOf,
    volumeStale: metrics.volumeStale,
    divDataSource: metrics.dividends.length ? 'moex' : '',
    source: 'server',
    coreVersion: Core.VERSION,
    computedAt: new Date().toISOString()
  };
}

async function buildTickerAnalytics(ticker, opts) {
  opts = opts || {};
  ticker = moex.normalizeTicker(ticker);
  if (!moex.isValidTicker(ticker)) {
    const err = new Error('invalid_ticker');
    err.status = 400;
    throw err;
  }
  if (isIndexTicker(ticker)) {
    return {
      ticker: ticker,
      eligible: false,
      divAvg5y: null,
      divForecast: null,
      divYieldByYear: [],
      volumeByDay: [],
      source: 'server'
    };
  }

  const cacheKey = 'analytics.' + ticker;
  if (!opts.forceRefresh) {
    const cached = cacheGet(cacheKey);
    if (cached && !Core.isAnalyticsFullCacheStale(cached)) return cached;
  }

  const results = await Promise.all([
    moex.fetchMoexDividends(ticker),
    moex.fetchMoexShareHistoryDaily(ticker),
    moex.fetchMoexQuote(ticker)
  ]);

  const metrics = Core.buildMetricsFromMoex(results[0], results[1], results[2].price);
  const out = buildAnalyticsPayload(ticker, results[2], metrics);
  cacheSet(cacheKey, out);
  return out;
}

async function runSpotCheck() {
  const tickers = ['GAZP', 'SBER'];
  const results = [];
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    try {
      const data = await buildTickerAnalytics(ticker, { forceRefresh: true });
      const errors = Core.validateSpotCheck(ticker, data);
      results.push({ ticker: ticker, ok: !errors.length, errors: errors, dataAsOf: data.dataAsOf });
    } catch (err) {
      results.push({
        ticker: ticker,
        ok: false,
        errors: [ticker + ': ' + (err.message || 'error')]
      });
    }
  }
  const allErrors = [];
  results.forEach(function (r) {
    if (r.errors && r.errors.length) allErrors.push.apply(allErrors, r.errors);
  });
  return { ok: !allErrors.length, results: results, errors: allErrors, checkedAt: new Date().toISOString() };
}

module.exports = {
  buildTickerAnalytics: buildTickerAnalytics,
  runSpotCheck: runSpotCheck
};
