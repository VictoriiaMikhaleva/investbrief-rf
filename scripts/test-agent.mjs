/**
 * Smoke test: agent signal logic + MOEX quotes for default tickers.
 * Run: node scripts/test-agent.mjs
 */
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

function analyzeAgentSignals(securityData, relatedEvents, agentSettings) {
  if (!securityData || securityData.insufficient) return [];
  const s = agentSettings;
  const signals = [];
  const d = securityData;
  const dayTh = s.dayMoveThreshold;
  const wDown = s.weekDownThreshold;
  const wUp = s.weekUpThreshold;
  const turnMul = s.turnoverMultiplier;
  if (d.dayChangePct != null && d.dayChangePct <= -dayTh) signals.push({ id: 'day-down' });
  if (d.dayChangePct != null && d.dayChangePct >= dayTh) signals.push({ id: 'day-up' });
  if (d.weekChangePct != null && d.weekChangePct <= -wDown) signals.push({ id: 'week-down' });
  if (d.weekChangePct != null && d.weekChangePct >= wUp) signals.push({ id: 'week-up' });
  if (d.todayTurnover != null && d.avgTurnover7d != null && d.avgTurnover7d > 0 &&
      d.todayTurnover >= d.avgTurnover7d * turnMul) signals.push({ id: 'turnover-high' });
  if (d.monthHigh != null && d.monthLow != null && d.monthHigh > d.monthLow && d.currentPrice != null) {
    const range = d.monthHigh - d.monthLow;
    if (d.currentPrice <= d.monthLow + range * 0.15) signals.push({ id: 'month-low' });
    if (d.currentPrice >= d.monthHigh - range * 0.15) signals.push({ id: 'month-high' });
  }
  if (relatedEvents?.length) signals.push({ id: 'event' });
  return signals;
}

const settings = {
  dayMoveThreshold: 3,
  weekDownThreshold: 7,
  weekUpThreshold: 8,
  turnoverMultiplier: 1.5
};

const tickers = ['SBER', 'GAZP', 'VTBR', 'LKOH'];
let withSignals = 0;
let quotesOk = 0;

for (const t of tickers) {
  const q = await fetchMoexQuote(t);
  if (q?.price != null) quotesOk++;
  const data = q
    ? { insufficient: false, dayChangePct: q.changePct, weekChangePct: -8, monthHigh: 100, monthLow: 80, currentPrice: 82, todayTurnover: 1e10, avgTurnover7d: 5e9 }
    : { insufficient: true };
  const sigs = analyzeAgentSignals(data, [], settings);
  if (sigs.length) withSignals++;
  console.log(t, q ? 'quote ok' : 'quote fail', 'signals:', sigs.map((s) => s.id).join(',') || 'none');
}

if (quotesOk < tickers.length) {
  console.error('FAIL: MOEX quotes', quotesOk + '/' + tickers.length);
  process.exit(1);
}
if (withSignals < 1) {
  console.error('FAIL: expected at least one ticker with signals in fixture');
  process.exit(1);
}
console.log('OK agent smoke:', quotesOk, 'quotes,', withSignals, 'with signals');
