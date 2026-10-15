'use strict';

import fs from 'fs';
import path from 'path';
import {
  MOEX_ISS, RAW, DATASETS, FINAL, HISTORY_DIR, ANALYSIS_DATE, TURNOVER_START, TURNOVER_END,
  ensureDirs, readJson, writeJson, toCsv, fetchAllPages
} from './lib.mjs';
import { CANONICAL_SECTORS } from './classification-rules.mjs';
import { coverageIndex } from './cap-coverage.mjs';

const ROUND_PCT = (v) => Math.round(v * 10000) / 10000;
const ROUND3 = (v) => Math.round(v * 1000) / 1000;
const ISS_SHARES_FILE = path.join(RAW, 'iss-stock-shares-all.json');

const TURNOVER_INTENSITY_DEF = {
  formula: 'turnoverSharePct / marketCapSharePct',
  label: 'интенсивность торгов относительно текущего размера сектора',
  meaning: 'отношение доли 12-месячного денежного оборота к доле капитализации на analysisDate',
  not: [
    'liquidity score',
    'ликвидность',
    'инвестиционная привлекательность',
    'чистая метрика оборачиваемости free-float'
  ]
};

const MARKET_CAP_TERMINOLOGY = {
  term: 'капитализация включённых в выборку торгуемых выпусков',
  doNotSayWithoutCaveat: [
    'стоимость всей компании',
    'полная капитализация эмитента'
  ],
  note: 'Для marketCapCoverage=full сумма included TQBR issues совпадает с известным MOEX набором классов акций эмитента. Для partial/unknown это только listed issue cap, не полный акционерный капитал.'
};

async function loadIssShares() {
  const cached = readJson(ISS_SHARES_FILE);
  if (cached && Array.isArray(cached.securities) && cached.securities.length > 0) {
    return cached.securities;
  }
  const rows = await fetchAllPages(
    MOEX_ISS + '/securities.json?engine=stock&group_by=group&group_by_filter=stock_shares',
    'securities'
  );
  writeJson(ISS_SHARES_FILE, { fetchedAt: new Date().toISOString(), count: rows.length, securities: rows });
  return rows;
}

function samoletSanity(securities) {
  const s = securities.find((x) => x.ticker === 'SMLT');
  const hist = readJson(path.join(HISTORY_DIR, 'SMLT.json'));
  const rows = (hist && hist.history) || [];
  const dates = rows.map((r) => r.date);
  const dupDates = dates.length - new Set(dates).size;
  const sumValue = rows.reduce((a, r) => a + (r.value || 0), 0);
  const px = rows.map((r) => r.legalClose != null ? r.legalClose : r.close).filter((v) => v != null);
  const impliedCap = s && s.issueSize != null && s.analysisLegalClose != null
    ? s.issueSize * s.analysisLegalClose
    : null;
  return {
    ticker: 'SMLT',
    companyId: 'samolet',
    historyRows: rows.length,
    duplicateDates: dupDates,
    turnoverMatchesHistorySum: s ? Math.abs((s.totalTurnoverRub || 0) - sumValue) < 1 : false,
    historySumRub: sumValue,
    securityTurnoverRub: s ? s.totalTurnoverRub : null,
    issueSize: s ? s.issueSize : null,
    analysisLegalClose: s ? s.analysisLegalClose : null,
    marketCapRub: s ? s.marketCapRub : null,
    capEqualsIssueSizeTimesLegalClose: impliedCap != null && s && Math.abs(s.marketCapRub - impliedCap) < 1,
    shareClassCount: 1,
    minLegalClose: px.length ? Math.min(...px) : null,
    maxLegalClose: px.length ? Math.max(...px) : null,
    periodStartClose: rows[0] ? rows[0].legalClose : null,
    periodEndClose: rows.length ? rows[rows.length - 1].legalClose : null,
    caveat: '12-месячный оборот включает период, когда цена была существенно выше, чем LEGALCLOSEPRICE на analysisDate; intensity сопоставляет текущий размер с прошлым оборотом.'
  };
}

function compactCompany(c) {
  return {
    companyId: c.companyId,
    companyName: c.companyName,
    shortName: c.shortName,
    tickers: c.tickers,
    shareClasses: c.shareClasses,
    sector: c.sector,
    industry: c.industry,
    classificationStatus: c.classificationStatus,
    marketCapCoverage: c.marketCapCoverage,
    marketCapCoverageReason: c.marketCapCoverageReason,
    isIMOEX: c.isIMOEX,
    marketCapRub: c.marketCapRub,
    totalTurnoverRub: c.totalTurnoverRub,
    averageDailyTurnoverRub: c.averageDailyTurnoverRub,
    qualityStatus: c.qualityStatus,
    flags: c.flags
  };
}

async function main() {
  ensureDirs();
  const meta = readJson(path.join(DATASETS, 'meta.json'));
  const securities = readJson(path.join(DATASETS, 'securities.json'));
  const companies = readJson(path.join(DATASETS, 'companies.json'));
  const sectors = readJson(path.join(DATASETS, 'sectors.json'));
  const industries = readJson(path.join(DATASETS, 'industries.json'));
  const concentration = readJson(path.join(DATASETS, 'concentration.json'));
  const imoexVs = readJson(path.join(DATASETS, 'imoex-vs-broad.json'));
  const imoexRaw = readJson(path.join(RAW, 'imoex-constituents.json'));
  const issShares = await loadIssShares();
  const cov = coverageIndex(companies, securities, issShares);

  const enriched = companies.map((c) => {
    const coverage = cov[c.companyId] || {
      marketCapCoverage: 'unknown',
      marketCapCoverageReason: 'coverage не рассчитан'
    };
    const classificationStatus = c.sector
      ? 'classified'
      : (c.companyId === 'sistema' ? 'unclassified-diversified-holding' : 'unclassified');
    if (c.sector && !CANONICAL_SECTORS.includes(c.sector)) {
      throw new Error('non-canonical sector in companies: ' + c.companyId + ' ' + c.sector);
    }
    return { ...c, ...coverage, classificationStatus };
  });

  const classified = enriched.filter((c) => c.classificationStatus === 'classified');
  const unclassified = enriched.filter((c) => c.classificationStatus !== 'classified');
  const withCap = enriched.filter((c) => c.marketCapRub != null);
  const classifiedWithCap = classified.filter((c) => c.marketCapRub != null);

  const classifiedMarketCapRub = classifiedWithCap.reduce((a, c) => a + c.marketCapRub, 0);
  const classifiedTurnoverRub = classified.reduce((a, c) => a + (c.totalTurnoverRub || 0), 0);
  const totalUniverseTurnoverRub = enriched.reduce((a, c) => a + (c.totalTurnoverRub || 0), 0);
  const totalUniverseMarketCapRub = withCap.reduce((a, c) => a + c.marketCapRub, 0);
  const unclassifiedTurnoverRub = unclassified.reduce((a, c) => a + (c.totalTurnoverRub || 0), 0);
  const unclassifiedMarketCapRub = unclassified
    .filter((c) => c.marketCapRub != null)
    .reduce((a, c) => a + c.marketCapRub, 0);

  const coverageCounts = { full: 0, partial: 0, unknown: 0 };
  enriched.forEach((c) => { coverageCounts[c.marketCapCoverage] = (coverageCounts[c.marketCapCoverage] || 0) + 1; });
  const partialCases = enriched.filter((c) => c.marketCapCoverage === 'partial');
  const unknownCases = enriched.filter((c) => c.marketCapCoverage === 'unknown');

  const denominators = {
    marketCapSharePct: 'classifiedMarketCapRub',
    turnoverSharePct: 'classifiedTurnoverRub',
    concentrationSharePct: 'totalUniverseMarketCapRub',
    averageDailyTurnoverRub: 'tradingDayCount (254 TQBR days, not calendar days)',
    classifiedMarketCapRub: 'сумма marketCapRub компаний со статусом classified и ненулевым (non-null) cap',
    classifiedTurnoverRub: 'сумма totalTurnoverRub компаний classified; null не заменяется на 0, наблюдаемый 0 остаётся 0',
    totalUniverseTurnoverRub: 'сумма оборота всех 217 компаний universe, включая unclassified',
    totalUniverseMarketCapRub: 'сумма non-null marketCapRub всех компаний universe, включая unclassified'
  };

  const sectorSummary = sectors.map((r) => ({
    sector: r.sector,
    companyCount: r.companyCount,
    marketCapRub: r.marketCapRub,
    marketCapSharePct: r.marketCapSharePct,
    marketCapSharePctDenominator: 'classifiedMarketCapRub',
    totalTurnoverRub: r.totalTurnoverRub,
    turnoverSharePct: r.turnoverSharePct,
    turnoverSharePctDenominator: 'classifiedTurnoverRub',
    averageDailyTurnoverRub: r.averageDailyTurnoverRub,
    turnoverIntensity: r.turnoverIntensity,
    turnoverIntensityLabel: TURNOVER_INTENSITY_DEF.label,
    capMissingCompanies: r.capMissingCompanies
  }));

  const industrySummary = industries.map((r) => ({
    industry: r.industry,
    companyCount: r.companyCount,
    marketCapRub: r.marketCapRub,
    marketCapSharePct: r.marketCapSharePct,
    marketCapSharePctDenominator: 'classifiedMarketCapRub',
    totalTurnoverRub: r.totalTurnoverRub,
    turnoverSharePct: r.turnoverSharePct,
    turnoverSharePctDenominator: 'classifiedTurnoverRub',
    averageDailyTurnoverRub: r.averageDailyTurnoverRub,
    turnoverIntensity: r.turnoverIntensity,
    turnoverIntensityLabel: TURNOVER_INTENSITY_DEF.label,
    capMissingCompanies: r.capMissingCompanies
  }));

  const imoexDate = imoexRaw.tradedate;
  const imoexSecs = (imoexRaw.constituents || []).map((r) => r.secid || r.ticker);
  const imoexCompanies = enriched.filter((c) => c.isIMOEX);
  const smlt = samoletSanity(securities);
  const sistema = enriched.find((c) => c.companyId === 'sistema');

  const articleFacts = {
    analysisDate: ANALYSIS_DATE,
    turnoverStartDate: TURNOVER_START,
    turnoverEndDate: TURNOVER_END,
    tradingDayCount: 254,
    universe: meta.universe,
    securityCount: 259,
    universeCompanyCount: 217,
    classifiedCompanyCount: classified.length,
    unclassifiedCompanyCount: unclassified.length,
    companiesWithMarketCapCount: withCap.length,
    partialCapCompanyCount: partialCases.length,
    unknownCapCompanyCount: unknownCases.length,
    fullCapCompanyCount: coverageCounts.full,
    classifiedMarketCapRub,
    classifiedTurnoverRub,
    totalUniverseMarketCapRub,
    totalUniverseTurnoverRub,
    unclassifiedMarketCapRub,
    unclassifiedTurnoverRub,
    denominators,
    marketCapTerminology: MARKET_CAP_TERMINOLOGY,
    turnoverIntensity: TURNOVER_INTENSITY_DEF,
    sistema: {
      companyId: 'sistema',
      tickers: sistema ? sistema.tickers : ['AFKS'],
      treatment: 'unclassified-diversified-holding',
      sector: null,
      inSectorTotals: false,
      marketCapRub: sistema ? sistema.marketCapRub : null,
      totalTurnoverRub: sistema ? sistema.totalTurnoverRub : null,
      note: 'Не вписывается в 9 канонических секторов. В секторных долях не участвует. Новый production sector не добавлялся.'
    },
    imoex: {
      source: '/iss/statistics/engines/stock/markets/index/analytics/IMOEX.json',
      tradedate: imoexDate,
      matchesAnalysisDate: imoexDate === ANALYSIS_DATE,
      securityCount: imoexSecs.length,
      companyCount: imoexCompanies.length,
      officialWeightsUsed: false,
      classifiedCapSharePct: classifiedMarketCapRub > 0
        ? ROUND_PCT(100 * (imoexVs.imoex.marketCapRub || 0) / classifiedMarketCapRub)
        : null,
      classifiedTurnoverSharePct: classifiedTurnoverRub > 0
        ? ROUND_PCT(100 * (imoexVs.imoex.totalTurnoverRub || 0) / classifiedTurnoverRub)
        : null
    },
    topSectorsByMarketCap: sectorSummary.map((r) => ({
      sector: r.sector,
      marketCapSharePct: r.marketCapSharePct,
      turnoverSharePct: r.turnoverSharePct,
      turnoverIntensity: r.turnoverIntensity
    })),
    topSectorsByTurnover: [...sectorSummary].sort((a, b) => b.turnoverSharePct - a.turnoverSharePct).map((r) => ({
      sector: r.sector,
      turnoverSharePct: r.turnoverSharePct,
      marketCapSharePct: r.marketCapSharePct
    })),
    topIndustriesByMarketCap: industrySummary.slice(0, 10).map((r) => ({
      industry: r.industry,
      marketCapSharePct: r.marketCapSharePct,
      turnoverSharePct: r.turnoverSharePct
    })),
    topCompaniesByMarketCap: concentration.top10ByMarketCap,
    topCompaniesByTurnover: concentration.top10ByTurnover,
    concentration: {
      top5MarketCapSharePct: concentration.top5MarketCapSharePct,
      top10MarketCapSharePct: concentration.top10MarketCapSharePct,
      top5TurnoverSharePct: concentration.top5TurnoverSharePct,
      top10TurnoverSharePct: concentration.top10TurnoverSharePct,
      shareDenominator: 'totalUniverseMarketCapRub / totalUniverseTurnoverRub'
    },
    samolet: smlt,
    caveats: [
      'Капитализация — сумма included TQBR issues на analysisDate, не автоматически полный акционерный капитал эмитента.',
      'Доли секторов считаются от classifiedMarketCapRub / classifiedTurnoverRub; АФК Система вне секторной классификации.',
      'turnoverIntensity сопоставляет 12м оборот с cap на дату среза, это не liquidity score.',
      smlt.caveat,
      'Missing cap не заменяется на 0 (GAZT/GAZS/GAZC/MGNZ — stale-untraded-price).'
    ]
  };

  writeJson(path.join(FINAL, 'company-summary.json'), {
    analysisDate: ANALYSIS_DATE,
    turnoverStartDate: TURNOVER_START,
    turnoverEndDate: TURNOVER_END,
    marketCapTerminology: MARKET_CAP_TERMINOLOGY.term,
    count: enriched.length,
    companies: enriched.map(compactCompany)
  });
  writeJson(path.join(FINAL, 'sector-summary.json'), {
    analysisDate: ANALYSIS_DATE,
    denominators,
    turnoverIntensity: TURNOVER_INTENSITY_DEF,
    classifiedCompanyCount: classified.length,
    classifiedMarketCapRub,
    classifiedTurnoverRub,
    unclassified: unclassified.map((c) => ({
      companyId: c.companyId,
      tickers: c.tickers,
      classificationStatus: c.classificationStatus,
      sector: c.sector,
      marketCapRub: c.marketCapRub,
      totalTurnoverRub: c.totalTurnoverRub,
      note: c.reviewReason
    })),
    sectors: sectorSummary
  });
  writeJson(path.join(FINAL, 'industry-summary.json'), {
    analysisDate: ANALYSIS_DATE,
    denominators,
    classifiedMarketCapRub,
    classifiedTurnoverRub,
    industries: industrySummary
  });
  writeJson(path.join(FINAL, 'cap-coverage.json'), {
    analysisDate: ANALYSIS_DATE,
    counts: coverageCounts,
    terminology: MARKET_CAP_TERMINOLOGY,
    partial: partialCases.map((c) => ({
      companyId: c.companyId,
      tickers: c.tickers,
      companyName: c.shortName,
      listedClasses: (c.shareClasses || []).map((x) => x.shareClass),
      marketCapRub: c.marketCapRub,
      reason: c.marketCapCoverageReason
    })),
    unknown: unknownCases.map((c) => ({
      companyId: c.companyId,
      tickers: c.tickers,
      companyName: c.shortName,
      listedClasses: (c.shareClasses || []).map((x) => x.shareClass),
      marketCapRub: c.marketCapRub,
      reason: c.marketCapCoverageReason
    }))
  });
  writeJson(path.join(FINAL, 'article-facts.json'), articleFacts);

  const coCols = [
    'companyId', 'shortName', 'tickers', 'sector', 'industry', 'classificationStatus',
    'marketCapCoverage', 'isIMOEX', 'marketCapRub', 'totalTurnoverRub',
    'averageDailyTurnoverRub', 'qualityStatus'
  ];
  fs.writeFileSync(path.join(FINAL, 'company-summary.csv'), toCsv(enriched.map(compactCompany), coCols), 'utf8');
  fs.writeFileSync(
    path.join(FINAL, 'sector-summary.csv'),
    toCsv(sectorSummary, ['sector', 'companyCount', 'marketCapRub', 'marketCapSharePct', 'totalTurnoverRub', 'turnoverSharePct', 'averageDailyTurnoverRub', 'turnoverIntensity']),
    'utf8'
  );
  fs.writeFileSync(
    path.join(FINAL, 'industry-summary.csv'),
    toCsv(industrySummary, ['industry', 'companyCount', 'marketCapRub', 'marketCapSharePct', 'totalTurnoverRub', 'turnoverSharePct', 'averageDailyTurnoverRub', 'turnoverIntensity']),
    'utf8'
  );

  console.log('final written to', FINAL);
  console.log('coverage', coverageCounts);
  console.log('classified', classified.length, 'unclassified', unclassified.length);
  console.log('IMOEX date', imoexDate, 'secs', imoexSecs.length, 'cos', imoexCompanies.length, 'match', imoexDate === ANALYSIS_DATE);
  console.log('SMLT dup', smlt.duplicateDates, 'sum match', smlt.turnoverMatchesHistorySum, 'cap match', smlt.capEqualsIssueSizeTimesLegalClose);
  console.log('px', smlt.periodStartClose, '→', smlt.periodEndClose, 'min', smlt.minLegalClose, 'max', smlt.maxLegalClose);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
