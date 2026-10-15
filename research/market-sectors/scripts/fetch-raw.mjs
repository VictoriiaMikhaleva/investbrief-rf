'use strict';

import path from 'path';
import {
  MOEX_ISS, ANALYSIS_DATE, TURNOVER_START, TURNOVER_END, SECTOR_INDICES,
  ROOT, RAW, HISTORY_DIR, ensureDirs, writeJson, readJson,
  moexFetchJson, mapTable, fetchAllPages, mapPool, finiteNumber
} from './lib.mjs';

function isCommonOrPref(type) {
  return type === 'common_share' || type === 'preferred_share';
}

function shareClassOf(type, secType) {
  if (type === 'preferred_share' || secType === '2' || secType === 2) return 'preferred';
  if (type === 'common_share' || secType === '1' || secType === 1) return 'ordinary';
  if (type === 'depositary_receipt' || secType === 'D') return 'dr';
  return type || String(secType || 'unknown');
}

async function fetchTqbrSnapshot() {
  const json = await moexFetchJson(
    MOEX_ISS + '/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off'
  );
  return {
    fetchedAt: new Date().toISOString(),
    securities: mapTable(json.securities),
    marketdata: mapTable(json.marketdata)
  };
}

async function fetchIssSecurities() {
  const types = ['common_share', 'preferred_share', 'depositary_receipt'];
  const byType = {};
  for (const type of types) {
    byType[type] = await fetchAllPages(
      MOEX_ISS + '/securities.json?engine=stock&is_trading=1&group_by=type&group_by_filter=' + type,
      'securities'
    );
  }
  return byType;
}

async function fetchHistoryDate(date) {
  return fetchAllPages(
    MOEX_ISS + '/history/engines/stock/markets/shares/boards/TQBR/securities.json?date=' + date,
    'history'
  );
}

async function fetchIndexAnalytics(indexId) {
  const rows = await fetchAllPages(
    MOEX_ISS + '/statistics/engines/stock/markets/index/analytics/' + indexId + '.json?limit=200',
    'analytics'
  );
  return {
    indexId,
    tradedate: rows[0] ? rows[0].tradedate : null,
    count: rows.length,
    constituents: rows.map((r) => ({
      ticker: r.ticker || r.secids,
      secid: r.secids || r.ticker,
      shortName: r.shortnames,
      weight: finiteNumber(r.weight)
    }))
  };
}

async function fetchSecurityMeta(secid) {
  const file = path.join(RAW, 'securities', secid + '.json');
  const cached = readJson(file);
  if (cached && cached.secid === secid) return cached;
  const json = await moexFetchJson(MOEX_ISS + '/securities/' + encodeURIComponent(secid) + '.json?iss.meta=off');
  const description = {};
  mapTable(json.description).forEach((r) => { description[r.name] = r.value; });
  const boards = mapTable(json.boards);
  const tqbr = boards.find((b) => b.boardid === 'TQBR') || null;
  const out = {
    secid,
    fetchedAt: new Date().toISOString(),
    description,
    boards,
    tqbrPrimary: tqbr ? {
      isTraded: tqbr.is_traded,
      isPrimary: tqbr.is_primary,
      historyFrom: tqbr.history_from,
      historyTill: tqbr.history_till,
      listedFrom: tqbr.listed_from,
      listedTill: tqbr.listed_till
    } : null
  };
  writeJson(file, out);
  return out;
}

async function fetchTickerHistory(secid) {
  const file = path.join(HISTORY_DIR, secid + '.json');
  const cached = readJson(file);
  if (cached && cached.secid === secid && cached.from === TURNOVER_START && cached.till === TURNOVER_END) {
    return cached;
  }
  const base = MOEX_ISS + '/history/engines/stock/markets/shares/boards/TQBR/securities/' +
    encodeURIComponent(secid) + '.json?from=' + TURNOVER_START + '&till=' + TURNOVER_END +
    '&iss.meta=off&history.columns=TRADEDATE,CLOSE,LEGALCLOSEPRICE,VALUE,VOLUME,NUMTRADES,CURRENCYID';
  const rows = [];
  let start = 0;
  for (;;) {
    const json = await moexFetchJson(base + '&start=' + start);
    const hist = json.history;
    const page = mapTable(hist);
    if (!page.length) break;
    page.forEach((r) => {
      rows.push({
        date: String(r.TRADEDATE || '').slice(0, 10),
        close: finiteNumber(r.CLOSE),
        legalClose: finiteNumber(r.LEGALCLOSEPRICE),
        value: finiteNumber(r.VALUE),
        volume: finiteNumber(r.VOLUME),
        numTrades: finiteNumber(r.NUMTRADES),
        currency: r.CURRENCYID || null
      });
    });
    const cur = json['history.cursor'] && json['history.cursor'].data && json['history.cursor'].data[0];
    const total = cur ? Number(cur[1]) : rows.length;
    const pageSize = cur ? Number(cur[2]) : page.length;
    if (pageSize > 0 && start + page.length < total) start += pageSize;
    else break;
  }
  const byDate = {};
  rows.forEach((r) => { if (r.date) byDate[r.date] = r; });
  const history = Object.keys(byDate).sort().map((d) => byDate[d]);
  const out = {
    secid,
    board: 'TQBR',
    from: TURNOVER_START,
    till: TURNOVER_END,
    fetchedAt: new Date().toISOString(),
    source: base.split('&start=')[0],
    rowCount: history.length,
    history
  };
  writeJson(file, out);
  return out;
}

async function main() {
  ensureDirs();
  console.log('analysisDate', ANALYSIS_DATE);
  console.log('turnover', TURNOVER_START, '→', TURNOVER_END);

  console.log('1/7 TQBR snapshot');
  const tqbr = await fetchTqbrSnapshot();
  writeJson(path.join(RAW, 'tqbr-snapshot.json'), tqbr);
  const mdBy = Object.fromEntries(tqbr.marketdata.map((r) => [r.SECID, r]));

  console.log('2/7 ISS securities directory');
  const issSec = await fetchIssSecurities();
  writeJson(path.join(RAW, 'iss-securities-directory.json'), {
    fetchedAt: new Date().toISOString(),
    counts: {
      common_share: issSec.common_share.length,
      preferred_share: issSec.preferred_share.length,
      depositary_receipt: issSec.depositary_receipt.length
    },
    securities: issSec
  });

  const directory = [...issSec.common_share, ...issSec.preferred_share, ...issSec.depositary_receipt];
  const dirBySecid = Object.fromEntries(directory.map((r) => [r.secid, r]));

  console.log('2b/7 ISS stock_shares directory (all statuses, for cap coverage)');
  const allShares = await fetchAllPages(
    MOEX_ISS + '/securities.json?engine=stock&group_by=group&group_by_filter=stock_shares',
    'securities'
  );
  writeJson(path.join(RAW, 'iss-stock-shares-all.json'), {
    fetchedAt: new Date().toISOString(),
    count: allShares.length,
    securities: allShares
  });

  console.log('3/7 analysis-date history snapshot', ANALYSIS_DATE);
  const histDay = await fetchHistoryDate(ANALYSIS_DATE);
  writeJson(path.join(RAW, 'tqbr-history-' + ANALYSIS_DATE + '.json'), {
    date: ANALYSIS_DATE,
    fetchedAt: new Date().toISOString(),
    count: histDay.length,
    rows: histDay
  });
  const histBy = Object.fromEntries(histDay.map((r) => [r.SECID, r]));

  const included = [];
  const excluded = [];
  tqbr.securities.forEach((s) => {
    const secid = s.SECID;
    const dir = dirBySecid[secid] || null;
    const type = dir ? dir.type : null;
    const group = dir ? dir.group : null;
    const md = mdBy[secid] || {};
    const hist = histBy[secid] || null;
    const base = {
      secid,
      shortName: s.SHORTNAME,
      secname: s.SECNAME,
      isin: s.ISIN,
      latName: s.LATNAME,
      secType: s.SECTYPE,
      instrId: s.INSTRID,
      listLevel: s.LISTLEVEL,
      status: s.STATUS,
      tradingStatus: md.TRADINGSTATUS || null,
      type,
      group,
      primaryBoard: dir ? dir.primary_boardid : 'TQBR',
      emitentId: dir ? dir.emitent_id : null,
      emitentTitle: dir ? dir.emitent_title : null,
      emitentInn: dir ? dir.emitent_inn : null
    };
    const isShare = s.INSTRID === 'EQIN' && (s.SECTYPE === '1' || s.SECTYPE === '2' || s.SECTYPE === 1 || s.SECTYPE === 2);
    const isActive = s.STATUS === 'A';
    if (isShare && isActive) {
      included.push({
        ...base,
        shareClass: shareClassOf(type, s.SECTYPE),
        issueSize: finiteNumber(s.ISSUESIZE),
        prevLegalClose: finiteNumber(s.PREVLEGALCLOSEPRICE),
        liveLast: finiteNumber(md.LAST),
        liveIssueCap: finiteNumber(md.ISSUECAPITALIZATION),
        liveValtodayRur: finiteNumber(md.VALTODAY_RUR),
        analysisLegalClose: hist ? finiteNumber(hist.LEGALCLOSEPRICE) : null,
        analysisClose: hist ? finiteNumber(hist.CLOSE) : null,
        analysisValue: hist ? finiteNumber(hist.VALUE) : null,
        analysisCurrency: hist ? hist.CURRENCYID : null
      });
    } else {
      let reason = 'other';
      if (s.INSTRID === 'IFTF' || type === 'exchange_ppif' || group === 'stock_etf') reason = 'etf';
      else if (group === 'stock_ppif' || s.INSTRID === 'IFA1' || s.INSTRID === 'IFAY') reason = 'fund-unit';
      else if (type === 'depositary_receipt' || s.SECTYPE === 'D') reason = 'depositary-receipt';
      else if (!isActive) reason = 'status-' + s.STATUS;
      else if (!isShare) reason = 'non-company-instrument';
      excluded.push({ ...base, reason });
    }
  });

  const mtqrShares = directory.filter((r) =>
    isCommonOrPref(r.type) && r.primary_boardid && r.primary_boardid !== 'TQBR'
  );
  writeJson(path.join(RAW, 'non-tqbr-traded-shares.json'), {
    note: 'Traded common/preferred shares whose primary board is not TQBR. Excluded from main universe.',
    rows: mtqrShares
  });

  console.log('included TQBR ordinary/preferred A', included.length);
  console.log('excluded TQBR other', excluded.length, excluded.reduce((a, r) => { a[r.reason] = (a[r.reason] || 0) + 1; return a; }, {}));

  console.log('4/7 IMOEX + sector indices');
  const imoex = await fetchIndexAnalytics('IMOEX');
  writeJson(path.join(RAW, 'imoex-constituents.json'), imoex);
  const sectorIndices = {};
  for (const idx of SECTOR_INDICES) {
    sectorIndices[idx.id] = { ...await fetchIndexAnalytics(idx.id), title: idx.title };
    console.log(' ', idx.id, sectorIndices[idx.id].count, sectorIndices[idx.id].tradedate);
  }
  writeJson(path.join(RAW, 'sector-indices.json'), {
    fetchedAt: new Date().toISOString(),
    indices: sectorIndices
  });

  const universeTickers = included.map((r) => r.secid);
  console.log('5/7 security meta', universeTickers.length);
  await mapPool(universeTickers, 6, (secid) => fetchSecurityMeta(secid));

  console.log('6/7 12m TQBR history', universeTickers.length);
  let done = 0;
  await mapPool(universeTickers, 5, async (secid) => {
    await fetchTickerHistory(secid);
    done += 1;
    if (done % 20 === 0 || done === universeTickers.length) {
      console.log('  history', done + '/' + universeTickers.length);
    }
  });

  const sberHist = readJson(path.join(HISTORY_DIR, 'SBER.json'));
  const marketTradingDays = (sberHist && sberHist.history ? sberHist.history : [])
    .map((r) => r.date)
    .filter(Boolean);
  writeJson(path.join(RAW, 'trading-calendar.json'), {
    sourceSecid: 'SBER',
    board: 'TQBR',
    from: TURNOVER_START,
    till: TURNOVER_END,
    tradingDays: marketTradingDays,
    tradingDayCount: marketTradingDays.length
  });

  writeJson(path.join(RAW, 'universe-included.json'), {
    analysisDate: ANALYSIS_DATE,
    turnoverStartDate: TURNOVER_START,
    turnoverEndDate: TURNOVER_END,
    definition: 'TQBR + INSTRID=EQIN + SECTYPE in {1,2} + STATUS=A (common and preferred shares on the main T+ equity board)',
    count: included.length,
    securities: included
  });
  writeJson(path.join(RAW, 'universe-excluded.json'), {
    analysisDate: ANALYSIS_DATE,
    count: excluded.length,
    securities: excluded
  });

  const emitents = {};
  included.forEach((s) => {
    const key = String(s.emitentId || s.emitentInn || s.secid);
    if (!emitents[key]) {
      emitents[key] = {
        emitentId: s.emitentId,
        emitentInn: s.emitentInn,
        emitentTitle: s.emitentTitle,
        tickers: []
      };
    }
    emitents[key].tickers.push({
      secid: s.secid,
      shareClass: s.shareClass,
      shortName: s.shortName
    });
  });
  writeJson(path.join(RAW, 'emitents.json'), {
    count: Object.keys(emitents).length,
    emitents
  });

  console.log('7/7 raw fetch complete');
  console.log('securities', included.length, 'emitents', Object.keys(emitents).length);
  console.log('IMOEX', imoex.count, imoex.tradedate);
  console.log('trading days', marketTradingDays.length);
  console.log('files in', RAW);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
