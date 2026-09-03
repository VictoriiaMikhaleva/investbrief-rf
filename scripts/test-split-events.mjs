/**
 * Split-events v1: справочник и read-only helper’ы.
 * Run: node scripts/test-split-events.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SplitEvents = require('../split-events.js');
const Core = require('../analytics-core.js');
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'split-events.json'), 'utf8')
);
const events = SplitEvents.parseSplitEventsCatalog(catalog);

assert(catalog.version === 1, 'catalog version 1');
assert(Array.isArray(catalog.events) && catalog.events.length >= 1, 'catalog has events');
assert(events.length >= 1 && events[0].ticker === 'T', 'parsed T event');
assert(events[0].effectiveDate === '2026-04-17' && events[0].ratio === 10, 'T date/ratio');
assert(events[0].aliases.indexOf('TCSG') >= 0, 'T alias TCSG');

{
  const byT = SplitEvents.getSplitEventsForTicker('T', events);
  const byAlias = SplitEvents.getSplitEventsForTicker('tcsg', events);
  const byCase = SplitEvents.getSplitEventsForTicker('t', events);
  const unknown = SplitEvents.getSplitEventsForTicker('SBER', events);
  assert(byT.length === 1 && byT[0].ticker === 'T', 'getSplitEventsForTicker T');
  assert(byAlias.length === 1 && byAlias[0].ticker === 'T', 'alias TCSG finds T');
  assert(byCase.length === 1, 'ticker case-insensitive');
  assert(unknown.length === 0, 'unknown ticker empty');
}

{
  const hit = SplitEvents.isSplitAffectedChange('T', '2026-04-17', -90, events);
  const near = SplitEvents.isSplitAffectedChange('T', '2026-04-17', -89, events);
  const otherDay = SplitEvents.isSplitAffectedChange('T', '2026-09-03', -90, events);
  const unknown = SplitEvents.isSplitAffectedChange('SBER', '2026-04-17', -90, events);
  const noPct = SplitEvents.isSplitAffectedChange('T', '2026-04-17', null, events);
  const monday = SplitEvents.isSplitAffectedChange('T', '2026-04-20', -90, events);
  const mild = SplitEvents.isSplitAffectedChange('T', '2026-04-17', -2, events);
  const alias = SplitEvents.isSplitAffectedChange('TCSG', '2026-04-17', -90, events);
  assert(hit && hit.ticker === 'T', 'T −90% on effectiveDate → event');
  assert(near && near.ratio === 10, 'T −89% within tolerance');
  assert(otherDay == null, 'other date → null');
  assert(unknown == null, 'unknown ticker → null');
  assert(noPct && noPct.ticker === 'T', 'date match without changePct → event');
  assert(monday && monday.ticker === 'T', 'next session after weekend still matches');
  assert(mild == null, 'date match but mild % → not split-affected');
  assert(alias && alias.ticker === 'T', 'alias TCSG on split day');
}

{
  const badge = SplitEvents.formatSplitDayChangeDisplay('T', '2026-04-17', -90.12, events);
  const normal = SplitEvents.formatSplitDayChangeDisplay('T', '2026-09-03', 0.36, events);
  assert(badge && badge.text === 'сплит', 'top-20 formatter shows сплит');
  assert(badge.cls.indexOf('pnl-neg') < 0, 'split badge is not pnl-neg');
  assert(/1:10/.test(badge.title || ''), 'hint mentions 1:10');
  assert(normal == null, 'normal day keeps regular %');
}

{
  const inWin = SplitEvents.findSplitEventInPeriod('T', '2025-09-03', '2026-09-03', events);
  const aliasWin = SplitEvents.findSplitEventInPeriod('TCSG', '2025-09-03', '2026-09-03', events);
  const after = SplitEvents.findSplitEventInPeriod('T', '2026-04-18', '2026-09-03', events);
  const unknown = SplitEvents.findSplitEventInPeriod('SBER', '2025-09-03', '2026-09-03', events);
  const bad = SplitEvents.findSplitEventInPeriod('T', '', '2026-09-03', events);
  assert(inWin && inWin.ticker === 'T' && inWin.effectiveDate === '2026-04-17', 'period 12m includes T split');
  assert(aliasWin && aliasWin.ticker === 'T', 'TCSG period finds same split');
  assert(after == null, 'period after 2026-04-18 → null');
  assert(unknown == null, 'unknown ticker period → null');
  assert(bad == null, 'invalid dates → null');
}

{
  const hidden = SplitEvents.formatSplitHiddenTotalReturn12m('T', '2026-09-03', events);
  const aliasHidden = SplitEvents.formatSplitHiddenTotalReturn12m('tcsg', '2026-09-03', events);
  const sber = SplitEvents.formatSplitHiddenTotalReturn12m('SBER', '2026-09-03', events);
  const afterSplitYear = SplitEvents.formatSplitHiddenTotalReturn12m('T', '2028-01-01', events);
  assert(hidden && hidden.text === 'сплит', '12m formatter hides T raw %');
  assert(!/-89/.test(hidden.text) && !/%/.test(hidden.text), '12m formatter has no percent');
  assert(hidden.cls.indexOf('pnl-neg') < 0 && hidden.cls.indexOf('pnl-pos') < 0, '12m split is neutral');
  assert(/не хватает данных/.test(hidden.title || ''), '12m hidden title mentions missing data');
  assert(/1:10/.test(hidden.title || '') && /17\.04\.2026/.test(hidden.title || ''), '12m title has ratio and date');
  assert(hidden.price == null && hidden.valToday == null, 'formatter does not touch LAST/VALTODAY');
  assert(aliasHidden && aliasHidden.text === 'сплит', '12m alias TCSG hidden');
  assert(sber == null, '12m SBER still uses regular percent path');
  assert(afterSplitYear == null, '12m window after split shows percent again');
}

{
  const factorT = SplitEvents.getSplitAdjustmentFactor('T', '2025-09-03', '2026-09-03', events);
  const factorAlias = SplitEvents.getSplitAdjustmentFactor('TCSG', '2025-09-03', '2026-09-03', events);
  const after = SplitEvents.getSplitAdjustmentFactor('T', '2026-04-18', '2026-09-03', events);
  const unknown = SplitEvents.getSplitAdjustmentFactor('SBER', '2025-09-03', '2026-09-03', events);
  const bad = SplitEvents.getSplitAdjustmentFactor('T', '', '2026-09-03', events);
  assert(factorT === 10, 'T factor across split = 10, got ' + factorT);
  assert(factorAlias === 10, 'TCSG factor across split = 10');
  assert(after === 1, 'T after split factor = 1');
  assert(unknown === 1, 'unknown ticker factor = 1');
  assert(bad === 1, 'invalid dates factor = 1');
}

{
  const oldPx = SplitEvents.adjustPerShareValueForSplits('T', 3000, '2025-09-03', '2026-09-03', events);
  const newPx = SplitEvents.adjustPerShareValueForSplits('T', 300, '2026-04-18', '2026-09-03', events);
  const unknown = SplitEvents.adjustPerShareValueForSplits('SBER', 250, '2025-09-03', '2026-09-03', events);
  const badVal = SplitEvents.adjustPerShareValueForSplits('T', 'x', '2025-09-03', '2026-09-03', events);
  assert(oldPx === 300, 'T 3000 before split → 300, got ' + oldPx);
  assert(newPx === 300, 'T 300 after split stays 300');
  assert(unknown === 250, 'unknown ticker value unchanged');
  assert(badVal == null, 'non-numeric value → null');
}

{
  const rawDec = SplitEvents.restoreRawPriceFromAdjustedForSplits('T', 312.64, '2025-12-01', '2026-09-03', events);
  const aliasRaw = SplitEvents.restoreRawPriceFromAdjustedForSplits('TCSG', 312.64, '2025-12-01', '2026-09-03', events);
  const onSplit = SplitEvents.restoreRawPriceFromAdjustedForSplits('T', 326.26, '2026-04-17', '2026-09-03', events);
  const after = SplitEvents.restoreRawPriceFromAdjustedForSplits('T', 327.3, '2026-04-23', '2026-09-03', events);
  const unknown = SplitEvents.restoreRawPriceFromAdjustedForSplits('SBER', 250.5, '2025-12-01', '2026-09-03', events);
  const yearEnd = SplitEvents.restoreRawPriceFromAdjustedForSplits('T', 328, '2025-12-30', '2026-09-03', events);
  const pre = SplitEvents.restoreRawPriceFromAdjustedForSplits('T', 319.6, '2026-04-10', '2026-09-03', events);
  function near(actual, expected, msg) {
    assert(actual != null && isFinite(actual) && Math.abs(actual - expected) < 1e-6, msg + ' (got ' + actual + ')');
  }
  near(rawDec, 3126.4, 'T 312.64 on 2025-12-01 → 3126.4');
  near(aliasRaw, 3126.4, 'TCSG alias restores same raw price');
  near(onSplit, 326.26, 'T on effectiveDate stays in new scale');
  near(after, 327.3, 'T after split unchanged');
  near(unknown, 250.5, 'unknown ticker unchanged');
  near(yearEnd, 3280, 'T 328 on 2025-12-30 → 3280');
  near(pre, 3196, 'T 319.6 on 2026-04-10 → 3196');
}

{
  function displayPrice(mode, adj, date) {
    if (mode === 'raw') {
      return SplitEvents.restoreRawPriceFromAdjustedForSplits('T', adj, date, '2026-09-03', events);
    }
    return adj;
  }
  function near(actual, expected, msg) {
    assert(actual != null && isFinite(actual) && Math.abs(actual - expected) < 1e-6, msg + ' (got ' + actual + ')');
  }
  near(displayPrice('adjusted', 312.64, '2025-12-01'), 312.64, 'adjusted Dec 2025 stays 312.64');
  near(displayPrice('raw', 312.64, '2025-12-01'), 3126.4, 'raw Dec 2025 is 3126.4');
  near(displayPrice('adjusted', 327.3, '2026-04-23'), 327.3, 'adjusted after split 327.3');
  near(displayPrice('raw', 327.3, '2026-04-23'), 327.3, 'raw after split still 327.3');
  assert(displayPrice('adjusted', 312.64, '2025-12-01') < 400, 'default adjusted is ~300 not ~3000');
  assert(displayPrice('raw', 312.64, '2025-12-01') > 3000, 'raw mode is ~3000');
}

{
  const now = new Date(2026, 8, 3, 12, 0, 0);
  const historyFlat = [
    { date: '2025-01-15', close: 3000, value: 1 },
    { date: '2026-08-15', close: 300, value: 1 }
  ];
  const historyUp = [
    { date: '2025-01-15', close: 3000, value: 1 },
    { date: '2026-08-15', close: 330, value: 1 }
  ];
  const opts = { ticker: 'T', splitEvents: events };
  const raw = Core.computeTotalReturn12m([], historyFlat, new Date(now), {});
  const flat = Core.computeTotalReturn12m([], historyFlat, new Date(now), opts);
  const up = Core.computeTotalReturn12m([], historyUp, new Date(now), opts);
  const preDiv = Core.computeTotalReturn12m(
    [{ date: '2026-03-01', value: 100 }],
    historyFlat,
    new Date(now),
    opts
  );
  const postDiv = Core.computeTotalReturn12m(
    [{ date: '2026-05-01', value: 10 }],
    historyFlat,
    new Date(now),
    opts
  );
  const sber = Core.computeTotalReturn12m(
    [],
    [
      { date: '2025-01-15', close: 250, value: 1 },
      { date: '2026-08-15', close: 275, value: 1 }
    ],
    new Date(now),
    { ticker: 'SBER', splitEvents: events }
  );
  const noOpts = Core.computeTotalReturn12m([], historyUp, new Date(now));

  function near(actual, expected, msg) {
    assert(actual != null && isFinite(actual) && Math.abs(actual - expected) < 0.05, msg + ' (got ' + actual + ')');
  }

  assert(raw && raw.pct != null && raw.pct < -80, 'raw T without splitEvents stays ~-90%, got ' + (raw && raw.pct));
  assert(!raw.splitAdjusted, 'raw path is not splitAdjusted');
  near(flat.pct, 0, 'split-adjusted flat T ≈ 0%');
  assert(flat.splitAdjusted === true, 'flat T marked splitAdjusted');
  assert(!/-89/.test(String(flat.pct)), 'adjusted pct is not -89');
  near(up.pct, 10, 'split-adjusted growth T ≈ +10%');
  near(preDiv.pct, 100 / 30, 'pre-split dividend 100 → 10, ≈ +3.33%');
  near(preDiv.divPaid12m, 10, 'pre-split dividend adjusted to 10');
  near(postDiv.pct, 10 / 3, 'post-split dividend 10 not divided, ≈ +3.33%');
  near(postDiv.divPaid12m, 10, 'post-split dividend stays 10');
  near(sber.pct, 10, 'SBER without split ≈ +10% as before');
  assert(!sber.splitAdjusted, 'SBER is not splitAdjusted');
  assert(noOpts && noOpts.pct != null && noOpts.pct < -80, 'no options → old formula ~-90%');
}

{
  const adjustedMetric = { pct: 0, splitAdjusted: true, source: 'цена + дивиденды за 12 мес. (MOEX), скорректировано с учётом сплита' };
  const rawMetric = { pct: -89.9, splitAdjusted: false, source: 'цена + дивиденды за 12 мес. (MOEX)' };
  const viewAdj = SplitEvents.formatTotalReturn12mView('T', '2026-09-03', adjustedMetric, events);
  const viewRaw = SplitEvents.formatTotalReturn12mView('T', '2026-09-03', rawMetric, events);
  const viewSber = SplitEvents.formatTotalReturn12mView('SBER', '2026-09-03', { pct: 12.5, splitAdjusted: false }, events);

  function paint(view, fallbackPct) {
    if (view && view.mode === 'adjusted' && isFinite(view.pct)) return { text: String(view.pct), cls: view.cls };
    if (view) return { text: view.text, cls: view.cls };
    return { text: String(fallbackPct), cls: 'quote-div-val' };
  }

  const tAdj = paint(viewAdj, -89.9);
  const tRaw = paint(viewRaw, -89.9);
  const sberUi = paint(viewSber, 12.5);

  assert(viewAdj && viewAdj.mode === 'adjusted', 'adjusted view mode');
  assert(Math.abs(viewAdj.pct - 0) < 1e-9, 'adjusted view shows 0, not hidden');
  assert(viewAdj.cls.indexOf('pnl-pos') >= 0, 'adjusted 0% uses pnl-pos');
  assert(/скорректирована с учётом дробления/.test(viewAdj.title || ''), 'adjusted title');
  assert(/1:10/.test(viewAdj.title || ''), 'adjusted title has 1:10');
  assert(!/-89/.test(tAdj.text) && tAdj.text !== 'сплит', 'UI adjusted text is not -89.9 or сплит');
  assert(viewRaw && viewRaw.mode === 'hidden' && viewRaw.text === 'сплит', 'unadjusted T falls back to сплит');
  assert(!/-89/.test(viewRaw.text), 'hidden fallback has no -89');
  assert(viewRaw.cls.indexOf('pnl-neg') < 0, 'hidden fallback is not red');
  assert(/не хватает данных/.test(viewRaw.title || ''), 'hidden fallback title');
  assert(tRaw.text === 'сплит', 'UI raw T paints сплит');
  assert(viewSber == null, 'SBER view is null → regular percent');
  assert(sberUi.text === '12.5' && !/сплит/.test(sberUi.text), 'SBER still shows percent');
  assert(viewAdj.price == null && viewAdj.valToday == null, 'view does not touch LAST/VALTODAY');
}

{
  const empty = SplitEvents.parseSplitEventsCatalog(null);
  assert(Array.isArray(empty) && empty.length === 0, 'bad catalog → []');
}

const loadOk = await SplitEvents.loadSplitEvents({ catalog: { events: [] } });
assert(Array.isArray(loadOk) && loadOk.length === 0, 'loadSplitEvents catalog []');

const loadFail = await SplitEvents.loadSplitEvents({
  force: true,
  fetch: function () {
    return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } });
  }
});
assert(Array.isArray(loadFail), 'failed fetch still returns array');

if (errors.length) {
  console.error('FAIL');
  errors.forEach((e) => console.error(' •', e));
  process.exit(1);
}
console.log('OK  split-events helpers');
