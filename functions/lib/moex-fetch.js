'use strict';

const MOEX_ISS = 'https://iss.moex.com/iss';
const FETCH_TIMEOUT_MS = 25000;
const USER_AGENT = 'InvestBriefAnalytics/1.0 (+https://victoriiamikhaleva.github.io/investbrief-rf/)';

async function moexFetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('MOEX HTTP ' + res.status);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTicker(ticker) {
  return String(ticker || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidTicker(ticker) {
  return /^[A-Z0-9]{1,12}$/.test(ticker);
}

async function fetchMoexDividends(ticker) {
  const Core = require('./analytics-core');
  const url = MOEX_ISS + '/securities/' + encodeURIComponent(ticker) + '/dividends.json?iss.meta=off';
  const json = await moexFetchJson(url);
  const block = json.dividends;
  if (!block || !block.data || !block.data.length) return [];
  const cols = block.columns;
  const iDate = cols.indexOf('registryclosedate');
  const iVal = cols.indexOf('value');
  const rows = block.data.map(function (row) {
    return {
      date: String(row[iDate] || '').slice(0, 10),
      value: Number(row[iVal])
    };
  }).filter(function (d) { return d.date && isFinite(d.value) && d.value > 0; });
  return Core.normalizeMoexDividends(rows);
}

async function fetchMoexShareHistoryDaily(ticker) {
  const Core = require('./analytics-core');
  const till = new Date().toISOString().slice(0, 10);
  const windowYears = Core.getYieldWindowYears();
  const from = (windowYears[0] - 1) + '-01-01';
  const baseUrl = MOEX_ISS + '/history/engines/stock/markets/shares/boards/TQBR/securities/' +
    encodeURIComponent(ticker) + '.json?from=' + from + '&till=' + till +
    '&iss.meta=off&history.columns=TRADEDATE,CLOSE,VALUE';

  let all = [];
  let start = 0;
  let iDate = -1;
  let iClose = -1;
  let iVal = -1;

  while (true) {
    const json = await moexFetchJson(baseUrl + '&start=' + start);
    const hist = json.history;
    if (!hist || !hist.data || !hist.data.length) break;
    if (iDate < 0) {
      iDate = hist.columns.indexOf('TRADEDATE');
      iClose = hist.columns.indexOf('CLOSE');
      iVal = hist.columns.indexOf('VALUE');
    }
    hist.data.forEach(function (row) {
      const d = String(row[iDate] || '').slice(0, 10);
      const close = Number(row[iClose]);
      const val = Number(row[iVal]);
      if (!d) return;
      all.push({
        date: d,
        close: isFinite(close) ? close : null,
        value: isFinite(val) ? val : null,
        t: new Date(d + 'T12:00:00').getTime()
      });
    });
    const cur = json['history.cursor'] && json['history.cursor'].data && json['history.cursor'].data[0];
    const total = cur ? Number(cur[1]) : all.length;
    const pageSize = cur ? Number(cur[2]) : hist.data.length;
    if (pageSize > 0 && start + hist.data.length < total) start += pageSize;
    else break;
  }

  const byDate = {};
  all.forEach(function (r) { byDate[r.date] = r; });
  return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
}

async function fetchMoexQuote(ticker) {
  const url = MOEX_ISS + '/engines/stock/markets/shares/boards/TQBR/securities/' +
    encodeURIComponent(ticker) + '.json?iss.only=marketdata&iss.meta=off';
  const json = await moexFetchJson(url);
  const md = json.marketdata;
  if (!md || !md.data || !md.data.length) return { price: null, changePct: null, valueToday: null };
  const cols = md.columns;
  const row = md.data[0];
  const iLast = cols.indexOf('LAST');
  const iChange = cols.indexOf('LASTTOPREVPRICE');
  const iVal = cols.indexOf('VALTODAY');
  const price = Number(row[iLast]);
  const changePct = Number(row[iChange]);
  const valueToday = Number(row[iVal]);
  return {
    price: isFinite(price) ? price : null,
    changePct: isFinite(changePct) ? changePct : null,
    valueToday: isFinite(valueToday) ? valueToday : null
  };
}

module.exports = {
  normalizeTicker: normalizeTicker,
  isValidTicker: isValidTicker,
  fetchMoexDividends: fetchMoexDividends,
  fetchMoexShareHistoryDaily: fetchMoexShareHistoryDaily,
  fetchMoexQuote: fetchMoexQuote
};
