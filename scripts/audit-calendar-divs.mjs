#!/usr/bin/env node
/**
 * Жёсткая проверка: выплаты в UI стоят по календарному году отсечки.
 * Запуск: node scripts/audit-calendar-divs.mjs
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const Core = require('../analytics-core.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TICKERS = [
  'SBER', 'SBERP', 'GAZP', 'LKOH', 'GMKN', 'TATN', 'TATNP', 'NVTK', 'ROSN',
  'SNGS', 'SNGSP', 'MTSS', 'MGNT', 'YDEX', 'T', 'PLZL', 'CHMF', 'NLMK',
  'ALRS', 'MOEX', 'VTBR', 'IRAO', 'AFLT', 'MAGN', 'PHOR', 'PIKK', 'FLOT',
  'POSI', 'HEAD', 'SVCB', 'OZPH', 'CBOM', 'AFKS', 'RTKM', 'RTKMP', 'HYDR',
  'FEES', 'UPRO', 'MSNG', 'TRNFP', 'SIBN', 'BANEP', 'BANE', 'NMTP', 'RUAL'
];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function loadPatches() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dividend-patches.json'), 'utf8'));
    return raw && raw.byTicker ? raw.byTicker : {};
  } catch (e) {
    return {};
  }
}

async function fetchDivs(ticker, patches) {
  const j = await get('https://iss.moex.com/iss/securities/' + ticker + '/dividends.json?iss.meta=off');
  if (!j.dividends) return [];
  const c = j.dividends.columns;
  const iD = c.indexOf('registryclosedate');
  const iV = c.indexOf('value');
  const rows = (j.dividends.data || []).map((r) => ({
    date: String(r[iD]).slice(0, 10),
    value: Number(r[iV])
  })).filter((d) => d.date && isFinite(d.value) && d.value > 0);
  return Core.mergeDividendPatches(rows, patches[ticker] || []);
}

async function main() {
  const patches = loadPatches();
  const now = new Date('2026-08-04T12:00:00');
  let fail = 0;
  const y26summary = [];

  console.log('Calendar audit ·', TICKERS.length, 'tickers · Core', Core.VERSION);
  for (const t of TICKERS) {
    try {
      const divs = await fetchDivs(t, patches);
      const years = Core.buildDividendDisplayYears(divs, [], now);
      const problems = [];
      for (const y of years) {
        if (y.expectedDiv !== 0) problems.push(y.year + ':expected');
        if (y.calendar !== true) problems.push(y.year + ':no-calendar');
        for (const it of y.items || []) {
          if (it.estimated) problems.push(it.date + ':est');
          if (String(it.date).slice(0, 4) !== String(y.year)) {
            problems.push(it.date + '→' + y.year);
          }
        }
      }
      const y26 = years.find((y) => y.year === 2026);
      const items26 = y26 ? y26.items.map((i) => i.date.slice(5) + ':' + i.value).join('+') : '—';
      const sum26 = y26 ? y26.actualDiv : 0;

      if (t === 'LKOH') {
        if (!y26 || Math.abs(sum26 - 675) > 0.02) {
          problems.push('LKOH expect 675 got ' + sum26);
        }
        const dates = (y26 && y26.items || []).map((i) => i.date + ':' + i.value).sort().join(',');
        if (dates !== '2026-01-12:397,2026-05-04:278') {
          problems.push('LKOH items ' + dates);
        }
      }

      if (problems.length) {
        fail++;
        console.log('FAIL', t, problems.join('; '), '| 2026=', items26, 'sum=', sum26);
      } else {
        if (sum26 > 0) y26summary.push(t + ' ' + items26 + ' = ' + Number(sum26.toFixed(4)));
        console.log('OK  ', t, '2026:', sum26 > 0 ? items26 + ' = ' + Number(sum26.toFixed(4)) : 'пусто');
      }
    } catch (e) {
      fail++;
      console.log('ERR ', t, e.message || e);
    }
  }

  console.log('---');
  console.log('2026 с выплатами:', y26summary.length + '/' + TICKERS.length);
  y26summary.forEach((s) => console.log(' ', s));
  if (fail) {
    console.error('FAILED', fail);
    process.exit(1);
  }
  console.log('ALL CALENDAR OK');
}

main();
