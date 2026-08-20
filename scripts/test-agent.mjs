/**
 * Smoke test: agent signal logic + MOEX quotes + event classification rules.
 * Run: node scripts/test-agent.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOEX = 'https://iss.moex.com/iss';

async function moexFetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'InvestBriefAgentTest/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function fetchMoexQuote(ticker) {
  const url = `${MOEX}/engines/stock/markets/shares/boards/TQBR/securities/${ticker}.json?iss.meta=off&marketdata.columns=LAST,VALTODAY,PREVPRICE&securities.columns=PREVPRICE`;
  const json = await moexFetchJson(url);
  const md = json.marketdata;
  if (!md?.data?.length) return null;
  const cols = md.columns;
  const row = md.data[0];
  const g = (n) => { const i = cols.indexOf(n); return i >= 0 ? row[i] : null; };
  const price = Number(g('LAST'));
  if (!isFinite(price)) return null;
  const prev = g('PREVPRICE');
  const changePct = prev && isFinite(Number(prev)) ? ((price - Number(prev)) / Number(prev)) * 100 : null;
  const val = g('VALTODAY');
  return { price, changePct, valueToday: val != null ? Number(val) : null };
}

function loadAgentHelpers() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'agent.js'), 'utf8');
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
    setTimeout: () => {},
    clearTimeout: () => {},
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    normalizeTicker: (t) => String(t || '').trim().toUpperCase(),
    getTickerSubtitle: (t) => ({ SBER: 'Сбербанк', GAZP: 'Газпром' }[t] || t),
    getAgentSettings: () => ({
      dayMoveThreshold: 3,
      weekDownThreshold: 7,
      weekUpThreshold: 8,
      turnoverMultiplier: 1.5,
      enabled: true
    }),
    getAllBriefs: () => [],
    escapeHtml: (s) => String(s || ''),
    Notification: undefined,
    MOEX_ISS: MOEX
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox, { timeout: 5000 });
  return {
    classifyAgentEvent: sandbox.window.classifyAgentEvent,
    analyzeAgentSignals: sandbox.window.analyzeAgentSignals,
    deriveAgentStatus: sandbox.window.deriveAgentStatus
  };
}

const settings = {
  dayMoveThreshold: 3,
  weekDownThreshold: 7,
  weekUpThreshold: 8,
  turnoverMultiplier: 1.5
};

const helpers = loadAgentHelpers();
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

{
  const cbr = {
    title: 'Результаты мониторинга максимальных процентных ставок кредитных организаций (12.08.2026)',
    summary: 'Банк России публикует результаты мониторинга',
    body: '',
    ticker: 'SBER',
    type: 'macro',
    feedId: 'cbr_press',
    sourceName: 'Банк России — пресс-релизы',
    publishedAt: '2026-08-12T07:50:00.000Z',
    sourceUrl: 'https://www.cbr.ru/press/'
  };
  const c = helpers.classifyAgentEvent(cbr, 'SBER');
  assert(c && c.level === 'sector', 'CBR rates monitoring for SBER must be sector, got ' + (c && c.level));
  assert(c && c.dateLabel && !/T\d{2}:/.test(c.dateLabel), 'date must be human, got ' + (c && c.dateLabel));

  const issuer = {
    title: 'Сбербанк опубликовал отчётность по МСФО за полугодие',
    summary: 'Чистая прибыль выросла',
    body: '',
    ticker: 'SBER',
    type: 'stock',
    eventType: 'earnings',
    feedId: 'interfax',
    sourceName: 'Интерфакс',
    publishedAt: '2026-08-10T10:00:00.000Z',
    sourceUrl: 'https://www.interfax.ru/example'
  };
  const i = helpers.classifyAgentEvent(issuer, 'SBER');
  assert(i && i.level === 'issuer', 'Sber earnings must be issuer, got ' + (i && i.level));

  const macro = {
    title: 'Банк России сохранил ключевую ставку',
    summary: 'Решение по ДКП',
    body: '',
    ticker: 'SBER',
    type: 'macro',
    feedId: 'cbr',
    sourceName: 'Банк России',
    publishedAt: '2026-07-25T12:00:00.000Z',
    sourceUrl: 'https://www.cbr.ru/dkp/'
  };
  const m = helpers.classifyAgentEvent(macro, 'SBER');
  assert(m && m.level === 'macro', 'Key rate for SBER must be macro, got ' + (m && m.level));

  const onlySector = helpers.analyzeAgentSignals(
    { insufficient: false, dayChangePct: 0.1, weekChangePct: 0.2, currentPrice: 100, monthHigh: 110, monthLow: 90 },
    [c],
    settings
  );
  assert(!onlySector.some((s) => s.id === 'event'), 'sector context must not create event signal');
  assert(helpers.deriveAgentStatus(onlySector) === 'Спокойно', 'sector-only card status must be Спокойно');

  const withIssuer = helpers.analyzeAgentSignals(
    { insufficient: false, dayChangePct: 0.1, weekChangePct: 0.2, currentPrice: 100, monthHigh: 110, monthLow: 90 },
    [i],
    settings
  );
  assert(withIssuer.some((s) => s.id === 'event'), 'issuer event must create event signal');
  assert(helpers.deriveAgentStatus(withIssuer) === 'Есть событие', 'issuer must set Есть событие');

  const oilForT = {
    title: 'Reuters рассказал о соперничестве Китая и Индии за российскую нефть',
    summary: 'Борьба за поставки нефти',
    body: '',
    ticker: 'MOEX',
    type: 'macro',
    feedId: 'rbc',
    sourceName: 'РБК — экономика',
    publishedAt: '2026-08-20T10:00:00.000Z',
    sourceUrl: 'https://www.rbc.ru/example-oil'
  };
  const oilCls = helpers.classifyAgentEvent(oilForT, 'T');
  assert(!oilCls || oilCls.level !== 'issuer', 'oil news must not be issuer event for T, got ' + (oilCls && oilCls.level));
  assert(!helpers.analyzeAgentSignals(
    { insufficient: false, dayChangePct: -2, weekChangePct: 0, currentPrice: 250, monthHigh: 280, monthLow: 240 },
    oilCls ? [oilCls] : [],
    settings
  ).some((s) => s.id === 'event'), 'T must not get event status from oil news');
}

const tickers = ['SBER', 'GAZP', 'VTBR', 'LKOH'];
let withSignals = 0;
let quotesOk = 0;

for (const t of tickers) {
  const q = await fetchMoexQuote(t);
  if (q?.price != null) quotesOk++;
  const data = q
    ? { insufficient: false, dayChangePct: q.changePct, weekChangePct: -8, monthHigh: 100, monthLow: 80, currentPrice: 82, todayTurnover: 1e10, avgTurnover7d: 5e9 }
    : { insufficient: true };
  const sigs = helpers.analyzeAgentSignals(data, [], settings);
  if (sigs.length) withSignals++;
  console.log(t, q ? 'quote ok' : 'quote fail', 'signals:', sigs.map((s) => s.id).join(',') || 'none');
}

if (quotesOk < tickers.length) {
  errors.push('MOEX quotes ' + quotesOk + '/' + tickers.length);
}
if (withSignals < 1) {
  errors.push('expected at least one ticker with signals in fixture');
}

if (errors.length) {
  console.error('FAIL');
  errors.forEach((e) => console.error(' •', e));
  process.exit(1);
}
console.log('OK  event classification + agent smoke');
