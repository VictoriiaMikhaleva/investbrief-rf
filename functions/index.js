/**
 * Серверный сторож InvestBrief RF.
 * Раз в час проверяет доступность ключевых источников и пишет метку в Firestore:
 *   meta/watchdog
 *
 * Деплой (из корня investbrief-rf, после firebase login):
 *   cd functions && npm install && cd ..
 *   firebase deploy --only functions:dataWatchdogHourly,firestore:rules
 */
'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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
    version: '1.0'
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
