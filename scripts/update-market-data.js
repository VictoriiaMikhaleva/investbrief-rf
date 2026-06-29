#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MOEX = 'https://iss.moex.com/iss';

const AGENT_THRESHOLDS = {
  dayMoveThreshold: 3,
  weekDownThreshold: 7,
  weekUpThreshold: 8,
  turnoverMultiplier: 1.5
};

const DEFAULT_AGENT_TICKERS = [
  'SBER', 'GAZP', 'LKOH', 'GMKN', 'TATN', 'NVTK', 'ROSN', 'SNGS', 'SNGSP',
  'PLZL', 'MGNT', 'MTSS', 'MOEX', 'AFLT', 'ALRS', 'CHMF', 'NLMK', 'SVCB', 'OZPH', 'YDEX'
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function toYmd(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readDataFile(name) {
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeDataFile(name, payload) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function updateFile(name, source, builder) {
  const prev = readDataFile(name);
  const ts = nowIso();
  try {
    const data = await builder();
    const payload = {
      status: 'ok',
      updatedAt: ts,
      source,
      message: 'Данные обновлены',
      data
    };
    writeDataFile(name, payload);
    console.log(`[ok] ${name}`);
    return payload;
  } catch (err) {
    const msg = err && err.message ? String(err.message) : 'Источник недоступен';
    if (prev && prev.data) {
      const stale = Object.assign({}, prev, {
        status: 'stale',
        source: prev.source || source,
        message: msg,
        lastErrorAt: ts
      });
      writeDataFile(name, stale);
      console.log(`[stale] ${name}: ${msg}`);
      return stale;
    }
    const fail = {
      status: 'error',
      updatedAt: ts,
      source,
      message: msg,
      lastErrorAt: ts,
      data: null
    };
    writeDataFile(name, fail);
    console.log(`[error] ${name}: ${msg}`);
    return fail;
  }
}

async function fetchTopTurnoverData() {
  const q = '?iss.meta=off&securities.columns=SECID,SHORTNAME&marketdata.columns=SECID,LAST,VALTODAY,LASTTOPREVPRICE&limit=120';
  const topJson = await fetchJson(`${MOEX}/engines/stock/markets/shares/boards/TQBR/securities.json${q}`);
  const md = topJson.marketdata;
  const sec = topJson.securities;
  if (!md || !md.columns || !md.data) throw new Error('TQBR marketdata unavailable');
  const iSec = md.columns.indexOf('SECID');
  const iLast = md.columns.indexOf('LAST');
  const iVal = md.columns.indexOf('VALTODAY');
  const iChg = md.columns.indexOf('LASTTOPREVPRICE');
  const names = {};
  if (sec && sec.data) {
    sec.data.forEach((row) => { names[row[0]] = row[1] || row[0]; });
  }
  const top = md.data
    .map((row) => ({
      ticker: row[iSec],
      name: names[row[iSec]] || row[iSec],
      price: safeNumber(row[iLast]),
      valToday: safeNumber(row[iVal]),
      changePct: safeNumber(row[iChg])
    }))
    .filter((r) => r.ticker && r.price != null && r.valToday != null && r.valToday > 0)
    .sort((a, b) => b.valToday - a.valToday)
    .slice(0, 20);

  if (!top.length) throw new Error('No top turnover rows');

  const till = new Date();
  const from = new Date(till);
  from.setDate(from.getDate() - 21);
  const histUrl = `${MOEX}/history/engines/stock/markets/index/securities/IMOEX.json` +
    `?from=${toYmd(from)}&till=${toYmd(till)}&iss.meta=off&history.columns=TRADEDATE,VALUE`;
  const histJson = await fetchJson(histUrl);
  const hist = histJson.history;
  if (!hist || !hist.columns || !hist.data) throw new Error('IMOEX turnover unavailable');
  const iDate = hist.columns.indexOf('TRADEDATE');
  const iValue = hist.columns.indexOf('VALUE');
  const turnoverWeek = hist.data
    .map((row) => ({ date: String(row[iDate] || '').slice(0, 10), value: safeNumber(row[iValue]) }))
    .filter((r) => r.date && r.value != null)
    .slice(-7);
  if (!turnoverWeek.length) throw new Error('No IMOEX turnover week');

  return { top, turnoverWeek };
}

async function fetchMarketSnapshotData() {
  const out = { imoex: null, keyRate: null, fx: { USD: null, EUR: null, CNY: null } };

  const imoexUrl = `${MOEX}/engines/stock/markets/index/securities/IMOEX.json` +
    '?iss.only=marketdata&iss.meta=off&marketdata.columns=SECID,CURRENTVALUE,LASTCHANGEPRC';
  const imoex = await fetchJson(imoexUrl);
  const md = imoex.marketdata;
  if (md && md.columns && md.data && md.data[0]) {
    const iVal = md.columns.indexOf('CURRENTVALUE');
    const iChg = md.columns.indexOf('LASTCHANGEPRC');
    out.imoex = {
      price: safeNumber(md.data[0][iVal]),
      changePct: safeNumber(md.data[0][iChg])
    };
  }

  const cbr = await fetchJson('https://www.cbr-xml-daily.ru/daily_json.js');
  if (cbr && cbr.Valute) {
    ['USD', 'EUR', 'CNY'].forEach((code) => {
      const v = cbr.Valute[code];
      if (!v) return;
      const nominal = safeNumber(v.Nominal) || 1;
      const price = safeNumber(v.Value) != null ? safeNumber(v.Value) / nominal : null;
      const prev = safeNumber(v.Previous) != null ? safeNumber(v.Previous) / nominal : null;
      const changePct = prev && prev > 0 && price != null ? ((price - prev) / prev) * 100 : null;
      out.fx[code] = { price, changePct };
    });
  }

  const keyRateHtml = await fetch('https://www.cbr.ru/hd_base/KeyRate/');
  if (keyRateHtml.ok) {
    const html = await keyRateHtml.text();
    const rows = [...html.matchAll(/<td[^>]*>\s*(\d{2}\.\d{2}\.\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d]+[,.][\d]+)\s*<\/td>/gi)];
    if (rows.length) {
      const latest = rows[0];
      const prev = rows[1];
      const rate = safeNumber(String(latest[2]).replace(',', '.'));
      const prevRate = prev ? safeNumber(String(prev[2]).replace(',', '.')) : null;
      const changePct = prevRate && prevRate > 0 && rate != null ? ((rate - prevRate) / prevRate) * 100 : null;
      out.keyRate = { rate, changePct, date: latest[1] };
    }
  }

  if (!out.imoex && !out.keyRate && !out.fx.USD && !out.fx.EUR && !out.fx.CNY) {
    throw new Error('Market snapshot empty');
  }
  return out;
}

async function fetchTickerCandlesMonth(ticker) {
  const till = new Date();
  const from = new Date(till);
  from.setDate(from.getDate() - 40);
  const url = `${MOEX}/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(ticker)}/candles.json` +
    `?from=${toYmd(from)}&till=${toYmd(till)}&interval=24&iss.meta=off`;
  const json = await fetchJson(url);
  const c = json.candles;
  if (!c || !c.columns || !c.data) return [];
  const iClose = c.columns.indexOf('close');
  const iBegin = c.columns.indexOf('begin');
  return c.data.map((row) => ({
    t: new Date(row[iBegin]).getTime(),
    price: safeNumber(row[iClose])
  })).filter((p) => Number.isFinite(p.t) && p.price != null);
}

function pctChange(first, last) {
  if (first == null || last == null || first === 0) return null;
  return ((last - first) / first) * 100;
}

function signalTitles(d) {
  if (!d || d.insufficient) return [];
  const s = [];
  if (d.dayChangePct != null && d.dayChangePct <= -AGENT_THRESHOLDS.dayMoveThreshold) s.push('day-down');
  if (d.dayChangePct != null && d.dayChangePct >= AGENT_THRESHOLDS.dayMoveThreshold) s.push('day-up');
  if (d.weekChangePct != null && d.weekChangePct <= -AGENT_THRESHOLDS.weekDownThreshold) s.push('week-down');
  if (d.weekChangePct != null && d.weekChangePct >= AGENT_THRESHOLDS.weekUpThreshold) s.push('week-up');
  if (d.todayTurnover != null && d.avgTurnover7d != null && d.avgTurnover7d > 0 &&
      d.todayTurnover >= d.avgTurnover7d * AGENT_THRESHOLDS.turnoverMultiplier) s.push('turnover-high');
  if (d.monthHigh != null && d.monthLow != null && d.monthHigh > d.monthLow && d.currentPrice != null) {
    const range = d.monthHigh - d.monthLow;
    if (d.currentPrice <= d.monthLow + range * 0.15) s.push('month-low');
    if (d.currentPrice >= d.monthHigh - range * 0.15) s.push('month-high');
  }
  return s;
}

function mapSignalTitle(id) {
  if (id === 'day-down') return 'Заметное снижение за день';
  if (id === 'day-up') return 'Заметный рост за день';
  if (id === 'week-down') return 'Снижение за неделю';
  if (id === 'week-up') return 'Рост за неделю';
  if (id === 'turnover-high') return 'Оборот выше среднего';
  if (id === 'month-low') return 'Близко к нижней границе месяца';
  if (id === 'month-high') return 'Близко к верхней границе месяца';
  return id;
}

function deriveStatus(signalIds) {
  if (!signalIds || !signalIds.length) return 'Спокойно';
  if (signalIds.includes('day-down') || signalIds.includes('day-up')) return 'Сильное движение';
  return 'Зона внимания';
}

async function fetchAgentSignalsData() {
  const topData = await fetchTopTurnoverData();
  const tickers = (topData.top || []).map((r) => r.ticker).filter(Boolean);
  const universe = tickers.length ? tickers : DEFAULT_AGENT_TICKERS.slice(0, 20);
  const cards = [];

  for (const row of universe) {
    const ticker = typeof row === 'string' ? row : row.ticker;
    const topRow = (topData.top || []).find((r) => r.ticker === ticker) || null;
    try {
      const series = await fetchTickerCandlesMonth(ticker);
      if (series.length < 2 || !topRow || topRow.price == null) {
        cards.push({
          ticker,
          name: topRow ? topRow.name : ticker,
          insufficient: true,
          currentPrice: topRow ? topRow.price : null,
          dayChangePct: topRow ? topRow.changePct : null,
          signals: [],
          status: 'Спокойно'
        });
        continue;
      }
      const monthPrices = series.map((p) => p.price).filter((v) => v != null);
      const weekSlice = series.slice(-7);
      const weekChange = weekSlice.length >= 2 ? pctChange(weekSlice[0].price, weekSlice[weekSlice.length - 1].price) : null;
      const turnoverSeries = []; // No daily turnover series in this script (avoid extra 20 history calls).
      const avg7 = turnoverSeries.length
        ? (turnoverSeries.reduce((a, v) => a + v, 0) / turnoverSeries.length)
        : null;

      const data = {
        ticker,
        currentPrice: topRow.price,
        dayChangePct: topRow.changePct,
        weekChangePct: weekChange,
        monthHigh: monthPrices.length ? Math.max(...monthPrices) : null,
        monthLow: monthPrices.length ? Math.min(...monthPrices) : null,
        todayTurnover: topRow.valToday,
        avgTurnover7d: avg7,
        insufficient: false
      };
      const ids = signalTitles(data);
      cards.push({
        ticker,
        name: topRow.name || ticker,
        insufficient: false,
        currentPrice: data.currentPrice,
        dayChangePct: data.dayChangePct,
        signals: ids.map((id) => ({ id, title: mapSignalTitle(id), reasons: [], checklist: [] })),
        status: deriveStatus(ids)
      });
    } catch (_) {
      cards.push({
        ticker,
        name: topRow ? topRow.name : ticker,
        insufficient: true,
        currentPrice: topRow ? topRow.price : null,
        dayChangePct: topRow ? topRow.changePct : null,
        signals: [],
        status: 'Спокойно'
      });
    }
  }

  return {
    tickers: universe,
    thresholds: AGENT_THRESHOLDS,
    cards
  };
}

async function fetchOfzData() {
  const url = `${MOEX}/engines/stock/markets/bonds/boards/TQOB/securities.json` +
    '?iss.meta=off&iss.only=securities,marketdata' +
    '&securities.columns=SECID,SHORTNAME,COUPONPERCENT,MATDATE,COUPONPERIOD,FACEVALUE,COUPONVALUE,NEXTCOUPON,ACCRUEDINT' +
    '&marketdata.columns=SECID,LAST,YIELDATWAPRICE,VALTODAY,DURATION,UPDATETIME&limit=500';
  const json = await fetchJson(url);
  const sec = json.securities;
  const md = json.marketdata;
  if (!sec || !sec.columns || !sec.data || !sec.data.length) throw new Error('OFZ securities unavailable');
  const s = {
    secid: sec.columns.indexOf('SECID'),
    name: sec.columns.indexOf('SHORTNAME'),
    cp: sec.columns.indexOf('COUPONPERCENT'),
    mat: sec.columns.indexOf('MATDATE'),
    period: sec.columns.indexOf('COUPONPERIOD'),
    fv: sec.columns.indexOf('FACEVALUE'),
    cv: sec.columns.indexOf('COUPONVALUE'),
    next: sec.columns.indexOf('NEXTCOUPON'),
    ai: sec.columns.indexOf('ACCRUEDINT')
  };
  const mdMap = {};
  if (md && md.columns && md.data) {
    const m = {
      secid: md.columns.indexOf('SECID'),
      last: md.columns.indexOf('LAST'),
      yld: md.columns.indexOf('YIELDATWAPRICE'),
      vol: md.columns.indexOf('VALTODAY'),
      duration: md.columns.indexOf('DURATION'),
      upd: md.columns.indexOf('UPDATETIME')
    };
    md.data.forEach((row) => {
      mdMap[row[m.secid]] = {
        price: safeNumber(row[m.last]),
        yieldPct: safeNumber(row[m.yld]),
        vol: safeNumber(row[m.vol]),
        durationDays: safeNumber(row[m.duration]),
        updateTime: row[m.upd] || null
      };
    });
  }
  const catalog = sec.data
    .filter((row) => /ОФЗ|OFZ/i.test(String(row[s.name] || '')))
    .map((row) => {
      const secid = row[s.secid];
      const mdRow = mdMap[secid] || {};
      return {
        secid,
        ticker: secid,
        shortname: row[s.name] || secid,
        couponPct: safeNumber(row[s.cp]),
        matDate: row[s.mat] || null,
        couponPeriod: safeNumber(row[s.period]),
        faceValue: safeNumber(row[s.fv]),
        couponValue: safeNumber(row[s.cv]),
        nextCoupon: row[s.next] || null,
        accruedInt: safeNumber(row[s.ai]),
        last: mdRow.price,
        yieldPct: mdRow.yieldPct,
        vol: mdRow.vol || 0,
        durationDays: mdRow.durationDays,
        updateTime: mdRow.updateTime
      };
    })
    .sort((a, b) => (b.vol || 0) - (a.vol || 0));

  if (!catalog.length) throw new Error('OFZ catalog empty');
  return { catalog };
}

async function main() {
  ensureDataDir();
  await updateFile('top-turnover.json', 'MOEX ISS', fetchTopTurnoverData);
  await updateFile('market-snapshot.json', 'MOEX ISS + CBR', fetchMarketSnapshotData);
  await updateFile('agent-signals.json', 'MOEX ISS', fetchAgentSignalsData);
  await updateFile('ofz.json', 'MOEX ISS', fetchOfzData);
  try {
    const { buildCatalog, writePifSnapshots } = require('./build-pif-data');
    const built = await buildCatalog();
    await writePifSnapshots(built);
    console.log('[ok] pif-index.json', built.stats);
  } catch (err) {
    console.error('[warn] pif registry:', err.message || err);
  }
  try {
    const { main: fetchUk } = require('./fetch-uk-pif-data');
    await fetchUk();
  } catch (err) {
    console.error('[warn] pif uk:', err.message || err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
