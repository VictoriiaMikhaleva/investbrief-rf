#!/usr/bin/env node
/**
 * Smoke-агент InvestBrief RF: проверки до того, как их найдут пользователи.
 * Запуск: npm run smoke
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MOEX = 'https://iss.moex.com/iss';
const SITE_URL = process.env.SMOKE_SITE_URL ||
  'https://victoriiamikhaleva.github.io/investbrief-rf/';
const UA = 'InvestBriefSmoke/1.0 (+https://victoriiamikhaleva.github.io/investbrief-rf/)';

const errors = [];
const warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

async function checkMoexTopTurnoverLive() {
  const url = MOEX + '/engines/stock/markets/shares/boards/TQBR/securities.json' +
    '?iss.meta=off&marketdata.columns=SECID,LAST,VALTODAY&sort_column=VALTODAY&sort_order=desc&limit=25';
  const j = await fetchJson(url);
  const md = j.marketdata;
  if (!md || !md.data || !md.data.length) {
    fail('MOEX top turnover: пустой ответ marketdata');
    return;
  }
  const cols = md.columns;
  const iS = cols.indexOf('SECID');
  const iV = cols.indexOf('VALTODAY');
  const iL = cols.indexOf('LAST');
  const rows = md.data
    .map((r) => ({
      ticker: r[iS],
      val: Number(r[iV]),
      last: Number(r[iL])
    }))
    .filter((r) => r.ticker && isFinite(r.val) && r.val > 0 && isFinite(r.last) && r.last > 0);
  if (rows.length < 10) {
    fail('MOEX top turnover: мало ликвидных бумаг (' + rows.length + ')');
    return;
  }
  const top3 = rows.slice(0, 3).map((r) => r.ticker + ':' + Math.round(r.val / 1e6) + 'M').join(', ');
  console.log('OK   MOEX top turnover live · top3', top3);
}

async function checkMoexImoex() {
  const url = MOEX + '/engines/stock/markets/index/securities/IMOEX.json' +
    '?iss.only=marketdata&iss.meta=off&marketdata.columns=SECID,LAST,CURRENTVALUE';
  const j = await fetchJson(url);
  const md = j.marketdata;
  if (!md || !md.data || !md.data[0]) {
    fail('MOEX IMOEX: нет котировки');
    return;
  }
  const cols = md.columns;
  const row = md.data[0];
  const iLast = cols.indexOf('LAST');
  const iCur = cols.indexOf('CURRENTVALUE');
  const price = Number(row[iLast >= 0 ? iLast : iCur]);
  if (!isFinite(price) || price <= 0) {
    fail('MOEX IMOEX: некорректная цена');
    return;
  }
  console.log('OK   MOEX IMOEX ·', price.toFixed(2));
}

async function checkAkmmTotalReturn() {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const Core = require('../analytics-core.js');
  const till = new Date().toISOString().slice(0, 10);
  const from = Core.getYieldWindowYears()[0] - 1 + '-01-01';

  async function fetchBoard(board) {
    let all = [];
    let start = 0;
    while (true) {
      const url = MOEX + '/history/engines/stock/markets/shares/boards/' + board +
        '/securities/AKMM.json?from=' + from + '&till=' + till +
        '&iss.meta=off&history.columns=TRADEDATE,CLOSE&start=' + start;
      const j = await fetchJson(url);
      if (!j.history || !j.history.data.length) break;
      const iD = j.history.columns.indexOf('TRADEDATE');
      const iC = j.history.columns.indexOf('CLOSE');
      j.history.data.forEach((r) => {
        all.push({ date: String(r[iD]).slice(0, 10), close: Number(r[iC]) });
      });
      const cur = j['history.cursor'] && j['history.cursor'].data && j['history.cursor'].data[0];
      const total = cur ? Number(cur[1]) : all.length;
      const page = j.history.data.length;
      if (page > 0 && start + page < total) start += page;
      else break;
    }
    return all;
  }

  const byDate = {};
  (await fetchBoard('TQTF')).forEach((r) => { byDate[r.date] = r; });
  (await fetchBoard('TQBR')).forEach((r) => { byDate[r.date] = r; });
  const history = Object.keys(byDate).sort().map((d) => byDate[d]);
  const tr = Core.buildMetricsFromMoex([], history, null).totalReturn12m;
  const pct = tr && tr.pct;
  if (history.length < 500) {
    fail('AKMM history TQTF+TQBR: мало строк (' + history.length + ')');
    return;
  }
  if (pct == null || !isFinite(pct) || pct <= 5) {
    fail('AKMM полная доходность 12м: ' + pct + ' (ожидали >5% при объединённой истории)');
    return;
  }
  console.log('OK   AKMM total return 12m ·', pct.toFixed(1) + '%', '· hist', history.length);
}

function checkTopTurnoverSnapshot() {
  const file = path.join(ROOT, 'data', 'top-turnover.json');
  if (!fs.existsSync(file)) {
    fail('top-turnover.json: файл отсутствует');
    return;
  }
  let snap;
  try {
    snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail('top-turnover.json: не JSON');
    return;
  }
  const top = snap && snap.data && snap.data.top;
  if (!Array.isArray(top) || top.length < 10) {
    fail('top-turnover.json: мало строк в top (' + (top ? top.length : 0) + ')');
    return;
  }
  const updatedAt = snap.updatedAt ? new Date(snap.updatedAt).getTime() : NaN;
  const ageMin = isFinite(updatedAt) ? (Date.now() - updatedAt) / 60000 : Infinity;
  if (ageMin > 30) {
    warn('top-turnover.json: снимку ' + Math.round(ageMin) + ' мин (ожидали ≤30 в торговую сессию)');
  } else {
    console.log('OK   top-turnover.json · возраст', Math.round(ageMin), 'мин');
  }
}

function runScript(rel, label) {
  const script = path.join(ROOT, rel);
  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000
  });
  if (r.status !== 0) {
    const tail = (r.stderr || r.stdout || '').trim().split('\n').slice(-8).join('\n');
    fail(label + ' failed' + (tail ? ': ' + tail : ''));
    return;
  }
  console.log('OK  ', label);
}

async function checkSiteLoads() {
  const res = await fetch(SITE_URL, {
    headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' }
  });
  if (!res.ok) {
    fail('Site ' + SITE_URL + ': HTTP ' + res.status);
    return;
  }
  const html = await res.text();
  if (!html.includes('InvestBrief') && !html.includes('ИнвестБриф')) {
    fail('Site: не похож на InvestBrief (нет заголовка)');
    return;
  }
  if (!html.includes('ibrf-asset-version') && !html.includes('styles.css?v=')) {
    warn('Site: не найден маркер версии assets (cache bust)');
  }
  console.log('OK   Site loads ·', SITE_URL);
}

async function main() {
  console.log('InvestBrief smoke ·', new Date().toISOString());
  try {
    await checkMoexImoex();
    await checkMoexTopTurnoverLive();
    await checkAkmmTotalReturn();
  } catch (e) {
    fail('MOEX: ' + (e.message || e));
  }
  checkTopTurnoverSnapshot();
  runScript('scripts/test-agent.mjs', 'agent smoke');
  runScript('scripts/sync-analytics-core.mjs', 'sync analytics core');
  runScript('scripts/test-analytics.mjs', 'analytics MOEX');
  try {
    await checkSiteLoads();
  } catch (e) {
    fail('Site: ' + (e.message || e));
  }

  if (warnings.length) {
    console.log('--- warnings ---');
    warnings.forEach((w) => console.warn(' •', w));
  }
  if (errors.length) {
    console.error('--- FAILED ---');
    errors.forEach((e) => console.error(' •', e));
    process.exit(1);
  }
  console.log('All smoke checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
