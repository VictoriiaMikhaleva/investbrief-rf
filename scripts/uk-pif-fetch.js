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

/**
 * Источники УК: пока парсится SSR JSON с alfacapital.ru (стоимость пая, СЧА, состав).
 * НРД (nsddata.ru) требует договор и API-ключ — см. NSD_PIF_API_KEY.
 */
async function fetchUkPifFunds() {
  const funds = [];
  const errors = [];

  try {
    const alfa = await fetchAlfaCapitalFunds();
    funds.push(...alfa);
  } catch (err) {
    errors.push({ uk: 'alfacapital', message: err.message || String(err) });
  }

  if (process.env.NSD_PIF_API_KEY) {
    try {
      const nsd = await fetchNsdFunds(process.env.NSD_PIF_API_KEY);
      mergeNsdFunds(funds, nsd);
    } catch (err) {
      errors.push({ uk: 'nsd', message: err.message || String(err) });
    }
  }

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
      return;
    }
    if (existing.sharePrice == null && n.sharePrice != null) existing.sharePrice = n.sharePrice;
    if (existing.schaRub == null && n.schaRub != null) existing.schaRub = n.schaRub;
    if (!existing.shareDate && n.shareDate) existing.shareDate = n.shareDate;
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
  lookupUkFund,
  extractFundArrays,
  normalizeAlfaItem
};
