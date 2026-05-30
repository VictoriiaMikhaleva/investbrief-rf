/**
 * Серверный сторож + API аналитики InvestBrief RF.
 *
 * Деплой (из корня investbrief-rf, после firebase login):
 *   npm run sync:core
 *   cd functions && npm install && cd ..
 *   npm run deploy:api
 */
'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { buildTickerAnalytics, runSpotCheck } = require('./lib/build-analytics');

initializeApp();
const db = getFirestore();

const CHECKS = [
  {
    id: 'moexImoex',
    url: 'https://iss.moex.com/iss/engines/stock/markets/index/securities/IMOEX.json' +
      '?iss.only=marketdata&iss.meta=off&marketdata.columns=SECID,LAST'
  },
  {
    id: 'cbrFx',
    url: 'https://www.cbr-xml-daily.ru/daily_json.js'
  },
  {
    id: 'moexForts',
    url: 'https://iss.moex.com/iss/engines/futures/markets/forts/securities.json' +
      '?iss.meta=off&limit=10&marketdata.columns=SECID,LAST'
  },
  {
    id: 'cbrNews',
    url: 'https://www.cbr.ru/rss/RssNews'
  }
];

const MIN_OK_SOURCES = 2;
const FETCH_TIMEOUT_MS = 20000;
const STALE_TRADE_DAYS = 4;

async function checkMoexGazpHistoryFresh() {
  const till = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 14);
  const from = fromDate.toISOString().slice(0, 10);
  const url =
    'https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/GAZP.json' +
    '?from=' + from + '&till=' + till +
    '&iss.meta=off&history.columns=TRADEDATE&start=0';
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'InvestBriefWatchdog/1.1 (+https://victoriiamikhaleva.github.io/investbrief-rf/)' }
    });
    if (!res.ok) {
      return { id: 'moexGazpHistory', ok: false, latencyMs: Date.now() - started, status: res.status };
    }
    const json = await res.json();
    const cols = json.history && json.history.columns;
    const rows = json.history && json.history.data;
    if (!cols || !rows || !rows.length) {
      return { id: 'moexGazpHistory', ok: false, latencyMs: Date.now() - started, error: 'empty_history' };
    }
    const iDate = cols.indexOf('TRADEDATE');
    var last = '';
    rows.forEach(function (row) {
      var d = String(row[iDate] || '').slice(0, 10);
      if (d && (!last || d > last)) last = d;
    });
    const lastMs = new Date(last + 'T20:00:00').getTime();
    const todayMs = new Date(till + 'T20:00:00').getTime();
    const stale = todayMs - lastMs > STALE_TRADE_DAYS * 24 * 60 * 60 * 1000;
    return {
      id: 'moexGazpHistory',
      ok: !stale,
      latencyMs: Date.now() - started,
      lastTradeDate: last,
      stale: stale
    };
  } catch (err) {
    return {
      id: 'moexGazpHistory',
      ok: false,
      latencyMs: Date.now() - started,
      error: err && err.message ? String(err.message) : 'fetch_error'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function pingSource(id, url) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'InvestBriefWatchdog/1.0 (+https://victoriiamikhaleva.github.io/investbrief-rf/)' }
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { id: id, ok: false, latencyMs: latencyMs, status: res.status };
    }
    const body = await res.text();
    const ok = body && body.length > 40;
    return { id: id, ok: ok, latencyMs: latencyMs, status: res.status };
  } catch (err) {
    return {
      id: id,
      ok: false,
      latencyMs: Date.now() - started,
      error: err && err.message ? String(err.message) : 'fetch_error'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runServerWatchdog() {
  const results = await Promise.all(CHECKS.map(function (c) {
    return pingSource(c.id, c.url);
  }));
  const gazpHist = await checkMoexGazpHistoryFresh();
  results.push(gazpHist);
  const sources = {};
  results.forEach(function (r) { sources[r.id] = r; });
  const okCount = results.filter(function (r) { return r.ok; }).length;
  const payload = {
    updatedAt: FieldValue.serverTimestamp(),
    checkId: 'wd_' + Date.now(),
    intervalMinutes: 60,
    ok: okCount >= MIN_OK_SOURCES,
    okCount: okCount,
    totalChecks: results.length,
    sources: sources,
    version: '1.1'
  };
  await db.doc('meta/watchdog').set(payload, { merge: true });
  console.log('watchdog ok=', payload.ok, 'sources=', okCount + '/' + results.length);
  return payload;
}

exports.dataWatchdogHourly = onSchedule({
  schedule: 'every 60 minutes',
  timeZone: 'Europe/Moscow',
  retryCount: 1
}, async function () {
  await runServerWatchdog();
});

function sendJson(res, status, body) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(status).json(body);
}

exports.getAnalytics = onRequest({
  region: 'europe-west1',
  cors: true,
  maxInstances: 20,
  timeoutSeconds: 60
}, async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*');
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const path = String(req.path || '');
  if (path.indexOf('spot-check') >= 0 || req.query.spot === '1') {
    try {
      const report = await runSpotCheck();
      sendJson(res, report.ok ? 200 : 503, report);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || 'spot_check_failed' });
    }
    return;
  }

  const ticker = String(req.query.ticker || req.query.t || '').trim().toUpperCase() ||
    String((path.match(/\/([^/]+)\/?$/) || [])[1] || '').trim().toUpperCase();

  if (!ticker) {
    sendJson(res, 400, { error: 'ticker_required' });
    return;
  }

  try {
    const force = req.query.refresh === '1' || req.query.force === '1';
    const data = await buildTickerAnalytics(ticker, { forceRefresh: force });
    res.set('Cache-Control', 'public, max-age=300');
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, err.status || 500, {
      error: err.message || 'analytics_error',
      ticker: ticker
    });
  }
});
