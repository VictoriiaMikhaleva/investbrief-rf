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
    isRuBondTicker: (ticker) => {
      ticker = String(ticker || '').trim().toUpperCase();
      return ticker.indexOf('OFZ') >= 0 || (ticker.indexOf('SU') === 0 && ticker.length > 8);
    },
    Markets: {
      isUsPosition: () => false,
      isUsTicker: () => false,
      formatMoneyValue: (v) => (v == null ? '—' : String(v))
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
      '\nthis.__asOfChangeExplain = buildPortfolioValueChangeExplanation;',
    sandbox,
    { timeout: 5000 }
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
    localStorage: sandbox.localStorage,
    memStore: memStore
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

if (errors.length) {
  console.error('FAIL');
  errors.forEach((e) => console.error(' •', e));
  process.exit(1);
}
console.log('OK  portfolio wave-0/1 + dates + new-lot prefill + wave-2.1/2.2/2.5/2.6 + wave-3.1 timeline + wave-3.2 as-of + wave-3.3 price-at-date + wave-3.4 value-at-date + wave-3.5 value-change + explain');
