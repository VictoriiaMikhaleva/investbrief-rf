'use strict';

import path from 'path';
import { DATASETS, FINAL, FORBIDDEN_SECTOR_ALIASES, readJson } from './lib.mjs';
import { CANONICAL_SECTORS } from './classification-rules.mjs';

const errors = [];
const warnings = [];
function ok(cond, msg) { if (!cond) errors.push(msg); }
function warn(cond, msg) { if (!cond) warnings.push(msg); }

const meta = readJson(path.join(DATASETS, 'meta.json'));
const securities = readJson(path.join(DATASETS, 'securities.json'));
const companies = readJson(path.join(DATASETS, 'companies.json'));
const sectors = readJson(path.join(DATASETS, 'sectors.json'));
const industries = readJson(path.join(DATASETS, 'industries.json'));

ok(Array.isArray(securities) && securities.length > 0, 'securities not empty');
ok(Array.isArray(companies) && companies.length > 0, 'companies not empty');

const secids = securities.map((s) => s.secid);
ok(new Set(secids).size === secids.length, 'duplicate securities: ' + (secids.length - new Set(secids).size));

const companyIds = companies.map((c) => c.companyId);
ok(new Set(companyIds).size === companyIds.length, 'duplicate companyIds');

const tickerToCompany = {};
companies.forEach((c) => {
  c.tickers.forEach((t) => {
    if (tickerToCompany[t]) errors.push('ticker ' + t + ' in two companies: ' + tickerToCompany[t] + ' and ' + c.companyId);
    tickerToCompany[t] = c.companyId;
  });
});
securities.forEach((s) => {
  ok(tickerToCompany[s.ticker], 'security ' + s.ticker + ' has no company');
  if (s.companyId) ok(s.companyId === tickerToCompany[s.ticker], s.ticker + ' companyId mismatch');
});

const classified = companies.filter((c) => c.sector);
classified.forEach((c) => {
  ok(CANONICAL_SECTORS.includes(c.sector), c.companyId + ' sector not canonical: ' + c.sector);
  ok(!!c.industry, c.companyId + ' missing industry');
  if (c.marketCapRub != null) ok(c.marketCapRub >= 0, c.companyId + ' negative cap');
  if (c.totalTurnoverRub != null) ok(c.totalTurnoverRub >= 0, c.companyId + ' negative turnover');
});

securities.forEach((s) => {
  if (s.marketCapRub != null) ok(s.marketCapRub >= 0, s.ticker + ' negative cap');
  if (s.totalTurnoverRub != null) ok(s.totalTurnoverRub >= 0, s.ticker + ' negative turnover');
  ok(s.marketCapRub !== 0 || s.flags.includes('zero-turnover') || true, 'cap zero check');
  if (s.flags.includes('stale-untraded-price')) {
    ok(s.marketCapRub == null, s.ticker + ' stale cap should be null, got ' + s.marketCapRub);
  }
  ok(s.marketCapRub !== 0, s.ticker + ' marketCapRub is 0; missing must stay null');
});

const prefPairs = [
  ['SBER', 'SBERP'],
  ['TATN', 'TATNP'],
  ['SNGS', 'SNGSP']
];
prefPairs.forEach(([a, b]) => {
  const sa = securities.find((s) => s.ticker === a);
  const sb = securities.find((s) => s.ticker === b);
  ok(sa && sb, 'pair missing ' + a + '/' + b);
  ok(sa.companyId === sb.companyId, a + '/' + b + ' not same company');
  ok(sa.shareClass === 'ordinary' && sb.shareClass === 'preferred', a + '/' + b + ' class');
  const co = companies.find((c) => c.companyId === sa.companyId);
  if (sa.marketCapRub != null && sb.marketCapRub != null) {
    const expected = sa.marketCapRub + sb.marketCapRub;
    ok(Math.abs(co.marketCapRub - expected) < 1, a + ' company cap double-count? ' + co.marketCapRub + ' vs ' + expected);
  }
  if (sa.totalTurnoverRub != null && sb.totalTurnoverRub != null) {
    const expected = sa.totalTurnoverRub + sb.totalTurnoverRub;
    ok(Math.abs(co.totalTurnoverRub - expected) < 1, a + ' company turnover mismatch');
  }
});

const capBySector = {};
const toBySector = {};
classified.forEach((c) => {
  capBySector[c.sector] = (capBySector[c.sector] || 0) + (c.marketCapRub || 0);
  toBySector[c.sector] = (toBySector[c.sector] || 0) + (c.totalTurnoverRub || 0);
});
sectors.forEach((r) => {
  ok(Math.abs(r.marketCapRub - (capBySector[r.sector] || 0)) < 1, 'sector cap mismatch ' + r.sector);
  ok(Math.abs(r.totalTurnoverRub - (toBySector[r.sector] || 0)) < 1, 'sector turnover mismatch ' + r.sector);
});
const capByInd = {};
const toByInd = {};
classified.forEach((c) => {
  capByInd[c.industry] = (capByInd[c.industry] || 0) + (c.marketCapRub || 0);
  toByInd[c.industry] = (toByInd[c.industry] || 0) + (c.totalTurnoverRub || 0);
});
industries.forEach((r) => {
  ok(Math.abs(r.marketCapRub - (capByInd[r.industry] || 0)) < 1, 'industry cap mismatch ' + r.industry);
  ok(Math.abs(r.totalTurnoverRub - (toByInd[r.industry] || 0)) < 1, 'industry turnover mismatch ' + r.industry);
});

const sectorCapSum = sectors.reduce((a, r) => a + r.marketCapRub, 0);
const sectorToSum = sectors.reduce((a, r) => a + r.totalTurnoverRub, 0);
const classifiedCap = classified.reduce((a, c) => a + (c.marketCapRub || 0), 0);
const classifiedTo = classified.reduce((a, c) => a + (c.totalTurnoverRub || 0), 0);
ok(Math.abs(sectorCapSum - classifiedCap) < 1, 'sector cap total vs companies');
ok(Math.abs(sectorToSum - classifiedTo) < 1, 'sector turnover total vs companies');

const shareCap = sectors.reduce((a, r) => a + r.marketCapSharePct, 0);
const shareTo = sectors.reduce((a, r) => a + r.turnoverSharePct, 0);
ok(Math.abs(shareCap - 100) < 0.05, 'sector cap shares != 100: ' + shareCap);
ok(Math.abs(shareTo - 100) < 0.05, 'sector turnover shares != 100: ' + shareTo);
const indCapShare = industries.reduce((a, r) => a + r.marketCapSharePct, 0);
const indToShare = industries.reduce((a, r) => a + r.turnoverSharePct, 0);
ok(Math.abs(indCapShare - 100) < 0.05, 'industry cap shares != 100: ' + indCapShare);
ok(Math.abs(indToShare - 100) < 0.05, 'industry turnover shares != 100: ' + indToShare);

ok(meta.securityCount === securities.length, 'meta securityCount');
ok(meta.companyCount === companies.length, 'meta companyCount');
ok(meta.classifiedCompanyCount === classified.length, 'meta classified count');
ok(meta.tradingDayCount === 254, 'unexpected trading day count ' + meta.tradingDayCount);
ok(meta.analysisDate === '2026-10-13', 'analysisDate');

const sber = companies.find((c) => c.companyId === 'sber');
ok(sber && sber.tickers.includes('SBER') && sber.tickers.includes('SBERP'), 'sber mapping');
ok(sber.marketCapRub > 6e12 && sber.marketCapRub < 8e12, 'sber cap sanity ' + sber.marketCapRub);

['SBER', 'GAZP', 'LKOH', 'ROSN', 'NVTK', 'GMKN', 'PLZL', 'YDEX', 'T'].forEach((t) => {
  const s = securities.find((x) => x.ticker === t);
  ok(s, 'missing sanity ticker ' + t);
  if (s) {
    ok(s.marketCapRub != null && s.marketCapRub > 0, t + ' cap');
    ok(s.totalTurnoverRub != null && s.totalTurnoverRub > 0, t + ' turnover');
    ok(s.sector, t + ' sector');
    ok(s.industry, t + ' industry');
  }
});

classified.forEach((c) => {
  ok(!FORBIDDEN_SECTOR_ALIASES.includes(c.sector), c.companyId + ' forbidden sector alias ' + c.sector);
});

const finalCompaniesWrap = readJson(path.join(FINAL, 'company-summary.json'));
const finalSectorsWrap = readJson(path.join(FINAL, 'sector-summary.json'));
const finalIndustriesWrap = readJson(path.join(FINAL, 'industry-summary.json'));
const finalFacts = readJson(path.join(FINAL, 'article-facts.json'));
const finalCoverage = readJson(path.join(FINAL, 'cap-coverage.json'));
ok(finalCompaniesWrap && finalSectorsWrap && finalFacts && finalCoverage, 'final datasets missing — run build-final.mjs');

if (finalCompaniesWrap) {
  const fcos = finalCompaniesWrap.companies;
  ok(fcos.length === companies.length, 'final company count');
  ok(new Set(fcos.map((c) => c.companyId)).size === fcos.length, 'final duplicate companyId');
  const allowedCov = new Set(['full', 'partial', 'unknown']);
  fcos.forEach((c) => {
    ok(allowedCov.has(c.marketCapCoverage), c.companyId + ' bad coverage ' + c.marketCapCoverage);
    ok(c.marketCapRub !== 0, c.companyId + ' final cap is 0; missing must stay null');
    if (c.classificationStatus === 'classified') {
      ok(CANONICAL_SECTORS.includes(c.sector), c.companyId + ' final sector not canonical: ' + c.sector);
      ok(!!c.industry, c.companyId + ' classified missing industry');
      ok(!FORBIDDEN_SECTOR_ALIASES.includes(c.sector), c.companyId + ' alias sector');
    } else {
      ok(c.sector == null, c.companyId + ' unclassified must have sector=null, got ' + c.sector);
    }
  });
  const sistema = fcos.find((c) => c.companyId === 'sistema');
  ok(sistema && sistema.classificationStatus === 'unclassified-diversified-holding', 'Sistema treatment');
  ok(sistema && sistema.sector == null, 'Sistema must not be forced into a canonical sector');
}

if (finalSectorsWrap) {
  const fsrows = finalSectorsWrap.sectors;
  ok(fsrows.length === 9, 'final sector count ' + fsrows.length);
  fsrows.forEach((r) => {
    ok(CANONICAL_SECTORS.includes(r.sector), 'final non-canonical sector ' + r.sector);
    ok(r.marketCapSharePctDenominator === 'classifiedMarketCapRub', r.sector + ' cap denominator');
    ok(r.turnoverSharePctDenominator === 'classifiedTurnoverRub', r.sector + ' turnover denominator');
  });
  const fCapShare = fsrows.reduce((a, r) => a + r.marketCapSharePct, 0);
  const fToShare = fsrows.reduce((a, r) => a + r.turnoverSharePct, 0);
  ok(Math.abs(fCapShare - 100) < 0.05, 'final sector cap shares ' + fCapShare);
  ok(Math.abs(fToShare - 100) < 0.05, 'final sector to shares ' + fToShare);
  ok(Array.isArray(finalSectorsWrap.unclassified) && finalSectorsWrap.unclassified.length === 1, 'unclassified bucket');
}

if (finalIndustriesWrap) {
  const fi = finalIndustriesWrap.industries;
  const iCap = fi.reduce((a, r) => a + r.marketCapSharePct, 0);
  const iTo = fi.reduce((a, r) => a + r.turnoverSharePct, 0);
  ok(Math.abs(iCap - 100) < 0.05, 'final industry cap shares ' + iCap);
  ok(Math.abs(iTo - 100) < 0.05, 'final industry to shares ' + iTo);
}

if (finalFacts) {
  ok(finalFacts.analysisDate === '2026-10-13', 'facts analysisDate');
  ok(finalFacts.securityCount === 259, 'facts securityCount');
  ok(finalFacts.universeCompanyCount === 217, 'facts universeCompanyCount');
  ok(finalFacts.classifiedCompanyCount === 216, 'facts classifiedCompanyCount');
  ok(finalFacts.imoex && finalFacts.imoex.tradedate === '2026-10-13', 'IMOEX date');
  ok(finalFacts.imoex.securityCount === 44, 'IMOEX secs');
  ok(finalFacts.imoex.companyCount === 41, 'IMOEX companies');
  ok(finalFacts.imoex.officialWeightsUsed === false, 'IMOEX weights unused');
  ok(finalFacts.imoex.matchesAnalysisDate === true, 'IMOEX date match');
  ok(finalFacts.samolet && finalFacts.samolet.duplicateDates === 0, 'SMLT dup dates');
  ok(finalFacts.samolet.turnoverMatchesHistorySum === true, 'SMLT turnover sum');
  ok(finalFacts.samolet.capEqualsIssueSizeTimesLegalClose === true, 'SMLT cap formula');
  ok(finalFacts.turnoverIntensity && /текущего размера/.test(finalFacts.turnoverIntensity.label), 'intensity label');
}

if (finalCoverage) {
  ok(finalCoverage.partial && finalCoverage.partial.length >= 1, 'partial list');
  ok(finalCoverage.partial.some((c) => c.tickers.includes('TRNFP')), 'TRNFP in partial');
  const listed = new Set();
  [...(finalCoverage.partial || []), ...(finalCoverage.unknown || [])].forEach((c) => {
    ok(!listed.has(c.companyId), 'dup coverage company ' + c.companyId);
    listed.add(c.companyId);
    ok(!!c.reason, c.companyId + ' missing coverage reason');
  });
}

if (errors.length) {
  console.log('FAIL', errors.length);
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('PASS');
console.log('securities', securities.length);
console.log('companies', companies.length);
console.log('classified', classified.length);
console.log('warnings', warnings.length);
warnings.forEach((w) => console.log(' !', w));
console.log('sector cap share', shareCap.toFixed(4));
console.log('sector to share', shareTo.toFixed(4));
console.log('industry cap share', indCapShare.toFixed(4));
console.log('industry to share', indToShare.toFixed(4));
console.log('industries', industries.length);
