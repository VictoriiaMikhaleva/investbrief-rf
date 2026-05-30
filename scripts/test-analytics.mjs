#!/usr/bin/env node
/**
 * CI-тест расчётов аналитики против живого MOEX ISS.
 * Запуск: npm run test:analytics
 */
import https from 'https';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Core = require('../analytics-core.js');

const TICKERS = [
  'SBER', 'GAZP', 'LKOH', 'GMKN', 'TATN', 'NVTK', 'ROSN', 'SNGS', 'SNGSP',
  'PLZL', 'MGNT', 'MTSS', 'MOEX', 'AFLT', 'ALRS', 'CHMF', 'NLMK', 'SVCB', 'OZPH', 'YDEX'
];

const YIELD_TOLERANCE = 0.5;
const MIN_HISTORY_DAYS = 200;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse: ' + url)); }
      });
    }).on('error', reject);
  });
}

async function fetchDividends(ticker) {
  const j = await get(
    'https://iss.moex.com/iss/securities/' + ticker + '/dividends.json?iss.meta=off'
  );
  const cols = j.dividends.columns;
  const iD = cols.indexOf('registryclosedate');
  const iV = cols.indexOf('value');
  const rows = (j.dividends.data || []).map((r) => ({
    date: String(r[iD]).slice(0, 10),
    value: Number(r[iV])
  })).filter((d) => d.date && isFinite(d.value) && d.value > 0);
  return Core.normalizeMoexDividends(rows);
}

async function fetchHistory(ticker) {
  const till = new Date().toISOString().slice(0, 10);
  const windowYears = Core.getYieldWindowYears();
  const from = windowYears[0] - 1 + '-01-01';
  let all = [];
  let start = 0;
  let iDate;
  let iClose;
  let iVal;

  while (true) {
    const url =
      'https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/' +
      ticker + '.json?from=' + from + '&till=' + till +
      '&iss.meta=off&history.columns=TRADEDATE,CLOSE,VALUE&start=' + start;
    const j = await get(url);
    if (!j.history || !j.history.data.length) break;
    if (iDate == null) {
      iDate = j.history.columns.indexOf('TRADEDATE');
      iClose = j.history.columns.indexOf('CLOSE');
      iVal = j.history.columns.indexOf('VALUE');
    }
    j.history.data.forEach((r) => {
      const d = String(r[iDate]).slice(0, 10);
      all.push({
        date: d,
        close: Number(r[iClose]),
        value: Number(r[iVal]),
        t: new Date(d + 'T12:00:00').getTime()
      });
    });
    const cur = j['history.cursor'] && j['history.cursor'].data && j['history.cursor'].data[0];
    const total = cur ? Number(cur[1]) : all.length;
    const pageSize = cur ? Number(cur[2]) : j.history.data.length;
    if (pageSize > 0 && start + j.history.data.length < total) start += pageSize;
    else break;
  }

  const byDate = {};
  all.forEach((r) => { byDate[r.date] = r; });
  return Object.keys(byDate).sort().map((d) => byDate[d]);
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

async function testTicker(ticker) {
  const errors = [];
  const dividends = await fetchDividends(ticker);
  const history = await fetchHistory(ticker);
  const metrics = Core.buildMetricsFromMoex(dividends, history, null);

  assert(history.length >= MIN_HISTORY_DAYS, ticker + ': мало истории (' + history.length + ' дней)', errors);
  assert(!metrics.volumeStale, ticker + ': устаревший оборот (last=' + metrics.dataAsOf + ')', errors);
  assert(
    metrics.volumeByDay.length >= MIN_HISTORY_DAYS * 0.7,
    ticker + ': мало точек оборота (' + metrics.volumeByDay.length + ')',
    errors
  );

  errors.push(...Core.validateSpotCheck(ticker, metrics));

  if (metrics.divForecast && metrics.divForecast.amount != null) {
    const maxReporting = Core.getYieldWindowYears().reduce((max, y) => {
      const s = Core.sumDividendsInReportingYear(dividends, y);
      return s > max ? s : max;
    }, 0);
    assert(
      metrics.divForecast.amount <= maxReporting + 0.02,
      ticker + ': прогноз ' + metrics.divForecast.amount + ' > max отчётного года ' + maxReporting,
      errors
    );
  }

  for (const y of metrics.divYieldByYear || []) {
    if (y.yieldPct != null && y.yieldPct > Core.DIV_YIELD_MAX_SANE_PCT) {
      errors.push(ticker + ': yield ' + y.year + ' = ' + y.yieldPct.toFixed(1) + '% > max');
    }
  }

  return { ticker, errors, metrics };
}

async function main() {
  console.log('AnalyticsCore v' + Core.VERSION + ' · tickers: ' + TICKERS.length);
  const allErrors = [];
  let checked = 0;

  for (const ticker of TICKERS) {
    try {
      const { errors, metrics } = await testTicker(ticker);
      checked++;
      if (errors.length) {
        allErrors.push(...errors);
        console.log('FAIL', ticker, errors.join('; '));
      } else {
        const avg = metrics.divAvg5y != null ? metrics.divAvg5y.toFixed(1) + '%' : '—';
        const fc = metrics.divForecast && metrics.divForecast.amount != null
          ? metrics.divForecast.amount.toFixed(2)
          : '—';
        console.log('OK  ', ticker, 'avg5=' + avg, 'fc=' + fc, 'vol=' + metrics.dataAsOf);
      }
    } catch (e) {
      allErrors.push(ticker + ': ' + (e.message || e));
      console.log('ERR ', ticker, e.message || e);
    }
  }

  console.log('---');
  console.log('Checked:', checked + '/' + TICKERS.length);
  if (allErrors.length) {
    console.error('FAILED:', allErrors.length, 'issue(s)');
    allErrors.forEach((e) => console.error(' •', e));
    process.exit(1);
  }
  console.log('All analytics checks passed.');
}

main();
