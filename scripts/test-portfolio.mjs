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
      '\nthis.__restoreClosed = restoreClosedPortfolioTicker;',
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

if (errors.length) {
  console.error('FAIL');
  errors.forEach((e) => console.error(' •', e));
  process.exit(1);
}
console.log('OK  portfolio wave-0/1 + dates + new-lot prefill + wave-2.1/2.2/2.5 history');
