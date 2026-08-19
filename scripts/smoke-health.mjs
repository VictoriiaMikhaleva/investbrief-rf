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
