'use strict';

import path from 'path';
import { RAW, HISTORY_DIR, ANALYSIS_DATE, TURNOVER_START, TURNOVER_END, readJson, finiteNumber } from './lib.mjs';

const universe = readJson(path.join(RAW, 'universe-included.json'));
const calendar = readJson(path.join(RAW, 'trading-calendar.json'));
const imoex = readJson(path.join(RAW, 'imoex-constituents.json'));
const indices = readJson(path.join(RAW, 'sector-indices.json')).indices;
const profiles = readJson(path.resolve(RAW, '../../../data/company-profiles.json'));

const imoexSet = new Set((imoex.constituents || []).map((r) => r.secid || r.ticker));
const indexByTicker = {};
Object.entries(indices).forEach(([id, idx]) => {
  (idx.constituents || []).forEach((c) => {
    const t = c.secid || c.ticker;
    if (!indexByTicker[t]) indexByTicker[t] = [];
    indexByTicker[t].push({ id, date: idx.tradedate });
  });
});

const profileByTicker = {};
(profiles.companies || []).forEach((c) => {
  (c.tickers || []).forEach((t) => { profileByTicker[String(t).toUpperCase()] = c; });
});

const marketDays = calendar.tradingDayCount;

const securities = universe.securities.map((s) => {
  const hist = readJson(path.join(HISTORY_DIR, s.secid + '.json'));
  const rows = (hist && hist.history) || [];
  let totalTurnover = 0;
  let daysWithValue = 0;
  let daysWithTrade = 0;
  let missingValueDays = 0;
  rows.forEach((r) => {
    if (r.value == null) missingValueDays += 1;
    else {
      totalTurnover += r.value;
      daysWithValue += 1;
      if (r.value > 0) daysWithTrade += 1;
    }
  });
  const legal = s.analysisLegalClose;
  const close = s.analysisClose;
  const px = legal != null ? legal : close;
  const capFromPrice = (s.issueSize != null && px != null) ? s.issueSize * px : null;
  const marketCap = capFromPrice != null ? capFromPrice : s.liveIssueCap;
  const capMethod = capFromPrice != null
    ? (legal != null ? 'issuesize*legalclose' : 'issuesize*close')
    : (s.liveIssueCap != null ? 'live-issuecapitalization' : null);
  return {
    ...s,
    isIMOEX: imoexSet.has(s.secid),
    moexIndices: indexByTicker[s.secid] || [],
    profileId: profileByTicker[s.secid] ? profileByTicker[s.secid].companyId : null,
    marketCapRub: marketCap,
    capMethod,
    totalTurnoverRub: daysWithValue ? totalTurnover : null,
    averageDailyTurnoverRub: daysWithValue && marketDays ? totalTurnover / marketDays : null,
    historyRows: rows.length,
    daysWithValue,
    daysWithTrade,
    missingValueDays,
    listedDuringPeriod: rows.length > 0 && rows.length < marketDays * 0.85
  };
});

const emitents = {};
securities.forEach((s) => {
  const key = String(s.emitentId || s.emitentInn || s.secid);
  if (!emitents[key]) {
    emitents[key] = {
      emitentId: s.emitentId,
      emitentInn: s.emitentInn,
      emitentTitle: s.emitentTitle,
      profileId: null,
      tickers: [],
      marketCapRub: 0,
      capMissing: 0,
      totalTurnoverRub: 0,
      turnoverMissing: 0,
      isIMOEX: false,
      moexIndices: new Set()
    };
  }
  const e = emitents[key];
  e.tickers.push(s.secid + ':' + s.shareClass);
  if (s.profileId) e.profileId = s.profileId;
  if (s.marketCapRub != null) e.marketCapRub += s.marketCapRub;
  else e.capMissing += 1;
  if (s.totalTurnoverRub != null) e.totalTurnoverRub += s.totalTurnoverRub;
  else e.turnoverMissing += 1;
  if (s.isIMOEX) e.isIMOEX = true;
  s.moexIndices.forEach((i) => e.moexIndices.add(i.id));
});

const companies = Object.values(emitents).map((e) => ({
  ...e,
  moexIndices: [...e.moexIndices].sort(),
  classified: Boolean(e.profileId || [...e.moexIndices].some((id) => id !== 'MOEXBMI' && id !== 'MOEXINN'))
})).sort((a, b) => b.marketCapRub - a.marketCapRub);

const totalCap = securities.reduce((s, r) => s + (r.marketCapRub || 0), 0);
const totalTo = securities.reduce((s, r) => s + (r.totalTurnoverRub || 0), 0);

console.log('analysisDate', ANALYSIS_DATE);
console.log('turnover', TURNOVER_START, TURNOVER_END, 'days', marketDays);
console.log('securities', securities.length, 'companies', companies.length);
console.log('IMOEX securities', securities.filter((s) => s.isIMOEX).length);
console.log('IMOEX companies', companies.filter((c) => c.isIMOEX).length);
console.log('total cap T RUB', (totalCap / 1e12).toFixed(3));
console.log('total 12m turnover T RUB', (totalTo / 1e12).toFixed(3));
console.log('missing cap secs', securities.filter((s) => s.marketCapRub == null).length);
console.log('missing turnover secs', securities.filter((s) => s.totalTurnoverRub == null).length);
console.log('listed during period', securities.filter((s) => s.listedDuringPeriod).map((s) => s.secid + ':' + s.historyRows).join(', '));
console.log('\nTOP 15 companies by cap');
companies.slice(0, 15).forEach((c, i) => {
  console.log(
    String(i + 1).padStart(2),
    (c.marketCapRub / 1e9).toFixed(0).padStart(8), 'млрд',
    (c.profileId || '').padEnd(16),
    c.tickers.join(','),
    c.emitentTitle,
    c.moexIndices.join('|')
  );
});
console.log('\nUnclassified (no profile, no sector index except BMI/INN):', companies.filter((c) => !c.classified).length);
companies.filter((c) => !c.classified).slice(0, 80).forEach((c) => {
  console.log(
    (c.marketCapRub / 1e9).toFixed(1).padStart(8),
    c.tickers.join(','),
    c.emitentTitle,
    c.moexIndices.join('|') || '-'
  );
});
console.log('\nSanity tickers');
['SBER','SBERP','GAZP','LKOH','ROSN','NVTK','GMKN','PLZL','YDEX','T'].forEach((t) => {
  const s = securities.find((x) => x.secid === t);
  if (!s) { console.log(t, 'MISSING'); return; }
  console.log(JSON.stringify({
    t,
    capB: s.marketCapRub && +(s.marketCapRub / 1e9).toFixed(1),
    method: s.capMethod,
    liveCapB: s.liveIssueCap && +(s.liveIssueCap / 1e9).toFixed(1),
    toB: s.totalTurnoverRub && +(s.totalTurnoverRub / 1e9).toFixed(1),
    days: s.historyRows,
    imoex: s.isIMOEX,
    cls: s.shareClass,
    profile: s.profileId
  }));
});
