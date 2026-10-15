'use strict';

import fs from 'fs';
import path from 'path';
import {
  RAW, HISTORY_DIR, DATASETS, MAPPING, ANALYSIS_DATE, TURNOVER_START, TURNOVER_END,
  readJson, writeJson, toCsv, finiteNumber, slugify
} from './lib.mjs';
import { CANONICAL_SECTORS, BY_TICKER, classificationForTickers } from './classification-rules.mjs';

const ROUND_PCT = (v) => Math.round(v * 10000) / 10000;

function qualityStatus(flags) {
  if (flags.includes('classification-review')) return 'classification-review';
  if (flags.includes('unsupported-security')) return 'unsupported-security';
  if (flags.includes('missing-market-cap') && flags.includes('missing-turnover')) return 'missing-market-cap,missing-turnover';
  if (flags.includes('missing-market-cap')) return 'missing-market-cap';
  if (flags.includes('missing-turnover')) return 'missing-turnover';
  if (flags.includes('stale-untraded-price')) return 'stale-untraded-price';
  if (flags.length) return flags[0];
  return 'complete';
}

function securityCap(s, histRows) {
  const anyTurnover = histRows.some((r) => r.value != null && r.value > 0);
  const tradesOnDate = s.analysisValue != null && s.analysisValue > 0;
  const px = finiteNumber(s.analysisLegalClose);
  const livePx = finiteNumber(s.liveLast);
  const staleCap = (s.issueSize != null && px != null && px > 0)
    ? s.issueSize * px
    : finiteNumber(s.liveIssueCap);
  if (s.issueSize == null) {
    return { marketCapRub: null, capMethod: null, flags: ['missing-market-cap'], staleCapRub: staleCap };
  }
  if (px != null && px > 0 && (tradesOnDate || anyTurnover)) {
    return {
      marketCapRub: s.issueSize * px,
      capMethod: 'issuesize * LEGALCLOSEPRICE[analysisDate]',
      flags: [],
      staleCapRub: null
    };
  }
  if (livePx != null && livePx > 0) {
    return {
      marketCapRub: s.issueSize * livePx,
      capMethod: 'issuesize * LAST[live]',
      flags: ['used-live-price'],
      staleCapRub: null
    };
  }
  return {
    marketCapRub: null,
    capMethod: null,
    flags: ['stale-untraded-price'],
    staleCapRub: staleCap
  };
}

function main() {
  const universe = readJson(path.join(RAW, 'universe-included.json'));
  const calendar = readJson(path.join(RAW, 'trading-calendar.json'));
  const imoex = readJson(path.join(RAW, 'imoex-constituents.json'));
  const indices = readJson(path.join(RAW, 'sector-indices.json')).indices;
  const profiles = readJson(path.resolve(RAW, '../../../data/company-profiles.json'));
  const excluded = readJson(path.join(RAW, 'universe-excluded.json'));

  const marketDays = calendar.tradingDayCount;
  const imoexSet = new Set((imoex.constituents || []).map((r) => r.secid || r.ticker));
  const indexByTicker = {};
  Object.entries(indices).forEach(([id, idx]) => {
    (idx.constituents || []).forEach((c) => {
      const t = c.secid || c.ticker;
      if (!indexByTicker[t]) indexByTicker[t] = [];
      indexByTicker[t].push({ id, title: idx.title, date: idx.tradedate });
    });
  });

  const securities = universe.securities.map((s) => {
    const hist = readJson(path.join(HISTORY_DIR, s.secid + '.json')) || { history: [] };
    const rows = hist.history || [];
    let totalTurnover = 0;
    let daysWithValue = 0;
    let daysWithTrade = 0;
    rows.forEach((r) => {
      if (r.value == null) return;
      totalTurnover += r.value;
      daysWithValue += 1;
      if (r.value > 0) daysWithTrade += 1;
    });
    const cap = securityCap(s, rows);
    const flags = [...cap.flags];
    const listedFrom = readJson(path.join(RAW, 'securities', s.secid + '.json'));
    const tqbr = listedFrom && listedFrom.tqbrPrimary;
    if (tqbr && tqbr.listedFrom && tqbr.listedFrom > TURNOVER_START) flags.push('listing-during-period');
    if (rows.length === 0) flags.push('missing-turnover');
    if (daysWithValue > 0 && totalTurnover === 0) flags.push('zero-turnover');
    const cls = classificationForTickers([s.secid]);
    if (cls && cls.review) flags.push('classification-review');
    if (!cls) flags.push('classification-missing');

    return {
      analysisDate: ANALYSIS_DATE,
      ticker: s.secid,
      secid: s.secid,
      shortName: s.shortName,
      isin: s.isin,
      shareClass: s.shareClass,
      listLevel: s.listLevel,
      status: s.status,
      emitentId: s.emitentId,
      emitentInn: s.emitentInn,
      emitentTitle: s.emitentTitle,
      issueSize: s.issueSize,
      analysisLegalClose: s.analysisLegalClose,
      liveIssueCap: s.liveIssueCap,
      marketCapRub: cap.marketCapRub,
      capMethod: cap.capMethod,
      staleCapRub: cap.staleCapRub,
      turnoverPeriodStart: TURNOVER_START,
      turnoverPeriodEnd: TURNOVER_END,
      totalTurnoverRub: rows.length ? totalTurnover : null,
      averageDailyTurnoverRub: rows.length && marketDays ? totalTurnover / marketDays : null,
      tradingDays: marketDays,
      historyRows: rows.length,
      daysWithValue,
      daysWithTrade,
      isIMOEX: imoexSet.has(s.secid),
      moexIndices: (indexByTicker[s.secid] || []).map((x) => x.id),
      listedFrom: tqbr ? tqbr.listedFrom : null,
      listedTill: tqbr ? tqbr.listedTill : null,
      flags,
      qualityStatus: qualityStatus(flags),
      sources: [
        { kind: 'moex-iss', endpoint: '/engines/stock/markets/shares/boards/TQBR/securities.json', fields: ['ISSUESIZE', 'SECTYPE', 'INSTRID', 'ISSUECAPITALIZATION'] },
        { kind: 'moex-iss', endpoint: '/history/engines/stock/markets/shares/boards/TQBR/securities/' + s.secid + '.json', fields: ['VALUE', 'LEGALCLOSEPRICE'] },
        { kind: 'moex-iss', endpoint: '/securities.json', fields: ['emitent_id', 'emitent_title', 'emitent_inn', 'type'] }
      ]
    };
  });

  const groups = {};
  securities.forEach((s) => {
    const cls = classificationForTickers([s.ticker]);
    const key = cls && cls.companyId
      ? cls.companyId
      : ('emitent-' + (s.emitentId || s.emitentInn || slugify(s.emitentTitle) || s.ticker.toLowerCase()));
    if (!groups[key]) {
      groups[key] = {
        companyId: key,
        emitentId: s.emitentId,
        emitentInn: s.emitentInn,
        emitentTitle: s.emitentTitle,
        tickers: [],
        secs: [],
        cls
      };
    }
    const g = groups[key];
    g.tickers.push(s.ticker);
    g.secs.push(s);
    if (!g.cls && cls) g.cls = cls;
    if (s.shareClass === 'ordinary') g.emitentTitle = s.emitentTitle;
  });

  const companies = Object.values(groups).map((g) => {
    const cls = g.cls || {};
    const flags = [];
    const caps = g.secs.map((s) => s.marketCapRub);
    const tos = g.secs.map((s) => s.totalTurnoverRub);
    const marketCapRub = caps.every((v) => v == null) ? null : caps.reduce((a, v) => a + (v || 0), 0);
    const totalTurnoverRub = tos.every((v) => v == null) ? null : tos.reduce((a, v) => a + (v || 0), 0);
    if (caps.some((v) => v == null) && !caps.every((v) => v == null)) flags.push('partial-market-cap');
    if (caps.every((v) => v == null)) flags.push('missing-market-cap');
    if (g.secs.some((s) => s.flags.includes('stale-untraded-price'))) flags.push('stale-untraded-price');
    if (tos.every((v) => v == null)) flags.push('missing-turnover');
    if (cls.review) flags.push('classification-review');
    if (!cls.sector && !cls.review) flags.push('missing-sector');
    if (g.secs.some((s) => s.shareClass === 'preferred') && !g.secs.some((s) => s.shareClass === 'ordinary')) {
      flags.push('preferred-only-listed');
    }
    if (g.secs.some((s) => s.flags.includes('listing-during-period'))) flags.push('listing-during-period');
    const profile = (profiles.companies || []).find((c) => c.companyId === g.companyId);
    return {
      companyId: g.companyId,
      companyName: profile ? profile.fullName : g.emitentTitle,
      shortName: profile ? profile.shortName : g.secs[0].shortName,
      tickers: g.tickers,
      shareClasses: g.secs.map((s) => ({ ticker: s.ticker, shareClass: s.shareClass })),
      emitentId: g.emitentId,
      emitentInn: g.emitentInn,
      sector: cls.sector || null,
      industry: cls.industry || null,
      classificationOrigin: cls.origin || (cls.review ? 'review' : (cls.sector ? 'research-mapping' : null)),
      classificationSources: cls.sources || [],
      reviewReason: cls.reviewReason || null,
      proposedSector: cls.proposedSector || null,
      isIMOEX: g.secs.some((s) => s.isIMOEX),
      marketCapRub,
      totalTurnoverRub,
      averageDailyTurnoverRub: totalTurnoverRub != null && marketDays ? totalTurnoverRub / marketDays : null,
      staleCapRub: g.secs.reduce((a, s) => a + (s.staleCapRub || 0), 0) || null,
      flags,
      qualityStatus: qualityStatus(flags)
    };
  }).sort((a, b) => (b.marketCapRub || 0) - (a.marketCapRub || 0));

  const classified = companies.filter((c) => c.sector);
  const sumCap = (rows) => rows.reduce((a, r) => a + (r.marketCapRub || 0), 0);
  const sumTo = (rows) => rows.reduce((a, r) => a + (r.totalTurnoverRub || 0), 0);

  const totalCapAll = sumCap(companies);
  const totalToAll = sumTo(companies);
  const totalCapClassified = sumCap(classified);
  const totalToClassified = sumTo(classified);

  function aggregate(rows, key) {
    const map = {};
    rows.forEach((c) => {
      const k = c[key];
      if (!k) return;
      if (!map[k]) {
        map[k] = {
          [key]: k,
          companyCount: 0,
          marketCapRub: 0,
          totalTurnoverRub: 0,
          capMissingCompanies: 0,
          turnoverMissingCompanies: 0
        };
      }
      map[k].companyCount += 1;
      if (c.marketCapRub == null) map[k].capMissingCompanies += 1;
      else map[k].marketCapRub += c.marketCapRub;
      if (c.totalTurnoverRub == null) map[k].turnoverMissingCompanies += 1;
      else map[k].totalTurnoverRub += c.totalTurnoverRub;
    });
    return Object.values(map).map((r) => {
      const marketCapSharePct = totalCapClassified > 0 ? ROUND_PCT(100 * r.marketCapRub / totalCapClassified) : null;
      const turnoverSharePct = totalToClassified > 0 ? ROUND_PCT(100 * r.totalTurnoverRub / totalToClassified) : null;
      const turnoverIntensity = marketCapSharePct > 0 && turnoverSharePct != null
        ? ROUND_PCT(turnoverSharePct / marketCapSharePct)
        : null;
      return {
        ...r,
        marketCapSharePct,
        turnoverSharePct,
        averageDailyTurnoverRub: marketDays ? r.totalTurnoverRub / marketDays : null,
        turnoverIntensity
      };
    }).sort((a, b) => b.marketCapRub - a.marketCapRub);
  }

  const sectorAgg = aggregate(classified, 'sector');
  const industryAgg = aggregate(classified, 'industry');

  const imoexCompanies = classified.filter((c) => c.isIMOEX);
  const imoexCap = sumCap(imoexCompanies);
  const imoexTo = sumTo(imoexCompanies);

  function shareTable(agg, universeCap, universeTo) {
    return agg.map((r) => ({
      ...r,
      marketCapSharePct: universeCap > 0 ? ROUND_PCT(100 * r.marketCapRub / universeCap) : null,
      turnoverSharePct: universeTo > 0 ? ROUND_PCT(100 * r.totalTurnoverRub / universeTo) : null,
      turnoverIntensity: universeCap > 0 && universeTo > 0 && r.marketCapRub > 0
        ? ROUND_PCT((100 * r.totalTurnoverRub / universeTo) / (100 * r.marketCapRub / universeCap))
        : null
    }));
  }

  const imoexSector = shareTable(aggregate(imoexCompanies, 'sector').map((r) => ({
    sector: r.sector,
    companyCount: r.companyCount,
    marketCapRub: r.marketCapRub,
    totalTurnoverRub: r.totalTurnoverRub
  })), imoexCap, imoexTo);

  function topN(rows, field, n) {
    return [...rows]
      .filter((r) => r[field] != null)
      .sort((a, b) => b[field] - a[field])
      .slice(0, n)
      .map((c, i) => ({
        rank: i + 1,
        companyId: c.companyId,
        companyName: c.shortName || c.companyName,
        tickers: c.tickers,
        sector: c.sector,
        industry: c.industry,
        valueRub: c[field],
        sharePct: field === 'marketCapRub'
          ? (totalCapAll > 0 ? ROUND_PCT(100 * c[field] / totalCapAll) : null)
          : (totalToAll > 0 ? ROUND_PCT(100 * c[field] / totalToAll) : null)
      }));
  }

  const capCompanies = companies.filter((c) => c.marketCapRub != null);
  const toCompanies = companies.filter((c) => c.totalTurnoverRub != null);
  const top5CapShare = ROUND_PCT(100 * sumCap(capCompanies.slice().sort((a, b) => b.marketCapRub - a.marketCapRub).slice(0, 5)) / totalCapAll);
  const top10CapShare = ROUND_PCT(100 * sumCap(capCompanies.slice().sort((a, b) => b.marketCapRub - a.marketCapRub).slice(0, 10)) / totalCapAll);
  const top5ToShare = ROUND_PCT(100 * sumTo(toCompanies.slice().sort((a, b) => b.totalTurnoverRub - a.totalTurnoverRub).slice(0, 5)) / totalToAll);
  const top10ToShare = ROUND_PCT(100 * sumTo(toCompanies.slice().sort((a, b) => b.totalTurnoverRub - a.totalTurnoverRub).slice(0, 10)) / totalToAll);

  const largestPerSector = {};
  classified.forEach((c) => {
    if (!c.sector) return;
    if (!largestPerSector[c.sector]) largestPerSector[c.sector] = { byCap: null, byTurnover: null };
    const slot = largestPerSector[c.sector];
    if (c.marketCapRub != null && (!slot.byCap || c.marketCapRub > slot.byCap.marketCapRub)) {
      slot.byCap = { companyId: c.companyId, name: c.shortName, tickers: c.tickers, marketCapRub: c.marketCapRub };
    }
    if (c.totalTurnoverRub != null && (!slot.byTurnover || c.totalTurnoverRub > slot.byTurnover.totalTurnoverRub)) {
      slot.byTurnover = { companyId: c.companyId, name: c.shortName, tickers: c.tickers, totalTurnoverRub: c.totalTurnoverRub };
    }
  });

  const missingClass = companies.filter((c) => !c.sector && !c.reviewReason);
  const review = companies.filter((c) => c.qualityStatus === 'classification-review' || c.reviewReason);

  const meta = {
    analysisDate: ANALYSIS_DATE,
    turnoverStartDate: TURNOVER_START,
    turnoverEndDate: TURNOVER_END,
    tradingDayCount: marketDays,
    universe: universe.definition,
    securityCount: securities.length,
    companyCount: companies.length,
    imoexSecurityCount: securities.filter((s) => s.isIMOEX).length,
    imoexCompanyCount: companies.filter((c) => c.isIMOEX).length,
    classifiedCompanyCount: classified.length,
    reviewCompanyCount: review.length,
    missingClassificationCount: missingClass.length,
    missingMarketCapSecurities: securities.filter((s) => s.marketCapRub == null).length,
    missingTurnoverSecurities: securities.filter((s) => s.totalTurnoverRub == null).length,
    staleUntradedSecurities: securities.filter((s) => s.flags.includes('stale-untraded-price')).length,
    totalMarketCapRub: totalCapAll,
    totalMarketCapClassifiedRub: totalCapClassified,
    totalTurnover12mRub: totalToAll,
    excludedTqbrCount: excluded.count,
    canonicalSectors: CANONICAL_SECTORS
  };

  const companyByTicker = {};
  companies.forEach((c) => {
    c.tickers.forEach((t) => { companyByTicker[t] = c; });
  });
  securities.forEach((s) => {
    const c = companyByTicker[s.ticker];
    s.companyId = c ? c.companyId : null;
    s.companyName = c ? c.companyName : null;
    s.sector = c ? c.sector : null;
    s.industry = c ? c.industry : null;
  });

  writeJson(path.join(DATASETS, 'meta.json'), meta);
  writeJson(path.join(DATASETS, 'securities.json'), securities);
  writeJson(path.join(DATASETS, 'companies.json'), companies);
  writeJson(path.join(DATASETS, 'sectors.json'), sectorAgg);
  writeJson(path.join(DATASETS, 'industries.json'), industryAgg);
  writeJson(path.join(DATASETS, 'imoex-vs-broad.json'), {
    broad: {
      companyCount: classified.length,
      marketCapRub: totalCapClassified,
      totalTurnoverRub: totalToClassified,
      sectors: sectorAgg
    },
    imoex: {
      companyCount: imoexCompanies.length,
      marketCapRub: imoexCap,
      totalTurnoverRub: imoexTo,
      sectors: imoexSector,
      industries: shareTable(aggregate(imoexCompanies, 'industry').map((r) => ({
        industry: r.industry,
        companyCount: r.companyCount,
        marketCapRub: r.marketCapRub,
        totalTurnoverRub: r.totalTurnoverRub
      })), imoexCap, imoexTo)
    }
  });
  writeJson(path.join(DATASETS, 'concentration.json'), {
    top5MarketCapSharePct: top5CapShare,
    top10MarketCapSharePct: top10CapShare,
    top5TurnoverSharePct: top5ToShare,
    top10TurnoverSharePct: top10ToShare,
    top10ByMarketCap: topN(companies, 'marketCapRub', 10),
    top10ByTurnover: topN(companies, 'totalTurnoverRub', 10),
    largestPerSector
  });
  writeJson(path.join(DATASETS, 'quality.json'), {
    review,
    missingClassification: missingClass,
    staleUntraded: companies.filter((c) => c.flags.includes('stale-untraded-price')),
    preferredOnly: companies.filter((c) => c.flags.includes('preferred-only-listed')),
    listingDuringPeriod: companies.filter((c) => c.flags.includes('listing-during-period')),
    flagCounts: securities.reduce((a, s) => {
      s.flags.forEach((f) => { a[f] = (a[f] || 0) + 1; });
      return a;
    }, {})
  });

  const secCols = ['analysisDate', 'ticker', 'secid', 'shortName', 'companyId', 'companyName', 'shareClass', 'sector', 'industry', 'emitentId', 'listLevel', 'isIMOEX', 'marketCapRub', 'capMethod', 'totalTurnoverRub', 'averageDailyTurnoverRub', 'tradingDays', 'historyRows', 'qualityStatus'];
  fs.writeFileSync(path.join(DATASETS, 'securities.csv'), toCsv(securities, secCols), 'utf8');
  const coCols = ['companyId', 'companyName', 'shortName', 'tickers', 'sector', 'industry', 'isIMOEX', 'marketCapRub', 'totalTurnoverRub', 'averageDailyTurnoverRub', 'qualityStatus'];
  fs.writeFileSync(path.join(DATASETS, 'companies.csv'), toCsv(companies, coCols), 'utf8');
  fs.writeFileSync(path.join(DATASETS, 'sectors.csv'), toCsv(sectorAgg, ['sector', 'companyCount', 'marketCapRub', 'marketCapSharePct', 'totalTurnoverRub', 'turnoverSharePct', 'averageDailyTurnoverRub', 'turnoverIntensity']), 'utf8');
  fs.writeFileSync(path.join(DATASETS, 'industries.csv'), toCsv(industryAgg, ['industry', 'companyCount', 'marketCapRub', 'marketCapSharePct', 'totalTurnoverRub', 'turnoverSharePct', 'averageDailyTurnoverRub', 'turnoverIntensity']), 'utf8');

  writeJson(path.join(MAPPING, 'classification.json'), {
    generatedAt: new Date().toISOString(),
    tickerCount: Object.keys(BY_TICKER).length,
    byTicker: BY_TICKER
  });

  console.log('securities', securities.length);
  console.log('companies', companies.length);
  console.log('classified', classified.length, 'review', review.length, 'missing', missingClass.length);
  console.log('total cap T', (totalCapAll / 1e12).toFixed(3), 'classified', (totalCapClassified / 1e12).toFixed(3));
  console.log('total 12m to T', (totalToAll / 1e12).toFixed(3));
  if (missingClass.length) {
    console.log('MISSING CLASSIFICATION');
    missingClass.forEach((c) => console.log(c.tickers.join('+'), c.companyName, c.marketCapRub));
  }
  console.log('SECTORS');
  sectorAgg.forEach((r) => {
    console.log(
      r.sector.padEnd(28),
      String(r.companyCount).padStart(3),
      (r.marketCapSharePct).toFixed(2).padStart(6) + '% cap',
      (r.turnoverSharePct).toFixed(2).padStart(6) + '% to',
      'int', (r.turnoverIntensity || 0).toFixed(2)
    );
  });
}

main();
