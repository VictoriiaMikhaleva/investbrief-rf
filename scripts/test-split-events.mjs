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
