#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MOEX = 'https://iss.moex.com/iss';

const CBR_REGISTRY_URL = 'https://cbr.ru/vfs/finmarkets/files/supervision/list_PIF.xlsx';
const CBR_SHOWCASE_URL = 'https://cbr.ru/Content/Document/File/193443/mutual_fund_data.xlsx';

const KIND_MAP = {
  'Открытый': 'opif',
  'Закрытый': 'zpif',
  'Интервальный': 'ipif',
  'Биржевой': 'bpif'
};

const KIND_LABEL = {
  opif: 'ОПИФ',
  zpif: 'ЗПИФ',
  ipif: 'ИПИФ',
  bpif: 'БПИФ'
};

const STATUS_MAP = {
  'Сформирован': 'formed',
  'Формируется': 'forming',
  'В стадии прекращения': 'terminating',
  'Исключён из реестра': 'excluded',
  'Истёк срок формирования': 'formation_expired',
  'Зарегистрирован': 'registered',
  'Согласован': 'approved'
};

function trimStr(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function yesNo(v) {
  const s = trimStr(v).toLowerCase();
  if (!s) return null;
  if (s === 'да') return true;
  if (s === 'нет') return false;
  return null;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'InvestBrief/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

async function fetchXlsx(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'InvestBrief/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  return XLSX.read(buf, { type: 'buffer', cellDates: true });
}

function sheetMatrix(wb, name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false });
}

function parseRegistry(wb) {
  const rows = sheetMatrix(wb, 'report_list');
  const headerIdx = rows.findIndex((r) => r && r[0] === '№ п/п');
  if (headerIdx < 0) throw new Error('PIF registry header not found');
  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !trimStr(r[6])) continue;
    const typeRaw = trimStr(r[1]);
    const kind = KIND_MAP[typeRaw] || 'other';
    const statusRaw = trimStr(r[2]);
    const status = STATUS_MAP[statusRaw] || 'other';
    out.push({
      id: trimStr(r[6]),
      num: trimStr(r[0]),
      kind,
      kindLabel: KIND_LABEL[kind] || typeRaw,
      typeRaw,
      status,
      statusLabel: statusRaw,
      name: trimStr(r[3]),
      shortName: trimStr(r[4]),
      category: trimStr(r[5]),
      regDate: trimStr(r[7]),
      termEnd: trimStr(r[8]),
      formationEnd: trimStr(r[9]),
      qualifiedOnly: yesNo(r[10]),
      exchangeListed: yesNo(r[11]),
      ukName: trimStr(r[16]),
      ukOgrn: trimStr(r[17]),
      depository: trimStr(r[19]),
      registrar: trimStr(r[22])
    });
  }
  return out;
}

function parseShowcase(wb) {
  const rows = sheetMatrix(wb, 'Sheet1');
  const headerIdx = rows.findIndex((r) => r && String(r[0] || '').indexOf('Номер правил') === 0);
  if (headerIdx < 0) throw new Error('PIF showcase header not found');
  const map = {};
  for (let i = headerIdx + 2; i < rows.length; i++) {
    const r = rows[i];
    const id = trimStr(r[0]);
    if (!id || id === '1') continue;
    map[id] = {
      isin: trimStr(r[2]),
      strategyType: trimStr(r[10]),
      benchmark: trimStr(r[11]),
      feeMgmt: trimStr(r[13]),
      feeSuccess: trimStr(r[14]),
      feeInfra: trimStr(r[15]),
      feeMax: trimStr(r[16]),
      incomePolicy: trimStr(r[17]),
      incomePeriod: trimStr(r[18]),
      surcharge: trimStr(r[19]),
      discount: trimStr(r[20]),
      return12m: trimStr(r[21]),
      ukInn: trimStr(r[7]),
      ukUrl: trimStr(r[8]),
      rulesDate: trimStr(r[9])
    };
  }
  return map;
}

async function fetchMoexBpif() {
  const url = MOEX + '/engines/stock/markets/shares/securities.json' +
    '?iss.meta=off&securities.columns=SECID,SECNAME,SHORTNAME,ISIN,REGNUMBER' +
    '&marketdata.columns=SECID,LAST,VALTODAY,SPREAD&iss.only=securities,marketdata&limit=5000';
  const json = await fetchJson(url);
  const sec = json.securities;
  const md = json.marketdata;
  if (!sec || !sec.columns) return { byIsin: {}, byReg: {}, byTicker: {} };
  const si = sec.columns.indexOf('SECID');
  const sn = sec.columns.indexOf('SECNAME');
  const isinI = sec.columns.indexOf('ISIN');
  const regI = sec.columns.indexOf('REGNUMBER');
  const mdMap = {};
  if (md && md.columns && md.data) {
    const mi = md.columns.indexOf('SECID');
    const li = md.columns.indexOf('LAST');
    const vi = md.columns.indexOf('VALTODAY');
    const spi = md.columns.indexOf('SPREAD');
    md.data.forEach((row) => {
      mdMap[row[mi]] = {
        last: row[li] != null ? Number(row[li]) : null,
        vol: row[vi] != null ? Number(row[vi]) : null,
        spread: row[spi] != null ? Number(row[spi]) : null
      };
    });
  }
  const byIsin = {};
  const byReg = {};
  const byTicker = {};
  sec.data.forEach((row) => {
    const name = sn >= 0 ? trimStr(row[sn]) : '';
    if (!/^БПИФ/i.test(name)) return;
    const ticker = si >= 0 ? trimStr(row[si]) : '';
    const isin = isinI >= 0 ? trimStr(row[isinI]) : '';
    const reg = regI >= 0 ? trimStr(row[regI]) : '';
    const mdRow = mdMap[ticker] || {};
    const item = {
      ticker,
      isin,
      regNumber: reg,
      secName: name,
      last: mdRow.last,
      vol: mdRow.vol,
      spread: mdRow.spread
    };
    if (isin) byIsin[isin] = item;
    if (reg) byReg[reg] = item;
    if (ticker) byTicker[ticker] = item;
  });
  return { byIsin, byReg, byTicker };
}

async function fetchInavMap() {
  const url = MOEX + '/engines/stock/markets/index/securities.json' +
    '?iss.meta=off&securities.columns=SECID,SHORTNAME&limit=5000';
  const json = await fetchJson(url);
  const sec = json.securities;
  if (!sec || !sec.data) return {};
  const si = sec.columns.indexOf('SECID');
  const sn = sec.columns.indexOf('SHORTNAME');
  const map = {};
  sec.data.forEach((row) => {
    const short = sn >= 0 ? trimStr(row[sn]) : '';
    if (!/^iNAV/i.test(short)) return;
    const secid = si >= 0 ? trimStr(row[si]) : '';
    const tail = short.replace(/^iNAV\s+/i, '').replace(/\s+ETF$/i, '').trim();
    map[secid] = { inavSecid: secid, label: short, matchKey: tail.toLowerCase() };
  });
  return map;
}

function matchInavForTicker(ticker, secName, inavEntries) {
  const t = ticker.toLowerCase();
  const name = secName.toLowerCase();
  for (const key of Object.keys(inavEntries)) {
    const e = inavEntries[key];
    if (e.matchKey && name.indexOf(e.matchKey) >= 0) return e.inavSecid;
    if (e.matchKey && e.matchKey.replace(/\s+/g, '').indexOf(t) === 0) return e.inavSecid;
  }
  const guess = t + 'M';
  if (inavEntries[guess]) return guess;
  return null;
}

async function buildCatalog() {
  const [registryWb, showcaseWb, moex, inavEntries] = await Promise.all([
    fetchXlsx(CBR_REGISTRY_URL),
    fetchXlsx(CBR_SHOWCASE_URL),
    fetchMoexBpif(),
    fetchInavMap()
  ]);
  const registry = parseRegistry(registryWb);
  const showcase = parseShowcase(showcaseWb);
  const registryDate = trimStr(registryWb.Sheets.report_list['!ref']) ? null : null;
  const metaRow = sheetMatrix(registryWb, 'report_list')[0];
  const asOf = metaRow && metaRow[0] ? String(metaRow[0]).match(/на\s+(\d{2}\.\d{2}\.\d{4})/) : null;

  const catalog = registry.map((row) => {
    const extra = showcase[row.id] || null;
    let moexRow = null;
    if (extra && extra.isin && moex.byIsin[extra.isin]) moexRow = moex.byIsin[extra.isin];
    if (!moexRow && moex.byReg[row.id]) moexRow = moex.byReg[row.id];
    if (!moexRow && row.kind === 'bpif') {
      const hit = Object.keys(moex.byTicker).map((k) => moex.byTicker[k]).find((m) => {
        return trimStr(m.secName).toLowerCase().indexOf(trimStr(row.shortName || row.name).toLowerCase().slice(0, 12)) >= 0;
      });
      if (hit) moexRow = hit;
    }
    const ticker = moexRow ? moexRow.ticker : null;
    const inavSecid = ticker ? matchInavForTicker(ticker, moexRow.secName || row.name, inavEntries) : null;
    const ukUrl = extra && extra.ukUrl ? extra.ukUrl : null;
    return {
      id: row.id,
      k: row.kind,
      st: row.status,
      n: row.name,
      sn: row.shortName,
      cat: row.category,
      rd: row.regDate,
      te: row.termEnd,
      q: row.qualifiedOnly,
      ex: row.exchangeListed,
      uk: row.ukName,
      isin: extra ? extra.isin : (moexRow ? moexRow.isin : null),
      t: ticker,
      inav: inavSecid,
      hs: extra ? 1 : 0,
      url: ukUrl || null
    };
  });

  const showcaseOut = {};
  Object.keys(showcase).forEach((id) => {
    const s = showcase[id];
    showcaseOut[id] = {
      isin: s.isin,
      stype: s.strategyType,
      bench: s.benchmark,
      fee: s.feeMgmt,
      feeOk: s.feeSuccess,
      feeInfra: s.feeInfra,
      feeMax: s.feeMax,
      income: s.incomePolicy,
      incomePd: s.incomePeriod,
      surcharge: s.surcharge,
      discount: s.discount,
      ret12: s.return12m,
      ukInn: s.ukInn,
      ukUrl: s.ukUrl,
      rules: s.rulesDate
    };
  });

  const activeStatuses = new Set(['formed', 'forming', 'terminating', 'registered', 'approved', 'formation_expired']);
  const activeCatalog = catalog.filter((r) => activeStatuses.has(r.st));
  const archiveCatalog = catalog.filter((r) => !activeStatuses.has(r.st));

  const stats = {
    total: catalog.length,
    active: activeCatalog.length,
    archive: archiveCatalog.length,
    formed: catalog.filter((r) => r.st === 'formed').length,
    bpif: catalog.filter((r) => r.k === 'bpif').length,
    withMoex: catalog.filter((r) => r.t).length,
    withShowcase: catalog.filter((r) => r.hs).length
  };

  return {
    asOf: asOf ? asOf[1] : null,
    stats,
    activeCatalog,
    archiveCatalog,
    showcase: showcaseOut
  };
}

function writePayload(name, data, source) {
  const payload = {
    status: 'ok',
    updatedAt: new Date().toISOString(),
    source,
    message: 'Данные обновлены',
    data
  };
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(payload) + '\n', 'utf8');
}

async function writePifSnapshots(built) {
  const source = 'Банк России (реестр + витрина) · MOEX ISS (БПИФ)';
  writePayload('pif-index.json', {
    asOf: built.asOf,
    stats: built.stats,
    catalog: built.activeCatalog
  }, source);
  writePayload('pif-archive.json', {
    asOf: built.asOf,
    catalog: built.archiveCatalog
  }, source + ' · архив');
  writePayload('pif-disclosure.json', {
    asOf: built.asOf,
    showcase: built.showcase
  }, 'Банк России · витрина данных ПИФ');
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const built = await buildCatalog();
  await writePifSnapshots(built);
  console.log('[ok] pif-index.json', built.stats);
  console.log('[ok] pif-disclosure.json showcase', Object.keys(built.showcase).length);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { buildCatalog, writePifSnapshots };
