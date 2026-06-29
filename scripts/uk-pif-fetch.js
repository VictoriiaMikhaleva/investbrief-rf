#!/usr/bin/env node
'use strict';

const UA = 'InvestBrief/1.0 (+https://github.com/VictoriiaMikhaleva/investbrief-rf)';

function trimStr(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function slugToAnalyticsPath(slug) {
  if (!slug) return '';
  return String(slug).replace(/_/g, '-');
}

function extractFundArrays(html) {
  const arrays = [];
  let pos = 0;
  while (pos < html.length) {
    const idx = html.indexOf('"fundId"', pos);
    if (idx < 0) break;
    let start = idx;
    while (start > 0 && html[start] !== '[') start--;
    let depth = 0;
    let end = -1;
    for (let i = start; i < Math.min(html.length, start + 900000); i++) {
      if (html[i] === '[') depth++;
      if (html[i] === ']') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end > start) {
      try {
        const arr = JSON.parse(html.slice(start, end));
        if (Array.isArray(arr) && arr.length && (arr[0].fund || arr[0].ad)) arrays.push(arr);
      } catch (_) { /* */ }
    }
    pos = idx + 8;
  }
  return arrays.flat();
}

function normalizeAlfaItem(item) {
  const fund = item.fund || {};
  const ad = item.ad || {};
  const share = ad.share && ad.share.value ? ad.share.value : null;
  const shareDate = ad.share ? ad.share.shareDate : null;
  const issuers = Array.isArray(ad.issuers) ? ad.issuers : [];
  const composition = issuers.map((row) => ({
    name: trimStr(row.name || row.id),
    isin: trimStr(row.isin) || null,
    pct: row.percentage != null ? Number(row.percentage) : null,
    valueRub: row.value && row.value.amount != null ? Number(row.value.amount) : null
  })).filter((r) => r.name);
  const schaRub = composition.reduce((s, r) => s + (r.valueRub || 0), 0) || null;
  const isin = trimStr(ad.isin) || null;
  const slug = fund.slug || ad.slugUrl || '';
  const fundUrl = slug
    ? 'https://www.alfacapital.ru/analytics/' + slugToAnalyticsPath(slug)
    : 'https://www.alfacapital.ru/individual/pifs';

  return {
    uk: 'alfacapital',
    ukLabel: 'Альфа-Капитал',
    ukUrl: 'https://www.alfacapital.ru',
    fundName: trimStr(fund.fullName || fund.name || ad.mobileName),
    isin,
    ticker: trimStr(fund.ticker) || null,
    sharePrice: share && share.amount != null ? Number(share.amount) : null,
    shareCurrency: share && share.currency ? share.currency : 'RUB',
    shareDate: shareDate || ad.maxCalcDate || ad.productDate || null,
    schaRub: schaRub > 0 ? schaRub : null,
    yield12m: ad.yield != null ? Number(ad.yield) : null,
    composition,
    compositionNote: composition.length ? null : 'Состав не опубликован на странице продукта',
    fundUrl,
    source: 'alfacapital.ru'
  };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.text();
}

async function fetchAlfaCapitalFunds() {
  const urls = [
    'https://www.alfacapital.ru/individual/pifs',
    'https://www.alfacapital.ru/individual/bpifs'
  ];
  const map = new Map();
  for (const url of urls) {
    const html = await fetchText(url);
    extractFundArrays(html).forEach((item) => {
      const norm = normalizeAlfaItem(item);
      const key = norm.isin || ('alfa:' + (item.fund && item.fund.fundId));
      if (!key) return;
      map.set(key, norm);
    });
  }
  return [...map.values()];
}

function parseRubAmount(raw) {
  if (!raw || raw === '-') return null;
  const cleaned = String(raw).replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeMatchKey(name) {
  return trimStr(name)
    .toLowerCase()
    .replace(/[«»"'()]/g, ' ')
    .replace(/ранее\s*[-–—]\s*[^,]+/g, ' ')
    .replace(/опиф[^а-яё]*|бпиф[^а-яё]*|зпиф[^а-яё]*/gi, ' ')
    .replace(/первая\s*[-–—]\s*/g, ' ')
    .replace(/\bфонд\b/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildUkCatalogRows(catalog) {
  if (!Array.isArray(catalog)) return [];
  return catalog;
}

function matchCatalogIsin(title, catalogRows, ukHint) {
  if (!title || !catalogRows.length) return null;
  const key = normalizeMatchKey(title);
  if (!key) return null;
  const hint = (ukHint || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  catalogRows.forEach((row) => {
    const uk = trimStr(row.uk).toLowerCase();
    const url = trimStr(row.url).toLowerCase();
    if (hint && !uk.includes(hint) && !url.includes(hint)) return;
    const variants = [row.n, row.sn, row.cat].filter(Boolean).map(normalizeMatchKey);
    variants.forEach((variant) => {
      if (!variant) return;
      if (variant === key) {
        if (variant.length > bestScore) { bestScore = variant.length; best = row.isin; }
        return;
      }
      if (variant.includes(key) || key.includes(variant)) {
        const score = Math.min(variant.length, key.length);
        if (score > bestScore) { bestScore = score; best = row.isin; }
      }
    });
  });
  return best;
}

function parseFirstAmChart(html) {
  const m = html.match(/chartData\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[1]);
    return arr.length ? arr[arr.length - 1] : null;
  } catch (_) {
    return null;
  }
}

function extractFirstAmFundPaths(html) {
  const paths = new Set();
  const re = /href="(\/(?:individuals\/fund|etf)\/[^"#?]+)"/g;
  let match;
  while ((match = re.exec(html)) !== null) paths.add(match[1]);
  return [...paths];
}

function normalizeFirstAmPage(html, fundUrl, catalogRows) {
  const title = trimStr((html.match(/<h1[^>]*>([^<]+)/) || [])[1]);
  if (!title) return null;
  const chart = parseFirstAmChart(html);
  const fundId = (html.match(/const fundId = (\d+)/) || [])[1];
  const isin = matchCatalogIsin(title, catalogRows, 'первая') || matchCatalogIsin(title, catalogRows, 'first-am');
  const tickerMatch = title.match(/\b([A-Z]{2,5})\b\s*[-–—]/);
  return {
    uk: 'first-am',
    ukLabel: 'Первая',
    ukUrl: 'https://www.first-am.ru',
    fundName: title,
    isin: isin || null,
    ticker: tickerMatch ? tickerMatch[1] : null,
    sharePrice: chart && chart.price != null ? Number(chart.price) : null,
    shareCurrency: 'RUB',
    shareDate: chart && (chart.dateFormat || chart.date) ? (chart.dateFormat || String(chart.date).slice(0, 10)) : null,
    schaRub: chart && chart.net_assets != null ? Number(chart.net_assets) : null,
    yield12m: null,
    composition: [],
    compositionNote: 'Состав на сайте УК «Первая» подгружается отдельно; доступны СЧА и стоимость пая',
    fundUrl,
    source: 'first-am.ru',
    fundId: fundId || null
  };
}

async function mapPool(items, worker, concurrency) {
  const out = [];
  const limit = concurrency || 4;
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const batch = await Promise.all(chunk.map(worker));
    batch.forEach((row) => { if (row) out.push(row); });
  }
  return out;
}

async function fetchFirstAmFunds(catalogRows) {
  const listUrls = ['https://first-am.ru/fund', 'https://first-am.ru/etf'];
  const paths = new Set();
  for (const url of listUrls) {
    const html = await fetchText(url);
    extractFirstAmFundPaths(html).forEach((p) => paths.add(p));
  }
  const catalog = buildUkCatalogRows(catalogRows).filter((row) => {
    const uk = trimStr(row.uk).toLowerCase();
    return uk.includes('первая') || trimStr(row.url).includes('first-am');
  });
  return mapPool([...paths], async (path) => {
    const fundUrl = 'https://first-am.ru' + path;
    const html = await fetchText(fundUrl);
    return normalizeFirstAmPage(html, fundUrl, catalog);
  }, 3);
}

function parseDohodAbout(html) {
  const map = {};
  const re = /about-header">([^<]+)<\/span>\s*<span class="about-info">([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) map[trimStr(m[1])] = trimStr(m[2]);
  return map;
}

function extractDohodFundLinks(html) {
  const links = new Set();
  const re = /href="([^"]*mutual-funds\/(?:bpif|open-funds)\/[^"/#?]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[1].replace(/^\//, '');
    if (path.endsWith('/bpif') || path.endsWith('/open-funds')) continue;
    links.add(path);
  }
  return [...links];
}

function normalizeDohodPage(html, fundUrl) {
  const about = parseDohodAbout(html);
  const title = trimStr((html.match(/<h1[^>]*>([^<]+)/) || [])[1]);
  const isin = trimStr(about.ISIN) || trimStr((html.match(/RU000A[A-Z0-9]{6,12}/) || [])[0]) || null;
  if (!isin && !title) return null;
  return {
    uk: 'dohod',
    ukLabel: 'ДОХОД',
    ukUrl: 'https://www.dohod.ru',
    fundName: title || isin,
    isin,
    ticker: trimStr(about['Тикер']) || null,
    sharePrice: null,
    shareCurrency: 'RUB',
    shareDate: null,
    schaRub: parseRubAmount(about['СЧА']),
    yield12m: null,
    composition: [],
    compositionNote: about['Число ценных бумаг']
      ? 'На странице фонда: ' + about['Число ценных бумаг'] + ' бумаг; детальный состав — в раскрытии УК'
      : 'Состав не опубликован на странице продукта',
    fundUrl,
    source: 'dohod.ru'
  };
}

async function fetchDohodFunds() {
  const listUrls = [
    'https://www.dohod.ru/individuals/mutual-funds/bpif/',
    'https://www.dohod.ru/individuals/mutual-funds/'
  ];
  const paths = new Set();
  for (const url of listUrls) {
    const html = await fetchText(url);
    extractDohodFundLinks(html).forEach((p) => paths.add(p));
  }
  return mapPool([...paths], async (path) => {
    const fundUrl = path.startsWith('http') ? path : 'https://www.dohod.ru/' + path.replace(/^\//, '');
    const html = await fetchText(fundUrl);
    return normalizeDohodPage(html, fundUrl);
  }, 4);
}

function fundKey(fund) {
  return fund.isin || (fund.uk + ':' + (fund.fundId || fund.fundUrl || fund.fundName));
}

function mergeFundRecords(existing, incoming) {
  if (!existing) return incoming;
  const out = Object.assign({}, existing);
  ['sharePrice', 'schaRub', 'yield12m', 'shareDate', 'ticker', 'isin', 'fundName'].forEach((field) => {
    if (out[field] == null && incoming[field] != null) out[field] = incoming[field];
  });
  if ((!out.composition || !out.composition.length) && incoming.composition && incoming.composition.length) {
    out.composition = incoming.composition;
    out.compositionNote = incoming.compositionNote || null;
  }
  if (incoming.source && out.source && out.source.indexOf(incoming.source) < 0) {
    out.source = out.source + ' · ' + incoming.source;
  }
  return out;
}

function upsertFunds(targetMap, rows) {
  rows.forEach((row) => {
    if (!row) return;
    const key = fundKey(row);
    targetMap.set(key, mergeFundRecords(targetMap.get(key), row));
  });
}

/**
 * Источники УК: alfacapital.ru (SSR JSON), first-am.ru и dohod.ru (HTML),
 * опционально НРД (nsddata.ru) по ключу NSD_PIF_API_KEY.
 * bcs.ru с сервера недоступен (антибот servicepipe).
 */
async function fetchUkPifFunds(opts) {
  const catalogRows = (opts && opts.catalog) || [];
  const fundMap = new Map();
  const errors = [];

  try {
    upsertFunds(fundMap, await fetchAlfaCapitalFunds());
  } catch (err) {
    errors.push({ uk: 'alfacapital', message: err.message || String(err) });
  }

  try {
    upsertFunds(fundMap, await fetchFirstAmFunds(catalogRows));
  } catch (err) {
    errors.push({ uk: 'first-am', message: err.message || String(err) });
  }

  try {
    upsertFunds(fundMap, await fetchDohodFunds());
  } catch (err) {
    errors.push({ uk: 'dohod', message: err.message || String(err) });
  }

  if (process.env.NSD_PIF_API_KEY) {
    try {
      const nsd = await fetchNsdFunds(process.env.NSD_PIF_API_KEY);
      nsd.forEach((n) => {
        if (!n.isin) return;
        const key = fundKey(n);
        const merged = mergeFundRecords(fundMap.get(key), n);
        merged.nsd = true;
        fundMap.set(key, merged);
      });
    } catch (err) {
      errors.push({ uk: 'nsd', message: err.message || String(err) });
    }
  }

  const funds = [...fundMap.values()];
  const byIsin = {};
  const byName = {};
  funds.forEach((f) => {
    if (f.isin) byIsin[f.isin] = f;
    if (f.fundName) byName[f.fundName.toLowerCase()] = f;
  });

  return {
    funds,
    byIsin,
    byName,
    stats: {
      total: funds.length,
      withComposition: funds.filter((f) => f.composition && f.composition.length).length,
      withShare: funds.filter((f) => f.sharePrice != null).length,
      withScha: funds.filter((f) => f.schaRub != null).length,
      byUk: funds.reduce((acc, f) => {
        acc[f.uk] = (acc[f.uk] || 0) + 1;
        return acc;
      }, {})
    },
    errors
  };
}

async function fetchNsdFunds(apiKey) {
  const headers = {
    Accept: 'application/json',
    Authorization: 'Bearer ' + apiKey,
    'User-Agent': UA
  };
  const quotesUrl = 'https://nsddata.ru/api/get/pif/quotes?limit=500&filter=' +
    encodeURIComponent(JSON.stringify({ quote_date: { gte: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) } }));
  const res = await fetch(quotesUrl, { headers });
  if (!res.ok) throw new Error('NSD HTTP ' + res.status);
  const json = await res.json();
  const rows = json.data || json.items || [];
  return rows.map((row) => ({
    uk: 'nsd',
    ukLabel: 'НРД',
    ukUrl: 'https://nsddata.ru/ru/products/pifs',
    fundName: trimStr(row.fund_name || row.short_name),
    isin: trimStr(row.isin),
    sharePrice: row.share_price != null ? Number(row.share_price) : null,
    shareCurrency: 'RUB',
    shareDate: row.quote_date || null,
    schaRub: row.net_asset_value != null ? Number(row.net_asset_value) : null,
    composition: [],
    source: 'nsddata.ru'
  }));
}

function mergeNsdFunds(target, nsdFunds) {
  const byIsin = new Map(target.filter((f) => f.isin).map((f) => [f.isin, f]));
  nsdFunds.forEach((n) => {
    if (!n.isin) return;
    const existing = byIsin.get(n.isin);
    if (!existing) {
      target.push(n);
      byIsin.set(n.isin, n);
      return;
    }
    const merged = mergeFundRecords(existing, n);
    Object.assign(existing, merged);
    existing.nsd = true;
  });
}

function lookupUkFund(bundle, opts) {
  if (!bundle) return null;
  const isin = opts && opts.isin ? trimStr(opts.isin) : '';
  const name = opts && opts.name ? trimStr(opts.name).toLowerCase() : '';
  if (isin && bundle.byIsin && bundle.byIsin[isin]) return bundle.byIsin[isin];
  if (name && bundle.byName && bundle.byName[name]) return bundle.byName[name];
  if (name && bundle.byName) {
    const hit = Object.keys(bundle.byName).find((k) => name.indexOf(k.slice(0, 24)) >= 0 || k.indexOf(name.slice(0, 24)) >= 0);
    if (hit) return bundle.byName[hit];
  }
  return null;
}

module.exports = {
  fetchUkPifFunds,
  fetchAlfaCapitalFunds,
  fetchFirstAmFunds,
  fetchDohodFunds,
  lookupUkFund,
  extractFundArrays,
  normalizeAlfaItem,
  matchCatalogIsin
};
