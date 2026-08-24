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
  vm.runInNewContext(code + '\nthis.__np = normalizePortfolio;\nthis.__npos = normalizePosition;\nthis.__ns = normalizeSale;\nthis.__ncf = normalizeCashFlow;\nthis.__getP = getPortfolio;\nthis.__setP = setPortfolio;\nthis.__export = exportAll;\nthis.__import = importAll;\nthis.__KEYS = KEYS;\n', sandbox, { timeout: 5000 });
  return {
    normalizePortfolio: sandbox.__np,
    normalizePosition: sandbox.__npos,
    normalizeSale: sandbox.__ns,
    normalizeCashFlow: sandbox.__ncf,
    getPortfolio: sandbox.__getP,
    setPortfolio: sandbox.__setP,
    importAll: sandbox.__import,
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
  assert(after.sales.length === 1 && after.sales[0].saleId === 'SALE_KEEP', 'import sales');
  assert(after.sales[0].allocations && after.sales[0].allocations[0].qty === 2, 'import allocations');
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

if (errors.length) {
  console.error('FAIL');
  errors.forEach((e) => console.error(' •', e));
  process.exit(1);
}
console.log('OK  portfolio wave-0 normalize + backup compatibility');
