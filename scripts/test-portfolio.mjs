/**
 * Wave 0 portfolio schema: normalize / backup compatibility.
 * Run: node scripts/test-portfolio.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

function loadStorageHelpers() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'storage.js'), 'utf8');
  const store = Object.create(null);
  const sandbox = {
    window: {},
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    isFinite,
    parseInt,
    parseFloat,
    setTimeout: () => {},
    clearTimeout: () => {},
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    normalizeTicker: (t) => String(t || '').trim().toUpperCase(),
    Markets: {
      normalizePositionMarket: (raw) => ({
        market: raw && raw.market === 'US' ? 'US' : 'RU',
        currency: raw && raw.market === 'US' ? 'USD' : 'RUB'
      }),
      normalizeWatchlist: (wl) => wl,
      normalizeMarketsSettings: (s) => (s && s.markets) || { ru: true, us: false }
    },
    showToast: () => {},
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ click: () => {} })
    },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    loadProfileToUI: () => {},
    loadFiltersToUI: () => {},
    renderWatchlist: () => {},
    renderHomePage: () => {},
    renderBriefing: () => {},
    renderMarketTiles: () => {},
    renderFeed: () => {},
    renderPortfolio: () => {},
    renderAlerts: () => {},
    updateStats: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code + '\nthis.__np = normalizePortfolio;\nthis.__npos = normalizePosition;\nthis.__ns = normalizeSale;\nthis.__ncf = normalizeCashFlow;\nthis.__getP = getPortfolio;\nthis.__setP = setPortfolio;\nthis.__export = exportAll;\nthis.__import = importAll;\nthis.__KEYS = KEYS;\nthis.__nDate = normalizePortfolioDate;\nthis.__safeDate = safeFormatPortfolioDate;\n', sandbox, { timeout: 5000 });
  return {
    normalizePortfolio: sandbox.__np,
    normalizePosition: sandbox.__npos,
    normalizeSale: sandbox.__ns,
    normalizeCashFlow: sandbox.__ncf,
    getPortfolio: sandbox.__getP,
    setPortfolio: sandbox.__setP,
    importAll: sandbox.__import,
    exportAll: sandbox.__export,
    normalizePortfolioDate: sandbox.__nDate,
    safeFormatPortfolioDate: sandbox.__safeDate,
    store,
    KEYS: sandbox.__KEYS
  };
}

const h = loadStorageHelpers();

{
  const old = h.normalizePortfolio({
    positions: [
      { ticker: 'SBER', qty: 10, avgPrice: 250, buyDate: '2024-01-15', lotId: 'SBER_OLD_1' }
    ]
  });
  assert(old.schemaVersion === 1, 'old backup without schemaVersion → schemaVersion 1');
  assert(Array.isArray(old.cashFlows) && old.cashFlows.length === 0, 'missing cashFlows → []');
  assert(old.positions.length === 1 && old.positions[0].lotId === 'SBER_OLD_1', 'preserve lotId');
  assert(old.positions[0].avgPrice === 250 && old.positions[0].qty === 10, 'preserve qty/avgPrice');
  assert(old.sales.length === 0, 'missing sales → []');
  assert(old.positions[0].fee == null && old.positions[0].source == null, 'optional fields absent when not set');
}

{
  const noSales = h.normalizePortfolio({
    positions: [{ ticker: 'GAZP', qty: 5, avgPrice: 160, lotId: 'GAZP_1' }]
  });
  assert(noSales.sales.length === 0, 'portfolio without sales keeps empty sales');
  assert(noSales.positions[0].ticker === 'GAZP', 'gazp lot kept');
}

{
  const withAlloc = h.normalizePortfolio({
    positions: [{ ticker: 'SBER', qty: 5, avgPrice: 270, lotId: 'SBER_L1' }],
    sales: [{
      saleId: 'SALE_1',
      ticker: 'SBER',
      qty: 5,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2025-06-01',
      allocations: [
        { lotId: 'SBER_L0', qty: 5, buyPrice: 250, buyDate: '2024-01-01' }
      ]
    }]
  });
  assert(withAlloc.sales.length === 1, 'sale kept');
  assert(withAlloc.sales[0].allocations && withAlloc.sales[0].allocations.length === 1, 'allocations preserved');
  assert(withAlloc.sales[0].allocations[0].lotId === 'SBER_L0', 'allocation lotId preserved');
  assert(withAlloc.sales[0].allocations[0].buyPrice === 250, 'allocation buyPrice preserved');
}

{
  const ofz = h.normalizePosition({
    ticker: 'OFZ_26241',
    qty: 30,
    avgPrice: 92.1,
    currentPrice: 93.4,
    buyDate: '2025-03-01',
    lotId: 'OFZ_LOT',
    comment: 'ОФЗ в ядре'
  });
  assert(ofz && ofz.avgPrice === 92.1, 'OFZ avgPrice stays percent-like number');
  assert(ofz.qty === 30 && ofz.lotId === 'OFZ_LOT', 'OFZ qty/lotId preserved');
}

{
  const pos = h.normalizePosition({
    ticker: 'LKOH',
    qty: 2,
    avgPrice: 7000,
    lotId: 'LKOH_1',
    fee: 12.5,
    faceValue: 1000,
    source: 'manual'
  });
  assert(pos.fee === 12.5 && pos.faceValue === 1000 && pos.source === 'manual', 'optional lot fields kept');

  const sale = h.normalizeSale({
    ticker: 'LKOH',
    qty: 1,
    buyPrice: 7000,
    salePrice: 7100,
    saleDate: '2025-07-01',
    fee: 3,
    source: 'manual'
  });
  assert(sale && sale.fee === 3 && sale.source === 'manual', 'optional sale fields kept');

  const badCf = h.normalizeCashFlow({ type: 'deposit', amount: -1 });
  assert(badCf == null, 'invalid cashFlow filtered');
  const goodCf = h.normalizeCashFlow({ type: 'withdraw', amount: 1000, date: '2025-01-02' });
  assert(goodCf && goodCf.type === 'withdraw' && goodCf.amount === 1000, 'valid cashFlow kept');

  const pf = h.normalizePortfolio({
    positions: [pos],
    sales: [sale],
    cashFlows: [
      { type: 'deposit', amount: 5000, date: '2024-12-01' },
      { type: 'nope', amount: 1 },
      null
    ]
  });
  assert(pf.cashFlows.length === 1 && pf.cashFlows[0].amount === 5000, 'cashFlows filters invalid');
}

{
  const before = {
    positions: [
      { ticker: 'SBER', qty: 10, avgPrice: 250.5, buyDate: '2024-01-15', lotId: 'SBER_KEEP' }
    ],
    sales: [{
      saleId: 'SALE_KEEP',
      ticker: 'SBER',
      qty: 2,
      buyPrice: 240,
      salePrice: 260,
      saleDate: '2024-06-01',
      allocations: [{ lotId: 'SBER_KEEP', qty: 2, buyPrice: 240, buyDate: '2024-01-15' }]
    }]
  };
  h.store[h.KEYS.portfolio] = JSON.stringify(before);
  const current = h.getPortfolio();
  assert(current.positions[0].qty === 10 && current.positions[0].avgPrice === 250.5, 'getPortfolio preserves core fields');

  const backup = {
    version: '1.0.0',
    exportedAt: '2026-01-01T00:00:00.000Z',
    portfolio: before
  };
  h.importAll(JSON.stringify(backup));
  const after = JSON.parse(h.store[h.KEYS.portfolio]);
  assert(after.positions.length === 1, 'import positions count');
  assert(after.positions[0].qty === 10, 'import qty');
  assert(after.positions[0].avgPrice === 250.5, 'import avgPrice');
  assert(after.positions[0].lotId === 'SBER_KEEP', 'import lotId');
  assert(after.positions[0].buyDate === '2024-01-15', 'import preserves buyDate YYYY-MM-DD');
  assert(after.sales.length === 1 && after.sales[0].saleId === 'SALE_KEEP', 'import sales');
  assert(after.sales[0].allocations && after.sales[0].allocations[0].qty === 2, 'import allocations');
  assert(after.sales[0].allocations[0].buyDate === '2024-01-15', 'import allocation buyDate');
  assert(after.schemaVersion === 1, 'import adds schemaVersion');
  assert(Array.isArray(after.cashFlows), 'import adds cashFlows array');
}

{
  const marker = { positions: [{ ticker: 'T', qty: 1, avgPrice: 1, lotId: 'KEEP_ME' }] };
  h.store[h.KEYS.portfolio] = JSON.stringify(marker);
  h.importAll('{not-json');
  const still = JSON.parse(h.store[h.KEYS.portfolio]);
  assert(still.positions[0].lotId === 'KEEP_ME', 'bad JSON import must not wipe portfolio');

  h.importAll(JSON.stringify({ version: '9.9.9', portfolio: { positions: [] } }));
  const still2 = JSON.parse(h.store[h.KEYS.portfolio]);
  assert(still2.positions[0].lotId === 'KEEP_ME', 'bad version import must not wipe portfolio');

  h.importAll(JSON.stringify({ version: '1.0.0', portfolio: [] }));
  const still3 = JSON.parse(h.store[h.KEYS.portfolio]);
  assert(still3.positions[0].lotId === 'KEEP_ME', 'invalid portfolio shape must not wipe');
}

{
  h.setPortfolio({
    positions: [
      { ticker: 'SBER', qty: 3, avgPrice: 100, lotId: 'A' },
      { ticker: 'SBER', qty: 0, avgPrice: 100, lotId: 'B' }
    ],
    sales: [],
    cashFlows: [{ type: 'deposit', amount: 10, date: '2025-01-01' }]
  });
  const saved = JSON.parse(h.store[h.KEYS.portfolio]);
  assert(saved.positions.length === 1 && saved.positions[0].lotId === 'A', 'setPortfolio drops zero qty');
  assert(saved.cashFlows.length === 1, 'setPortfolio keeps cashFlows');
  assert(saved.schemaVersion === 1, 'setPortfolio writes schemaVersion');
}

function loadPortfolioCalcHelpers() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
  const memStore = Object.create(null);
  function normalizePortfolioDate(value) {
    if (value == null) return '';
    const s = String(value).trim();
    if (!s || /^invalid\b/i.test(s)) return '';
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      const y = Number(ymd[1]);
      const mo = Number(ymd[2]);
      const d = Number(ymd[3]);
      if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
      return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    return '';
  }
  function isIndexQuoteTicker(ticker) {
    ticker = String(ticker || '').trim().toUpperCase();
    return ticker === 'IMOEX' || ticker === 'INDEX';
  }
  function isRuBondTicker(ticker) {
    ticker = String(ticker || '').trim().toUpperCase();
    return ticker.indexOf('OFZ') >= 0 || (ticker.indexOf('SU') === 0 && ticker.length > 8);
  }
  function isUsTicker(ticker) {
    ticker = String(ticker || '').trim().toUpperCase();
    return ticker === 'AAPL' || ticker === 'MSFT';
  }
  function isRuStockForAnalytics(ticker) {
    ticker = String(ticker || '').trim().toUpperCase();
    if (!ticker || isIndexQuoteTicker(ticker)) return false;
    if (isUsTicker(ticker)) return false;
    return !isRuBondTicker(ticker);
  }
  const sandbox = {
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    isFinite,
    parseInt,
    parseFloat,
    normalizeTicker: (t) => String(t || '').trim().toUpperCase(),
    normalizePortfolioDate,
    safeFormatPortfolioDate: (value) => normalizePortfolioDate(value) || '—',
    isIndexQuoteTicker,
    isRuBondTicker,
    isRuStockForAnalytics,
    Markets: {
      isUsPosition: (pos) => !!(pos && (pos.market === 'US' || isUsTicker(pos.ticker))),
      isUsTicker,
      formatMoneyValue: (v) => (v == null ? '—' : String(v)),
      marketBadgeLabel: (market) => (market === 'US' ? 'US' : 'РФ'),
      getMarketsEnabled: () => ({ ru: true, us: true })
    },
    document: { getElementById: () => null },
    escapeHtml: (s) => String(s == null ? '' : s),
    showToast: () => {},
    getPortfolio: () => ({ positions: [], sales: [], cashFlows: [], schemaVersion: 1 }),
    setPortfolio: () => {},
    state: {},
    Promise,
    setTimeout: () => {},
    clearTimeout: () => {},
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null),
      setItem: (k, v) => { memStore[k] = String(v); },
      removeItem: (k) => { delete memStore[k]; },
      clear: () => { Object.keys(memStore).forEach((k) => { delete memStore[k]; }); }
    },
    __memStore: memStore
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const splitCode = fs.readFileSync(path.join(__dirname, '..', 'split-events.js'), 'utf8');
  vm.runInNewContext(splitCode, sandbox, { timeout: 5000 });
  vm.runInNewContext(
    code +
      '\nthis.__bondRub = bondRubFromPct;' +
      '\nthis.__resolveFace = resolveBondFaceValue;' +
      '\nthis.__cost = getPositionCostRub;' +
      '\nthis.__mv = getPositionMarketValue;' +
      '\nthis.__salePnl = getSaleRealizedPnl;' +
      '\nthis.__pricePlus = computePricePlusPayoutsPct;' +
      '\nthis.__remain = getRemainingCostBasis;' +
      '\nthis.__totalRealized = getTotalRealizedPnl;' +
      '\nthis.__today = localPortfolioTodayYmd;' +
      '\nthis.__prefill = computePortfolioNewLotPrefill;' +
      '\nthis.__ofzWarn = shouldWarnOfzAvgLooksLikeRubles;' +
      '\nthis.__isFormBond = isPortfolioFormBondTicker;' +
      '\nthis.__summarize = summarizeTickerHistory;' +
      '\nthis.__allocPnl = getSaleAllocationPnlRub;' +
      '\nthis.__listClosed = listClosedPortfolioPositions;' +
      '\nthis.__getUi = getPortfolioUiSettings;' +
      '\nthis.__setUi = setPortfolioUiSettings;' +
      '\nthis.__hideClosed = hideClosedPortfolioTicker;' +
      '\nthis.__restoreClosed = restoreClosedPortfolioTicker;' +
      '\nthis.__collectRecent = collectRecentPortfolioOperations;' +
      '\nthis.__resolveNav = resolvePortfolioHistoryNavTarget;' +
      '\nthis.__timeline = buildTickerOperationTimeline;' +
      '\nthis.__asOf = buildPortfolioCompositionAtDate;' +
      '\nthis.__asOfValue = buildPortfolioValueAtDate;' +
      '\nthis.__asOfChange = buildPortfolioValueChangeBetweenDates;' +
      '\nthis.__asOfChangeExplain = buildPortfolioValueChangeExplanation;' +
      '\nthis.__payouts = buildPortfolioPayoutsForHoldingPeriod;' +
      '\nthis.__tickerPayouts = buildTickerPayoutsForHoldingPeriod;' +
      '\nthis.__tickerReturn = buildTickerReturnWithPayouts;' +
      '\nthis.__portfolioReturn = buildPortfolioReturnWithPayouts;' +
      '\nthis.__loadPayoutFeeds = loadPayoutFeedsForPortfolio;' +
      '\nthis.__upcomingPayouts = buildUpcomingPortfolioPayouts;' +
      '\nthis.__splitWarn = portfolioTickerNeedsSplitWarning;' +
      '\nthis.__splitWarnHtml = buildPortfolioSplitWarningHtml;' +
      '\nthis.__splitWarnMany = buildPortfolioSplitWarningsForTickersHtml;' +
      '\nthis.__splitWarnText = formatSingleSplitWarningText;' +
      '\nthis.__splitAffected = isPortfolioTickerSplitAffected;' +
      '\nthis.__lotScale = diagnoseLotShareScale;' +
      '\nthis.__qtyHeld = getSplitAwareQtyHeldOnDate;' +
      '\nthis.__currentQty = getSplitAwareCurrentQty;' +
      '\nthis.__splitMetrics = getSplitAwareCurrentPositionMetrics;' +
      '\nthis.__splitPnlHtml = buildSplitAffectedPnlHtml;' +
      '\nthis.__lotRow = buildPortfolioLotRow;' +
      '\nthis.__sectionRows = buildPortfolioSectionRows;' +
      '\nthis.__mobileCard = buildPortfolioMobileCardHtml;' +
      '\nthis.__lotRet = getLotReturnPct;' +
      '\nthis.__partialWarnText = formatPayoutPartialWarningText;' +
      '\nthis.__partialTickers = collectPayoutPartialTickersFromWarnings;' +
      '\nthis.__twpBlock = buildTickerReturnWithPayoutsBlockHtml;' +
      '\nthis.__ensureFeeds = ensurePortfolioPayoutFeedsLoaded;' +
      '\nthis.__feedsCache = getPfPayoutFeedsCache;' +
      '\nthis.__twpDetail = buildPortfolioTickerDetailHtml;',
    sandbox,
    { timeout: 10000 }
  );
  return {
    bondRubFromPct: sandbox.__bondRub,
    resolveBondFaceValue: sandbox.__resolveFace,
    getPositionCostRub: sandbox.__cost,
    getPositionMarketValue: sandbox.__mv,
    getSaleRealizedPnl: sandbox.__salePnl,
    computePricePlusPayoutsPct: sandbox.__pricePlus,
    getRemainingCostBasis: sandbox.__remain,
    getTotalRealizedPnl: sandbox.__totalRealized,
    localPortfolioTodayYmd: sandbox.__today,
    computePortfolioNewLotPrefill: sandbox.__prefill,
    shouldWarnOfzAvgLooksLikeRubles: sandbox.__ofzWarn,
    isPortfolioFormBondTicker: sandbox.__isFormBond,
    summarizeTickerHistory: sandbox.__summarize,
    getSaleAllocationPnlRub: sandbox.__allocPnl,
    listClosedPortfolioPositions: sandbox.__listClosed,
    getPortfolioUiSettings: sandbox.__getUi,
    setPortfolioUiSettings: sandbox.__setUi,
    hideClosedPortfolioTicker: sandbox.__hideClosed,
    restoreClosedPortfolioTicker: sandbox.__restoreClosed,
    collectRecentPortfolioOperations: sandbox.__collectRecent,
    resolvePortfolioHistoryNavTarget: sandbox.__resolveNav,
    buildTickerOperationTimeline: sandbox.__timeline,
    buildPortfolioCompositionAtDate: sandbox.__asOf,
    buildPortfolioValueAtDate: sandbox.__asOfValue,
    buildPortfolioValueChangeBetweenDates: sandbox.__asOfChange,
    buildPortfolioValueChangeExplanation: sandbox.__asOfChangeExplain,
    buildPortfolioPayoutsForHoldingPeriod: sandbox.__payouts,
    buildTickerPayoutsForHoldingPeriod: sandbox.__tickerPayouts,
    buildTickerReturnWithPayouts: sandbox.__tickerReturn,
    buildPortfolioReturnWithPayouts: sandbox.__portfolioReturn,
    loadPayoutFeedsForPortfolio: sandbox.__loadPayoutFeeds,
    buildUpcomingPortfolioPayouts: sandbox.__upcomingPayouts,
    portfolioTickerNeedsSplitWarning: sandbox.__splitWarn,
    buildPortfolioSplitWarningHtml: sandbox.__splitWarnHtml,
    buildPortfolioSplitWarningsForTickersHtml: sandbox.__splitWarnMany,
    formatSingleSplitWarningText: sandbox.__splitWarnText,
    isPortfolioTickerSplitAffected: sandbox.__splitAffected,
    diagnoseLotShareScale: sandbox.__lotScale,
    getSplitAwareQtyHeldOnDate: sandbox.__qtyHeld,
    getSplitAwareCurrentQty: sandbox.__currentQty,
    getSplitAwareCurrentPositionMetrics: sandbox.__splitMetrics,
    buildSplitAffectedPnlHtml: sandbox.__splitPnlHtml,
    buildPortfolioLotRow: sandbox.__lotRow,
    buildPortfolioSectionRows: sandbox.__sectionRows,
    buildPortfolioMobileCardHtml: sandbox.__mobileCard,
    getLotReturnPct: sandbox.__lotRet,
    formatPayoutPartialWarningText: sandbox.__partialWarnText,
    collectPayoutPartialTickersFromWarnings: sandbox.__partialTickers,
    buildTickerReturnWithPayoutsBlockHtml: sandbox.__twpBlock,
    ensurePortfolioPayoutFeedsLoaded: sandbox.__ensureFeeds,
    getPfPayoutFeedsCache: sandbox.__feedsCache,
    buildPortfolioTickerDetailHtml: sandbox.__twpDetail,
    setSplitEventsCatalog: sandbox.setSplitEventsCatalog,
    getSplitEventsSync: sandbox.getSplitEventsSync,
    localStorage: sandbox.localStorage,
    memStore: memStore,
    sandbox: sandbox
  };
}

const calc = loadPortfolioCalcHelpers();

{
  // Цена + выплаты
  assert(
    Math.abs(calc.computePricePlusPayoutsPct(1000, 500, 10000) - 15) < 1e-9,
    'price+payouts: (1000+500)/10000 = 15%'
  );
  assert(calc.computePricePlusPayoutsPct(500, 0, 10000) === 5, 'paid missing/0 → treat as 0');
  assert(calc.computePricePlusPayoutsPct(500, null, 10000) === 5, 'paid null → 0');
  assert(calc.computePricePlusPayoutsPct(-2000, 300, 10000) === -17, 'negative unrealized');
  assert(calc.computePricePlusPayoutsPct(100, 0, 0) == null, 'remainCost 0 → null');
  assert(calc.computePricePlusPayoutsPct(100, 0, -1) == null, 'remainCost negative → null');
  assert(calc.computePricePlusPayoutsPct(null, 100, 10000) == null, 'unrealized null → null');
}

{
  // ОФЗ: cost / MV / unrealized in ₽; avgPrice stays %
  const lot = {
    ticker: 'OFZ26241',
    qty: 10,
    avgPrice: 95,
    currentPrice: 98,
    lotId: 'OFZ_T1'
  };
  const meta = { faceValue: 1000 };
  assert(calc.bondRubFromPct(95, 10, 1000) === 9500, 'bondRubFromPct cost 9500');
  assert(calc.getPositionCostRub(lot, meta) === 9500, 'OFZ cost 9500₽');
  assert(calc.getPositionMarketValue(lot, meta) === 9800, 'OFZ MV 9800₽');
  assert(
    calc.getPositionMarketValue(lot, meta) - calc.getPositionCostRub(lot, meta) === 300,
    'OFZ unrealized 300₽'
  );
  assert(calc.resolveBondFaceValue(lot, meta) === 1000, 'face from meta');
  assert(calc.resolveBondFaceValue({ faceValue: 1500 }, meta) === 1500, 'face from pos wins');
  assert(calc.resolveBondFaceValue({}, null) === 1000, 'face default 1000');

  const sale = {
    ticker: 'OFZ26241',
    qty: 5,
    buyPrice: 95,
    salePrice: 98
  };
  const salePnl = calc.getSaleRealizedPnl(sale, meta);
  assert(salePnl.amount === 150, 'OFZ realized (98-95)/100*1000*5 = 150₽');
  assert(Math.abs(salePnl.pct - (150 / 4750) * 100) < 1e-9, 'OFZ realized pct vs rub cost');

  const stockSale = {
    ticker: 'SBER',
    qty: 10,
    buyPrice: 250,
    salePrice: 280
  };
  const stockPnl = calc.getSaleRealizedPnl(stockSale, null);
  assert(stockPnl.amount === 300, 'stock sale P&L unchanged: (280-250)*10 = 300');

  const stockLot = { ticker: 'SBER', qty: 10, avgPrice: 250, currentPrice: 280 };
  assert(calc.getPositionCostRub(stockLot, null) === 2500, 'stock cost unchanged');
  assert(calc.getPositionMarketValue(stockLot, null) === 2800, 'stock MV unchanged');
}

{
  // avgPrice ОФЗ после getPortfolio остаётся 95, не 950
  const pf = h.normalizePortfolio({
    positions: [{ ticker: 'OFZ26241', qty: 10, avgPrice: 95, currentPrice: 98, lotId: 'OFZ_KEEP' }]
  });
  assert(pf.positions[0].avgPrice === 95, 'normalize keeps OFZ avgPrice=95');
  h.setPortfolio(pf);
  const again = h.getPortfolio();
  assert(again.positions[0].avgPrice === 95, 'getPortfolio keeps OFZ avgPrice=95 (not 950)');
  assert(calc.getPositionCostRub(again.positions[0], { faceValue: 1000 }) === 9500, 'rub cost on the fly only');
}

{
  // Даты портфеля: normalize + display + import heal
  assert(h.normalizePortfolioDate('') === '', 'empty string → ""');
  assert(h.normalizePortfolioDate(null) === '', 'null → ""');
  assert(h.normalizePortfolioDate(undefined) === '', 'undefined → ""');
  assert(h.normalizePortfolioDate('Invalid Date') === '', '"Invalid Date" → ""');
  assert(h.normalizePortfolioDate('Invalid D') === '', 'truncated Invalid → ""');
  assert(h.normalizePortfolioDate('2026-07-02') === '2026-07-02', 'valid YYYY-MM-DD kept');
  assert(h.normalizePortfolioDate('2026-02-30') === '', 'impossible calendar date → ""');
  assert(h.normalizePortfolioDate('2026-08-32') === '', '32 Aug → ""');
  assert(h.normalizePortfolioDate('32.08.2026') === '', '32.08.2026 DMY → ""');
  assert(h.normalizePortfolioDate('20012-07-1') === '', '20012-07-1 → ""');
  assert(h.normalizePortfolioDate('2026-7-1') === '2026-07-01', 'pad leading zeros → YYYY-MM-DD');
  assert(h.normalizePortfolioDate('август') === '', 'garbage text → ""');
  assert(h.normalizePortfolioDate('1800-01-01') === '', 'year before 1900 → ""');
  assert(h.safeFormatPortfolioDate('Invalid Date') === '—', 'safe format Invalid → —');
  assert(h.safeFormatPortfolioDate('') === '—', 'safe format empty → —');
  assert(h.safeFormatPortfolioDate(null) === '—', 'safe format null → —');
  const okLbl = h.safeFormatPortfolioDate('2026-07-02');
  assert(okLbl && okLbl !== '—' && !/invalid/i.test(okLbl), 'safe format valid date shows label');

  const broken = h.normalizePortfolio({
    positions: [
      { ticker: 'SBERP', qty: 1, avgPrice: 180, buyDate: '', lotId: 'D1' },
      { ticker: 'SBER', qty: 1, avgPrice: 250, buyDate: null, lotId: 'D2' },
      { ticker: 'GAZP', qty: 1, avgPrice: 160, buyDate: 'Invalid Date', lotId: 'D3' },
      { ticker: 'LKOH', qty: 1, avgPrice: 7000, buyDate: '2026-07-02', lotId: 'D4' }
    ],
    sales: [{
      saleId: 'S1',
      ticker: 'SBER',
      qty: 1,
      buyPrice: 240,
      salePrice: 250,
      saleDate: 'Invalid Date',
      buyDate: 'not-a-date',
      allocations: [{ lotId: 'D2', qty: 1, buyPrice: 240, buyDate: 'Invalid Date' }]
    }]
  });
  assert(broken.positions.length === 4, 'broken dates do not drop positions');
  assert(broken.positions[0].buyDate === '', 'pos buyDate "" stays ""');
  assert(broken.positions[1].buyDate === '', 'pos buyDate null → ""');
  assert(broken.positions[2].buyDate === '', 'pos buyDate Invalid Date → ""');
  assert(broken.positions[2].avgPrice === 160 && broken.positions[2].qty === 1, 'other fields preserved');
  assert(broken.positions[3].buyDate === '2026-07-02', 'valid buyDate kept');
  assert(broken.sales[0].saleDate === '', 'saleDate Invalid → ""');
  assert(broken.sales[0].buyDate === '', 'sale buyDate garbage → ""');
  assert(broken.sales[0].allocations[0].buyDate === '', 'allocation buyDate Invalid → ""');
  assert(broken.sales[0].qty === 1 && broken.sales[0].salePrice === 250, 'sale qty/price preserved');

  h.setPortfolio({
    positions: [{ ticker: 'SBERP', qty: 1, avgPrice: 180, buyDate: 'Invalid Date', lotId: 'HEAL1' }],
    sales: [],
    cashFlows: []
  });
  const healed = h.getPortfolio();
  assert(healed.positions[0].buyDate === '', 'getPortfolio heals Invalid Date to ""');
  assert(healed.positions[0].lotId === 'HEAL1' && healed.positions[0].avgPrice === 180, 'heal keeps lotId/avgPrice');
  const stored = JSON.parse(h.store[h.KEYS.portfolio]);
  assert(stored.positions[0].buyDate === '', 'persisted buyDate is empty, not Invalid Date');
}

{
  // Round-trip: setPortfolio → export payload (как exportAll: getPortfolio) → clear → importAll
  // Акция SBERP и ОФЗ с валидной YYYY-MM-DD не должны терять дату.
  h.setPortfolio({
    positions: [
      { ticker: 'SBERP', qty: 1, avgPrice: 180, buyDate: '2026-07-02', lotId: 'SBERP_RT', comment: 'pref' },
      { ticker: 'OFZ26234', qty: 233, avgPrice: 95.5, buyDate: '2026-07-01', lotId: 'OFZ_RT' }
    ],
    sales: [],
    cashFlows: []
  });
  const beforeExport = h.getPortfolio();
  const sberpBefore = beforeExport.positions.find((p) => p.ticker === 'SBERP');
  const ofzBefore = beforeExport.positions.find((p) => p.ticker === 'OFZ26234');
  assert(sberpBefore && sberpBefore.buyDate === '2026-07-02', 'before export SBERP buyDate in storage/getPortfolio');
  assert(ofzBefore && ofzBefore.buyDate === '2026-07-01', 'before export OFZ buyDate in storage/getPortfolio');

  const exportPayload = {
    version: '1.0.0',
    exportedAt: '2026-08-24T00:00:00.000Z',
    portfolio: beforeExport
  };
  const sberpInFile = exportPayload.portfolio.positions.find((p) => p.ticker === 'SBERP');
  const ofzInFile = exportPayload.portfolio.positions.find((p) => p.ticker === 'OFZ26234');
  assert(sberpInFile.buyDate === '2026-07-02', 'export JSON contains SBERP buyDate');
  assert(ofzInFile.buyDate === '2026-07-01', 'export JSON contains OFZ buyDate');

  h.setPortfolio({ positions: [], sales: [], cashFlows: [] });
  assert(h.getPortfolio().positions.length === 0, 'portfolio cleared before import');

  h.importAll(JSON.stringify(exportPayload));
  const after = h.getPortfolio();
  const sberpAfter = after.positions.find((p) => p.ticker === 'SBERP');
  const ofzAfter = after.positions.find((p) => p.ticker === 'OFZ26234');
  assert(sberpAfter && sberpAfter.buyDate === '2026-07-02', 'after import SBERP buyDate stays 2026-07-02');
  assert(ofzAfter && ofzAfter.buyDate === '2026-07-01', 'after import OFZ buyDate stays 2026-07-01');
  assert(sberpAfter.avgPrice === 180 && sberpAfter.lotId === 'SBERP_RT', 'SBERP other fields intact after RT');
  assert(ofzAfter.avgPrice === 95.5 && ofzAfter.lotId === 'OFZ_RT', 'OFZ other fields intact after RT');

  // Уже битая дата в backup → после import пустая (не "Invalid Date"); валидные соседи не страдают
  h.importAll(JSON.stringify({
    version: '1.0.0',
    portfolio: {
      positions: [
        { ticker: 'SBERP', qty: 1, avgPrice: 180, buyDate: 'Invalid Date', lotId: 'SBERP_BAD' },
        { ticker: 'OFZ26234', qty: 5, avgPrice: 90, buyDate: '2026-07-02', lotId: 'OFZ_OK' }
      ],
      sales: []
    }
  }));
  const mixed = h.getPortfolio();
  const bad = mixed.positions.find((p) => p.ticker === 'SBERP');
  const ok = mixed.positions.find((p) => p.ticker === 'OFZ26234');
  assert(bad && bad.buyDate === '', 'Invalid Date in backup → empty after import (not a stock-only bug)');
  assert(ok && ok.buyDate === '2026-07-02', 'valid OFZ date survives same import as broken stock date');
  assert(h.safeFormatPortfolioDate(bad.buyDate) === '—', 'UI shows — for empty SBERP buyDate');
}

{
  // Форма add/edit: в storage только YYYY-MM-DD или ""
  function saveViaNormalize(rawBuyDate, editing) {
    var coerced = h.normalizePortfolioDate(rawBuyDate);
    if (editing) {
      h.setPortfolio({
        positions: [{ ticker: 'SBERP', qty: 1, avgPrice: 180, buyDate: '2024-01-15', lotId: 'EDIT1' }],
        sales: [],
        cashFlows: []
      });
      var pf = h.getPortfolio();
      pf.positions[0].buyDate = coerced;
      h.setPortfolio(pf);
      return h.getPortfolio().positions[0].buyDate;
    }
    h.setPortfolio({
      positions: [{
        ticker: 'SBERP',
        qty: 1,
        avgPrice: 180,
        buyDate: coerced,
        lotId: 'ADD1'
      }],
      sales: [],
      cashFlows: []
    });
    return h.getPortfolio().positions[0].buyDate;
  }

  assert(saveViaNormalize('', false) === '', 'form empty date → ""');
  assert(saveViaNormalize('2026-08-32', false) === '', 'form 32 Aug → ""');
  assert(saveViaNormalize('2026-7-1', false) === '2026-07-01', 'form without leading zero → padded');
  assert(saveViaNormalize('20012-07-1', false) === '', 'form weird 20012-07-1 → ""');
  assert(saveViaNormalize('Invalid Date', false) === '', 'form Invalid Date → ""');
  assert(saveViaNormalize('не дата', false) === '', 'form garbage → ""');
  assert(saveViaNormalize('2026-07-02', false) === '2026-07-02', 'form valid kept');

  assert(saveViaNormalize('', true) === '', 'edit empty → ""');
  assert(saveViaNormalize('20012-07-1', true) === '', 'edit weird → ""');
  assert(saveViaNormalize('2026-07-02', true) === '2026-07-02', 'edit valid kept');

  const storedAdd = JSON.parse(h.store[h.KEYS.portfolio]);
  assert(storedAdd.positions[0].buyDate === '2026-07-02', 'persisted edit valid');
  assert(storedAdd.positions[0].buyDate !== '20012-07-1', 'never persist 20012-07-1');
  assert(storedAdd.positions[0].buyDate !== 'Invalid Date', 'never persist Invalid Date');
}

{
  // Автоподстановка новой позиции (не edit)
  const today = calc.localPortfolioTodayYmd();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(today), 'local today is YYYY-MM-DD');
  assert(today === h.normalizePortfolioDate(today), 'today normalizes to itself');
  // не UTC-сдвиг: совпадает с локальными getFullYear/Month/Date
  const d = new Date();
  const localExpect =
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0');
  assert(today === localExpect, 'today uses local TZ not toISOString');

  const stock = calc.computePortfolioNewLotPrefill({
    editing: false,
    dateValue: '',
    avgValue: '',
    quotePrice: 267.82
  });
  assert(stock.skipped === false, 'new stock not skipped');
  assert(stock.buyDate === today, 'new stock gets today');
  assert(stock.avgPrice === 267.82, 'new stock avg = quote ₽');

  const ofz = calc.computePortfolioNewLotPrefill({
    editing: false,
    dateValue: '',
    avgValue: '',
    quotePrice: 95.5
  });
  assert(ofz.avgPrice === 95.5, 'new OFZ avg = % quote, not × face');
  assert(ofz.avgPrice !== 95.5 * 1000, 'OFZ not multiplied by faceValue');

  const noQuote = calc.computePortfolioNewLotPrefill({
    editing: false,
    dateValue: '',
    avgValue: '',
    quotePrice: null
  });
  assert(noQuote.buyDate === today, 'no quote still fills date');
  assert(noQuote.avgPrice == null, 'no quote → do not set avg');

  const manual = calc.computePortfolioNewLotPrefill({
    editing: false,
    dateValue: '2024-01-15',
    avgValue: '180',
    quotePrice: 267.82
  });
  assert(manual.buyDate == null, 'do not overwrite manual date');
  assert(manual.avgPrice == null, 'do not overwrite manual avg');

  const edit = calc.computePortfolioNewLotPrefill({
    editing: true,
    dateValue: '',
    avgValue: '',
    quotePrice: 999
  });
  assert(edit.skipped === true, 'edit mode skipped');
  assert(edit.buyDate == null && edit.avgPrice == null, 'edit does not prefill date/price');

  // сохранение даты новой позиции — YYYY-MM-DD в storage
  h.setPortfolio({
    positions: [{
      ticker: 'SBER',
      qty: 1,
      avgPrice: stock.avgPrice,
      buyDate: stock.buyDate,
      lotId: 'PREFILL1'
    }],
    sales: [],
    cashFlows: []
  });
  const savedPrefill = h.getPortfolio().positions[0];
  assert(savedPrefill.buyDate === today, 'saved buyDate is YYYY-MM-DD');
  assert(!/^\d{2}\.\d{2}\.\d{4}$/.test(savedPrefill.buyDate), 'storage is not DD.MM.YYYY');
}

{
  // ОФЗ: предупреждение «похоже на рубли» при avg > 200
  assert(calc.shouldWarnOfzAvgLooksLikeRubles(false, 1112) === false, 'SBER/stock: no warn');
  assert(calc.shouldWarnOfzAvgLooksLikeRubles(true, 81.33) === false, 'OFZ 81.33: no warn');
  assert(calc.shouldWarnOfzAvgLooksLikeRubles(true, 200) === false, 'OFZ 200: no warn');
  assert(calc.shouldWarnOfzAvgLooksLikeRubles(true, 200.01) === true, 'OFZ >200: warn');
  assert(calc.shouldWarnOfzAvgLooksLikeRubles(true, 1112) === true, 'OFZ 1112: warn');
  assert(calc.shouldWarnOfzAvgLooksLikeRubles(true, '') === false, 'OFZ empty: no warn');
  assert(calc.shouldWarnOfzAvgLooksLikeRubles(true, null) === false, 'OFZ null: no warn');
}

{
  // Подсказка ОФЗ в форме — только для облигаций
  assert(calc.isPortfolioFormBondTicker('GAZP') === false, 'GAZP ticker → not bond');
  assert(calc.isPortfolioFormBondTicker('SBER', { kind: 'stock' }) === false, 'SBER stock item → not bond');
  assert(calc.isPortfolioFormBondTicker('PLZL', { type: 'stock' }) === false, 'PLZL type stock → not bond');
  assert(calc.isPortfolioFormBondTicker('OFZ_26247') === true, 'OFZ ticker → bond');
  assert(calc.isPortfolioFormBondTicker('OFZ_26247', { kind: 'bond' }) === true, 'OFZ bond item → bond');
  assert(calc.isPortfolioFormBondTicker('SU26247RMFS0', { kind: 'fixed' }) === true, 'OFZ fixed kind → bond');
  assert(calc.isPortfolioFormBondTicker('', { kind: 'stock' }) === false, 'empty+stock → not bond');
  assert(calc.isPortfolioFormBondTicker('') === false, 'empty ticker → not bond');
  assert(
    calc.shouldWarnOfzAvgLooksLikeRubles(calc.isPortfolioFormBondTicker('GAZP'), 250) === false,
    'stock price >200 → no OFZ warn'
  );
  assert(
    calc.shouldWarnOfzAvgLooksLikeRubles(calc.isPortfolioFormBondTicker('OFZ_26247'), 1112) === true,
    'OFZ price >200 → warn'
  );
}

{
  // Волна 2.1: summarizeTickerHistory — акция, два открытых лота
  const positions = [
    { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, currentPrice: 300 },
    { ticker: 'SBER', lotId: 'S2', qty: 5, avgPrice: 280, currentPrice: 300 },
    { ticker: 'GAZP', lotId: 'G1', qty: 100, avgPrice: 160, currentPrice: 170 }
  ];
  const frozenPosLen = positions.length;
  const hist = calc.summarizeTickerHistory('SBER', positions, []);
  assert(hist.ticker === 'SBER', 'stock hist ticker');
  assert(hist.lotCount === 2 && hist.openLots.length === 2, 'two open lots');
  assert(hist.openQty === 15, 'openQty 10+5');
  assert(Math.abs(hist.openCostRub - 3900) < 1e-9, 'openCostRub 10*250+5*280');
  assert(Math.abs(hist.openMarketValueRub - 4500) < 1e-9, 'openMV 15*300');
  assert(Math.abs(hist.unrealizedPnlRub - 600) < 1e-9, 'unrealized 4500-3900');
  assert(hist.saleCount === 0 && hist.totalSoldQty === 0, 'no sales');
  assert(hist.totalBoughtQty === 15, 'bought = open when no sales');
  assert(positions.length === frozenPosLen, 'positions not mutated (length)');
}

{
  // Волна 2.1: акция с продажей
  const positions = [
    { ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, currentPrice: 300 }
  ];
  const sales = [
    {
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 10,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2025-06-01'
    }
  ];
  const expectedRealized = calc.getSaleRealizedPnl(sales[0]).amount;
  const hist = calc.summarizeTickerHistory('sber', positions, sales);
  assert(hist.totalSoldQty === 10, 'totalSoldQty');
  assert(Math.abs(hist.realizedPnlRub - expectedRealized) < 1e-9, 'realized via getSaleRealizedPnl');
  assert(Math.abs(hist.realizedPnlRub - 300) < 1e-9, 'realized (280-250)*10');
  assert(hist.openQty === 5, 'openQty after partial');
  assert(hist.totalBoughtQty === 15, 'bought = open + sold');
  assert(hist.saleCount === 1, 'saleCount 1');
}

{
  // Волна 2.1: ОФЗ — % → ₽ (не 95₽ вместо 950₽)
  const positions = [
    { ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, currentPrice: 98, faceValue: 1000 }
  ];
  const sales = [
    {
      saleId: 'OS1',
      ticker: 'OFZ_26238',
      qty: 5,
      buyPrice: 95,
      salePrice: 98,
      saleDate: '2025-07-01',
      faceValue: 1000
    }
  ];
  const bondMeta = { faceValue: 1000 };
  const hist = calc.summarizeTickerHistory('OFZ_26238', positions, sales, bondMeta);
  assert(Math.abs(hist.openCostRub - 9500) < 1e-6, 'OFZ cost 10*95%*1000 = 9500₽');
  assert(Math.abs(hist.openMarketValueRub - 9800) < 1e-6, 'OFZ MV 10*98%*1000 = 9800₽');
  assert(Math.abs(hist.unrealizedPnlRub - 300) < 1e-6, 'OFZ unrealized 300₽');
  assert(Math.abs(hist.realizedPnlRub - 150) < 1e-6, 'OFZ realized 5*(98-95)%*1000 = 150₽');
  assert(hist.openCostRub !== 95 && hist.openCostRub !== 950, 'OFZ cost is not raw percent');
}

{
  // Волна 2.1: sale с allocations[]
  const positions = [
    { ticker: 'LKOH', lotId: 'L1', qty: 2, avgPrice: 7000, currentPrice: 7100 }
  ];
  const sales = [
    {
      saleId: 'LS1',
      ticker: 'LKOH',
      qty: 3,
      buyPrice: 6900,
      salePrice: 7200,
      saleDate: '2025-08-01',
      allocations: [
        { lotId: 'L0', qty: 1, buyPrice: 6800, buyDate: '2024-01-01' },
        { lotId: 'L1', qty: 2, buyPrice: 6950, buyDate: '2024-06-01' }
      ]
    }
  ];
  const salesCopy = JSON.parse(JSON.stringify(sales));
  const hist = calc.summarizeTickerHistory('LKOH', positions, sales);
  assert(hist.saleCount === 1, 'alloc saleCount');
  assert(hist.sales[0].allocations && hist.sales[0].allocations.length === 2, 'allocations preserved');
  assert(hist.sales[0].allocations[0].lotId === 'L0', 'alloc lotId kept');
  assert(JSON.stringify(sales) === JSON.stringify(salesCopy), 'sales array not mutated');
  const viaHelper = calc.getSaleRealizedPnl(sales[0]).amount;
  assert(Math.abs(hist.realizedPnlRub - viaHelper) < 1e-9, 'realized matches getSaleRealizedPnl(allocations)');
}

{
  // Волна 2.1: legacy sale без allocations
  const hist = calc.summarizeTickerHistory('GAZP', [], [{
    saleId: 'LEG1',
    ticker: 'GAZP',
    qty: 20,
    buyPrice: 150,
    salePrice: 165,
    saleDate: '2025-01-10'
  }]);
  assert(hist.saleCount === 1 && hist.openQty === 0, 'legacy sale only');
  assert(Math.abs(hist.realizedPnlRub - 300) < 1e-9, 'legacy realized (165-150)*20');
  assert(hist.totalBoughtQty === 20 && hist.totalSoldQty === 20, 'legacy bought=sold');
}

{
  // Волна 2.1: тикер полностью продан
  const hist = calc.summarizeTickerHistory('PLZL', [], [{
    saleId: 'P1',
    ticker: 'PLZL',
    qty: 4,
    buyPrice: 10000,
    salePrice: 11000,
    saleDate: '2025-03-01'
  }]);
  assert(hist.openQty === 0 && hist.lotCount === 0, 'fully sold openQty/lotCount');
  assert(hist.openMarketValueRub === 0 && hist.openCostRub === 0, 'fully sold MV/cost 0');
  assert(hist.sales.length === 1, 'sales present');
  assert(Math.abs(hist.realizedPnlRub - 4000) < 1e-9, 'fully sold realized kept');
  assert(hist.unrealizedPnlRub === 0, 'fully sold unrealized 0');
}

{
  // Волна 2.2: вклад allocation в результат
  const sale = {
    ticker: 'SBER',
    qty: 3,
    buyPrice: 250,
    salePrice: 280,
    allocations: [
      { lotId: 'A', qty: 1, buyPrice: 240 },
      { lotId: 'B', qty: 2, buyPrice: 255 }
    ]
  };
  const a0 = calc.getSaleAllocationPnlRub(sale.allocations[0], sale);
  const a1 = calc.getSaleAllocationPnlRub(sale.allocations[1], sale);
  assert(Math.abs(a0 - 40) < 1e-9, 'alloc0 (280-240)*1');
  assert(Math.abs(a1 - 50) < 1e-9, 'alloc1 (280-255)*2');
  const ofzSale = {
    ticker: 'OFZ_26238',
    qty: 5,
    buyPrice: 95,
    salePrice: 98,
    faceValue: 1000,
    allocations: [{ lotId: 'O', qty: 5, buyPrice: 95 }]
  };
  const ofzAlloc = calc.getSaleAllocationPnlRub(ofzSale.allocations[0], ofzSale, { faceValue: 1000 });
  assert(Math.abs(ofzAlloc - 150) < 1e-6, 'OFZ alloc pnl 150₽ not 15₽');
}

{
  // Волна 2.5: закрытые позиции + portfolioUi
  const openPos = [{ ticker: 'SBER', qty: 10, avgPrice: 250, currentPrice: 280 }];
  const openSales = [{ ticker: 'SBER', qty: 2, buyPrice: 240, salePrice: 270, saleDate: '2024-01-10' }];
  const openClosed = calc.listClosedPortfolioPositions(openPos, openSales, {});
  assert(openClosed.length === 0, 'openQty>0 not in closed');

  const closedSales = [{
    ticker: 'GAZP',
    qty: 5,
    buyPrice: 140,
    salePrice: 160,
    saleDate: '2024-06-01',
    saleId: 's1'
  }];
  const closedList = calc.listClosedPortfolioPositions([], closedSales, {});
  assert(closedList.length === 1 && closedList[0].ticker === 'GAZP', 'openQty=0 + sales → closed');
  const hist = calc.summarizeTickerHistory('GAZP', [], closedSales);
  const viaSale = calc.getSaleRealizedPnl(closedSales[0]).amount;
  assert(Math.abs(closedList[0].hist.realizedPnlRub - hist.realizedPnlRub) < 1e-9, 'closed realized from summarize');
  assert(Math.abs(closedList[0].hist.realizedPnlRub - viaSale) < 1e-9, 'closed realized via getSaleRealizedPnl');
  assert(closedList[0].lastSaleDate === '2024-06-01', 'lastSaleDate from sales');

  const salesCopy = JSON.parse(JSON.stringify(closedSales));
  calc.localStorage.clear();
  calc.hideClosedPortfolioTicker('GAZP');
  assert(JSON.stringify(closedSales) === JSON.stringify(salesCopy), 'hide closed does not mutate sales[]');
  const ui = calc.getPortfolioUiSettings();
  assert(ui.hiddenClosedTickers.indexOf('GAZP') !== -1, 'GAZP in hiddenClosedTickers');
  const afterHide = calc.listClosedPortfolioPositions([], closedSales, {});
  assert(afterHide[0].hidden === true, 'closed item marked hidden');
  calc.restoreClosedPortfolioTicker('gazp');
  assert(calc.getPortfolioUiSettings().hiddenClosedTickers.indexOf('GAZP') === -1, 'restore removes from UI list');

  calc.localStorage.setItem('ibrf.portfolioUi.v1', '{not-json');
  const broken = calc.getPortfolioUiSettings();
  assert(Array.isArray(broken.hiddenClosedTickers) && broken.hiddenClosedTickers.length === 0, 'broken ui → empty');
  assert(calc.listClosedPortfolioPositions([], closedSales, {}).length === 1, 'broken ui does not break closed list');

  calc.localStorage.setItem('ibrf.portfolioUi.v1', JSON.stringify({ hiddenClosedTickers: 'bad' }));
  assert(calc.getPortfolioUiSettings().hiddenClosedTickers.length === 0, 'bad shape → empty hidden');
}

{
  // Волна 2.6: недавние операции
  const today = '2026-08-27';
  const positions = [
    { ticker: 'SBER', qty: 10, avgPrice: 250, buyDate: '2026-08-25', lotId: 'L1', comment: 'док' },
    { ticker: 'GAZP', qty: 5, avgPrice: 140, buyDate: '2026-01-01', lotId: 'L2' }
  ];
  const sales = [
    { ticker: 'SBER', qty: 2, buyPrice: 240, salePrice: 280, saleDate: '2026-08-26', saleId: 'S1' },
    { ticker: 'LKOH', qty: 1, buyPrice: 7000, salePrice: 7100, saleDate: '2025-12-01', saleId: 'S2' }
  ];
  const recent = calc.collectRecentPortfolioOperations(positions, sales, { todayYmd: today, days: 7 });
  assert(recent.some((o) => o.kind === 'buy' && o.ticker === 'SBER'), 'buy in 7d window');
  assert(recent.some((o) => o.kind === 'sale' && o.ticker === 'SBER'), 'sale in 7d window');
  assert(!recent.some((o) => o.ticker === 'GAZP'), 'old buy excluded from 7d');
  assert(!recent.some((o) => o.ticker === 'LKOH'), 'old sale excluded from 7d');

  const oldOnly = calc.collectRecentPortfolioOperations(
    [{ ticker: 'GAZP', qty: 5, avgPrice: 140, buyDate: '2026-01-01', lotId: 'L2' }],
    [{ ticker: 'LKOH', qty: 1, buyPrice: 7000, salePrice: 7100, saleDate: '2025-12-01', saleId: 'S2' }],
    { todayYmd: today, days: 7, fallbackLimit: 5 }
  );
  assert(oldOnly.length === 2, 'fallback last ops when 7d empty');
  assert(oldOnly[0].date >= oldOnly[1].date || !oldOnly[1].date, 'fallback sorted newest first');

  assert(calc.collectRecentPortfolioOperations([], [], { todayYmd: today }).length === 0, 'empty → []');

  const ordered = calc.collectRecentPortfolioOperations(positions, sales, { todayYmd: today, days: 7 });
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1].date || '';
    const b = ordered[i].date || '';
    if (a && b) assert(a >= b, 'sorted newest→oldest');
  }

  const saleOp = ordered.find((o) => o.kind === 'sale' && o.ticker === 'SBER');
  const viaPnl = calc.getSaleRealizedPnl(sales[0]).amount;
  assert(saleOp && Math.abs(saleOp.realizedPnlRub - viaPnl) < 1e-9, 'sale pnl via getSaleRealizedPnl');

  const ofzOps = calc.collectRecentPortfolioOperations([], [{
    ticker: 'OFZ_26238',
    qty: 5,
    buyPrice: 95,
    salePrice: 98,
    saleDate: '2026-08-20',
    faceValue: 1000,
    saleId: 'OFZ1'
  }], { todayYmd: today, bondMetaMap: { OFZ_26238: { faceValue: 1000 } } });
  assert(ofzOps.length === 1 && ofzOps[0].isBond === true, 'OFZ op flagged bond');
  assert(Math.abs(ofzOps[0].realizedPnlRub - 150) < 1e-6, 'OFZ pnl 150₽');
  assert(ofzOps[0].price === 98, 'OFZ sale price kept as %');

  const badDates = calc.collectRecentPortfolioOperations(
    [{ ticker: 'SBER', qty: 1, avgPrice: 100, buyDate: 'Invalid Date', lotId: 'B1' }],
    [{ ticker: 'GAZP', qty: 1, buyPrice: 100, salePrice: 110, saleDate: '', saleId: 'B2' }],
    { todayYmd: today, days: 7, fallbackLimit: 5 }
  );
  assert(badDates.length === 2, 'invalid dates still returned via fallback');
  assert(badDates.every((o) => o.date === ''), 'invalid/empty dates → empty iso');

  const srcCopy = JSON.parse(JSON.stringify(positions));
  calc.collectRecentPortfolioOperations(positions, sales, { todayYmd: today });
  assert(JSON.stringify(positions) === JSON.stringify(srcCopy), 'helper does not mutate positions');

  // Переход из «Недавних» → open / closed / closed-hidden
  assert(calc.resolvePortfolioHistoryNavTarget('SBER', positions, sales).kind === 'open', 'SBER open nav');
  assert(calc.resolvePortfolioHistoryNavTarget('LKOH', positions, sales).kind === 'closed', 'LKOH closed nav');
  calc.hideClosedPortfolioTicker('LKOH');
  assert(calc.resolvePortfolioHistoryNavTarget('LKOH', positions, sales).kind === 'closed-hidden', 'LKOH hidden closed nav');
  assert(
    calc.getPortfolioUiSettings().hiddenClosedTickers.indexOf('LKOH') !== -1,
    'nav resolve does not clear hiddenClosedTickers'
  );
  calc.restoreClosedPortfolioTicker('LKOH');
  assert(calc.resolvePortfolioHistoryNavTarget('XXXX', positions, sales).kind === 'none', 'unknown → none');
  assert(calc.resolvePortfolioHistoryNavTarget('', positions, sales).kind === 'none', 'empty → none');
}

{
  // Волна 3.1: одна покупка акции без продаж
  const positions = [
    { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }
  ];
  const frozen = JSON.parse(JSON.stringify(positions));
  const ops = calc.buildTickerOperationTimeline('SBER', positions, []);
  assert(ops.length === 1 && ops[0].type === 'buy', 'single buy operation');
  assert(ops[0].qty === 10 && ops[0].price === 250, 'qty/price from open lot');
  assert(Math.abs(ops[0].amountRub - 2500) < 1e-9, 'stock amount qty×price');
  assert(ops[0].remainingQtyAfter === 10, 'remaining after single buy = qty');
  assert(ops[0].realizedPnlRub == null, 'buy has no realized pnl');
  assert(JSON.stringify(positions) === JSON.stringify(frozen), 'timeline does not mutate positions');
}

{
  // Волна 3.1: две покупки — хронология и нарастающий остаток
  const ops = calc.buildTickerOperationTimeline('SBER', [
    { ticker: 'SBER', lotId: 'S2', qty: 5, avgPrice: 280, buyDate: '2024-06-01' },
    { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }
  ], []);
  assert(ops.length === 2 && ops[0].type === 'buy' && ops[1].type === 'buy', 'two buy ops');
  assert(ops[0].lotId === 'S1' && ops[1].lotId === 'S2', 'older buy first');
  assert(ops[0].remainingQtyAfter === 10, 'remaining after first buy');
  assert(ops[1].remainingQtyAfter === 15, 'remaining grows after second buy');
}

{
  // Волна 3.1: покупка + частичная продажа, лот не двоится
  const positions = [
    { ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, buyDate: '2024-01-15' }
  ];
  const sales = [{
    saleId: 'SALE1',
    ticker: 'SBER',
    qty: 10,
    buyPrice: 250,
    salePrice: 280,
    saleDate: '2025-06-01',
    allocations: [
      { lotId: 'S1', qty: 10, buyPrice: 250, buyDate: '2024-01-15' }
    ]
  }];
  const ops = calc.buildTickerOperationTimeline('SBER', positions, sales);
  const buys = ops.filter((o) => o.type === 'buy');
  const sells = ops.filter((o) => o.type === 'sell');
  assert(buys.length === 1 && sells.length === 1, 'one merged buy + one sell');
  assert(buys[0].qty === 15, 'buy qty = remaining 5 + sold 10');
  assert(ops[0].type === 'buy' && ops[1].type === 'sell', 'buy before sell');
  assert(ops[0].remainingQtyAfter === 15, 'remaining after buy');
  assert(ops[1].remainingQtyAfter === 5, 'remaining after partial sell');
  assert(Math.abs(ops[1].realizedPnlRub - 300) < 1e-9, 'realized (280-250)*10');
  assert(ops[1].realizedPnlPct != null && isFinite(ops[1].realizedPnlPct), 'sell pct present');
  assert(Math.abs(ops[0].amountRub - 3750) < 1e-9, 'merged buy amount 15*250');
  assert(Math.abs(ops[1].amountRub - 2800) < 1e-9, 'sell amount 10*280');
}

{
  // Волна 3.1: частично проданный лот с изменённым avgPrice остатка — всё равно одна покупка
  const positions = [
    { ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 190, buyDate: '2024-01-15' }
  ];
  const sales = [{
    saleId: 'SALE_ADJ',
    ticker: 'SBER',
    qty: 10,
    buyPrice: 250,
    salePrice: 280,
    saleDate: '2025-06-01',
    allocations: [
      { lotId: 'S1', qty: 10, buyPrice: 250, buyDate: '2024-01-15' }
    ]
  }];
  const ops = calc.buildTickerOperationTimeline('SBER', positions, sales);
  const buys = ops.filter((o) => o.type === 'buy');
  assert(buys.length === 1, 'adjusted remaining still one buy');
  assert(buys[0].qty === 15, 'qty still remaining+sold');
  assert(buys[0].price === 250, 'price from allocation (original buy), not adjusted remaining');
}

{
  // Волна 3.1: полностью закрытая позиция — история из sales/allocations
  const positions = [];
  const sales = [{
    saleId: 'P1',
    ticker: 'PLZL',
    qty: 4,
    buyPrice: 10000,
    salePrice: 11000,
    saleDate: '2025-03-01',
    allocations: [
      { lotId: 'P0', qty: 4, buyPrice: 10000, buyDate: '2024-02-01' }
    ]
  }];
  const ops = calc.buildTickerOperationTimeline('PLZL', positions, sales);
  assert(ops.length === 2, 'closed: buy reconstructed + sell');
  assert(ops[0].type === 'buy' && ops[0].qty === 4 && ops[0].lotId === 'P0', 'buy from allocation');
  assert(ops[1].type === 'sell' && ops[1].saleId === 'P1', 'sell visible');
  assert(ops[0].remainingQtyAfter === 4, 'remaining after reconstructed buy');
  assert(ops[1].remainingQtyAfter === 0, 'fully sold remaining 0');
  const closed = calc.listClosedPortfolioPositions(positions, sales, {});
  assert(closed.length === 1 && closed[0].ticker === 'PLZL', 'ticker appears in closed positions');
}

{
  // Волна 3.1: ОФЗ — цена %, сумма в ₽, avgPrice JSON не меняется
  const positions = [
    { ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2025-03-01', faceValue: 1000 }
  ];
  const frozenAvg = positions[0].avgPrice;
  const bondMeta = { faceValue: 1000 };
  const ops = calc.buildTickerOperationTimeline('OFZ_26238', positions, [], bondMeta);
  assert(ops.length === 1 && ops[0].type === 'buy', 'OFZ one buy');
  assert(ops[0].price === 95, 'OFZ price stays percent');
  assert(Math.abs(ops[0].amountRub - 9500) < 1e-6, 'OFZ amount 10×95%×1000');
  assert(ops[0].isBond === true, 'OFZ isBond');
  assert(positions[0].avgPrice === frozenAvg && frozenAvg === 95, 'avgPrice JSON unchanged');

  const sales = [{
    saleId: 'OS1',
    ticker: 'OFZ_26238',
    qty: 4,
    buyPrice: 95,
    salePrice: 98,
    saleDate: '2025-07-01',
    faceValue: 1000,
    allocations: [{ lotId: 'O1', qty: 4, buyPrice: 95, buyDate: '2025-03-01' }]
  }];
  const remainPos = [
    { ticker: 'OFZ_26238', lotId: 'O1', qty: 6, avgPrice: 95, buyDate: '2025-03-01', faceValue: 1000 }
  ];
  const ofzOps = calc.buildTickerOperationTimeline('OFZ_26238', remainPos, sales, bondMeta);
  assert(ofzOps[0].qty === 10 && Math.abs(ofzOps[0].amountRub - 9500) < 1e-6, 'OFZ merged buy amount');
  assert(Math.abs(ofzOps[1].amountRub - 3920) < 1e-6, 'OFZ sell amount 4×98%×1000');
  assert(Math.abs(ofzOps[1].realizedPnlRub - 120) < 1e-6, 'OFZ realized 4×3%×1000');
  assert(remainPos[0].avgPrice === 95, 'OFZ remaining avgPrice unchanged');
}

{
  // Волна 3.1: плохая/пустая дата — нет Invalid Date, операция не теряется
  const ops = calc.buildTickerOperationTimeline('SBER', [
    { ticker: 'SBER', lotId: 'B1', qty: 1, avgPrice: 100, buyDate: 'Invalid Date' },
    { ticker: 'SBER', lotId: 'B2', qty: 2, avgPrice: 110, buyDate: '' },
    { ticker: 'SBER', lotId: 'B3', qty: 3, avgPrice: 120, buyDate: '2024-01-01' }
  ], []);
  assert(ops.length === 3, 'bad dates still produce operations');
  assert(ops[0].lotId === 'B3', 'valid date first');
  assert(ops[0].date === '2024-01-01', 'valid iso kept');
  assert(!ops[1].date, 'empty date → empty');
  assert(!ops[2].date, 'invalid date → empty');
  const blob = JSON.stringify(ops);
  assert(blob.indexOf('Invalid Date') === -1, 'no Invalid Date in timeline');
  assert(ops.every((o) => o.qty > 0), 'no operation lost');
}

{
  // Волна 3.1: один день — покупка перед продажей
  const ops = calc.buildTickerOperationTimeline('GAZP', [], [{
    saleId: 'G1',
    ticker: 'GAZP',
    qty: 8,
    buyPrice: 140,
    salePrice: 160,
    saleDate: '2024-06-01',
    allocations: [{ lotId: 'G0', qty: 8, buyPrice: 140, buyDate: '2024-06-01' }]
  }]);
  assert(ops.length === 2 && ops[0].type === 'buy' && ops[1].type === 'sell', 'same-day buy before sell');
  assert(ops[1].remainingQtyAfter === 0, 'same-day full close remaining 0');
}

{
  // Волна 3.2: состав на дату — одна покупка до даты
  const positions = [
    { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }
  ];
  const frozen = JSON.stringify(positions);
  const r = calc.buildPortfolioCompositionAtDate({ positions: positions, sales: [] }, '2024-06-01');
  assert(!r.invalidDate, 'valid target date');
  assert(r.items.length === 1 && r.items[0].ticker === 'SBER', 'one paper in composition');
  assert(r.items[0].qtyAtDate === 10, 'qtyAtDate = buy qty');
  assert(r.items[0].boughtQtyUpToDate === 10 && r.items[0].soldQtyUpToDate === 0, 'bought/sold');
  assert(r.items[0].firstBuyDate === '2024-01-15', 'first buy date');
  assert(r.items[0].openLotsAtDate.length === 1, 'one open lot at date');
  assert(r.items[0].openLotsAtDate[0].qtyAtDate === 10, 'lot qty at date');
  assert(r.items[0].valueAtDate == null && r.items[0].marketValue == null, 'no value-on-date field');
  assert(JSON.stringify(positions) === frozen, 'as-of helper does not mutate positions');
}

{
  // Волна 3.2: покупка после даты — бумаги нет
  const r = calc.buildPortfolioCompositionAtDate({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-06-01' }],
    sales: []
  }, '2024-01-15');
  assert(r.items.length === 0, 'buy after date → not in composition');
}

{
  // Волна 3.2: две покупки до даты — сумма qty
  const r = calc.buildPortfolioCompositionAtDate({
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' },
      { ticker: 'SBER', lotId: 'S2', qty: 5, avgPrice: 280, buyDate: '2024-03-01' }
    ],
    sales: []
  }, '2024-06-01');
  assert(r.items.length === 1 && r.items[0].qtyAtDate === 15, 'two buys sum qty');
  assert(r.items[0].openLotsAtDate.length === 2, 'two lots at date');
}

{
  // Волна 3.2: продажа до даты уменьшает qty
  const positions = [
    { ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, buyDate: '2024-01-15' }
  ];
  const sales = [{
    saleId: 'SALE1',
    ticker: 'SBER',
    qty: 5,
    buyPrice: 250,
    salePrice: 280,
    saleDate: '2024-05-01',
    allocations: [{ lotId: 'S1', qty: 5, buyPrice: 250, buyDate: '2024-01-15' }]
  }];
  const r = calc.buildPortfolioCompositionAtDate({ positions: positions, sales: sales }, '2024-06-01');
  assert(r.items.length === 1 && r.items[0].qtyAtDate === 5, 'qty after sale before date');
  assert(r.items[0].boughtQtyUpToDate === 10 && r.items[0].soldQtyUpToDate === 5, 'bought 10 sold 5');
}

{
  // Волна 3.2: продажа после даты не уменьшает qty
  const r = calc.buildPortfolioCompositionAtDate({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 5,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'S1', qty: 5, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, '2024-12-01');
  assert(r.items.length === 1 && r.items[0].qtyAtDate === 10, 'sale after date ignored');
  assert(r.items[0].soldQtyUpToDate === 0, 'sold qty up to date is 0');
}

{
  // Волна 3.2: полностью закрыта до даты — нет в составе
  const r = calc.buildPortfolioCompositionAtDate({
    positions: [],
    sales: [{
      saleId: 'SALE1',
      ticker: 'PLZL',
      qty: 4,
      buyPrice: 100,
      salePrice: 200,
      saleDate: '2024-08-30',
      allocations: [{ lotId: 'P1', qty: 4, buyPrice: 100, buyDate: '2024-01-01' }]
    }]
  }, '2024-12-01');
  assert(r.items.length === 0, 'fully closed before date → absent');
}

{
  // Волна 3.2: полностью закрыта после даты — бумага есть
  const r = calc.buildPortfolioCompositionAtDate({
    positions: [],
    sales: [{
      saleId: 'SALE1',
      ticker: 'PLZL',
      qty: 4,
      buyPrice: 100,
      salePrice: 200,
      saleDate: '2025-08-30',
      allocations: [{ lotId: 'P1', qty: 4, buyPrice: 100, buyDate: '2024-01-01' }]
    }]
  }, '2025-01-01');
  assert(r.items.length === 1 && r.items[0].ticker === 'PLZL', 'closed after date → still held');
  assert(r.items[0].qtyAtDate === 4, 'qty before closing sale');
}

{
  // Волна 3.2: частичная продажа с allocations — остаток по лоту
  const r = calc.buildPortfolioCompositionAtDate({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 10,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'S1', qty: 10, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, '2025-07-01');
  assert(r.items.length === 1 && r.items[0].qtyAtDate === 5, 'partial alloc remainder 5');
  assert(r.items[0].openLotsAtDate.length === 1, 'one lot remains');
  assert(r.items[0].openLotsAtDate[0].lotId === 'S1', 'same lotId, not invented');
  assert(r.items[0].openLotsAtDate[0].originalQty === 15, 'original 15');
  assert(r.items[0].openLotsAtDate[0].soldQtyUpToDate === 10, 'sold 10 via allocations');
  assert(r.items[0].openLotsAtDate[0].qtyAtDate === 5, 'lot remainder 5');
}

{
  // Волна 3.2: ОФЗ — qty, avgPrice остаётся %, стоимость не считается
  const r = calc.buildPortfolioCompositionAtDate({
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01', faceValue: 1000
    }],
    sales: []
  }, '2024-12-01');
  assert(r.items.length === 1 && r.items[0].qtyAtDate === 10, 'OFZ qty');
  assert(r.items[0].type === 'bond', 'OFZ type bond');
  assert(r.items[0].openLotsAtDate[0].avgPrice === 95.4, 'avgPrice stays percent');
  assert(r.items[0].openLotsAtDate[0].faceValue === 1000, 'faceValue kept');
  assert(r.items[0].valueAtDate == null && r.items[0].costRub == null, 'OFZ as-of has no value');
}

{
  // Волна 3.2: пустая / плохая дата операции
  const r = calc.buildPortfolioCompositionAtDate({
    positions: [
      { ticker: 'GAZP', lotId: 'G1', qty: 8, avgPrice: 140, buyDate: '' },
      { ticker: 'GAZP', lotId: 'G2', qty: 2, avgPrice: 150, buyDate: 'Invalid Date' }
    ],
    sales: []
  }, '2025-01-01');
  assert(r.hasIncompleteHistory === true, 'incomplete history flagged');
  assert(r.items.length === 0, 'undated buys not included');
  const badTarget = calc.buildPortfolioCompositionAtDate({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 1, buyDate: '2024-01-01' }],
    sales: []
  }, 'not-a-date');
  assert(badTarget.invalidDate === true && badTarget.items.length === 0, 'bad target date → no calc');
  const mixed = calc.buildPortfolioCompositionAtDate({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 3, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: [{
      saleId: 'X',
      ticker: 'SBER',
      qty: 1,
      buyPrice: 250,
      salePrice: 260,
      saleDate: '',
      allocations: [{ lotId: 'S1', qty: 1, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, '2025-01-01');
  assert(mixed.hasIncompleteHistory === true, 'undated sale flags incomplete');
  assert(mixed.items.length === 1 && mixed.items[0].qtyAtDate === 4, 'undated sale excluded, qty not reduced');
  assert(String(mixed.items[0].lastOperationDate).indexOf('Invalid') === -1, 'no Invalid Date in output');
}

function loadPriceAtDateHelpers() {
  const coreCode = fs.readFileSync(path.join(__dirname, '..', 'analytics-core.js'), 'utf8');
  const helperCode = fs.readFileSync(path.join(__dirname, '..', 'price-at-date.js'), 'utf8');
  const memStore = Object.create(null);
  let setPortfolioCalls = 0;
  const sandbox = {
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    isFinite,
    parseInt,
    parseFloat,
    Promise,
    normalizeTicker: (t) => String(t || '').trim().toUpperCase(),
    normalizePortfolioDate: (value) => {
      if (value == null) return '';
      const s = String(value).trim();
      if (!s || /^invalid\b/i.test(s) || s === 'Invalid Date') return '';
      const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (!ymd) return '';
      const y = Number(ymd[1]);
      const mo = Number(ymd[2]);
      const d = Number(ymd[3]);
      if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
      return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    },
    isRuBondTicker: (ticker) => {
      ticker = String(ticker || '').trim().toUpperCase();
      return ticker.indexOf('OFZ') >= 0 || (ticker.indexOf('SU') === 0 && ticker.length > 8);
    },
    isIndexQuoteTicker: (ticker) => {
      ticker = String(ticker || '').trim().toUpperCase();
      return ticker === 'IMOEX' || ticker === 'INDEX';
    },
    Markets: { isUsTicker: () => false },
    getPortfolio: () => ({ positions: [{ ticker: 'SBER', qty: 1, avgPrice: 250, currentPrice: 300 }], sales: [], cashFlows: [], schemaVersion: 1 }),
    setPortfolio: () => { setPortfolioCalls += 1; },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null),
      setItem: (k, v) => { memStore[k] = String(v); },
      removeItem: (k) => { delete memStore[k]; }
    },
    __memStore: memStore,
    get setPortfolioCalls() { return setPortfolioCalls; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(coreCode, sandbox, { timeout: 5000 });
  vm.runInNewContext(helperCode, sandbox, { timeout: 5000 });
  return sandbox;
}

{
  // Волна 3.3: цена инструмента на дату — helper, без сети
  const sb = loadPriceAtDateHelpers();
  const priceAt = sb.getInstrumentPriceAtDate;
  const histShare = [
    { date: '2024-06-07', close: 280.5, value: 1e9 },
    { date: '2024-06-10', close: 282, value: 1.1e9 }
  ];
  const histBond = [
    { date: '2024-06-07', close: 95.4 },
    { date: '2024-06-10', close: 96.1 }
  ];
  const frozenPf = JSON.stringify(sb.getPortfolio());
  const frozenStore = JSON.stringify(sb.__memStore);

  await (async () => {
    const exact = await priceAt('SBER', '2024-06-10', { type: 'stock' }, { history: histShare });
    assert(exact.status === 'ok', 'share exact: status ok');
    assert(exact.priceDate === '2024-06-10', 'share exact: priceDate = targetDate');
    assert(exact.requestedDate === '2024-06-10', 'share exact: requestedDate');
    assert(exact.price === 282, 'share exact: CLOSE');
    assert(exact.priceType === 'close' && exact.unit === 'rub' && exact.currency === 'RUB', 'share exact: close/rub');
    assert(exact.source === 'moex-iss-history-shares', 'share exact: source');

    const notAfter = await priceAt('SBER', '2024-06-07', { type: 'stock' }, { history: histShare });
    assert(notAfter.priceDate === '2024-06-07' && notAfter.price === 280.5, 'share: never pick later CLOSE');

    const weekend = await priceAt('SBER', '2024-06-09', { type: 'stock' }, { history: histShare });
    assert(weekend.status === 'ok', 'share weekend: status ok');
    assert(weekend.priceDate === '2024-06-07', 'share weekend: previous CLOSE');
    assert(weekend.price === 280.5, 'share weekend: previous price');
    assert(weekend.priceDate <= weekend.requestedDate, 'share weekend: not after target');

    const none = await priceAt('SBER', '2024-01-01', { type: 'stock' }, { history: histShare });
    assert(none.status === 'missing', 'share no close: missing');
    assert(none.price == null && none.priceDate == null, 'share no close: no price');
    assert(String(none.note).indexOf('Нет цены закрытия') >= 0, 'share no close: note');

    const bpif = await priceAt('AKMM', '2024-06-10', { type: 'bpif' }, { history: histShare });
    assert(bpif.status === 'ok' && bpif.unit === 'rub', 'bpif: unit rub');
    assert(bpif.source === 'moex-iss-history-shares', 'bpif: shares history source');

    const ofzExact = await priceAt('OFZ_26238', '2024-06-10', { type: 'ofz' }, { history: histBond });
    assert(ofzExact.status === 'ok', 'ofz exact: ok');
    assert(ofzExact.unit === 'pct-of-face-value', 'ofz exact: unit pct');
    assert(ofzExact.priceType === 'close' && ofzExact.price === 96.1, 'ofz exact: CLOSE percent');
    assert(ofzExact.source === 'moex-iss-history-bonds', 'ofz exact: bonds source');

    const ofzWeekend = await priceAt('SU26238RMFS4', '2024-06-09', { type: 'bond', board: 'TQOB' }, { history: histBond });
    assert(ofzWeekend.status === 'ok' && ofzWeekend.priceDate === '2024-06-07', 'ofz weekend: previous CLOSE');
    assert(ofzWeekend.price === 95.4, 'ofz weekend: previous pct');

    const ofzMissing = await priceAt('OFZ_26238', '2023-01-01', {
      type: 'ofz',
      currentPrice: 98.5,
      avgPrice: 95
    }, {
      history: histBond,
      last: 99,
      livePrice: 99,
      currentPrice: 99
    });
    assert(ofzMissing.status === 'missing', 'ofz missing: missing');
    assert(ofzMissing.price == null, 'ofz missing: no LAST/current/avg substitute');
    assert(String(ofzMissing.note).indexOf('Нет цены закрытия') >= 0, 'ofz missing: note');

    const pif = await priceAt('FUNDX', '2024-06-10', {
      type: 'pif',
      sharePrice: 1234,
      shareDate: '2024-06-10'
    }, { history: [] });
    assert(pif.status === 'unsupported', 'plain pif: unsupported');
    assert(pif.price == null, 'plain pif: no UK sharePrice');

    const badDate = await priceAt('SBER', 'Invalid Date', { type: 'stock' }, { history: histShare });
    assert(badDate.status === 'invalid-date', 'bad date: invalid-date');
    assert(String(badDate.requestedDate).indexOf('Invalid') === -1, 'bad date: no Invalid Date in requestedDate');
    assert(String(badDate.note).indexOf('Invalid Date') === -1, 'bad date: no Invalid Date in note');
    const badDate2 = await priceAt('SBER', 'not-a-date', { type: 'stock' }, { history: histShare });
    assert(badDate2.status === 'invalid-date', 'not-a-date: invalid-date');

    let fetchCalls = 0;
    await priceAt('SBER', '2024-06-10', { type: 'stock' }, {
      history: histShare,
      fetchJson: () => { fetchCalls += 1; throw new Error('should not fetch'); }
    });
    assert(fetchCalls === 0, 'injected history skips ISS fetch');

    assert(JSON.stringify(sb.getPortfolio()) === frozenPf, 'price helper does not mutate getPortfolio()');
    assert(JSON.stringify(sb.__memStore) === frozenStore, 'price helper does not write localStorage');
    assert(sb.setPortfolioCalls === 0, 'price helper does not call setPortfolio');
    assert(!Object.prototype.hasOwnProperty.call(sb.__memStore, 'ibrf.portfolio'), 'no ibrf.portfolio key');
  })();
}

{
  // Волна 3.4: стоимость портфеля на дату — mock цен, без сети
  function priceOk(price, extra) {
    extra = extra || {};
    return {
      status: 'ok',
      price: price,
      priceDate: extra.priceDate || '2024-06-01',
      priceType: 'close',
      unit: extra.unit || 'rub',
      source: extra.source || 'moex-iss-history-shares'
    };
  }
  function mockMap(map) {
    return function (ticker) {
      const row = map[String(ticker || '').toUpperCase()];
      return Promise.resolve(row || { status: 'missing', price: null, priceDate: null });
    };
  }
  const frozenStore = JSON.stringify(calc.memStore);

  await (async () => {
    const one = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
      sales: []
    }, '2024-06-01', { getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100) }) });
    assert(!one.invalidDate, 'value: valid date');
    assert(one.items.length === 1 && one.items[0].qtyAtDate === 10, 'value: one share qty');
    assert(one.items[0].status === 'ok' && one.items[0].valueRub === 1000, 'value: 10×100=1000');
    assert(one.totalValueRub === 1000 && one.pricedValueRub === 1000, 'value: total 1000');
    assert(one.missingValueRub == null, 'value: missingValueRub not invented');
    assert(!one.isPartial && one.pricedItemsCount === 1, 'value: fully priced');

    const two = await calc.buildPortfolioValueAtDate({
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' },
        { ticker: 'GAZP', lotId: 'G1', qty: 4, avgPrice: 140, buyDate: '2024-02-01' }
      ],
      sales: []
    }, '2024-06-01', { getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100), GAZP: priceOk(50) }) });
    assert(two.totalValueRub === 1200, 'value: 1000+200=1200');
    assert(two.pricedItemsCount === 2 && !two.isPartial, 'value: two priced');

    const soldBefore = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, buyDate: '2024-01-15' }],
      sales: [{
        saleId: 'SALE1', ticker: 'SBER', qty: 5, buyPrice: 250, salePrice: 280, saleDate: '2024-05-01',
        allocations: [{ lotId: 'S1', qty: 5, buyPrice: 250, buyDate: '2024-01-15' }]
      }]
    }, '2024-06-01', { getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100) }) });
    assert(soldBefore.items[0].qtyAtDate === 5 && soldBefore.totalValueRub === 500, 'value: sale before date uses qty 5');

    const soldAfter = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, buyDate: '2024-01-15' }],
      sales: [{
        saleId: 'SALE1', ticker: 'SBER', qty: 5, buyPrice: 250, salePrice: 280, saleDate: '2025-06-01',
        allocations: [{ lotId: 'S1', qty: 5, buyPrice: 250, buyDate: '2024-01-15' }]
      }]
    }, '2024-12-01', { getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100, { priceDate: '2024-12-01' }) }) });
    assert(soldAfter.items[0].qtyAtDate === 10 && soldAfter.totalValueRub === 1000, 'value: sale after date ignored');

    const ofz = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01', faceValue: 1000 }],
      sales: []
    }, '2024-06-01', {
      getInstrumentPriceAtDate: mockMap({
        OFZ_26238: priceOk(95, { unit: 'pct-of-face-value', source: 'moex-iss-history-bonds' })
      })
    });
    assert(ofz.items[0].unit === 'pct-of-face-value', 'ofz value: unit pct');
    assert(ofz.items[0].valueRub === 9500, 'ofz value: 10×95%×1000=9500');
    assert(ofz.totalValueRub === 9500, 'ofz value: total 9500');
    assert(String(ofz.items[0].note).indexOf('НКД') >= 0, 'ofz value: clean-price note');

    const bpif = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'AKMM', lotId: 'A1', qty: 20, avgPrice: 10, buyDate: '2024-01-10' }],
      sales: []
    }, '2024-06-01', { getInstrumentPriceAtDate: mockMap({ AKMM: priceOk(12.5) }) });
    assert(bpif.items[0].unit === 'rub' && bpif.items[0].valueRub === 250, 'bpif value: 20×12.5=250');

    const weekend = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
      sales: []
    }, '2024-06-09', {
      getInstrumentPriceAtDate: mockMap({ SBER: priceOk(280, { priceDate: '2024-06-07' }) })
    });
    assert(weekend.items[0].priceDate === '2024-06-07', 'weekend value: previous priceDate');
    assert(weekend.items[0].priceDate < weekend.targetDate, 'weekend value: priceDate before target');
    assert(String(weekend.items[0].note).indexOf('07.06.2024') >= 0, 'weekend value: previous close note');
    assert(weekend.totalValueRub === 2800, 'weekend value: 10×280');

    const mixed = await calc.buildPortfolioValueAtDate({
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' },
        { ticker: 'GAZP', lotId: 'G1', qty: 4, avgPrice: 140, buyDate: '2024-02-01' }
      ],
      sales: []
    }, '2024-06-01', {
      getInstrumentPriceAtDate: mockMap({
        SBER: priceOk(100),
        GAZP: { status: 'missing', price: null, priceDate: null }
      })
    });
    assert(mixed.items.find((x) => x.ticker === 'GAZP').status === 'missing', 'missing: status');
    assert(mixed.items.find((x) => x.ticker === 'GAZP').valueRub == null, 'missing: valueRub null');
    assert(mixed.totalValueRub === 1000, 'missing: total only priced');
    assert(mixed.isPartial === true && mixed.missingItemsCount === 1, 'missing: isPartial');

    const unsup = await calc.buildPortfolioValueAtDate({
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' },
        { ticker: 'FUNDX', lotId: 'F1', qty: 3, avgPrice: 10, buyDate: '2024-02-01' }
      ],
      sales: []
    }, '2024-06-01', {
      getInstrumentPriceAtDate: mockMap({
        SBER: priceOk(100),
        FUNDX: { status: 'unsupported', price: null }
      })
    });
    assert(unsup.items.find((x) => x.ticker === 'FUNDX').status === 'unsupported', 'unsupported: status');
    assert(unsup.items.find((x) => x.ticker === 'FUNDX').valueRub == null, 'unsupported: no value');
    assert(unsup.isPartial === true && unsup.unsupportedItemsCount === 1, 'unsupported: isPartial');
    assert(unsup.totalValueRub === 1000, 'unsupported: total only priced');

    const empty = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-06-01' }],
      sales: []
    }, '2024-01-15', { getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100) }) });
    assert(empty.items.length === 0 && empty.totalValueRub === 0, 'empty composition: total 0');
    assert(!empty.isPartial, 'empty composition: not partial');

    const bad = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
      sales: []
    }, 'not-a-date', { getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100) }) });
    assert(bad.invalidDate === true && bad.items.length === 0, 'bad date: invalidDate');
    assert(bad.totalValueRub == null, 'bad date: total null');
    assert(String(bad.targetDate || '').indexOf('Invalid') === -1, 'bad date: no Invalid Date');

    const incomplete = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 3, avgPrice: 250, buyDate: '2024-01-15' }],
      sales: [{
        saleId: 'X', ticker: 'SBER', qty: 1, buyPrice: 250, salePrice: 260, saleDate: '',
        allocations: [{ lotId: 'S1', qty: 1, buyPrice: 250, buyDate: '2024-01-15' }]
      }]
    }, '2025-01-01', { getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100, { priceDate: '2024-12-30' }) }) });
    assert(incomplete.hasIncompleteHistory === true, 'incomplete: flagged');
    assert(incomplete.items.length === 1 && incomplete.items[0].qtyAtDate === 4, 'incomplete: qty not reduced by undated sale');
    assert(incomplete.totalValueRub === 400, 'incomplete: still values remaining qty');

    const noLast = await calc.buildPortfolioValueAtDate({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, currentPrice: 999, buyDate: '2024-01-15' }],
      sales: []
    }, '2024-06-01', {
      getInstrumentPriceAtDate: function (ticker, date, meta) {
        assert(meta && !meta.currentPrice && !meta.avgPrice, 'price meta has no live/avg');
        return Promise.resolve({ status: 'missing', price: null, last: 999, currentPrice: 999 });
      }
    });
    assert(noLast.items[0].status === 'missing' && noLast.items[0].valueRub == null, 'no LAST/avg substitute');
    assert(JSON.stringify(calc.memStore) === frozenStore, 'value helper does not write localStorage');
  })();
}

{
  // Волна 3.5: сравнение стоимости между датами — mock, без сети
  function mockValueAt(date, total, extra) {
    extra = extra || {};
    return {
      targetDate: date,
      invalidDate: !!extra.invalidDate,
      totalValueRub: extra.invalidDate ? null : total,
      pricedValueRub: extra.invalidDate ? null : total,
      isPartial: !!extra.isPartial,
      hasIncompleteHistory: !!extra.hasIncompleteHistory,
      notes: extra.notes || [],
      items: extra.items || []
    };
  }
  function mockByDate(map) {
    return function (portfolio, date) {
      const iso = String(date || '').slice(0, 10);
      const row = map[iso] || map[date];
      if (!row) return Promise.resolve(mockValueAt(iso, 0, { invalidDate: true }));
      return Promise.resolve(row);
    };
  }
  const frozenStore35 = JSON.stringify(calc.memStore);

  await (async () => {
    const grew = await calc.buildPortfolioValueChangeBetweenDates(
      { positions: [], sales: [] },
      '2024-01-01',
      '2024-02-01',
      { buildPortfolioValueAtDate: mockByDate({
        '2024-01-01': mockValueAt('2024-01-01', 1000),
        '2024-02-01': mockValueAt('2024-02-01', 1200)
      }) }
    );
    assert(!grew.invalidDate, 'change up: valid');
    assert(grew.fromValue === 1000 && grew.toValue === 1200, 'change up: values');
    assert(grew.changeRub === 200, 'change up: +200');
    assert(Math.abs(grew.changePct - 20) < 1e-9, 'change up: +20%');

    const down = await calc.buildPortfolioValueChangeBetweenDates(
      { positions: [], sales: [] },
      '2024-01-01',
      '2024-02-01',
      { buildPortfolioValueAtDate: mockByDate({
        '2024-01-01': mockValueAt('2024-01-01', 1000),
        '2024-02-01': mockValueAt('2024-02-01', 800)
      }) }
    );
    assert(down.changeRub === -200, 'change down: -200');
    assert(Math.abs(down.changePct - (-20)) < 1e-9, 'change down: -20%');

    const fromZero = await calc.buildPortfolioValueChangeBetweenDates(
      { positions: [], sales: [] },
      '2024-01-01',
      '2024-02-01',
      { buildPortfolioValueAtDate: mockByDate({
        '2024-01-01': mockValueAt('2024-01-01', 0),
        '2024-02-01': mockValueAt('2024-02-01', 1000)
      }) }
    );
    assert(fromZero.changeRub === 1000, 'from 0: changeRub 1000');
    assert(fromZero.changePct == null, 'from 0: changePct null');

    const partial = await calc.buildPortfolioValueChangeBetweenDates(
      { positions: [], sales: [] },
      '2024-01-01',
      '2024-02-01',
      { buildPortfolioValueAtDate: mockByDate({
        '2024-01-01': mockValueAt('2024-01-01', 1000),
        '2024-02-01': mockValueAt('2024-02-01', 1100, { isPartial: true })
      }) }
    );
    assert(partial.isPartial === true, 'partial: isPartial true');

    const bad = await calc.buildPortfolioValueChangeBetweenDates(
      { positions: [], sales: [] },
      'not-a-date',
      '2024-02-01',
      { buildPortfolioValueAtDate: mockByDate({
        '2024-02-01': mockValueAt('2024-02-01', 1000)
      }) }
    );
    assert(bad.invalidDate === true, 'bad date: invalidDate');
    assert(bad.changeRub == null && bad.changePct == null, 'bad date: no invented change');

    const emptyBoth = await calc.buildPortfolioValueChangeBetweenDates(
      { positions: [], sales: [] },
      '2024-01-01',
      '2024-02-01',
      { buildPortfolioValueAtDate: mockByDate({
        '2024-01-01': mockValueAt('2024-01-01', 0),
        '2024-02-01': mockValueAt('2024-02-01', 0)
      }) }
    );
    assert(emptyBoth.fromValue === 0 && emptyBoth.toValue === 0, 'empty both: 0 and 0');
    assert(emptyBoth.changeRub === 0, 'empty both: changeRub 0');
    assert(emptyBoth.changePct == null, 'empty both: changePct null');

    function priceOk(price) {
      return {
        status: 'ok',
        price: price,
        priceDate: '2024-06-01',
        priceType: 'close',
        unit: 'rub'
      };
    }
    function mockMap(map) {
      return function (ticker) {
        const row = map[String(ticker || '').toUpperCase()];
        return Promise.resolve(row || { status: 'missing', price: null, priceDate: null });
      };
    }

    const appeared = await calc.buildPortfolioValueChangeBetweenDates({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 100, buyDate: '2024-06-01' }],
      sales: []
    }, '2024-01-01', '2024-07-01', {
      getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100) })
    });
    const appRow = (appeared.items || []).find((x) => x.ticker === 'SBER');
    assert(appRow, 'appeared: row exists');
    assert(appRow.qtyFrom === 0 && appRow.valueFrom === 0, 'appeared: start 0');
    assert(appRow.qtyTo === 10 && appRow.valueTo === 1000, 'appeared: end > 0');
    assert(appRow.changeRub === 1000, 'appeared: change from 0');

    const gone = await calc.buildPortfolioValueChangeBetweenDates({
      positions: [],
      sales: [{
        saleId: 'SALE1', ticker: 'SBER', qty: 10, buyPrice: 100, salePrice: 120, saleDate: '2024-05-01',
        allocations: [{ lotId: 'S1', qty: 10, buyPrice: 100, buyDate: '2024-01-15' }]
      }]
    }, '2024-04-01', '2024-06-01', {
      getInstrumentPriceAtDate: mockMap({ SBER: priceOk(100) })
    });
    const goneRow = (gone.items || []).find((x) => x.ticker === 'SBER');
    assert(goneRow, 'gone: row exists');
    assert(goneRow.qtyFrom === 10 && goneRow.valueFrom === 1000, 'gone: start > 0');
    assert(goneRow.qtyTo === 0 && goneRow.valueTo === 0, 'gone: end 0');
    assert(goneRow.changeRub === -1000, 'gone: change to 0');

    const missingOne = await calc.buildPortfolioValueChangeBetweenDates({
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 100, buyDate: '2024-01-15' }],
      sales: []
    }, '2024-04-01', '2024-06-01', {
      getInstrumentPriceAtDate: function (ticker, date) {
        if (String(date).slice(0, 10) === '2024-06-01') {
          return Promise.resolve({ status: 'missing', price: null, last: 999, currentPrice: 999 });
        }
        return Promise.resolve(priceOk(100));
      }
    });
    const missRow = (missingOne.items || []).find((x) => x.ticker === 'SBER');
    assert(missingOne.isPartial === true, 'missing one: isPartial');
    assert(missRow && missRow.valueFrom === 1000, 'missing one: from priced');
    assert(missRow.valueTo == null, 'missing one: to not invented');
    assert(missRow.changeRub == null, 'missing one: paper change not invented');
    assert(JSON.stringify(calc.memStore) === frozenStore35, 'change helper does not write localStorage');
  })();
}

{
  // Краткий итог сравнения дат — items + операции периода, без доходности.
  const forbidden = /прибыльность|инвестиционный результат|чистая переоценка|вклад рынка/i;
  function norm(s) {
    return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  }
  function explain(items, extra) {
    extra = extra || {};
    return calc.buildPortfolioValueChangeExplanation(Object.assign({
      fromDate: '2024-01-01',
      toDate: '2024-02-01',
      items: items
    }, extra));
  }
  function blob(expl) {
    return [expl.summaryText].concat(expl.bullets || []).concat(expl.footnote || '').concat(expl.warnings || []).join(' ');
  }
  function item(ticker, qtyFrom, qtyTo, changeRub, extra) {
    return Object.assign({ ticker: ticker, qtyFrom: qtyFrom, qtyTo: qtyTo, changeRub: changeRub }, extra || {});
  }
  function noYieldExceptNegation(expl, label) {
    const text = blob(expl);
    assert(!forbidden.test(text), label + ': no yield words');
    const stripped = text.replace(/не доходность/gi, '');
    assert(!/доходность/i.test(stripped), label + ': доходность only as negation');
    assert(!(expl.bullets || []).some((b) => /тоже влияют на итоговую сумму/i.test(b)),
      label + ': no generic ops bullet');
  }

  const priceOnly = explain([
    item('SBER', 10, 10, 150),
    item('GAZP', 5, 5, 50)
  ], { changeRub: 200 });
  assert(priceOnly.hasOnlyPriceChanges === true, 'explain price-only: hasOnlyPriceChanges');
  assert(priceOnly.hasCompositionChanges === false, 'explain price-only: no composition');
  assert(/состав портфеля между датами не менялся/i.test(priceOnly.summaryText), 'explain price-only: summary состав');
  assert(/цен/i.test(priceOnly.summaryText), 'explain price-only: summary цены');
  assert(priceOnly.bullets.some((b) => /SBER/.test(b) && /цен/i.test(b)), 'explain price-only: ticker SBER');
  noYieldExceptNegation(priceOnly, 'explain price-only');

  const appeared = explain([item('PLZL', 0, 2, 3000)], { changeRub: 3000 });
  assert(appeared.hasCompositionChanges === true, 'explain appeared: composition');
  assert(/куплен/i.test(blob(appeared)) || /увелич/i.test(blob(appeared)), 'explain appeared: куплены/увеличены');
  assert(/PLZL/.test(blob(appeared)), 'explain appeared: ticker');
  noYieldExceptNegation(appeared, 'explain appeared');

  const gone = explain([item('SBER', 10, 0, -1000)], { changeRub: -1000 });
  assert(/продан/i.test(blob(gone)) || /уменьш/i.test(blob(gone)), 'explain gone: проданы/уменьшены');
  assert(/SBER/.test(blob(gone)), 'explain gone: ticker');

  const qtyUp = explain([item('GAZP', 5, 12, 700)], { changeRub: 700 });
  assert(/куплен/i.test(blob(qtyUp)) || /увелич/i.test(blob(qtyUp)), 'explain qty up: куплены/увеличены');
  assert(/GAZP/.test(blob(qtyUp)), 'explain qty up: ticker');

  const qtyDown = explain([item('OFZ_29027', 20, 8, -400)], { changeRub: -400 });
  assert(/продан/i.test(blob(qtyDown)) || /уменьш/i.test(blob(qtyDown)), 'explain qty down: проданы/уменьшены');
  assert(/OFZ_29027/.test(blob(qtyDown)), 'explain qty down: ticker');

  const mixed = explain([
    item('PLZL', 0, 1, 2000),
    item('OFZ_26248', 0, 10, 1500),
    item('OFZ_26250', 5, 12, 900),
    item('OFZ_29027', 15, 5, -600),
    item('SBER', 10, 10, 120),
    item('OFZ_26254', 8, 8, -80)
  ], { changeRub: 3840 });
  const mixedText = blob(mixed);
  assert(mixed.hasCompositionChanges === true, 'explain mixed: composition');
  assert(/PLZL/.test(mixedText) && /OFZ_26248/.test(mixedText), 'explain mixed: add tickers');
  assert(/OFZ_29027/.test(mixedText), 'explain mixed: reduced ticker');
  assert(mixed.bullets.length >= 2 && mixed.bullets.length <= 6, 'explain mixed: short bullets');
  noYieldExceptNegation(mixed, 'explain mixed');

  const partial = explain([
    item('SBER', 10, 10, 100),
    item('GAZP', 5, 5, null, { status: 'missing' })
  ], { changeRub: 100, isPartial: true });
  assert(partial.warnings.some((w) => /неполный/i.test(w) && /нет цены/i.test(w)), 'explain partial: warning');
  noYieldExceptNegation(partial, 'explain partial');

  const unsupported = explain([
    item('XYZ', 1, 1, null, { status: 'unsupported' })
  ], { changeRub: null, isPartial: true });
  assert(unsupported.warnings.length > 0, 'explain unsupported: warning');
  assert(unsupported.dominantReason === 'unknown' || unsupported.hasOnlyPriceChanges === false, 'explain unsupported: not fake price');

  const buyInPeriod = explain(
    [item('PLZL', 0, 12, 14000)],
    {
      changeRub: 14000,
      portfolio: {
        positions: [{ ticker: 'PLZL', lotId: 'P1', qty: 12, avgPrice: 983, buyDate: '2024-01-15' }],
        sales: []
      }
    }
  );
  const buyBlob = norm(blob(buyInPeriod));
  assert(buyInPeriod.hasPeriodOperations === true, 'explain buy-in-period: has ops');
  assert(/Покупки за период/i.test(buyBlob) && /PLZL/.test(buyBlob), 'explain buy-in-period: purchase line');
  assert(/12 шт/.test(buyBlob) && /11\s*796/.test(buyBlob), 'explain buy-in-period: qty and trade amount');
  assert(!/14\s*000/.test(buyBlob.replace(/Стоимость выросла на 14\s*000.*/, '')), 'explain buy-in-period: not CLOSE as trade amount');
  noYieldExceptNegation(buyInPeriod, 'explain buy-in-period');

  const sellInPeriod = explain(
    [item('OFZ_29027', 12, 6, -5000)],
    {
      changeRub: -5000,
      portfolio: {
        positions: [{ ticker: 'OFZ_29027', lotId: 'O1', qty: 6, avgPrice: 84, buyDate: '2023-06-01' }],
        sales: [{
          saleId: 'S1', ticker: 'OFZ_29027', qty: 6, salePrice: 84.4, saleDate: '2024-01-20',
          buyPrice: 84, buyDate: '2023-06-01',
          allocations: [{ lotId: 'O1', qty: 6, buyPrice: 84, buyDate: '2023-06-01' }]
        }]
      }
    }
  );
  const sellBlob = norm(blob(sellInPeriod));
  assert(/Продажи за период/i.test(sellBlob) && /OFZ_29027/.test(sellBlob), 'explain sell-in-period: sale line');
  assert(/6 шт/.test(sellBlob) && /5\s*064/.test(sellBlob), 'explain sell-in-period: qty and trade amount');
  noYieldExceptNegation(sellInPeriod, 'explain sell-in-period');

  const bothOps = explain(
    [item('PLZL', 0, 12, 14000), item('OFZ_29027', 12, 6, -5000)],
    {
      changeRub: 9000,
      portfolio: {
        positions: [
          { ticker: 'PLZL', lotId: 'P1', qty: 12, avgPrice: 983, buyDate: '2024-01-15' },
          { ticker: 'OFZ_29027', lotId: 'O1', qty: 6, avgPrice: 84, buyDate: '2023-06-01' }
        ],
        sales: [{
          saleId: 'S1', ticker: 'OFZ_29027', qty: 6, salePrice: 84.4, saleDate: '2024-01-20',
          buyPrice: 84, allocations: [{ lotId: 'O1', qty: 6, buyPrice: 84, buyDate: '2023-06-01' }]
        }]
      }
    }
  );
  const bothBlob = norm(blob(bothOps));
  assert(/Покупки за период/i.test(bothBlob) && /Продажи за период/i.test(bothBlob), 'explain both: buy and sell lines');
  assert(/PLZL/.test(bothBlob) && /OFZ_29027/.test(bothBlob), 'explain both: tickers');

  const ofzBuy = explain(
    [item('OFZ_26238', 0, 10, 9800)],
    {
      changeRub: 9800,
      portfolio: {
        positions: [{ ticker: 'OFZ_26238', lotId: 'B1', qty: 10, avgPrice: 95, buyDate: '2024-01-18', faceValue: 1000 }],
        sales: []
      }
    }
  );
  const ofzBlob = norm(blob(ofzBuy));
  assert(/Покупки за период/i.test(ofzBlob) && /OFZ_26238/.test(ofzBlob), 'explain ofz buy: line');
  assert(/9\s*500/.test(ofzBlob), 'explain ofz buy: qty × % / 100 × face');
  assert(!/9\s*800/.test(ofzBlob.replace(/Стоимость выросла на 9\s*800.*/, '')), 'explain ofz buy: not CLOSE amount');

  const undated = explain(
    [item('SBER', 0, 10, 2500)],
    {
      changeRub: 2500,
      hasIncompleteHistory: true,
      portfolio: {
        positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '' }],
        sales: []
      }
    }
  );
  assert(undated.periodOps && undated.periodOps.buys.length === 0, 'explain undated: not in period');
  assert(undated.warnings.some((w) => /без корректной даты/i.test(w)), 'explain undated: incomplete note');
  assert(!/Покупки за период/i.test(blob(undated)), 'explain undated: no dated purchase line');

  const noPrice = explain(
    [item('SBER', 0, 8, 2000)],
    {
      changeRub: 2000,
      portfolio: {
        positions: [{ ticker: 'SBER', lotId: 'S9', qty: 8, buyDate: '2024-01-12' }],
        sales: []
      }
    }
  );
  const noPriceLine = (noPrice.bullets || []).find((b) => /Покупки за период/i.test(b)) || '';
  assert(/SBER/.test(noPriceLine) && /8 шт/.test(noPriceLine), 'explain no-price: qty only');
  assert(!/₽/.test(noPriceLine), 'explain no-price: no invented amount');

  const onFromDate = explain(
    [item('SBER', 10, 10, 50)],
    {
      changeRub: 50,
      portfolio: {
        positions: [{ ticker: 'SBER', lotId: 'S0', qty: 10, avgPrice: 250, buyDate: '2024-01-01' }],
        sales: []
      }
    }
  );
  assert((onFromDate.periodOps.buys || []).length === 0, 'explain fromDate buy: not in open window');
  assert(onFromDate.hasOnlyPriceChanges === true, 'explain fromDate buy: treated as price-only');

  const manyPositions = [];
  const manyItems = [];
  for (let i = 1; i <= 7; i += 1) {
    const t = 'T' + i;
    manyPositions.push({ ticker: t, lotId: 'L' + i, qty: i, avgPrice: 100, buyDate: '2024-01-10' });
    manyItems.push(item(t, 0, i, i * 100));
  }
  const many = explain(manyItems, { changeRub: 2800, portfolio: { positions: manyPositions, sales: [] } });
  const manyBuy = (many.bullets || []).find((b) => /Покупки за период/i.test(b)) || '';
  assert(/и ещё/.test(manyBuy), 'explain many: collapsed extra');
  assert(many.showAllOperations === true, 'explain many: details flag');
  const shownTickers = (manyBuy.match(/T\d/g) || []).length;
  assert(shownTickers <= 5, 'explain many: at most 5 tickers in summary line');
}

{
  // Волна 4.1: выплаты за период владения
  const NOW = '2025-12-31';
  function runPayouts(portfolio, fromDate, toDate, extra) {
    return calc.buildPortfolioPayoutsForHoldingPeriod(
      portfolio,
      fromDate,
      toDate,
      Object.assign({ now: NOW }, extra || {})
    );
  }
  function sberFeed(dividends) {
    return { SBER: { kind: 'stock', source: 'moex', dividends: dividends } };
  }
  function ofzFeed(coupons, faceValue) {
    return {
      OFZ_26238: {
        kind: 'bond',
        source: 'bondization',
        coupons: coupons,
        faceValue: faceValue != null ? faceValue : 1000
      }
    };
  }

  const boughtBefore = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15',
      currentPrice: 9999, LAST: 8888
    }],
    sales: []
  };
  const frozenBuy = JSON.stringify(boughtBefore);
  const rBuy = runPayouts(boughtBefore, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 33.3, currency: 'RUB' }])
  });
  assert(!rBuy.invalidDate, 'payouts: buy before cutoff valid');
  assert(rBuy.items.length === 1, 'payouts: one dividend item');
  assert(rBuy.items[0].ticker === 'SBER' && rBuy.items[0].type === 'dividend', 'payouts: SBER dividend');
  assert(rBuy.items[0].qtyHeld === 10, 'payouts: qtyHeld = bought qty');
  assert(rBuy.items[0].payoutPerUnit === 33.3, 'payouts: per share');
  assert(rBuy.items[0].amountRub === 333, 'payouts: amount = qty × value');
  assert(rBuy.items[0].payoutDate === null, 'payouts: payoutDate null');
  assert(rBuy.items[0].recordDate === '2024-07-17', 'payouts: recordDate = cutoff');
  assert(/реестра/.test(rBuy.items[0].note), 'payouts: registry note');
  assert(rBuy.totalDividendsRub === 333 && rBuy.totalCouponsRub === 0, 'payouts: div total');
  assert(rBuy.totalPayoutsRub === 333, 'payouts: grand total');
  assert(rBuy.isPartial === false && rBuy.warnings.length === 0, 'payouts: complete feed');
  assert(JSON.stringify(boughtBefore) === frozenBuy, 'payouts: does not mutate portfolio');
  assert(rBuy.items[0].amountRub === 10 * 33.3, 'payouts: LAST/currentPrice/avgPrice ignored');

  const tickerOnly = calc.buildTickerPayoutsForHoldingPeriod(
    'SBER',
    boughtBefore,
    '2024-01-01',
    '2024-12-31',
    { now: NOW, payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 33.3 }]) }
  );
  assert(tickerOnly.items.length === 1 && tickerOnly.items[0].amountRub === 333, 'ticker helper: same amount');

  const boughtAfter = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-08-01' }],
    sales: []
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 33.3 }])
  });
  assert(boughtAfter.items.length === 0 && boughtAfter.totalPayoutsRub === 0, 'payouts: buy after cutoff → none');
  assert(boughtAfter.isPartial === false, 'payouts: buy after not partial');

  const soldBefore = runPayouts({
    positions: [],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 10,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2024-06-01',
      allocations: [{ lotId: 'S1', qty: 10, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 33.3 }])
  });
  assert(soldBefore.items.length === 0 && soldBefore.totalPayoutsRub === 0, 'payouts: sold before cutoff → none');

  const partialSale = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 4, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 6,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2024-06-01',
      allocations: [{ lotId: 'S1', qty: 6, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(partialSale.items.length === 1 && partialSale.items[0].qtyHeld === 4, 'payouts: partial sale remainder');
  assert(partialSale.items[0].amountRub === 40, 'payouts: remainder × value');

  const twoBuys = runPayouts({
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' },
      { ticker: 'SBER', lotId: 'S2', qty: 5, avgPrice: 280, buyDate: '2024-03-01' }
    ],
    sales: []
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 2 }])
  });
  assert(twoBuys.items.length === 1 && twoBuys.items[0].qtyHeld === 15, 'payouts: two buys sum qty');
  assert(twoBuys.items[0].amountRub === 30, 'payouts: 15 × 2');

  const soldAfter = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 5,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2024-08-01',
      allocations: [{ lotId: 'S1', qty: 5, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(soldAfter.items.length === 1 && soldAfter.items[0].qtyHeld === 10, 'payouts: sale after cutoff keeps payout');
  assert(soldAfter.items[0].amountRub === 100, 'payouts: qty before sale');

  const ofzValue = runPayouts({
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01', faceValue: 1000
    }],
    sales: []
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: ofzFeed([{ date: '2024-06-19', value: 42.38 }], 1000)
  });
  assert(ofzValue.items.length === 1 && ofzValue.items[0].type === 'coupon', 'payouts: OFZ coupon');
  assert(ofzValue.items[0].qtyHeld === 10, 'payouts: OFZ qty');
  assert(ofzValue.items[0].payoutPerUnit === 42.38, 'payouts: coupon value');
  assert(ofzValue.items[0].amountRub === 423.8, 'payouts: qty × coupon value');
  assert(ofzValue.totalCouponsRub === 423.8 && ofzValue.totalDividendsRub === 0, 'payouts: coupon totals');
  assert(/без НКД/.test(ofzValue.items[0].note), 'payouts: OFZ note without NKD');
  assert(ofzValue.items[0].payoutDate === null, 'payouts: coupon payoutDate null');

  const ofzPct = runPayouts({
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 4, avgPrice: 98, buyDate: '2024-01-10', faceValue: 1000
    }],
    sales: []
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: ofzFeed([{ date: '2024-06-19', valuePct: 5.5 }], 1000)
  });
  assert(ofzPct.items.length === 1, 'payouts: OFZ valuePct item');
  assert(ofzPct.items[0].payoutPerUnit === 55, 'payouts: 5.5% × 1000');
  assert(ofzPct.items[0].amountRub === 220, 'payouts: 4 × 55');

  const ofzAfter = runPayouts({
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2024-08-01', faceValue: 1000
    }],
    sales: []
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: ofzFeed([{ date: '2024-06-19', value: 42.38 }], 1000)
  });
  assert(ofzAfter.items.length === 0 && ofzAfter.totalPayoutsRub === 0, 'payouts: OFZ bought after coupon');

  const ofzNoAmount = runPayouts({
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2024-02-01', faceValue: 1000
    }],
    sales: []
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: ofzFeed([{ date: '2024-06-19' }], 1000)
  });
  assert(ofzNoAmount.items.length === 0, 'payouts: coupon without value skipped');
  assert(ofzNoAmount.isPartial === true, 'payouts: missing coupon amount → partial');
  assert(ofzNoAmount.warnings.some((w) => /купон без суммы/i.test(w)), 'payouts: coupon amount warning');

  const noFeed = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: []
  }, '2024-01-01', '2024-12-31', { payoutsByTicker: {} });
  assert(noFeed.totalPayoutsRub === 0 && noFeed.items.length === 0, 'payouts: no feed totals 0');
  assert(noFeed.isPartial === true, 'payouts: no feed isPartial');
  assert(noFeed.warnings.some((w) => /нет данных по выплатам для SBER/.test(w)), 'payouts: no feed warning');

  const unavailable = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: []
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: { SBER: { kind: 'stock', unavailable: true, dividends: [{ date: '2024-07-17', value: 10 }] } }
  });
  assert(unavailable.items.length === 0 && unavailable.isPartial === true, 'payouts: unavailable feed not used');

  const badDate = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: []
  }, 'not-a-date', '2024-12-31', { payoutsByTicker: sberFeed([]) });
  assert(badDate.invalidDate === true, 'payouts: bad fromDate');
  assert(badDate.totalPayoutsRub == null && badDate.totalDividendsRub == null, 'payouts: invalid sums null');
  const fromAfterTo = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 1, buyDate: '2024-01-15' }],
    sales: []
  }, '2024-12-31', '2024-01-01', { payoutsByTicker: sberFeed([]) });
  assert(fromAfterTo.invalidDate === true && fromAfterTo.totalCouponsRub == null, 'payouts: from > to');

  const emptyPf = runPayouts({ positions: [], sales: [] }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(emptyPf.invalidDate === false, 'payouts: empty portfolio valid');
  assert(emptyPf.totalPayoutsRub === 0 && emptyPf.items.length === 0, 'payouts: empty zeros');
  assert(emptyPf.warnings.length === 0 && emptyPf.isPartial === false, 'payouts: empty no warning');

  const futureDiv = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: []
  }, '2025-01-01', '2026-12-31', {
    now: '2025-06-01',
    payoutsByTicker: sberFeed([{ date: '2025-12-01', value: 20 }])
  });
  assert(futureDiv.items.length === 0, 'payouts: future cutoff excluded');

  const futureCpn = runPayouts({
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2024-02-01', faceValue: 1000
    }],
    sales: []
  }, '2025-01-01', '2026-12-31', {
    now: '2025-06-01',
    payoutsByTicker: ofzFeed([{ date: '2025-12-01', value: 40 }], 1000)
  });
  assert(futureCpn.items.length === 0, 'payouts: future coupon excluded');

  const undated = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 3, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: [{
      saleId: 'X',
      ticker: 'SBER',
      qty: 1,
      buyPrice: 250,
      salePrice: 260,
      saleDate: '',
      allocations: [{ lotId: 'S1', qty: 1, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  const undatedComp = calc.buildPortfolioCompositionAtDate({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 3, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: [{
      saleId: 'X',
      ticker: 'SBER',
      qty: 1,
      buyPrice: 250,
      salePrice: 260,
      saleDate: '',
      allocations: [{ lotId: 'S1', qty: 1, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, '2024-07-17');
  assert(undated.items.length === 1, 'payouts: undated sale still has item');
  assert(undated.items[0].qtyHeld === undatedComp.items[0].qtyAtDate, 'payouts: undated qty matches composition');
  assert(undated.isPartial === true, 'payouts: undated isPartial');
  assert(undated.warnings.some((w) => /без корректной даты/i.test(w)), 'payouts: undated warning');

  const badDivValue = runPayouts({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: []
  }, '2024-01-01', '2024-12-31', {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 0 }])
  });
  assert(badDivValue.items.length === 0 && badDivValue.isPartial === true, 'payouts: dividend value <= 0 skipped');
  assert(badDivValue.warnings.some((w) => /дивиденд без суммы/i.test(w)), 'payouts: dividend value warning');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-12-31';
  function gmknFeed(dividends) {
    return { GMKN: { kind: 'stock', source: 'moex', dividends: dividends } };
  }
  function runGmkn(pf, extra) {
    return calc.buildTickerPayoutsForHoldingPeriod(
      'GMKN',
      pf,
      '2021-01-01',
      '2026-12-31',
      Object.assign({
        now: NOW,
        splitEvents: events,
        payoutsByTicker: gmknFeed([])
      }, extra || {})
    );
  }

  const histLot = {
    ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
  };
  const histPf = { positions: [histLot], sales: [] };
  const histSnap = JSON.stringify(histPf);

  let r = runGmkn(histPf, {
    payoutsByTicker: gmknFeed([{ date: '2023-06-01', value: 1000 }])
  });
  assert(r.items.length === 1, 'payouts split: hist pre-split item');
  assert(r.items[0].qtyHeld === 10, 'payouts split: hist pre-split qtyHeld 10');
  assert(r.items[0].payoutPerUnit === 1000, 'payouts split: hist pre-split raw DPS');
  assert(r.items[0].amountRub === 10000, 'payouts split: hist pre-split amount 10000');
  assert(JSON.stringify(histPf) === histSnap, 'payouts split: hist JSON not mutated');

  r = runGmkn(histPf, {
    payoutsByTicker: gmknFeed([{ date: '2025-06-01', value: 10 }])
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 1000, 'payouts split: hist post-split qtyHeld 1000');
  assert(r.items[0].payoutPerUnit === 10, 'payouts split: hist post-split raw DPS 10');
  assert(r.items[0].amountRub === 10000, 'payouts split: hist post-split amount 10000');

  const currPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  r = runGmkn(currPf, {
    payoutsByTicker: gmknFeed([{ date: '2025-06-01', value: 10 }])
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 1000, 'payouts split: current post-split qtyHeld 1000');
  assert(r.items[0].amountRub === 10000, 'payouts split: current post-split amount 10000');

  r = runGmkn(currPf, {
    payoutsByTicker: gmknFeed([{ date: '2023-06-01', value: 1000 }])
  });
  assert(r.items.length === 0, 'payouts split: current pre-split not included');
  assert(r.isPartial === true, 'payouts split: current pre-split isPartial');
  assert(r.warnings.some((w) => /GMKN/.test(w) && /отсечки/.test(w)), 'payouts split: current pre-split warning has ticker');
  assert(r.totalPayoutsRub === 0, 'payouts split: current pre-split total not a confident 0 payout line');

  const mixedPf = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 },
      { ticker: 'GMKN', lotId: 'G4', qty: 10, avgPrice: 130, buyDate: '2026-09-04', currentPrice: 130 }
    ],
    sales: []
  };
  const mixedSnap = JSON.stringify(mixedPf);
  r = runGmkn(mixedPf, {
    payoutsByTicker: gmknFeed([{ date: '2026-09-04', value: 10 }])
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 1010, 'payouts split: mixed qtyHeld 1010');
  assert(r.items[0].amountRub === 10100, 'payouts split: mixed amount 10100');
  assert(JSON.stringify(mixedPf) === mixedSnap, 'payouts split: mixed JSON not mutated');

  const unknownPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'GX', qty: 10, avgPrice: 800, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  r = runGmkn(unknownPf, {
    payoutsByTicker: gmknFeed([{ date: '2025-06-01', value: 10 }])
  });
  assert(r.isPartial === true, 'payouts split: unknown isPartial');
  assert(r.warnings.some((w) => /GMKN/.test(w)), 'payouts split: unknown warning has ticker');
  assert(r.items.length === 0, 'payouts split: unknown not a confident payout item');
  assert(r.totalPayoutsRub === 0, 'payouts split: unknown total not treated as earned 0');

  const sberStill = calc.buildTickerPayoutsForHoldingPeriod(
    'SBER',
    {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
      sales: []
    },
    '2024-01-01',
    '2024-12-31',
    {
      now: '2025-12-31',
      splitEvents: events,
      payoutsByTicker: { SBER: { kind: 'stock', source: 'moex', dividends: [{ date: '2024-07-17', value: 33.3 }] } }
    }
  );
  assert(sberStill.items.length === 1 && sberStill.items[0].qtyHeld === 10, 'payouts split: SBER qty unchanged');
  assert(sberStill.items[0].amountRub === 333, 'payouts split: SBER amount unchanged');
  assert(sberStill.isPartial === false, 'payouts split: SBER not partial');

  const ofzStill = calc.buildTickerPayoutsForHoldingPeriod(
    'SU26238RMFS9',
    {
      positions: [{ ticker: 'SU26238RMFS9', lotId: 'B1', qty: 10, avgPrice: 97.5, buyDate: '2023-01-01' }],
      sales: []
    },
    '2024-01-01',
    '2024-12-31',
    {
      now: '2025-12-31',
      splitEvents: events,
      payoutsByTicker: {
        SU26238RMFS9: {
          kind: 'bond',
          source: 'bondization',
          coupons: [{ date: '2024-06-15', value: 35 }],
          faceValue: 1000
        }
      }
    }
  );
  assert(ofzStill.items.length === 1 && ofzStill.items[0].type === 'coupon', 'payouts split: OFZ still coupon');
  assert(ofzStill.items[0].qtyHeld === 10 && ofzStill.items[0].amountRub === 350, 'payouts split: OFZ qty/amount unchanged');
}

{
  // Волна 4.2: загрузчик лент — моки, без сети
  assert(typeof calc.loadPayoutFeedsForPortfolio === 'function', 'feed loader exported');

  const called = { analytics: [], bonds: [] };
  const mocks = {
    buildSecurityAnalytics: (ticker) => {
      called.analytics.push(ticker);
      if (ticker === 'GAZP') return Promise.reject(new Error('analytics down'));
      return Promise.resolve({
        ticker: ticker,
        eligible: true,
        dividends: [{ date: '2024-07-17', value: 33.3 }]
      });
    },
    fetchOfzBondSnapshot: (cfg) => {
      called.bonds.push(cfg && cfg.ticker);
      if (cfg && cfg.ticker === 'OFZ_FAIL') {
        return Promise.resolve({ ticker: cfg.ticker, error: true });
      }
      return Promise.resolve({
        ticker: cfg.ticker,
        faceValue: 1000,
        coupons: [{ date: '2024-06-19', value: 42.38 }],
        accruedInt: 12.5,
        nextCoupon: '2026-01-01'
      });
    }
  };

  const mixedPf = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 300 },
      { ticker: 'OFZ_26238', lotId: 'O1', qty: 4, avgPrice: 95, buyDate: '2024-02-01', faceValue: 1000 },
      { ticker: 'GAZP', lotId: 'G1', qty: 8, avgPrice: 140, buyDate: '2024-03-01' },
      { ticker: 'AAPL', lotId: 'U1', qty: 2, avgPrice: 180, buyDate: '2024-04-01', market: 'US' },
      { ticker: 'SBGB', lotId: 'P1', qty: 3, avgPrice: 10, buyDate: '2024-05-01', kind: 'pif' },
      { ticker: 'IMOEX', lotId: 'I1', qty: 1, avgPrice: 1, buyDate: '2024-01-01' }
    ],
    sales: [{
      saleId: 'SALE1',
      ticker: 'PLZL',
      qty: 4,
      buyPrice: 100,
      salePrice: 200,
      saleDate: '2024-08-30',
      allocations: [{ lotId: 'P1', qty: 4, buyPrice: 100, buyDate: '2024-01-01' }]
    }]
  };
  const frozenMixed = JSON.stringify(mixedPf);
  const feeds = await calc.loadPayoutFeedsForPortfolio(mixedPf, mocks);

  assert(JSON.stringify(mixedPf) === frozenMixed, 'feed loader: does not mutate portfolio');
  assert(feeds.isPartial === true, 'feed loader: mixed result isPartial');
  assert(feeds.payoutsByTicker.SBER && feeds.payoutsByTicker.SBER.unavailable === false, 'feed loader: SBER available');
  assert(feeds.payoutsByTicker.SBER.kind === 'stock' && feeds.payoutsByTicker.SBER.source === 'moex', 'feed loader: SBER stock/moex');
  assert(feeds.payoutsByTicker.SBER.dividends.length === 1 && feeds.payoutsByTicker.SBER.dividends[0].value === 33.3, 'feed loader: SBER dividends');
  assert(feeds.payoutsByTicker.SBER.coupons && feeds.payoutsByTicker.SBER.coupons.length === 0, 'feed loader: SBER no coupons');
  assert(feeds.payoutsByTicker.SBER.dividends[0].date === '2024-07-17', 'feed loader: SBER cutoff date');
  assert(feeds.payoutsByTicker.SBER.dividends[0].payoutDate == null, 'feed loader: no invented payment date');

  assert(feeds.payoutsByTicker.OFZ_26238 && feeds.payoutsByTicker.OFZ_26238.unavailable === false, 'feed loader: OFZ available');
  assert(feeds.payoutsByTicker.OFZ_26238.kind === 'bond' && feeds.payoutsByTicker.OFZ_26238.source === 'bondization', 'feed loader: OFZ bondization');
  assert(feeds.payoutsByTicker.OFZ_26238.faceValue === 1000, 'feed loader: OFZ faceValue');
  assert(feeds.payoutsByTicker.OFZ_26238.coupons.length === 1 && feeds.payoutsByTicker.OFZ_26238.coupons[0].value === 42.38, 'feed loader: OFZ coupons');
  assert(feeds.payoutsByTicker.OFZ_26238.accruedInt == null, 'feed loader: no NKD field');
  assert(feeds.payoutsByTicker.OFZ_26238.nextCoupon == null, 'feed loader: no nextCoupon calendar');

  assert(feeds.payoutsByTicker.GAZP && feeds.payoutsByTicker.GAZP.unavailable === true, 'feed loader: GAZP unavailable on error');
  assert(feeds.warnings.some((w) => w === 'нет данных по дивидендам для GAZP'), 'feed loader: GAZP warning');

  assert(feeds.payoutsByTicker.PLZL && feeds.payoutsByTicker.PLZL.kind === 'stock', 'feed loader: closed PLZL still loaded');
  assert(called.analytics.indexOf('PLZL') >= 0, 'feed loader: analytics called for closed ticker');

  assert(!feeds.payoutsByTicker.IMOEX, 'feed loader: IMOEX skipped');
  assert(!feeds.payoutsByTicker.AAPL, 'feed loader: US not in feeds');
  assert(!feeds.payoutsByTicker.SBGB, 'feed loader: PIF not in feeds');
  assert(feeds.warnings.some((w) => /выплаты для AAPL пока не поддерживаются/.test(w)), 'feed loader: US warning');
  assert(feeds.warnings.some((w) => /выплаты для SBGB пока не поддерживаются/.test(w)), 'feed loader: PIF warning');
  assert(called.analytics.indexOf('AAPL') < 0 && called.bonds.indexOf('AAPL') < 0, 'feed loader: US not fetched');
  assert(called.analytics.indexOf('SBGB') < 0, 'feed loader: PIF not fetched');
  assert(called.analytics.indexOf('IMOEX') < 0, 'feed loader: IMOEX not fetched');

  const ofzFail = await calc.loadPayoutFeedsForPortfolio({
    positions: [{ ticker: 'OFZ_FAIL', lotId: 'X', qty: 1, avgPrice: 90, buyDate: '2024-01-01', faceValue: 1000 }],
    sales: []
  }, mocks);
  assert(ofzFail.payoutsByTicker.OFZ_FAIL.unavailable === true, 'feed loader: OFZ error unavailable');
  assert(ofzFail.payoutsByTicker.OFZ_FAIL.faceValue === 1000, 'feed loader: OFZ error face 1000');
  assert(ofzFail.warnings.some((w) => w === 'нет данных по купонам для OFZ_FAIL'), 'feed loader: OFZ error warning');
  assert(ofzFail.isPartial === true, 'feed loader: OFZ error partial');

  const emptyFeeds = await calc.loadPayoutFeedsForPortfolio({ positions: [], sales: [] }, mocks);
  assert(Object.keys(emptyFeeds.payoutsByTicker).length === 0, 'feed loader: empty map');
  assert(emptyFeeds.warnings.length === 0 && emptyFeeds.isPartial === false, 'feed loader: empty no warning');

  const noLoader = await calc.loadPayoutFeedsForPortfolio({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 1, buyDate: '2024-01-01' }],
    sales: []
  }, {});
  assert(noLoader.payoutsByTicker.SBER.unavailable === true, 'feed loader: missing analytics fn');
  assert(noLoader.warnings.some((w) => /нет данных по дивидендам для SBER/.test(w)), 'feed loader: missing fn warning');
}

{
  // Волна 4.3: предстоящие выплаты по текущему составу
  assert(typeof calc.buildUpcomingPortfolioPayouts === 'function', 'upcoming helper exported');
  const NOW = '2025-06-01';
  function runUpcoming(portfolio, extra) {
    return calc.buildUpcomingPortfolioPayouts(
      portfolio,
      Object.assign({ now: NOW, horizonDays: 365 }, extra || {})
    );
  }
  function sberFeed(dividends) {
    return { SBER: { kind: 'stock', source: 'moex', dividends: dividends } };
  }
  function ofzFeed(coupons, faceValue) {
    return {
      OFZ_26238: {
        kind: 'bond',
        source: 'bondization',
        coupons: coupons,
        faceValue: faceValue != null ? faceValue : 1000
      }
    };
  }

  const heldNow = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15',
      currentPrice: 9999, LAST: 8888
    }],
    sales: []
  };
  const frozenHeld = JSON.stringify(heldNow);
  const rHeld = runUpcoming(heldNow, {
    payoutsByTicker: sberFeed([{ date: '2025-07-17', value: 33.3, currency: 'RUB' }])
  });
  assert(!rHeld.invalidDate, 'upcoming 1: valid');
  assert(rHeld.items.length === 1, 'upcoming 1: one dividend');
  assert(rHeld.items[0].ticker === 'SBER' && rHeld.items[0].type === 'dividend', 'upcoming 1: SBER dividend');
  assert(rHeld.items[0].date === '2025-07-17', 'upcoming 1: cutoff date');
  assert(rHeld.items[0].qtyHeld === 10, 'upcoming 1: current qty');
  assert(rHeld.items[0].payoutPerUnit === 33.3, 'upcoming 1: per share');
  assert(rHeld.items[0].amountRub === 333, 'upcoming 1: qty × value');
  assert(rHeld.totalUpcomingRub === 333 && rHeld.totalDividendsRub === 333, 'upcoming 1: totals');
  assert(rHeld.totalCouponsRub === 0, 'upcoming 1: no coupons');
  assert(rHeld.nextDate === '2025-07-17', 'upcoming 1: nextDate');
  assert(/отсечки/.test(rHeld.items[0].note) && /не по дате зачисления/.test(rHeld.items[0].note), 'upcoming 1: cutoff note');
  assert(rHeld.isPartial === false && rHeld.warnings.length === 0, 'upcoming 1: complete');
  assert(JSON.stringify(heldNow) === frozenHeld, 'upcoming 12: does not mutate portfolio');
  assert(rHeld.items[0].amountRub === 10 * 33.3, 'upcoming 11: LAST/currentPrice/avgPrice ignored');

  const soldNow = runUpcoming({
    positions: [],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 10,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2025-03-01',
      allocations: [{ lotId: 'S1', qty: 10, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, {
    payoutsByTicker: sberFeed([{ date: '2025-07-17', value: 33.3 }])
  });
  assert(soldNow.items.length === 0 && rHeld.totalUpcomingRub === 333, 'upcoming 2: sold now not counted');
  assert(soldNow.totalUpcomingRub === 0, 'upcoming 2: zeros after sale');

  const beyond = runUpcoming(heldNow, {
    horizonDays: 30,
    payoutsByTicker: sberFeed([{ date: '2025-12-01', value: 20 }])
  });
  assert(beyond.items.length === 0 && beyond.totalUpcomingRub === 0, 'upcoming 3: beyond horizon skipped');

  const todayEvent = runUpcoming(heldNow, {
    now: '2025-07-17',
    payoutsByTicker: sberFeed([
      { date: '2025-07-17', value: 33.3 },
      { date: '2025-07-16', value: 10 }
    ])
  });
  assert(todayEvent.items.length === 0, 'upcoming 4: today and past skipped');

  const tomorrowOk = runUpcoming(heldNow, {
    now: '2025-07-16',
    horizonDays: 10,
    payoutsByTicker: sberFeed([{ date: '2025-07-17', value: 5 }])
  });
  assert(tomorrowOk.items.length === 1 && tomorrowOk.items[0].amountRub === 50, 'upcoming 4: tomorrow included');

  const horizonEdge = runUpcoming(heldNow, {
    now: '2025-01-01',
    horizonDays: 10,
    payoutsByTicker: sberFeed([
      { date: '2025-01-11', value: 2 },
      { date: '2025-01-12', value: 9 }
    ])
  });
  assert(horizonEdge.items.length === 1 && horizonEdge.items[0].date === '2025-01-11', 'upcoming 3: end of horizon inclusive');

  const ofzHeld = {
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01',
      faceValue: 1000, currentPrice: 120, LAST: 99
    }],
    sales: []
  };
  const ofzValue = runUpcoming(ofzHeld, {
    payoutsByTicker: ofzFeed([{ date: '2025-09-19', value: 42.38 }], 1000)
  });
  assert(ofzValue.items.length === 1 && ofzValue.items[0].type === 'coupon', 'upcoming 5: OFZ coupon');
  assert(ofzValue.items[0].qtyHeld === 10, 'upcoming 5: OFZ qty');
  assert(ofzValue.items[0].payoutPerUnit === 42.38, 'upcoming 5: coupon value');
  assert(ofzValue.items[0].amountRub === 423.8, 'upcoming 5: qty × coupon');
  assert(ofzValue.totalCouponsRub === 423.8 && ofzValue.totalDividendsRub === 0, 'upcoming 5: coupon totals');
  assert(/без НКД/.test(ofzValue.items[0].note), 'upcoming 5: no NKD note');
  assert(ofzValue.items[0].amountRub === 10 * 42.38, 'upcoming 11: OFZ price fields ignored');

  const ofzPct = runUpcoming({
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 4, avgPrice: 98, buyDate: '2024-01-10', faceValue: 1000
    }],
    sales: []
  }, {
    payoutsByTicker: ofzFeed([{ date: '2025-09-19', valuePct: 5.5 }], 1000)
  });
  assert(ofzPct.items.length === 1, 'upcoming 6: valuePct item');
  assert(ofzPct.items[0].payoutPerUnit === 55, 'upcoming 6: 5.5% × 1000');
  assert(ofzPct.items[0].amountRub === 220, 'upcoming 6: 4 × 55');

  const ofzNoAmount = runUpcoming(ofzHeld, {
    payoutsByTicker: ofzFeed([{ date: '2025-09-19' }], 1000)
  });
  assert(ofzNoAmount.items.length === 0, 'upcoming 7: coupon without value skipped');
  assert(ofzNoAmount.isPartial === true, 'upcoming 7: partial');
  assert(ofzNoAmount.warnings.some((w) => /купон без суммы/i.test(w)), 'upcoming 7: coupon warning');

  const noFeed = runUpcoming(heldNow, { payoutsByTicker: {} });
  assert(noFeed.totalUpcomingRub === 0 && noFeed.items.length === 0, 'upcoming 8: no feed totals 0');
  assert(noFeed.isPartial === true, 'upcoming 8: isPartial');
  assert(noFeed.warnings.some((w) => /нет данных по выплатам для SBER/.test(w)), 'upcoming 8: no feed warning');

  const emptyPf = runUpcoming({ positions: [], sales: [] }, {
    payoutsByTicker: sberFeed([{ date: '2025-07-17', value: 10 }])
  });
  assert(emptyPf.invalidDate === false, 'upcoming 9: empty portfolio valid');
  assert(emptyPf.totalUpcomingRub === 0 && emptyPf.items.length === 0, 'upcoming 9: zeros');
  assert(emptyPf.warnings.length === 0 && emptyPf.isPartial === false, 'upcoming 9: no warning');
  assert(emptyPf.nextDate == null, 'upcoming 9: no nextDate');

  const badNow = runUpcoming(heldNow, {
    now: 'not-a-date',
    payoutsByTicker: sberFeed([{ date: '2025-07-17', value: 10 }])
  });
  assert(badNow.invalidDate === true, 'upcoming 10: invalid now');
  assert(badNow.totalUpcomingRub == null && badNow.items.length === 0, 'upcoming 10: soft null totals');

  const mixed = runUpcoming({
    positions: [
      { ticker: 'GAZP', lotId: 'G1', qty: 2, avgPrice: 140, buyDate: '2024-01-01' },
      { ticker: 'SBER', lotId: 'S1', qty: 3, avgPrice: 250, buyDate: '2024-01-01' }
    ],
    sales: []
  }, {
    payoutsByTicker: {
      SBER: { kind: 'stock', source: 'moex', dividends: [{ date: '2025-08-01', value: 10 }] },
      GAZP: { kind: 'stock', source: 'moex', dividends: [{ date: '2025-08-01', value: 7 }] }
    }
  });
  assert(mixed.items.length === 2, 'upcoming sort: two items same date');
  assert(mixed.items[0].ticker === 'GAZP' && mixed.items[1].ticker === 'SBER', 'upcoming sort: ticker within date');
  assert(mixed.nextDate === '2025-08-01', 'upcoming sort: nextDate nearest');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-09-04';
  function runUp(portfolio, extra) {
    return calc.buildUpcomingPortfolioPayouts(
      portfolio,
      Object.assign({
        now: NOW,
        horizonDays: 365,
        splitEvents: events
      }, extra || {})
    );
  }

  assert(typeof calc.getSplitAwareCurrentQty === 'function', 'upcoming split: currentQty helper exported');

  const sberPf = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280
    }],
    sales: []
  };
  const sberSnap = JSON.stringify(sberPf);
  let r = runUp(sberPf, {
    payoutsByTicker: { SBER: { kind: 'stock', source: 'moex', dividends: [{ date: '2026-10-01', value: 33.3 }] } }
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 10, 'upcoming split: SBER qty unchanged');
  assert(r.items[0].amountRub === 333, 'upcoming split: SBER amount unchanged');
  assert(r.isPartial === false, 'upcoming split: SBER not partial');
  assert(JSON.stringify(sberPf) === sberSnap, 'upcoming split: SBER JSON not mutated');

  const ofzPf = {
    positions: [{
      ticker: 'SU26238RMFS9', lotId: 'B1', qty: 10, avgPrice: 97.5, buyDate: '2023-01-01', currentPrice: 98
    }],
    sales: []
  };
  const ofzSnap = JSON.stringify(ofzPf);
  r = runUp(ofzPf, {
    payoutsByTicker: {
      SU26238RMFS9: {
        kind: 'bond',
        source: 'bondization',
        coupons: [{ date: '2026-10-15', value: 35 }],
        faceValue: 1000
      }
    }
  });
  assert(r.items.length === 1 && r.items[0].type === 'coupon', 'upcoming split: OFZ still coupon');
  assert(r.items[0].qtyHeld === 10 && r.items[0].amountRub === 350, 'upcoming split: OFZ qty/amount unchanged');
  assert(JSON.stringify(ofzPf) === ofzSnap, 'upcoming split: OFZ JSON not mutated');

  const gmknHistPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  const gmknHistSnap = JSON.stringify(gmknHistPf);
  const gmknNow = calc.getSplitAwareCurrentQty('GMKN', gmknHistPf, {
    splitEvents: events, now: NOW, currentDate: NOW
  });
  assert(gmknNow.qty === 1000, 'upcoming split: helper GMKN historical currentQty 1000');
  assert(gmknNow.asOfDate === NOW, 'upcoming split: helper asOfDate is now');
  r = runUp(gmknHistPf, {
    payoutsByTicker: { GMKN: { kind: 'stock', source: 'moex', dividends: [{ date: '2026-10-01', value: 10 }] } }
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 1000, 'upcoming split: GMKN hist qtyHeld 1000');
  assert(r.items[0].payoutPerUnit === 10, 'upcoming split: GMKN hist raw DPS');
  assert(r.items[0].amountRub === 10000, 'upcoming split: GMKN hist amount 10000');
  assert(JSON.stringify(gmknHistPf) === gmknHistSnap, 'upcoming split: GMKN hist JSON not mutated');
  assert(gmknHistPf.positions[0].qty === 10 && gmknHistPf.positions[0].avgPrice === 22000, 'upcoming split: GMKN qty/avgPrice untouched');

  const gmknCurrPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  r = runUp(gmknCurrPf, {
    payoutsByTicker: { GMKN: { kind: 'stock', source: 'moex', dividends: [{ date: '2026-10-01', value: 10 }] } }
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 1000, 'upcoming split: GMKN current qtyHeld 1000');
  assert(r.items[0].amountRub === 10000, 'upcoming split: GMKN current amount 10000 not 1000000');

  const gmknMixedPf = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 },
      { ticker: 'GMKN', lotId: 'G4', qty: 10, avgPrice: 130, buyDate: '2026-09-04', currentPrice: 130 }
    ],
    sales: []
  };
  const mixedSnap = JSON.stringify(gmknMixedPf);
  r = runUp(gmknMixedPf, {
    payoutsByTicker: { GMKN: { kind: 'stock', source: 'moex', dividends: [{ date: '2026-10-01', value: 10 }] } }
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 1010, 'upcoming split: mixed qtyHeld 1010');
  assert(r.items[0].amountRub === 10100, 'upcoming split: mixed amount 10100');
  assert(JSON.stringify(gmknMixedPf) === mixedSnap, 'upcoming split: mixed JSON not mutated');

  const tHistPf = {
    positions: [{
      ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3126, buyDate: '2025-12-01', currentPrice: 262
    }],
    sales: []
  };
  r = runUp(tHistPf, {
    payoutsByTicker: { T: { kind: 'stock', source: 'moex', dividends: [{ date: '2026-10-01', value: 5 }] } }
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 10, 'upcoming split: T hist qtyHeld 10');
  assert(r.items[0].amountRub === 50, 'upcoming split: T hist amount 50');

  const tCurrPf = {
    positions: [{
      ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262
    }],
    sales: []
  };
  r = runUp(tCurrPf, {
    payoutsByTicker: { T: { kind: 'stock', source: 'moex', dividends: [{ date: '2026-10-01', value: 5 }] } }
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 10, 'upcoming split: T current qtyHeld 10');
  assert(r.items[0].amountRub === 50, 'upcoming split: T current amount 50');

  const unknownPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'GX', qty: 10, avgPrice: 800, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  const unknownSnap = JSON.stringify(unknownPf);
  r = runUp(unknownPf, {
    payoutsByTicker: { GMKN: { kind: 'stock', source: 'moex', dividends: [{ date: '2026-10-01', value: 10 }] } }
  });
  assert(r.items.length === 0, 'upcoming split: unknown not a confident payout item');
  assert(r.isPartial === true, 'upcoming split: unknown isPartial');
  assert(r.warnings.some((w) => /GMKN/.test(w) && /предстоящих выплат/.test(w)), 'upcoming split: unknown warning has ticker');
  assert(r.totalUpcomingRub === 0, 'upcoming split: unknown total not treated as earned 0');
  assert(JSON.stringify(unknownPf) === unknownSnap, 'upcoming split: unknown JSON not mutated');

  const prodCatalogText = fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8');
  assert(!/FAKE_SPLIT/.test(prodCatalogText), 'upcoming split: production catalog has no FAKE_SPLIT');
  const fakeRaw = {
    ticker: 'FAKE_SPLIT',
    aliases: ['FAKE'],
    isin: 'TEST000FAKE0',
    effectiveDate: '2030-01-15',
    ratio: 5,
    type: 'split',
    note: 'Synthetic future split for generic contract tests',
    source: 'test'
  };
  const fakeEvents = calc.sandbox.parseSplitEventsCatalog({
    version: 1,
    events: (JSON.parse(prodCatalogText).events || []).concat([fakeRaw])
  });
  const fakeNow = '2031-01-01';
  const fakeHistPf = {
    positions: [{
      ticker: 'FAKE_SPLIT', lotId: 'F1', qty: 2, avgPrice: 500, buyDate: '2029-06-01', currentPrice: 90
    }],
    sales: []
  };
  const fakeSnap = JSON.stringify(fakeHistPf);
  const fakeHeld = calc.getSplitAwareCurrentQty('FAKE_SPLIT', fakeHistPf, {
    splitEvents: fakeEvents, now: fakeNow, currentDate: fakeNow
  });
  assert(fakeHeld.qty === 10, 'upcoming split: FAKE_SPLIT helper 2×5 → 10');
  r = calc.buildUpcomingPortfolioPayouts(fakeHistPf, {
    now: fakeNow,
    horizonDays: 365,
    splitEvents: fakeEvents,
    payoutsByTicker: {
      FAKE_SPLIT: { kind: 'stock', source: 'moex', dividends: [{ date: '2031-03-01', value: 4 }] }
    }
  });
  assert(r.items.length === 1 && r.items[0].qtyHeld === 10, 'upcoming split: FAKE_SPLIT qtyHeld 10');
  assert(r.items[0].amountRub === 40, 'upcoming split: FAKE_SPLIT amount 40');
  assert(JSON.stringify(fakeHistPf) === fakeSnap, 'upcoming split: FAKE_SPLIT JSON not mutated');
}

{
  // Волна 5.1: справочный результат по тикеру с учётом найденных выплат
  const NOW = '2025-12-31';
  function sberFeed(dividends) {
    return { SBER: { kind: 'stock', source: 'moex', dividends: dividends } };
  }
  function ofzFeed(coupons, faceValue) {
    return {
      OFZ_26238: {
        kind: 'bond',
        source: 'bondization',
        coupons: coupons,
        faceValue: faceValue != null ? faceValue : 1000
      }
    };
  }
  function runReturn(ticker, portfolio, extra) {
    return calc.buildTickerReturnWithPayouts(
      ticker,
      portfolio,
      Object.assign({ now: NOW }, extra || {})
    );
  }

  const boughtOpen = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15',
      currentPrice: 280, LAST: 8888
    }],
    sales: [],
    cashFlows: [{ id: 'cf1', amount: 1 }]
  };
  const frozenOpen = JSON.stringify(boughtOpen);
  const rOpen = runReturn('SBER', boughtOpen, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 33.3, currency: 'RUB' }])
  });
  assert(rOpen.ticker === 'SBER', 'twp 1: ticker');
  assert(rOpen.fromDate === '2024-01-15' && rOpen.toDate === NOW, 'twp 1: holding window');
  assert(rOpen.purchaseCostRub === 2500, 'twp 1: purchase qty×buy');
  assert(rOpen.saleProceedsRub === 0, 'twp 1: no sales');
  assert(rOpen.currentMarketValueRub === 2800, 'twp 1: qty×currentPrice');
  assert(rOpen.payoutsRub === 333 && rOpen.dividendsRub === 333 && rOpen.couponsRub === 0, 'twp 1: dividend');
  assert(rOpen.resultWithoutPayoutsRub === 300, 'twp 1: MV − purchase');
  assert(rOpen.resultWithPayoutsRub === 633, 'twp 1: MV + dividend − purchase');
  assert(Math.abs(rOpen.returnWithoutPayoutsPct - 12) < 1e-9, 'twp 1: 300/2500');
  assert(Math.abs(rOpen.returnWithPayoutsPct - 25.32) < 1e-9, 'twp 1: 633/2500');
  assert(rOpen.openQty === 10 && rOpen.isClosed === false, 'twp 1: open');
  assert(rOpen.isPartial === false, 'twp 1: complete');
  assert(JSON.stringify(boughtOpen) === frozenOpen, 'twp 15: does not mutate portfolio');
  assert(rOpen.payoutsRub === 10 * 33.3, 'twp 14: LAST/currentPrice/avgPrice ignored for payouts');
  assert(rOpen.notes.some((n) => /справочный результат/.test(n)), 'twp notes: reference wording');
  assert(rOpen.notes.some((n) => /найденных выплат/.test(n)), 'twp notes: found payouts wording');

  const boughtAfter = runReturn('SBER', {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-08-01', currentPrice: 280 }],
    sales: []
  }, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 33.3 }])
  });
  assert(boughtAfter.payoutsRub === 0 && boughtAfter.dividendsRub === 0, 'twp 2: buy after cutoff → no dividend');
  assert(boughtAfter.resultWithPayoutsRub === boughtAfter.resultWithoutPayoutsRub, 'twp 2: result unchanged');

  const partialSale = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 4, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 6,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2024-06-01',
      allocations: [{ lotId: 'S1', qty: 6, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  };
  const rPartial = runReturn('SBER', partialSale, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(rPartial.purchaseCostRub === 2500, 'twp 3: full original purchase');
  assert(rPartial.saleProceedsRub === 1680, 'twp 3: 6×280');
  assert(rPartial.currentMarketValueRub === 1120, 'twp 3: 4×280');
  assert(rPartial.payoutsRub === 40 && rPartial.dividendsRub === 40, 'twp 3: qtyHeld 4 × 10');
  assert(rPartial.resultWithoutPayoutsRub === 300, 'twp 3: 1680+1120-2500');
  assert(rPartial.resultWithPayoutsRub === 340, 'twp 3: + dividend');
  assert(rPartial.openQty === 4 && rPartial.isClosed === false, 'twp 3: partial still open');

  const soldAfterDiv = runReturn('SBER', {
    positions: [],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 10,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2024-08-01',
      allocations: [{ lotId: 'S1', qty: 10, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(soldAfterDiv.currentMarketValueRub === 0, 'twp 4: closed MV 0');
  assert(soldAfterDiv.saleProceedsRub === 2800, 'twp 4: sale proceeds');
  assert(soldAfterDiv.purchaseCostRub === 2500, 'twp 4: purchase reconstructed');
  assert(soldAfterDiv.payoutsRub === 100, 'twp 4: dividend before sale');
  assert(soldAfterDiv.resultWithPayoutsRub === 400, 'twp 4: 2800+0+100-2500');
  assert(soldAfterDiv.isClosed === true && soldAfterDiv.openQty === 0, 'twp 4: closed');

  const soldBeforeDiv = runReturn('SBER', {
    positions: [],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 10,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2024-06-01',
      allocations: [{ lotId: 'S1', qty: 10, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(soldBeforeDiv.payoutsRub === 0, 'twp 5: sold before cutoff → no dividend');
  assert(soldBeforeDiv.resultWithPayoutsRub === 300, 'twp 5: sales − purchases');
  assert(soldBeforeDiv.resultWithoutPayoutsRub === 300, 'twp 5: same without payouts');

  const ofzHeld = {
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01',
      currentPrice: 98, faceValue: 1000, LAST: 1
    }],
    sales: []
  };
  const rOfz = runReturn('OFZ_26238', ofzHeld, {
    payoutsByTicker: ofzFeed([{ date: '2024-06-19', value: 42.38 }], 1000),
    bondMeta: { faceValue: 1000 }
  });
  assert(rOfz.purchaseCostRub === 9540, 'twp 6: 10×95.4%×1000');
  assert(rOfz.saleProceedsRub === 0, 'twp 6: no sale');
  assert(rOfz.currentMarketValueRub === 9800, 'twp 6: 10×98%×1000');
  assert(rOfz.couponsRub === 423.8 && rOfz.dividendsRub === 0, 'twp 6: coupon value');
  assert(rOfz.payoutsRub === 423.8, 'twp 6: payouts = coupons');
  assert(Math.abs(rOfz.resultWithoutPayoutsRub - 260) < 1e-9, 'twp 6: 9800-9540');
  assert(Math.abs(rOfz.resultWithPayoutsRub - 683.8) < 1e-9, 'twp 6: + coupon');

  const rOfzPct = runReturn('OFZ_26238', {
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 4, avgPrice: 98, buyDate: '2024-01-10',
      currentPrice: 98, faceValue: 1000
    }],
    sales: []
  }, {
    payoutsByTicker: ofzFeed([{ date: '2024-06-19', valuePct: 5.5 }], 1000),
    bondMeta: { faceValue: 1000 }
  });
  assert(rOfzPct.purchaseCostRub === 3920, 'twp 7: 4×98%×1000');
  assert(rOfzPct.couponsRub === 220 && rOfzPct.payoutsRub === 220, 'twp 7: 4 × 5.5% × 1000');

  const ofzPartial = runReturn('OFZ_26238', {
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 4, avgPrice: 95, buyDate: '2024-02-01',
      currentPrice: 97, faceValue: 1000
    }],
    sales: [{
      saleId: 'OS1',
      ticker: 'OFZ_26238',
      qty: 6,
      buyPrice: 95,
      salePrice: 98,
      saleDate: '2024-04-01',
      faceValue: 1000,
      allocations: [{ lotId: 'O1', qty: 6, buyPrice: 95, buyDate: '2024-02-01' }]
    }]
  }, {
    payoutsByTicker: ofzFeed([{ date: '2024-06-19', value: 42.38 }], 1000),
    bondMeta: { faceValue: 1000 }
  });
  assert(ofzPartial.purchaseCostRub === 9500, 'twp 8: original 10×95%×1000');
  assert(ofzPartial.saleProceedsRub === 5880, 'twp 8: 6×98%×1000');
  assert(ofzPartial.currentMarketValueRub === 3880, 'twp 8: 4×97%×1000');
  assert(ofzPartial.couponsRub === 169.52, 'twp 8: remainder 4 × 42.38');
  assert(ofzPartial.payoutsRub === 169.52, 'twp 8: coupon on remainder only');

  const emptyFeed = runReturn('SBER', {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: []
  }, {
    payoutsByTicker: { SBER: { kind: 'stock', source: 'moex', dividends: [] } }
  });
  assert(emptyFeed.payoutsRub === 0, 'twp 9: live empty feed → 0');
  assert(emptyFeed.isPartial === false, 'twp 9: not partial');
  assert(emptyFeed.warnings.length === 0, 'twp 9: no warning');

  const noFeed = runReturn('SBER', {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: []
  }, { payoutsByTicker: {} });
  assert(noFeed.payoutsRub === 0, 'twp 10: no feed totals 0');
  assert(noFeed.isPartial === true, 'twp 10: isPartial');
  assert(noFeed.warnings.some((w) => /нет данных по выплатам для SBER/.test(w)), 'twp 10: no feed warning');
  assert(noFeed.resultWithPayoutsRub === noFeed.resultWithoutPayoutsRub, 'twp 10: price result still computed');

  const noSalePrice = runReturn('SBER', {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 6, avgPrice: 250, buyDate: '2024-01-15',
      currentPrice: 280, LAST: 999
    }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 4,
      buyPrice: 250,
      saleDate: '2025-06-01',
      currentPrice: 777,
      LAST: 888,
      avgPrice: 111,
      allocations: [{ lotId: 'S1', qty: 4, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  }, {
    payoutsByTicker: sberFeed([])
  });
  assert(noSalePrice.saleProceedsRub == null, 'twp 11: missing salePrice → null proceeds');
  assert(noSalePrice.resultWithoutPayoutsRub == null && noSalePrice.resultWithPayoutsRub == null, 'twp 11: results null');
  assert(noSalePrice.returnWithPayoutsPct == null, 'twp 11: pct null');
  assert(noSalePrice.purchaseCostRub === 2500, 'twp 11: purchase still known');
  assert(noSalePrice.currentMarketValueRub === 1680, 'twp 11: remainder uses currentPrice, not LAST');
  assert(noSalePrice.isPartial === true, 'twp 11: partial');
  assert(noSalePrice.warnings.some((w) => /нет суммы продажи/.test(w)), 'twp 11: sale amount warning');

  const zeroCost = runReturn('SBER', { positions: [], sales: [] }, { payoutsByTicker: sberFeed([]) });
  assert(zeroCost.purchaseCostRub === 0, 'twp 12: no buys → 0');
  assert(zeroCost.returnWithoutPayoutsPct == null && zeroCost.returnWithPayoutsPct == null, 'twp 12: pct null');

  const noCurrent = runReturn('SBER', {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', LAST: 999
    }],
    sales: []
  }, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(noCurrent.currentMarketValueRub == null, 'twp 13: missing currentPrice → null, not 0');
  assert(noCurrent.resultWithPayoutsRub == null && noCurrent.resultWithoutPayoutsRub == null, 'twp 13: results null');
  assert(noCurrent.payoutsRub === 100, 'twp 13: payouts still counted');
  assert(noCurrent.isPartial === true, 'twp 13: partial');
  assert(noCurrent.warnings.some((w) => /нет текущей цены остатка/.test(w)), 'twp 13: market price warning');
  assert(noCurrent.currentMarketValueRub !== 9990, 'twp 13: LAST not used as market value');

  const identityPf = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 5,
      buyPrice: 250,
      salePrice: 270,
      saleDate: '2025-01-10',
      allocations: [{ lotId: 'S1', qty: 5, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  };
  const rId = runReturn('SBER', identityPf, { payoutsByTicker: sberFeed([]) });
  const realized = calc.getSaleRealizedPnl(identityPf.sales[0]).amount;
  const remainCost = calc.getPositionCostRub(identityPf.positions[0], null);
  const mv = calc.getPositionMarketValue(identityPf.positions[0], null);
  const unrealized = mv - remainCost;
  assert(rId.purchaseCostRub === 2500, 'twp 16: full purchase 10×250');
  assert(rId.saleProceedsRub === 1350, 'twp 16: 5×270');
  assert(Math.abs(rId.resultWithoutPayoutsRub - (unrealized + realized)) < 1e-9, 'twp 16: resultWithout ≈ unrealized + realized');
}

{
  // Волна 5.2: справочный результат по портфелю с учётом найденных выплат
  const NOW = '2025-12-31';
  function sberFeed(dividends) {
    return { SBER: { kind: 'stock', source: 'moex', dividends: dividends } };
  }
  function gazpFeed(dividends) {
    return { GAZP: { kind: 'stock', source: 'moex', dividends: dividends } };
  }
  function ofzFeed(coupons, faceValue) {
    return {
      OFZ_26238: {
        kind: 'bond',
        source: 'bondization',
        coupons: coupons,
        faceValue: faceValue != null ? faceValue : 1000
      }
    };
  }
  function runPf(portfolio, extra) {
    return calc.buildPortfolioReturnWithPayouts(
      portfolio,
      Object.assign({ now: NOW }, extra || {})
    );
  }

  const oneStock = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280
    }],
    sales: [],
    cashFlows: [{ id: 'cf1', amount: 9 }]
  };
  const frozenOne = JSON.stringify(oneStock);
  const oneOpts = { payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 33.3 }]) };
  const tickerOne = calc.buildTickerReturnWithPayouts('SBER', oneStock, Object.assign({ now: NOW }, oneOpts));
  const pfOne = runPf(oneStock, oneOpts);
  assert(pfOne.items.length === 1 && pfOne.items[0].ticker === 'SBER', 'pfr 1: one item');
  assert(pfOne.purchaseCostRub === tickerOne.purchaseCostRub, 'pfr 1: purchase');
  assert(pfOne.saleProceedsRub === tickerOne.saleProceedsRub, 'pfr 1: sales');
  assert(pfOne.currentMarketValueRub === tickerOne.currentMarketValueRub, 'pfr 1: MV');
  assert(pfOne.payoutsRub === tickerOne.payoutsRub, 'pfr 1: payouts');
  assert(pfOne.resultWithoutPayoutsRub === tickerOne.resultWithoutPayoutsRub, 'pfr 1: result without');
  assert(pfOne.resultWithPayoutsRub === tickerOne.resultWithPayoutsRub, 'pfr 1: result with');
  assert(pfOne.returnWithPayoutsPct === tickerOne.returnWithPayoutsPct, 'pfr 1: pct');
  assert(JSON.stringify(oneStock) === frozenOne, 'pfr 12: does not mutate portfolio');

  const twoStocks = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 4, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 300 },
      { ticker: 'GAZP', lotId: 'G1', qty: 30, avgPrice: 100, buyDate: '2024-03-01', currentPrice: 110 }
    ],
    sales: []
  };
  const twoFeeds = Object.assign({}, sberFeed([]), gazpFeed([]));
  const pfTwo = runPf(twoStocks, { payoutsByTicker: twoFeeds });
  const tSber = calc.buildTickerReturnWithPayouts('SBER', twoStocks, { now: NOW, payoutsByTicker: twoFeeds });
  const tGazp = calc.buildTickerReturnWithPayouts('GAZP', twoStocks, { now: NOW, payoutsByTicker: twoFeeds });
  assert(pfTwo.items.length === 2, 'pfr 2: two items');
  assert(pfTwo.purchaseCostRub === tSber.purchaseCostRub + tGazp.purchaseCostRub, 'pfr 2: purchase sum');
  assert(pfTwo.currentMarketValueRub === tSber.currentMarketValueRub + tGazp.currentMarketValueRub, 'pfr 2: MV sum');
  assert(pfTwo.resultWithoutPayoutsRub === tSber.resultWithoutPayoutsRub + tGazp.resultWithoutPayoutsRub, 'pfr 2: result sum');
  assert(pfTwo.purchaseCostRub === 4000, 'pfr 3: total purchase 1000+3000');
  assert(pfTwo.resultWithoutPayoutsRub === 500, 'pfr 3: total result 200+300');
  assert(Math.abs(pfTwo.returnWithoutPayoutsPct - 12.5) < 1e-9, 'pfr 3: 500/4000 = 12.5, not avg 15');
  assert(Math.abs(tSber.returnWithoutPayoutsPct - 20) < 1e-9, 'pfr 3: SBER 20%');
  assert(Math.abs(tGazp.returnWithoutPayoutsPct - 10) < 1e-9, 'pfr 3: GAZP 10%');

  const mix = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 },
      {
        ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01',
        currentPrice: 98, faceValue: 1000
      }
    ],
    sales: []
  };
  const mixFeeds = Object.assign(
    {},
    sberFeed([{ date: '2024-07-17', value: 10 }]),
    ofzFeed([{ date: '2024-06-19', value: 42.38 }], 1000)
  );
  const pfMix = runPf(mix, { payoutsByTicker: mixFeeds, bondMetaMap: { OFZ_26238: { faceValue: 1000 } } });
  assert(pfMix.purchaseCostRub === 2500 + 9540, 'pfr 4: stock + OFZ purchase');
  assert(pfMix.currentMarketValueRub === 2800 + 9800, 'pfr 4: stock + OFZ MV');
  assert(pfMix.dividendsRub === 100 && pfMix.couponsRub === 423.8, 'pfr 4: div + coupon');
  assert(pfMix.payoutsRub === 523.8, 'pfr 4: payouts sum');

  const oneNoFeed = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 },
      { ticker: 'GAZP', lotId: 'G1', qty: 2, avgPrice: 140, buyDate: '2024-01-15', currentPrice: 150 }
    ],
    sales: []
  };
  const pfNoFeed = runPf(oneNoFeed, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(pfNoFeed.isPartial === true, 'pfr 5: partial if one feed missing');
  assert(pfNoFeed.payoutsRub === 100, 'pfr 5: known payouts still summed');
  assert(pfNoFeed.warnings.some((w) => /нет данных по выплатам для GAZP/.test(w)), 'pfr 5: keep ticker warning');
  assert(pfNoFeed.resultWithPayoutsRub != null, 'pfr 5: price result still computed');

  const oneNoMv = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 },
      { ticker: 'GAZP', lotId: 'G1', qty: 2, avgPrice: 140, buyDate: '2024-01-15' }
    ],
    sales: []
  };
  const pfNoMv = runPf(oneNoMv, { payoutsByTicker: Object.assign({}, sberFeed([]), gazpFeed([])) });
  assert(pfNoMv.currentMarketValueRub == null, 'pfr 6: MV null if one ticker null');
  assert(pfNoMv.resultWithoutPayoutsRub == null && pfNoMv.resultWithPayoutsRub == null, 'pfr 6: results null');
  assert(pfNoMv.returnWithPayoutsPct == null && pfNoMv.returnWithoutPayoutsPct == null, 'pfr 6: pct null');
  assert(pfNoMv.isPartial === true, 'pfr 6: isPartial');
  assert(pfNoMv.purchaseCostRub === 2500 + 280, 'pfr 6: known purchase still summed');

  const oneNoSale = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 6, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 },
      { ticker: 'GAZP', lotId: 'G1', qty: 2, avgPrice: 140, buyDate: '2024-01-15', currentPrice: 150 }
    ],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 4,
      buyPrice: 250,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'S1', qty: 4, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  };
  const pfNoSale = runPf(oneNoSale, { payoutsByTicker: Object.assign({}, sberFeed([]), gazpFeed([])) });
  assert(pfNoSale.saleProceedsRub == null, 'pfr 7: saleProceeds null if one ticker null');
  assert(pfNoSale.resultWithoutPayoutsRub == null && pfNoSale.resultWithPayoutsRub == null, 'pfr 7: results null');
  assert(pfNoSale.returnWithPayoutsPct == null, 'pfr 7: pct null');
  assert(pfNoSale.isPartial === true, 'pfr 7: isPartial');

  const emptyPf = runPf({ positions: [], sales: [] }, { payoutsByTicker: {} });
  assert(emptyPf.items.length === 0, 'pfr 8: empty items');
  assert(emptyPf.purchaseCostRub === 0 && emptyPf.saleProceedsRub === 0, 'pfr 8: zeros cost/sales');
  assert(emptyPf.currentMarketValueRub === 0 && emptyPf.payoutsRub === 0, 'pfr 8: zeros MV/payouts');
  assert(emptyPf.resultWithoutPayoutsRub === 0 && emptyPf.resultWithPayoutsRub === 0, 'pfr 8: zeros result');
  assert(emptyPf.returnWithoutPayoutsPct == null && emptyPf.returnWithPayoutsPct == null, 'pfr 8: pct null');
  assert(emptyPf.isPartial === false && emptyPf.warnings.length === 0, 'pfr 8: no warning');

  const closedOnly = {
    positions: [],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 10,
      buyPrice: 250,
      salePrice: 280,
      saleDate: '2024-08-01',
      allocations: [{ lotId: 'S1', qty: 10, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  };
  const pfClosed = runPf(closedOnly, { payoutsByTicker: sberFeed([]) });
  assert(pfClosed.currentMarketValueRub === 0, 'pfr 9: closed MV 0');
  assert(pfClosed.purchaseCostRub === 2500, 'pfr 9: purchase included');
  assert(pfClosed.saleProceedsRub === 2800, 'pfr 9: sales included');
  assert(pfClosed.resultWithoutPayoutsRub === 300, 'pfr 9: sales − purchase');
  assert(pfClosed.items[0].isClosed === true, 'pfr 9: ticker closed');

  const pfClosedDiv = runPf(closedOnly, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(pfClosedDiv.payoutsRub === 100, 'pfr 10: dividend during holding');
  assert(pfClosedDiv.resultWithPayoutsRub === 400, 'pfr 10: 2800+0+100-2500');

  const withIndex = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 },
      { ticker: 'IMOEX', lotId: 'I1', qty: 1, avgPrice: 3000, buyDate: '2024-01-15', currentPrice: 3100 },
      { ticker: 'MOEX', lotId: 'M1', qty: 1, avgPrice: 100, buyDate: '2024-01-15', currentPrice: 110 },
      { ticker: 'INDEX', lotId: 'X1', qty: 1, avgPrice: 1, buyDate: '2024-01-15', currentPrice: 1 }
    ],
    sales: []
  };
  const pfSkip = runPf(withIndex, { payoutsByTicker: sberFeed([]) });
  assert(pfSkip.items.length === 1 && pfSkip.items[0].ticker === 'SBER', 'pfr 11: skip IMOEX/MOEX/INDEX');
  assert(pfSkip.purchaseCostRub === 2500, 'pfr 11: only SBER purchase');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const beforePf = {
    positions: [
      { ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3200, buyDate: '2025-06-01', currentPrice: 255 }
    ],
    sales: []
  };
  const snap = JSON.stringify(beforePf);
  const ev = calc.portfolioTickerNeedsSplitWarning('T', beforePf, events);
  assert(ev && ev.ticker === 'T', 'split warn: buyDate before effectiveDate');
  assert(JSON.stringify(beforePf) === snap, 'split warn: portfolio JSON not mutated');
  const html = calc.buildPortfolioSplitWarningHtml('T', beforePf, events);
  assert(/дробление акций/.test(html), 'split warn html present');
  assert(/T:/.test(html), 'split warn html: ticker T');
  assert(/1:10/.test(html), 'split warn html: ratio 1:10');
  assert(/17\.04\.2026/.test(html), 'split warn html: date 17.04.2026');
  assert(/pf-wide-warning/.test(html), 'split warn html: wide class');

  const afterPf = {
    positions: [
      { ticker: 'T', lotId: 'T1', qty: 10, avgPrice: 320, buyDate: '2026-05-01', currentPrice: 255 }
    ],
    sales: []
  };
  assert(calc.portfolioTickerNeedsSplitWarning('T', afterPf, events) == null, 'split warn: buyDate after effectiveDate → no');

  const aliasPf = {
    positions: [
      { ticker: 'TCSG', lotId: 'T1', qty: 1, avgPrice: 3200, buyDate: '2025-01-10', currentPrice: 255 }
    ],
    sales: []
  };
  assert(calc.portfolioTickerNeedsSplitWarning('TCSG', aliasPf, events), 'split warn: alias TCSG');
  assert(calc.portfolioTickerNeedsSplitWarning('T', aliasPf, events), 'split warn: query T finds TCSG lot');
  const aliasHtml = calc.buildPortfolioSplitWarningHtml('TCSG', aliasPf, events);
  assert(/TCSG \/ T/.test(aliasHtml), 'split warn html: alias TCSG / T');
  assert(/1:10/.test(aliasHtml) && /17\.04\.2026/.test(aliasHtml), 'split warn html: alias keeps ratio/date');

  const closedPf = {
    positions: [],
    sales: [{
      saleId: 'S1',
      ticker: 'T',
      qty: 1,
      buyPrice: 3200,
      salePrice: 255,
      saleDate: '2026-05-10',
      allocations: [{ lotId: 'T1', qty: 1, buyPrice: 3200, buyDate: '2025-03-01' }]
    }]
  };
  assert(calc.portfolioTickerNeedsSplitWarning('T', closedPf, events), 'split warn: closed position with old buy');
  assert(calc.portfolioTickerNeedsSplitWarning('SBER', {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 250, buyDate: '2024-01-01' }],
    sales: []
  }, events) == null, 'split warn: other ticker no');
  const sberHtml = calc.buildPortfolioSplitWarningHtml('SBER', {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 250, buyDate: '2024-01-01' }],
    sales: []
  }, events);
  assert(sberHtml === '', 'split warn html: no warning for ordinary ticker');

  const manyPf = {
    positions: [
      { ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3200, buyDate: '2025-06-01', currentPrice: 255 },
      { ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 15000, buyDate: '2024-06-01', currentPrice: 1800 },
      { ticker: 'T', lotId: 'T2', qty: 1, avgPrice: 3100, buyDate: '2025-07-01', currentPrice: 255 }
    ],
    sales: []
  };
  const manyHtml = calc.buildPortfolioSplitWarningsForTickersHtml(['T', 'T', 'PLZL'], manyPf);
  assert(/Сплиты в портфеле/.test(manyHtml), 'split warn many: heading');
  assert((manyHtml.match(/\bT\b/g) || []).length >= 1, 'split warn many: T present');
  assert(/PLZL/.test(manyHtml), 'split warn many: PLZL present');
  assert((manyHtml.match(/1:10/g) || []).length >= 2, 'split warn many: both ratios');
  assert(!/T, T/.test(manyHtml), 'split warn many: no duplicated T, T');

  const onePartial = calc.formatPayoutPartialWarningText(['SBER'], 'FALLBACK');
  assert(/по бумаге SBER/.test(onePartial), 'partial warn: single ticker');
  const twoPartial = calc.formatPayoutPartialWarningText(['T', 'T', 'PLZL'], 'FALLBACK');
  assert(/по бумагам: T, PLZL/.test(twoPartial), 'partial warn: unique T, PLZL');
  assert(!/T, T/.test(twoPartial), 'partial warn: no duplicate ticker');
  const manyPartial = calc.formatPayoutPartialWarningText(
    ['T', 'PLZL', 'GMKN', 'SBER', 'LKOH', 'VTBR', 'GAZP'],
    'FALLBACK'
  );
  assert(/по бумагам: T, PLZL, GMKN, SBER, LKOH и ещё 2/.test(manyPartial), 'partial warn: cap at 5 + remainder');
  assert(calc.formatPayoutPartialWarningText([], 'FALLBACK') === 'FALLBACK', 'partial warn: empty → fallback');
  const parsed = calc.collectPayoutPartialTickersFromWarnings([
    'нет данных по выплатам для SBER',
    'нет данных по выплатам для SBER',
    'GAZP: дивиденд без суммы на 1 акцию',
    'нет данных по купонам для OFZ_26238'
  ]);
  assert(parsed.join(',') === 'SBER,GAZP,OFZ_26238', 'partial warn parse: unique tickers from warnings');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const title = 'По бумаге было дробление акций. До проверки количества и средней цены результат может быть некорректным.';

  function lotGroup(ticker, lots) {
    return { ticker, lots, weightedAvg: lots[0] && lots[0].avgPrice };
  }

  function assertSplitDisplay(ticker, pf) {
    const prefix = ticker;
    const snap = JSON.stringify(pf);
    assert(calc.isPortfolioTickerSplitAffected(ticker, pf, events) === true, prefix + ': split-affected');
    const lots = pf.positions.filter((p) => String(p.ticker).toUpperCase() === ticker);
    const rowHtml = calc.buildPortfolioLotRow(lots[0], lotGroup(ticker, lots), {
      splitAffected: true,
      lotIndex: 0,
      rowSpan: lots.length,
      positions: pf.positions,
      sales: pf.sales
    });
    assert(/с учётом сплита/.test(rowHtml), prefix + ': row split-aware badge');
    assert(/pf-split-badge/.test(rowHtml), prefix + ': row split badge');
    assert(!/-99\.41%/.test(rowHtml) && !/-99,41%/.test(rowHtml), prefix + ': row hides −99.41%');
    const sectionHtml = calc.buildPortfolioSectionRows(pf.positions, 'stocks', {}, pf.sales);
    assert(/с учётом сплита/.test(sectionHtml), prefix + ': section row split-aware');
    assert(!/-99\.41%/.test(sectionHtml), prefix + ': section hides −99.41%');
    const detail = calc.buildPortfolioTickerDetailHtml(ticker, pf.positions, pf.sales, null, false);
    assert(/Результат по текущим ценам/.test(detail), prefix + ': detail kpi label');
    assert(/с учётом сплита/.test(detail), prefix + ': detail split-aware badge');
    const kpiChunk = detail.split('Результат по текущим ценам')[1].split('Зафиксированный результат')[0];
    assert(!/-99\.41/.test(kpiChunk), prefix + ': detail kpi not −99.41');
    const card = calc.buildPortfolioMobileCardHtml(lots[0], null, 1, pf.positions, pf.sales);
    assert(/с учётом сплита/.test(card) && /pf-split-badge/.test(card), prefix + ': mobile card split-aware');
    assert(!/-99\.41%/.test(card), prefix + ': mobile card hides −99.41%');
    assert(JSON.stringify(pf) === snap, prefix + ': portfolio JSON not mutated');
    assert(lots[0].qty === pf.positions[0].qty && lots[0].avgPrice === pf.positions[0].avgPrice, prefix + ': qty/avgPrice untouched');
  }

  const gmknPf = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 1, avgPrice: 16000, buyDate: '2024-01-10', currentPrice: 95 },
      { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 100, buyDate: '2024-06-01', currentPrice: 95 }
    ],
    sales: []
  };
  const gmknRet = calc.getLotReturnPct(gmknPf.positions[0]);
  assert(gmknRet != null && Math.abs(gmknRet + 99.40625) < 1e-6, 'GMKN underlying lot return still ≈ −99.41%');
  assertSplitDisplay('GMKN', gmknPf);
  const gmknWarn = calc.buildPortfolioSplitWarningHtml('GMKN', gmknPf, events);
  assert(/GMKN/.test(gmknWarn) && /1:100/.test(gmknWarn) && /08\.04\.2024/.test(gmknWarn), 'GMKN warning: ticker, 1:100, 08.04.2024');
  const gmknDetail = calc.buildPortfolioTickerDetailHtml('GMKN', gmknPf.positions, gmknPf.sales, null, false);
  assert(/GMKN/.test(gmknDetail) && /1:100/.test(gmknDetail) && /08\.04\.2024/.test(gmknDetail), 'GMKN detail warning: ticker, 1:100, 08.04.2024');

  const tPf = {
    positions: [
      { ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3200, buyDate: '2025-06-01', currentPrice: 255 }
    ],
    sales: []
  };
  assertSplitDisplay('T', tPf);
  const tWarn = calc.buildPortfolioSplitWarningHtml('T', tPf, events);
  assert(/T:/.test(tWarn) && /1:10/.test(tWarn) && /17\.04\.2026/.test(tWarn), 'T warning: ticker, 1:10, 17.04.2026');

  const plzlPf = {
    positions: [
      { ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 15000, buyDate: '2024-06-01', currentPrice: 1800 }
    ],
    sales: []
  };
  assertSplitDisplay('PLZL', plzlPf);
  const plzlWarn = calc.buildPortfolioSplitWarningHtml('PLZL', plzlPf, events);
  assert(/PLZL/.test(plzlWarn) && /1:10/.test(plzlWarn) && /27\.03\.2025/.test(plzlWarn), 'PLZL warning: ticker, 1:10, 27.03.2025');

  const sberPf = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 200 }
    ],
    sales: []
  };
  assert(calc.isPortfolioTickerSplitAffected('SBER', sberPf, events) === false, 'SBER: not split-affected');
  const sberRow = calc.buildPortfolioLotRow(sberPf.positions[0], lotGroup('SBER', sberPf.positions), {
    lotIndex: 0
  });
  assert(/pnl-neg/.test(sberRow), 'SBER: ordinary loss color');
  assert(/-20\.00%/.test(sberRow), 'SBER: ordinary percent shown');
  assert(!/требует проверки/.test(sberRow) && !/pf-split-badge/.test(sberRow), 'SBER: no split badge');
  const sberDetail = calc.buildPortfolioTickerDetailHtml('SBER', sberPf.positions, sberPf.sales, null, false);
  const sberKpi = sberDetail.split('Результат по текущим ценам')[1].split('Зафиксированный результат')[0];
  assert(/pnl-neg/.test(sberKpi), 'SBER detail: ordinary pnl color');
  assert(!/требует проверки/.test(sberKpi), 'SBER detail: no split state');

  const tAfterPf = {
    positions: [
      { ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 320, buyDate: '2026-05-01', currentPrice: 255 }
    ],
    sales: []
  };
  assert(calc.isPortfolioTickerSplitAffected('T', tAfterPf, events) === false, 'T after split: not split-affected');
  const tAfterRow = calc.buildPortfolioLotRow(tAfterPf.positions[0], lotGroup('T', tAfterPf.positions), {
    lotIndex: 0
  });
  assert(/pnl-neg/.test(tAfterRow), 'T after split: ordinary loss color');
  assert(!/требует проверки/.test(tAfterRow), 'T after split: percent shown as usual');
  const tAfterSection = calc.buildPortfolioSectionRows(tAfterPf.positions, 'stocks', {}, tAfterPf.sales);
  assert(!/требует проверки/.test(tAfterSection), 'T after split: section uses ordinary PnL');
  assert(/%/.test(tAfterSection), 'T after split: section still has percent');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const opts = { splitEvents: events, currentDate: '2026-09-04' };

  function scaleOf(lot, ticker, extra) {
    return calc.diagnoseLotShareScale(lot, ticker, Object.assign({}, opts, extra || {}));
  }

  const sberBefore = { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2021-06-04', currentPrice: 280 };
  const sberAfter = { ticker: 'SBER', lotId: 'S2', qty: 10, avgPrice: 250, buyDate: '2026-09-04', currentPrice: 280 };
  const sberSnap = JSON.stringify({ positions: [sberBefore, sberAfter], sales: [] });
  let d = scaleOf(sberBefore, 'SBER');
  assert(d.scale === 'n/a' && d.confidence === 'high' && d.factor === 1, 'lot scale: SBER before → n/a high');
  d = scaleOf(sberAfter, 'SBER');
  assert(d.scale === 'n/a' && d.confidence === 'high', 'lot scale: SBER after → n/a high');

  const gmknHist = { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 };
  const gmknHistSnap = JSON.stringify(gmknHist);
  d = scaleOf(gmknHist, 'GMKN');
  assert(d.scale === 'historical', 'lot scale: GMKN 22000/130 → historical');
  assert(d.confidence === 'high' || d.confidence === 'partial', 'lot scale: GMKN historical confidence high|partial');
  assert(d.factor === 100 && d.splitEvent && d.splitEvent.ticker === 'GMKN', 'lot scale: GMKN historical factor 100');
  assert(JSON.stringify(gmknHist) === gmknHistSnap, 'lot scale: GMKN historical lot not mutated');

  const gmknCurr = { ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 130 };
  d = scaleOf(gmknCurr, 'GMKN');
  assert(d.scale === 'current', 'lot scale: GMKN 220/130 → current');
  assert(d.confidence === 'high' || d.confidence === 'partial', 'lot scale: GMKN current confidence high|partial');
  assert(d.factor === 100, 'lot scale: GMKN current still knows factor 100');

  const gmknAfter = { ticker: 'GMKN', lotId: 'G3', qty: 10, avgPrice: 130, buyDate: '2026-09-04', currentPrice: 130 };
  d = scaleOf(gmknAfter, 'GMKN');
  assert(d.scale === 'current' && d.confidence === 'high', 'lot scale: GMKN after split → current high');
  assert(d.reason.indexOf('после сплита') !== -1, 'lot scale: GMKN after split reason');

  const tHist = { ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3126, buyDate: '2025-12-01', currentPrice: 262 };
  d = scaleOf(tHist, 'T');
  assert(d.scale === 'historical', 'lot scale: T 3126/262 → historical');
  assert(d.factor === 10, 'lot scale: T historical factor 10');

  const tCurr = { ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262 };
  d = scaleOf(tCurr, 'T');
  assert(d.scale === 'current', 'lot scale: T 312/262 → current');

  const plzlHist = { ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 19000, buyDate: '2024-06-01', currentPrice: 1900 };
  d = scaleOf(plzlHist, 'PLZL');
  assert(d.scale === 'historical' && d.confidence === 'high', 'lot scale: PLZL 19000/1900 → historical high');
  assert(d.factor === 10, 'lot scale: PLZL factor 10');

  const noDate = { ticker: 'GMKN', lotId: 'GX', qty: 10, avgPrice: 22000, currentPrice: 130 };
  const noDateSnap = JSON.stringify(noDate);
  d = scaleOf(noDate, 'GMKN');
  assert(d.scale === 'unknown' && d.confidence === 'unknown', 'lot scale: missing buyDate → unknown');
  assert((d.warnings || []).some((w) => /нет корректной даты покупки/.test(w)), 'lot scale: missing date warning');
  assert(JSON.stringify(noDate) === noDateSnap, 'lot scale: missing date lot not mutated');

  const badDate = { ticker: 'GMKN', lotId: 'GY', qty: 10, avgPrice: 22000, buyDate: 'не дата', currentPrice: 130 };
  d = scaleOf(badDate, 'GMKN');
  assert(d.scale === 'unknown' && d.confidence === 'unknown', 'lot scale: invalid buyDate → unknown');

  const ofz = { ticker: 'SU26238RMFS9', lotId: 'B1', qty: 10, avgPrice: 97.5, buyDate: '2021-06-04', currentPrice: 98 };
  d = scaleOf(ofz, 'SU26238RMFS9');
  assert(d.scale === 'n/a' && d.confidence === 'high', 'lot scale: OFZ → n/a');

  const pf = { positions: [gmknHist, tHist], sales: [] };
  const pfSnap = JSON.stringify(pf);
  scaleOf(pf.positions[0], 'GMKN');
  scaleOf(pf.positions[1], 'T');
  assert(JSON.stringify(pf) === pfSnap, 'lot scale: portfolio JSON not mutated');
  assert(JSON.stringify({ positions: [sberBefore, sberAfter], sales: [] }) === sberSnap, 'lot scale: SBER fixture untouched');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const now = { splitEvents: events, currentDate: '2026-09-04' };

  function held(ticker, pf, target, extra) {
    return calc.getSplitAwareQtyHeldOnDate(ticker, pf, target, Object.assign({}, now, extra || {}));
  }

  const sberPf = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 7, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280
    }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 3,
      buyPrice: 250,
      salePrice: 260,
      saleDate: '2024-06-01',
      allocations: [{ lotId: 'S1', qty: 3, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  };
  const sberSnap = JSON.stringify(sberPf);
  let r = held('SBER', sberPf, '2024-12-31');
  assert(r.qty === 7 && r.confidence === 'high', 'qtyHeld: SBER 10−3 → 7 high');
  assert(r.appliedSplits.length === 0, 'qtyHeld: SBER no splits');
  assert(JSON.stringify(sberPf) === sberSnap, 'qtyHeld: SBER JSON not mutated');

  const gmknHistPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  const gmknHistSnap = JSON.stringify(gmknHistPf);
  r = held('GMKN', gmknHistPf, '2026-09-04');
  assert(r.qty === 1000, 'qtyHeld: GMKN historical after split → 1000');
  assert(r.confidence === 'high' || r.confidence === 'partial', 'qtyHeld: GMKN historical confidence');
  assert(r.appliedSplits.some((ev) => ev.effectiveDate === '2024-04-08' && Number(ev.ratio) === 100), 'qtyHeld: GMKN applied 1:100');
  assert(JSON.stringify(gmknHistPf) === gmknHistSnap, 'qtyHeld: GMKN historical JSON not mutated');
  assert(gmknHistPf.positions[0].qty === 10 && gmknHistPf.positions[0].avgPrice === 22000, 'qtyHeld: GMKN qty/avgPrice untouched');

  const gmknCurrPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  r = held('GMKN', gmknCurrPf, '2026-09-04');
  assert(r.qty === 1000, 'qtyHeld: GMKN current after split → 1000 not 100000');

  r = held('GMKN', gmknHistPf, '2023-12-01');
  assert(r.qty === 10, 'qtyHeld: GMKN historical before split → 10');

  r = held('GMKN', gmknHistPf, '2024-04-08');
  assert(r.qty === 1000, 'qtyHeld: GMKN same-day split → 1000');

  const gmknAfterPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G3', qty: 10, avgPrice: 130, buyDate: '2026-09-04', currentPrice: 130
    }],
    sales: []
  };
  r = held('GMKN', gmknAfterPf, '2026-09-04');
  assert(r.qty === 10 && r.confidence === 'high', 'qtyHeld: GMKN lot after split → 10');

  const gmknMixedPf = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 },
      { ticker: 'GMKN', lotId: 'G4', qty: 10, avgPrice: 130, buyDate: '2026-09-04', currentPrice: 130 }
    ],
    sales: []
  };
  const mixedSnap = JSON.stringify(gmknMixedPf);
  r = held('GMKN', gmknMixedPf, '2026-09-04');
  assert(r.qty === 1010, 'qtyHeld: GMKN mixed historical+after → 1010');
  assert(JSON.stringify(gmknMixedPf) === mixedSnap, 'qtyHeld: mixed JSON not mutated');

  const tHistPf = {
    positions: [{
      ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3126, buyDate: '2025-12-01', currentPrice: 262
    }],
    sales: []
  };
  r = held('T', tHistPf, '2026-09-04');
  assert(r.qty === 10, 'qtyHeld: T historical after split → 10');

  const tCurrPf = {
    positions: [{
      ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262
    }],
    sales: []
  };
  r = held('T', tCurrPf, '2026-09-04');
  assert(r.qty === 10, 'qtyHeld: T current after split → 10');

  const unknownPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'GX', qty: 10, avgPrice: 800, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  r = held('GMKN', unknownPf, '2026-09-04');
  assert(r.confidence === 'unknown' || r.confidence === 'partial', 'qtyHeld: unknown scale confidence');
  assert(r.qty === 0, 'qtyHeld: unknown scale not included in qty');
  assert((r.warnings || []).some((w) => /шкала лота не определена/.test(w)), 'qtyHeld: unknown scale warning');

  const gmknSalePf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: [{
      saleId: 'SALE_G',
      ticker: 'GMKN',
      qty: 200,
      buyPrice: 22000,
      salePrice: 130,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'G1', qty: 200, buyPrice: 22000, buyDate: '2021-06-04' }]
    }]
  };
  const saleSnap = JSON.stringify(gmknSalePf);
  r = held('GMKN', gmknSalePf, '2026-09-04');
  assert(r.qty === 800, 'qtyHeld: GMKN historical 10×100 − 200 → 800');
  assert(JSON.stringify(gmknSalePf) === saleSnap, 'qtyHeld: sale fixture JSON not mutated');

  r = held('GMKN', gmknSalePf, '2024-12-01');
  assert(r.qty === 1000, 'qtyHeld: sale after targetDate does not reduce qty');

  const ofzPf = {
    positions: [{
      ticker: 'SU26238RMFS9', lotId: 'B1', qty: 10, avgPrice: 97.5, buyDate: '2021-06-04', currentPrice: 98
    }],
    sales: []
  };
  r = held('SU26238RMFS9', ofzPf, '2026-09-04');
  assert(r.qty === 10 && r.confidence === 'high' && r.appliedSplits.length === 0, 'qtyHeld: OFZ no split logic');

  const prodCatalogText = fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8');
  assert(!/FAKE_SPLIT/.test(prodCatalogText), 'qtyHeld generic: production catalog has no FAKE_SPLIT');
  const fakeRaw = {
    ticker: 'FAKE_SPLIT',
    aliases: ['FAKE'],
    isin: 'TEST000FAKE0',
    effectiveDate: '2030-01-15',
    ratio: 5,
    type: 'split',
    note: 'Synthetic future split for generic contract tests',
    source: 'test'
  };
  const fakeEvents = calc.sandbox.parseSplitEventsCatalog({
    version: 1,
    events: (JSON.parse(prodCatalogText).events || []).concat([fakeRaw])
  });
  const fakeOpts = { splitEvents: fakeEvents, currentDate: '2031-01-01' };
  const fakeHistPf = {
    positions: [{
      ticker: 'FAKE_SPLIT', lotId: 'F1', qty: 2, avgPrice: 500, buyDate: '2029-06-01', currentPrice: 90
    }],
    sales: []
  };
  const fakeHistSnap = JSON.stringify(fakeHistPf);
  r = calc.getSplitAwareQtyHeldOnDate('FAKE_SPLIT', fakeHistPf, '2031-01-01', fakeOpts);
  assert(r.qty === 10, 'qtyHeld generic: FAKE_SPLIT historical 2×5 → 10');
  assert(r.appliedSplits.some((ev) => ev.effectiveDate === '2030-01-15' && Number(ev.ratio) === 5), 'qtyHeld generic: applied ratio 5');
  assert(JSON.stringify(fakeHistPf) === fakeHistSnap, 'qtyHeld generic: JSON not mutated');
  r = calc.getSplitAwareQtyHeldOnDate('FAKE_SPLIT', fakeHistPf, '2029-12-01', fakeOpts);
  assert(r.qty === 2, 'qtyHeld generic: before split → 2');
  const fakeCurrPf = {
    positions: [{
      ticker: 'FAKE_SPLIT', lotId: 'F2', qty: 10, avgPrice: 95, buyDate: '2029-06-01', currentPrice: 90
    }],
    sales: []
  };
  r = calc.getSplitAwareQtyHeldOnDate('FAKE_SPLIT', fakeCurrPf, '2031-01-01', fakeOpts);
  assert(r.qty === 10, 'qtyHeld generic: current lot not 50');
  const fakeScale = calc.diagnoseLotShareScale(fakeHistPf.positions[0], 'FAKE_SPLIT', fakeOpts);
  assert(fakeScale.scale === 'historical', 'lot scale generic: FAKE_SPLIT historical');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-09-04';
  function metrics(ticker, pf, extra) {
    return calc.getSplitAwareCurrentPositionMetrics(
      ticker,
      pf,
      Object.assign({ splitEvents: events, now: NOW, currentDate: NOW }, extra || {})
    );
  }
  function almost(a, b, eps, msg) {
    assert(Math.abs(Number(a) - Number(b)) < (eps || 0.02), msg);
  }

  assert(typeof calc.getSplitAwareCurrentPositionMetrics === 'function', 'metrics: helper exported');

  const sberPf = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: []
  };
  const sberSnap = JSON.stringify(sberPf);
  let m = metrics('SBER', sberPf);
  assert(m.splitAdjusted === false && m.confidence === 'high', 'metrics: SBER no split');
  almost(m.currentQty, 10, 1e-9, 'metrics: SBER qty 10');
  almost(m.currentMarketValueRub, 2800, 0.01, 'metrics: SBER MV 2800');
  almost(m.remainingCostRub, 2500, 0.01, 'metrics: SBER cost 2500');
  almost(m.unrealizedPnlRub, 300, 0.01, 'metrics: SBER pnl 300');
  almost(m.unrealizedPnlPct, 12, 0.01, 'metrics: SBER pct 12');
  assert(JSON.stringify(sberPf) === sberSnap, 'metrics: SBER JSON not mutated');

  const ofzPf = {
    positions: [{ ticker: 'SU26238RMFS9', lotId: 'B1', qty: 10, avgPrice: 97.5, buyDate: '2023-01-01', currentPrice: 98, faceValue: 1000 }],
    sales: []
  };
  const ofzSnap = JSON.stringify(ofzPf);
  m = metrics('SU26238RMFS9', ofzPf);
  assert(m.splitAdjusted === false && m.appliedSplits.length === 0, 'metrics: OFZ no split logic');
  almost(m.currentMarketValueRub, 9800, 0.01, 'metrics: OFZ MV 9800');
  almost(m.remainingCostRub, 9750, 0.01, 'metrics: OFZ cost 9750');
  assert(JSON.stringify(ofzPf) === ofzSnap, 'metrics: OFZ JSON not mutated');

  const gmknHistPf = {
    positions: [{ ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92 }],
    sales: []
  };
  const gmknHistSnap = JSON.stringify(gmknHistPf);
  m = metrics('GMKN', gmknHistPf);
  assert(m.splitAdjusted === true, 'metrics: GMKN hist splitAdjusted');
  almost(m.currentQty, 1000, 1e-6, 'metrics: GMKN hist qty 1000');
  almost(m.currentMarketValueRub, 129920, 0.02, 'metrics: GMKN hist MV 129920');
  almost(m.remainingCostRub, 220000, 0.02, 'metrics: GMKN hist cost 220000');
  almost(m.unrealizedPnlRub, -90080, 0.05, 'metrics: GMKN hist pnl -90080');
  almost(m.unrealizedPnlPct, -90080 / 220000 * 100, 0.05, 'metrics: GMKN hist pct not -98');
  assert(Math.abs(m.unrealizedPnlPct) < 50, 'metrics: GMKN hist not -98%');
  assert(JSON.stringify(gmknHistPf) === gmknHistSnap, 'metrics: GMKN hist JSON not mutated');
  assert(gmknHistPf.positions[0].qty === 10 && gmknHistPf.positions[0].avgPrice === 22000, 'metrics: qty/avgPrice untouched');

  const gmknCurrPf = {
    positions: [{ ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 129.92 }],
    sales: []
  };
  m = metrics('GMKN', gmknCurrPf);
  almost(m.currentQty, 1000, 1e-6, 'metrics: GMKN current qty 1000 not 100000');
  almost(m.currentMarketValueRub, 129920, 0.02, 'metrics: GMKN current MV 129920');
  almost(m.remainingCostRub, 220000, 0.02, 'metrics: GMKN current cost 220000');

  const gmknMixedPf = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92 },
      { ticker: 'GMKN', lotId: 'G4', qty: 10, avgPrice: 129.74, buyDate: '2026-09-04', currentPrice: 129.92 }
    ],
    sales: []
  };
  const mixedSnap = JSON.stringify(gmknMixedPf);
  m = metrics('GMKN', gmknMixedPf);
  almost(m.currentQty, 1010, 1e-6, 'metrics: GMKN mixed qty 1010');
  almost(m.currentMarketValueRub, 131219.20, 0.05, 'metrics: GMKN mixed MV 131219.20');
  almost(m.remainingCostRub, 221297.40, 0.05, 'metrics: GMKN mixed cost 221297.40');
  almost(m.unrealizedPnlRub, -90078.20, 0.05, 'metrics: GMKN mixed pnl -90078.20');
  almost(m.unrealizedPnlPct, -40.70, 0.05, 'metrics: GMKN mixed pct ≈ -40.70');
  assert(JSON.stringify(gmknMixedPf) === mixedSnap, 'metrics: mixed JSON not mutated');

  const tHistPf = {
    positions: [{ ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3126, buyDate: '2025-12-01', currentPrice: 262 }],
    sales: []
  };
  m = metrics('T', tHistPf);
  almost(m.currentQty, 10, 1e-6, 'metrics: T hist qty 10');
  almost(m.currentMarketValueRub, 2620, 0.02, 'metrics: T hist MV 2620');
  almost(m.lots[0] && m.lots[0].adjustedAvgPrice, 312.6, 0.01, 'metrics: T hist adj avg 312.6');

  const tCurrPf = {
    positions: [{ ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262 }],
    sales: []
  };
  m = metrics('T', tCurrPf);
  almost(m.currentQty, 10, 1e-6, 'metrics: T current qty 10 not 100');
  almost(m.currentMarketValueRub, 2620, 0.02, 'metrics: T current MV 2620');

  const plzlPf = {
    positions: [{ ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 19000, buyDate: '2024-06-01', currentPrice: 1900 }],
    sales: []
  };
  m = metrics('PLZL', plzlPf);
  almost(m.currentQty, 10, 1e-6, 'metrics: PLZL hist qty ×10');
  almost(m.currentMarketValueRub, 19000, 0.02, 'metrics: PLZL MV 10×1900');

  const unknownPf = {
    positions: [{ ticker: 'GMKN', lotId: 'GX', qty: 10, avgPrice: 800, buyDate: '2021-06-04', currentPrice: 130 }],
    sales: []
  };
  const unknownSnap = JSON.stringify(unknownPf);
  m = metrics('GMKN', unknownPf);
  assert(m.confidence === 'unknown' || m.currentMarketValueRub == null, 'metrics: unknown not a confident MV');
  assert(m.unrealizedPnlRub == null || m.confidence === 'unknown', 'metrics: unknown pnl not confident');
  assert((m.warnings || []).some((w) => /GMKN/.test(w)), 'metrics: unknown warning has ticker');
  assert(JSON.stringify(unknownPf) === unknownSnap, 'metrics: unknown JSON not mutated');

  const gmknSalePf = {
    positions: [{ ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92 }],
    sales: [{
      saleId: 'SALE_G',
      ticker: 'GMKN',
      qty: 200,
      buyPrice: 22000,
      salePrice: 130,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'G1', qty: 200, buyPrice: 22000, buyDate: '2021-06-04' }]
    }]
  };
  m = metrics('GMKN', gmknSalePf);
  almost(m.currentQty, 800, 1e-6, 'metrics: sale 200 new → qty 800');
  almost(m.currentMarketValueRub, 800 * 129.92, 0.05, 'metrics: sale MV 800×129.92');

  const prodCatalogText = fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8');
  const fakeRaw = {
    ticker: 'FAKE_SPLIT',
    aliases: ['FAKE'],
    isin: 'TEST000FAKE0',
    effectiveDate: '2030-01-15',
    ratio: 5,
    type: 'split',
    note: 'Synthetic future split for generic contract tests',
    source: 'test'
  };
  const fakeEvents = calc.sandbox.parseSplitEventsCatalog({
    version: 1,
    events: (JSON.parse(prodCatalogText).events || []).concat([fakeRaw])
  });
  const fakeHistPf = {
    positions: [{ ticker: 'FAKE_SPLIT', lotId: 'F1', qty: 2, avgPrice: 500, buyDate: '2029-06-01', currentPrice: 90 }],
    sales: []
  };
  const fakeSnap = JSON.stringify(fakeHistPf);
  m = calc.getSplitAwareCurrentPositionMetrics('FAKE_SPLIT', fakeHistPf, {
    splitEvents: fakeEvents, now: '2031-01-01', currentDate: '2031-01-01'
  });
  almost(m.currentQty, 10, 1e-6, 'metrics generic: FAKE_SPLIT 2×5 → 10');
  almost(m.currentMarketValueRub, 900, 0.02, 'metrics generic: FAKE_SPLIT MV 900');
  almost(m.remainingCostRub, 1000, 0.02, 'metrics generic: FAKE_SPLIT cost 1000');
  assert(JSON.stringify(fakeHistPf) === fakeSnap, 'metrics generic: JSON not mutated');
}

{
  // Волна 5.3: UI v1 справочного результата в «Подробнее»
  const sb = calc.sandbox;
  const cache = calc.getPfPayoutFeedsCache();
  const pf = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280
    }],
    sales: []
  };
  const snap = JSON.stringify(pf);
  sb.getPortfolio = () => pf;

  cache.status = 'idle';
  cache.data = null;
  cache.error = null;
  cache.promise = null;
  cache.tickersKey = '';
  let html = calc.buildTickerReturnWithPayoutsBlockHtml('SBER', false);
  assert(/Справочный результат с учётом найденных выплат/.test(html), 'twp ui: title');
  assert(/Считаем результат с выплатами/.test(html), 'twp ui idle: loading');
  assert(/Как считается/.test(html), 'twp ui idle: how-to present');
  assert(/История операций/.test(calc.buildPortfolioTickerDetailHtml('SBER', pf.positions, pf.sales, null, false)) === true, 'twp ui: timeline still in detail');
  assert(/Управление лотами и продажами/.test(calc.buildPortfolioTickerDetailHtml('SBER', pf.positions, pf.sales, null, false)), 'twp ui: lot manage still in detail');

  cache.status = 'error';
  cache.error = true;
  html = calc.buildTickerReturnWithPayoutsBlockHtml('SBER', false);
  assert(/Не удалось загрузить данные о выплатах/.test(html), 'twp ui error: message');
  assert(!/pf-twp-kpis/.test(html), 'twp ui error: no kpi numbers');

  cache.status = 'ready';
  cache.error = null;
  cache.data = {
    payoutsByTicker: {
      SBER: { kind: 'stock', source: 'moex', dividends: [{ date: '2024-07-17', value: 33.3 }] }
    },
    warnings: [],
    isPartial: false
  };
  cache.tickersKey = 'SBER';
  html = calc.buildTickerReturnWithPayoutsBlockHtml('SBER', false);
  assert(/Вложено в покупки/.test(html), 'twp ui ready: purchase label');
  assert(/Сумма продаж/.test(html), 'twp ui ready: sales label');
  assert(/Текущая стоимость остатка/.test(html), 'twp ui ready: remainder label');
  assert(/Найденные выплаты/.test(html), 'twp ui ready: payouts label');
  assert(/Результат без выплат/.test(html), 'twp ui ready: without label');
  assert(/Результат с выплатами/.test(html), 'twp ui ready: with label');
  assert(/К сумме покупок, %/.test(html), 'twp ui ready: pct label');
  assert(/pf-twp-result--pos/.test(html), 'twp ui ready: positive tone');
  assert(!/Расчёт частичный/.test(html), 'twp ui ready: not partial');
  assert(/найденные дивиденды за период владения/.test(html), 'twp ui stock formula');
  assert(/Дивиденды — по дате отсечки/.test(html), 'twp ui stock notes');
  assert(!/текущей шкале акции/.test(html), 'twp ui SBER: no split how-to');
  assert(!/pf-split-badge/.test(html), 'twp ui SBER: no split badge');

  const noPx = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: []
  };
  sb.getPortfolio = () => noPx;
  html = calc.buildTickerReturnWithPayoutsBlockHtml('SBER', false);
  assert(/Недостаточно данных для полного расчёта/.test(html), 'twp ui missing price: null result');
  assert(/Текущая стоимость остатка[\s\S]*?—/.test(html), 'twp ui missing price: em dash not 0');

  sb.getPortfolio = () => ({
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: []
  });
  cache.data = { payoutsByTicker: {}, warnings: [], isPartial: true };
  html = calc.buildTickerReturnWithPayoutsBlockHtml('SBER', false);
  assert(/Расчёт частичный/.test(html), 'twp ui missing feed: partial');
  assert(/по бумаге SBER/.test(html), 'twp ui missing feed: names ticker');

  const ofzPf = {
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 90, buyDate: '2024-01-10',
      currentPrice: 95, faceValue: 1000
    }],
    sales: []
  };
  sb.getPortfolio = () => ofzPf;
  cache.data = {
    payoutsByTicker: {
      OFZ_26238: {
        kind: 'bond', source: 'bondization',
        coupons: [{ date: '2024-06-19', value: 42.38 }],
        faceValue: 1000
      }
    },
    warnings: [],
    isPartial: false
  };
  cache.tickersKey = 'OFZ_26238';
  html = calc.buildTickerReturnWithPayoutsBlockHtml('OFZ_26238', true);
  assert(/найденные купоны за период владения/.test(html), 'twp ui ofz formula');
  assert(/Цены ОФЗ — в % от номинала/.test(html), 'twp ui ofz notes');
  assert(/без НКД/.test(html), 'twp ui ofz no NKD');

  calc.setSplitEventsCatalog({
    version: 1,
    events: [{
      ticker: 'T', aliases: ['TCSG'], effectiveDate: '2026-04-17', ratio: 10, type: 'split'
    }]
  });
  const splitPf = {
    positions: [{ ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3200, buyDate: '2025-06-01', currentPrice: 255 }],
    sales: []
  };
  const splitSnap = JSON.stringify(splitPf);
  sb.getPortfolio = () => splitPf;
  cache.status = 'ready';
  cache.data = {
    payoutsByTicker: { T: { kind: 'stock', source: 'moex', dividends: [] } },
    warnings: [],
    isPartial: false
  };
  cache.tickersKey = 'T';
  html = calc.buildTickerReturnWithPayoutsBlockHtml('T', false);
  assert(/T: было дробление акций 1:10 от 17\.04\.2026/.test(html), 'twp ui split: ticker ratio date');
  assert(/Текущая стоимость и результат показаны в текущей шкале акции/.test(html), 'twp ui split: applied warning');
  assert(/с учётом сплита/.test(html), 'twp ui split: split-aware badge');
  assert(/2[\s\u00a0]?550/.test(html), 'twp ui split: current value 2550');
  assert(!/-2[\s\u00a0]?945/.test(html), 'twp ui split: no false JSON-qty result');
  assert(/Вложено в покупки/.test(html) && /Найденные выплаты/.test(html), 'twp ui split: purchase and payouts remain');
  assert(/текущей шкале акции/.test(html), 'twp ui split: how-to note');
  assert(JSON.stringify(splitPf) === splitSnap, 'twp ui split: no JSON mutation');

  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  cache.status = 'ready';
  cache.error = null;

  function twpReady(ticker, portfolio, extraFeed) {
    sb.getPortfolio = () => portfolio;
    cache.data = {
      payoutsByTicker: extraFeed || {
        [ticker]: { kind: 'stock', source: 'moex', dividends: [] }
      },
      warnings: [],
      isPartial: false
    };
    cache.tickersKey = ticker;
    return calc.buildTickerReturnWithPayoutsBlockHtml(ticker, false);
  }

  const gmknPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  const gmknSnap = JSON.stringify(gmknPf);
  html = twpReady('GMKN', gmknPf);
  assert(/GMKN: было дробление акций 1:100 от 08\.04\.2024/.test(html), 'twp ui GMKN: warning ticker/ratio/date');
  assert(/Текущая стоимость и результат показаны в текущей шкале акции/.test(html), 'twp ui GMKN: applied warning');
  assert(/с учётом сплита/.test(html), 'twp ui GMKN: split-aware badge');
  assert(/130[\s\u00a0]?000/.test(html), 'twp ui GMKN: current value 1000×130');
  assert(!/-98/.test(html) && !/-99/.test(html), 'twp ui GMKN: no false -98%/-99%');
  assert(!/-218/.test(html), 'twp ui GMKN: no false JSON-qty result');
  assert(/-90[\s\u00a0]?000/.test(html), 'twp ui GMKN: split-aware result ≈ -90000');
  assert(/Вложено в покупки/.test(html) && /220/.test(html), 'twp ui GMKN: purchase cost remains');
  const gmknDetail = calc.buildPortfolioTickerDetailHtml('GMKN', gmknPf.positions, gmknPf.sales, null, false);
  assert(/Проверьте, что количество и средняя цена/.test(gmknDetail), 'twp ui GMKN: main split warning remains');
  assert(JSON.stringify(gmknPf) === gmknSnap, 'twp ui GMKN: JSON not mutated');

  const plzlPf = {
    positions: [{
      ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 19000, buyDate: '2024-06-01', currentPrice: 1900
    }],
    sales: []
  };
  html = twpReady('PLZL', plzlPf);
  assert(/PLZL: было дробление акций 1:10 от 27\.03\.2025/.test(html), 'twp ui PLZL: warning');
  assert(/с учётом сплита/.test(html), 'twp ui PLZL: split-aware');
  assert(!/-90/.test(html), 'twp ui PLZL: no false -90%');

  const tAfterPf = {
    positions: [{
      ticker: 'T', lotId: 'T3', qty: 10, avgPrice: 312, buyDate: '2026-05-01', currentPrice: 262
    }],
    sales: []
  };
  html = twpReady('T', tAfterPf);
  assert(!/требует проверки/.test(html) && !/pf-split-badge/.test(html), 'twp ui T after split: numbers shown');
  assert(!/текущей шкале акции/.test(html), 'twp ui T after split: no split how-to');
  assert(/Результат с выплатами/.test(html) && /pf-twp-result--/.test(html), 'twp ui T after split: ordinary result tone');

  sb.getPortfolio = () => pf;
  cache.status = 'loading';
  cache.tickersKey = 'SBER';
  cache.promise = new Promise(function () { /* never settles */ });
  const p1 = calc.ensurePortfolioPayoutFeedsLoaded();
  const p2 = calc.ensurePortfolioPayoutFeedsLoaded();
  assert(p1 === cache.promise && p2 === cache.promise, 'twp ui cache: second open joins inflight');

  cache.status = 'idle';
  cache.data = null;
  cache.error = null;
  cache.promise = null;
  cache.tickersKey = '';
  sb.getPortfolio = () => ({ positions: [], sales: [] });
  assert(JSON.stringify(pf) === snap, 'twp ui: original fixture not mutated');
}

if (errors.length) {
  console.error('FAIL');
  errors.forEach((e) => console.error(' •', e));
  process.exit(1);
}
console.log('OK  portfolio wave-0/1 + dates + new-lot prefill + wave-2.1/2.2/2.5/2.6 + wave-3.1 timeline + wave-3.2 as-of + wave-3.3 price-at-date + wave-3.4 value-at-date + wave-3.5 value-change + explain + wave-4.1 holding-period payouts + wave-4.2 payout feeds + wave-4.3 upcoming payouts + wave-5.1 ticker return with payouts + wave-5.2 portfolio return with payouts + wave-5.3 ticker return UI');
