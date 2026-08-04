#!/usr/bin/env node
/** Тест серверного слоя аналитики (functions/lib/build-analytics.js). */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildTickerAnalytics, runSpotCheck } = require('../functions/lib/build-analytics.js');

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

async function main() {
  const errors = [];
  console.log('Server analytics layer…');

  const gazp = await buildTickerAnalytics('GAZP', { forceRefresh: true });
  assert(gazp.source === 'server', 'GAZP source=server', errors);
  assert(gazp.divAvg5y != null && gazp.divAvg5y >= 9.1 && gazp.divAvg5y <= 9.9,
    'GAZP divAvg5y=' + gazp.divAvg5y, errors);
  assert(!gazp.divForecast || gazp.divForecast.amount == null,
    'GAZP forecast must be null', errors);
  assert(!gazp.volumeStale, 'GAZP volume stale', errors);
  assert(gazp.dataAsOf, 'GAZP dataAsOf missing', errors);

  const spot = await runSpotCheck();
  assert(spot.ok, 'spot-check: ' + (spot.errors || []).join('; '), errors);

  if (errors.length) {
    console.error('FAILED:', errors);
    process.exit(1);
  }
  console.log('OK GAZP avg5=' + gazp.divAvg5y.toFixed(1) + '% vol=' + gazp.dataAsOf);
  console.log('OK spot-check');
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
