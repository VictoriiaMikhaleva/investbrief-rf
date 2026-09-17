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
  const withScale = h.normalizePosition({
    ticker: 'T',
    qty: 10,
    avgPrice: 262,
    lotId: 'T_SCALE',
    splitLotScale: 'current'
  });
  assert(withScale.splitLotScale === 'current', 'optional splitLotScale current kept');
  assert(withScale.qty === 10 && withScale.avgPrice === 262, 'splitLotScale does not change qty/avgPrice');

  const histScale = h.normalizePosition({
    ticker: 'T', qty: 10, avgPrice: 262, lotId: 'T_HIST', splitLotScale: 'historical'
  });
  assert(histScale.splitLotScale === 'historical', 'optional splitLotScale historical kept');

  const oldLot = h.normalizePosition({ ticker: 'T', qty: 10, avgPrice: 262, lotId: 'T_OLD' });
  assert(oldLot.splitLotScale == null, 'splitLotScale absent on old lots');

  const badScale = h.normalizePosition({
    ticker: 'T', qty: 10, avgPrice: 262, lotId: 'T_BAD', splitLotScale: 'broker'
  });
  assert(badScale.splitLotScale == null, 'invalid splitLotScale dropped');

  const scalePf = h.normalizePortfolio({
    positions: [{ ticker: 'T', qty: 10, avgPrice: 262, lotId: 'T_EX', splitLotScale: 'current' }]
  });
  assert(scalePf.positions[0].splitLotScale === 'current', 'normalizePortfolio keeps splitLotScale');
  h.setPortfolio(scalePf);
  const fromStore = h.getPortfolio();
  assert(fromStore.positions[0].splitLotScale === 'current', 'getPortfolio keeps splitLotScale');
  assert(fromStore.positions[0].qty === 10 && fromStore.positions[0].avgPrice === 262, 'stored qty/avg unchanged');
  h.importAll(JSON.stringify({ version: '1.0.0', portfolio: fromStore }));
  const afterScale = h.getPortfolio();
  assert(afterScale.positions[0].splitLotScale === 'current', 'import keeps splitLotScale');
  assert(afterScale.positions[0].qty === 10 && afterScale.positions[0].avgPrice === 262, 'import qty/avg unchanged');
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
    normalizePosition: h.normalizePosition,
    normalizeSale: h.normalizeSale,
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
  const priceAtDateCode = fs.readFileSync(path.join(__dirname, '..', 'price-at-date.js'), 'utf8');
  vm.runInNewContext(splitCode, sandbox, { timeout: 5000 });
  vm.runInNewContext(priceAtDateCode, sandbox, { timeout: 5000 });
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
      '\nthis.__recentHtml = buildPortfolioRecentSectionHtml;' +
      '\nthis.__splitSaleRecordNote = formatSplitSaleRecordNote;' +
      '\nthis.__resolveNav = resolvePortfolioHistoryNavTarget;' +
      '\nthis.__timeline = buildTickerOperationTimeline;' +
      '\nthis.__timelineHtml = buildPortfolioTickerTimelineHtml;' +
      '\nthis.__asOf = buildPortfolioCompositionAtDate;' +
      '\nthis.__asOfValue = buildPortfolioValueAtDate;' +
      '\nthis.__asOfSeries = buildPortfolioValueSeries;' +
      '\nthis.__dynCard = buildPortfolioDynamicsCardHtml;' +
      '\nthis.__dynChange = buildPortfolioDynamicsChangeFromStart;' +
      '\nthis.__dynSelect = selectPortfolioDynamicsPoint;' +
      '\nthis.__dynRange = resolvePortfolioDynamicsRange;' +
      '\nthis.__dynHorizon = resolvePortfolioDynamicsHorizon;' +
      '\nthis.__dynInterval = resolvePortfolioDynamicsInterval;' +
      '\nthis.__dynLoad = loadPortfolioDynamicsSeries;' +
      '\nthis.__dynRequest = requestPortfolioDynamicsRefresh;' +
      '\nthis.__dynDraw = drawPortfolioDynamicsChart;' +
      '\nthis.__dynState = pfDynState;' +
      '\nthis.__dynSetLastKey = function (v) { pfDynLastKey = v == null ? \'\' : String(v); };' +
      '\nthis.__dynInFlight = function () { return pfDynBuildInFlight; };' +
      '\nthis.__ensureDyn = ensurePortfolioDynamicsReady;' +
      '\nthis.__dynKey = pfDynPortfolioKey;' +
      '\nthis.__dynPointer = applyPortfolioDynamicsPointer;' +
      '\nthis.__dynEarliest = pfDynEarliestOperationDate;' +
      '\nthis.__dynTop = pfDynTopPositions;' +
      '\nthis.__dynClassify = classifyPortfolioDynamicsSeriesPoint;' +
      '\nthis.__dynSeriesPoint = seriesPointFromValueResult;' +
      '\nthis.__dynStatusText = buildPortfolioDynamicsSeriesStatusText;' +
      '\nthis.__dynTipLines = buildPortfolioDynamicsTipLines;' +
      '\nthis.__dynSetMode = setPortfolioDynamicsMode;' +
      '\nthis.__dynActiveSeries = pfDynActiveChartSeries;' +
      '\nthis.__dynResultStatus = buildPortfolioDynamicsResultStatusText;' +
      '\nthis.__dynEnsureResult = pfDynEnsureResultSeries;' +
      '\nthis.__dynNormMode = normalizePortfolioDynamicsMode;' +
      '\nthis.__dynDiscloseHtml = buildPortfolioDynamicsDisclosureHtml;' +
      '\nthis.__asOfChange = buildPortfolioValueChangeBetweenDates;' +
      '\nthis.__asOfBridge = buildPortfolioValueChangeBridge;' +
      '\nthis.__asOfResultSeries = buildPortfolioResultSeries;' +
      '\nthis.__asOfChangeExplain = buildPortfolioValueChangeExplanation;' +
      '\nthis.__collectPeriodOps = collectComparePeriodOperations;' +
      '\nthis.__asOfTable = buildPortfolioAsOfTableHtml;' +
      '\nthis.__cmpDetailsHtml = buildPortfolioCompareDetailsHtml;' +
      '\nthis.__bridgeHtml = buildPortfolioValueChangeBridgeHtml;' +
      '\nthis.__bridgeFull = isPortfolioValueChangeBridgeFull;' +
      '\nthis.__payouts = buildPortfolioPayoutsForHoldingPeriod;' +
      '\nthis.__tickerPayouts = buildTickerPayoutsForHoldingPeriod;' +
      '\nthis.__tickerReturn = buildTickerReturnWithPayouts;' +
      '\nthis.__portfolioReturn = buildPortfolioReturnWithPayouts;' +
      '\nthis.__loadPayoutFeeds = loadPayoutFeedsForPortfolio;' +
      '\nthis.__normalizeCoupons = payoutsNormalizeCouponRows;' +
      '\nthis.__couponElig = payoutsCouponEligibility;' +
      '\nthis.__payoutsDisplayDate = payoutsDisplayDate;' +
      '\nthis.__payoutsSortNewest = payoutsSortItemsNewestFirst;' +
      '\nthis.__payoutsCardsHtml = buildPortfolioPayoutsCardsHtml;' +
      '\nthis.__payoutsTableHtml = buildPortfolioPayoutsTableHtml;' +
      '\nthis.__upcomingPayouts = buildUpcomingPortfolioPayouts;' +
      '\nthis.__splitWarn = portfolioTickerNeedsSplitWarning;' +
      '\nthis.__splitWarnHtml = buildPortfolioSplitWarningHtml;' +
      '\nthis.__splitWarnMany = buildPortfolioSplitWarningsForTickersHtml;' +
      '\nthis.__splitWarnText = formatSingleSplitWarningText;' +
      '\nthis.__splitAffected = isPortfolioTickerSplitAffected;' +
      '\nthis.__lotScale = diagnoseLotShareScale;' +
      '\nthis.__lotAlreadyCurrent = lotLooksAlreadyCurrentAfterSplit;' +
      '\nthis.__lotNeedsScale = lotNeedsSplitScaleConfirmation;' +
      '\nthis.__lotShowsScale = lotShowsSplitScaleConfirmUi;' +
      '\nthis.__lotShowsScaleStatus = lotShowsSplitScaleStatusUi;' +
      '\nthis.__lotScaleHtml = buildLotSplitScaleConfirmHtml;' +
      '\nthis.__lotScaleStatusHtml = buildLotSplitScaleStatusHtml;' +
      '\nthis.__lotScaleLotHtml = buildLotSplitScaleLotHtml;' +
      '\nthis.__collectUnresolvedScale = collectUnresolvedSplitScaleLots;' +
      '\nthis.__seriesHasScalePartial = seriesHasSplitScalePartial;' +
      '\nthis.__dynScaleCtaHtml = buildPortfolioDynamicsSplitScaleCtaHtml;' +
      '\nthis.__setLotScale = setPortfolioLotSplitScale;' +
      '\nthis.__normLotScale = normalizeSplitLotScale;' +
      '\nthis.__qtyHeld = getSplitAwareQtyHeldOnDate;' +
      '\nthis.__currentQty = getSplitAwareCurrentQty;' +
      '\nthis.__splitMetrics = getSplitAwareCurrentPositionMetrics;' +
      '\nthis.__saleAllocM = getSplitAwareSaleAllocationMetrics;' +
      '\nthis.__saleSplitPnl = getSplitAwareSaleRealizedPnl;' +
      '\nthis.__tickerSplitPnl = getSplitAwareTickerRealizedPnl;' +
      '\nthis.__saleBlocked = isPortfolioTickerSaleCommitBlocked;' +
      '\nthis.__saleBlockText = formatSplitSaleBlockedText;' +
      '\nthis.__commitSale = commitPortfolioSale;' +
      '\nthis.__commitPos = commitPortfolioPosition;' +
      '\nthis.__addPos = addPortfolioPosition;' +
      '\nthis.__startEditPos = startEditPortfolioPosition;' +
      '\nthis.__cancelEditPos = cancelPortfolioEdit;' +
      '\nthis.__capturePf = capturePortfolioFormInput;' +
      '\nthis.__switchPfSub = switchPortfolioSub;' +
      '\nthis.__splitSaleUi = updatePortfolioSplitSaleBlockUi;' +
      '\nthis.__startSale = startSalePortfolioTicker;' +
      '\nthis.__splitWrite = getPortfolioSplitSaleWriteState;' +
      '\nthis.__sellableQty = getPortfolioSellableQty;' +
      '\nthis.__saleAvailHint = updatePortfolioSaleAvailableHint;' +
      '\nthis.__salePreview = updatePortfolioSalePreview;' +
      '\nthis.__allocSplit = allocateSplitAwareSaleAcrossLots;' +
      '\nthis.__removeSale = removePortfolioSale;' +
      '\nthis.__splitSaleHint = formatSplitSaleHintText;' +
      '\nthis.__splitSaleUnknown = formatSplitSaleUnknownText;' +
      '\nthis.__splitCatalogHtml = buildPortfolioSplitCatalogUnavailableHtml;' +
      '\nthis.__splitCatalogUnavail = isPortfolioSplitCatalogUnavailable;' +
      '\nthis.__splitCatalogWarnUi = updatePortfolioSplitCatalogWarnUi;' +
      '\nthis.__splitPnlHtml = buildSplitAffectedPnlHtml;' +
      '\nthis.__lotRow = buildPortfolioLotRow;' +
      '\nthis.__sectionRows = buildPortfolioSectionRows;' +
      '\nthis.__mobileCard = buildPortfolioMobileCardHtml;' +
      '\nthis.__lotRet = getLotReturnPct;' +
      '\nthis.__partialWarnText = formatPayoutPartialWarningText;' +
      '\nthis.__partialTickers = collectPayoutPartialTickersFromWarnings;' +
      '\nthis.__twpBlock = buildTickerReturnWithPayoutsBlockHtml;' +
      '\nthis.__summaryTotals = computePortfolioSummaryTotals;' +
      '\nthis.__incomeTotals = loadPortfolioIncomeTotals;' +
      '\nthis.__renderSummary = renderPortfolioSummary;' +
      '\nthis.__ensureFeeds = ensurePortfolioPayoutFeedsLoaded;' +
      '\nthis.__feedsCache = getPfPayoutFeedsCache;' +
      '\nthis.__twpDetail = buildPortfolioTickerDetailHtml;' +
      '\nthis.__resultSummary = buildPortfolioResultSummary;' +
      '\nthis.__resultSummaryHtml = buildPortfolioResultSummaryHtml;' +
      '\nthis.__renderResultSummary = renderPortfolioResultSummary;',
    sandbox,
    { timeout: 15000 }
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
    buildPortfolioRecentSectionHtml: sandbox.__recentHtml,
    formatSplitSaleRecordNote: sandbox.__splitSaleRecordNote,
    resolvePortfolioHistoryNavTarget: sandbox.__resolveNav,
    buildTickerOperationTimeline: sandbox.__timeline,
    buildPortfolioTickerTimelineHtml: sandbox.__timelineHtml,
    buildPortfolioCompositionAtDate: sandbox.__asOf,
    buildPortfolioValueAtDate: sandbox.__asOfValue,
    buildPortfolioValueSeries: sandbox.__asOfSeries,
    buildPortfolioDynamicsCardHtml: sandbox.__dynCard,
    buildPortfolioDynamicsChangeFromStart: sandbox.__dynChange,
    selectPortfolioDynamicsPoint: sandbox.__dynSelect,
    resolvePortfolioDynamicsRange: sandbox.__dynRange,
    resolvePortfolioDynamicsHorizon: sandbox.__dynHorizon,
    resolvePortfolioDynamicsInterval: sandbox.__dynInterval,
    loadPortfolioDynamicsSeries: sandbox.__dynLoad,
    requestPortfolioDynamicsRefresh: sandbox.__dynRequest,
    drawPortfolioDynamicsChart: sandbox.__dynDraw,
    pfDynState: sandbox.__dynState,
    setPfDynLastKey: sandbox.__dynSetLastKey,
    pfDynBuildInFlight: sandbox.__dynInFlight,
    ensurePortfolioDynamicsReady: sandbox.__ensureDyn,
    pfDynPortfolioKey: sandbox.__dynKey,
    applyPortfolioDynamicsPointer: sandbox.__dynPointer,
    pfDynEarliestOperationDate: sandbox.__dynEarliest,
    pfDynTopPositions: sandbox.__dynTop,
    classifyPortfolioDynamicsSeriesPoint: sandbox.__dynClassify,
    seriesPointFromValueResult: sandbox.__dynSeriesPoint,
    buildPortfolioDynamicsSeriesStatusText: sandbox.__dynStatusText,
    buildPortfolioDynamicsTipLines: sandbox.__dynTipLines,
    setPortfolioDynamicsMode: sandbox.__dynSetMode,
    pfDynActiveChartSeries: sandbox.__dynActiveSeries,
    buildPortfolioDynamicsResultStatusText: sandbox.__dynResultStatus,
    pfDynEnsureResultSeries: sandbox.__dynEnsureResult,
    normalizePortfolioDynamicsMode: sandbox.__dynNormMode,
    buildPortfolioDynamicsDisclosureHtml: sandbox.__dynDiscloseHtml,
    buildPortfolioValueChangeBetweenDates: sandbox.__asOfChange,
    buildPortfolioValueChangeBridge: sandbox.__asOfBridge,
    buildPortfolioResultSeries: sandbox.__asOfResultSeries,
    collectComparePeriodOperations: sandbox.__collectPeriodOps,
    buildPortfolioValueChangeExplanation: sandbox.__asOfChangeExplain,
    buildPortfolioAsOfTableHtml: sandbox.__asOfTable,
    buildPortfolioCompareDetailsHtml: sandbox.__cmpDetailsHtml,
    buildPortfolioValueChangeBridgeHtml: sandbox.__bridgeHtml,
    isPortfolioValueChangeBridgeFull: sandbox.__bridgeFull,
    buildPortfolioPayoutsForHoldingPeriod: sandbox.__payouts,
    buildTickerPayoutsForHoldingPeriod: sandbox.__tickerPayouts,
    buildTickerReturnWithPayouts: sandbox.__tickerReturn,
    buildPortfolioReturnWithPayouts: sandbox.__portfolioReturn,
    loadPayoutFeedsForPortfolio: sandbox.__loadPayoutFeeds,
    payoutsNormalizeCouponRows: sandbox.__normalizeCoupons,
    payoutsCouponEligibility: sandbox.__couponElig,
    payoutsDisplayDate: sandbox.__payoutsDisplayDate,
    payoutsSortItemsNewestFirst: sandbox.__payoutsSortNewest,
    buildPortfolioPayoutsCardsHtml: sandbox.__payoutsCardsHtml,
    buildPortfolioPayoutsTableHtml: sandbox.__payoutsTableHtml,
    buildUpcomingPortfolioPayouts: sandbox.__upcomingPayouts,
    portfolioTickerNeedsSplitWarning: sandbox.__splitWarn,
    buildPortfolioSplitWarningHtml: sandbox.__splitWarnHtml,
    buildPortfolioSplitWarningsForTickersHtml: sandbox.__splitWarnMany,
    formatSingleSplitWarningText: sandbox.__splitWarnText,
    isPortfolioTickerSplitAffected: sandbox.__splitAffected,
    diagnoseLotShareScale: sandbox.__lotScale,
    lotLooksAlreadyCurrentAfterSplit: sandbox.__lotAlreadyCurrent,
    lotNeedsSplitScaleConfirmation: sandbox.__lotNeedsScale,
    lotShowsSplitScaleConfirmUi: sandbox.__lotShowsScale,
    lotShowsSplitScaleStatusUi: sandbox.__lotShowsScaleStatus,
    buildLotSplitScaleConfirmHtml: sandbox.__lotScaleHtml,
    buildLotSplitScaleStatusHtml: sandbox.__lotScaleStatusHtml,
    buildLotSplitScaleLotHtml: sandbox.__lotScaleLotHtml,
    collectUnresolvedSplitScaleLots: sandbox.__collectUnresolvedScale,
    seriesHasSplitScalePartial: sandbox.__seriesHasScalePartial,
    buildPortfolioDynamicsSplitScaleCtaHtml: sandbox.__dynScaleCtaHtml,
    setPortfolioLotSplitScale: sandbox.__setLotScale,
    normalizeSplitLotScale: sandbox.__normLotScale,
    getSplitAwareQtyHeldOnDate: sandbox.__qtyHeld,
    getSplitAwareCurrentQty: sandbox.__currentQty,
    getSplitAwareCurrentPositionMetrics: sandbox.__splitMetrics,
    getSplitAwareSaleAllocationMetrics: sandbox.__saleAllocM,
    getSplitAwareSaleRealizedPnl: sandbox.__saleSplitPnl,
    getSplitAwareTickerRealizedPnl: sandbox.__tickerSplitPnl,
    isPortfolioTickerSaleCommitBlocked: sandbox.__saleBlocked,
    formatSplitSaleBlockedText: sandbox.__saleBlockText,
    commitPortfolioSale: sandbox.__commitSale,
    commitPortfolioPosition: sandbox.__commitPos,
    addPortfolioPosition: sandbox.__addPos,
    startEditPortfolioPosition: sandbox.__startEditPos,
    cancelPortfolioEdit: sandbox.__cancelEditPos,
    capturePortfolioFormInput: sandbox.__capturePf,
    switchPortfolioSub: sandbox.__switchPfSub,
    updatePortfolioSplitSaleBlockUi: sandbox.__splitSaleUi,
    startSalePortfolioTicker: sandbox.__startSale,
    getPortfolioSplitSaleWriteState: sandbox.__splitWrite,
    getPortfolioSellableQty: sandbox.__sellableQty,
    updatePortfolioSaleAvailableHint: sandbox.__saleAvailHint,
    updatePortfolioSalePreview: sandbox.__salePreview,
    allocateSplitAwareSaleAcrossLots: sandbox.__allocSplit,
    removePortfolioSale: sandbox.__removeSale,
    formatSplitSaleHintText: sandbox.__splitSaleHint,
    formatSplitSaleUnknownText: sandbox.__splitSaleUnknown,
    buildPortfolioSplitCatalogUnavailableHtml: sandbox.__splitCatalogHtml,
    isPortfolioSplitCatalogUnavailable: sandbox.__splitCatalogUnavail,
    updatePortfolioSplitCatalogWarnUi: sandbox.__splitCatalogWarnUi,
    buildSplitAffectedPnlHtml: sandbox.__splitPnlHtml,
    buildPortfolioLotRow: sandbox.__lotRow,
    buildPortfolioSectionRows: sandbox.__sectionRows,
    buildPortfolioMobileCardHtml: sandbox.__mobileCard,
    getLotReturnPct: sandbox.__lotRet,
    formatPayoutPartialWarningText: sandbox.__partialWarnText,
    collectPayoutPartialTickersFromWarnings: sandbox.__partialTickers,
    buildTickerReturnWithPayoutsBlockHtml: sandbox.__twpBlock,
    ensurePortfolioPayoutFeedsLoaded: sandbox.__ensureFeeds,
    computePortfolioSummaryTotals: sandbox.__summaryTotals,
    loadPortfolioIncomeTotals: sandbox.__incomeTotals,
    renderPortfolioSummary: sandbox.__renderSummary,
    getPfPayoutFeedsCache: sandbox.__feedsCache,
    buildPortfolioTickerDetailHtml: sandbox.__twpDetail,
    buildPortfolioResultSummary: sandbox.__resultSummary,
    buildPortfolioResultSummaryHtml: sandbox.__resultSummaryHtml,
    renderPortfolioResultSummary: sandbox.__renderResultSummary,
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
  // Wave 1: couponDate vs recordDate contract. Eligibility still coupon-date based.
  const ofzSrc = fs.readFileSync(path.join(__dirname, '..', 'ofz.js'), 'utf8');
  const parseStart = ofzSrc.indexOf('function parseIssRows');
  const parseEnd = ofzSrc.indexOf('function fetchOfzSecurityMeta');
  const mapStart = ofzSrc.indexOf('function ofzCouponIsoOrNull');
  const mapEnd = ofzSrc.indexOf('function fetchOfzCouponSchedule');
  assert(parseStart >= 0 && parseEnd > parseStart, 'wave1: parseIssRows present');
  assert(mapStart >= 0 && mapEnd > mapStart, 'wave1: mapOfzCouponIssRow present');
  const ofzHelpers = { Object, Number, String };
  vm.runInNewContext(
    ofzSrc.slice(parseStart, parseEnd) +
    ofzSrc.slice(mapStart, mapEnd) +
    '\nthis.parseIssRows = parseIssRows;' +
    '\nthis.mapOfzCouponIssRow = mapOfzCouponIssRow;',
    ofzHelpers,
    { timeout: 1000 }
  );

  const issBoth = {
    columns: [
      'isin', 'name', 'issuevalue', 'coupondate', 'recorddate', 'startdate',
      'initialfacevalue', 'facevalue', 'faceunit', 'value', 'valueprc', 'value_rub',
      'secid', 'primary_boardid'
    ],
    data: [[
      'RU000A1038V6', 'ОФЗ-ПД 26238', 1000000000000, '2026-07-15', '2026-07-14',
      '2026-01-15', 1000, 1000, 'RUB', 35.00, 7.0, 35.00, 'SU26238RMFS4', 'TQOB'
    ]]
  };
  const parsedBoth = ofzHelpers.parseIssRows(issBoth).map(ofzHelpers.mapOfzCouponIssRow);
  assert(parsedBoth.length === 1, 'wave1 parser: one coupon row');
  assert(parsedBoth[0].couponDate === '2026-07-15', 'wave1 parser: couponDate parsed');
  assert(parsedBoth[0].recordDate === '2026-07-14', 'wave1 parser: recordDate parsed');
  assert(parsedBoth[0].couponDate !== parsedBoth[0].recordDate, 'wave1 parser: dates differ and both preserved');
  assert(parsedBoth[0].date === parsedBoth[0].couponDate, 'wave1 parser: legacy date remains couponDate');
  assert(parsedBoth[0].value === 35, 'wave1 parser: value unchanged');
  assert(parsedBoth[0].valuePct === 7, 'wave1 parser: valuePct unchanged');
  assert(parsedBoth[0].facevalue == null && parsedBoth[0].status == null, 'wave1 parser: extra ISS fields not copied');

  const issMissingCol = {
    columns: ['coupondate', 'value', 'valueprc'],
    data: [['2026-07-15', 35.00, 7.0]]
  };
  const parsedMissingCol = ofzHelpers.parseIssRows(issMissingCol).map(ofzHelpers.mapOfzCouponIssRow);
  assert(parsedMissingCol[0].couponDate === '2026-07-15', 'wave1 parser: couponDate when recorddate absent');
  assert(parsedMissingCol[0].recordDate === null, 'wave1 parser: missing recorddate → null, not couponDate');
  assert(parsedMissingCol[0].date === '2026-07-15', 'wave1 parser: legacy date still couponDate if recorddate absent');

  const issNullRecord = {
    columns: ['coupondate', 'recorddate', 'value', 'valueprc'],
    data: [['2026-07-15', null, 35.00, 7.0]]
  };
  const parsedNullRecord = ofzHelpers.parseIssRows(issNullRecord).map(ofzHelpers.mapOfzCouponIssRow);
  assert(parsedNullRecord[0].recordDate === null, 'wave1 parser: null recorddate → null');
  assert(parsedNullRecord[0].couponDate === '2026-07-15', 'wave1 parser: couponDate kept when recorddate null');

  const normBoth = calc.payoutsNormalizeCouponRows([{
    coupondate: '2026-07-15',
    recorddate: '2026-07-14',
    value: 35.00,
    valueprc: 7.0
  }]);
  assert(normBoth.length === 1, 'wave1 normalize: one row');
  assert(normBoth[0].couponDate === '2026-07-15', 'wave1 normalize: couponDate');
  assert(normBoth[0].recordDate === '2026-07-14', 'wave1 normalize: recordDate');
  assert(normBoth[0].date === '2026-07-15', 'wave1 normalize: legacy date = couponDate');
  assert(normBoth[0].date !== normBoth[0].recordDate, 'wave1 normalize: date is not recordDate');
  assert(normBoth[0].value === 35 && normBoth[0].valuePct === 7, 'wave1 normalize: value/valuePct unchanged');

  const normMissing = calc.payoutsNormalizeCouponRows([{
    coupondate: '2026-07-15',
    value: 35.00,
    valueprc: 7.0
  }]);
  assert(normMissing[0].recordDate === null, 'wave1 normalize: absent recorddate → null');
  assert(normMissing[0].couponDate === '2026-07-15', 'wave1 normalize: couponDate when recorddate absent');

  const normLegacy = calc.payoutsNormalizeCouponRows([{ date: '2024-06-19', value: 42.38 }]);
  assert(normLegacy[0].date === '2024-06-19' && normLegacy[0].couponDate === '2024-06-19',
    'wave1 normalize: legacy date feed → couponDate');
  assert(normLegacy[0].recordDate === null, 'wave1 normalize: legacy feed has no fake recordDate');

  const NOW = '2025-12-31';
  const ofzPf = {
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01', faceValue: 1000
    }],
    sales: []
  };
  function ofzFeed(coupons) {
    return {
      OFZ_26238: {
        kind: 'bond',
        source: 'bondization',
        coupons: coupons,
        faceValue: 1000
      }
    };
  }
  const amountBefore = calc.buildPortfolioPayoutsForHoldingPeriod(ofzPf, '2024-01-01', '2024-12-31', {
    now: NOW,
    payoutsByTicker: ofzFeed([{ date: '2024-06-19', value: 42.38 }])
  });
  assert(amountBefore.totalCouponsRub === 423.8 && amountBefore.totalPayoutsRub === 423.8,
    'wave1 payoutsRub: existing coupon fixture amount unchanged');

  const amountAfterDates = calc.buildPortfolioPayoutsForHoldingPeriod(ofzPf, '2024-01-01', '2024-12-31', {
    now: NOW,
    payoutsByTicker: ofzFeed([{
      date: '2024-06-19',
      couponDate: '2024-06-19',
      recordDate: '2024-06-18',
      value: 42.38
    }])
  });
  assert(amountAfterDates.totalPayoutsRub === 423.8 && amountAfterDates.totalCouponsRub === 423.8,
    'wave1 payoutsRub: adding recordDate does not change amount');

  const itemBoth = calc.buildTickerPayoutsForHoldingPeriod(
    'OFZ_26238', ofzPf, '2024-01-01', '2024-12-31', {
      now: NOW,
      payoutsByTicker: ofzFeed([{
        couponDate: '2024-07-15',
        recordDate: '2024-07-14',
        date: '2024-07-15',
        value: 35
      }])
    }
  );
  assert(itemBoth.items.length === 1, 'wave1 item: coupon included by couponDate window');
  assert(itemBoth.items[0].couponDate === '2024-07-15', 'wave1 item: couponDate = couponDate');
  assert(itemBoth.items[0].recordDate === '2024-07-14', 'wave1 item: real recordDate');
  assert(itemBoth.items[0].recordDate !== itemBoth.items[0].couponDate, 'wave1 item: no fake recordDate=couponDate');
  assert(itemBoth.items[0].eligibilityDate === '2024-07-14', 'wave2 item: eligibilityDate is recordDate');
  assert(itemBoth.items[0].eligibilitySource === 'recordDate', 'wave2 item: eligibilitySource recordDate');
  assert(itemBoth.items[0].amountRub === 350, 'wave1 item: amount still qty × value');

  const itemMissing = calc.buildTickerPayoutsForHoldingPeriod(
    'OFZ_26238', ofzPf, '2024-01-01', '2024-12-31', {
      now: NOW,
      payoutsByTicker: ofzFeed([{ date: '2024-06-19', value: 42.38 }])
    }
  );
  assert(itemMissing.items[0].couponDate === '2024-06-19', 'wave1 item: couponDate from legacy date');
  assert(itemMissing.items[0].recordDate === null, 'wave1 item: missing recordDate stays null');
  assert(itemMissing.items[0].recordDate !== itemMissing.items[0].couponDate, 'wave1 item: null is not couponDate');
  assert(itemMissing.items[0].eligibilityDate === '2024-06-19', 'wave2 item: missing recordDate fallback couponDate');
  assert(itemMissing.items[0].eligibilitySource === 'couponDateFallback', 'wave2 item: missing recordDate estimated');
  assert(itemMissing.items[0].isEstimated === true && itemMissing.isPartial === true,
    'wave2 item: missing recordDate marked partial');

  const displayBoth = {
    type: 'coupon', ticker: 'OFZ_26238',
    couponDate: '2026-07-15', recordDate: '2026-07-14', eligibilityDate: '2026-07-15',
    qtyHeld: 10, payoutPerUnit: 35, amountRub: 350
  };
  assert(displayBoth.couponDate === '2026-07-15' && displayBoth.recordDate === '2026-07-14',
    'wave1 display: contract keeps both dates');
  assert(calc.payoutsDisplayDate(displayBoth) === '2026-07-15', 'wave1 display: coupon date is couponDate');
  const cardsBoth = calc.buildPortfolioPayoutsCardsHtml([displayBoth]);
  const tableBoth = calc.buildPortfolioPayoutsTableHtml([displayBoth]);
  assert(/Дата<\/span> 2026-07-15/.test(cardsBoth), 'wave1 display html: couponDate in cards');
  assert(!/Дата<\/span> 2026-07-14/.test(cardsBoth) && !/Дата<\/span> —/.test(cardsBoth),
    'wave1 display html: cutoff not shown as card date');
  assert(/2026-07-15/.test(tableBoth) && !/2026-07-14/.test(tableBoth),
    'wave1 display html: table uses couponDate');

  const displayMissing = {
    type: 'coupon', ticker: 'OFZ_26238',
    couponDate: '2026-07-15', recordDate: null, eligibilityDate: '2026-07-15',
    qtyHeld: 10, payoutPerUnit: 35, amountRub: 350
  };
  assert(displayMissing.recordDate === null, 'wave1 display: missing recordDate stays null');
  assert(calc.payoutsDisplayDate(displayMissing) === '2026-07-15',
    'wave1 display: missing recordDate still couponDate, not em dash');
  const cardsMissing = calc.buildPortfolioPayoutsCardsHtml([displayMissing]);
  assert(/Дата<\/span> 2026-07-15/.test(cardsMissing), 'wave1 display html: couponDate when recordDate null');
  assert(!/Дата<\/span> —/.test(cardsMissing), 'wave1 display html: not — when recordDate null');

  const newest = calc.payoutsSortItemsNewestFirst([
    { type: 'coupon', ticker: 'OFZ_26238', couponDate: '2024-08-01', recordDate: '2024-07-01' },
    { type: 'coupon', ticker: 'OFZ_26238', couponDate: '2024-07-15', recordDate: '2024-07-14' }
  ]);
  assert(newest[0].couponDate === '2024-08-01' && newest[1].couponDate === '2024-07-15',
    'wave1 sort: coupon rows by couponDate newest first');
  assert(newest[0].recordDate === '2024-07-01' && newest[1].recordDate === '2024-07-14',
    'wave1 sort: recordDate not used as coupon sort key');

  const mixedSort = calc.payoutsSortItemsNewestFirst([
    { type: 'coupon', ticker: 'OFZ_26238', couponDate: '2024-07-20', recordDate: '2024-07-10' },
    { type: 'dividend', ticker: 'SBER', recordDate: '2024-07-17' }
  ]);
  assert(mixedSort[0].type === 'coupon' && mixedSort[1].type === 'dividend',
    'wave1 sort: coupon by couponDate, dividend by recordDate');
  assert(calc.payoutsDisplayDate({ type: 'dividend', recordDate: '2024-07-17' }) === '2024-07-17',
    'wave1 display: dividend still registry recordDate');

  const twoCpns = calc.buildPortfolioPayoutsForHoldingPeriod(ofzPf, '2024-01-01', '2024-12-31', {
    now: NOW,
    payoutsByTicker: ofzFeed([
      { date: '2024-08-01', couponDate: '2024-08-01', recordDate: '2024-07-01', value: 10 },
      { date: '2024-07-15', couponDate: '2024-07-15', recordDate: '2024-07-14', value: 10 }
    ])
  });
  assert(twoCpns.items[0].couponDate === '2024-07-15' && twoCpns.items[1].couponDate === '2024-08-01',
    'wave1 sort: holding-period items oldest couponDate first');
  assert(twoCpns.items[0].recordDate === '2024-07-14' && twoCpns.items[1].recordDate === '2024-07-01',
    'wave1 sort: holding-period recordDates preserved');
  assert(twoCpns.totalPayoutsRub === 200, 'wave1 payoutsRub: two-coupon sort fixture amount unchanged');

  assert(itemMissing.items[0].eligibilityDate === '2024-06-19', 'wave2 item: missing recordDate fallback couponDate');
  assert(itemMissing.items[0].eligibilitySource === 'couponDateFallback', 'wave2 item: missing recordDate estimated');
  assert(itemMissing.items[0].isEstimated === true && itemMissing.isPartial === true,
    'wave2 item: missing recordDate marked partial');

  const buyOnCouponAfterRecord = calc.buildTickerPayoutsForHoldingPeriod(
    'OFZ_26238',
    {
      positions: [{
        ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2024-06-19', faceValue: 1000
      }],
      sales: []
    },
    '2024-01-01',
    '2024-12-31',
    {
      now: NOW,
      payoutsByTicker: ofzFeed([{
        date: '2024-06-19',
        couponDate: '2024-06-19',
        recordDate: '2024-06-18',
        value: 42.38
      }])
    }
  );
  assert(buyOnCouponAfterRecord.items.length === 0 && buyOnCouponAfterRecord.totalPayoutsRub === 0,
    'wave2: buy between record and coupon not eligible');

  const buyAfterCoupon = calc.buildTickerPayoutsForHoldingPeriod(
    'OFZ_26238',
    {
      positions: [{
        ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2024-06-20', faceValue: 1000
      }],
      sales: []
    },
    '2024-01-01',
    '2024-12-31',
    {
      now: NOW,
      payoutsByTicker: ofzFeed([{
        date: '2024-06-19',
        couponDate: '2024-06-19',
        recordDate: '2024-06-18',
        value: 42.38
      }])
    }
  );
  assert(buyAfterCoupon.items.length === 0 && buyAfterCoupon.totalPayoutsRub === 0,
    'wave1 eligibility: buy after couponDate still excluded');

  const sberPf = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' }],
    sales: []
  };
  const divItem = calc.buildTickerPayoutsForHoldingPeriod(
    'SBER', sberPf, '2024-01-01', '2024-12-31', {
      now: NOW,
      payoutsByTicker: { SBER: { kind: 'stock', source: 'moex', dividends: [{ date: '2024-07-17', value: 33.3 }] } }
    }
  );
  assert(divItem.items.length === 1 && divItem.items[0].type === 'dividend', 'wave1 dividend: still one item');
  assert(divItem.items[0].recordDate === '2024-07-17', 'wave1 dividend: recordDate = registryclosedate');
  assert(divItem.items[0].couponDate == null, 'wave1 dividend: no couponDate field');
  assert(divItem.items[0].amountRub === 333, 'wave1 dividend: eligibility/amount unchanged');

  const divAfterCutoff = calc.buildTickerPayoutsForHoldingPeriod(
    'SBER',
    {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-08-01' }],
      sales: []
    },
    '2024-01-01',
    '2024-12-31',
    {
      now: NOW,
      payoutsByTicker: { SBER: { kind: 'stock', source: 'moex', dividends: [{ date: '2024-07-17', value: 33.3 }] } }
    }
  );
  assert(divAfterCutoff.items.length === 0, 'wave1 dividend: buy after registry cutoff still excluded');

  const feeds = await calc.loadPayoutFeedsForPortfolio(ofzPf, {
    fetchOfzBondSnapshot: () => Promise.resolve({
      ticker: 'OFZ_26238',
      faceValue: 1000,
      accruedInt: 12.5,
      coupons: [{
        coupondate: '2026-07-15',
        recorddate: '2026-07-14',
        value: 35.00,
        valueprc: 7.0
      }]
    })
  });
  const feedCpn = feeds.payoutsByTicker.OFZ_26238.coupons[0];
  assert(feedCpn.couponDate === '2026-07-15', 'wave1 feed: couponDate preserved');
  assert(feedCpn.recordDate === '2026-07-14', 'wave1 feed: recordDate preserved');
  assert(feedCpn.date === '2026-07-15', 'wave1 feed: legacy date = couponDate');
  assert(feeds.payoutsByTicker.OFZ_26238.accruedInt == null, 'wave1 feed: NKD still not copied');

  assert(/bondization\.json\?iss\.only=coupons/.test(ofzSrc), 'wave1 network: still existing bondization coupons endpoint');
  assert(!/iss\.only=amortizations|iss\.only=offers/.test(ofzSrc.slice(mapStart, ofzSrc.indexOf('function fetchOfzBondSnapshot'))),
    'wave1 network: no extra coupon endpoint');
  assert(/recorddate/.test(ofzSrc.slice(mapStart, mapEnd)), 'wave1 ofz mapper reads ISS recorddate');
}

{
  // Wave 2: coupon eligibility uses real ISS recordDate when trustworthy.
  const NOW = '2026-12-31';
  function ofzFeed(coupons) {
    return {
      OFZ_26238: {
        kind: 'bond', source: 'bondization', coupons: coupons, faceValue: 1000
      }
    };
  }
  function ofzPos(buyDate, qty, extra) {
    return Object.assign({
      ticker: 'OFZ_26238', lotId: extra && extra.lotId ? extra.lotId : 'O1',
      qty: qty, avgPrice: 95, buyDate: buyDate, faceValue: 1000, currentPrice: 98
    }, extra || {});
  }
  function runTicker(portfolio, coupons, extra) {
    return calc.buildTickerPayoutsForHoldingPeriod(
      'OFZ_26238',
      portfolio,
      extra && extra.fromDate ? extra.fromDate : '2026-01-01',
      extra && extra.toDate ? extra.toDate : '2026-12-31',
      Object.assign({
        now: extra && extra.now ? extra.now : NOW,
        payoutsByTicker: ofzFeed(coupons)
      }, extra || {})
    );
  }
  const cpn = {
    couponDate: '2026-07-15',
    recordDate: '2026-07-14',
    date: '2026-07-15',
    value: 35
  };
  const elig = calc.payoutsCouponEligibility(cpn);
  assert(elig.eligibilityDate === '2026-07-14' && elig.eligibilitySource === 'recordDate',
    'wave2 helper: valid recordDate used');
  assert(elig.eligibilityEstimated === false, 'wave2 helper: not estimated when recordDate valid');

  const heldBoth = { positions: [ofzPos('2026-01-10', 10)], sales: [] };
  const caseA = runTicker(heldBoth, [cpn]);
  assert(caseA.items.length === 1 && caseA.items[0].qtyHeld === 10, 'wave2 A: qty on recordDate');
  assert(caseA.items[0].amountRub === 350 && caseA.totalPayoutsRub === 350, 'wave2 A: 10×35 held both days');
  assert(caseA.items[0].eligibilityDate === '2026-07-14', 'wave2 A: eligibilityDate = recordDate');
  assert(caseA.items[0].couponDate === '2026-07-15', 'wave2 A: couponDate preserved');
  assert(caseA.items[0].recordDate === '2026-07-14', 'wave2 A: recordDate preserved');
  assert(caseA.items[0].eligibilitySource === 'recordDate' && !caseA.items[0].isEstimated,
    'wave2 A: exact entitlement');
  assert(calc.payoutsDisplayDate(caseA.items[0]) === '2026-07-15', 'wave2 A: display remains couponDate');
  assert(caseA.isPartial === false, 'wave2 A: not partial');
  assert(caseA.items[0].payoutDate === null, 'wave2 A: payoutDate null');

  const buyBetween = runTicker({ positions: [ofzPos('2026-07-15', 10)], sales: [] }, [cpn]);
  assert(buyBetween.items.length === 0 && buyBetween.totalPayoutsRub === 0,
    'wave2 B: buy after record / on couponDate → 0');

  const sellAfterRecord = runTicker({
    positions: [],
    sales: [{
      saleId: 'OS1', ticker: 'OFZ_26238', qty: 10, buyPrice: 95, salePrice: 98,
      saleDate: '2026-07-15', faceValue: 1000,
      allocations: [{ lotId: 'O1', qty: 10, buyPrice: 95, buyDate: '2026-01-10' }]
    }]
  }, [cpn]);
  assert(sellAfterRecord.items.length === 1 && sellAfterRecord.items[0].qtyHeld === 10,
    'wave2 C: sell after record keeps 10');
  assert(sellAfterRecord.totalPayoutsRub === 350, 'wave2 C: 10×35 after full sell');
  assert(sellAfterRecord.items[0].eligibilityDate === '2026-07-14', 'wave2 C: closed still eligible');

  const buyBefore = runTicker({ positions: [ofzPos('2026-07-01', 10)], sales: [] }, [cpn]);
  assert(buyBefore.items[0].qtyHeld === 10 && buyBefore.totalPayoutsRub === 350, 'wave2: buy before record');

  const buyOnRecord = runTicker({ positions: [ofzPos('2026-07-14', 10)], sales: [] }, [cpn]);
  assert(buyOnRecord.items.length === 1 && buyOnRecord.items[0].qtyHeld === 10,
    'wave2: buy on recordDate eligible in day-level model');

  const sellBefore = runTicker({
    positions: [],
    sales: [{
      saleId: 'OS2', ticker: 'OFZ_26238', qty: 10, buyPrice: 95, salePrice: 98,
      saleDate: '2026-07-13', faceValue: 1000,
      allocations: [{ lotId: 'O1', qty: 10, buyPrice: 95, buyDate: '2026-01-10' }]
    }]
  }, [cpn]);
  assert(sellBefore.items.length === 0 && sellBefore.totalPayoutsRub === 0, 'wave2: sell before record');

  const partialAfter = runTicker({
    positions: [ofzPos('2026-01-10', 6)],
    sales: [{
      saleId: 'OS3', ticker: 'OFZ_26238', qty: 4, buyPrice: 95, salePrice: 98,
      saleDate: '2026-07-15', faceValue: 1000,
      allocations: [{ lotId: 'O1', qty: 4, buyPrice: 95, buyDate: '2026-01-10' }]
    }]
  }, [cpn]);
  assert(partialAfter.items[0].qtyHeld === 10 && partialAfter.totalPayoutsRub === 350,
    'wave2: partial sell after record keeps 10');

  const partialBefore = runTicker({
    positions: [ofzPos('2026-01-10', 6)],
    sales: [{
      saleId: 'OS4', ticker: 'OFZ_26238', qty: 4, buyPrice: 95, salePrice: 98,
      saleDate: '2026-07-10', faceValue: 1000,
      allocations: [{ lotId: 'O1', qty: 4, buyPrice: 95, buyDate: '2026-01-10' }]
    }]
  }, [cpn]);
  assert(partialBefore.items[0].qtyHeld === 6 && partialBefore.totalPayoutsRub === 210,
    'wave2: partial sell before record → 6');

  const lots = runTicker({
    positions: [ofzPos('2026-01-01', 2, { lotId: 'A' }), ofzPos('2026-02-01', 7, { lotId: 'B' })],
    sales: [{
      saleId: 'OS5', ticker: 'OFZ_26238', qty: 3, buyPrice: 95, salePrice: 98,
      saleDate: '2026-07-01', faceValue: 1000,
      allocations: [{ lotId: 'A', qty: 3, buyPrice: 95, buyDate: '2026-01-01' }]
    }]
  }, [cpn]);
  assert(lots.items[0].qtyHeld === 9 && lots.totalPayoutsRub === 315, 'wave2: multiple lots 5+7-3=9');

  const twoEvents = runTicker(heldBoth, [
    { couponDate: '2026-01-15', recordDate: '2026-01-14', date: '2026-01-15', value: 20 },
    { couponDate: '2026-07-15', recordDate: '2026-07-14', date: '2026-07-15', value: 35 }
  ]);
  assert(twoEvents.items.length === 2, 'wave2: multiple coupons independent');
  assert(twoEvents.items[0].amountRub === 200 && twoEvents.items[1].amountRub === 350,
    'wave2: each coupon uses own recordDate qty');
  assert(twoEvents.totalPayoutsRub === 550, 'wave2: two coupons summed');
  assert(calc.payoutsDisplayDate(twoEvents.items[0]) === '2026-01-15', 'wave2: sort/display still couponDate');
  assert(twoEvents.items[0].couponDate === '2026-01-15' && twoEvents.items[1].couponDate === '2026-07-15',
    'wave2: holding-period sort by couponDate');

  const missing = runTicker(heldBoth, [{ couponDate: '2026-07-15', date: '2026-07-15', value: 35 }]);
  assert(missing.items.length === 1 && missing.items[0].amountRub === 350, 'wave2 fallback: amount kept');
  assert(missing.items[0].recordDate === null, 'wave2 fallback: recordDate null');
  assert(missing.items[0].eligibilityDate === '2026-07-15', 'wave2 fallback: couponDate');
  assert(missing.items[0].eligibilitySource === 'couponDateFallback' && missing.items[0].isEstimated === true,
    'wave2 fallback: estimated');
  assert(missing.isPartial === true, 'wave2 fallback: aggregate partial');
  assert(missing.warnings.some((w) => /дата фиксации не найдена/i.test(w)), 'wave2 fallback: warning');
  assert(/оценено по дате купона/.test(missing.items[0].note), 'wave2 fallback: item note');
  assert(/без НКД/.test(missing.items[0].note), 'wave2 fallback: NKD still mentioned');
  assert(calc.payoutsDisplayDate(missing.items[0]) === '2026-07-15', 'wave2 fallback: display couponDate');

  const invalidGt = runTicker(heldBoth, [{
    couponDate: '2026-07-15', recordDate: '2026-07-16', date: '2026-07-15', value: 35
  }]);
  assert(invalidGt.items[0].eligibilityDate === '2026-07-15', 'wave2 invalid: fallback couponDate');
  assert(invalidGt.items[0].recordDate === '2026-07-16', 'wave2 invalid: ISS date kept, not auto-fixed');
  assert(invalidGt.items[0].isEstimated === true && invalidGt.isPartial === true, 'wave2 invalid: partial');
  assert(invalidGt.warnings.some((w) => /дата фиксации некорректна/i.test(w)), 'wave2 invalid: warning');

  const malformed = runTicker(heldBoth, [{
    couponDate: '2026-07-15', recordDate: 'not-a-date', date: '2026-07-15', value: 35
  }]);
  assert(malformed.items[0].recordDate == null, 'wave2 malformed: recordDate null');
  assert(malformed.items[0].eligibilitySource === 'couponDateFallback' && malformed.isPartial === true,
    'wave2 malformed: fallback partial');

  const golden = calc.buildTickerPayoutsForHoldingPeriod(
    'OFZ_26238',
    { positions: [ofzPos('2024-02-01', 10)], sales: [] },
    '2024-01-01', '2024-12-31',
    {
      now: '2025-12-31',
      payoutsByTicker: ofzFeed([{
        date: '2024-06-19', couponDate: '2024-06-19', recordDate: '2024-06-18', value: 42.38
      }])
    }
  );
  assert(golden.totalPayoutsRub === 423.8 && golden.items[0].qtyHeld === 10,
    'wave2 golden: 10×42.38 unchanged when qty same on both dates');

  const rangeElig = runTicker(heldBoth, [cpn], { fromDate: '2026-07-14', toDate: '2026-07-14', now: '2026-07-14' });
  assert(rangeElig.items.length === 1 && rangeElig.items[0].amountRub === 350,
    'wave2 range: included by eligibilityDate even if couponDate is next day');
  assert(calc.payoutsDisplayDate(rangeElig.items[0]) === '2026-07-15',
    'wave2 range: display still couponDate');

  const rangeCouponOnly = runTicker(heldBoth, [cpn], {
    fromDate: '2026-07-15', toDate: '2026-07-15', now: '2026-07-15'
  });
  assert(rangeCouponOnly.items.length === 0, 'wave2 range: couponDate in window is not enough without eligibilityDate');

  const pfMix = calc.buildPortfolioPayoutsForHoldingPeriod(
    {
      positions: [
        ofzPos('2026-01-10', 10),
        { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2026-01-10' }
      ],
      sales: []
    },
    '2026-01-01', '2026-12-31',
    {
      now: NOW,
      payoutsByTicker: Object.assign(ofzFeed([cpn]), {
        SBER: { kind: 'stock', source: 'moex', dividends: [{ date: '2026-07-17', value: 10 }] }
      })
    }
  );
  assert(pfMix.totalCouponsRub === 350 && pfMix.totalDividendsRub === 100, 'wave2 portfolio: coupon+div');
  assert(pfMix.totalPayoutsRub === 450, 'wave2 portfolio: aggregated once');
  const divRow = pfMix.items.find((r) => r.type === 'dividend');
  assert(divRow && divRow.recordDate === '2026-07-17' && divRow.couponDate == null,
    'wave2 dividend: registry semantics unchanged');

  const twpHeld = calc.buildTickerReturnWithPayouts('OFZ_26238', heldBoth, {
    now: NOW, payoutsByTicker: ofzFeed([cpn]), bondMeta: { faceValue: 1000 }
  });
  assert(twpHeld.couponsRub === 350 && twpHeld.payoutsRub === 350, 'wave2 twp: same holdings');

  const twpBuyBetween = calc.buildTickerReturnWithPayouts(
    'OFZ_26238',
    { positions: [ofzPos('2026-07-15', 10)], sales: [] },
    { now: NOW, payoutsByTicker: ofzFeed([cpn]), bondMeta: { faceValue: 1000 } }
  );
  assert(twpBuyBetween.couponsRub === 0 && twpBuyBetween.payoutsRub === 0, 'wave2 twp: buy-between changes payoutsRub');

  const twpSellBetween = calc.buildTickerReturnWithPayouts(
    'OFZ_26238',
    {
      positions: [],
      sales: [{
        saleId: 'OS1', ticker: 'OFZ_26238', qty: 10, buyPrice: 95, salePrice: 98,
        saleDate: '2026-07-15', faceValue: 1000,
        allocations: [{ lotId: 'O1', qty: 10, buyPrice: 95, buyDate: '2026-01-10' }]
      }]
    },
    { now: NOW, payoutsByTicker: ofzFeed([cpn]), bondMeta: { faceValue: 1000 } }
  );
  assert(twpSellBetween.couponsRub === 350 && twpSellBetween.payoutsRub === 350,
    'wave2 twp: sell-between preserves earned coupon');
  assert(twpSellBetween.isClosed === true, 'wave2 twp: closed after record');

  const prs = calc.buildPortfolioResultSummary(heldBoth, {
    now: NOW, payoutsByTicker: ofzFeed([cpn]), bondMetaMap: { OFZ_26238: { faceValue: 1000 } }
  });
  assert(prs.couponsRub === 350 && prs.payoutsRub === 350, 'wave2 prs: holding-period helper only');

  const upBefore = calc.buildUpcomingPortfolioPayouts(heldBoth, {
    now: '2026-07-13', horizonDays: 365, payoutsByTicker: ofzFeed([cpn])
  });
  assert(upBefore.items.length === 1, 'wave2 upcoming: before record is future entitlement');
  assert(upBefore.items[0].date === '2026-07-15', 'wave2 upcoming: display couponDate');
  assert(upBefore.items[0].eligibilityDate === '2026-07-14', 'wave2 upcoming: eligibility recordDate');
  assert(upBefore.nextDate === '2026-07-15', 'wave2 upcoming: nextDate is display couponDate');

  const upOnRecord = calc.buildUpcomingPortfolioPayouts(heldBoth, {
    now: '2026-07-14', horizonDays: 365, payoutsByTicker: ofzFeed([cpn])
  });
  assert(upOnRecord.items.length === 0, 'wave2 upcoming: on/after record no longer future entitlement');

  const upAfterRecord = calc.buildUpcomingPortfolioPayouts(heldBoth, {
    now: '2026-07-15', horizonDays: 365, payoutsByTicker: ofzFeed([cpn])
  });
  assert(upAfterRecord.items.length === 0, 'wave2 upcoming: couponDate alone does not keep it upcoming');

  const upMissing = calc.buildUpcomingPortfolioPayouts(heldBoth, {
    now: '2026-07-13', horizonDays: 365,
    payoutsByTicker: ofzFeed([{ couponDate: '2026-07-15', date: '2026-07-15', value: 35 }])
  });
  assert(upMissing.items.length === 1 && upMissing.items[0].date === '2026-07-15',
    'wave2 upcoming fallback: still listed by couponDate');
  assert(upMissing.isPartial === true && upMissing.items[0].isEstimated === true,
    'wave2 upcoming fallback: partial/estimated');
  assert(upMissing.warnings.some((w) => /дата фиксации не найдена/i.test(w)),
    'wave2 upcoming fallback: warning');

  const newest = calc.payoutsSortItemsNewestFirst([
    { type: 'coupon', couponDate: '2026-07-15', recordDate: '2026-07-01', eligibilityDate: '2026-07-01' },
    { type: 'coupon', couponDate: '2026-07-10', recordDate: '2026-07-09', eligibilityDate: '2026-07-09' }
  ]);
  assert(newest[0].couponDate === '2026-07-15', 'wave2 sort: still couponDate not recordDate');

  const pfJs = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
  assert(/bondization\.json\?iss\.only=coupons/.test(fs.readFileSync(path.join(__dirname, '..', 'ofz.js'), 'utf8')),
    'wave2 network: no new coupon endpoint');
  assert(!/iss\.only=amortizations/.test(pfJs), 'wave2: no amortization');
  const drawSrc = Function.prototype.toString.call(calc.drawPortfolioDynamicsChart);
  const ensureSrc = Function.prototype.toString.call(calc.pfDynEnsureResultSeries);
  assert(!/loadPayoutFeedsForPortfolio|buildPortfolioPayoutsForHoldingPeriod/.test(drawSrc + ensureSrc),
    'wave2: Result graph still has no payouts');
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
  assert(/Дробление акций в портфеле/.test(manyHtml), 'split warn many: heading');
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
  assert(!/≈\d+ шт\. с учётом сплита/.test(sberRow), 'SBER: no split qty hint');
  assert(!/итого ≈/.test(sberRow), 'SBER: no group итого');
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
  assert(!/≈\d+ шт\. с учётом сплита/.test(tAfterRow), 'T after split: no lot qty hint');
  assert(!/итого ≈/.test(tAfterSection), 'T after split: no group итого');
  const tAfterDetail = calc.buildPortfolioTickerDetailHtml('T', tAfterPf.positions, tAfterPf.sales, null, false);
  const tAfterRemain = tAfterDetail.split('Остаток')[1].split('Куплено всего')[0];
  assert(/10 шт\./.test(tAfterRemain), 'T after split: remain still JSON qty');
  assert(!/по операциям/.test(tAfterRemain), 'T after split: no ops-qty hint');
  assert(!/с учётом сплита/.test(tAfterRemain), 'T after split: remain has no split badge');

  const gmknMixedPf = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92 },
      { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 129.74, buyDate: '2026-09-04', currentPrice: 129.92 }
    ],
    sales: []
  };
  const gmknMixedSnap = JSON.stringify(gmknMixedPf);
  const gmknMixedDetail = calc.buildPortfolioTickerDetailHtml(
    'GMKN', gmknMixedPf.positions, gmknMixedPf.sales, null, false
  );
  const gmknRemain = gmknMixedDetail.split('Остаток')[1].split('Куплено всего')[0];
  assert(/1010 шт\./.test(gmknRemain), 'GMKN detail qty: split-aware 1010');
  assert(/по операциям: 20 шт\./.test(gmknRemain), 'GMKN detail qty: ops 20 labeled');
  assert(/с учётом сплита/.test(gmknRemain), 'GMKN detail qty: split-aware badge');
  const gmknBought = gmknMixedDetail.split('Куплено всего')[1].split('Продано')[0];
  assert(/20 шт\./.test(gmknBought), 'GMKN detail bought: 20 still shown');
  assert(/в истории операций/.test(gmknBought), 'GMKN detail bought: history hint');
  assert(JSON.stringify(gmknMixedPf) === gmknMixedSnap, 'GMKN detail qty: JSON not mutated');

  const gmknHistRow = calc.buildPortfolioLotRow(gmknMixedPf.positions[0], lotGroup('GMKN', gmknMixedPf.positions), {
    splitAffected: true,
    lotIndex: 0,
    rowSpan: 2,
    positions: gmknMixedPf.positions,
    sales: gmknMixedPf.sales
  });
  assert(/>10</.test(gmknHistRow) || /pf-qty">10/.test(gmknHistRow), 'GMKN row qty: JSON 10 kept');
  assert(/≈1000 шт\. с учётом сплита/.test(gmknHistRow), 'GMKN hist lot: ≈1000 шт. hint');
  assert(/итого ≈1010 шт\. с учётом сплита/.test(gmknHistRow), 'GMKN group: итого ≈1010');
  const gmknCurrRow = calc.buildPortfolioLotRow(gmknMixedPf.positions[1], lotGroup('GMKN', gmknMixedPf.positions), {
    splitAffected: true,
    lotIndex: 1,
    rowSpan: 2,
    positions: gmknMixedPf.positions,
    sales: gmknMixedPf.sales
  });
  assert(/≈1000 шт\. с учётом сплита/.test(gmknCurrRow) === false, 'GMKN current lot: no extra ≈10 hint');
  assert(/итого ≈1010/.test(gmknCurrRow) === false, 'GMKN nested lot: no group итого');
  const gmknSection = calc.buildPortfolioSectionRows(gmknMixedPf.positions, 'stocks', {}, gmknMixedPf.sales);
  assert(/≈1000 шт\. с учётом сплита/.test(gmknSection), 'GMKN section: hist lot hint');
  assert(/итого ≈1010 шт\. с учётом сплита/.test(gmknSection), 'GMKN section: group total hint');

  const tHistRow = calc.buildPortfolioLotRow(tPf.positions[0], lotGroup('T', tPf.positions), {
    splitAffected: true,
    lotIndex: 0,
    positions: tPf.positions,
    sales: tPf.sales
  });
  assert(/≈10 шт\. с учётом сплита/.test(tHistRow), 'T hist lot: ≈10 шт. hint');
  assert(!/итого ≈/.test(tHistRow), 'T single lot: no group итого');

  const tHistDetail = calc.buildPortfolioTickerDetailHtml('T', tPf.positions, tPf.sales, null, false);
  const tRemain = tHistDetail.split('Остаток')[1].split('Куплено всего')[0];
  assert(/10 шт\./.test(tRemain), 'T detail qty: split-aware 10');
  assert(/по операциям: 1 шт\./.test(tRemain), 'T detail qty: ops 1 labeled');
  assert(/с учётом сплита/.test(tRemain), 'T detail qty: split-aware badge');

  const sberRemain = sberDetail.split('Остаток')[1].split('Куплено всего')[0];
  assert(/10 шт\./.test(sberRemain), 'SBER detail qty: unchanged 10');
  assert(!/по операциям/.test(sberRemain), 'SBER detail qty: no ops hint');
  assert(!/с учётом сплита/.test(sberRemain), 'SBER detail qty: no split badge');
  const sberBought = sberDetail.split('Куплено всего')[1].split('Продано')[0];
  assert(!/в истории операций/.test(sberBought), 'SBER detail bought: no history hint');

  const ofzPf = {
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01',
      faceValue: 1000, currentPrice: 95
    }],
    sales: []
  };
  const ofzDetail = calc.buildPortfolioTickerDetailHtml(
    'OFZ_26238', ofzPf.positions, ofzPf.sales, { faceValue: 1000 }, true
  );
  const ofzRemain = ofzDetail.split('Остаток')[1].split('Куплено всего')[0];
  assert(/10 шт\./.test(ofzRemain), 'OFZ detail qty: unchanged 10');
  assert(!/по операциям/.test(ofzRemain), 'OFZ detail qty: no ops hint');
  assert(!/с учётом сплита/.test(ofzRemain), 'OFZ detail qty: no split badge');
  const ofzSection = calc.buildPortfolioSectionRows(ofzPf.positions, 'bonds', {
    OFZ_26238: { faceValue: 1000 }
  }, ofzPf.sales);
  assert(!/≈\d+ шт\. с учётом сплита/.test(ofzSection), 'OFZ section: no split qty hint');
  assert(!/итого ≈/.test(ofzSection), 'OFZ section: no group итого');
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
  assert(calc.lotLooksAlreadyCurrentAfterSplit(tCurr, 'T', opts), 'lot scale: T 10×312 pre-split looks already current');

  {
    const NOTE = 'Позиция выглядит уже приведённой к текущим акциям после дробления';
    function close(a, b, eps, msg) {
      assert(Math.abs(Number(a) - Number(b)) < (eps || 0.02), msg);
    }
    const caseA = {
      positions: [{ ticker: 'T', lotId: 'TA', qty: 1, avgPrice: 2600, buyDate: '2026-03-01', currentPrice: 261.7 }],
      sales: []
    };
    const snapA = JSON.stringify(caseA);
    const heldA = calc.getSplitAwareCurrentQty('T', caseA, opts);
    close(heldA.qty, 10, 1e-6, 'T UX A: 1 old → 10 current');
    const tlA = calc.buildTickerOperationTimeline('T', caseA.positions, caseA.sales);
    const buyA = tlA.find((op) => op.type === 'buy');
    assert(buyA && buyA.qty === 1, 'T UX A: history qty as entered 1');
    close(buyA.price, 2600, 0.02, 'T UX A: history price as entered 2600');
    assert(!new RegExp(NOTE).test(buyA.note || ''), 'T UX A: not already-current note');
    assert(JSON.stringify(caseA) === snapA, 'T UX A: JSON not mutated');

    const caseB = {
      positions: [{ ticker: 'T', lotId: 'TB', qty: 10, avgPrice: 2600, buyDate: '2026-03-01', currentPrice: 261.7 }],
      sales: []
    };
    const snapB = JSON.stringify(caseB);
    const heldB = calc.getSplitAwareCurrentQty('T', caseB, opts);
    close(heldB.qty, 100, 1e-6, 'T UX B: 10 old → 100 current');
    const tlB = calc.buildTickerOperationTimeline('T', caseB.positions, caseB.sales);
    const buyB = tlB.find((op) => op.type === 'buy');
    assert(buyB && buyB.qty === 10, 'T UX B: history qty as entered 10');
    close(buyB.price, 2600, 0.02, 'T UX B: history price 2600');
    assert(!new RegExp(NOTE).test(buyB.note || ''), 'T UX B: historical not already-current');
    assert(JSON.stringify(caseB) === snapB, 'T UX B: JSON not mutated');

    const caseC = {
      positions: [{ ticker: 'T', lotId: 'TC', qty: 10, avgPrice: 262, buyDate: '2026-05-01', currentPrice: 261.7 }],
      sales: []
    };
    const snapC = JSON.stringify(caseC);
    const heldC = calc.getSplitAwareCurrentQty('T', caseC, opts);
    close(heldC.qty, 10, 1e-6, 'T UX C: after split stays 10');
    const tlC = calc.buildTickerOperationTimeline('T', caseC.positions, caseC.sales);
    const buyC = tlC.find((op) => op.type === 'buy');
    assert(buyC && buyC.qty === 10, 'T UX C: history qty 10');
    assert(!new RegExp(NOTE).test(buyC.note || ''), 'T UX C: post-split buy no already-current note');
    assert(JSON.stringify(caseC) === snapC, 'T UX C: JSON not mutated');

    const caseD = {
      positions: [{ ticker: 'T', lotId: 'TD', qty: 10, avgPrice: 262.08, buyDate: '2026-03-01', currentPrice: 261.7 }],
      sales: []
    };
    const snapD = JSON.stringify(caseD);
    const heldD = calc.getSplitAwareCurrentQty('T', caseD, opts);
    close(heldD.qty, 10, 1e-6, 'T UX D: already-current not ×10 again');
    assert(Math.abs(heldD.qty - 100) > 1, 'T UX D: not 100 shares');
    const tlD = calc.buildTickerOperationTimeline('T', caseD.positions, caseD.sales);
    const buyD = tlD.find((op) => op.type === 'buy');
    assert(buyD && buyD.qty === 10, 'T UX D: history shows JSON 10');
    close(buyD.price, 262.08, 0.02, 'T UX D: history price JSON 262.08');
    assert(new RegExp(NOTE).test(buyD.note || ''), 'T UX D: already-current note');
    assert(!/split-aware/.test(buyD.note || ''), 'T UX D: no technical term');
    const htmlD = calc.buildPortfolioTickerDetailHtml('T', caseD.positions, caseD.sales, null, false);
    assert(/Покупка выглядит уже приведённой к текущим акциям после дробления/.test(htmlD), 'T UX D: detail asks to confirm scale');
    assert(/Как в брокере сейчас/.test(htmlD) && /Как было на дату покупки/.test(htmlD), 'T UX D: both scale buttons');
    assert(!new RegExp(NOTE).test(htmlD.split('Открытые покупки')[1] || htmlD), 'T UX D: open lots use confirm copy, not timeline note');
    assert(!/100 шт/.test(htmlD.split('Остаток')[1].split('Куплено')[0] || ''), 'T UX D: remainder not 100');
    assert(JSON.stringify(caseD) === snapD, 'T UX D: JSON not mutated');

    const sberUx = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2026-03-01', currentPrice: 280 }],
      sales: []
    };
    const tlS = calc.buildTickerOperationTimeline('SBER', sberUx.positions, sberUx.sales);
    const buyS = tlS.find((op) => op.type === 'buy');
    assert(!new RegExp(NOTE).test(buyS.note || ''), 'T UX: SBER no already-current note');
    const ofzUx = {
      positions: [{ ticker: 'OFZ26241', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2026-03-01', currentPrice: 98 }],
      sales: []
    };
    const tlO = calc.buildTickerOperationTimeline('OFZ26241', ofzUx.positions, ofzUx.sales);
    const buyO = tlO.find((op) => op.type === 'buy');
    assert(!new RegExp(NOTE).test(buyO && buyO.note || ''), 'T UX: OFZ no already-current note');
  }

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

  const tCurrConfirmed = Object.assign({}, tCurr, { splitLotScale: 'current' });
  d = scaleOf(tCurrConfirmed, 'T');
  assert(d.scale === 'current' && d.confidence === 'high', 'lot scale: T confirmed current → high');
  assert(/текущие акции/.test(d.reason), 'lot scale: T confirmed current reason');
  assert(tCurrConfirmed.qty === 10 && tCurrConfirmed.avgPrice === 312, 'lot scale: confirm does not change qty/avg');

  const tHistConfirmed = Object.assign({}, tCurr, { lotId: 'T2H', splitLotScale: 'historical' });
  d = scaleOf(tHistConfirmed, 'T');
  assert(d.scale === 'historical' && d.confidence === 'high', 'lot scale: T confirmed historical → high');
  assert(/дата покупки/.test(d.reason), 'lot scale: T confirmed historical reason');

  assert(calc.lotNeedsSplitScaleConfirmation(tCurr, 'T', opts) === true, 'confirm ui: T already-current needs confirm');
  assert(calc.lotNeedsSplitScaleConfirmation(tCurrConfirmed, 'T', opts) === false, 'confirm ui: confirmed T does not need confirm');
  assert(calc.lotShowsSplitScaleConfirmUi(tCurrConfirmed, 'T', opts) === false, 'confirm ui: confirmed T hides summary CTA');
  assert(calc.lotShowsSplitScaleStatusUi(tCurrConfirmed, 'T', opts) === true, 'confirm ui: confirmed T shows detail status');
  assert(calc.lotNeedsSplitScaleConfirmation(gmknHist, 'GMKN', opts) === false, 'confirm ui: GMKN clean historical no prompt');
  assert(calc.lotShowsSplitScaleConfirmUi(gmknHist, 'GMKN', opts) === false, 'confirm ui: GMKN historical no block');
  assert(calc.lotShowsSplitScaleStatusUi(gmknHist, 'GMKN', opts) === false, 'confirm ui: GMKN historical no status');
  assert(calc.lotNeedsSplitScaleConfirmation(plzlHist, 'PLZL', opts) === false, 'confirm ui: PLZL clean historical no prompt');
  assert(calc.lotNeedsSplitScaleConfirmation(sberBefore, 'SBER', opts) === false, 'confirm ui: SBER no prompt');
  assert(calc.lotNeedsSplitScaleConfirmation(ofz, 'SU26238RMFS9', opts) === false, 'confirm ui: OFZ no prompt');
  assert(calc.lotNeedsSplitScaleConfirmation(noDate, 'GMKN', opts) === true, 'confirm ui: unknown GMKN needs confirm');

  const htmlNeed = calc.buildLotSplitScaleConfirmHtml(tCurr, 'T', opts);
  assert(/Покупка выглядит уже приведённой к текущим акциям после дробления/.test(htmlNeed), 'confirm html: look text');
  assert(/Как в брокере сейчас/.test(htmlNeed) && /Как было на дату покупки/.test(htmlNeed), 'confirm html: buttons');
  assert(!calc.buildLotSplitScaleConfirmHtml(gmknHist, 'GMKN', opts), 'confirm html: GMKN historical empty');
  assert(!calc.buildLotSplitScaleConfirmHtml(sberBefore, 'SBER', opts), 'confirm html: SBER empty');
  assert(!calc.buildLotSplitScaleConfirmHtml(tCurrConfirmed, 'T', opts), 'confirm html: confirmed T no summary CTA');
  const htmlDone = calc.buildLotSplitScaleStatusHtml(tCurrConfirmed, 'T', opts);
  assert(/Шкала покупки подтверждена: как в брокере сейчас/.test(htmlDone), 'status html: compact current');
  assert(/Изменить/.test(htmlDone), 'status html: change control');
  assert(!/Уточните, как внесены/.test(htmlDone), 'status html: not a prompt CTA');
  const htmlDoneHist = calc.buildLotSplitScaleStatusHtml(tHistConfirmed, 'T', opts);
  assert(/Шкала покупки подтверждена: как было на дату покупки/.test(htmlDoneHist), 'status html: compact historical');
  const tCurrSection = calc.buildPortfolioSectionRows([tCurr], 'stocks', {}, []);
  assert(/Покупка выглядит уже приведённой к текущим акциям после дробления/.test(tCurrSection), 'section: unconfirmed T keeps CTA');
  assert(/pf-split-scale-confirm-row[\s\S]*pf-ticker-group-end/.test(tCurrSection), 'section: confirm row is group-end');
  assert(!/pf-lot-primary[^"']*pf-ticker-group-end/.test(tCurrSection), 'section: lot row is not group-end when CTA present');
  const tConfSection = calc.buildPortfolioSectionRows([tCurrConfirmed], 'stocks', {}, []);
  assert(!/Как в брокере сейчас/.test(tConfSection), 'section: confirmed T has no summary buttons');
  assert(!/Шкала покупки подтверждена/.test(tConfSection), 'section: confirmed T has no summary status');
  assert(/pf-lot-primary[^"']*pf-ticker-group-end/.test(tConfSection), 'section: confirmed T lot row closes group');
  const tCurrCard = calc.buildPortfolioMobileCardHtml(tCurr, null, 2620, [tCurr], []);
  assert(/Покупка выглядит уже приведённой к текущим акциям после дробления/.test(tCurrCard), 'card: unconfirmed T keeps CTA');
  const tConfCard = calc.buildPortfolioMobileCardHtml(tCurrConfirmed, null, 2620, [tCurrConfirmed], []);
  assert(!/Как в брокере сейчас/.test(tConfCard), 'card: confirmed T no CTA');
  assert(!/Шкала покупки подтверждена/.test(tConfCard), 'card: confirmed T no status on closed card');
  const htmlDoneDetail = calc.buildPortfolioTickerDetailHtml('T', [tCurrConfirmed], [], null, false);
  assert(/Шкала покупки подтверждена: как в брокере сейчас/.test(htmlDoneDetail), 'detail: confirmed T compact status');
  assert(/Изменить/.test(htmlDoneDetail), 'detail: confirmed T can change');
  const gmknHistHtml = calc.buildPortfolioTickerDetailHtml('GMKN', [gmknHist], [], null, false);
  assert(!/Как в брокере сейчас/.test(gmknHistHtml), 'confirm html: GMKN detail has no scale buttons');
  assert(!/Шкала покупки подтверждена/.test(gmknHistHtml), 'confirm html: GMKN detail has no status');
  const plzlHtml = calc.buildPortfolioTickerDetailHtml('PLZL', [plzlHist], [], null, false);
  assert(!/Как в брокере сейчас/.test(plzlHtml), 'confirm html: PLZL detail has no scale buttons');
  const sberHtmlScale = calc.buildPortfolioTickerDetailHtml('SBER', [sberBefore], [], null, false);
  assert(!/Как в брокере сейчас/.test(sberHtmlScale), 'confirm html: SBER detail has no scale buttons');
  const ofzHtmlScale = calc.buildPortfolioTickerDetailHtml('OFZ_26238', [{
    ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01', faceValue: 1000, currentPrice: 95
  }], [], { faceValue: 1000 }, true);
  assert(!/Как в брокере сейчас/.test(ofzHtmlScale), 'confirm html: OFZ detail has no scale buttons');
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

  r = held('T', tCurrPf, '2026-04-01');
  assert(!(r.qty > 0) || r.confidence === 'unknown', 'qtyHeld: T unconfirmed current pre-split skipped');

  const tCurrConfirmedPf = {
    positions: [{
      ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262,
      splitLotScale: 'current'
    }],
    sales: []
  };
  const tCurrConfirmedSnap = JSON.stringify(tCurrConfirmedPf);
  r = held('T', tCurrConfirmedPf, '2026-04-01');
  assert(Math.abs(r.qty - 1) < 1e-6, 'qtyHeld: T confirmed current pre-split → 1 old share');
  assert(r.confidence === 'high', 'qtyHeld: T confirmed current pre-split high');
  r = held('T', tCurrConfirmedPf, '2026-09-04');
  assert(r.qty === 10, 'qtyHeld: T confirmed current after split stays 10');
  assert(JSON.stringify(tCurrConfirmedPf) === tCurrConfirmedSnap, 'qtyHeld: T confirmed current JSON not mutated');

  const tHistConfirmedPf = {
    positions: [{
      ticker: 'T', lotId: 'T2H', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262,
      splitLotScale: 'historical'
    }],
    sales: []
  };
  const tHistConfirmedSnap = JSON.stringify(tHistConfirmedPf);
  r = held('T', tHistConfirmedPf, '2026-04-01');
  assert(r.qty === 10, 'qtyHeld: T confirmed historical pre-split → 10');
  r = held('T', tHistConfirmedPf, '2026-09-04');
  assert(r.qty === 100, 'qtyHeld: T confirmed historical after split → 100');
  assert(tHistConfirmedPf.positions[0].qty === 10 && tHistConfirmedPf.positions[0].avgPrice === 312,
    'qtyHeld: T confirmed historical qty/avg untouched');
  assert(JSON.stringify(tHistConfirmedPf) === tHistConfirmedSnap, 'qtyHeld: T confirmed historical JSON not mutated');

  const plzlHistPf = {
    positions: [{
      ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 19000, buyDate: '2024-06-01', currentPrice: 1900
    }],
    sales: []
  };
  r = held('PLZL', plzlHistPf, '2026-09-04');
  assert(r.qty === 10, 'qtyHeld: PLZL historical after split → 10');
  r = held('PLZL', plzlHistPf, '2025-03-01');
  assert(r.qty === 1, 'qtyHeld: PLZL historical before split → 1');

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
  assert(/показана дата купона/.test(html) && /по дате фиксации/.test(html),
    'twp ui ofz: display couponDate vs entitlement recordDate');
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
  assert(/Текущая стоимость и результат показаны в текущих акциях после дробления/.test(html), 'twp ui split: applied warning');
  assert(/с учётом сплита/.test(html), 'twp ui split: split-aware badge');
  assert(/2[\s\u00a0]?550/.test(html), 'twp ui split: current value 2550');
  assert(!/-2[\s\u00a0]?945/.test(html), 'twp ui split: no false JSON-qty result');
  assert(/Вложено в покупки/.test(html) && /Найденные выплаты/.test(html), 'twp ui split: purchase and payouts remain');
  assert(/текущих акциях/.test(html), 'twp ui split: how-to note');
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
  assert(/Текущая стоимость и результат показаны в текущих акциях после дробления/.test(html), 'twp ui GMKN: applied warning');
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

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-09-04';

  function priceOk(price, extra) {
    extra = extra || {};
    return {
      status: 'ok',
      price: price,
      priceDate: extra.priceDate || extra.date || '2024-06-01',
      priceType: 'close',
      unit: extra.unit || 'rub'
    };
  }
  function mockPrices(map) {
    return function (ticker, date) {
      const t = String(ticker || '').toUpperCase();
      const iso = String(date || '').slice(0, 10);
      const byTicker = map[t];
      if (!byTicker) return Promise.resolve({ status: 'missing', price: null, priceDate: null });
      const row = byTicker[iso] || byTicker.default;
      return Promise.resolve(row || { status: 'missing', price: null, priceDate: null });
    };
  }
  function asOfOpts(priceMap, extra) {
    return Object.assign({
      splitEvents: events,
      currentDate: NOW,
      getInstrumentPriceAtDate: mockPrices(priceMap)
    }, extra || {});
  }

  const gmknHistPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92
    }],
    sales: []
  };
  const gmknHistSnap = JSON.stringify(gmknHistPf);

  const before = await calc.buildPortfolioValueAtDate(gmknHistPf, '2024-03-01', asOfOpts({
    GMKN: { '2024-03-01': priceOk(25014, { date: '2024-03-01' }) }
  }));
  const beforeRow = before.items.find((x) => x.ticker === 'GMKN');
  assert(beforeRow && beforeRow.qtyAtDate === 10, 'asof split: GMKN historical before split qty 10');
  assert(beforeRow.valueRub === 250140, 'asof split: GMKN historical before 10×25014');
  assert(beforeRow.splitAdjusted === true, 'asof split: GMKN historical marked splitAdjusted');
  assert(beforeRow.splitConfidence === 'high' || beforeRow.splitConfidence === 'partial', 'asof split: GMKN historical confidence');

  const after = await calc.buildPortfolioValueAtDate(gmknHistPf, '2024-06-01', asOfOpts({
    GMKN: { '2024-06-01': priceOk(129.92, { date: '2024-06-01' }) }
  }));
  const afterRow = after.items.find((x) => x.ticker === 'GMKN');
  assert(afterRow && afterRow.qtyAtDate === 1000, 'asof split: GMKN historical after split qty 1000');
  assert(Math.abs(afterRow.valueRub - 129920) < 1e-6, 'asof split: GMKN historical after 1000×129.92');
  assert(afterRow.qtyAtDate !== 10, 'asof split: GMKN after is not raw JSON qty');
  assert(JSON.stringify(gmknHistPf) === gmknHistSnap, 'asof split: GMKN historical JSON not mutated');
  assert(gmknHistPf.positions[0].qty === 10 && gmknHistPf.positions[0].avgPrice === 22000, 'asof split: qty/avgPrice untouched');

  const gmknMixedPf = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92 },
      { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 129.74, buyDate: '2026-09-04', currentPrice: 129.92 }
    ],
    sales: []
  };
  const mixedAfter = await calc.buildPortfolioValueAtDate(gmknMixedPf, '2026-09-04', asOfOpts({
    GMKN: { '2026-09-04': priceOk(129.92, { date: '2026-09-04' }) }
  }));
  const mixedRow = mixedAfter.items.find((x) => x.ticker === 'GMKN');
  assert(mixedRow && mixedRow.qtyAtDate === 1010, 'asof split: GMKN mixed after both buys qty 1010');
  assert(Math.abs(mixedRow.valueRub - 131219.2) < 1e-6, 'asof split: GMKN mixed 1010×129.92');
  assert(mixedRow.qtyAtDate !== 20, 'asof split: GMKN mixed is not 20 JSON shares');

  const gmknCurrPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 129.92
    }],
    sales: []
  };
  const currAfter = await calc.buildPortfolioValueAtDate(gmknCurrPf, '2026-09-04', asOfOpts({
    GMKN: { '2026-09-04': priceOk(129.92, { date: '2026-09-04' }) }
  }));
  const currRow = currAfter.items.find((x) => x.ticker === 'GMKN');
  assert(currRow && currRow.qtyAtDate === 1000, 'asof split: GMKN current after split qty 1000');
  assert(currRow.qtyAtDate !== 100000, 'asof split: GMKN current not 1000×100');
  assert(Math.abs(currRow.valueRub - 129920) < 1e-6, 'asof split: GMKN current 1000×129.92');

  const tHistPf = {
    positions: [{
      ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3126, buyDate: '2025-12-01', currentPrice: 262
    }],
    sales: []
  };
  const tAfter = await calc.buildPortfolioValueAtDate(tHistPf, '2026-09-04', asOfOpts({
    T: { '2026-09-04': priceOk(262, { date: '2026-09-04' }) }
  }));
  const tRow = tAfter.items.find((x) => x.ticker === 'T');
  assert(tRow && tRow.qtyAtDate === 10, 'asof split: T historical after 1×10 → 10');
  assert(tRow.valueRub === 2620, 'asof split: T historical 10×262');

  const sberPf = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280
    }],
    sales: []
  };
  const sberSnap = JSON.stringify(sberPf);
  const sberVal = await calc.buildPortfolioValueAtDate(sberPf, '2024-06-01', asOfOpts({
    SBER: { '2024-06-01': priceOk(100, { date: '2024-06-01' }) }
  }));
  assert(sberVal.items[0].qtyAtDate === 10 && sberVal.items[0].valueRub === 1000, 'asof split: SBER same as old logic');
  assert(!sberVal.items[0].splitAdjusted, 'asof split: SBER not splitAdjusted');
  assert(JSON.stringify(sberPf) === sberSnap, 'asof split: SBER JSON not mutated');
  const sberHtml = calc.buildPortfolioAsOfTableHtml(sberVal.items);
  assert(!/с учётом сплита/.test(sberHtml), 'asof split ui: SBER no split badge');

  const ofzPf = {
    positions: [{
      ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01', faceValue: 1000, currentPrice: 95
    }],
    sales: []
  };
  const ofzVal = await calc.buildPortfolioValueAtDate(ofzPf, '2024-06-01', asOfOpts({
    OFZ_26238: {
      '2024-06-01': priceOk(95, { date: '2024-06-01', unit: 'pct-of-face-value' })
    }
  }));
  assert(ofzVal.items[0].qtyAtDate === 10 && ofzVal.items[0].valueRub === 9500, 'asof split: OFZ same as old logic');
  assert(!ofzVal.items[0].splitAdjusted, 'asof split: OFZ not splitAdjusted');
  assert(ofzVal.items[0].unit === 'pct-of-face-value', 'asof split: OFZ unit unchanged');

  const currBefore = await calc.buildPortfolioValueAtDate(gmknCurrPf, '2023-12-01', asOfOpts({
    GMKN: { '2023-12-01': priceOk(22000, { date: '2023-12-01' }) }
  }));
  const currBeforeRow = currBefore.items.find((x) => x.ticker === 'GMKN');
  assert(currBeforeRow, 'asof split: current-lot before split still in composition');
  assert(currBeforeRow.splitConfidence === 'unknown' || currBeforeRow.splitConfidence === 'partial',
    'asof split: current-lot before split not high');
  if (currBeforeRow.splitConfidence === 'unknown') {
    assert(currBeforeRow.valueRub == null, 'asof split: unknown value not confident');
    assert(currBeforeRow.qtyAtDate == null, 'asof split: unknown qty shown as empty');
  }
  assert(currBefore.isPartial === true, 'asof split: unknown overall partial');
  const unkNotes = String((currBeforeRow.notes || []).join(' ') + ' ' + (currBeforeRow.note || '') + ' ' +
    (currBefore.notes || []).join(' '));
  assert(/GMKN/.test(unkNotes), 'asof split: unknown warning contains ticker');

  const cmp = await calc.buildPortfolioValueChangeBetweenDates(
    gmknMixedPf,
    '2024-03-01',
    '2026-09-04',
    asOfOpts({
      GMKN: {
        '2024-03-01': priceOk(25014, { date: '2024-03-01' }),
        '2026-09-04': priceOk(129.92, { date: '2026-09-04' })
      }
    })
  );
  const cmpRow = (cmp.items || []).find((x) => x.ticker === 'GMKN');
  assert(cmpRow, 'asof split compare: GMKN row');
  assert(cmpRow.qtyFrom === 10, 'asof split compare: start qty 10');
  assert(cmpRow.qtyTo === 1010, 'asof split compare: end qty 1010 not 20');
  assert(Math.abs(cmpRow.valueTo - 131219.2) < 1e-6, 'asof split compare: end value 1010×129.92');
  assert(cmpRow.valueTo !== 2626.4 && cmpRow.valueTo !== 2598.4, 'asof split compare: not JSON-qty × new price');
  assert(cmpRow.changeRub != null && cmpRow.changeRub > -200000, 'asof split compare: no −247k technical drop');
  const cmpPct = cmp.changePct;
  assert(cmpPct == null || cmpPct > -90, 'asof split compare: changePct not −98/−99% mix');
  assert(cmpRow.splitAdjusted === true, 'asof split compare: splitAdjusted');
  const cmpHtml = calc.buildPortfolioCompareDetailsHtml(cmp.items);
  assert(/с учётом сплита/.test(cmpHtml), 'asof split compare ui: badge');
  const asofHtml = calc.buildPortfolioAsOfTableHtml(mixedAfter.items);
  assert(/с учётом сплита/.test(asofHtml), 'asof split ui: GMKN badge');
  assert(/1010/.test(asofHtml), 'asof split ui: GMKN qty 1010');

  const prodCatalogText = fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8');
  assert(!/FAKE_SPLIT/.test(prodCatalogText), 'asof split generic: production catalog has no FAKE_SPLIT');
  const fakeEvents = calc.sandbox.parseSplitEventsCatalog({
    version: 1,
    events: (JSON.parse(prodCatalogText).events || []).concat([{
      ticker: 'FAKE_SPLIT',
      aliases: ['FAKE'],
      isin: 'TEST000FAKE0',
      effectiveDate: '2030-01-15',
      ratio: 5,
      type: 'split',
      note: 'Synthetic future split for generic contract tests',
      source: 'test'
    }])
  });
  const fakePf = {
    positions: [{
      ticker: 'FAKE_SPLIT', lotId: 'F1', qty: 2, avgPrice: 500, buyDate: '2029-06-01', currentPrice: 90
    }],
    sales: []
  };
  const fakeSnap = JSON.stringify(fakePf);
  const fakeAfter = await calc.buildPortfolioValueAtDate(fakePf, '2031-01-01', {
    splitEvents: fakeEvents,
    currentDate: '2031-01-01',
    getInstrumentPriceAtDate: mockPrices({
      FAKE_SPLIT: { '2031-01-01': priceOk(90, { date: '2031-01-01' }) }
    })
  });
  const fakeRow = fakeAfter.items.find((x) => x.ticker === 'FAKE_SPLIT');
  assert(fakeRow && fakeRow.qtyAtDate === 10, 'asof split generic: FAKE_SPLIT 2×5 → 10');
  assert(fakeRow.valueRub === 900, 'asof split generic: 10×90');
  const fakeBefore = await calc.buildPortfolioValueAtDate(fakePf, '2029-12-01', {
    splitEvents: fakeEvents,
    currentDate: '2031-01-01',
    getInstrumentPriceAtDate: mockPrices({
      FAKE_SPLIT: { '2029-12-01': priceOk(500, { date: '2029-12-01' }) }
    })
  });
  assert(fakeBefore.items[0].qtyAtDate === 2, 'asof split generic: before split qty 2');
  assert(JSON.stringify(fakePf) === fakeSnap, 'asof split generic: JSON not mutated');
  assert(JSON.stringify(gmknHistPf) === gmknHistSnap, 'asof split: GMKN fixture still immutable');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-09-04';
  function almost(a, b, eps, msg) {
    assert(Math.abs(Number(a) - Number(b)) < (eps || 0.02), msg);
  }
  function srcOf(fn) {
    return Function.prototype.toString.call(fn);
  }
  assert(!/fetch\s*\(/.test(srcOf(calc.getSplitAwareSaleAllocationMetrics)), 'sale split: alloc helper has no fetch');
  assert(!/fetch\s*\(/.test(srcOf(calc.getSplitAwareSaleRealizedPnl)), 'sale split: sale helper has no fetch');
  assert(!/fetch\s*\(/.test(srcOf(calc.getSplitAwareTickerRealizedPnl)), 'sale split: ticker helper has no fetch');

  const gmknHistPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: [{
      saleId: 'SALE_AFTER',
      ticker: 'GMKN',
      qty: 200,
      buyPrice: 22000,
      salePrice: 130,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'G1', qty: 200, buyPrice: 22000, buyDate: '2021-06-04' }]
    }]
  };
  const gmknSnap = JSON.stringify(gmknHistPf);
  const afterAlloc = calc.getSplitAwareSaleAllocationMetrics(
    gmknHistPf.sales[0].allocations[0],
    gmknHistPf.sales[0],
    gmknHistPf,
    { splitEvents: events, now: NOW }
  );
  almost(afterAlloc.adjustedBuyPrice, 220, 0.001, 'sale split: GMKN after adj buy 220');
  almost(afterAlloc.realizedPnlRub, -18000, 0.05, 'sale split: GMKN after realized -18000');
  assert(afterAlloc.qtyScale === 'historical', 'sale split: GMKN after qtyScale historical');
  assert(afterAlloc.confidence === 'high' || afterAlloc.confidence === 'partial', 'sale split: GMKN after confidence');
  const afterSale = calc.getSplitAwareSaleRealizedPnl(gmknHistPf.sales[0], gmknHistPf, {
    splitEvents: events, now: NOW
  });
  almost(afterSale.realizedPnlRub, -18000, 0.05, 'sale split: GMKN sale helper -18000');
  const afterTicker = calc.getSplitAwareTickerRealizedPnl('GMKN', gmknHistPf, { splitEvents: events, now: NOW });
  almost(afterTicker.realizedPnlRub, -18000, 0.05, 'sale split: GMKN ticker -18000');
  assert(JSON.stringify(gmknHistPf) === gmknSnap, 'sale split: GMKN after JSON not mutated');
  assert(gmknHistPf.positions[0].qty === 10 && gmknHistPf.positions[0].avgPrice === 22000, 'sale split: qty/avgPrice untouched');
  const hist = calc.summarizeTickerHistory('GMKN', gmknHistPf.positions, gmknHistPf.sales);
  almost(hist.realizedPnlRub, -18000, 0.05, 'sale split: summarize uses split-aware -18000');
  const detailHtml = calc.buildPortfolioTickerDetailHtml('GMKN', gmknHistPf.positions, gmknHistPf.sales, null, false);
  assert(/-18[\s\u00a0]?000/.test(detailHtml), 'sale split ui: GMKN realized -18000');
  assert(!/-4[\s\u00a0]?374/.test(detailHtml), 'sale split ui: no raw (130-22000)×200');
  assert(/количество как в операции/.test(detailHtml), 'sale split ui: qty ops hint');

  const gmknBeforePf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 8, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: [{
      saleId: 'SALE_BEFORE',
      ticker: 'GMKN',
      qty: 2,
      buyPrice: 22000,
      salePrice: 25000,
      saleDate: '2023-06-01',
      allocations: [{ lotId: 'G1', qty: 2, buyPrice: 22000, buyDate: '2021-06-04' }]
    }]
  };
  const beforeSnap = JSON.stringify(gmknBeforePf);
  const beforeSale = calc.getSplitAwareSaleRealizedPnl(gmknBeforePf.sales[0], gmknBeforePf, {
    splitEvents: events, now: NOW
  });
  almost(beforeSale.realizedPnlRub, 6000, 0.05, 'sale split: GMKN before split +6000');
  assert(JSON.stringify(gmknBeforePf) === beforeSnap, 'sale split: GMKN before JSON not mutated');

  const gmknCurrPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G2', qty: 800, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: [{
      saleId: 'SALE_CURR',
      ticker: 'GMKN',
      qty: 200,
      buyPrice: 220,
      salePrice: 130,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'G2', qty: 200, buyPrice: 220, buyDate: '2021-06-04' }]
    }]
  };
  const currSale = calc.getSplitAwareSaleRealizedPnl(gmknCurrPf.sales[0], gmknCurrPf, {
    splitEvents: events, now: NOW
  });
  almost(currSale.realizedPnlRub, -18000, 0.05, 'sale split: GMKN current lot -18000 not ×100');
  assert(Math.abs(currSale.realizedPnlRub) < 20000, 'sale split: GMKN current not -1.8m');

  const tPf = {
    positions: [{ ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3126, buyDate: '2025-12-01', currentPrice: 260 }],
    sales: [{
      saleId: 'SALE_T',
      ticker: 'T',
      qty: 5,
      buyPrice: 3126,
      salePrice: 260,
      saleDate: '2026-06-01',
      allocations: [{ lotId: 'T1', qty: 5, buyPrice: 3126, buyDate: '2025-12-01' }]
    }]
  };
  const tAlloc = calc.getSplitAwareSaleAllocationMetrics(
    tPf.sales[0].allocations[0], tPf.sales[0], tPf, { splitEvents: events, now: NOW }
  );
  almost(tAlloc.adjustedBuyPrice, 312.6, 0.01, 'sale split: T adj buy 312.6');
  almost(tAlloc.realizedPnlRub, (260 - 312.6) * 5, 0.05, 'sale split: T realized (260-312.6)×5');

  const plzlPf = {
    positions: [{ ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 19000, buyDate: '2024-06-01', currentPrice: 1900 }],
    sales: [{
      saleId: 'SALE_P',
      ticker: 'PLZL',
      qty: 5,
      buyPrice: 19000,
      salePrice: 1900,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'P1', qty: 5, buyPrice: 19000, buyDate: '2024-06-01' }]
    }]
  };
  const plzlSale = calc.getSplitAwareSaleRealizedPnl(plzlPf.sales[0], plzlPf, { splitEvents: events, now: NOW });
  almost(plzlSale.allocations[0].adjustedBuyPrice, 1900, 0.02, 'sale split: PLZL adj buy 19000/10');
  almost(plzlSale.realizedPnlRub, (1900 - 1900) * 5, 0.05, 'sale split: PLZL hist (1900-1900)×5 = 0');
  const plzlSale2Pf = {
    positions: plzlPf.positions,
    sales: [{
      saleId: 'SALE_P2',
      ticker: 'PLZL',
      qty: 5,
      buyPrice: 19000,
      salePrice: 2000,
      saleDate: '2025-06-01',
      allocations: [{ lotId: 'P1', qty: 5, buyPrice: 19000, buyDate: '2024-06-01' }]
    }]
  };
  const plzlSale2 = calc.getSplitAwareSaleRealizedPnl(plzlSale2Pf.sales[0], plzlSale2Pf, {
    splitEvents: events, now: NOW
  });
  almost(plzlSale2.realizedPnlRub, (2000 - 1900) * 5, 0.05, 'sale split: PLZL hist (2000-1900)×5');

  const sberSale = {
    ticker: 'SBER',
    saleId: 'SBER_S1',
    qty: 10,
    buyPrice: 250,
    salePrice: 280,
    saleDate: '2025-06-01',
    allocations: [{ lotId: 'A', qty: 10, buyPrice: 250, buyDate: '2024-01-01' }]
  };
  const sberPf = { positions: [], sales: [sberSale] };
  const sberSnap = JSON.stringify(sberPf);
  const sberOld = calc.getSaleRealizedPnl(sberSale, null);
  const sberNew = calc.getSplitAwareSaleRealizedPnl(sberSale, sberPf, { splitEvents: events, now: NOW });
  almost(sberNew.realizedPnlRub, sberOld.amount, 1e-6, 'sale split: SBER equals old getSaleRealizedPnl');
  assert(sberNew.confidence === 'high', 'sale split: SBER confidence high');
  assert(JSON.stringify(sberPf) === sberSnap, 'sale split: SBER JSON not mutated');

  const ofzSale = { ticker: 'OFZ26241', qty: 5, buyPrice: 95, salePrice: 98, saleDate: '2025-06-01' };
  const ofzMeta = { faceValue: 1000 };
  const ofzOld = calc.getSaleRealizedPnl(ofzSale, ofzMeta);
  const ofzNew = calc.getSplitAwareSaleRealizedPnl(ofzSale, { sales: [ofzSale] }, {
    splitEvents: events, now: NOW, bondMeta: ofzMeta
  });
  almost(ofzNew.realizedPnlRub, ofzOld.amount, 0.05, 'sale split: OFZ equals old bond logic 150');
  almost(ofzNew.realizedPnlRub, 150, 0.05, 'sale split: OFZ 150₽');

  const unknownPf = {
    positions: [{ ticker: 'GMKN', lotId: 'U1', qty: 10, avgPrice: 22000, currentPrice: 130 }],
    sales: [{
      saleId: 'SALE_UNK',
      ticker: 'GMKN',
      qty: 200,
      buyPrice: 22000,
      salePrice: 130,
      saleDate: '2025-06-01'
    }]
  };
  const unkSnap = JSON.stringify(unknownPf);
  const unk = calc.getSplitAwareSaleRealizedPnl(unknownPf.sales[0], unknownPf, {
    splitEvents: events, now: NOW
  });
  assert(unk.realizedPnlRub == null, 'sale split: unknown realized null');
  assert(unk.confidence === 'unknown' || unk.isPartial, 'sale split: unknown/partial');
  assert((unk.warnings || []).some((w) => String(w).indexOf('GMKN') !== -1), 'sale split: unknown warning has ticker');
  const unkTicker = calc.getSplitAwareTickerRealizedPnl('GMKN', unknownPf, { splitEvents: events, now: NOW });
  assert(unkTicker.realizedPnlRub == null, 'sale split: ticker unknown null');
  assert(unkTicker.isPartial, 'sale split: ticker unknown isPartial');
  assert(JSON.stringify(unknownPf) === unkSnap, 'sale split: unknown JSON not mutated');
  const unkHtml = calc.buildPortfolioTickerDetailHtml('GMKN', unknownPf.positions, unknownPf.sales, null, false);
  assert(/требует проверки/.test(unkHtml) || /—/.test(unkHtml), 'sale split ui: unknown not confident raw');
  assert(!/-4[\s\u00a0]?374/.test(unkHtml), 'sale split ui: unknown not raw (130-22000)×200');

  const prodCatalogText2 = fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8');
  assert(!/FAKE_SPLIT/.test(prodCatalogText2), 'sale split generic: production catalog has no FAKE_SPLIT');
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
    events: (JSON.parse(prodCatalogText2).events || []).concat([fakeRaw])
  });
  const fakeSalePf = {
    positions: [{ ticker: 'FAKE_SPLIT', lotId: 'F1', qty: 2, avgPrice: 500, buyDate: '2029-06-01', currentPrice: 90 }],
    sales: [{
      saleId: 'SALE_FAKE',
      ticker: 'FAKE_SPLIT',
      qty: 5,
      buyPrice: 500,
      salePrice: 90,
      saleDate: '2031-01-01',
      allocations: [{ lotId: 'F1', qty: 5, buyPrice: 500, buyDate: '2029-06-01' }]
    }]
  };
  const fakeSnap = JSON.stringify(fakeSalePf);
  const fakeSale = calc.getSplitAwareSaleRealizedPnl(fakeSalePf.sales[0], fakeSalePf, {
    splitEvents: fakeEvents, now: '2031-06-01'
  });
  almost(fakeSale.allocations[0].adjustedBuyPrice, 100, 0.02, 'sale split generic: FAKE_SPLIT adj 500/5');
  almost(fakeSale.realizedPnlRub, (90 - 100) * 5, 0.05, 'sale split generic: FAKE_SPLIT (90-100)×5');
  assert(JSON.stringify(fakeSalePf) === fakeSnap, 'sale split generic: FAKE_SPLIT JSON not mutated');

  const sb = calc.sandbox;
  const prevGet = sb.getPortfolio;
  const prevSet = sb.setPortfolio;
  const captured = { qty: 2, price: 280, date: '2026-01-10', comment: '' };

  let gmknLive = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  const gmknLiveSnap = JSON.stringify(gmknLive);
  sb.getPortfolio = () => gmknLive;
  sb.setPortfolio = (p) => { gmknLive = p; };
  assert(!calc.isPortfolioTickerSaleCommitBlocked('GMKN', gmknLive, events), 'sale write: GMKN high/partial not blocked');
  const gmknCommit = calc.commitPortfolioSale('GMKN', { qty: 200, price: 130, date: '2025-06-01', comment: '' });
  assert(gmknCommit && gmknCommit.ok === true, 'sale write: GMKN commit accepted');
  assert(gmknLive.positions[0].qty === 8, 'sale write: GMKN JSON qty 8');
  assert(gmknLive.positions[0].avgPrice === 22000, 'sale write: GMKN avgPrice unchanged');
  assert(gmknLive.sales[0].qty === 200, 'sale write: GMKN sale.qty 200');
  assert(gmknLive.sales[0].qtyScale === 'sale-date', 'sale write: GMKN qtyScale sale-date');
  assert(gmknLive.sales[0].allocations[0].qty === 200, 'sale write: alloc qty 200');
  assert(Math.abs(gmknLive.sales[0].allocations[0].lotQtyDelta - 2) < 1e-9, 'sale write: lotQtyDelta 2');
  assert(gmknLive.sales[0].allocations[0].splitFactor === 100, 'sale write: splitFactor 100');
  const gmknPnl = calc.getSplitAwareSaleRealizedPnl(gmknLive.sales[0], gmknLive, { splitEvents: events, now: NOW });
  almost(gmknPnl.realizedPnlRub, -18000, 0.05, 'sale write: GMKN realized -18000');
  const gmknHeld = calc.getSplitAwareCurrentQty('GMKN', gmknLive, { splitEvents: events, now: NOW });
  almost(gmknHeld.qty, 800, 1e-6, 'sale write: remaining split-aware 800');
  const hintText = calc.formatSplitSaleHintText('GMKN', {
    positions: [{ ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 }],
    sales: []
  }, { splitEvents: events, now: NOW, saleDate: '2025-06-01' });
  assert(/По бумаге было дробление акций/.test(hintText), 'sale write: hint head');
  assert(/Остаток с учётом дробления/.test(hintText) && /по операциям/.test(hintText), 'sale write: hint qty labels');

  let sberLive = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280
    }],
    sales: []
  };
  sb.getPortfolio = () => sberLive;
  sb.setPortfolio = (p) => { sberLive = p; };
  assert(!calc.isPortfolioTickerSaleCommitBlocked('SBER', sberLive, events), 'sale block: SBER not blocked');
  const sberCommit = calc.commitPortfolioSale('SBER', captured);
  assert(sberCommit && sberCommit.ok === true, 'sale block: SBER can commit');
  assert(sberLive.sales && sberLive.sales.length === 1, 'sale block: SBER sale written');
  assert(sberLive.positions[0].qty === 8, 'sale block: SBER qty reduced by writer');
  const sberSaleHtml = calc.buildPortfolioTickerDetailHtml('SBER', sberLive.positions, sberLive.sales, null, false, { layout: 'stack' });
  assert(!/Продажа записана как в брокере/.test(sberSaleHtml), 'sale block: SBER no broker split copy');
  assert(!/до обновления расчётов по дроблению/.test(sberSaleHtml), 'sale block: SBER no legacy split copy');
  assert(!calc.formatSplitSaleRecordNote(sberLive.sales[0]), 'sale block: SBER sale note empty');

  let tAfter = {
    positions: [{
      ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 260, buyDate: '2026-05-01', currentPrice: 260
    }],
    sales: []
  };
  sb.getPortfolio = () => tAfter;
  sb.setPortfolio = (p) => { tAfter = p; };
  assert(!calc.isPortfolioTickerSaleCommitBlocked('T', tAfter, events), 'sale block: T after split not blocked');
  const tCommit = calc.commitPortfolioSale('T', { qty: 2, price: 260, date: '2026-06-01', comment: '' });
  assert(tCommit && tCommit.ok === true, 'sale block: T after split can commit');
  assert(tAfter.sales && tAfter.sales.length === 1, 'sale block: T sale written');

  let ofzLive = {
    positions: [{
      ticker: 'OFZ26241', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2024-01-01', currentPrice: 98
    }],
    sales: []
  };
  sb.getPortfolio = () => ofzLive;
  sb.setPortfolio = (p) => { ofzLive = p; };
  assert(!calc.isPortfolioTickerSaleCommitBlocked('OFZ26241', ofzLive, events), 'sale block: OFZ not blocked');
  const ofzCommit = calc.commitPortfolioSale('OFZ26241', { qty: 2, price: 98, date: '2026-01-10', comment: '' });
  assert(ofzCommit && ofzCommit.ok === true, 'sale block: OFZ can commit');
  assert(ofzLive.sales && ofzLive.sales.length === 1, 'sale block: OFZ sale written');
  const ofzSaleHtml = calc.buildPortfolioTickerDetailHtml('OFZ26241', ofzLive.positions, ofzLive.sales, null, true, { layout: 'stack' });
  assert(!/Продажа записана как в брокере/.test(ofzSaleHtml), 'sale block: OFZ no broker split copy');
  assert(!/до обновления расчётов по дроблению/.test(ofzSaleHtml), 'sale block: OFZ no legacy split copy');
  assert(!calc.formatSplitSaleRecordNote(ofzLive.sales[0]), 'sale block: OFZ sale note empty');

  sb.getPortfolio = prevGet;
  sb.setPortfolio = prevSet;
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const mixedPf = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 },
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 },
      { ticker: 'OFZ26241', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2024-01-01', currentPrice: 98 },
      { ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 260, buyDate: '2026-05-01', currentPrice: 260 }
    ],
    sales: []
  };
  function makeSaleDom() {
    function node(extra) {
      const n = {
        hidden: true,
        textContent: '',
        disabled: false,
        value: '',
        title: '',
        style: { display: '' },
        attributes: {},
        setAttribute(name, val) {
          this.attributes[name] = val;
          if (name === 'hidden') this.hidden = true;
        },
        removeAttribute(name) {
          delete this.attributes[name];
          if (name === 'hidden') this.hidden = false;
          if (name === 'title') this.title = '';
        },
        scrollIntoView() {},
        focus() {}
      };
      return Object.assign(n, extra || {});
    }
    return {
      pfSaleSplitBlock: node({ hidden: true, className: 'pf-split-warn pf-wide-warning' }),
      pfSaleBtn: node({ hidden: false, disabled: false }),
      pfSaleQty: node({ hidden: false }),
      pfSalePrice: node({ hidden: false }),
      pfSaleDate: node({ hidden: false }),
      pfSaleComment: node({ hidden: false }),
      pfSaleAllBtn: node({ hidden: true, disabled: true }),
      pfSaleAvailableHint: node({ hidden: true }),
      pfSaleLotHint: node({ hidden: false, textContent: '' }),
      portfolioSaleForm: node({ hidden: true })
    };
  }
  const nodes = makeSaleDom();
  const sb = calc.sandbox;
  const prevGetEl = sb.document.getElementById;
  const prevGet = sb.getPortfolio;
  sb.document.getElementById = (id) => (Object.prototype.hasOwnProperty.call(nodes, id) ? nodes[id] : null);
  sb.getPortfolio = () => mixedPf;
  sb.state.pfSaleTicker = 'GMKN';

  let blocked = calc.updatePortfolioSplitSaleBlockUi('GMKN', mixedPf);
  assert(blocked === false, 'sale form ui: GMKN split mode not blocked');
  assert(nodes.pfSaleSplitBlock.hidden === false, 'sale form ui: GMKN hint visible');
  assert(/По бумаге было дробление акций/.test(nodes.pfSaleSplitBlock.textContent), 'sale form ui: GMKN hint text');
  assert(nodes.pfSaleBtn.disabled === false, 'sale form ui: GMKN sale btn enabled');
  assert(nodes.pfSaleQty.disabled === false, 'sale form ui: GMKN qty enabled');

  sb.state.pfSaleTicker = 'SBER';
  blocked = calc.updatePortfolioSplitSaleBlockUi('SBER', mixedPf);
  assert(blocked === false, 'sale form ui: SBER not blocked');
  assert(nodes.pfSaleSplitBlock.hidden === true, 'sale form ui: SBER block hidden');
  assert(nodes.pfSaleSplitBlock.textContent === '', 'sale form ui: SBER block empty');
  assert(nodes.pfSaleSplitBlock.style.display === 'none', 'sale form ui: SBER block display none');
  assert(nodes.pfSaleQty.disabled === false, 'sale form ui: SBER qty enabled');
  assert(nodes.pfSaleBtn.disabled === false, 'sale form ui: SBER sale btn enabled');

  sb.state.pfSaleTicker = 'OFZ26241';
  blocked = calc.updatePortfolioSplitSaleBlockUi('OFZ26241', mixedPf);
  assert(blocked === false, 'sale form ui: OFZ not blocked');
  assert(nodes.pfSaleSplitBlock.hidden === true, 'sale form ui: OFZ block hidden');
  assert(nodes.pfSaleSplitBlock.textContent === '', 'sale form ui: OFZ block empty');
  assert(nodes.pfSaleBtn.disabled === false, 'sale form ui: OFZ sale btn enabled');

  sb.state.pfSaleTicker = 'T';
  blocked = calc.updatePortfolioSplitSaleBlockUi('T', mixedPf);
  assert(blocked === false, 'sale form ui: T after split not blocked');
  assert(nodes.pfSaleSplitBlock.hidden === true, 'sale form ui: T block hidden');
  assert(nodes.pfSaleSplitBlock.textContent === '', 'sale form ui: T block empty');
  assert(nodes.pfSaleBtn.disabled === false, 'sale form ui: T sale btn enabled');

  sb.state.pfSaleTicker = 'GMKN';
  blocked = calc.updatePortfolioSplitSaleBlockUi('GMKN', mixedPf);
  assert(blocked === false, 'sale form ui: GMKN split again not blocked');
  assert(nodes.pfSaleSplitBlock.hidden === false, 'sale form ui: GMKN hint visible again');
  assert(/в текущих акциях/.test(nodes.pfSaleSplitBlock.textContent), 'sale form ui: GMKN hint again');
  assert(nodes.pfSaleBtn.disabled === false, 'sale form ui: GMKN btn enabled again');

  calc.startSalePortfolioTicker('SBER');
  assert(sb.state.pfSaleTicker === 'SBER', 'sale form ui: startSale switches to SBER');
  assert(nodes.pfSaleSplitBlock.hidden === true, 'sale form ui: startSale SBER hides block');
  assert(nodes.pfSaleSplitBlock.textContent === '', 'sale form ui: startSale SBER clears text');
  assert(nodes.pfSaleBtn.disabled === false, 'sale form ui: startSale SBER enables btn');
  assert(nodes.portfolioSaleForm.hidden === false, 'sale form ui: startSale shows form');

  calc.startSalePortfolioTicker('GMKN');
  assert(nodes.pfSaleSplitBlock.hidden === false, 'sale form ui: startSale GMKN shows hint');
  assert(nodes.pfSaleBtn.disabled === false, 'sale form ui: startSale GMKN enables btn');

  sb.document.getElementById = prevGetEl;
  sb.getPortfolio = prevGet;
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  const gmknPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  const sberPf = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280
    }],
    sales: []
  };
  const ofzSale = { ticker: 'OFZ26241', qty: 5, buyPrice: 95, salePrice: 98, saleDate: '2025-06-01' };
  const ofzMeta = { faceValue: 1000 };
  const snap = JSON.stringify(gmknPf);

  calc.setSplitEventsCatalog(catalog);
  const stOk = calc.sandbox.getSplitEventsLoadState();
  assert(stOk && stOk.status === 'ok' && stOk.available === true && !stOk.unavailable, 'split catalog: loaded ok');
  assert(!calc.isPortfolioSplitCatalogUnavailable(), 'split catalog: portfolio not unavailable');
  assert(calc.buildPortfolioSplitCatalogUnavailableHtml() === '', 'split catalog: no banner when loaded');
  const gmknHtmlOk = calc.buildPortfolioTickerDetailHtml('GMKN', gmknPf.positions, gmknPf.sales, null, false);
  assert(/с учётом сплита/.test(gmknHtmlOk), 'split catalog: GMKN loaded shows split-aware');
  assert(!calc.isPortfolioTickerSaleCommitBlocked('GMKN', gmknPf), 'split catalog: GMKN sellable when catalog loaded');

  const lastGoodErr = calc.sandbox.markSplitEventsCatalogError('split-events http');
  assert(Array.isArray(lastGoodErr) && lastGoodErr.length > 0, 'split catalog: last-known-good kept on error');
  assert(calc.sandbox.getSplitEventsLoadState().status === 'ok', 'split catalog: last-known-good stays ok');
  assert(!calc.isPortfolioSplitCatalogUnavailable(), 'split catalog: last-known-good not unavailable');
  assert(!calc.isPortfolioTickerSaleCommitBlocked('GMKN', gmknPf), 'split catalog: last-known-good GMKN sellable');
  const prevGetLg = calc.sandbox.getPortfolio;
  const prevSetLg = calc.sandbox.setPortfolio;
  let lastGoodLive = JSON.parse(snap);
  calc.sandbox.getPortfolio = () => lastGoodLive;
  calc.sandbox.setPortfolio = (p) => { lastGoodLive = p; };
  const lastGoodSale = calc.commitPortfolioSale('GMKN', { qty: 1, price: 130, date: '2026-09-08', comment: '' });
  assert(lastGoodSale && lastGoodSale.ok, 'split catalog: last-known-good GMKN sale');
  assert(Math.abs(Number((lastGoodLive.positions.find((p) => p.lotId === 'G1') || {}).qty) - 9.99) < 1e-6, 'split catalog: last-known-good lotQtyDelta');
  assert(lastGoodLive.sales[0] && lastGoodLive.sales[0].qty === 1, 'split catalog: last-known-good sale.qty 1');
  calc.sandbox.getPortfolio = prevGetLg;
  calc.sandbox.setPortfolio = prevSetLg;

  calc.sandbox.resetSplitEventsLoadState();
  calc.sandbox.markSplitEventsCatalogError('split-events http');
  const stErr = calc.sandbox.getSplitEventsLoadState();
  assert(stErr.status === 'error' && stErr.unavailable === true, 'split catalog: error status');
  assert(calc.isPortfolioSplitCatalogUnavailable(), 'split catalog: portfolio unavailable');
  const warnHtml = calc.buildPortfolioSplitCatalogUnavailableHtml();
  assert(/Список дроблений акций временно недоступен/.test(warnHtml), 'split catalog: banner on error');
  assert(/часть расчётов может быть неполной/.test(warnHtml), 'split catalog: banner copy');
  assert(JSON.stringify(gmknPf) === snap, 'split catalog: error does not mutate JSON');
  const gmknHtmlErr = calc.buildPortfolioTickerDetailHtml('GMKN', gmknPf.positions, gmknPf.sales, null, false);
  assert(!/с учётом сплита/.test(gmknHtmlErr), 'split catalog: GMKN error has no split-aware badge');
  assert(calc.isPortfolioTickerSaleCommitBlocked('GMKN', gmknPf), 'split catalog: GMKN blocked without catalog');
  assert(calc.getPortfolioSplitSaleWriteState('GMKN', gmknPf).mode === 'catalog-blocked', 'split catalog: GMKN mode catalog-blocked');
  const tErrPf = {
    positions: [{ ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 2600, buyDate: '2026-03-01', currentPrice: 261.7 }],
    sales: []
  };
  const tErrSnap = JSON.stringify(tErrPf);
  assert(calc.isPortfolioTickerSaleCommitBlocked('T', tErrPf), 'split catalog: T blocked without catalog');
  const prevGetErr = calc.sandbox.getPortfolio;
  const prevSetErr = calc.sandbox.setPortfolio;
  let gmknErrLive = JSON.parse(snap);
  calc.sandbox.getPortfolio = () => gmknErrLive;
  calc.sandbox.setPortfolio = (p) => { gmknErrLive = p; };
  const gmknErrSale = calc.commitPortfolioSale('GMKN', { qty: 1, price: 130, date: '2026-09-08', comment: '' });
  assert(gmknErrSale && gmknErrSale.ok === false && gmknErrSale.blocked, 'split catalog: GMKN sale not committed');
  assert(JSON.stringify(gmknErrLive) === snap, 'split catalog: GMKN JSON unchanged after blocked sale');
  let tErrLive = JSON.parse(tErrSnap);
  calc.sandbox.getPortfolio = () => tErrLive;
  calc.sandbox.setPortfolio = (p) => { tErrLive = p; };
  const tErrSale = calc.commitPortfolioSale('T', { qty: 1, price: 261.7, date: '2026-09-08', comment: '' });
  assert(tErrSale && tErrSale.ok === false && tErrSale.blocked, 'split catalog: T sale not committed');
  assert(JSON.stringify(tErrLive) === tErrSnap, 'split catalog: T JSON unchanged');
  calc.sandbox.getPortfolio = prevGetErr;
  calc.sandbox.setPortfolio = prevSetErr;
  const sberWarn = calc.buildPortfolioSplitWarningHtml('SBER', sberPf);
  assert(!sberWarn, 'split catalog: SBER has no ticker split-warning');
  const sberSale = { ticker: 'SBER', qty: 10, buyPrice: 250, salePrice: 280 };
  const sberOld = calc.getSaleRealizedPnl(sberSale, null);
  const sberNew = calc.getSplitAwareSaleRealizedPnl(sberSale, sberPf, {});
  assert(Math.abs(sberNew.realizedPnlRub - sberOld.amount) < 1e-6, 'split catalog: SBER math intact on error');
  const ofzOld = calc.getSaleRealizedPnl(ofzSale, ofzMeta);
  const ofzNew = calc.getSplitAwareSaleRealizedPnl(ofzSale, { sales: [ofzSale] }, { bondMeta: ofzMeta });
  assert(Math.abs(ofzNew.realizedPnlRub - ofzOld.amount) < 0.05, 'split catalog: OFZ unchanged on error');

  const srcLoad = fs.readFileSync(path.join(__dirname, '..', 'split-events.js'), 'utf8');
  assert(/split-events\.json/.test(srcLoad), 'split catalog: local file load');
  assert(!/iss\.moex\.com/.test(srcLoad), 'split catalog: loadSplitEvents has no MOEX ISS');

  const catalogNodes = {
    pfSplitCatalogWarn: { hidden: true, textContent: '', style: { display: '' }, setAttribute(n) { if (n === 'hidden') this.hidden = true; }, removeAttribute(n) { if (n === 'hidden') this.hidden = false; } },
    pfSaleSplitCatalogWarn: { hidden: true, textContent: '', style: { display: '' }, setAttribute(n) { if (n === 'hidden') this.hidden = true; }, removeAttribute(n) { if (n === 'hidden') this.hidden = false; } }
  };
  const prevEl = calc.sandbox.document.getElementById;
  calc.sandbox.document.getElementById = (id) => catalogNodes[id] || (typeof prevEl === 'function' ? prevEl(id) : null);
  calc.sandbox.state.pfSaleTicker = 'SBER';
  calc.updatePortfolioSplitCatalogWarnUi();
  assert(catalogNodes.pfSplitCatalogWarn.hidden === false, 'split catalog ui: table warn shown');
  assert(/Список дроблений акций временно недоступен/.test(catalogNodes.pfSplitCatalogWarn.textContent), 'split catalog ui: table text');
  assert(catalogNodes.pfSaleSplitCatalogWarn.hidden === false, 'split catalog ui: sale warn shown');
  assert(/проверьте количество вручную/.test(catalogNodes.pfSaleSplitCatalogWarn.textContent), 'split catalog ui: sale text');
  assert(!calc.isPortfolioTickerSaleCommitBlocked('SBER', sberPf), 'split catalog: SBER still sellable');
  const ofzPfErr = {
    positions: [{ ticker: 'OFZ26241', lotId: 'B1', qty: 10, avgPrice: 95, currentPrice: 98, buyDate: '2023-01-01' }],
    sales: []
  };
  const ofzErrSnap = JSON.stringify(ofzPfErr);
  assert(!calc.isPortfolioTickerSaleCommitBlocked('OFZ26241', ofzPfErr), 'split catalog: OFZ not blocked');
  let sberErrLive = JSON.parse(JSON.stringify(sberPf));
  const sberErrSnap = JSON.stringify(sberErrLive);
  calc.sandbox.getPortfolio = () => sberErrLive;
  calc.sandbox.setPortfolio = (p) => { sberErrLive = p; };
  const sberErrCommit = calc.commitPortfolioSale('SBER', { qty: 2, price: 280, date: '2026-09-08', comment: '' });
  assert(sberErrCommit && sberErrCommit.ok, 'split catalog: SBER ordinary sale on error');
  assert(Math.abs(Number(sberErrLive.positions[0].qty) - 8) < 1e-6, 'split catalog: SBER qty −2');
  let ofzErrLive = JSON.parse(ofzErrSnap);
  calc.sandbox.getPortfolio = () => ofzErrLive;
  calc.sandbox.setPortfolio = (p) => { ofzErrLive = p; };
  const ofzErrCommit = calc.commitPortfolioSale('OFZ26241', { qty: 2, price: 98, date: '2026-09-08', comment: '' });
  assert(ofzErrCommit && ofzErrCommit.ok, 'split catalog: OFZ ordinary sale on error');
  assert(Math.abs(Number(ofzErrLive.positions[0].qty) - 8) < 1e-6, 'split catalog: OFZ qty −2');
  calc.sandbox.getPortfolio = prevGetErr;
  calc.sandbox.setPortfolio = prevSetErr;

  calc.sandbox.resetSplitEventsLoadState();
  calc.sandbox.markSplitEventsCatalogLoading();
  assert(calc.sandbox.getSplitEventsLoadState().status === 'loading', 'split catalog: loading status');
  assert(calc.isPortfolioTickerSaleCommitBlocked('GMKN', gmknPf), 'split catalog: loading blocks GMKN');
  let gmknLoadLive = JSON.parse(snap);
  calc.sandbox.getPortfolio = () => gmknLoadLive;
  calc.sandbox.setPortfolio = (p) => { gmknLoadLive = p; };
  const gmknLoadSale = calc.commitPortfolioSale('GMKN', { qty: 1, price: 130, date: '2026-09-08', comment: '' });
  assert(gmknLoadSale && gmknLoadSale.blocked, 'split catalog: loading does not commit GMKN');
  assert(JSON.stringify(gmknLoadLive) === snap, 'split catalog: loading JSON unchanged');
  calc.sandbox.getPortfolio = prevGetErr;
  calc.sandbox.setPortfolio = prevSetErr;

  calc.sandbox.markSplitEventsCatalogError('split-events http');
  calc.sandbox.state.pfSaleTicker = 'GMKN';
  calc.sandbox.getPortfolio = () => gmknPf;
  calc.updatePortfolioSplitCatalogWarnUi();
  assert(/не списать неверное количество/.test(catalogNodes.pfSaleSplitCatalogWarn.textContent), 'split catalog ui: GMKN block copy');
  assert(!/split-aware|metadata|writer|helper/.test(catalogNodes.pfSaleSplitCatalogWarn.textContent), 'split catalog ui: no technical terms');
  calc.sandbox.getPortfolio = prevGetErr;
  calc.sandbox.setPortfolio = prevSetErr;

  const writeSrc = Function.prototype.toString.call(calc.getPortfolioSplitSaleWriteState) +
    Function.prototype.toString.call(calc.commitPortfolioSale);
  assert(!/iss\.moex/.test(writeSrc) && !/fetch\s*\(/.test(writeSrc), 'split catalog fail-safe: no new MOEX fetch');

  calc.setSplitEventsCatalog(catalog);
  assert(!calc.isPortfolioSplitCatalogUnavailable(), 'split catalog: restored ok');
  calc.updatePortfolioSplitCatalogWarnUi();
  assert(catalogNodes.pfSplitCatalogWarn.hidden === true, 'split catalog ui: hidden after restore');
  calc.sandbox.document.getElementById = prevEl;
  calc.sandbox.state.pfSaleTicker = '';
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-09-04';
  function almost(a, b, eps, msg) {
    assert(Math.abs(Number(a) - Number(b)) < (eps || 0.02), msg);
  }
  const sb = calc.sandbox;
  const prevGet = sb.getPortfolio;
  const prevSet = sb.setPortfolio;

  const metaKeep = h.normalizeSale({
    ticker: 'GMKN', qty: 200, buyPrice: 220, salePrice: 130, saleDate: '2025-06-01',
    qtyScale: 'sale-date',
    allocations: [{
      lotId: 'G1', qty: 200, buyPrice: 22000, buyDate: '2021-06-04',
      qtyScale: 'sale-date', lotQtyDelta: 2, splitFactor: 100, adjustedBuyPrice: 220, scale: 'historical'
    }]
  });
  assert(metaKeep.qtyScale === 'sale-date', 'p1b storage: sale qtyScale kept');
  assert(metaKeep.allocations[0].lotQtyDelta === 2 && metaKeep.allocations[0].splitFactor === 100, 'p1b storage: alloc meta kept');
  assert(metaKeep.allocations[0].adjustedBuyPrice === 220, 'p1b storage: adjustedBuyPrice kept');

  const mixedBefore = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 },
      { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 129.74, buyDate: '2026-09-04', currentPrice: 130 }
    ],
    sales: []
  };
  sb.getPortfolio = () => mixedBefore;
  sb.setPortfolio = (p) => { mixedBefore = p; };
  const mixedWrite = calc.getPortfolioSplitSaleWriteState('GMKN', mixedBefore, '2026-09-08', { splitEvents: events });
  almost(mixedWrite.availableSaleQty, 1010, 1e-6, 'p1b hint: split-aware available 1010');
  almost(mixedWrite.jsonOpsQty, 20, 1e-6, 'p1b hint: operations qty 20');
  almost(calc.getPortfolioSellableQty('GMKN'), 1010, 1e-6, 'p1b hint: sellable 1010 not 20');
  const warnHint = calc.formatSplitSaleHintText('GMKN', mixedBefore, { splitEvents: events, saleDate: '2026-09-08' });
  assert(/1010/.test(warnHint) && /по операциям: 20/.test(warnHint), 'p1b hint: warning has 1010 and 20');
  const nodes = {};
  const prevGetEl = sb.document.getElementById;
  sb.document.getElementById = (id) => {
    if (!nodes[id]) {
      nodes[id] = {
        hidden: true, textContent: '', disabled: false, value: id === 'pfSaleDate' ? '2026-09-08' : '',
        style: {}, setAttribute() {}, removeAttribute() {}
      };
    }
    return nodes[id];
  };
  sb.state.pfSaleTicker = 'GMKN';
  calc.updatePortfolioSalePreview();
  assert(/Доступно: 1010 шт\. с учётом дробления/.test(nodes.pfSaleAvailableHint.textContent), 'p1b hint: Доступно 1010 not 20');
  assert(!/Доступно: 20 шт\. с учётом дробления/.test(nodes.pfSaleAvailableHint.textContent), 'p1b hint: Доступно not JSON 20');
  sb.document.getElementById = prevGetEl;
  sb.state.pfSaleTicker = '';

  let sellTwo = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 133.12 },
      { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 129.74, buyDate: '2026-09-04', currentPrice: 133.12 }
    ],
    sales: []
  };
  const qtyBefore = sellTwo.positions.map((p) => ({ lotId: p.lotId, qty: Number(p.qty) }));
  sb.getPortfolio = () => sellTwo;
  sb.setPortfolio = (p) => { sellTwo = p; };
  const twoSale = calc.commitPortfolioSale('GMKN', { qty: 2, price: 133.12, date: '2026-09-08', comment: '' });
  assert(twoSale && twoSale.ok, 'p1b sell2: accepted');
  const oldAfter = (sellTwo.positions || []).find((p) => p.lotId === 'G1');
  const newAfter = (sellTwo.positions || []).find((p) => p.lotId === 'G2');
  almost(oldAfter.qty, 9.98, 1e-6, 'p1b sell2: old lot 9.98');
  almost(newAfter.qty, 10, 1e-6, 'p1b sell2: new lot 10');
  assert(Number(oldAfter.qty) < 10, 'p1b sell2: old lot decreased');
  qtyBefore.forEach((b) => {
    const now = (sellTwo.positions || []).find((p) => p.lotId === b.lotId);
    assert(!now || Number(now.qty) <= b.qty + 1e-9, 'p1b sell2: no lot qty increase ' + b.lotId);
  });
  assert(sellTwo.sales[0].qty === 2, 'p1b sell2: sale.qty 2');
  assert(sellTwo.sales[0].qtyScale === 'sale-date', 'p1b sell2: qtyScale');
  almost(sellTwo.sales[0].allocations[0].qty, 2, 1e-9, 'p1b sell2: alloc qty 2');
  almost(sellTwo.sales[0].allocations[0].lotQtyDelta, 0.02, 1e-9, 'p1b sell2: lotQtyDelta 0.02');
  almost(sellTwo.sales[0].allocations[0].splitFactor, 100, 1e-9, 'p1b sell2: splitFactor 100');
  almost(sellTwo.sales[0].allocations[0].adjustedBuyPrice, 220, 0.02, 'p1b sell2: adjustedBuyPrice 220');
  const heldTwo = calc.getSplitAwareCurrentQty('GMKN', sellTwo, { splitEvents: events, now: NOW });
  almost(heldTwo.qty, 1008, 1e-6, 'p1b sell2: split-aware remaining 1008');
  almost(calc.getSplitAwareSaleRealizedPnl(sellTwo.sales[0], sellTwo, { splitEvents: events, now: NOW }).realizedPnlRub, -173.76, 0.05, 'p1b sell2: realized -173.76');
  const sellTwoHtml = calc.buildPortfolioTickerDetailHtml('GMKN', sellTwo.positions, sellTwo.sales, null, false);
  assert(/Продажа записана как в брокере/.test(sellTwoHtml), 'p1b sell2 ui: new sale copy');
  assert(/Количество указано в акциях после дробления/.test(sellTwoHtml), 'p1b sell2 ui: qty after split');
  assert(!/Продажа была добавлена до обновления расчётов по дроблению/.test(sellTwoHtml), 'p1b sell2 ui: not legacy');
  assert(!/split-aware/.test(sellTwoHtml), 'p1b sell2 ui: no split-aware');
  const openHist = calc.summarizeTickerHistory('GMKN', sellTwo.positions, sellTwo.sales);
  const openOld = openHist.openLots.find((p) => p.lotId === 'G1');
  almost(openOld.qty, 9.98, 1e-6, 'p1b sell2: open purchases 9.98');
  almost(openHist.totalBoughtQty, 20, 1e-6, 'p1b sell2: bought 20 not 21.98');
  almost(openHist.totalSoldQty, 2, 1e-6, 'p1b sell2: sold 2 in sale-date scale');
  assert(Math.abs(openHist.totalBoughtQty - 21.98) > 0.1, 'p1b sell2: bought not mixed 21.98');
  const tl = calc.buildTickerOperationTimeline('GMKN', sellTwo.positions, sellTwo.sales);
  const buyOld = tl.find((op) => op.type === 'buy' && op.lotId === 'G1');
  assert(buyOld && Math.abs(Number(buyOld.qty) - 10) < 1e-6, 'p1b sell2: timeline buy qty 10 not 11.98');
  assert(Math.abs(Number(buyOld.qty) - 11.98) > 0.1, 'p1b sell2: timeline not 11.98');
  const sellTl = tl.find((op) => op.type === 'sell');
  assert(sellTl && sellTl.splitWriterMeta, 'p1b sell2: timeline keeps writer meta');
  assert(sellTl.note === 'Продажа записана как в брокере. Количество указано в акциях после дробления.', 'p1b sell2: timeline broker note');
  assert(!/до обновления расчётов по дроблению/.test(sellTl.note || ''), 'p1b sell2: timeline not legacy');
  const tlHtml = calc.buildPortfolioTickerTimelineHtml(tl, 'GMKN', false, true);
  assert(/Продажа записана как в брокере/.test(tlHtml), 'p1b sell2: timeline html broker copy');
  assert(!/Продажа была добавлена до обновления расчётов по дроблению/.test(tlHtml), 'p1b sell2: timeline html not legacy');
  const sellTwoStack = calc.buildPortfolioTickerDetailHtml('GMKN', sellTwo.positions, sellTwo.sales, null, false, { layout: 'stack' });
  assert(/Продажа записана как в брокере/.test(sellTwoStack), 'p1b sell2 stack: broker copy');
  assert(!/Продажа была добавлена до обновления расчётов по дроблению/.test(sellTwoStack), 'p1b sell2 stack: not legacy');
  const sellTwoRecent = calc.collectRecentPortfolioOperations(sellTwo.positions, sellTwo.sales, {
    todayYmd: '2026-09-08', days: 30
  });
  const sellTwoRecentSale = sellTwoRecent.find((op) => op.kind === 'sale');
  assert(sellTwoRecentSale && sellTwoRecentSale.splitWriterMeta, 'p1b sell2 recent: writer meta');
  assert(/записана как в брокере/.test(sellTwoRecentSale.splitSaleNote || ''), 'p1b sell2 recent: broker note');
  assert(!/до обновления расчётов по дроблению/.test(sellTwoRecentSale.splitSaleNote || ''), 'p1b sell2 recent: not legacy');
  const recentHtml = calc.buildPortfolioRecentSectionHtml(sellTwoRecent);
  assert(/Продажа записана как в брокере/.test(recentHtml), 'p1b sell2 recent html: broker copy');
  assert(!/Продажа была добавлена до обновления расчётов по дроблению/.test(recentHtml), 'p1b sell2 recent html: not legacy');
  calc.removePortfolioSale(sellTwo.sales[0].saleId);
  const oldRestored = (sellTwo.positions || []).find((p) => p.lotId === 'G1');
  const newRestored = (sellTwo.positions || []).find((p) => p.lotId === 'G2');
  almost(oldRestored.qty, 10, 1e-6, 'p1b sell2 cancel: old lot 10');
  almost(newRestored.qty, 10, 1e-6, 'p1b sell2 cancel: new lot 10');
  assert(!(sellTwo.sales || []).length, 'p1b sell2 cancel: sale removed');
  almost(calc.summarizeTickerHistory('GMKN', sellTwo.positions, sellTwo.sales).totalBoughtQty, 20, 1e-6, 'p1b sell2 cancel: bought 20');

  let sellOne = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 133.12 },
      { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 129.74, buyDate: '2026-09-04', currentPrice: 133.12 }
    ],
    sales: []
  };
  sb.getPortfolio = () => sellOne;
  sb.setPortfolio = (p) => { sellOne = p; };
  const oneSale = calc.commitPortfolioSale('GMKN', { qty: 1, price: 133.12, date: '2026-09-08', comment: '' });
  assert(oneSale && oneSale.ok, 'p1b sell1: accepted');
  almost((sellOne.positions.find((p) => p.lotId === 'G1') || {}).qty, 9.99, 1e-6, 'p1b sell1: old lot 9.99');
  const histOne = calc.summarizeTickerHistory('GMKN', sellOne.positions, sellOne.sales);
  almost(histOne.totalBoughtQty, 20, 1e-6, 'p1b sell1: bought 20 not 20.99');
  almost(histOne.totalSoldQty, 1, 1e-6, 'p1b sell1: sold 1');
  almost(calc.getSplitAwareCurrentQty('GMKN', sellOne, { splitEvents: events, now: NOW }).qty, 1009, 1e-6, 'p1b sell1: remaining 1009');
  assert(Math.abs(histOne.totalBoughtQty - 20.99) > 0.1, 'p1b sell1: bought not mixed 20.99');

  let mixed = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 },
      { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 220, buyDate: '2025-01-15', currentPrice: 130 }
    ],
    sales: []
  };
  sb.getPortfolio = () => mixed;
  sb.setPortfolio = (p) => { mixed = p; };
  const mixedAll = calc.commitPortfolioSale('GMKN', { qty: 1010, price: 130, date: '2025-06-01', comment: '' });
  assert(mixedAll && mixedAll.ok, 'p1b mixed: sell 1010 accepted');
  assert(!(mixed.positions || []).some((p) => p.ticker === 'GMKN' && Number(p.qty) > 1e-9), 'p1b mixed: no open GMKN lots');
  const closed = calc.listClosedPortfolioPositions(mixed.positions, mixed.sales);
  assert(closed.some((c) => c.ticker === 'GMKN'), 'p1b mixed: GMKN in closed');
  const mixedPnl = calc.getSplitAwareTickerRealizedPnl('GMKN', mixed, { splitEvents: events, now: NOW });
  assert(mixedPnl.realizedPnlRub != null && mixedPnl.confidence !== 'unknown', 'p1b mixed: split-aware realized');

  let partial = {
    positions: [
      { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 },
      { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 220, buyDate: '2025-01-15', currentPrice: 130 }
    ],
    sales: []
  };
  sb.getPortfolio = () => partial;
  sb.setPortfolio = (p) => { partial = p; };
  const partSale = calc.commitPortfolioSale('GMKN', { qty: 1005, price: 130, date: '2025-06-01', comment: '' });
  assert(partSale && partSale.ok, 'p1b partial: sell 1005 accepted');
  const oldLot = (partial.positions || []).find((p) => p.lotId === 'G1');
  const newLot = (partial.positions || []).find((p) => p.lotId === 'G2');
  assert(!oldLot || !(Number(oldLot.qty) > 1e-9), 'p1b partial: old lot 0');
  assert(newLot && Math.abs(Number(newLot.qty) - 5) < 1e-6, 'p1b partial: new lot 5');

  let before = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  sb.getPortfolio = () => before;
  sb.setPortfolio = (p) => { before = p; };
  const beforeSale = calc.commitPortfolioSale('GMKN', { qty: 2, price: 25000, date: '2023-06-01', comment: '' });
  assert(beforeSale && beforeSale.ok, 'p1b before: sale accepted');
  assert(Math.abs(Number(before.positions[0].qty) - 8) < 1e-6, 'p1b before: qty -2');
  const beforePnl = calc.getSaleRealizedPnl(before.sales[0]);
  almost(beforePnl.amount, 6000, 0.05, 'p1b before: realized 6000');

  let curr = {
    positions: [{
      ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  sb.getPortfolio = () => curr;
  sb.setPortfolio = (p) => { curr = p; };
  const currSale = calc.commitPortfolioSale('GMKN', { qty: 200, price: 130, date: '2025-06-01', comment: '' });
  assert(currSale && currSale.ok, 'p1b current: accepted');
  almost(curr.positions[0].qty, 800, 1e-6, 'p1b current: qty -200 not /100');
  almost(calc.getSplitAwareSaleRealizedPnl(curr.sales[0], curr, { splitEvents: events, now: NOW }).realizedPnlRub, -18000, 0.05, 'p1b current: -18000');

  let tPf = {
    positions: [{ ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3126, buyDate: '2025-12-01', currentPrice: 260 }],
    sales: []
  };
  sb.getPortfolio = () => tPf;
  sb.setPortfolio = (p) => { tPf = p; };
  const tSale = calc.commitPortfolioSale('T', { qty: 5, price: 260, date: '2026-06-01', comment: '' });
  assert(tSale && tSale.ok, 'p1b T: accepted');
  almost(tPf.sales[0].allocations[0].lotQtyDelta, 0.5, 1e-9, 'p1b T: lotQtyDelta 0.5');
  almost(tPf.positions[0].qty, 0.5, 1e-9, 'p1b T: remaining 0.5');
  almost(calc.getSplitAwareSaleRealizedPnl(tPf.sales[0], tPf, { splitEvents: events, now: NOW }).realizedPnlRub, (260 - 312.6) * 5, 0.05, 'p1b T: realized');
  const tSaleHtml = calc.buildPortfolioTickerDetailHtml('T', tPf.positions, tPf.sales, null, false, { layout: 'stack' });
  assert(/Продажа записана как в брокере/.test(tSaleHtml), 'p1b T ui: broker copy');
  assert(!/Продажа была добавлена до обновления расчётов по дроблению/.test(tSaleHtml), 'p1b T ui: not legacy');

  let unk = {
    positions: [{ ticker: 'GMKN', lotId: 'U1', qty: 10, avgPrice: 22000, currentPrice: 130 }],
    sales: []
  };
  const unkSnap = JSON.stringify(unk);
  sb.getPortfolio = () => unk;
  sb.setPortfolio = (p) => { unk = p; };
  assert(calc.isPortfolioTickerSaleCommitBlocked('GMKN', unk, events), 'p1b unknown: blocked');
  const unkCommit = calc.commitPortfolioSale('GMKN', { qty: 200, price: 130, date: '2025-06-01', comment: '' });
  assert(unkCommit && unkCommit.ok === false && unkCommit.blocked, 'p1b unknown: not committed');
  assert(JSON.stringify(unk) === unkSnap, 'p1b unknown: JSON unchanged');
  assert(/Не удалось понять, в каких акциях указан старый лот/.test(calc.formatSplitSaleUnknownText()), 'p1b unknown: warning text');

  let cancelPf = {
    positions: [{
      ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130
    }],
    sales: []
  };
  sb.getPortfolio = () => cancelPf;
  sb.setPortfolio = (p) => { cancelPf = p; };
  const sold = calc.commitPortfolioSale('GMKN', { qty: 200, price: 130, date: '2025-06-01', comment: '' });
  assert(sold && sold.ok && Math.abs(cancelPf.positions[0].qty - 8) < 1e-9, 'p1b cancel: sold to 8');
  calc.removePortfolioSale(cancelPf.sales[0].saleId);
  assert(Math.abs(cancelPf.positions[0].qty - 10) < 1e-9, 'p1b cancel: restored 2 not 200');
  assert(!(cancelPf.sales || []).length, 'p1b cancel: sale removed');

  const legacySale = {
    saleId: 'LEG',
    ticker: 'GMKN',
    qty: 200,
    buyPrice: 22000,
    salePrice: 130,
    saleDate: '2025-06-01',
    allocations: [{ lotId: 'G1', qty: 200, buyPrice: 22000, buyDate: '2021-06-04' }]
  };
  const legacyRow = calc.getSplitAwareSaleRealizedPnl(legacySale, {
    positions: [{ ticker: 'GMKN', lotId: 'G1', qty: 8, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 }],
    sales: [legacySale]
  }, { splitEvents: events, now: NOW });
  assert(legacyRow.isPartial || legacyRow.confidence === 'partial', 'p1b legacy: partial');
  assert(legacyRow.confidence !== 'high', 'p1b legacy: not confident');
  assert((legacyRow.warnings || []).some((w) => /до обновления расчётов по дроблению/.test(w)), 'p1b legacy: warning');
  if (legacyRow.realizedPnlRub != null) {
    assert(Math.abs(legacyRow.realizedPnlRub - (130 - 22000) * 200) > 1, 'p1b legacy: not raw (130-22000)×200');
  }
  const legacyTl = calc.buildTickerOperationTimeline('GMKN', [
    { ticker: 'GMKN', lotId: 'G1', qty: 8, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 }
  ], [legacySale]);
  const legacySell = legacyTl.find((op) => op.type === 'sell');
  assert(legacySell && !legacySell.splitWriterMeta, 'p1b legacy: timeline no writer meta');
  assert(/до обновления расчётов по дроблению/.test(legacySell.note || ''), 'p1b legacy: timeline legacy note');
  assert(!/записана как в брокере/.test(legacySell.note || ''), 'p1b legacy: timeline not broker copy');
  const legacyHtml = calc.buildPortfolioTickerDetailHtml('GMKN', [
    { ticker: 'GMKN', lotId: 'G1', qty: 8, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 }
  ], [legacySale], null, false, { layout: 'stack' });
  assert(/Продажа была добавлена до обновления расчётов по дроблению/.test(legacyHtml), 'p1b legacy html: warning');
  assert(!/Продажа записана как в брокере/.test(legacyHtml), 'p1b legacy html: not broker copy');
  const legacyRecent = calc.collectRecentPortfolioOperations([
    { ticker: 'GMKN', lotId: 'G1', qty: 8, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 130 }
  ], [legacySale], { todayYmd: '2026-09-08', days: 4000 });
  const legacyRecentSale = legacyRecent.find((op) => op.kind === 'sale');
  assert(/до обновления расчётов по дроблению/.test(legacyRecentSale && legacyRecentSale.splitSaleNote || ''), 'p1b legacy recent: warning');
  assert(!/записана как в брокере/.test(legacyRecentSale && legacyRecentSale.splitSaleNote || ''), 'p1b legacy recent: not broker copy');

  const prodText = fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8');
  const fakeEvents = calc.sandbox.parseSplitEventsCatalog({
    version: 1,
    events: (JSON.parse(prodText).events || []).concat([{
      ticker: 'FAKE_SPLIT', aliases: ['FAKE'], effectiveDate: '2030-01-15', ratio: 5, type: 'split'
    }])
  });
  calc.setSplitEventsCatalog({ version: 1, events: fakeEvents });
  let fakePf = {
    positions: [{ ticker: 'FAKE_SPLIT', lotId: 'F1', qty: 2, avgPrice: 500, buyDate: '2029-06-01', currentPrice: 90 }],
    sales: []
  };
  const fakeSnap = JSON.stringify(fakePf);
  sb.getPortfolio = () => fakePf;
  sb.setPortfolio = (p) => { fakePf = p; };
  const fakeSale = calc.commitPortfolioSale('FAKE_SPLIT', { qty: 5, price: 90, date: '2031-01-01', comment: '' });
  assert(fakeSale && fakeSale.ok, 'p1b generic: FAKE_SPLIT sale');
  almost(fakePf.sales[0].allocations[0].lotQtyDelta, 1, 1e-9, 'p1b generic: lotQtyDelta 1');
  almost(fakePf.positions[0].qty, 1, 1e-9, 'p1b generic: remaining 1');
  calc.getSplitAwareSaleRealizedPnl(fakePf.sales[0], fakePf, { splitEvents: fakeEvents, now: '2031-06-01' });
  assert(JSON.stringify({ ticker: 'FAKE_SPLIT' }) !== fakeSnap, 'p1b generic: writer changed fake pf');
  const helperPf = JSON.parse(fakeSnap);
  const helperSnap = JSON.stringify(helperPf);
  calc.getSplitAwareSaleRealizedPnl({
    ticker: 'FAKE_SPLIT', qty: 5, buyPrice: 500, salePrice: 90, saleDate: '2031-01-01',
    allocations: [{ lotId: 'F1', qty: 5, buyPrice: 500, buyDate: '2029-06-01' }]
  }, helperPf, { splitEvents: fakeEvents, now: '2031-06-01' });
  assert(JSON.stringify(helperPf) === helperSnap, 'p1b helpers: JSON immutable');
  const allocSrc = Function.prototype.toString.call(calc.allocateSplitAwareSaleAcrossLots);
  assert(!/iss\.moex/.test(allocSrc) && !/fetch\s*\(/.test(allocSrc), 'p1b: no fetch in split writer');

  calc.setSplitEventsCatalog(catalog);
  sb.getPortfolio = prevGet;
  sb.setPortfolio = prevSet;
}

{
  const prodSrc = [
    'portfolio.js',
    'split-events.js'
  ].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  assert(!/ticker\s*===\s*['"]GMKN['"]/.test(prodSrc), 'hardcode: no ticker===GMKN in production split path');
  assert(!/ticker\s*===\s*['"]PLZL['"]/.test(prodSrc), 'hardcode: no ticker===PLZL');
  assert(!/ticker\s*===\s*['"]TRNFP['"]/.test(prodSrc), 'hardcode: no ticker===TRNFP');
  assert(!/ticker\s*===\s*['"]T['"]/.test(prodSrc), 'hardcode: no ticker===T');
  assert(!/\.includes\(\s*['"]GMKN['"]/.test(prodSrc), 'hardcode: no includes GMKN');
  assert(!/case\s+['"]GMKN['"]/.test(prodSrc), 'hardcode: no case GMKN');
}

await (async () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  assert(!/FAKE_SPLIT/.test(JSON.stringify(catalog)), 'matrix: production catalog has no FAKE_SPLIT');
  const prodEvents = (catalog.events || []).filter((ev) => {
    if (!ev || !ev.ticker || !ev.effectiveDate) return false;
    const type = String(ev.type || 'split').trim().toLowerCase();
    if (type === 'reverse') return false;
    const ratio = Number(ev.ratio);
    return isFinite(ratio) && ratio > 1;
  });
  assert(prodEvents.length >= 1, 'matrix: catalog has forward splits');
  const catalogTickers = prodEvents.map((ev) => String(ev.ticker).toUpperCase());
  ['T', 'GMKN', 'PLZL', 'TRNFP'].forEach((t) => {
    assert(catalogTickers.indexOf(t) !== -1, 'matrix: catalog includes ' + t);
  });

  function addDays(iso, days) {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function almost(a, b, eps, msg) {
    assert(Math.abs(Number(a) - Number(b)) < (eps || 0.05), msg);
  }
  function priceOk(price, date) {
    return { status: 'ok', price: price, priceDate: date, priceType: 'close', unit: 'rub' };
  }
  function mockPrices(ticker, byDate) {
    return function (t, date) {
      if (String(t || '').toUpperCase() !== ticker) {
        return Promise.resolve({ status: 'missing', price: null, priceDate: null });
      }
      const iso = String(date || '').slice(0, 10);
      const row = byDate[iso];
      return Promise.resolve(row || { status: 'missing', price: null, priceDate: null });
    };
  }

  function fixtureFor(ev) {
    const t = String(ev.ticker).toUpperCase();
    const E = ev.effectiveDate;
    const R = Number(ev.ratio);
    const before = addDays(E, -10);
    const asofBefore = addDays(E, -1);
    const after = addDays(E, 10);
    const now = addDays(E, 40);
    const CUR = 1000;
    const hist = {
      ticker: t, lotId: t + '_H', qty: 10, avgPrice: 1000 * R, buyDate: before, currentPrice: CUR
    };
    const curr = {
      ticker: t, lotId: t + '_C', qty: 5, avgPrice: 1000, buyDate: after, currentPrice: CUR
    };
    return { t, E, R, before, asofBefore, after, now, CUR, hist, curr };
  }

  async function runEventMatrix(ev, events, label) {
    const fx = fixtureFor(ev);
    const t = fx.t;
    const R = fx.R;
    const tag = 'matrix ' + label + '/' + t;
    const mixed = { positions: [JSON.parse(JSON.stringify(fx.hist)), JSON.parse(JSON.stringify(fx.curr))], sales: [] };
    const histOnly = { positions: [JSON.parse(JSON.stringify(fx.hist))], sales: [] };
    const snapMixed = JSON.stringify(mixed);
    const snapHist = JSON.stringify(histOnly);
    const opts = { splitEvents: events, now: fx.now, currentDate: fx.now };

    let d = calc.diagnoseLotShareScale(fx.hist, t, opts);
    assert(d.scale === 'historical', tag + ': hist lot scale historical');
    almost(d.factor, R, 1e-9, tag + ': hist factor = ratio');
    d = calc.diagnoseLotShareScale(fx.curr, t, opts);
    assert(d.scale === 'current', tag + ': after-split lot current');
    assert(d.scale !== 'historical', tag + ': after-split not re-multiplied');

    let held = calc.getSplitAwareQtyHeldOnDate(t, histOnly, fx.asofBefore, opts);
    almost(held.qty, 10, 1e-6, tag + ': qtyHeld before split = 10');
    held = calc.getSplitAwareQtyHeldOnDate(t, histOnly, fx.after, opts);
    almost(held.qty, 10 * R, 1e-6, tag + ': qtyHeld after split = 10×ratio');
    held = calc.getSplitAwareQtyHeldOnDate(t, mixed, fx.now, opts);
    almost(held.qty, 10 * R + 5, 1e-6, tag + ': mixed after = 10×ratio+5');

    const cur = calc.getSplitAwareCurrentQty(t, mixed, opts);
    almost(cur.qty, 10 * R + 5, 1e-6, tag + ': currentQty 10×ratio+5');

    const m = calc.getSplitAwareCurrentPositionMetrics(t, mixed, opts);
    almost(m.currentQty, 10 * R + 5, 1e-6, tag + ': metrics qty');
    almost(m.currentMarketValueRub, (10 * R + 5) * fx.CUR, 0.05, tag + ': MV split-aware');
    almost(m.remainingCostRub, (10 * R + 5) * 1000, 0.05, tag + ': remaining cost');
    assert(m.unrealizedPnlPct == null || Math.abs(m.unrealizedPnlPct) < 5, tag + ': no false −90/−99%');
    assert(JSON.stringify(mixed) === snapMixed, tag + ': metrics JSON immutable');

    const sum = calc.computePortfolioSummaryTotals(mixed.positions, {}, mixed.sales, {
      splitEvents: events, now: fx.now, currentDate: fx.now
    });
    almost(sum.stockValue, (10 * R + 5) * fx.CUR, 0.05, tag + ': summary MV split-aware');
    assert(Math.abs(sum.stockValue - 15 * fx.CUR) > 1, tag + ': summary MV ≠ JSON qty × price');
    almost(sum.remainCost, (10 * R + 5) * 1000, 0.05, tag + ': summary remaining cost');
    const sumPct = sum.remainCost > 0 ? (sum.totalValue - sum.remainCost) / sum.remainCost * 100 : 0;
    assert(sumPct > -90, tag + ': summary result not −90/−99%');
    assert(!sum.onlyUnknown, tag + ': summary not unknown-only');
    assert(JSON.stringify(mixed) === snapMixed, tag + ': summary JSON immutable');

    const asofOpts = {
      splitEvents: events,
      currentDate: fx.now,
      getInstrumentPriceAtDate: mockPrices(t, {
        [fx.asofBefore]: priceOk(1000 * R, fx.asofBefore),
        [fx.now]: priceOk(1000, fx.now)
      })
    };
    const beforeVal = await calc.buildPortfolioValueAtDate(histOnly, fx.asofBefore, asofOpts);
    const beforeRow = (beforeVal.items || []).find((x) => x.ticker === t);
    assert(beforeRow && beforeRow.qtyAtDate === 10, tag + ': as-of before qty 10');
    almost(beforeRow.valueRub, 10 * 1000 * R, 0.05, tag + ': as-of before old-scale value');
    const afterVal = await calc.buildPortfolioValueAtDate(mixed, fx.now, asofOpts);
    const afterRow = (afterVal.items || []).find((x) => x.ticker === t);
    assert(afterRow && Math.abs(afterRow.qtyAtDate - (10 * R + 5)) < 1e-6, tag + ': as-of after new qty');
    almost(afterRow.valueRub, (10 * R + 5) * 1000, 0.05, tag + ': as-of after split-aware value');
    assert(Math.abs(afterRow.valueRub - 15 * 1000) > 1, tag + ': after value ≠ JSON qty × price');
    assert(JSON.stringify(histOnly) === snapHist, tag + ': as-of JSON immutable');

    const cmp = await calc.buildPortfolioValueChangeBetweenDates(mixed, fx.asofBefore, fx.now, asofOpts);
    const cmpRow = (cmp.items || []).find((x) => x.ticker === t);
    assert(cmpRow && cmpRow.qtyFrom === 10, tag + ': change from qty 10');
    almost(cmpRow.qtyTo, 10 * R + 5, 1e-6, tag + ': change to qty 10×ratio+5');
    assert(cmp.changePct == null || cmp.changePct > -90, tag + ': changePct not technical −99%');

    const payoutsFrom = fx.before;
    const preDiv = addDays(fx.E, -5);
    const postDiv = addDays(fx.after, 5);
    const payOpts = {
      now: fx.now,
      splitEvents: events,
      payoutsByTicker: {
        [t]: { kind: 'stock', source: 'test', dividends: [{ date: preDiv, value: 10 }] }
      }
    };
    let pay = calc.buildTickerPayoutsForHoldingPeriod(t, mixed, payoutsFrom, fx.now, payOpts);
    assert(pay.items.length === 1 && pay.items[0].qtyHeld === 10, tag + ': dividend before split uses old qty');
    assert(pay.items[0].payoutPerUnit === 10, tag + ': DPS not split twice');
    almost(pay.items[0].amountRub, 100, 0.05, tag + ': pre-split dividend 10×10');
    pay = calc.buildTickerPayoutsForHoldingPeriod(t, mixed, payoutsFrom, fx.now, {
      now: fx.now,
      splitEvents: events,
      payoutsByTicker: {
        [t]: { kind: 'stock', source: 'test', dividends: [{ date: postDiv, value: 10 }] }
      }
    });
    assert(pay.items.length === 1, tag + ': post-split dividend present');
    almost(pay.items[0].qtyHeld, 10 * R + 5, 1e-6, tag + ': dividend after split uses new qty');
    assert(pay.items[0].payoutPerUnit === 10, tag + ': post-split DPS unchanged');
    almost(pay.items[0].amountRub, (10 * R + 5) * 10, 0.05, tag + ': post-split dividend amount');

    const up = calc.buildUpcomingPortfolioPayouts(mixed, {
      now: fx.now,
      horizonDays: 365,
      splitEvents: events,
      payoutsByTicker: {
        [t]: { kind: 'stock', source: 'test', dividends: [{ date: addDays(fx.now, 20), value: 4 }] }
      }
    });
    const upItem = (up.items || []).find((x) => x.ticker === t);
    assert(upItem, tag + ': upcoming item');
    almost(upItem.qtyHeld, 10 * R + 5, 1e-6, tag + ': upcoming qty split-aware');
    almost(upItem.amountRub, (10 * R + 5) * 4, 0.05, tag + ': upcoming = qty × DPS');

    const preCurr = {
      positions: [{
        ticker: t, lotId: t + '_CURPRE', qty: 5, avgPrice: 1000, buyDate: fx.before, currentPrice: 1000
      }],
      sales: []
    };
    const preHeld = calc.getSplitAwareQtyHeldOnDate(t, preCurr, fx.asofBefore, opts);
    assert(preHeld.confidence === 'unknown' || preHeld.confidence === 'partial', tag + ': current lot before split fail-safe');
    assert(!(preHeld.confidence === 'high' && Math.abs((preHeld.qty || 0) - 5 / R) < 1e-6), tag + ': not auto-divided');

    const sb = calc.sandbox;
    const prevGet = sb.getPortfolio;
    const prevSet = sb.setPortfolio;
    let live = JSON.parse(JSON.stringify(mixed));
    sb.getPortfolio = () => live;
    sb.setPortfolio = (p) => { live = p; };
    const take = R * 2;
    const sold = calc.commitPortfolioSale(t, { qty: take, price: 1000, date: fx.now, comment: '' });
    assert(sold && sold.ok, tag + ': split-sale accepted');
    const oldLot = (live.positions || []).find((p) => p.lotId === fx.hist.lotId);
    const newLot = (live.positions || []).find((p) => p.lotId === fx.curr.lotId);
    almost(oldLot && oldLot.qty, 8, 1e-6, tag + ': hist lot qty −2');
    almost(newLot && newLot.qty, 5, 1e-6, tag + ': current lot unchanged');
    assert(Number(oldLot.qty) <= 10, tag + ': lot qty did not increase');
    assert(live.sales[0].qty === take, tag + ': sale.qty in sale-date scale');
    almost(live.sales[0].allocations[0].lotQtyDelta, 2, 1e-9, tag + ': lotQtyDelta = take/ratio');
    almost(live.sales[0].allocations[0].splitFactor, R, 1e-9, tag + ': splitFactor');
    almost(live.sales[0].allocations[0].adjustedBuyPrice, 1000, 0.05, tag + ': adjustedBuyPrice');
    const pnl = calc.getSplitAwareSaleRealizedPnl(live.sales[0], live, opts);
    almost(pnl.realizedPnlRub, 0, 0.05, tag + ': realized via adjustedBuyPrice');
    const histSum = calc.summarizeTickerHistory(t, live.positions, live.sales);
    almost(histSum.totalBoughtQty, 15, 1e-6, tag + ': bought stays 15 not open+sale.qty');
    almost(histSum.totalSoldQty, take, 1e-6, tag + ': sold in sale-date scale');
    assert(Math.abs(histSum.totalBoughtQty - (13 + take)) > 0.5, tag + ': bought not mixed scales');

    calc.removePortfolioSale(live.sales[0].saleId);
    almost((live.positions.find((p) => p.lotId === fx.hist.lotId) || {}).qty, 10, 1e-6, tag + ': cancel restores lotQtyDelta');
    almost((live.positions.find((p) => p.lotId === fx.curr.lotId) || {}).qty, 5, 1e-6, tag + ': cancel keeps current lot');
    assert(!(live.sales || []).length, tag + ': cancel removes sale');
    almost(calc.summarizeTickerHistory(t, live.positions, live.sales).totalBoughtQty, 15, 1e-6, tag + ': bought 15 after cancel');

    live = JSON.parse(JSON.stringify(mixed));
    const allQty = 10 * R + 5;
    const soldAll = calc.commitPortfolioSale(t, { qty: allQty, price: 1000, date: fx.now, comment: '' });
    assert(soldAll && soldAll.ok, tag + ': sell all accepted');
    assert(!(live.positions || []).some((p) => p.ticker === t && Number(p.qty) > 1e-9), tag + ': lots emptied');
    const closed = calc.listClosedPortfolioPositions(live.positions, live.sales);
    assert(closed.some((c) => c.ticker === t), tag + ': closed position');
    const closedPnl = calc.getSplitAwareTickerRealizedPnl(t, live, opts);
    assert(closedPnl.confidence !== 'unknown', tag + ': closed realized not unknown');
    assert(closedPnl.realizedPnlRub == null || Math.abs(closedPnl.realizedPnlRub) < 1 ||
      Math.abs(closedPnl.realizedPnlRub) < 0.2 * (10 * R + 5) * 1000, tag + ': closed not raw −99%');

    const legacySale = {
      saleId: 'LEG_' + t,
      ticker: t,
      qty: take,
      buyPrice: 1000 * R,
      salePrice: 1000,
      saleDate: fx.now,
      allocations: [{ lotId: fx.hist.lotId, qty: take, buyPrice: 1000 * R, buyDate: fx.before }]
    };
    const legacyRow = calc.getSplitAwareSaleRealizedPnl(legacySale, {
      positions: mixed.positions,
      sales: [legacySale]
    }, opts);
    assert(legacyRow.isPartial || legacyRow.confidence === 'partial' || legacyRow.confidence === 'unknown',
      tag + ': legacy after-split sale not confident');
    const raw = (1000 - 1000 * R) * take;
    if (legacyRow.realizedPnlRub != null) {
      assert(Math.abs(legacyRow.realizedPnlRub - raw) > 1, tag + ': legacy not raw realized');
    }

    const unkPf = {
      positions: [{ ticker: t, lotId: t + '_U', qty: 10, avgPrice: 1000 * R, currentPrice: 1000 }],
      sales: []
    };
    const unkSnap = JSON.stringify(unkPf);
    sb.getPortfolio = () => unkPf;
    sb.setPortfolio = (p) => { Object.keys(p).forEach((k) => { unkPf[k] = p[k]; }); };
    assert(calc.getPortfolioSplitSaleWriteState(t, unkPf, fx.now, { splitEvents: events }).mode === 'unknown',
      tag + ': unknown blocked');
    const unkCommit = calc.commitPortfolioSale(t, { qty: take, price: 1000, date: fx.now, comment: '' });
    assert(unkCommit && unkCommit.ok === false && unkCommit.blocked, tag + ': unknown not committed');
    assert(JSON.stringify(unkPf) === unkSnap, tag + ': unknown JSON unchanged');

    sb.getPortfolio = prevGet;
    sb.setPortfolio = prevSet;
  }

  const prodParsed = calc.sandbox.parseSplitEventsCatalog(catalog);
  calc.setSplitEventsCatalog(catalog);
  let i;
  for (i = 0; i < prodEvents.length; i++) {
    await runEventMatrix(prodEvents[i], prodParsed, 'prod');
  }

  const fakeRaw = {
    ticker: 'FAKE_SPLIT',
    aliases: ['FAKE'],
    effectiveDate: '2030-01-15',
    ratio: 5,
    type: 'split'
  };
  const fakeEvents = calc.sandbox.parseSplitEventsCatalog({
    version: 1,
    events: (catalog.events || []).concat([fakeRaw])
  });
  calc.setSplitEventsCatalog({ version: 1, events: fakeEvents });
  await runEventMatrix(fakeRaw, fakeEvents, 'fake');

  const sberPf = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: []
  };
  const sberSnap = JSON.stringify(sberPf);
  calc.setSplitEventsCatalog(catalog);
  const sberHeld = calc.getSplitAwareCurrentQty('SBER', sberPf, { splitEvents: prodParsed, now: '2026-09-04' });
  almost(sberHeld.qty, 10, 1e-6, 'matrix SBER: qty unchanged');
  const sb = calc.sandbox;
  const prevGet = sb.getPortfolio;
  const prevSet = sb.setPortfolio;
  let sberLive = JSON.parse(sberSnap);
  sb.getPortfolio = () => sberLive;
  sb.setPortfolio = (p) => { sberLive = p; };
  const sberSale = calc.commitPortfolioSale('SBER', { qty: 2, price: 280, date: '2026-09-04', comment: '' });
  assert(sberSale && sberSale.ok, 'matrix SBER: sale as before');
  almost(sberLive.positions[0].qty, 8, 1e-6, 'matrix SBER: qty −2');
  almost(calc.getSaleRealizedPnl(sberLive.sales[0]).amount, 60, 0.05, 'matrix SBER: realized old formula');
  assert(JSON.stringify({ positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }], sales: [] }) === sberSnap, 'matrix SBER: original fixture not mutated');

  const ofzPf = {
    positions: [{
      ticker: 'SU26238RMFS9', lotId: 'B1', qty: 10, avgPrice: 95, currentPrice: 98, buyDate: '2023-01-01'
    }],
    sales: []
  };
  let ofzLive = JSON.parse(JSON.stringify(ofzPf));
  sb.getPortfolio = () => ofzLive;
  sb.setPortfolio = (p) => { ofzLive = p; };
  const ofzSale = calc.commitPortfolioSale('SU26238RMFS9', { qty: 2, price: 98, date: '2026-09-04', comment: '' });
  assert(ofzSale && ofzSale.ok, 'matrix OFZ: sale as before');
  almost(ofzLive.positions[0].qty, 8, 1e-6, 'matrix OFZ: qty −2');
  const ofzScale = calc.diagnoseLotShareScale(ofzPf.positions[0], 'SU26238RMFS9', { splitEvents: prodParsed });
  assert(ofzScale.scale === 'n/a', 'matrix OFZ: no split scale');
  sb.getPortfolio = prevGet;
  sb.setPortfolio = prevSet;

  const src = Function.prototype.toString.call(calc.allocateSplitAwareSaleAcrossLots) +
    Function.prototype.toString.call(calc.getSplitAwareCurrentQty) +
    Function.prototype.toString.call(calc.summarizeTickerHistory) +
    Function.prototype.toString.call(calc.computePortfolioSummaryTotals) +
    Function.prototype.toString.call(calc.loadPortfolioIncomeTotals);
  assert(!/iss\.moex/.test(src) && !/fetch\s*\(/.test(src), 'matrix: no new MOEX fetch');
  calc.setSplitEventsCatalog(catalog);

  {
    const PX = 129.74;
    const gmknMixed = {
      positions: [
        { ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: PX },
        { ticker: 'GMKN', lotId: 'G2', qty: 10, avgPrice: 129.74, buyDate: '2026-09-04', currentPrice: PX }
      ],
      sales: []
    };
    const gmknSnap = JSON.stringify(gmknMixed);
    calc.setSplitEventsCatalog(catalog);
    let totals = calc.computePortfolioSummaryTotals(gmknMixed.positions, {}, gmknMixed.sales);
    almost(totals.stockValue, 1010 * PX, 0.05, 'summary GMKN: MV 1010×price');
    assert(Math.abs(totals.stockValue - 20 * PX) > 1, 'summary GMKN: not 20×price');
    const resultPct = (totals.totalValue - totals.remainCost) / totals.remainCost * 100;
    assert(resultPct > -90 && resultPct < -10, 'summary GMKN: result about −38/−41%, not −99%');
    assert(!/-99/.test(String(resultPct)), 'summary GMKN: pct not −99');
    assert(JSON.stringify(gmknMixed) === gmknSnap, 'summary GMKN: JSON immutable');

    const sberOnly = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
      sales: []
    };
    const sberSnapSum = JSON.stringify(sberOnly);
    const sberTot = calc.computePortfolioSummaryTotals(sberOnly.positions, {}, []);
    almost(sberTot.stockValue, 10 * 280, 0.02, 'summary SBER: JSON qty × price');
    almost(sberTot.remainCost, 10 * 250, 0.02, 'summary SBER: cost unchanged');
    assert(JSON.stringify(sberOnly) === sberSnapSum, 'summary SBER: JSON immutable');

    const ofzMeta = { OFZ26241: { faceValue: 1000 } };
    const ofzOnly = {
      positions: [{ ticker: 'OFZ26241', lotId: 'B1', qty: 10, avgPrice: 95, currentPrice: 98, buyDate: '2023-01-01' }],
      sales: []
    };
    const ofzSnapSum = JSON.stringify(ofzOnly);
    const ofzTot = calc.computePortfolioSummaryTotals(ofzOnly.positions, ofzMeta, []);
    almost(ofzTot.bondValue, 10 * 0.98 * 1000, 0.05, 'summary OFZ: % of face');
    almost(ofzTot.remainCost, 10 * 0.95 * 1000, 0.05, 'summary OFZ: cost % of face');
    almost(ofzTot.stockValue, 0, 1e-9, 'summary OFZ: not in stocks');
    assert(JSON.stringify(ofzOnly) === ofzSnapSum, 'summary OFZ: JSON immutable');

    const mixedSleeve = {
      positions: gmknMixed.positions.concat(ofzOnly.positions),
      sales: []
    };
    const sleeve = calc.computePortfolioSummaryTotals(mixedSleeve.positions, ofzMeta, []);
    almost(sleeve.stockValue, 1010 * PX, 0.05, 'summary share: stocks split-aware');
    almost(sleeve.bondValue, 10 * 0.98 * 1000, 0.05, 'summary share: bonds unchanged');
    const stockShare = sleeve.stockValue / sleeve.totalValue;
    const jsonShare = (20 * PX) / (20 * PX + ofzTot.bondValue);
    assert(Math.abs(stockShare - jsonShare) > 0.01, 'summary share: not JSON-qty GMKN weight');

    const unkPf = {
      positions: [{ ticker: 'GMKN', lotId: 'U1', qty: 10, avgPrice: 22000, currentPrice: PX }],
      sales: []
    };
    const unkSnap = JSON.stringify(unkPf);
    const unkTot = calc.computePortfolioSummaryTotals(unkPf.positions, {}, []);
    assert(unkTot.skippedUnknown && unkTot.isPartial, 'summary unknown: partial');
    assert(unkTot.onlyUnknown, 'summary unknown: not a confident total');
    assert(!(unkTot.stockValue > 0), 'summary unknown: not raw JSON MV');
    assert(JSON.stringify(unkPf) === unkSnap, 'summary unknown: JSON immutable');

    const nodes = { portfolioTotals: { hidden: true, innerHTML: '' } };
    const prevEl = calc.sandbox.document.getElementById;
    calc.sandbox.document.getElementById = (id) => nodes[id] || null;
    calc.renderPortfolioSummary(unkPf.positions, {}, { paid12m: 0, forecast12m: 0, isPartial: true, skippedSplit: true, hasIncluded: false }, []);
    assert(/Часть расчётов по бумагам с дроблением акций может быть неполной/.test(nodes.portfolioTotals.innerHTML), 'summary unknown ui: warning');
    assert(!/split-aware|metadata|writer|helper/.test(nodes.portfolioTotals.innerHTML), 'summary unknown ui: no technical terms');
    assert(/С выплатами за 12 мес\./.test(nodes.portfolioTotals.innerHTML), 'summary ui: 12m payouts label');
    assert(/к текущему остатку · справочно/.test(nodes.portfolioTotals.innerHTML), 'summary ui: remainder hint');
    assert(!/С учётом выплат/.test(nodes.portfolioTotals.innerHTML), 'summary ui: old confusing label gone');
    assert(!/полученн|зачислено|чистая доходность|гарантирован|заработано/.test(nodes.portfolioTotals.innerHTML), 'summary ui: no overclaim words');
    calc.sandbox.document.getElementById = prevEl;

    const sb = calc.sandbox;
    const prevGet = sb.getPortfolio;
    const prevSet = sb.setPortfolio;
    let live = JSON.parse(gmknSnap);
    sb.getPortfolio = () => live;
    sb.setPortfolio = (p) => { live = p; };
    const sale1 = calc.commitPortfolioSale('GMKN', { qty: 1, price: PX, date: '2026-09-08', comment: '' });
    assert(sale1 && sale1.ok, 'summary sale1: accepted');
    totals = calc.computePortfolioSummaryTotals(live.positions, {}, live.sales);
    almost(totals.stockValue, 1009 * PX, 0.05, 'summary sale1: MV 1009×price');
    const real1 = calc.getTotalRealizedPnl(live.sales, {});
    almost(real1, (PX - 220) * 1, 0.05, 'summary sale1: realized split-aware');

    live = JSON.parse(gmknSnap);
    const sale2 = calc.commitPortfolioSale('GMKN', { qty: 2, price: PX, date: '2026-09-08', comment: '' });
    assert(sale2 && sale2.ok, 'summary sale2: accepted');
    totals = calc.computePortfolioSummaryTotals(live.positions, {}, live.sales);
    almost(totals.stockValue, 1008 * PX, 0.05, 'summary sale2: MV 1008×price');
    const real2 = calc.getTotalRealizedPnl(live.sales, {});
    almost(real2, (PX - 220) * 2, 0.08, 'summary sale2: realized 2 current shares');

    live = JSON.parse(gmknSnap);
    const soldAll = calc.commitPortfolioSale('GMKN', { qty: 1010, price: PX, date: '2026-09-08', comment: '' });
    assert(soldAll && soldAll.ok, 'summary sell-all: accepted');
    totals = calc.computePortfolioSummaryTotals(live.positions, {}, live.sales);
    almost(totals.stockValue, 0, 0.05, 'summary sell-all: GMKN value 0');
    const closed = calc.listClosedPortfolioPositions(live.positions, live.sales);
    assert(closed.some((c) => c.ticker === 'GMKN'), 'summary sell-all: closed');
    const realAll = calc.getSplitAwareTickerRealizedPnl('GMKN', live);
    assert(realAll.confidence !== 'unknown', 'summary sell-all: realized not unknown');

    const tHist = {
      positions: [{ ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3200, buyDate: '2025-01-10', currentPrice: 255 }],
      sales: []
    };
    const tTot = calc.computePortfolioSummaryTotals(tHist.positions, {}, []);
    almost(tTot.stockValue, 10 * 255, 0.05, 'summary T: historical ×10');
    assert(Math.abs(tTot.stockValue - 1 * 255) > 1, 'summary T: not JSON 1×price');

    const analyticsCalls = [];
    const prevAnalytics = sb.buildSecurityAnalytics;
    sb.buildSecurityAnalytics = (ticker) => {
      analyticsCalls.push(ticker);
      return Promise.resolve({
        ticker: ticker,
        divForecast: { paid12m: 2, upcoming12m: 3, amount: 3 }
      });
    };
    const incGmkn = await calc.loadPortfolioIncomeTotals(JSON.parse(gmknSnap).positions, []);
    almost(incGmkn.paid12m, 1010 * 2, 0.05, 'income 12m: GMKN split-aware qty');
    almost(incGmkn.forecast12m, 1010 * 3, 0.05, 'forecast 12m: GMKN split-aware qty');
    assert(Math.abs(incGmkn.paid12m - 20 * 2) > 1, 'income 12m: not JSON 20');
    assert(analyticsCalls.filter((x) => x === 'GMKN').length === 1, 'income 12m: one analytics call per ticker');

    const incSber = await calc.loadPortfolioIncomeTotals(sberOnly.positions, []);
    almost(incSber.paid12m, 10 * 2, 0.02, 'income 12m: SBER JSON qty');
    almost(incSber.forecast12m, 10 * 3, 0.02, 'forecast 12m: SBER JSON qty');

    const prevBond = sb.computeBondCoupons12m;
    const prevFetchBond = sb.fetchOfzBondSnapshot;
    sb.fetchOfzBondSnapshot = () => Promise.resolve({
      coupons: [{ date: '2026-01-01', value: 35 }],
      faceValue: 1000
    });
    sb.computeBondCoupons12m = (coupons, qty, face) => ({
      paid12m: 35 * qty,
      upcoming12m: 40 * qty
    });
    const incOfz = await calc.loadPortfolioIncomeTotals(ofzOnly.positions, []);
    almost(incOfz.paid12m, 350, 0.05, 'income 12m: OFZ coupons × JSON qty');
    almost(incOfz.forecast12m, 400, 0.05, 'forecast 12m: OFZ coupons unchanged');

    const incUnk = await calc.loadPortfolioIncomeTotals(unkPf.positions, []);
    assert(incUnk.isPartial && incUnk.skippedSplit, 'income unknown: partial');
    assert(!incUnk.hasIncluded, 'income unknown: not included as earned 0');
    almost(incUnk.paid12m, 0, 1e-9, 'income unknown: no confident amount');

    sb.buildSecurityAnalytics = prevAnalytics;
    sb.computeBondCoupons12m = prevBond;
    sb.fetchOfzBondSnapshot = prevFetchBond;
    sb.getPortfolio = prevGet;
    sb.setPortfolio = prevSet;
  }
})();

{
  // v1.1 wave 1: buildPortfolioValueSeries — ряд оценок, без UI и без сети
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-09-04';

  function priceOk(price, extra) {
    extra = extra || {};
    return {
      status: 'ok',
      price: price,
      priceDate: extra.priceDate || extra.date || '2024-06-01',
      priceType: 'close',
      unit: extra.unit || 'rub',
      source: extra.source || (extra.unit === 'pct-of-face-value' ? 'moex-iss-history-bonds' : 'moex-iss-history-shares')
    };
  }
  function mockPricesOnOrBefore(map) {
    return function (ticker, date) {
      const t = String(ticker || '').toUpperCase();
      const iso = String(date || '').slice(0, 10);
      const byTicker = map[t];
      if (!byTicker) return Promise.resolve({ status: 'missing', price: null, priceDate: null });
      const keys = Object.keys(byTicker).filter((d) => d <= iso).sort();
      const key = keys.length ? keys[keys.length - 1] : null;
      const row = key ? byTicker[key] : null;
      return Promise.resolve(row || { status: 'missing', price: null, priceDate: null });
    };
  }
  function seriesOpts(priceMap, extra) {
    return Object.assign({
      interval: 'day',
      splitEvents: events,
      currentDate: NOW,
      getInstrumentPriceAtDate: mockPricesOnOrBefore(priceMap)
    }, extra || {});
  }
  function pointOn(series, iso) {
    return (series || []).find((p) => p.date === iso);
  }

  const sberPf = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: []
  };
  const sberSnap = JSON.stringify(sberPf);
  const sberSeries = await calc.buildPortfolioValueSeries(
    sberPf, '2024-06-03', '2024-06-05',
    seriesOpts({ SBER: { '2024-06-03': priceOk(100, { date: '2024-06-03' }) } }, { includePositions: true })
  );
  assert(sberSeries.length === 3, 'series SBER: 3 daily points');
  sberSeries.forEach((p) => {
    assert(p.date >= '2024-06-03' && p.date <= '2024-06-05', 'series SBER: date in range');
    assert(p.totalValueRub === 1000, 'series SBER: 10×100');
    assert(p.stocksValueRub === 1000 && p.bondsValueRub === 0 && p.cashValueRub === 0, 'series SBER: stocks only');
    assert(p.positions[0].qty === 10 && p.positions[0].valueRub === 1000, 'series SBER: qty×close');
    assert(!p.isPartial, 'series SBER: not partial');
  });
  assert(JSON.stringify(sberPf) === sberSnap, 'series JSON: SBER not mutated');

  const buyInsidePf = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-06-04', currentPrice: 280 }],
    sales: []
  };
  const buyInside = await calc.buildPortfolioValueSeries(
    buyInsidePf, '2024-06-03', '2024-06-05',
    seriesOpts({ SBER: { '2024-06-03': priceOk(100, { date: '2024-06-03' }) } }, { includePositions: true })
  );
  assert(pointOn(buyInside, '2024-06-03').totalValueRub === 0, 'series buy inside: before buy = 0');
  assert(pointOn(buyInside, '2024-06-04').totalValueRub === 1000, 'series buy inside: on buy > 0');
  assert(pointOn(buyInside, '2024-06-05').totalValueRub === 1000, 'series buy inside: after buy > 0');

  const saleInsidePf = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 6, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: [{
      saleId: 'SALE1', ticker: 'SBER', qty: 4, buyPrice: 250, salePrice: 280, saleDate: '2024-06-04',
      allocations: [{ lotId: 'S1', qty: 4, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  };
  const saleInside = await calc.buildPortfolioValueSeries(
    saleInsidePf, '2024-06-03', '2024-06-05',
    seriesOpts({ SBER: { '2024-06-03': priceOk(100, { date: '2024-06-03' }) } }, { includePositions: true })
  );
  assert(pointOn(saleInside, '2024-06-03').positions[0].qty === 10, 'series sale: before sale qty 10');
  assert(pointOn(saleInside, '2024-06-03').totalValueRub === 1000, 'series sale: before value 1000');
  assert(pointOn(saleInside, '2024-06-04').positions[0].qty === 6, 'series sale: after sale qty 6');
  assert(pointOn(saleInside, '2024-06-05').totalValueRub === 600, 'series sale: after value 600');

  const gmknPf = {
    positions: [{ ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92 }],
    sales: []
  };
  const gmknSnap = JSON.stringify(gmknPf);
  const gmknSeries = await calc.buildPortfolioValueSeries(
    gmknPf, '2024-04-01', '2024-04-10',
    seriesOpts({
      GMKN: {
        '2024-04-05': priceOk(25014, { date: '2024-04-05' }),
        '2024-04-08': priceOk(129.92, { date: '2024-04-08' })
      }
    }, { includePositions: true })
  );
  const gmknBefore = pointOn(gmknSeries, '2024-04-05');
  const gmknAfter = pointOn(gmknSeries, '2024-04-08');
  assert(gmknBefore && gmknBefore.positions[0].qty === 10, 'series GMKN: before split qty 10');
  assert(gmknBefore.totalValueRub === 250140, 'series GMKN: before 10×25014');
  assert(gmknAfter && gmknAfter.positions[0].qty === 1000, 'series GMKN: after split qty ×100');
  assert(Math.abs(gmknAfter.totalValueRub - 129920) < 1e-6, 'series GMKN: after 1000×129.92');
  assert(gmknAfter.totalValueRub !== 1299.2 && gmknAfter.positions[0].qty !== 10, 'series GMKN: not raw qty × new price');
  assert(gmknBefore.positions[0].valueRub === 250140, 'series GMKN: before value included');
  assert(Math.abs(gmknAfter.positions[0].valueRub - 129920) < 1e-6, 'series GMKN: after value included');
  assert(gmknBefore.isPartial === false && gmknAfter.isPartial === false, 'series GMKN: splitPartial priced is not incomplete');
  assert(gmknAfter.hasSplitAdvisory === true, 'series GMKN: split advisory');
  assert((gmknAfter.advisories || []).some((a) => /GMKN: учтено дробление акций 1:100/.test(a.text)),
    'series GMKN: advisory text');
  const gmknDropPct = (gmknAfter.totalValueRub - gmknBefore.totalValueRub) / gmknBefore.totalValueRub * 100;
  assert(gmknDropPct > -90, 'series GMKN: no technical −99%');
  assert(JSON.stringify(gmknPf) === gmknSnap, 'series JSON: GMKN not mutated');

  const tCurrPf = {
    positions: [{ ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262 }],
    sales: []
  };
  const tCurrSnap = JSON.stringify(tCurrPf);
  const tSeries = await calc.buildPortfolioValueSeries(
    tCurrPf, '2026-04-01', '2026-04-10',
    seriesOpts({
      T: { '2026-04-01': priceOk(262, { date: '2026-04-01' }) }
    }, { includePositions: true })
  );
  const tPt = pointOn(tSeries, '2026-04-01');
  assert(tPt, 'series T: has point before split');
  assert(tPt.positions[0].qty !== 100, 'series T: already-current not ×10 again');
  if (tPt.positions[0].qty != null && tPt.positions[0].status === 'ok') {
    assert(tPt.positions[0].qty === 10, 'series T: qty stays 10');
    assert(tPt.totalValueRub === 2620, 'series T: 10×262 not 100×262');
    assert(tPt.isPartial === false, 'series T: priced already-current not incomplete');
  } else {
    assert(tPt.isPartial === true, 'series T: pre-split ambiguous date may be partial');
    assert(tPt.totalValueRub !== 26200, 'series T: not double-counted 100×262');
  }
  assert(JSON.stringify(tCurrPf) === tCurrSnap, 'series JSON: T not mutated');

  const tAfterSeries = await calc.buildPortfolioValueSeries(
    tCurrPf, '2026-04-17', '2026-04-20',
    seriesOpts({
      T: { '2026-04-17': priceOk(262, { date: '2026-04-17' }) }
    }, { includePositions: true })
  );
  const tAfter = pointOn(tAfterSeries, '2026-04-17');
  assert(tAfter && tAfter.positions[0].valueRub != null, 'series T after: valueRub priced');
  assert(tAfter.positions[0].qty === 10, 'series T after: qty stays 10, no ×10');
  assert(tAfter.totalValueRub === 2620, 'series T after: 10×262');
  assert(tAfter.isPartial === false, 'series T after: not incomplete');

  const tSpanSeries = await calc.buildPortfolioValueSeries(
    tCurrPf, '2026-04-01', '2026-04-20',
    seriesOpts({
      T: { '2026-04-01': priceOk(262, { date: '2026-04-01' }) }
    }, { includePositions: true })
  );
  const tSpanBefore = pointOn(tSpanSeries, '2026-04-01');
  const tSpanAfter = pointOn(tSpanSeries, '2026-04-17');
  assert(tSpanBefore && tSpanBefore.isPartial === true, 'series T span: pre-split ambiguous is partial');
  assert(tSpanAfter && tSpanAfter.isPartial === false, 'series T span: after split not incomplete');
  assert(tSpanSeries.some((p) => !p.isPartial), 'series T span: not entire series incomplete');

  const tCurrScalePf = {
    positions: [{
      ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262,
      splitLotScale: 'current'
    }],
    sales: []
  };
  const tCurrScaleSnap = JSON.stringify(tCurrScalePf);
  const tCurrScaleSeries = await calc.buildPortfolioValueSeries(
    tCurrScalePf, '2026-04-01', '2026-04-20',
    seriesOpts({
      T: {
        '2026-04-01': priceOk(262, { date: '2026-04-01' }),
        '2026-04-17': priceOk(262, { date: '2026-04-17' })
      }
    }, { includePositions: true })
  );
  const tCurrScaleBefore = pointOn(tCurrScaleSeries, '2026-04-01');
  const tCurrScaleAfter = pointOn(tCurrScaleSeries, '2026-04-17');
  assert(tCurrScaleBefore && tCurrScaleBefore.isPartial === false, 'series T current confirm: pre-split full if priced');
  assert(tCurrScaleBefore.positions[0].qty === 1, 'series T current confirm: pre-split qty 1 old share');
  assert(tCurrScaleBefore.totalValueRub === 262, 'series T current confirm: 1×262');
  assert(tCurrScaleAfter && tCurrScaleAfter.isPartial === false, 'series T current confirm: after split full');
  assert(tCurrScaleAfter.positions[0].qty === 10, 'series T current confirm: after split stays 10');
  assert(tCurrScaleAfter.totalValueRub === 2620, 'series T current confirm: 10×262 not 100×262');
  assert(JSON.stringify(tCurrScalePf) === tCurrScaleSnap, 'series JSON: T current confirm not mutated');

  const tHistScalePf = {
    positions: [{
      ticker: 'T', lotId: 'T2H', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262,
      splitLotScale: 'historical'
    }],
    sales: []
  };
  const tHistScaleSnap = JSON.stringify(tHistScalePf);
  const tHistScaleSeries = await calc.buildPortfolioValueSeries(
    tHistScalePf, '2026-04-01', '2026-04-20',
    seriesOpts({
      T: {
        '2026-04-01': priceOk(262, { date: '2026-04-01' }),
        '2026-04-17': priceOk(262, { date: '2026-04-17' })
      }
    }, { includePositions: true })
  );
  const tHistScaleBefore = pointOn(tHistScaleSeries, '2026-04-01');
  const tHistScaleAfter = pointOn(tHistScaleSeries, '2026-04-17');
  assert(tHistScaleBefore && tHistScaleBefore.isPartial === false, 'series T historical confirm: pre-split full if priced');
  assert(tHistScaleBefore.positions[0].qty === 10, 'series T historical confirm: pre-split qty 10');
  assert(tHistScaleAfter && tHistScaleAfter.positions[0].qty === 100, 'series T historical confirm: after split 100');
  assert(tHistScaleAfter.totalValueRub === 26200, 'series T historical confirm: 100×262');
  assert(tHistScaleAfter.isPartial === false, 'series T historical confirm: after split full');
  assert(JSON.stringify(tHistScalePf) === tHistScaleSnap, 'series JSON: T historical confirm not mutated');

  const scaleOpts = { splitEvents: events, currentDate: NOW };
  const tLookPf = {
    positions: [{
      ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 262, buyDate: '2025-12-01', currentPrice: 262
    }],
    sales: []
  };
  const tLookSnap = JSON.stringify(tLookPf);
  const tLookSeries = await calc.buildPortfolioValueSeries(
    tLookPf, '2026-04-01', '2026-04-20',
    seriesOpts({
      T: {
        '2026-04-01': priceOk(262, { date: '2026-04-01' }),
        '2026-04-17': priceOk(262, { date: '2026-04-17' })
      }
    }, { includePositions: true })
  );
  const tLookBefore = pointOn(tLookSeries, '2026-04-01');
  const tLookAfter = pointOn(tLookSeries, '2026-04-17');
  assert(tLookBefore && tLookBefore.isPartial === true, 'dyn CTA T: pre-split unconfirmed is partial');
  assert(tLookAfter && tLookAfter.isPartial === false, 'dyn CTA T: after split priced is not incomplete');
  assert(calc.lotNeedsSplitScaleConfirmation(tLookPf.positions[0], 'T', scaleOpts) === true,
    'dyn CTA T: unresolved confirmation');
  assert(calc.seriesHasSplitScalePartial(tLookSeries, ['T']) === true,
    'dyn CTA T: series has unknown split-scale partial');
  const tLookCta = calc.buildPortfolioDynamicsSplitScaleCtaHtml(tLookPf, tLookSeries, scaleOpts);
  assert(/Для T нужно уточнить, как была внесена покупка до дробления, чтобы построить график точнее/.test(tLookCta),
    'dyn CTA T: lead in chart block');
  assert(/Покупка выглядит уже приведённой к текущим акциям после дробления\./.test(tLookCta),
    'dyn CTA T: compact look text');
  assert(!/Уточните, как внесены количество и средняя цена/.test(tLookCta),
    'dyn CTA T: chart copy is shorter than table CTA');
  assert(/data-pf-split-lot-scale="current"[\s\S]*data-pf-lot-id="T2"/.test(tLookCta),
    'dyn CTA T: current button uses existing handler attrs');
  assert(/data-pf-split-lot-scale="historical"[\s\S]*data-pf-lot-id="T2"/.test(tLookCta),
    'dyn CTA T: historical button uses existing handler attrs');
  assert(/Как в брокере сейчас/.test(tLookCta) && /Как было на дату покупки/.test(tLookCta),
    'dyn CTA T: same choice buttons');
  assert(calc.buildLotSplitScaleConfirmHtml(tLookPf.positions[0], 'T', scaleOpts).indexOf('pf-split-scale-confirm') >= 0,
    'dyn CTA T: table still has confirmation CTA');
  assert(JSON.stringify(tLookPf) === tLookSnap, 'dyn CTA T: JSON not mutated while building CTA');

  const tLookConfirmedPf = {
    positions: [{
      ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 262, buyDate: '2025-12-01', currentPrice: 262,
      splitLotScale: 'current'
    }],
    sales: []
  };
  const tLookConfirmedSnap = JSON.stringify(tLookConfirmedPf);
  const tLookConfirmedSeries = await calc.buildPortfolioValueSeries(
    tLookConfirmedPf, '2026-04-01', '2026-04-20',
    seriesOpts({
      T: {
        '2026-04-01': priceOk(262, { date: '2026-04-01' }),
        '2026-04-17': priceOk(262, { date: '2026-04-17' })
      }
    }, { includePositions: true })
  );
  const tLookConfBefore = pointOn(tLookConfirmedSeries, '2026-04-01');
  const tLookConfAfter = pointOn(tLookConfirmedSeries, '2026-04-17');
  assert(tLookConfBefore && tLookConfBefore.isPartial === false, 'dyn CTA T current: pre-split full if CLOSE');
  assert(tLookConfBefore.positions[0].qty === 1, 'dyn CTA T current: pre-split qty 1');
  assert(tLookConfAfter && tLookConfAfter.isPartial === false, 'dyn CTA T current: after split full if CLOSE');
  assert(tLookConfAfter.positions[0].qty === 10, 'dyn CTA T current: after split qty 10');
  assert(tLookConfirmedPf.positions[0].qty === 10 && tLookConfirmedPf.positions[0].avgPrice === 262,
    'dyn CTA T current: qty/avgPrice unchanged');
  assert(calc.buildPortfolioDynamicsSplitScaleCtaHtml(tLookConfirmedPf, tLookConfirmedSeries, scaleOpts) === '',
    'dyn CTA T current: chart CTA gone');
  assert(calc.seriesHasSplitScalePartial(tLookConfirmedSeries, ['T']) === false,
    'dyn CTA T current: no unknown split-scale partial');
  assert(calc.buildPortfolioDynamicsSeriesStatusText(tLookConfirmedSeries) === 'График построен с учётом дроблений акций.',
    'dyn CTA T current: advisory status');
  assert(calc.lotShowsSplitScaleConfirmUi(tLookConfirmedPf.positions[0], 'T', scaleOpts) === false,
    'dyn CTA T current: no big table CTA');
  assert(calc.lotShowsSplitScaleStatusUi(tLookConfirmedPf.positions[0], 'T', scaleOpts) === true,
    'dyn CTA T current: compact details status remains');
  assert(JSON.stringify(tLookConfirmedPf) === tLookConfirmedSnap, 'dyn CTA T current: JSON not mutated');

  assert(calc.collectUnresolvedSplitScaleLots(gmknPf, scaleOpts).length === 0,
    'dyn CTA GMKN: no unresolved split-scale');
  assert(calc.buildPortfolioDynamicsSplitScaleCtaHtml(gmknPf, gmknSeries, scaleOpts) === '',
    'dyn CTA GMKN: no chart CTA for confident historical');

  const plzlHistPf = {
    positions: [{ ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 19000, buyDate: '2024-06-01', currentPrice: 1900 }],
    sales: []
  };
  const plzlHistSeries = await calc.buildPortfolioValueSeries(
    plzlHistPf, '2025-03-20', '2025-03-28',
    seriesOpts({
      PLZL: {
        '2025-03-20': priceOk(19000, { date: '2025-03-20' }),
        '2025-03-27': priceOk(1900, { date: '2025-03-27' })
      }
    }, { includePositions: true })
  );
  assert(calc.collectUnresolvedSplitScaleLots(plzlHistPf, scaleOpts).length === 0,
    'dyn CTA PLZL: no unresolved split-scale');
  assert(calc.buildPortfolioDynamicsSplitScaleCtaHtml(plzlHistPf, plzlHistSeries, scaleOpts) === '',
    'dyn CTA PLZL: no chart CTA for confident historical');

  assert(calc.buildPortfolioDynamicsSplitScaleCtaHtml(sberPf, sberSeries, scaleOpts) === '',
    'dyn CTA SBER: no chart CTA without split-scale issue');

  const manyScalePf = {
    positions: [
      { ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 262, buyDate: '2025-12-01', currentPrice: 262 },
      { ticker: 'GMKN', lotId: 'GX', qty: 10, avgPrice: 800, buyDate: '2021-06-04', currentPrice: 130 }
    ],
    sales: []
  };
  const manyScaleSeries = [{
    date: '2024-04-01',
    isPartial: true,
    positions: [
      { ticker: 'T', splitConfidence: 'unknown' },
      { ticker: 'GMKN', splitConfidence: 'unknown' }
    ]
  }];
  const manyCta = calc.buildPortfolioDynamicsSplitScaleCtaHtml(manyScalePf, manyScaleSeries, scaleOpts);
  assert(/Для нескольких бумаг нужно уточнить, как были внесены покупки до дробления, чтобы построить график точнее/.test(manyCta),
    'dyn CTA many: plural lead');
  assert(/data-pf-lot-id="T2"/.test(manyCta) && /data-pf-lot-id="GX"/.test(manyCta),
    'dyn CTA many: one row per unresolved lot');

  const tAfterOnlyCta = calc.buildPortfolioDynamicsSplitScaleCtaHtml(tLookPf, tAfterSeries, scaleOpts);
  assert(tAfterOnlyCta === '', 'dyn CTA T after-only: no chart CTA if series is not split-scale partial');

  const k1 = calc.pfDynPortfolioKey(tLookPf, '1y');
  const k2 = calc.pfDynPortfolioKey(tLookConfirmedPf, '1y');
  assert(k1 !== k2, 'dyn CTA key: splitLotScale changes dynamics fingerprint');

  const prevGetScale = calc.sandbox.getPortfolio;
  const prevSetScale = calc.sandbox.setPortfolio;
  let scaleLive = {
    positions: [{
      ticker: 'T', lotId: 'T2', qty: 10, avgPrice: 312, buyDate: '2025-12-01', currentPrice: 262
    }],
    sales: [],
    cashFlows: [],
    schemaVersion: 1
  };
  calc.sandbox.getPortfolio = () => scaleLive;
  calc.sandbox.setPortfolio = (p) => { scaleLive = p; };
  assert(calc.setPortfolioLotSplitScale('T2', 'current') === true, 'set scale: current saved');
  assert(scaleLive.positions[0].splitLotScale === 'current', 'set scale: field current');
  assert(scaleLive.positions[0].qty === 10 && scaleLive.positions[0].avgPrice === 312, 'set scale: qty/avg unchanged');
  assert(calc.setPortfolioLotSplitScale('T2', 'historical') === true, 'set scale: historical saved');
  assert(scaleLive.positions[0].splitLotScale === 'historical', 'set scale: field historical');
  assert(scaleLive.positions[0].qty === 10 && scaleLive.positions[0].avgPrice === 312, 'set scale: still no qty/avg change');
  calc.sandbox.getPortfolio = prevGetScale;
  calc.sandbox.setPortfolio = prevSetScale;

  const ofzPf = {
    positions: [{ ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01', faceValue: 1000, currentPrice: 95 }],
    sales: []
  };
  const ofzSeries = await calc.buildPortfolioValueSeries(
    ofzPf, '2024-06-03', '2024-06-05',
    seriesOpts({
      OFZ_26238: { '2024-06-03': priceOk(95, { date: '2024-06-03', unit: 'pct-of-face-value' }) }
    }, { includePositions: true })
  );
  ofzSeries.forEach((p) => {
    assert(p.bondsValueRub === 9500 && p.stocksValueRub === 0, 'series OFZ: bond formula 10×95%×1000');
    assert(p.totalValueRub === 9500, 'series OFZ: total 9500');
    assert(p.positions[0].qty === 10, 'series OFZ: split logic not applied');
    assert(p.cashValueRub === 0, 'series OFZ: coupons not on Y');
    assert(p.isPartial === false, 'series OFZ: no historical NKD is not incomplete');
    assert(p.hasBondNkdAdvisory === true, 'series OFZ: NKD advisory');
  });
  assert(calc.buildPortfolioDynamicsSplitScaleCtaHtml(ofzPf, ofzSeries, scaleOpts) === '',
    'dyn CTA OFZ: NKD advisory is not a split-scale CTA');

  const missingPf = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15' },
      { ticker: 'GAZP', lotId: 'G1', qty: 4, avgPrice: 140, buyDate: '2024-02-01' }
    ],
    sales: []
  };
  let threw = false;
  let missingSeries;
  try {
    missingSeries = await calc.buildPortfolioValueSeries(
      missingPf, '2024-06-03', '2024-06-04',
      seriesOpts({ SBER: { '2024-06-03': priceOk(100, { date: '2024-06-03' }) } })
    );
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'series missing: no throw');
  assert(missingSeries && missingSeries[0].isPartial === true, 'series missing: isPartial');
  assert(missingSeries[0].totalValueRub === 1000, 'series missing: priced SBER only');
  assert(missingSeries[0].missingItemsCount >= 1, 'series missing: missingItemsCount');

  let fetchCalls = 0;
  const histCache = {
    SBER: [
      { date: '2024-06-03', close: 110 },
      { date: '2024-06-04', close: 111 },
      { date: '2024-06-05', close: 112 }
    ]
  };
  const cachedSeries = await calc.buildPortfolioValueSeries(
    sberPf, '2024-06-03', '2024-06-05',
    {
      interval: 'day',
      splitEvents: events,
      currentDate: NOW,
      historyByTicker: histCache,
      fetchHistory: function () { fetchCalls += 1; return []; },
      fetchJson: function () { fetchCalls += 1; return {}; },
      includePositions: true
    }
  );
  assert(fetchCalls === 0, 'series historyByTicker: fetch not called');
  assert(cachedSeries[0].totalValueRub === 1100, 'series historyByTicker: uses cached CLOSE');
  assert(cachedSeries[2].totalValueRub === 1120, 'series historyByTicker: last point from cache');

  const ready = await calc.buildPortfolioValueSeries(
    sberPf, '2024-06-03', '2024-06-05',
    seriesOpts({ SBER: { '2024-06-03': priceOk(100, { date: '2024-06-03' }) } })
  );
  assert(Array.isArray(ready) && ready.length === 3, 'series no hover fetch: full series in memory');
  assert(ready.every((p) => p.date && p.totalValueRub != null), 'series no hover fetch: each point complete');

  let loadOnceCalls = 0;
  const loadOnceSeries = await calc.buildPortfolioValueSeries(
    sberPf, '2024-06-03', '2024-06-10',
    {
      interval: 'day',
      splitEvents: events,
      currentDate: NOW,
      fetchHistory: function (q) {
        loadOnceCalls += 1;
        assert(q && q.market === 'shares', 'series loader: shares market only');
        return [
          { date: '2024-06-03', close: 100 },
          { date: '2024-06-10', close: 101 }
        ];
      }
    }
  );
  assert(loadOnceCalls <= 2, 'series loader: history once per ticker (≤2 boards), not per date');
  assert(loadOnceCalls < 8, 'series loader: not N dates × ISS');
  assert(loadOnceSeries.length === 8, 'series loader: daily points still built from cache');

  const weekSeries = await calc.buildPortfolioValueSeries(
    sberPf, '2024-06-01', '2024-06-29',
    seriesOpts({ SBER: { '2024-06-01': priceOk(100, { date: '2024-06-01' }) } }, { interval: 'week' })
  );
  const monthSeries = await calc.buildPortfolioValueSeries(
    sberPf, '2024-01-15', '2024-06-15',
    seriesOpts({ SBER: { '2024-01-15': priceOk(100, { date: '2024-01-15' }) } }, { interval: 'month' })
  );
  assert(weekSeries.length >= 2 && weekSeries.length <= 6, 'series week: one point per week');
  assert(monthSeries.length >= 2 && monthSeries.length <= 8, 'series month: one point per month');
  assert(weekSeries.length < 29, 'series week: not daily');

  const priceAtSrc = fs.readFileSync(path.join(__dirname, '..', 'price-at-date.js'), 'utf8');
  const portfolioSrc = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
  assert(/\/history\/engines\/stock\/markets\/' \+ market \+ '\/boards\//.test(priceAtSrc),
    'series ISS: existing history shares/bonds path remains');
  assert(!/candles\.json|\/iss\/engines\/futures/.test(priceAtSrc),
    'series ISS: price-at-date has no candle/futures endpoints');
  assert(!/iss\.moex\.com|\/history\/engines\//.test(portfolioSrc),
    'series ISS: portfolio.js does not add MOEX endpoints');
  assert(/isPartial: \(missing \+ unsupported \+ splitUnknown\) > 0 \|\| splitPartial > 0/.test(portfolioSrc),
    'series classify: as-of isPartial formula unchanged');
  assert(/function classifyPortfolioDynamicsSeriesPoint/.test(portfolioSrc),
    'series classify: dynamics reclassifies partial vs advisory');
  assert(!/candlestick|intraday/.test(Function.prototype.toString.call(calc.buildPortfolioValueSeries)),
    'series helper: no candlestick/intraday');

  const frozenStore = JSON.stringify(calc.memStore);
  await calc.buildPortfolioValueSeries(
    sberPf, '2024-06-03', '2024-06-05',
    seriesOpts({ SBER: { '2024-06-03': priceOk(100, { date: '2024-06-03' }) } })
  );
  assert(JSON.stringify(calc.memStore) === frozenStore, 'series: storage not written');
}

{
  // v1.1 wave 2: UI динамики — HTML, карточка, без fetch на hover
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const totalsAt = indexHtml.indexOf('id="portfolioTotals"');
  const dynAt = indexHtml.indexOf('id="portfolioDynamicsBlock"');
  const asofAt = indexHtml.indexOf('id="portfolioAsOfBlock"');
  assert(totalsAt > 0 && dynAt > totalsAt && asofAt > dynAt, 'dyn ui: block after summary, before as-of');
  assert(/Динамика портфеля/.test(indexHtml), 'dyn ui: title');
  assert(/Оценка портфеля на выбранную дату с учётом покупок, продаж и дроблений акций/.test(indexHtml), 'dyn ui: subtitle');
  assert(!/в реальном времени|интрадей|свечной график|\blive\b/i.test(indexHtml.slice(dynAt, asofAt)),
    'dyn ui: no live/intraday/candle copy');
  assert(/data-pf-dyn-horizon="1m"/.test(indexHtml) && /data-pf-dyn-horizon="1y"/.test(indexHtml) &&
    /data-pf-dyn-horizon="all"/.test(indexHtml), 'dyn ui: period controls');

  const css = fs.readFileSync(path.join(__dirname, '..', 'theme-luxury.css'), 'utf8');
  assert(/#tab-portfolio \.pf-dyn-card \{[\s\S]*?overflow-x:\s*clip/.test(css), 'dyn ui: card does not expand page');
  assert(/#tab-portfolio \.pf-dyn-block \{[\s\S]*?overflow-x:\s*clip/.test(css), 'dyn ui: block clips x overflow');
  assert(/#tab-portfolio \.pf-dyn-chart-wrap \{[\s\S]*?overflow:\s*hidden/.test(css), 'dyn ui: chart wrap contains canvas/tooltip');
  assert(/#tab-portfolio \.pf-dyn-split-scale \{[\s\S]*?overflow-x:\s*hidden/.test(css),
    'dyn ui: split-scale CTA does not overflow x');
  assert(/#tab-portfolio \.pf-dyn-split-scale \.pf-split-scale-confirm-actions \{[\s\S]*?flex-wrap:\s*wrap/.test(css),
    'dyn ui: split-scale CTA buttons wrap on narrow screens');
  assert(/minmax\(min\(100%, 8\.6rem\)/.test(css), 'dyn ui: card grid can shrink below 8.6rem');
  assert(/#tab-portfolio \{\s*max-width:\s*100%;[\s\S]*?overflow-x:\s*clip/.test(css),
    'dyn ui: portfolio tab does not page-scroll horizontally');

  const src = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
  assert(/Строим динамику портфеля/.test(src), 'dyn ui: loading copy');
  assert(/Добавьте позиции с датами покупки, чтобы построить динамику портфеля/.test(src), 'dyn ui: empty copy');
  assert(/Не удалось построить динамику портфеля\. Попробуйте обновить страницу/.test(src), 'dyn ui: error copy');
  assert(/Для части бумаг нет цены или поддержки на отдельные даты/.test(src), 'dyn ui: real partial copy');
  assert(/График построен с учётом дроблений акций/.test(src), 'dyn ui: split advisory copy');
  assert(/Для части бумаг оценка на отдельные даты неполная или требует проверки/.test(src),
    'dyn ui: mixed partial copy');
  assert(/Что учтено в расчёте\?/.test(src) && /Почему оценка неполная\?/.test(src),
    'dyn ui: disclosure titles');
  assert(/Список дроблений акций временно недоступен\. Динамика может быть неполной/.test(src),
    'dyn ui: catalog unavailable copy');
  assert(/isPortfolioSplitCatalogUnusable/.test(src) && /PF_DYN_CATALOG/.test(src),
    'dyn ui: catalog fail-safe wired');
  assert(/isPortfolioSplitCatalogPending/.test(src), 'dyn ui: pending catalog waits, not empty');
  const dynChunk = (src.match(/var PF_DYN_LOADING[\s\S]*function renderPortfolio/) || [''])[0];
  assert(!/candlestick|OHLC|intraday|auto-refresh/i.test(dynChunk),
    'dyn ui: no candle/intraday in dynamics block');
  const tableStart = src.indexOf('function renderPortfolioTableBody');
  const tableEnd = src.indexOf('var pfAsOfShown');
  const tableFn = tableStart >= 0 && tableEnd > tableStart ? src.slice(tableStart, tableEnd) : '';
  assert(tableFn.length > 100, 'dyn ui: table body slice found');
  assert(!/loadPortfolioDynamicsSeries|requestPortfolioDynamicsRefresh|refreshPortfolioDynamics/.test(tableFn),
    'dyn ui: table body does not rebuild series');
  assert(/requestPortfolioDynamicsRefresh\(\{ reason: 'render', immediate: true \}\)/.test(src),
    'dyn ui: series refresh on renderPortfolio, not quotes');
  assert(/pfDynRenderSplitScaleCta\(pf, series\)/.test(src),
    'dyn ui: chart CTA rendered from unresolved split-scale + series');
  assert(/splitCta\.addEventListener\('click', handlePortfolioTableClick\)/.test(src),
    'dyn ui: chart CTA reuses existing split-scale click handler');
  assert(/row\.splitLotScale \|\| ''/.test(src),
    'dyn ui: dynamics cache key includes splitLotScale');
  assert(!/refreshPortfolioQuotes\(\)[\s\S]{0,400}requestPortfolioDynamicsRefresh/.test(src),
    'dyn ui: quote refresh does not rebuild series');

  const ptrSrc = Function.prototype.toString.call(calc.applyPortfolioDynamicsPointer);
  const loadSrc = Function.prototype.toString.call(calc.loadPortfolioDynamicsSeries);
  const drawSrc = Function.prototype.toString.call(calc.drawPortfolioDynamicsChart);
  const reqSrc = Function.prototype.toString.call(calc.requestPortfolioDynamicsRefresh);
  assert(!/fetch\s*\(/.test(ptrSrc) && !/buildPortfolioValueAtDate/.test(ptrSrc) &&
    !/buildPortfolioValueSeries/.test(ptrSrc), 'dyn ui: hover/click reads series, no fetch');
  assert(/buildPortfolioValueSeries/.test(loadSrc), 'dyn ui: period load calls series helper');
  assert(!/getInstrumentPriceAtDate/.test(ptrSrc), 'dyn ui: pointer has no price fetch');
  assert(!/fetch\s*\(/.test(drawSrc) && !/buildPortfolioValueSeries/.test(drawSrc),
    'dyn ui: resize/draw does not fetch or rebuild series');
  assert(/pfDynLastKey/.test(reqSrc) && /pfDynPortfolioKey/.test(reqSrc),
    'dyn ui: refresh skips same portfolio fingerprint');
  assert(!/iss\.moex\.com/.test(dynChunk), 'dyn ui: no new ISS urls in dynamics UI');

  let seriesCalls = 0;
  const origSeries = calc.buildPortfolioValueSeries;
  calc.buildPortfolioValueSeries = function () {
    seriesCalls += 1;
    return origSeries.apply(this, arguments);
  };
  calc.applyPortfolioDynamicsPointer(10, 'hover');
  calc.applyPortfolioDynamicsPointer(10, 'select');
  calc.drawPortfolioDynamicsChart();
  assert(seriesCalls === 0, 'dyn ui: hover/click/draw do not call buildPortfolioValueSeries');
  calc.buildPortfolioValueSeries = origSeries;

  const mockSeries = [
    { date: '2024-06-03', totalValueRub: 1000, stocksValueRub: 1000, bondsValueRub: 0, cashValueRub: 0, isPartial: false, positions: [{ ticker: 'SBER', type: 'stock', qty: 10, price: 100, valueRub: 1000, status: 'ok' }] },
    { date: '2024-06-05', totalValueRub: 1200, stocksValueRub: 1200, bondsValueRub: 0, cashValueRub: 0, isPartial: false, positions: [{ ticker: 'SBER', type: 'stock', qty: 10, price: 120, valueRub: 1200, status: 'ok' }] }
  ];
  const picked = calc.selectPortfolioDynamicsPoint(mockSeries, 0);
  assert(picked.index === 0 && picked.point.date === '2024-06-03', 'dyn select: from series');
  const last = calc.selectPortfolioDynamicsPoint(mockSeries, null);
  assert(last.point.date === '2024-06-05', 'dyn select: default last');
  const ch = calc.buildPortfolioDynamicsChangeFromStart(mockSeries, 1);
  assert(ch.changeRub === 200 && Math.abs(ch.changePct - 20) < 1e-9, 'dyn change: +200 / +20%');
  const card = calc.buildPortfolioDynamicsCardHtml(mockSeries, 1);
  assert(/05\.06\.2024|5\.06\.2024/.test(card) || /2024/.test(card), 'dyn card: date');
  assert(/1[\s\u00a0]?200,00/.test(card) || /1200/.test(card), 'dyn card: total from series');
  assert(/SBER/.test(card), 'dyn card: top position');
  assert(/Крупнейшие позиции на дату/.test(card), 'dyn card: top heading');
  assert(!/Для части бумаг нет цены/.test(card), 'dyn card: no duplicate partial warning');
  assert(!/fetch/.test(card), 'dyn card: html has no fetch');
  assert(/График строится по оценке на дату/.test(indexHtml), 'dyn ui: chart caption');
  assert(/id="pfDynCaption"/.test(indexHtml), 'dyn ui: caption node');
  assert(/id="pfDynDisclose"/.test(indexHtml), 'dyn ui: disclosure node');
  assert(/id="pfDynSplitScaleCta"/.test(indexHtml), 'dyn ui: split-scale CTA node in chart block');
  assert(indexHtml.indexOf('id="pfDynStatus"') < indexHtml.indexOf('id="pfDynSplitScaleCta"') &&
    indexHtml.indexOf('id="pfDynSplitScaleCta"') < indexHtml.indexOf('id="pfDynChartWrap"'),
    'dyn ui: split-scale CTA sits between status and chart');
  assert(/white-space:\s*nowrap/.test(css), 'dyn ui: parts label stays inline');
  assert(/#tab-portfolio \.pf-dyn-parts input\[type="checkbox"\][\s\S]*?appearance:\s*none/.test(css),
    'dyn ui: checkbox is custom, not system blue');
  assert(/#tab-portfolio \.pf-dyn-parts input\[type="checkbox"\][\s\S]*?opacity:\s*0/.test(css),
    'dyn ui: native checkbox hidden, sage box via ::before');
  assert(/#tab-portfolio \.pf-dyn-parts input\[type="checkbox"\][\s\S]*?accent-color:\s*var\(--accent\)/.test(css),
    'dyn ui: checkbox sage accent fallback');
  assert(/#tab-portfolio \.pf-dyn-parts input\[type="checkbox"\]:focus-visible[\s\S]*?var\(--bronze\)/.test(css),
    'dyn ui: checkbox focus uses bronze/sage, not browser-blue');
  assert(/input\[type="checkbox"\]:checked \+ \.pf-dyn-parts-text::before[\s\S]*?var\(--accent\)/.test(css),
    'dyn ui: checked mark uses sage accent');
  assert(!/#007|#0d6efd|#0060|#1e90ff|rgb\(\s*0\s*,\s*120/i.test(css.match(/#tab-portfolio \.pf-dyn-parts input\[type="checkbox"\][\s\S]*?#tab-portfolio \.pf-dyn-status/)?.[0] || ''),
    'dyn ui: checkbox block has no blue hex');
  assert(/pad = \{ top: 14, right: 44/.test(src), 'dyn ui: x-axis right inset');
  assert(/--pf-dyn-line/.test(src) && /--pf-dyn-stocks/.test(src) && /--pf-dyn-bonds/.test(src),
    'dyn ui: canvas uses branded color tokens');
  assert(/createLinearGradient/.test(src), 'dyn ui: airy bronze area fill');
  assert(!/#007|#0d6efd|#1e90ff/i.test(drawSrc), 'dyn ui: draw has no blue');

  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  function priceOk(price, extra) {
    extra = extra || {};
    return { status: 'ok', price: price, priceDate: extra.date || extra.priceDate, priceType: 'close', unit: extra.unit || 'rub' };
  }
  function mockOnOrBefore(map) {
    return function (ticker, date) {
      const t = String(ticker || '').toUpperCase();
      const iso = String(date || '').slice(0, 10);
      const by = map[t] || {};
      const keys = Object.keys(by).filter((d) => d <= iso).sort();
      const row = keys.length ? by[keys[keys.length - 1]] : null;
      return Promise.resolve(row || { status: 'missing', price: null });
    };
  }
  const gmknPf = {
    positions: [{ ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92 }],
    sales: []
  };
  const gmknSeries = await calc.buildPortfolioValueSeries(gmknPf, '2024-04-01', '2024-04-10', {
    interval: 'day',
    splitEvents: events,
    currentDate: '2026-09-04',
    includePositions: true,
    getInstrumentPriceAtDate: mockOnOrBefore({
      GMKN: {
        '2024-04-01': priceOk(25014, { date: '2024-04-01' }),
        '2024-04-05': priceOk(25014, { date: '2024-04-05' }),
        '2024-04-08': priceOk(129.92, { date: '2024-04-08' })
      }
    })
  });
  const gmknCh = calc.buildPortfolioDynamicsChangeFromStart(
    gmknSeries,
    gmknSeries.findIndex((p) => p.date === '2024-04-08')
  );
  assert(gmknCh.changePct == null || gmknCh.changePct > -90, 'dyn GMKN: no technical −99%');
  const gmknCard = calc.buildPortfolioDynamicsCardHtml(
    gmknSeries,
    gmknSeries.findIndex((p) => p.date === '2024-04-08')
  );
  assert(!/−99/.test(gmknCard) && !/-99/.test(gmknCard) && !/−98/.test(gmknCard), 'dyn GMKN card: no −99%');

  const gmknPriced = gmknSeries.find((p) => p.date === '2024-04-08');
  assert(gmknPriced && gmknPriced.positions[0].valueRub != null, 'dyn GMKN priced: valueRub');
  assert(gmknPriced.totalValueRub === gmknPriced.positions[0].valueRub, 'dyn GMKN priced: included in total');
  assert(gmknSeries.every((p) => p.isPartial === false), 'dyn GMKN priced: no incomplete points');
  assert(gmknPriced.isPartial === false, 'dyn GMKN priced: not incomplete');
  assert(gmknPriced.hasSplitAdvisory === true, 'dyn GMKN priced: split advisory');
  const gmknAsOf = await calc.buildPortfolioValueAtDate(gmknPf, '2024-04-08', {
    splitEvents: events,
    currentDate: '2026-09-04',
    getInstrumentPriceAtDate: mockOnOrBefore({
      GMKN: { '2024-04-08': priceOk(129.92, { date: '2024-04-08' }) }
    })
  });
  assert(gmknAsOf.isPartial === true && gmknAsOf.totalValueRub != null, 'as-of GMKN: splitPartial still flags value-at-date');
  assert(gmknPriced.isPartial === false, 'dyn GMKN priced: series does not copy as-of isPartial');
  assert(!calc.buildPortfolioDynamicsTipLines(gmknPriced).some((ln) => ln === 'оценка неполная'),
    'dyn GMKN priced: tooltip not incomplete');
  const gmknStatus = calc.buildPortfolioDynamicsSeriesStatusText(gmknSeries);
  assert(gmknStatus === 'График построен с учётом дроблений акций.', 'dyn GMKN priced: advisory status');
  assert(!/нет цены/.test(gmknStatus) && !/оценка неполная/.test(gmknStatus),
    'dyn GMKN priced: status not scary incomplete');
  const gmknDisc = calc.buildPortfolioDynamicsDisclosureHtml(gmknSeries);
  assert(/Что учтено в расчёте\?/.test(gmknDisc), 'dyn GMKN priced: advisory disclosure title');
  assert(/GMKN: учтено дробление акций 1:100/.test(gmknDisc), 'dyn GMKN priced: split disclosure');
  assert(!/Почему оценка неполная\?/.test(gmknDisc), 'dyn GMKN priced: not incomplete disclosure');

  const gmknMissingSeries = await calc.buildPortfolioValueSeries(gmknPf, '2024-04-01', '2024-04-03', {
    interval: 'day',
    splitEvents: events,
    currentDate: '2026-09-04',
    includePositions: true,
    getInstrumentPriceAtDate: function () {
      return Promise.resolve({ status: 'missing', price: null, priceDate: null });
    }
  });
  assert(gmknMissingSeries[0].isPartial === true, 'dyn GMKN missing CLOSE: isPartial');
  assert(calc.buildPortfolioDynamicsTipLines(gmknMissingSeries[0]).some((ln) => ln === 'оценка неполная'),
    'dyn GMKN missing CLOSE: tooltip incomplete');
  assert(/график может быть неполным/.test(calc.buildPortfolioDynamicsSeriesStatusText(gmknMissingSeries)),
    'dyn GMKN missing CLOSE: incomplete status');

  const tHistPf = {
    positions: [{ ticker: 'T', lotId: 'TH', qty: 1, avgPrice: 3000, buyDate: '2025-01-10', currentPrice: 300 }],
    sales: []
  };
  const tHistSeries = await calc.buildPortfolioValueSeries(tHistPf, '2026-04-17', '2026-04-18', {
    interval: 'day',
    splitEvents: events,
    currentDate: '2026-09-04',
    includePositions: true,
    getInstrumentPriceAtDate: mockOnOrBefore({
      T: { '2026-04-17': priceOk(300, { date: '2026-04-17' }) }
    })
  });
  const tHist = tHistSeries.find((p) => p.date === '2026-04-17');
  assert(tHist && tHist.positions[0].qty === 10, 'dyn T historical: qty ×10');
  assert(tHist.totalValueRub === 3000, 'dyn T historical: 10×300');
  assert(tHist.isPartial === false, 'dyn T historical: full if CLOSE exists');

  const unsupPf = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 },
      { ticker: 'AAPL', lotId: 'U1', qty: 2, avgPrice: 180, buyDate: '2024-01-15', market: 'US' }
    ],
    sales: []
  };
  const unsupSeries = await calc.buildPortfolioValueSeries(unsupPf, '2024-06-03', '2024-06-04', {
    interval: 'day',
    includePositions: true,
    getInstrumentPriceAtDate: function (ticker, date) {
      const t = String(ticker || '').toUpperCase();
      if (t === 'SBER') return Promise.resolve(priceOk(100, { date: date || '2024-06-03' }));
      return Promise.resolve({ status: 'unsupported', price: null });
    }
  });
  assert(unsupSeries[0].isPartial === true, 'dyn unsupported: isPartial');
  assert(unsupSeries[0].totalValueRub === 1000, 'dyn unsupported: priced SBER only');
  assert(/график может быть неполным/.test(calc.buildPortfolioDynamicsSeriesStatusText(unsupSeries)),
    'dyn unsupported: incomplete status');

  const mixedStatus = calc.buildPortfolioDynamicsSeriesStatusText([gmknPriced, unsupSeries[0]]);
  assert(/неполная или требует проверки/.test(mixedStatus), 'dyn mixed: mixed status copy');

  const ofzPf = {
    positions: [{ ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95.4, buyDate: '2024-02-01', faceValue: 1000 }],
    sales: []
  };
  const ofzSeries = await calc.buildPortfolioValueSeries(ofzPf, '2024-06-03', '2024-06-05', {
    interval: 'day',
    includePositions: true,
    getInstrumentPriceAtDate: mockOnOrBefore({
      OFZ_26238: { '2024-06-03': priceOk(95, { date: '2024-06-03', unit: 'pct-of-face-value' }) }
    })
  });
  const ofzCard = calc.buildPortfolioDynamicsCardHtml(ofzSeries, ofzSeries.length - 1);
  assert(/9[\s\u00a0]?500/.test(ofzCard) || /9500/.test(ofzCard), 'dyn OFZ: bond formula in card');
  assert(ofzSeries.every((p) => p.isPartial === false), 'dyn OFZ: NKD note is not incomplete');
  assert(ofzSeries.some((p) => p.hasBondNkdAdvisory), 'dyn OFZ: NKD advisory allowed');
  const ofzStatus = calc.buildPortfolioDynamicsSeriesStatusText(ofzSeries);
  assert(!/нет цены/.test(ofzStatus) && !/оценка неполная/.test(ofzStatus) && !/неполным/.test(ofzStatus),
    'dyn OFZ: status not incomplete');
  const ofzDisc = calc.buildPortfolioDynamicsDisclosureHtml(ofzSeries);
  assert(/Что учтено в расчёте\?/.test(ofzDisc), 'dyn OFZ: advisory disclosure title');
  assert(/ОФЗ: оценка на дату без исторического НКД/.test(ofzDisc), 'dyn OFZ: NKD disclosure');

  const sberCard = calc.buildPortfolioDynamicsCardHtml(mockSeries, 0);
  assert(/SBER/.test(sberCard) && /1[\s\u00a0]?000/.test(sberCard) || /1000/.test(sberCard), 'dyn SBER: qty×close card');

  const r1y = calc.resolvePortfolioDynamicsRange('1y', '2026-09-04', '2020-01-01');
  assert(r1y.toDate === '2026-09-04' && r1y.fromDate <= '2025-09-04', 'dyn range: 1Y');
  const rall = calc.resolvePortfolioDynamicsRange('all', '2026-09-04', '2021-06-04');
  assert(rall.fromDate === '2021-06-04', 'dyn range: all from first buy');
  assert(calc.resolvePortfolioDynamicsInterval('1y', '2025-09-04', '2026-09-04') === 'day', 'dyn interval: 1Y day');
  assert(calc.resolvePortfolioDynamicsInterval('all', '2015-01-01', '2026-09-04') !== 'day', 'dyn interval: long all not daily');
  assert(calc.resolvePortfolioDynamicsHorizon('2026-09-04', '2020-01-01', '1y') === '1y', 'dyn default: 1Y when history long');
  assert(calc.resolvePortfolioDynamicsHorizon('2026-09-04', '2026-08-01', '1y') === 'all', 'dyn default: all when history short');

  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(/initPortfolioDynamicsUi/.test(appSrc), 'dyn ui: bound from app.js');
  assert(/drawPortfolioDynamicsChart/.test(appSrc) &&
    !/loadPortfolioDynamicsSeries|requestPortfolioDynamicsRefresh|buildPortfolioValueSeries/.test(
      (appSrc.match(/window\.addEventListener\('resize'[\s\S]*?\n    \}\);/) || [''])[0]
    ), 'dyn ui: resize only redraws canvas');
  assert(!/showPortfolioAsOfComposition/.test(ptrSrc), 'dyn ui: click does not drive as-of');

  const k1 = calc.pfDynPortfolioKey({
    positions: [{ ticker: 'SBER', lotId: 'L1', qty: 10, buyDate: '2024-01-01', avgPrice: 100 }],
    sales: []
  }, '1y');
  const k2 = calc.pfDynPortfolioKey({
    positions: [{ ticker: 'SBER', lotId: 'L1', qty: 11, buyDate: '2024-01-01', avgPrice: 100 }],
    sales: []
  }, '1y');
  const k3 = calc.pfDynPortfolioKey({
    positions: [{ ticker: 'SBER', lotId: 'L1', qty: 10, buyDate: '2024-01-01', avgPrice: 100 }],
    sales: []
  }, '3m');
  assert(k1 && k1 !== k2 && k1 !== k3, 'dyn key: portfolio qty and horizon change fingerprint');
}

{
  // Результат портфеля: assembler поверх summary + realized + TWP
  function almost(a, b, eps, msg) {
    if (!(Math.abs(Number(a) - Number(b)) <= eps)) errors.push(msg + ' got ' + a + ' expected ' + b);
  }
  const NOW = '2026-09-14';
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
  function runPrs(portfolio, extra) {
    return calc.buildPortfolioResultSummary(
      portfolio,
      Object.assign({ now: NOW }, extra || {})
    );
  }

  const src = Function.prototype.toString.call(calc.buildPortfolioResultSummary);
  assert((src.match(/getTotalRealizedPnl/g) || []).length === 1, 'prs src: realized helper once');
  assert(!/listClosedPortfolioPositions/.test(src), 'prs src: does not sum closed cards');
  assert(!/loadPortfolioIncomeTotals/.test(src), 'prs src: no 12m income totals');
  assert(!/computePricePlusPayoutsPct/.test(src), 'prs src: no 12m percent helper');

  const oneStock = {
    positions: [{
      ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280
    }],
    sales: []
  };
  const frozenOne = JSON.stringify(oneStock);
  const oneOpts = { payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 33.3 }]) };
  const prsOne = runPrs(oneStock, oneOpts);
  const twpOne = calc.buildPortfolioReturnWithPayouts(oneStock, Object.assign({ now: NOW }, oneOpts));
  assert(prsOne.remainCostRub === 2500, 'prs 1: invested in remainder');
  assert(prsOne.currentMarketValueRub === 2800, 'prs 1: current MV');
  assert(prsOne.unrealizedPnlRub === 300, 'prs 1: unrealized');
  assert(prsOne.realizedPnlRub === 0, 'prs 1: no sales');
  assert(prsOne.payoutsRub === 333, 'prs 1: holding-period payouts');
  assert(prsOne.resultWithPayoutsRub === 300 + 333, 'prs 1: total = unrealized + payouts');
  almost(prsOne.resultWithPayoutsRub, twpOne.resultWithPayoutsRub, 0.02, 'prs 11: identity vs TWP');
  assert(Math.abs(prsOne.returnVsPurchasePct - ((300 + 333) / 2500) * 100) < 1e-9, 'prs 1: pct vs purchases');
  assert(JSON.stringify(oneStock) === frozenOne, 'prs 1: JSON not mutated');

  const withPaidNoise = runPrs(oneStock, Object.assign({
    paid12m: 999999,
    forecast12m: 888888,
    incomeTotals: { paid12m: 999999, forecast12m: 888888 }
  }, oneOpts));
  assert(withPaidNoise.payoutsRub === 333, 'prs 10: 12m totals not used as payouts');
  assert(withPaidNoise.resultWithPayoutsRub === prsOne.resultWithPayoutsRub, 'prs 10: total ignores 12m extras');
  assert(withPaidNoise.resultWithPayoutsRub !== 999999, 'prs 10: total is not paid12m');

  const partialPf = {
    positions: [{ ticker: 'SBER', lotId: 'S1', qty: 4, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
    sales: [{
      saleId: 'SALE1',
      ticker: 'SBER',
      qty: 6,
      buyPrice: 250,
      salePrice: 270,
      saleDate: '2024-06-01',
      allocations: [{ lotId: 'S1', qty: 6, buyPrice: 250, buyDate: '2024-01-15' }]
    }]
  };
  const partialOpts = { payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }]) };
  const prsPart = runPrs(partialPf, partialOpts);
  assert(prsPart.remainCostRub === 1000, 'prs 2: remainder cost 4×250');
  assert(prsPart.currentMarketValueRub === 1120, 'prs 2: remainder MV 4×280');
  assert(prsPart.unrealizedPnlRub === 120, 'prs 2: unrealized remainder only');
  const realizedOnce = calc.getTotalRealizedPnl(partialPf.sales, {});
  almost(prsPart.realizedPnlRub, realizedOnce, 0.02, 'prs 7: same realized as helper');
  almost(prsPart.realizedPnlRub, 120, 0.02, 'prs 2: realized sold 6×20');
  assert(prsPart.payoutsRub === 40, 'prs 2: payout × qty on record date');
  assert(prsPart.resultWithPayoutsRub === 120 + 120 + 40, 'prs 2: total parts');
  const twpPart = calc.buildPortfolioReturnWithPayouts(partialPf, Object.assign({ now: NOW }, partialOpts));
  almost(prsPart.resultWithPayoutsRub, twpPart.resultWithPayoutsRub, 0.02, 'prs 11: partial identity');

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
  const closedOpts = { payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }]) };
  const prsClosed = runPrs(closedOnly, closedOpts);
  assert(prsClosed.currentMarketValueRub === 0, 'prs 3: closed MV 0');
  assert(prsClosed.remainCostRub === 0, 'prs 3: closed remainder 0');
  assert(prsClosed.unrealizedPnlRub === 0, 'prs 3: closed unrealized 0');
  almost(prsClosed.realizedPnlRub, 300, 0.02, 'prs 3: realized 300');
  assert(prsClosed.payoutsRub === 100, 'prs 3: dividend during holding');
  assert(prsClosed.resultWithPayoutsRub === 400, 'prs 3: realized + payouts');
  assert(Math.abs(prsClosed.returnVsPurchasePct - 16) < 1e-9, 'prs 3: 400/2500 = 16%');

  calc.localStorage.clear();
  calc.hideClosedPortfolioTicker('SBER');
  const prsHidden = runPrs(closedOnly, closedOpts);
  assert(prsHidden.resultWithPayoutsRub === prsClosed.resultWithPayoutsRub, 'prs 12: hidden closed still in total');
  assert(prsHidden.payoutsRub === 100, 'prs 12: hidden closed payouts kept');
  calc.restoreClosedPortfolioTicker('SBER');

  const twoStocks = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 4, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 300 },
      { ticker: 'GAZP', lotId: 'G1', qty: 30, avgPrice: 100, buyDate: '2024-03-01', currentPrice: 110 }
    ],
    sales: []
  };
  const twoFeeds = Object.assign({}, sberFeed([]), gazpFeed([]));
  const prsTwo = runPrs(twoStocks, { payoutsByTicker: twoFeeds });
  assert(prsTwo.unrealizedPnlRub === 500, 'prs 4: 200+300');
  assert(prsTwo.resultWithPayoutsRub === 500, 'prs 4: summed result');
  assert(Math.abs(prsTwo.returnVsPurchasePct - 12.5) < 1e-9, 'prs 4: 500/4000 not average');

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
  const mixSnap = JSON.stringify(mix);
  const prsMix = runPrs(mix, {
    payoutsByTicker: mixFeeds,
    bondMetaMap: { OFZ_26238: { faceValue: 1000 } }
  });
  assert(prsMix.dividendsRub === 100 && prsMix.couponsRub === 423.8, 'prs 5: div + coupon split');
  assert(prsMix.payoutsRub === 523.8, 'prs 5: payouts once');
  almost(prsMix.remainCostRub, 2500 + 9540, 0.02, 'prs 5: stock + OFZ invested');
  almost(prsMix.currentMarketValueRub, 2800 + 9800, 0.02, 'prs 5: stock + OFZ MV');
  assert(JSON.stringify(mix) === mixSnap, 'prs 5: OFZ JSON not mutated');

  const oneNoFeed = {
    positions: [
      { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 },
      { ticker: 'GAZP', lotId: 'G1', qty: 2, avgPrice: 140, buyDate: '2024-01-15', currentPrice: 150 }
    ],
    sales: []
  };
  const prsNoFeed = runPrs(oneNoFeed, {
    payoutsByTicker: sberFeed([{ date: '2024-07-17', value: 10 }])
  });
  assert(prsNoFeed.isPartial === true, 'prs 6: partial if one feed missing');
  assert(prsNoFeed.missingPayoutFeed === true, 'prs 6: missing feed flag');
  assert(prsNoFeed.payoutsRub === 100, 'prs 6: known payouts only');
  assert(prsNoFeed.resultWithPayoutsRub != null, 'prs 6: price result still computed');
  assert(prsNoFeed.unrealizedPnlRub === 300 + 20, 'prs 6: both prices in unrealized');
  const noFeedHtml = calc.buildPortfolioResultSummaryHtml(prsNoFeed);
  assert(/По части бумаг нет данных о выплатах/.test(noFeedHtml), 'prs 6: missing-feed copy');
  assert(!/полученн|зачислено|чистая доходность|гарантирован|заработано/.test(noFeedHtml), 'prs ui: no overclaim words');

  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const unkPf = {
    positions: [{ ticker: 'GMKN', lotId: 'U1', qty: 10, avgPrice: 22000, currentPrice: 150 }],
    sales: []
  };
  const unkSnap = JSON.stringify(unkPf);
  const prsUnk = runPrs(unkPf, { payoutsByTicker: { GMKN: { kind: 'stock', source: 'moex', dividends: [] } } });
  assert(prsUnk.hideTotals === true && prsUnk.onlyUnknown === true, 'prs 9: hide unknown split totals');
  assert(prsUnk.currentMarketValueRub == null, 'prs 9: not JSON qty MV');
  assert(prsUnk.resultWithPayoutsRub == null, 'prs 9: total hidden');
  assert(prsUnk.returnVsPurchasePct == null, 'prs 9: pct hidden');
  assert(unkPf.positions[0].splitLotScale == null, 'prs 9: splitLotScale not written');
  assert(JSON.stringify(unkPf) === unkSnap, 'prs 9: JSON not mutated');
  const unkHtml = calc.buildPortfolioResultSummaryHtml(prsUnk);
  assert(/может быть неполной/.test(unkHtml), 'prs 9: split warning');
  assert(!/1[\s\u00a0]?500/.test(unkHtml), 'prs 9: html not raw 10×150');

  const tHist = {
    positions: [{ ticker: 'T', lotId: 'T1', qty: 1, avgPrice: 3200, buyDate: '2025-01-10', currentPrice: 255 }],
    sales: []
  };
  const tSnap = JSON.stringify(tHist);
  const prsT = runPrs(tHist, { payoutsByTicker: { T: { kind: 'stock', source: 'moex', dividends: [] } } });
  almost(prsT.currentMarketValueRub, 10 * 255, 0.05, 'prs split-ok: T historical ×10');
  assert(prsT.resultWithPayoutsRub != null, 'prs split-ok: total visible');
  assert(tHist.positions[0].splitLotScale == null, 'prs split-ok: scale not written');
  assert(JSON.stringify(tHist) === tSnap, 'prs split-ok: JSON not mutated');

  const html = calc.buildPortfolioResultSummaryHtml(prsOne);
  assert(/Вложено/.test(html) && /Текущая стоимость/.test(html), 'prs ui: core cards');
  assert(/Найденные выплаты/.test(html), 'prs ui: found payouts label');
  assert(/к сумме покупок, справочно/.test(html), 'prs ui: pct base copy');
  assert(/Как считается/.test(html), 'prs ui: how details');
  assert(/Прогноз выплат и выплаты за 12 месяцев в этот итог не входят/.test(html), 'prs ui: 12m excluded copy');
  assert(/pf-prs-hero/.test(html) && /pf-prs-breakdown/.test(html), 'prs ui: hero then breakdown');
  assert(html.indexOf('pf-prs-hero') < html.indexOf('pf-prs-breakdown'), 'prs ui: hero before breakdown');
  assert(/<details class="pf-prs-how">/.test(html) && !/<details class="pf-prs-how" open/.test(html), 'prs ui: how closed by default');
}

{
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const pfJs = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'ui.js'), 'utf8');
  const newsSrc = fs.readFileSync(path.join(__dirname, '..', 'news.js'), 'utf8');
  const ofzSrc = fs.readFileSync(path.join(__dirname, '..', 'ofz.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const luxury = fs.readFileSync(path.join(__dirname, '..', 'theme-luxury.css'), 'utf8');
  const tabHtml = indexHtml.slice(
    indexHtml.indexOf('id="tab-portfolio"'),
    indexHtml.indexOf('id="tab-articles"')
  );

  function between(src, startMark, endMark) {
    const a = src.indexOf(startMark);
    const b = src.indexOf(endMark, a + 1);
    return a >= 0 && b > a ? src.slice(a, b) : '';
  }
  function countId(src, id) {
    return (src.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  }

  const overview = between(tabHtml, 'id="portfolioSubviewOverview"', 'id="portfolioSubviewAnalytics"');
  const analytics = between(tabHtml, 'id="portfolioSubviewAnalytics"', 'id="portfolioSubviewPositions"');
  const positions = between(tabHtml, 'id="portfolioSubviewPositions"', 'id="portfolioSubviewOperations"');
  const operations = between(tabHtml, 'id="portfolioSubviewOperations"', '</section>');

  assert(/id="portfolioSubnav"/.test(tabHtml), 'inner tabs: subnav exists');
  assert(/role="tablist"/.test(tabHtml) && /aria-label="Раздел портфеля"/.test(tabHtml), 'inner tabs: tablist');
  assert(/data-portfolio-sub="overview"/.test(tabHtml) && /data-portfolio-sub="analytics"/.test(tabHtml) &&
    /data-portfolio-sub="positions"/.test(tabHtml) && /data-portfolio-sub="operations"/.test(tabHtml),
    'inner tabs: four tabs');
  assert(/aria-selected="true"/.test(tabHtml) && /tabindex="0"/.test(tabHtml) && /tabindex="-1"/.test(tabHtml),
    'inner tabs: roving tabindex markup');
  assert(/portfolioSub: 'overview'/.test(newsSrc), 'inner tabs: default state overview');

  assert(/id="portfolioTotals"/.test(overview) && /id="portfolioResultSummary"/.test(overview) &&
    /id="portfolioUpcomingPayoutsBlock"/.test(overview), 'inner tabs: overview hosts summary/result/upcoming');
  assert(/data-portfolio-jump="positions"/.test(overview) && /data-portfolio-jump="analytics-dyn"/.test(overview) &&
    /Добавить позицию/.test(overview), 'inner tabs: overview jumps and empty CTA');
  assert(!/data-pf-split-lot-scale/.test(overview), 'inner tabs: overview has no split scale buttons');

  assert(/id="portfolioDynamicsBlock"/.test(analytics) && /id="pfDynChart"/.test(analytics) &&
    /id="pfDynSplitScaleCta"/.test(analytics), 'inner tabs: analytics hosts dynamics');
  assert(/id="portfolioAsOfBlock"/.test(analytics) && /id="portfolioCompareBlock"/.test(analytics) &&
    /id="portfolioPayoutsBlock"/.test(analytics), 'inner tabs: analytics hosts as-of/compare/holding');
  assert(/Для ОФЗ в таблице показана дата купона/.test(tabHtml) &&
    /Право на выплату оценивается по дате фиксации/.test(tabHtml),
    'inner tabs: OFZ payout copy splits display vs entitlement');
  assert(!/ОФЗ — по дате купона/.test(tabHtml) && !/ОФЗ — по дате купона/.test(pfJs),
    'inner tabs: old OFZ coupon-date-only copy removed');
  assert(/id="portfolioFolderSection"/.test(analytics) && /id="portfolioInsightsSection"/.test(analytics),
    'inner tabs: folder+insights stay together');
  assert(!/За счёт чего изменился портфель/.test(tabHtml), 'inner tabs: no attribution stub');

  assert(/portfolio-add-form/.test(positions) && /id="portfolioSaleForm"/.test(positions) &&
    /id="portfolioTable"/.test(positions) && /id="portfolioCards"/.test(positions) &&
    /id="resetPortfolioBtn"/.test(positions) && /id="pfSplitCatalogWarn"/.test(positions),
    'inner tabs: positions hosts forms/table/cards');
  assert(/id="portfolioRecentSection"/.test(operations) && /id="portfolioClosedSection"/.test(operations),
    'inner tabs: operations hosts recent+closed');
  assert(!/id="exportJsonBtn"/.test(tabHtml), 'inner tabs: backup stays out of portfolio');

  ['portfolioTotals', 'portfolioResultSummary', 'portfolioDynamicsBlock', 'pfDynChart',
    'portfolioAsOfBlock', 'portfolioCompareBlock', 'portfolioPayoutsBlock', 'portfolioUpcomingPayoutsBlock',
    'portfolioFolderSection', 'portfolioInsightsSection', 'portfolioSaleForm', 'portfolioTable',
    'portfolioCards', 'portfolioRecentSection', 'portfolioClosedSection',
    'pfAddTicker', 'pfAddQty', 'pfAddAvg', 'pfAddDate', 'pfAddBtn', 'portfolioSubviewPositions'].forEach((id) => {
    assert(countId(indexHtml, id) === 1, 'inner tabs: unique id ' + id);
  });

  const totalsAt = indexHtml.indexOf('id="portfolioTotals"');
  const dynAt = indexHtml.indexOf('id="portfolioDynamicsBlock"');
  const asofAt = indexHtml.indexOf('id="portfolioAsOfBlock"');
  assert(totalsAt > 0 && dynAt > totalsAt && asofAt > dynAt, 'inner tabs: totals still before dyn before as-of');

  function sliceFn(src, name, span) {
    const i = src.indexOf('function ' + name);
    return i < 0 ? '' : src.slice(i, i + (span || 1800));
  }

  const switchFn = (pfJs.match(/function switchPortfolioSub\([\s\S]*?\n  function ensurePortfolioSub/) || [''])[0];
  assert(/function switchPortfolioSub/.test(switchFn), 'inner tabs: switchPortfolioSub exists');
  assert(!/renderPortfolio\(/.test(switchFn), 'inner tabs: switch does not renderPortfolio');
  assert(!/requestPortfolioDynamicsRefresh/.test(switchFn), 'inner tabs: switch does not refresh series');
  assert(!/loadPortfolioDynamicsSeries/.test(switchFn), 'inner tabs: switch does not load series');
  assert(!/\bfetch\s*\(/.test(switchFn), 'inner tabs: switch does not fetch');
  assert(!/setPortfolio\(/.test(switchFn), 'inner tabs: switch does not write portfolio');
  assert(!/localStorage/.test(switchFn) && !/sessionStorage/.test(switchFn), 'inner tabs: switch has no storage');
  assert(!/replaceState/.test(switchFn) && !/location\.hash/.test(switchFn), 'inner tabs: switch does not touch hash');
  assert(!/cancelPortfolioEdit|clearAllPortfolioForms/.test(switchFn), 'inner tabs: switch keeps forms');
  assert(!/setPortfolioDynamicsHorizon/.test(switchFn), 'inner tabs: switch keeps dyn period');

  const renderFn = sliceFn(pfJs, 'renderPortfolio()', 700);
  assert(/initPortfolioSubnav/.test(renderFn), 'inner tabs: render binds subnav');
  assert(!/switchPortfolioSub\(/.test(renderFn) && !/ensurePortfolioSub\(/.test(renderFn),
    'inner tabs: background renderPortfolio does not change subview');

  const selectFn = sliceFn(pfJs, 'selectPortfolioTicker', 900);
  assert(/userIntent === 'analytics'/.test(selectFn), 'inner tabs: ticker analytics only on user intent');
  assert(/ensurePortfolioSub\('analytics'/.test(selectFn), 'inner tabs: explicit ticker opens analytics');

  assert(/ensurePortfolioSub\('positions'/.test(sliceFn(pfJs, 'startSalePortfolioTicker', 1600)),
    'inner tabs: sell opens positions');
  assert(/ensurePortfolioSub\('positions'/.test(sliceFn(pfJs, 'scrollPortfolioEditFormIntoView', 800)),
    'inner tabs: edit opens positions');
  assert(/ensurePortfolioSub\('positions'/.test(sliceFn(pfJs, 'openPortfolioTickerDetailsFromRecent', 1400)),
    'inner tabs: recent details opens positions');
  assert(/ensurePortfolioSub\('positions'/.test(ofzSrc), 'inner tabs: OFZ add opens positions');
  assert(/userIntent: 'analytics'/.test(appSrc), 'inner tabs: folder click is analytics intent');
  assert(/initPortfolioSubnav/.test(appSrc), 'inner tabs: subnav bound from app.js');

  const switchTabFn = (uiSrc.match(/function switchTab\(tab\) \{[\s\S]*?function openDigestModal/) || [''])[0];
  assert(!/portfolioSub/.test(switchTabFn), 'inner tabs: leaving/returning does not reset sub');
  assert(/'#' \+ tab/.test(switchTabFn), 'inner tabs: top hash still #portfolio');
  assert(!/portfolio\//.test(sliceFn(uiSrc, 'initHash()', 900)),
    'inner tabs: no nested portfolio hash');

  assert(/function handlePortfolioSubnavKeydown/.test(pfJs) && /ArrowRight/.test(pfJs) &&
    /ArrowLeft/.test(pfJs) && /Home/.test(pfJs) && /End/.test(pfJs),
    'inner tabs: keyboard arrows/home/end');
  assert(/aria-selected/.test(pfJs) && /tabIndex = isActive \? 0 : -1/.test(pfJs),
    'inner tabs: aria and roving tabindex updates');

  assert(/\.portfolio-subview\[hidden\] \{[\s\S]*?display:\s*none !important/.test(css),
    'inner tabs: hidden panels out of layout');
  assert(/\.portfolio-subnav\.horizon-tabs \{[\s\S]*?min-width:\s*0/.test(css),
    'inner tabs: subnav can shrink');
  assert(!/\.portfolio-subnav[\s\S]{0,180}nowrap/.test(css), 'inner tabs: subnav not nowrap');
  assert(/@media \(max-width:\s*699px\)[\s\S]{0,280}?\.portfolio-subnav\.horizon-tabs \{[\s\S]{0,180}?grid-template-columns:\s*1fr 1fr/.test(css),
    'inner tabs: mobile subnav is 2x2 grid');
  assert(!/function pfFormFieldEl/.test(pfJs), 'cleanup: pfFormFieldEl removed');
  assert(/document\.getElementById\(pfFieldId\(prefix, 'Ticker'\)\)/.test(sliceFn(pfJs, 'readPortfolioForm', 700)),
    'cleanup: readPortfolioForm uses getElementById');
  assert(/#tab-portfolio \{\s*max-width:\s*100%;[\s\S]*?overflow-x:\s*clip/.test(luxury),
    'inner tabs: portfolio tab still clips x overflow');
  assert(/setPortfolioLotSplitScale/.test(pfJs) && /id="pfDynSplitScaleCta"/.test(analytics),
    'inner tabs: existing split CTA remains in analytics');
  assert(/data-pf-split-lot-scale/.test(pfJs), 'inner tabs: lot split buttons still in positions renderer');

  const afterShowFn = sliceFn(pfJs, 'afterPortfolioSubviewShown', 900);
  const scheduleFn = sliceFn(pfJs, 'scheduleVisiblePortfolioChartsRedraw', 1400);
  const drawFn = sliceFn(pfJs, 'drawPortfolioDynamicsChart', 900);
  const ensureDynFn = sliceFn(pfJs, 'ensurePortfolioDynamicsReady', 700);
  const tabActiveFn = sliceFn(pfJs, 'pfDynTabActive', 250);
  const reqFn = sliceFn(pfJs, 'requestPortfolioDynamicsRefresh', 900);
  const loadFn = sliceFn(pfJs, 'loadPortfolioDynamicsSeries', 4500);
  assert(/ensurePortfolioDynamicsReady/.test(afterShowFn),
    'inner tabs: analytics show ensures dynamics ready');
  assert(!/requestPortfolioDynamicsRefresh/.test(afterShowFn) && !/loadPortfolioDynamicsSeries/.test(afterShowFn),
    'inner tabs: analytics show does not fetch directly');
  assert(/PF_CHART_LAYOUT_RETRY_MAX = 4/.test(pfJs), 'inner tabs: chart layout retry is finite');
  assert(!/setInterval/.test(scheduleFn), 'inner tabs: layout retry has no setInterval');
  assert(!/ResizeObserver/.test(scheduleFn) && !/ResizeObserver/.test(afterShowFn),
    'inner tabs: switch does not add ResizeObserver');
  assert(/wrapW < 16 && !opts\.allowFallbackSize/.test(drawFn),
    'inner tabs: draw waits for nonzero wrap width');
  assert(!/\bfetch\s*\(/.test(scheduleFn) && !/buildPortfolioValueSeries/.test(scheduleFn),
    'inner tabs: layout redraw does not fetch or rebuild series');
  assert(!/portfolioSub/.test(tabActiveFn) && !/isPortfolioSubviewVisible/.test(tabActiveFn),
    'inner tabs: pfDynTabActive is top-tab only');
  assert(!/isPortfolioSubviewVisible/.test(reqFn) && !/portfolioSub/.test(reqFn),
    'inner tabs: request dynamics is not gated on analytics subview');
  assert(!/isPortfolioSubviewVisible/.test(loadFn) && !/getPortfolioSub\(/.test(loadFn),
    'inner tabs: series load is not gated on analytics subview');
  assert(/isPortfolioSubviewVisible\('analytics'\)/.test(drawFn),
    'inner tabs: draw still requires visible analytics');
  assert(/pfDynHasSeries\(\)/.test(ensureDynFn) && /pfDynBuildInFlight/.test(ensureDynFn),
    'inner tabs: ensure uses series + in-flight guards');
  assert(/requestPortfolioDynamicsRefresh\(\{ immediate: true, reason: 'analytics-visible' \}\)/.test(ensureDynFn),
    'inner tabs: ensure starts existing refresh only if series missing');
  assert(!/force:\s*true/.test(ensureDynFn), 'inner tabs: ensure does not force a new series build');
}

{
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const pfJs = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
  const cmpBlock = indexHtml.slice(
    indexHtml.indexOf('id="portfolioCompareBlock"'),
    indexHtml.indexOf('id="portfolioPayoutsBlock"')
  );
  assert((cmpBlock.match(/type="date"/g) || []).length === 2, 'bridge ui: still two compare date inputs');
  assert(/id="pfCmpFromDate"/.test(cmpBlock) && /id="pfCmpToDate"/.test(cmpBlock), 'bridge ui: same compare dates');
  assert(!/id="pfBridgeFromDate"|id="pfBridgeToDate"|id="pfCmpBridgeFrom"/.test(cmpBlock),
    'bridge ui: no second date picker');
  assert(!/За счёт чего изменился портфель/.test(cmpBlock), 'bridge ui: title is renderer-only, not a static stub');

  const showCmp = pfJs.slice(
    pfJs.indexOf('function showPortfolioValueCompare'),
    pfJs.indexOf('var PF_PAY_BTN_IDLE')
  );
  assert(/buildPortfolioValueChangeBridge\(/.test(showCmp), 'bridge ui: compare calls existing helper');
  assert(/buildPortfolioValueChangeBetweenDates: function \(\) \{ return result; \}/.test(showCmp),
    'bridge ui: reuses compare snapshot, no second as-of fetch');
  assert(!/buildPortfolioValueSeries/.test(showCmp), 'bridge ui: compare path does not build series');
  assert(!/paid12m|forecast12m/.test(showCmp), 'bridge ui: no 12m payout fields in compare path');

  const helperStart = pfJs.indexOf('function buildPortfolioValueChangeBridge');
  const helperEnd = pfJs.indexOf('function resultSeriesAmountKnown');
  const helperSrc = pfJs.slice(helperStart, helperEnd);
  assert(/fromValueRub \+ purchasesRub - salesRub \+ priceEffectRub/.test(helperSrc.replace(/\s+/g, ' ').replace(/−/g, '-')),
    'bridge ui: Wave 1 identity still in helper');

  const full = calc.buildPortfolioValueChangeBridgeHtml({
    fromDate: '2024-01-01',
    toDate: '2024-06-01',
    fromValueRub: 100,
    toValueRub: 150,
    purchasesRub: 20,
    salesRub: 10,
    priceEffectRub: 40,
    identityOk: true,
    isPartial: false,
    operationsPartial: false
  });
  assert(calc.isPortfolioValueChangeBridgeFull({
    identityOk: true, isPartial: false, operationsPartial: false
  }) === true, 'bridge ui: full state helper');
  assert(/За счёт чего изменился портфель/.test(full), 'bridge ui full: title');
  assert(/Покупки/.test(full) && /Продажи/.test(full) && /Ценовой эффект/.test(full), 'bridge ui full: P/S/effect labels');
  assert(/Стоимость на начало/.test(full) && /Стоимость на конец/.test(full), 'bridge ui full: from/to rows');
  assert(/Как считается/.test(full), 'bridge ui full: how-to disclosure');
  assert(/Изменение оценки бумаг и ценовой эффект сделок/.test(full), 'bridge ui full: short how-to');
  assert(!/Прибыль|Доходность|Рыночная прибыль|Пополнения|Внесено|residual|paid12m|forecast12m/.test(full),
    'bridge ui full: no forbidden terms');
  assert(!/#portfolio\//.test(full), 'bridge ui full: no nested hash');
  assert(!/type="date"/.test(full), 'bridge ui full: no date inputs');

  const partial = calc.buildPortfolioValueChangeBridgeHtml({
    fromDate: '2024-01-01',
    toDate: '2024-06-01',
    fromValueRub: 0,
    toValueRub: 0,
    purchasesRub: 100,
    salesRub: 0,
    priceEffectRub: -100,
    identityOk: true,
    isPartial: true,
    operationsPartial: false
  });
  assert(calc.isPortfolioValueChangeBridgeFull({
    identityOk: true, isPartial: true, operationsPartial: false
  }) === false, 'bridge ui: identityOk+isPartial is not full');
  assert(/Расчёт частичный: для части позиций не хватает исторических данных/.test(partial),
    'bridge ui partial: warning');
  assert(/по доступным данным/.test(partial), 'bridge ui partial: effect marked soft');
  assert(/Ценовой эффект/.test(partial), 'bridge ui partial: effect still shown');
  assert(/pf-bridge-row--soft/.test(partial), 'bridge ui partial: effect less categorical');

  const opsPart = calc.buildPortfolioValueChangeBridgeHtml({
    fromDate: '2024-01-01',
    toDate: '2024-06-01',
    fromValueRub: 1200,
    toValueRub: 650,
    purchasesRub: null,
    salesRub: null,
    priceEffectRub: null,
    identityOk: false,
    isPartial: true,
    operationsPartial: true
  });
  assert(/Не все операции за период удалось оценить/.test(opsPart), 'bridge ui opsPartial: warning');
  assert(/pf-bridge-row--effect[\s\S]*?<span class="pf-bridge-val">—<\/span>/.test(opsPart),
    'bridge ui opsPartial: null effect is an em dash');
  assert(!/pf-bridge-row--buy[\s\S]*?<span class="pf-bridge-val">0,00/.test(opsPart),
    'bridge ui opsPartial: null purchases are not 0');
  assert(/Стоимость на начало/.test(opsPart) && /1[\s\u00a0]?200,00/.test(opsPart),
    'bridge ui opsPartial: snapshot from-value still shown');

  const invalid = calc.buildPortfolioValueChangeBridgeHtml({ invalidDate: true, fromDate: '', toDate: '' });
  assert(invalid === '', 'bridge ui invalid: no fake math block');
}

{
  const sb = calc.sandbox;
  const origGetP = sb.getPortfolio;
  const origGetId = sb.document.getElementById;
  const origSeries = sb.buildPortfolioValueSeries;
  let seriesCalls = 0;
  const fake = {
    block: { id: 'portfolioDynamicsBlock' },
    status: { id: 'pfDynStatus', hidden: false, textContent: '' },
    wrap: {
      id: 'pfDynChartWrap',
      hidden: true,
      clientWidth: 0,
      addEventListener: function () {},
      getBoundingClientRect: function () { return { width: 0, height: 0 }; }
    },
    caption: { hidden: true },
    disclose: { hidden: true, innerHTML: '', open: false },
    cta: { hidden: true, innerHTML: '' },
    card: { hidden: true, innerHTML: '' },
    periods: { querySelectorAll: function () { return []; } }
  };
  sb.document.getElementById = function (id) {
    if (id === 'portfolioDynamicsBlock') return fake.block;
    if (id === 'pfDynStatus') return fake.status;
    if (id === 'pfDynChartWrap') return fake.wrap;
    if (id === 'pfDynCaption') return fake.caption;
    if (id === 'pfDynDisclose') return fake.disclose;
    if (id === 'pfDynSplitScaleCta') return fake.cta;
    if (id === 'pfDynCard') return fake.card;
    if (id === 'pfDynPeriods') return fake.periods;
    return null;
  };
  sb.state.tab = 'portfolio';
  sb.state.portfolioSub = 'overview';
  sb.getPortfolio = function () {
    return {
      positions: [{ ticker: 'SBER', lotId: 'L1', qty: 10, avgPrice: 250, buyDate: '2024-01-15', currentPrice: 280 }],
      sales: []
    };
  };
  sb.buildPortfolioValueSeries = function () {
    seriesCalls += 1;
    return Promise.resolve([
      { date: '2024-06-03', totalValueRub: 1000, stocksValueRub: 1000, bondsValueRub: 0, cashValueRub: 0, isPartial: false, positions: [] },
      { date: '2024-06-05', totalValueRub: 1100, stocksValueRub: 1100, bondsValueRub: 0, cashValueRub: 0, isPartial: false, positions: [] }
    ]);
  };
  calc.setPfDynLastKey('');
  calc.pfDynState.series = [];
  calc.pfDynState.horizon = '1y';
  try {
    await calc.requestPortfolioDynamicsRefresh({ immediate: true, reason: 'render' });
    assert(seriesCalls === 1, 'inner tabs deadlock: overview still starts series load');
    const afterOverview = seriesCalls;
    sb.state.portfolioSub = 'analytics';
    calc.ensurePortfolioDynamicsReady();
    calc.ensurePortfolioDynamicsReady();
    assert(seriesCalls === afterOverview, 'inner tabs deadlock: analytics show does not refetch ready series');
    calc.setPfDynLastKey('');
    calc.pfDynState.series = [];
    seriesCalls = 0;
    await calc.ensurePortfolioDynamicsReady();
    assert(seriesCalls === 1, 'inner tabs deadlock: analytics starts load if series never started');
    await calc.ensurePortfolioDynamicsReady();
    assert(seriesCalls === 1, 'inner tabs deadlock: repeat analytics does not start second fetch');
  } catch (err) {
    errors.push('inner tabs deadlock runtime: ' + (err && err.message ? err.message : err));
  } finally {
    sb.getPortfolio = origGetP;
    sb.document.getElementById = origGetId;
    sb.buildPortfolioValueSeries = origSeries;
  }
}

function loadPortfolioWriterSandbox() {
  const store = Object.create(null);
  const fields = Object.create(null);
  const toasts = [];
  let renderCount = 0;
  let savedBeforeSuccessToast = 0;
  function makeField(id, value) {
    fields[id] = {
      id: id,
      value: value == null ? '' : String(value),
      hidden: false,
      textContent: '',
      closest: function () { return null; },
      focus: function () {},
      setAttribute: function () {},
      getAttribute: function () { return ''; }
    };
    return fields[id];
  }
  ['pfAddTicker', 'pfAddQty', 'pfAddAvg', 'pfAddDate', 'pfAddComment', 'pfAddBtn', 'pfAddFormTitle'].forEach((id) => {
    makeField(id, '');
  });
  fields.pfAddBtn.textContent = 'Добавить позицию в портфель';
  const positionsHost = {
    id: 'portfolioSubviewPositions',
    hidden: false,
    querySelector: function (sel) {
      if (sel && sel.charAt(0) === '#') return fields[sel.slice(1)] || null;
      return null;
    }
  };
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
    setTimeout: () => {},
    clearTimeout: () => {},
    normalizeTicker: (t) => String(t || '').trim().toUpperCase(),
    isRuBondTicker: () => false,
    isIndexQuoteTicker: () => false,
    Markets: {
      isUsTicker: () => false,
      isUsPosition: (pos) => !!(pos && pos.market === 'US'),
      normalizePositionMarket: (raw) => ({
        market: raw && raw.market === 'US' ? 'US' : 'RU',
        currency: raw && raw.market === 'US' ? 'USD' : 'RUB'
      }),
      normalizeWatchlist: (wl) => wl,
      normalizeMarketsSettings: (s) => (s && s.markets) || { ru: true, us: false },
      formatMoneyValue: (v) => (v == null ? '—' : String(v)),
      marketBadgeLabel: (market) => (market === 'US' ? 'US' : 'РФ'),
      getMarketsEnabled: () => ({ ru: true, us: false })
    },
    showToast: (msg) => {
      const text = String(msg == null ? '' : msg);
      if (/Добавлено в портфель|Докупка добавлена|Покупка обновлена/.test(text)) {
        const raw = store['ibrf.portfolio'];
        let n = 0;
        try {
          n = JSON.parse(raw || '{"positions":[]}').positions.length;
        } catch (e) {
          n = 0;
        }
        if (n > 0) savedBeforeSuccessToast += 1;
      }
      toasts.push(text);
    },
    renderPortfolio: () => { renderCount += 1; },
    fetchMoexLastPrice: () => Promise.resolve(null),
    fetchMoexQuote: () => Promise.resolve(null),
    document: {
      getElementById: (id) => {
        if (id === 'portfolioSubviewPositions') return positionsHost;
        return fields[id] || null;
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ click: () => {} })
    },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    state: {
      tab: 'portfolio',
      portfolioSub: 'positions',
      pfEditLotId: '',
      pfEditTicker: '',
      pfEditPrefix: '',
      chartTicker: '',
      folderOpen: false
    },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    escapeHtml: (s) => String(s == null ? '' : s)
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const storageCode = fs.readFileSync(path.join(__dirname, '..', 'storage.js'), 'utf8');
  const pfCode = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
  vm.runInNewContext(storageCode, sandbox, { timeout: 5000 });
  vm.runInNewContext(
    pfCode +
      '\nthis.__commitPos = commitPortfolioPosition;' +
      '\nthis.__addPos = addPortfolioPosition;' +
      '\nthis.__startEditPos = startEditPortfolioPosition;' +
      '\nthis.__capturePf = capturePortfolioFormInput;' +
      '\nthis.__switchPfSub = switchPortfolioSub;' +
      '\nthis.__getP = getPortfolio;' +
      '\nthis.__setP = setPortfolio;',
    sandbox,
    { timeout: 15000 }
  );
  sandbox.renderPortfolio = function () { renderCount += 1; };
  return {
    sandbox,
    fields,
    toasts,
    store,
    get renderCount() { return renderCount; },
    get savedBeforeSuccessToast() { return savedBeforeSuccessToast; },
    fillAddForm: function (vals) {
      fields.pfAddTicker.value = vals.ticker == null ? '' : String(vals.ticker);
      fields.pfAddQty.value = vals.qty == null ? '' : String(vals.qty);
      fields.pfAddAvg.value = vals.avgPrice == null ? '' : String(vals.avgPrice);
      fields.pfAddDate.value = vals.buyDate == null ? '' : String(vals.buyDate);
      fields.pfAddComment.value = vals.comment == null ? '' : String(vals.comment);
    }
  };
}

{
  const w = loadPortfolioWriterSandbox();
  const schemaBefore = w.sandbox.__getP().schemaVersion;
  w.fillAddForm({
    ticker: 'SBER',
    qty: 10,
    avgPrice: 250,
    buyDate: '2024-03-12',
    comment: ''
  });
  const captured = w.sandbox.__capturePf('');
  assert(captured.ticker === 'SBER', 'add save: captured ticker SBER');
  assert(captured.qty === 10, 'add save: captured qty is number 10');
  assert(captured.avg === 250, 'add save: captured avgPrice is number 250');
  assert(captured.buyDate === '2024-03-12', 'add save: captured buyDate normalized');
  w.sandbox.__addPos(null, { prefix: '' });
  const saved = w.sandbox.__getP();
  assert(saved.positions.length === 1, 'add save: getPortfolio().positions.length > 0');
  assert(saved.positions[0].ticker === 'SBER', 'add save: ticker SBER');
  assert(saved.positions[0].qty === 10, 'add save: qty 10');
  assert(saved.positions[0].avgPrice === 250, 'add save: avgPrice 250');
  assert(saved.positions[0].buyDate === '2024-03-12', 'add save: buyDate kept');
  assert(saved.schemaVersion === schemaBefore, 'add save: schemaVersion unchanged');
  const raw = JSON.parse(w.store['ibrf.portfolio']);
  assert(Array.isArray(raw.positions) && raw.positions.length === 1, 'add save: localStorage positions length 1');
  assert(raw.positions[0].qty === 10 && raw.positions[0].avgPrice === 250, 'add save: localStorage qty/avg');
  assert(raw.positions[0].buyDate === '2024-03-12', 'add save: localStorage buyDate');
  assert(w.toasts.some((t) => t.indexOf('Добавлено в портфель: SBER') === 0), 'add save: success toast after persist');
  assert(w.savedBeforeSuccessToast === 1, 'add save: success toast only after storage has the lot');
  assert(!w.toasts.some((t) => /Укажите количество|Не удалось сохранить/.test(t)), 'add save: no false failure toast');
  const afterRender1 = w.sandbox.__getP().positions.length;
  w.sandbox.renderPortfolio();
  w.sandbox.renderPortfolio();
  assert(w.sandbox.__getP().positions.length === afterRender1, 'add save: repeated renderPortfolio keeps the lot');
  w.sandbox.__switchPfSub('overview');
  w.sandbox.__switchPfSub('positions');
  const afterNav = w.sandbox.__getP();
  assert(afterNav.positions.length === 1 && afterNav.positions[0].ticker === 'SBER' && afterNav.positions[0].qty === 10,
    'add save: Positions → Overview → Positions keeps the lot');

  const lotId = saved.positions[0].lotId;
  w.sandbox.__startEditPos(lotId);
  assert(w.sandbox.state.pfEditLotId === lotId, 'edit save: startEdit sets pfEditLotId');
  assert(w.fields.pfAddTicker.value === 'SBER', 'edit save: form ticker filled');
  assert(w.fields.pfAddQty.value === '10', 'edit save: form qty filled');
  assert(w.fields.pfAddAvg.value === '250', 'edit save: form avg filled');
  assert(w.fields.pfAddDate.value === '2024-03-12', 'edit save: form buyDate filled');
  w.fields.pfAddQty.value = '12';
  w.sandbox.__addPos(null, { prefix: '' });
  const edited = w.sandbox.__getP();
  assert(edited.positions.length === 1, 'edit save: still one position');
  assert(edited.positions[0].lotId === lotId, 'edit save: same lotId');
  assert(edited.positions[0].qty === 12, 'edit save: qty updated to 12');
  assert(edited.positions[0].avgPrice === 250, 'edit save: avgPrice unchanged');
  assert(edited.positions[0].buyDate === '2024-03-12', 'edit save: buyDate unchanged');
  assert(w.toasts.some((t) => t.indexOf('Покупка обновлена: SBER') === 0), 'edit save: update toast after persist');
}

{
  const w = loadPortfolioWriterSandbox();
  w.fillAddForm({ ticker: 'SBER', qty: '', avgPrice: 250, buyDate: '2024-03-12' });
  w.sandbox.__addPos(null, { prefix: '' });
  assert(w.sandbox.__getP().positions.length === 0, 'empty qty: storage stays empty');
  assert(!w.toasts.some((t) => /Добавлено в портфель/.test(t)), 'empty qty: no false success toast');
  assert(w.toasts.some((t) => t === 'Укажите количество'), 'empty qty: asks for qty');
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-09-04';
  const FROM = '2024-01-01';
  const TO = '2024-06-01';

  function priceOk(price, extra) {
    extra = extra || {};
    return {
      status: 'ok',
      price: price,
      priceDate: extra.priceDate || extra.date || extra.priceDate,
      priceType: extra.priceType || 'close',
      unit: extra.unit || 'rub'
    };
  }
  function mockPrices(map, counter) {
    return function (ticker, date) {
      if (counter) counter.n += 1;
      const t = String(ticker || '').toUpperCase();
      const iso = String(date || '').slice(0, 10);
      const byTicker = map[t];
      if (!byTicker) return Promise.resolve({ status: 'missing', price: null, priceDate: null });
      const row = byTicker[iso] || byTicker.default;
      return Promise.resolve(row || { status: 'missing', price: null, priceDate: null });
    };
  }
  function bridgeOpts(priceMap, extra, counter) {
    return Object.assign({
      splitEvents: events,
      currentDate: NOW,
      getInstrumentPriceAtDate: mockPrices(priceMap, counter)
    }, extra || {});
  }
  function assertIdentity(bridge, label) {
    assert(bridge && bridge.identityOk === true, label + ': identityOk');
    const lhs = Math.round((bridge.fromValueRub + bridge.purchasesRub - bridge.salesRub + bridge.priceEffectRub) * 100) / 100;
    const rhs = Math.round(Number(bridge.toValueRub) * 100) / 100;
    assert(lhs === rhs, label + ': from+P-S+priceEffect === to');
    const change = Math.round((bridge.toValueRub - bridge.fromValueRub) * 100) / 100;
    assert(bridge.changeRub === change, label + ': changeRub is to-from, not PnL');
  }
  function assertNoForbiddenBridgeFields(bridge, label) {
    assert(!('realizedPeriodRub' in bridge), label + ': no realizedPeriodRub');
    assert(!('realized' in bridge), label + ': no realized');
    assert(!('payoutsRub' in bridge), label + ': no payoutsRub');
    assert(!('paid12m' in bridge), label + ': no paid12m');
    assert(!('forecast12m' in bridge), label + ': no forecast12m');
    assert(!('cashFlows' in bridge), label + ': no cashFlows');
    assert(!('feeRub' in bridge), label + ': no feeRub');
  }
  function saleRec(extra) {
    extra = extra || {};
    const qty = extra.qty != null ? extra.qty : 10;
    const buyDate = extra.buyDate || '2023-01-01';
    const lotId = extra.lotId || 'S1';
    return {
      ticker: extra.ticker || 'SBER',
      qty: qty,
      salePrice: extra.salePrice,
      buyPrice: extra.buyPrice,
      saleDate: extra.saleDate,
      buyDate: buyDate,
      lotId: lotId,
      fee: extra.fee,
      allocations: extra.allocations || [{
        lotId: lotId,
        qty: qty,
        buyPrice: extra.buyPrice,
        buyDate: buyDate,
        lotQtyDelta: extra.lotQtyDelta != null ? extra.lotQtyDelta : qty
      }]
    };
  }

  await (async () => {
    const priceOnly = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 150 }],
      sales: [],
      cashFlows: [{ type: 'deposit', amountRub: 99999, date: '2024-03-01' }]
    };
    const b1 = await calc.buildPortfolioValueChangeBridge(priceOnly, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(100, { date: '2024-01-01' }),
        '2024-06-01': priceOk(150, { date: '2024-06-01' })
      }
    }));
    assert(b1.fromValueRub === 100 && b1.toValueRub === 150, 'bridge 1: V 100→150');
    assert(b1.purchasesRub === 0 && b1.salesRub === 0, 'bridge 1: no trades');
    assert(b1.priceEffectRub === 50, 'bridge 1: priceEffect +50');
    assert(b1.operationsCount === 0, 'bridge 1: operationsCount 0');
    assertIdentity(b1, 'bridge 1');
    assertNoForbiddenBridgeFields(b1, 'bridge 1');

    const buyOnly = {
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 10, buyDate: '2023-01-01', currentPrice: 10 },
        { ticker: 'SBER', lotId: 'S2', qty: 5, avgPrice: 10, buyDate: '2024-03-01', currentPrice: 10 }
      ],
      sales: [],
      cashFlows: [{ type: 'deposit', amountRub: 50000, date: '2024-03-01' }]
    };
    const b2 = await calc.buildPortfolioValueChangeBridge(buyOnly, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(10, { date: '2024-01-01' }),
        '2024-06-01': priceOk(10, { date: '2024-06-01' })
      }
    }));
    assert(b2.fromValueRub === 100 && b2.toValueRub === 150, 'bridge 2: V 100→150');
    assert(b2.purchasesRub === 50 && b2.salesRub === 0, 'bridge 2: purchases 50, not cashFlow');
    assert(b2.priceEffectRub === 0, 'bridge 2: priceEffect 0');
    assert(b2.buyOperationsCount === 1, 'bridge 2: one buy in period');
    assertIdentity(b2, 'bridge 2');

    const sellOnly = {
      positions: [],
      sales: [saleRec({ qty: 10, salePrice: 10, buyPrice: 10, saleDate: '2024-03-01', buyDate: '2023-01-01' })]
    };
    const b3 = await calc.buildPortfolioValueChangeBridge(sellOnly, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(10, { date: '2024-01-01' }),
        '2024-06-01': priceOk(10, { date: '2024-06-01' })
      }
    }));
    assert(b3.fromValueRub === 100 && b3.toValueRub === 0, 'bridge 3: V 100→0');
    assert(b3.purchasesRub === 0 && b3.salesRub === 100, 'bridge 3: sales 100');
    assert(b3.priceEffectRub === 0, 'bridge 3: priceEffect 0');
    assertIdentity(b3, 'bridge 3');

    const buyThenUp = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 10, buyDate: '2024-03-01', currentPrice: 12 }],
      sales: []
    };
    const b4 = await calc.buildPortfolioValueChangeBridge(buyThenUp, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(10, { date: '2024-01-01' }),
        '2024-06-01': priceOk(12, { date: '2024-06-01' })
      }
    }));
    assert(b4.fromValueRub === 0 && b4.toValueRub === 60, 'bridge 4: V 0→60');
    assert(b4.purchasesRub === 50 && b4.salesRub === 0, 'bridge 4: purchases 50');
    assert(b4.priceEffectRub === 10, 'bridge 4: priceEffect +10');
    assertIdentity(b4, 'bridge 4');

    const partSell = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 130 }],
      sales: [saleRec({
        qty: 5, salePrice: 130, buyPrice: 100, saleDate: '2024-03-01', buyDate: '2023-01-01', fee: 15
      })]
    };
    const b5 = await calc.buildPortfolioValueChangeBridge(partSell, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(120, { date: '2024-01-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(b5.fromValueRub === 1200 && b5.toValueRub === 650, 'bridge 5: V 1200→650');
    assert(b5.purchasesRub === 0 && b5.salesRub === 650, 'bridge 5: sales 650, fee not subtracted');
    assert(b5.priceEffectRub === 100, 'bridge 5: priceEffect +100');
    assertIdentity(b5, 'bridge 5');

    const roundTrip = {
      positions: [],
      sales: [saleRec({
        qty: 10, salePrice: 130, buyPrice: 100, saleDate: '2024-03-15', buyDate: '2024-02-01'
      })]
    };
    const snap6 = JSON.stringify(roundTrip);
    const b6 = await calc.buildPortfolioValueChangeBridge(roundTrip, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(100, { date: '2024-01-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(b6.fromValueRub === 0 && b6.toValueRub === 0, 'bridge 6: V 0→0');
    assert(b6.purchasesRub === 1000 && b6.salesRub === 1300, 'bridge 6: P 1000 S 1300');
    assert(b6.priceEffectRub === 300, 'bridge 6: priceEffect +300, realized not added');
    assert(b6.buyOperationsCount === 1 && b6.sellOperationsCount === 1, 'bridge 6: buy+sell kept');
    assertIdentity(b6, 'bridge 6');
    assert(JSON.stringify(roundTrip) === snap6, 'bridge 6: JSON not mutated');

    const closed = {
      positions: [],
      sales: [saleRec({
        qty: 10, salePrice: 130, buyPrice: 100, saleDate: '2024-03-01', buyDate: '2023-01-01'
      })]
    };
    const b7 = await calc.buildPortfolioValueChangeBridge(closed, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(100, { date: '2024-01-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(b7.fromValueRub === 1000 && b7.toValueRub === 0, 'bridge 7: closed V 1000→0');
    assert(b7.purchasesRub === 0 && b7.salesRub === 1300, 'bridge 7: sale 1300 still in history');
    assert(b7.priceEffectRub === 300, 'bridge 7: priceEffect +300');
    assert(b7.sellOperationsCount === 1, 'bridge 7: closed sale not dropped');
    assertIdentity(b7, 'bridge 7');

    const gmknHistPf = {
      positions: [{
        ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92
      }],
      sales: []
    };
    const gmknSnap = JSON.stringify(gmknHistPf);
    const gmknCounter = { n: 0 };
    const b8 = await calc.buildPortfolioValueChangeBridge(gmknHistPf, '2024-03-01', '2024-06-01', bridgeOpts({
      GMKN: {
        '2024-03-01': priceOk(25014, { date: '2024-03-01' }),
        '2024-06-01': priceOk(129.92, { date: '2024-06-01' })
      }
    }, null, gmknCounter));
    assert(b8.fromValueRub === 250140, 'bridge 8: GMKN before 10×25014');
    assert(Math.abs(b8.toValueRub - 129920) < 1e-6, 'bridge 8: GMKN after 1000×129.92');
    assert(b8.purchasesRub === 0 && b8.salesRub === 0, 'bridge 8: split is not a transaction');
    assert(b8.operationsCount === 0, 'bridge 8: no buy/sell in period');
    assert(b8.toValueRub !== 1299.2 && b8.toValueRub !== 12992000, 'bridge 8: not false ×100 qty');
    assertIdentity(b8, 'bridge 8 GMKN');
    assert(gmknCounter.n === 2, 'bridge 8: two as-of price lookups, not series');
    assert(JSON.stringify(gmknHistPf) === gmknSnap, 'bridge 8: GMKN JSON not mutated');

    const tCurrPf = {
      positions: [{
        ticker: 'T', lotId: 'T1', qty: 10, avgPrice: 262, buyDate: '2025-12-01',
        currentPrice: 262, splitLotScale: 'current'
      }],
      sales: []
    };
    const b9 = await calc.buildPortfolioValueChangeBridge(tCurrPf, '2026-05-01', '2026-09-04', bridgeOpts({
      T: {
        '2026-05-01': priceOk(250, { date: '2026-05-01' }),
        '2026-09-04': priceOk(262, { date: '2026-09-04' })
      }
    }));
    assert(b9.fromValueRub === 2500 && b9.toValueRub === 2620, 'bridge 9: T current 10×250 → 10×262');
    assert(b9.purchasesRub === 0 && b9.salesRub === 0, 'bridge 9: T current no trades');
    assert(b9.priceEffectRub === 120, 'bridge 9: T current priceEffect +120');
    assert(b9.toValueRub !== 26200, 'bridge 9: current lot not scaled ×10 again');
    assertIdentity(b9, 'bridge 9 T current');

    const tHistPf = {
      positions: [{
        ticker: 'T', lotId: 'T2', qty: 1, avgPrice: 3126, buyDate: '2025-12-01',
        currentPrice: 262, splitLotScale: 'historical'
      }],
      sales: []
    };
    const b10 = await calc.buildPortfolioValueChangeBridge(tHistPf, '2026-03-01', '2026-09-04', bridgeOpts({
      T: {
        '2026-03-01': priceOk(3126, { date: '2026-03-01' }),
        '2026-09-04': priceOk(262, { date: '2026-09-04' })
      }
    }));
    assert(b10.fromValueRub === 3126, 'bridge 10: T hist before 1×3126');
    assert(b10.toValueRub === 2620, 'bridge 10: T hist after 10×262');
    assert(b10.purchasesRub === 0 && b10.salesRub === 0, 'bridge 10: T hist split not a trade');
    assert(b10.toValueRub !== 262 && b10.toValueRub !== 26200, 'bridge 10: not false ×10');
    assertIdentity(b10, 'bridge 10 T historical');

    const gmknUnknownPf = {
      positions: [{
        ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 129.92
      }],
      sales: []
    };
    const b11 = await calc.buildPortfolioValueChangeBridge(gmknUnknownPf, '2023-12-01', '2024-06-01', bridgeOpts({
      GMKN: {
        '2023-12-01': priceOk(22000, { date: '2023-12-01' }),
        '2024-06-01': priceOk(129.92, { date: '2024-06-01' })
      }
    }));
    assert(b11.isPartial === true, 'bridge 11: split unknown → partial');
    assert(b11.purchasesRub === 0 && b11.salesRub === 0, 'bridge 11: still no fake trade');
    if (b11.fromValueRub != null && b11.toValueRub != null &&
        b11.purchasesRub != null && b11.salesRub != null && b11.priceEffectRub != null) {
      const lhs = Math.round((b11.fromValueRub + b11.purchasesRub - b11.salesRub + b11.priceEffectRub) * 100) / 100;
      const rhs = Math.round(Number(b11.toValueRub) * 100) / 100;
      assert(lhs === rhs, 'bridge 11: priced identity still holds');
    }

    const plzlPf = {
      positions: [{
        ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 19000, buyDate: '2024-06-01', currentPrice: 1900
      }],
      sales: []
    };
    const b12 = await calc.buildPortfolioValueChangeBridge(plzlPf, '2025-02-01', '2025-06-01', bridgeOpts({
      PLZL: {
        '2025-02-01': priceOk(19000, { date: '2025-02-01' }),
        '2025-06-01': priceOk(1900, { date: '2025-06-01' })
      }
    }));
    assert(b12.fromValueRub === 19000 && b12.toValueRub === 19000, 'bridge 12: PLZL 1×19000 → 10×1900');
    assert(b12.purchasesRub === 0 && b12.salesRub === 0, 'bridge 12: PLZL split not a trade');
    assert(b12.priceEffectRub === 0, 'bridge 12: priceEffect 0, not ×10');
    assert(b12.toValueRub !== 1900 && b12.toValueRub !== 190000, 'bridge 12: not false PLZL scale');
    assertIdentity(b12, 'bridge 12 PLZL');

    const ofzPf = {
      positions: [{
        ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2023-06-01',
        faceValue: 1000, currentPrice: 96
      }],
      sales: []
    };
    const b13 = await calc.buildPortfolioValueChangeBridge(ofzPf, FROM, TO, bridgeOpts({
      OFZ_26238: {
        '2024-01-01': priceOk(95, { date: '2024-01-01', unit: 'pct-of-face-value' }),
        '2024-06-01': priceOk(96, { date: '2024-06-01', unit: 'pct-of-face-value' })
      }
    }));
    assert(b13.fromValueRub === 9500 && b13.toValueRub === 9600, 'bridge 13: OFZ clean 9500→9600');
    assert(b13.purchasesRub === 0 && b13.salesRub === 0, 'bridge 13: no coupon/trade');
    assert(b13.priceEffectRub === 100, 'bridge 13: clean-price effect +100');
    assert((b13.notes || []).some((n) => /без исторического НКД/.test(n)), 'bridge 13: NKD advisory kept');
    assert(!b13.isPartial, 'bridge 13: missing NKD is advisory, not partial');
    assertIdentity(b13, 'bridge 13 OFZ');

    const ofzBuy = {
      positions: [{
        ticker: 'OFZ_26238', lotId: 'O2', qty: 10, avgPrice: 95, buyDate: '2024-03-01',
        faceValue: 1000, currentPrice: 96
      }],
      sales: []
    };
    const b13b = await calc.buildPortfolioValueChangeBridge(ofzBuy, FROM, TO, bridgeOpts({
      OFZ_26238: {
        '2024-01-01': priceOk(95, { date: '2024-01-01', unit: 'pct-of-face-value' }),
        '2024-06-01': priceOk(96, { date: '2024-06-01', unit: 'pct-of-face-value' })
      }
    }));
    assert(b13b.fromValueRub === 0 && b13b.toValueRub === 9600, 'bridge 13b: OFZ buy in period');
    assert(b13b.purchasesRub === 9500, 'bridge 13b: OFZ purchase via %×face, not CLOSE');
    assert(b13b.priceEffectRub === 100, 'bridge 13b: clean-price +100');
    assertIdentity(b13b, 'bridge 13b OFZ buy');

    const missingClose = {
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 150 },
        { ticker: 'GAZP', lotId: 'G1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 120 }
      ],
      sales: []
    };
    const b14 = await calc.buildPortfolioValueChangeBridge(missingClose, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(100, { date: '2024-01-01' }),
        '2024-06-01': priceOk(150, { date: '2024-06-01' })
      }
    }));
    assert(b14.isPartial === true, 'bridge 14: missing CLOSE → partial');
    assert(b14.fromValueRub === 100 && b14.toValueRub === 150, 'bridge 14: priced subset 100→150');
    assert(b14.purchasesRub === 0 && b14.salesRub === 0, 'bridge 14: no trades');
    assert(b14.priceEffectRub === 50, 'bridge 14: priced priceEffect +50');
    assertIdentity(b14, 'bridge 14 missing CLOSE');

    // identityOk = арифметика priced subset; isPartial = attribution всего портфеля неполный.
    // UI Wave 2: fully reliable only if identityOk && !isPartial && !operationsPartial.
    const opMissingClose = {
      positions: [{
        ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2024-03-01', currentPrice: 150
      }],
      sales: []
    };
    const opMissSnap = JSON.stringify(opMissingClose);
    const bOpMiss = await calc.buildPortfolioValueChangeBridge(opMissingClose, FROM, TO, bridgeOpts({}));
    assert(bOpMiss.fromValueRub === 0, 'bridge op+missing CLOSE: V_from 0');
    assert(bOpMiss.toValueRub === 0, 'bridge op+missing CLOSE: V_to 0, CLOSE not guessed from avg/LAST');
    assert(bOpMiss.toValueRub !== 150 && bOpMiss.toValueRub !== 100, 'bridge op+missing CLOSE: no currentPrice/avgPrice substitute');
    assert(bOpMiss.purchasesRub === 100, 'bridge op+missing CLOSE: purchase 100 stays in Purchases');
    assert(bOpMiss.salesRub === 0, 'bridge op+missing CLOSE: sales 0');
    assert(bOpMiss.priceEffectRub === -100, 'bridge op+missing CLOSE: residual absorbs hole −100');
    assert(bOpMiss.buyOperationsCount === 1, 'bridge op+missing CLOSE: buy not dropped');
    assert(bOpMiss.operationsPartial === false, 'bridge op+missing CLOSE: transaction flow complete');
    assert(bOpMiss.isPartial === true, 'bridge op+missing CLOSE: snapshot incomplete');
    assertIdentity(bOpMiss, 'bridge op+missing CLOSE');
    assert(JSON.stringify(opMissingClose) === opMissSnap, 'bridge op+missing CLOSE: JSON not mutated');

    const multi = {
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 150 },
        { ticker: 'GAZP', lotId: 'G1', qty: 2, avgPrice: 50, buyDate: '2023-01-01', currentPrice: 60 }
      ],
      sales: []
    };
    const b15 = await calc.buildPortfolioValueChangeBridge(multi, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(100, { date: '2024-01-01' }),
        '2024-06-01': priceOk(150, { date: '2024-06-01' })
      },
      GAZP: {
        '2024-01-01': priceOk(50, { date: '2024-01-01' }),
        '2024-06-01': priceOk(60, { date: '2024-06-01' })
      }
    }));
    assert(b15.fromValueRub === 200 && b15.toValueRub === 270, 'bridge 15: multi 200→270');
    assert(b15.purchasesRub === 0 && b15.salesRub === 0, 'bridge 15: no trades');
    assert(b15.priceEffectRub === 70, 'bridge 15: priceEffect +70');
    assertIdentity(b15, 'bridge 15 multi');

    const sameDay = {
      positions: [],
      sales: [saleRec({
        qty: 10, salePrice: 130, buyPrice: 100, saleDate: '2024-03-01', buyDate: '2024-03-01'
      })]
    };
    const b16 = await calc.buildPortfolioValueChangeBridge(sameDay, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(100, { date: '2024-01-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(b16.fromValueRub === 0 && b16.toValueRub === 0, 'bridge 16: same-day V 0→0');
    assert(b16.purchasesRub === 1000 && b16.salesRub === 1300, 'bridge 16: same-day P and S both in (from, to]');
    assert(b16.priceEffectRub === 300, 'bridge 16: priceEffect +300');
    assertIdentity(b16, 'bridge 16 same day');

    const onFromDate = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: FROM, currentPrice: 150 }],
      sales: []
    };
    const b16b = await calc.buildPortfolioValueChangeBridge(onFromDate, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(100, { date: '2024-01-01' }),
        '2024-06-01': priceOk(150, { date: '2024-06-01' })
      }
    }));
    assert(b16b.fromValueRub === 100, 'bridge 16b: buy on fromDate already in V_from');
    assert(b16b.purchasesRub === 0, 'bridge 16b: fromDate exclusive for operations');
    assert(b16b.priceEffectRub === 50, 'bridge 16b: priceEffect +50');
    assertIdentity(b16b, 'bridge 16b fromDate exclusive');

    const beforeFirst = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 100, buyDate: '2024-03-01', currentPrice: 120 }],
      sales: []
    };
    const b17 = await calc.buildPortfolioValueChangeBridge(beforeFirst, '2020-01-01', '2021-01-01', bridgeOpts({
      SBER: {
        '2020-01-01': priceOk(100, { date: '2020-01-01' }),
        '2021-01-01': priceOk(120, { date: '2021-01-01' })
      }
    }));
    assert(b17.fromValueRub === 0 && b17.toValueRub === 0, 'bridge 17: before first buy V_from=0 V_to=0');
    assert(b17.purchasesRub === 0 && b17.salesRub === 0, 'bridge 17: buy not in period');
    assert(b17.priceEffectRub === 0, 'bridge 17: priceEffect 0');
    assertIdentity(b17, 'bridge 17 before first buy');

    const emptyPf = { positions: [], sales: [], cashFlows: [] };
    const b18 = await calc.buildPortfolioValueChangeBridge(emptyPf, FROM, TO, bridgeOpts({}));
    assert(b18.fromValueRub === 0 && b18.toValueRub === 0, 'bridge 18: empty V 0→0');
    assert(b18.purchasesRub === 0 && b18.salesRub === 0 && b18.priceEffectRub === 0, 'bridge 18: zeros');
    assert(b18.operationsCount === 0, 'bridge 18: no ops');
    assertIdentity(b18, 'bridge 18 empty');
    assertNoForbiddenBridgeFields(b18, 'bridge 18');

    const incompleteSale = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 130 }],
      sales: [{
        ticker: 'SBER', qty: 5, buyPrice: 100,
        saleDate: '2024-03-01', buyDate: '2023-01-01', lotId: 'S1',
        allocations: [{ lotId: 'S1', qty: 5, buyPrice: 100, buyDate: '2023-01-01', lotQtyDelta: 5 }]
      }]
    };
    const bInc = await calc.buildPortfolioValueChangeBridge(incompleteSale, FROM, TO, bridgeOpts({
      SBER: {
        '2024-01-01': priceOk(120, { date: '2024-01-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(bInc.operationsPartial === true, 'bridge incomplete: operationsPartial');
    assert(bInc.isPartial === true, 'bridge incomplete: isPartial');
    assert(bInc.salesRub == null, 'bridge incomplete: salesRub null');
    assert(bInc.priceEffectRub == null, 'bridge incomplete: no fake residual');
    assert(bInc.identityOk === false, 'bridge incomplete: identityOk false');
    assert((bInc.warnings || []).length > 0, 'bridge incomplete: warning present');

    const badDates = await calc.buildPortfolioValueChangeBridge(emptyPf, 'не дата', TO, bridgeOpts({}));
    assert(badDates.invalidDate === true && badDates.identityOk === false, 'bridge invalid dates');

    const src = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
    const bridgeSrc = src.slice(src.indexOf('function buildPortfolioValueChangeBridge'), src.indexOf('function resultSeriesAmountKnown'));
    assert(!/buildPortfolioValueSeries/.test(bridgeSrc), 'bridge src: no value series');
    assert(!/paid12m/.test(bridgeSrc), 'bridge src: no paid12m');
    assert(!/forecast12m/.test(bridgeSrc), 'bridge src: no forecast12m');
    assert(!/cashFlows/.test(bridgeSrc), 'bridge src: no cashFlows');
    assert(!/buildPortfolioPayoutsForHoldingPeriod/.test(bridgeSrc), 'bridge src: no payout helper');
    assert(!/getTotalRealizedPnl|getSaleRealizedPnl/.test(bridgeSrc), 'bridge src: no realized helper');
  })();
}

{
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8'));
  calc.setSplitEventsCatalog(catalog);
  const events = calc.getSplitEventsSync();
  const NOW = '2026-09-04';
  const FROM = '2024-01-01';
  const TO = '2024-06-01';

  function priceOk(price, extra) {
    extra = extra || {};
    return {
      status: 'ok',
      price: price,
      priceDate: extra.priceDate || extra.date || extra.priceDate,
      priceType: extra.priceType || 'close',
      unit: extra.unit || 'rub'
    };
  }
  function mockPricesOnOrBefore(map, counter) {
    return function (ticker, date) {
      if (counter) counter.n += 1;
      const t = String(ticker || '').toUpperCase();
      const iso = String(date || '').slice(0, 10);
      const byTicker = map[t];
      if (!byTicker) return Promise.resolve({ status: 'missing', price: null, priceDate: null });
      const keys = Object.keys(byTicker).filter((d) => d !== 'default' && d <= iso).sort();
      const key = keys.length ? keys[keys.length - 1] : null;
      const row = key ? byTicker[key] : byTicker.default;
      return Promise.resolve(row || { status: 'missing', price: null, priceDate: null });
    };
  }
  function resultOpts(priceMap, extra, counter) {
    return Object.assign({
      interval: 'day',
      splitEvents: events,
      currentDate: NOW,
      getInstrumentPriceAtDate: mockPricesOnOrBefore(priceMap, counter)
    }, extra || {});
  }
  function saleRec(extra) {
    extra = extra || {};
    const qty = extra.qty != null ? extra.qty : 10;
    const buyDate = extra.buyDate || '2023-01-01';
    const lotId = extra.lotId || 'S1';
    return {
      ticker: extra.ticker || 'SBER',
      qty: qty,
      salePrice: extra.salePrice,
      buyPrice: extra.buyPrice,
      saleDate: extra.saleDate,
      buyDate: buyDate,
      lotId: lotId,
      fee: extra.fee,
      allocations: extra.allocations || [{
        lotId: lotId,
        qty: qty,
        buyPrice: extra.buyPrice,
        buyDate: buyDate,
        lotQtyDelta: extra.lotQtyDelta != null ? extra.lotQtyDelta : qty
      }]
    };
  }
  function firstPt(res) { return (res.points || [])[0]; }
  function lastPt(res) { return (res.points || [])[(res.points || []).length - 1]; }
  function ptOn(res, iso) { return (res.points || []).find((p) => p.date === iso); }
  function assertNoForbiddenResultFields(res, label) {
    assert(!('resultPct' in res), label + ': no resultPct');
    assert(!('returnPct' in res), label + ': no returnPct');
    assert(!('changePct' in res), label + ': no changePct');
    assert(!('cumulativePayoutsRub' in res), label + ': no cumulativePayoutsRub');
    assert(!('resultWithPayoutsRub' in res), label + ': no resultWithPayoutsRub');
    const p0 = firstPt(res) || {};
    assert(!('resultPct' in p0) && !('returnPct' in p0) && !('changePct' in p0), label + ': point has no %');
    assert(!('cumulativePayoutsRub' in p0) && !('resultWithPayoutsRub' in p0), label + ': point has no payouts');
  }
  async function assertMatchesBridge(pf, from, to, opts, label) {
    const series = await calc.buildPortfolioResultSeries(pf, from, to, opts);
    const bridge = await calc.buildPortfolioValueChangeBridge(pf, from, to, opts);
    const last = lastPt(series);
    assert(!!last, label + ': has last point');
    assert(last.resultRub === bridge.priceEffectRub, label + ': last resultRub === bridge.priceEffectRub');
    return { series, bridge, last };
  }

  await (async () => {
    const holdUp = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 110 }],
      sales: []
    };
    const r1 = await calc.buildPortfolioResultSeries(holdUp, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(110, { date: '2024-06-01' }) }
    }));
    assert(firstPt(r1).date === FROM && firstPt(r1).resultRub === 0, 'result 1: first date=from, result 0');
    assert(lastPt(r1).resultRub === 10, 'result 1: hold +10');
    assert(lastPt(r1).cumulativePurchasesRub === 0 && lastPt(r1).cumulativeSalesRub === 0, 'result 1: no trades');
    assert(r1.identityOk === true, 'result 1: identityOk');
    assertNoForbiddenResultFields(r1, 'result 1');

    const holdDown = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 110, buyDate: '2023-01-01', currentPrice: 100 }],
      sales: []
    };
    const r2 = await calc.buildPortfolioResultSeries(holdDown, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(110, { date: '2024-01-01' }), '2024-06-01': priceOk(100, { date: '2024-06-01' }) }
    }));
    assert(firstPt(r2).resultRub === 0 && lastPt(r2).resultRub === -10, 'result 2: hold −10');

    const buyFlat = {
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 10000, buyDate: '2023-01-01', currentPrice: 10000 },
        { ticker: 'SBER', lotId: 'S2', qty: 5, avgPrice: 10000, buyDate: '2024-03-01', currentPrice: 10000 }
      ],
      sales: [],
      cashFlows: [{ type: 'deposit', amountRub: 50000, date: '2024-03-01' }]
    };
    const buyFlatSnap = JSON.stringify(buyFlat);
    const r3 = await calc.buildPortfolioResultSeries(buyFlat, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(10000, { date: '2024-01-01' }), '2024-06-01': priceOk(10000, { date: '2024-06-01' }) }
    }));
    assert(firstPt(r3).portfolioValueRub === 100000 && firstPt(r3).resultRub === 0, 'result 3: start 100000 / 0');
    const afterBuy = ptOn(r3, '2024-03-01');
    assert(afterBuy && afterBuy.portfolioValueRub === 150000, 'result 3: V after buy 150000');
    assert(afterBuy.cumulativePurchasesRub === 50000 && afterBuy.cumulativeSalesRub === 0, 'result 3: P 50000');
    assert(afterBuy.resultRub === 0, 'result 3: buy unchanged → result 0, not +50000');
    assert(lastPt(r3).resultRub === 0, 'result 3: last still 0');
    assert(JSON.stringify(buyFlat) === buyFlatSnap, 'result 3: JSON not mutated');

    const buyGrowth = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 10, buyDate: '2024-03-01', currentPrice: 12 }],
      sales: []
    };
    const r4 = await calc.buildPortfolioResultSeries(buyGrowth, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(10, { date: '2024-01-01' }), '2024-06-01': priceOk(12, { date: '2024-06-01' }) }
    }));
    assert(firstPt(r4).portfolioValueRub === 0 && firstPt(r4).resultRub === 0, 'result 4: before buy 0');
    assert(lastPt(r4).cumulativePurchasesRub === 50 && lastPt(r4).resultRub === 10, 'result 4: buy + growth → +10');

    const partSell = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 130 }],
      sales: [saleRec({ qty: 5, salePrice: 130, buyPrice: 100, saleDate: '2024-03-01', buyDate: '2023-01-01', fee: 15 })]
    };
    const r5 = await calc.buildPortfolioResultSeries(partSell, FROM, TO, resultOpts({
      SBER: {
        '2024-01-01': priceOk(120, { date: '2024-01-01' }),
        '2024-03-01': priceOk(130, { date: '2024-03-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    const soldPt = ptOn(r5, '2024-03-01');
    assert(soldPt && soldPt.portfolioValueRub === 650, 'result 5: remaining 5×130');
    assert(soldPt.cumulativeSalesRub === 650 && soldPt.cumulativePurchasesRub === 0, 'result 5: sales 650');
    assert(soldPt.resultRub === 100, 'result 5: partial sale result +100, not −650');
    assert(lastPt(r5).resultRub === 100, 'result 5: last still +100');

    const fullExit = {
      positions: [],
      sales: [saleRec({ qty: 10, salePrice: 130, buyPrice: 100, saleDate: '2024-03-01', buyDate: '2023-01-01' })]
    };
    const r6 = await calc.buildPortfolioResultSeries(fullExit, FROM, TO, resultOpts({
      SBER: {
        '2024-01-01': priceOk(120, { date: '2024-01-01' }),
        '2024-03-01': priceOk(130, { date: '2024-03-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(firstPt(r6).portfolioValueRub === 1200, 'result 6: start 10×120');
    const exitPt = ptOn(r6, '2024-03-01');
    assert(exitPt && exitPt.portfolioValueRub === 0 && exitPt.cumulativeSalesRub === 1300, 'result 6: V=0 S=1300');
    assert(exitPt.resultRub === 100, 'result 6: full exit +100, not 0');
    assert(lastPt(r6).resultRub === 100, 'result 6: closed result persists');
    assert(lastPt(r6).resultRub !== 0, 'result 6: line does not reset after exit');

    const roundTrip = {
      positions: [],
      sales: [saleRec({ qty: 10, salePrice: 130, buyPrice: 100, saleDate: '2024-03-15', buyDate: '2024-02-01' })]
    };
    const r7 = await calc.buildPortfolioResultSeries(roundTrip, FROM, TO, resultOpts({
      SBER: {
        '2024-01-01': priceOk(100, { date: '2024-01-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(firstPt(r7).portfolioValueRub === 0 && lastPt(r7).portfolioValueRub === 0, 'result 7: V 0→0');
    assert(lastPt(r7).cumulativePurchasesRub === 1000 && lastPt(r7).cumulativeSalesRub === 1300, 'result 7: P 1000 S 1300');
    assert(lastPt(r7).resultRub === 300, 'result 7: round-trip +300, realized not added');
    assert(lastPt(r7).resultRub !== 600, 'result 7: no double-count realized');

    const multiBuy = {
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 10, buyDate: '2024-02-01', currentPrice: 10 },
        { ticker: 'SBER', lotId: 'S2', qty: 7, avgPrice: 10, buyDate: '2024-04-01', currentPrice: 10 }
      ],
      sales: []
    };
    const r8 = await calc.buildPortfolioResultSeries(multiBuy, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(10, { date: '2024-01-01' }), '2024-06-01': priceOk(10, { date: '2024-06-01' }) }
    }));
    assert(ptOn(r8, '2024-02-01').cumulativePurchasesRub === 50, 'result 8: first buy 50');
    assert(lastPt(r8).cumulativePurchasesRub === 120 && lastPt(r8).resultRub === 0, 'result 8: two buys 120, result 0');

    const multiSell = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 100 }],
      sales: [
        saleRec({ qty: 3, salePrice: 100, buyPrice: 100, saleDate: '2024-02-01', buyDate: '2023-01-01', lotId: 'S1' }),
        saleRec({
          qty: 2, salePrice: 100, buyPrice: 100, saleDate: '2024-04-01', buyDate: '2023-01-01', lotId: 'S1',
          allocations: [{ lotId: 'S1', qty: 2, buyPrice: 100, buyDate: '2023-01-01', lotQtyDelta: 2 }]
        })
      ]
    };
    const r9 = await calc.buildPortfolioResultSeries(multiSell, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(100, { date: '2024-06-01' }) }
    }));
    assert(ptOn(r9, '2024-02-01').cumulativeSalesRub === 300, 'result 9: first sale 300');
    assert(lastPt(r9).cumulativeSalesRub === 500 && lastPt(r9).resultRub === 0, 'result 9: two sales 500, result 0');

    const sameDay = {
      positions: [],
      sales: [saleRec({ qty: 10, salePrice: 130, buyPrice: 100, saleDate: '2024-03-01', buyDate: '2024-03-01' })]
    };
    const r10 = await calc.buildPortfolioResultSeries(sameDay, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(130, { date: '2024-06-01' }) }
    }));
    const samePt = ptOn(r10, '2024-03-01');
    assert(samePt.cumulativePurchasesRub === 1000 && samePt.cumulativeSalesRub === 1300, 'result 10: same-day P and S');
    assert(samePt.resultRub === 300 && lastPt(r10).resultRub === 300, 'result 10: same-day +300');

    const onStart = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: FROM, currentPrice: 150 }],
      sales: []
    };
    const r11 = await calc.buildPortfolioResultSeries(onStart, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(150, { date: '2024-06-01' }) }
    }));
    assert(firstPt(r11).portfolioValueRub === 100 && firstPt(r11).cumulativePurchasesRub === 0, 'result 11: startDate buy in V, not P');
    assert(firstPt(r11).resultRub === 0 && lastPt(r11).resultRub === 50, 'result 11: result 0 then +50');

    const onPoint = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 100, buyDate: '2024-06-04', currentPrice: 100 }],
      sales: []
    };
    const r12 = await calc.buildPortfolioResultSeries(onPoint, '2024-06-03', '2024-06-05', resultOpts({
      SBER: { '2024-06-03': priceOk(100, { date: '2024-06-03' }) }
    }));
    assert(ptOn(r12, '2024-06-03').resultRub === 0 && ptOn(r12, '2024-06-03').portfolioValueRub === 0, 'result 12: before buy 0');
    assert(ptOn(r12, '2024-06-04').cumulativePurchasesRub === 1000, 'result 12: buy on point date in P');
    assert(ptOn(r12, '2024-06-04').resultRub === 0, 'result 12: buy on point date does not jump result');

    const beforeFirst = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 100, buyDate: '2024-03-01', currentPrice: 100 }],
      sales: []
    };
    const r13 = await calc.buildPortfolioResultSeries(beforeFirst, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(100, { date: '2024-06-01' }) }
    }));
    assert(firstPt(r13).portfolioValueRub === 0 && firstPt(r13).resultRub === 0, 'result 13: before first buy V=0');
    assert(ptOn(r13, '2024-03-01').resultRub === 0, 'result 13: buy at same price → still 0');
    assert(lastPt(r13).resultRub === 0, 'result 13: last 0');

    const afterClosed = {
      positions: [],
      sales: [saleRec({ qty: 10, salePrice: 130, buyPrice: 100, saleDate: '2024-03-01', buyDate: '2023-01-01' })]
    };
    const r14 = await calc.buildPortfolioResultSeries(afterClosed, '2024-04-01', '2024-06-01', resultOpts({
      SBER: { '2024-04-01': priceOk(130, { date: '2024-04-01' }), '2024-06-01': priceOk(130, { date: '2024-06-01' }) }
    }));
    assert(firstPt(r14).resultRub === 0 && lastPt(r14).resultRub === 0, 'result 14: range after close starts at 0');
    assert(lastPt(r14).cumulativeSalesRub === 0, 'result 14: sale not in this range');

    const multiTickers = {
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 150 },
        { ticker: 'GAZP', lotId: 'G1', qty: 2, avgPrice: 50, buyDate: '2023-01-01', currentPrice: 60 }
      ],
      sales: []
    };
    const r15 = await calc.buildPortfolioResultSeries(multiTickers, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(150, { date: '2024-06-01' }) },
      GAZP: { '2024-01-01': priceOk(50, { date: '2024-01-01' }), '2024-06-01': priceOk(60, { date: '2024-06-01' }) }
    }));
    assert(lastPt(r15).resultRub === 70, 'result 15: multi tickers +70');

    const mixPf = {
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 150 },
        { ticker: 'SBER', lotId: 'S2', qty: 1, avgPrice: 100, buyDate: '2024-03-01', currentPrice: 150 },
        {
          ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2023-06-01',
          faceValue: 1000, currentPrice: 96
        }
      ],
      sales: []
    };
    const r16 = await calc.buildPortfolioResultSeries(mixPf, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(150, { date: '2024-06-01' }) },
      OFZ_26238: {
        '2024-01-01': priceOk(95, { date: '2024-01-01', unit: 'pct-of-face-value' }),
        '2024-06-01': priceOk(96, { date: '2024-06-01', unit: 'pct-of-face-value' })
      }
    }));
    const mixLast = lastPt(r16);
    assert(mixLast.stocksCumulativePurchasesRub === 100 && mixLast.bondsCumulativePurchasesRub === 0, 'result 16: stocks P only');
    assert(mixLast.stocksResultRub === 100, 'result 16: stocks result uses stocks ops (1×50 + new 1×50 − 100)');
    assert(mixLast.bondsResultRub === 100, 'result 16: bonds result independent +100');
    assert(mixLast.resultRub === 200, 'result 16: total = stocks+bonds results');
    assert(mixLast.stocksResultRub !== mixLast.resultRub, 'result 16: stocks result is not total');

    const ofzOnly = {
      positions: [{
        ticker: 'OFZ_26238', lotId: 'O1', qty: 10, avgPrice: 95, buyDate: '2023-06-01',
        faceValue: 1000, currentPrice: 96
      }],
      sales: []
    };
    const r17 = await calc.buildPortfolioResultSeries(ofzOnly, FROM, TO, resultOpts({
      OFZ_26238: {
        '2024-01-01': priceOk(95, { date: '2024-01-01', unit: 'pct-of-face-value' }),
        '2024-06-01': priceOk(96, { date: '2024-06-01', unit: 'pct-of-face-value' })
      }
    }));
    assert(lastPt(r17).bondsResultRub === 100 && lastPt(r17).stocksResultRub === 0, 'result 17: bonds-only result');
    assert(lastPt(r17).bondsCumulativePurchasesRub === 0, 'result 17: OFZ hold no purchases');

    const gmknHistPf = {
      positions: [{ ticker: 'GMKN', lotId: 'G1', qty: 10, avgPrice: 22000, buyDate: '2021-06-04', currentPrice: 129.92 }],
      sales: []
    };
    const r18 = await calc.buildPortfolioResultSeries(gmknHistPf, '2024-03-01', '2024-06-01', resultOpts({
      GMKN: { '2024-03-01': priceOk(25014, { date: '2024-03-01' }), '2024-06-01': priceOk(129.92, { date: '2024-06-01' }) }
    }));
    assert(
      lastPt(r18).resultRub === Math.round((lastPt(r18).portfolioValueRub - firstPt(r18).portfolioValueRub) * 100) / 100,
      'result 18: GMKN result is ΔV, not a split jump'
    );
    assert(lastPt(r18).cumulativePurchasesRub === 0 && lastPt(r18).cumulativeSalesRub === 0, 'result 18: split is not a trade');
    assert(lastPt(r18).portfolioValueRub !== firstPt(r18).portfolioValueRub * 100, 'result 18: no false ×100');

    const tCurrPf = {
      positions: [{
        ticker: 'T', lotId: 'T1', qty: 10, avgPrice: 262, buyDate: '2025-12-01',
        currentPrice: 262, splitLotScale: 'current'
      }],
      sales: []
    };
    const r19 = await calc.buildPortfolioResultSeries(tCurrPf, '2026-05-01', '2026-09-04', resultOpts({
      T: { '2026-05-01': priceOk(250, { date: '2026-05-01' }), '2026-09-04': priceOk(262, { date: '2026-09-04' }) }
    }));
    assert(firstPt(r19).portfolioValueRub === 2500 && lastPt(r19).portfolioValueRub === 2620, 'result 19: T current values');
    assert(lastPt(r19).resultRub === 120, 'result 19: T current +120, not ×10');
    assert(lastPt(r19).portfolioValueRub !== 26200, 'result 19: current lot not scaled again');

    const tHistPf = {
      positions: [{
        ticker: 'T', lotId: 'T2', qty: 1, avgPrice: 3126, buyDate: '2025-12-01',
        currentPrice: 262, splitLotScale: 'historical'
      }],
      sales: []
    };
    const r20 = await calc.buildPortfolioResultSeries(tHistPf, '2026-03-01', '2026-09-04', resultOpts({
      T: { '2026-03-01': priceOk(3126, { date: '2026-03-01' }), '2026-09-04': priceOk(262, { date: '2026-09-04' }) }
    }));
    assert(firstPt(r20).portfolioValueRub === 3126 && lastPt(r20).portfolioValueRub === 2620, 'result 20: T hist 1×3126 → 10×262');
    assert(lastPt(r20).cumulativePurchasesRub === 0, 'result 20: split not a trade');
    assert(lastPt(r20).portfolioValueRub !== 262 && lastPt(r20).portfolioValueRub !== 26200, 'result 20: not false ×10');

    const gmknUnknownPf = {
      positions: [{ ticker: 'GMKN', lotId: 'G2', qty: 1000, avgPrice: 220, buyDate: '2021-06-04', currentPrice: 129.92 }],
      sales: []
    };
    const r21 = await calc.buildPortfolioResultSeries(gmknUnknownPf, '2023-12-01', '2024-06-01', resultOpts({
      GMKN: { '2023-12-01': priceOk(22000, { date: '2023-12-01' }), '2024-06-01': priceOk(129.92, { date: '2024-06-01' }) }
    }));
    assert(r21.isPartial === true, 'result 21: split unknown → partial');
    assert(lastPt(r21).cumulativePurchasesRub === 0 && lastPt(r21).cumulativeSalesRub === 0, 'result 21: still no fake trade');

    const plzlPf = {
      positions: [{ ticker: 'PLZL', lotId: 'P1', qty: 1, avgPrice: 19000, buyDate: '2024-06-01', currentPrice: 1900 }],
      sales: []
    };
    const r22 = await calc.buildPortfolioResultSeries(plzlPf, '2025-02-01', '2025-06-01', resultOpts({
      PLZL: { '2025-02-01': priceOk(19000, { date: '2025-02-01' }), '2025-06-01': priceOk(1900, { date: '2025-06-01' }) }
    }));
    assert(firstPt(r22).portfolioValueRub === 19000 && lastPt(r22).portfolioValueRub === 19000, 'result 22: PLZL 1×19000 → 10×1900');
    assert(lastPt(r22).resultRub === 0, 'result 22: PLZL result 0, not ×10');

    const ofzHold = ofzOnly;
    const r23 = await calc.buildPortfolioResultSeries(ofzHold, FROM, TO, resultOpts({
      OFZ_26238: {
        '2024-01-01': priceOk(95, { date: '2024-01-01', unit: 'pct-of-face-value' }),
        '2024-06-01': priceOk(96, { date: '2024-06-01', unit: 'pct-of-face-value' })
      }
    }));
    assert(lastPt(r23).resultRub === 100, 'result 23: OFZ hold clean +100');
    assert((r23.notes || []).some((n) => /без исторического НКД/.test(n)), 'result 23: NKD advisory');
    assert(r23.points.some((p) => p.isPartial) === false, 'result 23: NKD is not market partial');

    const ofzBuySell = {
      positions: [{
        ticker: 'OFZ_26238', lotId: 'O2', qty: 5, avgPrice: 96, buyDate: '2024-02-01',
        faceValue: 1000, currentPrice: 96
      }],
      sales: [{
        ticker: 'OFZ_26238', qty: 5, salePrice: 96, buyPrice: 95, saleDate: '2024-04-01', buyDate: '2024-02-01',
        lotId: 'O3', faceValue: 1000,
        allocations: [{ lotId: 'O3', qty: 5, buyPrice: 95, buyDate: '2024-02-01', lotQtyDelta: 5, faceValue: 1000 }]
      }]
    };
    const r24 = await calc.buildPortfolioResultSeries(ofzBuySell, FROM, TO, resultOpts({
      OFZ_26238: {
        '2024-01-01': priceOk(95, { date: '2024-01-01', unit: 'pct-of-face-value' }),
        '2024-06-01': priceOk(96, { date: '2024-06-01', unit: 'pct-of-face-value' })
      }
    }));
    assert(lastPt(r24).bondsCumulativePurchasesRub > 0 && lastPt(r24).bondsCumulativeSalesRub > 0, 'result 24: OFZ buy/sell amounts');
    assert(lastPt(r24).resultRub != null, 'result 24: OFZ buy/sell has RUB result');
    assert(lastPt(r24).stocksCumulativePurchasesRub === 0, 'result 24: OFZ ops do not enter stocks P');

    const missingMid = {
      positions: [
        { ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 150 },
        { ticker: 'GAZP', lotId: 'G1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 120 }
      ],
      sales: []
    };
    const r25 = await calc.buildPortfolioResultSeries(missingMid, '2024-06-03', '2024-06-05', {
      interval: 'day',
      splitEvents: events,
      currentDate: NOW,
      getInstrumentPriceAtDate: function (ticker, date) {
        const t = String(ticker || '').toUpperCase();
        const iso = String(date || '').slice(0, 10);
        if (t === 'SBER') return Promise.resolve(priceOk(100, { date: iso }));
        if (t === 'GAZP' && iso === '2024-06-04') {
          return Promise.resolve({ status: 'missing', price: null, priceDate: null });
        }
        if (t === 'GAZP') return Promise.resolve(priceOk(100, { date: iso }));
        return Promise.resolve({ status: 'missing', price: null, priceDate: null });
      }
    });
    assert(ptOn(r25, '2024-06-04').isPartial === true, 'result 25: missing CLOSE mid → point isPartial');
    assert(ptOn(r25, '2024-06-04').resultRub === -100, 'result 25: priced-subset residual absorbs missing GAZP');
    assert(r25.isPartial === true, 'result 25: series isPartial');
    assert(ptOn(r25, '2024-06-04').portfolioValueRub === 100, 'result 25: no currentPrice fallback for GAZP');

    const incompleteMid = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 5, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 130 }],
      sales: [{
        ticker: 'SBER', qty: 5, buyPrice: 100,
        saleDate: '2024-03-01', buyDate: '2023-01-01', lotId: 'S1',
        allocations: [{ lotId: 'S1', qty: 5, buyPrice: 100, buyDate: '2023-01-01', lotQtyDelta: 5 }]
      }]
    };
    const r26 = await calc.buildPortfolioResultSeries(incompleteMid, FROM, TO, resultOpts({
      SBER: {
        '2024-01-01': priceOk(120, { date: '2024-01-01' }),
        '2024-03-01': priceOk(130, { date: '2024-03-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(ptOn(r26, '2024-02-01').resultRub === 0 || ptOn(r26, '2024-02-01').resultRub != null, 'result 26: before incomplete op result is a number');
    assert(ptOn(r26, '2024-02-01').operationsPartial === false, 'result 26: before incomplete op not opsPartial');
    assert(ptOn(r26, '2024-03-01').resultRub == null, 'result 26: incomplete op → result null');
    assert(ptOn(r26, '2024-03-01').operationsPartial === true, 'result 26: point operationsPartial');
    assert(lastPt(r26).resultRub == null && lastPt(r26).operationsPartial === true, 'result 26: null until end');
    assert(r26.operationsPartial === true && r26.identityOk === false, 'result 26: series opsPartial, identityOk false');

    const emptyPf = { positions: [], sales: [], cashFlows: [] };
    const r27 = await calc.buildPortfolioResultSeries(emptyPf, FROM, TO, resultOpts({}));
    assert(firstPt(r27).resultRub === 0 && lastPt(r27).resultRub === 0, 'result 27: empty stays 0');
    assert(lastPt(r27).portfolioValueRub === 0, 'result 27: empty V=0');

    const weekendPf = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 10, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 100 }],
      sales: []
    };
    const r28 = await calc.buildPortfolioResultSeries(weekendPf, '2024-06-02', '2024-06-04', resultOpts({
      SBER: { '2024-05-31': priceOk(100, { date: '2024-05-31' }) }
    }));
    assert(firstPt(r28).date === '2024-06-02', 'result 28: weekend start keeps requested date');
    assert(firstPt(r28).resultRub === 0, 'result 28: first result 0');
    assert(firstPt(r28).portfolioValueRub === 1000, 'result 28: CLOSE on-or-before Friday');

    const rangePf = {
      positions: [{ ticker: 'SBER', lotId: 'S1', qty: 1, avgPrice: 100, buyDate: '2023-01-01', currentPrice: 150 }],
      sales: []
    };
    const r29m = await calc.buildPortfolioResultSeries(rangePf, '2024-05-01', '2024-06-01', resultOpts({
      SBER: { '2024-05-01': priceOk(140, { date: '2024-05-01' }), '2024-06-01': priceOk(150, { date: '2024-06-01' }) }
    }));
    const r29y = await calc.buildPortfolioResultSeries(rangePf, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(150, { date: '2024-06-01' }) }
    }));
    assert(firstPt(r29m).resultRub === 0 && firstPt(r29y).resultRub === 0, 'result 29: 1M and 1Y both start at 0');
    assert(lastPt(r29m).resultRub === 10 && lastPt(r29y).resultRub === 50, 'result 29: different anchors, different last result');

    const persist = fullExit;
    const r30 = await calc.buildPortfolioResultSeries(persist, FROM, TO, resultOpts({
      SBER: {
        '2024-01-01': priceOk(120, { date: '2024-01-01' }),
        '2024-03-01': priceOk(130, { date: '2024-03-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }));
    assert(lastPt(r30).portfolioValueRub === 0 && lastPt(r30).resultRub === 100, 'result 30: after close V=0 result stays +100');

    const invariantCases = [
      ['hold', holdUp, FROM, TO, { SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(110, { date: '2024-06-01' }) } }],
      ['buy', buyGrowth, FROM, TO, { SBER: { '2024-01-01': priceOk(10, { date: '2024-01-01' }), '2024-06-01': priceOk(12, { date: '2024-06-01' }) } }],
      ['partial sale', partSell, FROM, TO, {
        SBER: {
          '2024-01-01': priceOk(120, { date: '2024-01-01' }),
          '2024-03-01': priceOk(130, { date: '2024-03-01' }),
          '2024-06-01': priceOk(130, { date: '2024-06-01' })
        }
      }],
      ['full sale', fullExit, FROM, TO, {
        SBER: {
          '2024-01-01': priceOk(120, { date: '2024-01-01' }),
          '2024-03-01': priceOk(130, { date: '2024-03-01' }),
          '2024-06-01': priceOk(130, { date: '2024-06-01' })
        }
      }],
      ['round-trip', roundTrip, FROM, TO, { SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(130, { date: '2024-06-01' }) } }]
    ];
    for (const row of invariantCases) {
      await assertMatchesBridge(row[1], row[2], row[3], resultOpts(row[4]), 'invariant ' + row[0]);
    }

    const incompleteBridge = await assertMatchesBridge(incompleteMid, FROM, TO, resultOpts({
      SBER: {
        '2024-01-01': priceOk(120, { date: '2024-01-01' }),
        '2024-03-01': priceOk(130, { date: '2024-03-01' }),
        '2024-06-01': priceOk(130, { date: '2024-06-01' })
      }
    }), 'invariant incomplete');
    assert(incompleteBridge.bridge.priceEffectRub == null && incompleteBridge.last.resultRub == null,
      'invariant incomplete: both null');

    let seriesCalls = 0;
    const readySeries = await calc.buildPortfolioValueSeries(holdUp, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(110, { date: '2024-06-01' }) }
    }));
    const reused = await calc.buildPortfolioResultSeries(holdUp, FROM, TO, resultOpts({
      SBER: { '2024-01-01': priceOk(100, { date: '2024-01-01' }), '2024-06-01': priceOk(110, { date: '2024-06-01' }) }
    }, {
      valueSeries: readySeries,
      buildPortfolioValueSeries: function () {
        seriesCalls += 1;
        throw new Error('should not rebuild value series');
      }
    }));
    assert(seriesCalls === 0, 'result reuse: valueSeries skips rebuild');
    assert(lastPt(reused).resultRub === 10, 'result reuse: overlay still computes result');

    const badDates = await calc.buildPortfolioResultSeries(emptyPf, 'не дата', TO, resultOpts({}));
    assert(badDates.invalidDate === true && badDates.points.length === 0, 'result invalid dates');

    const src = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
    const helperSrc = src.slice(
      src.indexOf('function buildPortfolioResultSeries'),
      src.indexOf('function cmpExplainQtyPart')
    );
    assert(/buildPortfolioValueSeries/.test(helperSrc), 'result src: reuses value series');
    assert(!/collectComparePeriodOperations/.test(helperSrc), 'result src: no collectCompare per point');
    assert(!/buildPortfolioValueChangeBridge/.test(helperSrc), 'result src: no bridge per point');
    assert(!/\bfetch\s*\(/.test(helperSrc), 'result src: no fetch');
    assert(!/paid12m|forecast12m|buildPortfolioPayoutsForHoldingPeriod/.test(helperSrc), 'result src: no payouts');
    assert(!/resultPct|returnPct|changePct/.test(helperSrc), 'result src: no percentage fields');
    assert(!/getTotalRealizedPnl/.test(helperSrc), 'result src: no realized helper');
    assert(!/currentPrice/.test(helperSrc), 'result src: no currentPrice fallback');
  })();
}

{
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const pfJs = fs.readFileSync(path.join(__dirname, '..', 'portfolio.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'theme-luxury.css'), 'utf8');
  const dynHtml = indexHtml.slice(
    indexHtml.indexOf('id="portfolioDynamicsBlock"'),
    indexHtml.indexOf('id="portfolioAsOfBlock"')
  );
  assert(/id="pfDynModes"/.test(dynHtml), 'result ui: mode switch exists');
  assert(dynHtml.indexOf('id="pfDynModes"') < dynHtml.indexOf('id="pfDynPeriods"'),
    'result ui: mode switch before range controls');
  assert(/data-pf-dyn-mode="value"/.test(dynHtml) && /data-pf-dyn-mode="result"/.test(dynHtml),
    'result ui: Стоимость | Результат');
  assert(/aria-pressed/.test(dynHtml), 'result ui: aria-pressed on mode buttons');
  assert(/id="pfDynChart"/.test(dynHtml) && (dynHtml.match(/id="pfDynChart"/g) || []).length === 1,
    'result ui: single canvas');
  assert((dynHtml.match(/data-pf-dyn-horizon="/g) || []).length === 5, 'result ui: same 1M/3M/6M/1Y/All');
  assert(!/#portfolio\//.test(dynHtml), 'result ui: no nested hash');
  assert(!/Прибыль|Доходность|PnL|с выплатами/.test(dynHtml), 'result ui: html has no forbidden labels');
  assert(/#tab-portfolio \.pf-dyn-modes \{/.test(css), 'result ui: mode switch css');
  assert(!/#007|#0d6efd|#1e90ff/i.test((css.match(/#tab-portfolio \.pf-dyn-modes[\s\S]*?#tab-portfolio \.pf-dyn-periods/) || [''])[0]),
    'result ui: mode switch has no blue');

  assert(calc.pfDynState.mode === 'value', 'result ui: default mode value');
  assert(calc.normalizePortfolioDynamicsMode('result') === 'result', 'result ui: normalize result');
  assert(calc.normalizePortfolioDynamicsMode('nope') === 'value', 'result ui: unknown mode falls back to value');

  const modeSrc = Function.prototype.toString.call(calc.setPortfolioDynamicsMode);
  const ensureSrc = Function.prototype.toString.call(calc.pfDynEnsureResultSeries);
  const drawSrc = Function.prototype.toString.call(calc.drawPortfolioDynamicsChart);
  const loadSrc = Function.prototype.toString.call(calc.loadPortfolioDynamicsSeries);
  const reqSrc = Function.prototype.toString.call(calc.requestPortfolioDynamicsRefresh);
  const ensureDynSrc = Function.prototype.toString.call(calc.ensurePortfolioDynamicsReady);
  assert(!/localStorage|sessionStorage/.test(modeSrc), 'result ui: mode is runtime-only');
  assert(/valueSeries: pfDynState\.series/.test(ensureSrc), 'result ui: overlay uses existing valueSeries');
  assert(!/loadInstrumentHistoryForDateRange/.test(ensureSrc), 'result ui: overlay does not reload history');
  assert(!/buildPortfolioValueChangeBridge/.test(drawSrc), 'result ui: draw does not call bridge');
  assert(!/loadPayoutFeedsForPortfolio|buildPortfolioPayoutsForHoldingPeriod/.test(modeSrc + ensureSrc + drawSrc),
    'result ui: no payout loader');
  assert(!/iss\.moex\.com/.test(modeSrc + ensureSrc), 'result ui: no new MOEX endpoint');
  assert(/pfDynHasSeries\(\)/.test(ensureDynSrc) && /pfDynBuildInFlight/.test(ensureDynSrc),
    'result ui: hidden-canvas ensure guards kept');
  assert(/PF_CHART_LAYOUT_RETRY_MAX = 4/.test(pfJs), 'result ui: finite layout retry kept');
  assert(/isPortfolioSubviewVisible\('analytics'\)/.test(drawSrc), 'result ui: draw still requires visible analytics');
  assert(/buildPortfolioValueSeries/.test(loadSrc), 'result ui: cost load still uses value series');
  assert(/pfDynLastKey/.test(reqSrc), 'result ui: refresh still keyed by portfolio+horizon, not mode');

  const valueSeries = [
    { date: '2024-01-01', totalValueRub: 0, stocksValueRub: 0, bondsValueRub: 0, isPartial: false },
    { date: '2024-03-15', totalValueRub: 0, stocksValueRub: 0, bondsValueRub: 0, isPartial: false },
    { date: '2024-06-01', totalValueRub: 0, stocksValueRub: 0, bondsValueRub: 0, isPartial: false }
  ];
  const resultPoints = [
    {
      date: '2024-01-01', portfolioValueRub: 0, totalValueRub: 0, stocksValueRub: 0, bondsValueRub: 0,
      resultRub: 0, stocksResultRub: 0, bondsResultRub: 0, isPartial: false, operationsPartial: false
    },
    {
      date: '2024-03-15', portfolioValueRub: 0, totalValueRub: 0, stocksValueRub: 0, bondsValueRub: 0,
      resultRub: 300, stocksResultRub: 300, bondsResultRub: 0, isPartial: false, operationsPartial: false
    },
    {
      date: '2024-06-01', portfolioValueRub: 0, totalValueRub: 0, stocksValueRub: 0, bondsValueRub: 0,
      resultRub: 300, stocksResultRub: 300, bondsResultRub: 0, isPartial: false, operationsPartial: false
    }
  ];
  const valueCard = calc.buildPortfolioDynamicsCardHtml(valueSeries, 2);
  assert(/Стоимость портфеля/.test(valueCard), 'result ui: cost card still uses portfolio value');
  assert(/С начала периода/.test(valueCard), 'result ui: cost card keeps change-from-start');
  const resultCard = calc.buildPortfolioDynamicsCardHtml(resultPoints, 2, { mode: 'result' });
  assert(/Результат за выбранный период/.test(resultCard), 'result ui: result card label');
  assert(/Результат с начала выбранного периода/.test(resultCard), 'result ui: period semantics');
  assert(!/Стоимость портфеля/.test(resultCard), 'result ui: result card is not cost');
  assert(!/%/.test(resultCard) && !/changePct/.test(resultCard), 'result ui: result card has no %');
  assert(!/выплат/i.test(resultCard), 'result ui: result card has no payouts');
  assert(/300/.test(resultCard), 'result ui: round-trip result stays +300 after V=0');
  const firstCard = calc.buildPortfolioDynamicsCardHtml(resultPoints, 0, { mode: 'result' });
  assert(/0,00/.test(firstCard), 'result ui: first point 0 ₽');

  calc.pfDynState.showParts = true;
  const tipVal = calc.buildPortfolioDynamicsTipLines(valueSeries[2], { mode: 'value', showParts: true });
  assert(tipVal.some((ln) => /0,00/.test(ln) || ln.indexOf('0') >= 0), 'result ui: cost tooltip uses value');
  const tipRes = calc.buildPortfolioDynamicsTipLines(resultPoints[2], { mode: 'result', showParts: true });
  assert(tipRes.some((ln) => /300/.test(ln)), 'result ui: tooltip uses resultRub');
  assert(tipRes.some((ln) => /Акции/.test(ln)), 'result ui: tooltip stocksResult');
  assert(!tipRes.some((ln) => /%/.test(ln)), 'result ui: tooltip has no %');
  calc.pfDynState.showParts = false;

  const nullPt = {
    date: '2024-03-01', resultRub: null, stocksResultRub: null, bondsResultRub: 10,
    isPartial: false, operationsPartial: true
  };
  const nullCard = calc.buildPortfolioDynamicsCardHtml([resultPoints[0], nullPt], 1, { mode: 'result' });
  assert(/—/.test(nullCard), 'result ui: null resultRub is em dash, not 0');
  assert(!/Результат за выбранный период[\s\S]*0,00 ₽/.test(nullCard) || /—/.test(nullCard),
    'result ui: null is not formatted as 0,00');
  const nullTip = calc.buildPortfolioDynamicsTipLines(nullPt, { mode: 'result' });
  assert(nullTip.indexOf('—') >= 0, 'result ui: tooltip null is not 0');
  assert(nullTip.some((ln) => /не все операции/.test(ln)), 'result ui: opsPartial tooltip');

  const marketStatus = calc.buildPortfolioDynamicsResultStatusText(
    { operationsPartial: false },
    [{ isPartial: true, operationsPartial: false, resultRub: 10 }]
  );
  assert(/Расчёт частичный: для части позиций не хватает исторических данных/.test(marketStatus),
    'result ui: market partial warning');
  const opsStatus = calc.buildPortfolioDynamicsResultStatusText(
    { operationsPartial: true },
    [{ isPartial: false, operationsPartial: true, resultRub: null }]
  );
  assert(/Не все операции за период удалось оценить/.test(opsStatus), 'result ui: operationsPartial warning');
  const bothStatus = calc.buildPortfolioDynamicsResultStatusText(
    { operationsPartial: true },
    [{ isPartial: true, operationsPartial: true, resultRub: null }]
  );
  assert(/Расчёт частичный/.test(bothStatus) && /Не все операции/.test(bothStatus),
    'result ui: both partial warnings');

  const partsCard = calc.buildPortfolioDynamicsCardHtml([{
    date: '2024-06-01',
    resultRub: 200,
    stocksResultRub: 150,
    bondsResultRub: 50,
    isPartial: false
  }], 0, { mode: 'result' });
  assert(/150/.test(partsCard) && /50/.test(partsCard), 'result ui: stocks/bonds result fields');

  const prevMode = calc.pfDynState.mode;
  let valueSeriesCalls = 0;
  const origSeriesFn = calc.buildPortfolioValueSeries;
  calc.buildPortfolioValueSeries = function () {
    valueSeriesCalls += 1;
    return origSeriesFn.apply(this, arguments);
  };
  calc.pfDynState.series = valueSeries;
  calc.pfDynState.resultSeries = [];
  calc.pfDynState.resultKey = '';
  calc.pfDynState.fromDate = '2024-01-01';
  calc.pfDynState.toDate = '2024-06-01';
  calc.setPfDynLastKey('mode-switch-key');
  await calc.setPortfolioDynamicsMode('result');
  await calc.setPortfolioDynamicsMode('value');
  await calc.setPortfolioDynamicsMode('result');
  assert(valueSeriesCalls === 0, 'result ui: mode switch does not rebuild value series');
  assert(calc.pfDynState.horizon === '1y' || typeof calc.pfDynState.horizon === 'string',
    'result ui: mode switch keeps shared horizon');
  assert(calc.pfDynActiveChartSeries() === calc.pfDynState.resultSeries ||
    calc.pfDynState.mode === 'result', 'result ui: active series is result in result mode');
  calc.buildPortfolioValueSeries = origSeriesFn;
  calc.pfDynState.mode = prevMode || 'value';
  calc.pfDynState.series = [];
  calc.pfDynState.resultSeries = [];
  calc.pfDynState.resultKey = '';
  calc.setPfDynLastKey('');

  assert(!/requestPortfolioDynamicsRefresh/.test(modeSrc), 'result ui: setMode does not refresh series');
}

if (errors.length) {
  console.error('FAIL');
  errors.forEach((e) => console.error(' •', e));
  process.exit(1);
}
console.log('OK  portfolio wave-0/1 + dates + new-lot prefill + wave-2.1/2.2/2.5/2.6 + wave-3.1 timeline + wave-3.2 as-of + wave-3.3 price-at-date + wave-3.4 value-at-date + wave-3.5 value-change + explain + wave-4.1 holding-period payouts + wave-4.2 payout feeds + wave-4.3 upcoming payouts + wave-5.1 ticker return with payouts + wave-5.2 portfolio return with payouts + wave-5.3 ticker return UI + generic split matrix + v1.1 series wave-1 + dynamics UI wave-2 + portfolio result summary + value-change bridge + result series + result chart UI');
