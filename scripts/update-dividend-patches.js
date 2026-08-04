/**
 * Обновляет data/dividend-patches.json: выплаты со Smart-Lab, которых ещё нет в MOEX ISS.
 * Запуск: node scripts/update-dividend-patches.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'dividend-patches.json');
const MOEX = 'https://iss.moex.com/iss';
const UA = 'InvestBriefRF/1.0 (+https://victoriiamikhaleva.github.io/investbrief-rf/)';

const DEFAULT_TICKERS = [
  'SBER', 'SBERP', 'GAZP', 'LKOH', 'GMKN', 'TATN', 'TATNP', 'NVTK', 'ROSN',
  'SNGS', 'SNGSP', 'MTSS', 'MGNT', 'YDEX', 'T', 'PLZL', 'CHMF', 'NLMK',
  'ALRS', 'MOEX', 'VTBR', 'IRAO', 'AFLT', 'MAGN', 'PHOR', 'PIKK', 'FLOT',
  'POSI', 'HEAD', 'SVCB', 'OZPH', 'CBOM', 'AFKS', 'RTKM', 'RTKMP', 'HYDR',
  'FEES', 'UPRO', 'MSNG', 'TRNFP', 'SIBN', 'BANEP', 'BANE', 'NMTP', 'RUAL'
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

function dmyToIso(dmy) {
  const p = String(dmy || '').trim().split('.');
  if (p.length !== 3) return '';
  return p[2] + '-' + p[1] + '-' + p[0];
}

async function fetchMoexDividends(ticker) {
  const url = MOEX + '/securities/' + encodeURIComponent(ticker) + '/dividends.json?iss.meta=off';
  const json = await fetchJson(url);
  const block = json.dividends;
  if (!block || !block.data) return [];
  const cols = block.columns;
  const iD = cols.indexOf('registryclosedate');
  const iV = cols.indexOf('value');
  return block.data.map((row) => ({
    date: String(row[iD] || '').slice(0, 10),
    value: Number(row[iV])
  })).filter((d) => d.date.length === 10 && isFinite(d.value) && d.value > 0);
}

async function fetchSmartLabDividends(ticker) {
  const html = await fetchText('https://smart-lab.ru/q/' + encodeURIComponent(ticker) + '/dividend/');
  const re = /<tr[^>]*>\s*<td>([A-Z0-9]+)<\/td>\s*<td>(\d{2}\.\d{2}\.\d{4})<\/td>\s*<td>(\d{2}\.\d{2}\.\d{4})<\/td>\s*<td>[^<]*<\/td>\s*<td><strong\s*>([\d\s]+(?:[.,]\d+)?)<\/strong>\s*₽<\/td>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const sec = String(m[1] || '').toUpperCase();
    if (sec !== String(ticker).toUpperCase()) continue;
    const date = dmyToIso(m[3]);
    const value = parseFloat(String(m[4]).replace(/\s/g, '').replace(',', '.'));
    if (!date || !isFinite(value) || value <= 0) continue;
    out.push({ date, value });
  }
  const seen = new Set();
  return out.filter((r) => {
    const k = r.date + ':' + r.value;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function moexHasNear(moexRows, date, value) {
  const t1 = new Date(date + 'T12:00:00').getTime();
  if (isNaN(t1)) return false;
  // Если в ISS уже есть выплата около этой даты — доверяем MOEX, не дублируем чужой суммой.
  return moexRows.some((m) => {
    const t0 = new Date(m.date + 'T12:00:00').getTime();
    if (isNaN(t0)) return false;
    return Math.abs(t1 - t0) <= 5 * 24 * 60 * 60 * 1000;
  });
}

function collectTickers() {
  const set = new Set(DEFAULT_TICKERS);
  try {
    const top = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'top-turnover.json'), 'utf8'));
    const rows = (top && top.data && (top.data.top || top.data.rows || top.data)) || [];
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      const t = String((r && (r.ticker || r.secid || r.SECID)) || '').toUpperCase();
      if (/^[A-Z0-9]{2,12}$/.test(t)) set.add(t);
    });
  } catch (e) { /* */ }
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    Object.keys((prev && prev.byTicker) || {}).forEach((t) => set.add(String(t).toUpperCase()));
  } catch (e) { /* */ }
  return [...set].sort();
}

async function main() {
  const tickers = collectTickers();
  const byTicker = {};
  const stats = { ok: 0, patched: 0, fail: 0, patchRows: 0 };
  const minDate = '2024-01-01';

  console.log('[dividend-patches] tickers:', tickers.length);

  for (const ticker of tickers) {
    try {
      const [moex, smart] = await Promise.all([
        fetchMoexDividends(ticker).catch(() => []),
        fetchSmartLabDividends(ticker).catch(() => [])
      ]);
      const missing = smart.filter((r) => r.date >= minDate && !moexHasNear(moex, r.date, r.value));
      if (missing.length) {
        byTicker[ticker] = missing.map((r) => ({
          date: r.date,
          value: Number(Number(r.value).toFixed(6)),
          note: 'Smart-Lab (дополнение к MOEX ISS)'
        }));
        stats.patchRows += missing.length;
        console.log('[ok]', ticker, 'patches', missing.map((r) => r.date + ':' + r.value).join(', '));
      } else {
        console.log('[ok]', ticker, 'moex covers smart-lab');
      }
      stats.ok++;
    } catch (e) {
      stats.fail++;
      console.warn('[fail]', ticker, e.message || e);
    }
    await sleep(250);
  }

  // Preserve known issuer-disclosure rows if Smart-Lab missed them
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const prevMap = (prev && prev.byTicker) || {};
    Object.keys(prevMap).forEach((t) => {
      const rows = prevMap[t] || [];
      const disclosure = rows.filter((r) => /эмитент|раскрыт|собрани/i.test(String(r.note || '')));
      if (!disclosure.length) return;
      const cur = byTicker[t] ? byTicker[t].slice() : [];
      disclosure.forEach((d) => {
        if (!cur.some((c) => c.date === d.date && Math.abs(c.value - d.value) < 0.02)) {
          cur.push({ date: d.date, value: d.value, note: d.note });
        }
      });
      cur.sort((a, b) => a.date.localeCompare(b.date));
      byTicker[t] = cur;
    });
  } catch (e) { /* */ }

  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'Smart-Lab dividend pages + раскрытие эмитента (дополнение к запаздывающему MOEX ISS)',
    byTicker
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log('[done]', OUT);
  console.log(JSON.stringify(stats));
  stats.patched = Object.keys(byTicker).length;
  console.log('tickers with patches:', stats.patched, 'rows:', stats.patchRows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
