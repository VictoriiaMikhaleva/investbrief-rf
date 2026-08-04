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
  const fs = require('fs');
  const path = require('path');
  const url = MOEX_ISS + '/securities/' + encodeURIComponent(ticker) + '/dividends.json?iss.meta=off';
  const json = await moexFetchJson(url);
  const block = json.dividends;
  let rows = [];
  if (block && block.data && block.data.length) {
    const cols = block.columns;
    const iDate = cols.indexOf('registryclosedate');
    const iVal = cols.indexOf('value');
    rows = block.data.map(function (row) {
      return {
        date: String(row[iDate] || '').slice(0, 10),
        value: Number(row[iVal])
      };
    }).filter(function (d) { return d.date && isFinite(d.value) && d.value > 0; });
  }
  let patchRows = [];
  try {
    const patchPath = path.join(__dirname, '..', '..', 'data', 'dividend-patches.json');
    const raw = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
    if (raw && raw.byTicker && Array.isArray(raw.byTicker[ticker])) {
      patchRows = raw.byTicker[ticker];
    }
  } catch (e) { /* optional */ }
  return Core.mergeDividendPatches(rows, patchRows);
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
  let history = Object.keys(byDate).sort().map(function (d) { return byDate[d]; });

  if (Core.isHistoryVolumeBehindQuotes(history)) {
    const lastVol = Core.moexHistoryLastVolumeDate(history);
    if (lastVol) {
      const next = new Date(lastVol + 'T12:00:00');
      next.setDate(next.getDate() + 1);
      const tailFrom = next.toISOString().slice(0, 10);
      const tailUrl = MOEX_ISS + '/history/engines/stock/markets/shares/boards/TQBR/securities/' +
        encodeURIComponent(ticker) + '.json?from=' + tailFrom + '&till=' + till +
        '&iss.meta=off&history.columns=TRADEDATE,CLOSE,VALUE';
      let tailStart = 0;
      let tDate = -1;
      let tClose = -1;
      let tVal = -1;
      while (true) {
        const tailJson = await moexFetchJson(tailUrl + '&start=' + tailStart);
        const tailHist = tailJson.history;
        if (!tailHist || !tailHist.data || !tailHist.data.length) break;
        if (tDate < 0) {
          tDate = tailHist.columns.indexOf('TRADEDATE');
          tClose = tailHist.columns.indexOf('CLOSE');
          tVal = tailHist.columns.indexOf('VALUE');
        }
        tailHist.data.forEach(function (row) {
          const d = String(row[tDate] || '').slice(0, 10);
          const close = Number(row[tClose]);
          const val = Number(row[tVal]);
          if (!d) return;
          byDate[d] = {
            date: d,
            close: isFinite(close) ? close : null,
            value: isFinite(val) ? val : null,
            t: new Date(d + 'T12:00:00').getTime()
          };
        });
        const tailCur = tailJson['history.cursor'] && tailJson['history.cursor'].data && tailJson['history.cursor'].data[0];
        const tailTotal = tailCur ? Number(tailCur[1]) : tailAll.length;
        const tailPage = tailCur ? Number(tailCur[2]) : tailHist.data.length;
        if (tailPage > 0 && tailStart + tailHist.data.length < tailTotal) tailStart += tailPage;
        else break;
      }
      history = Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
    }
  }
  return history;
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
