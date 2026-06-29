#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { fetchUkPifFunds } = require('./uk-pif-fetch');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const bundle = await fetchUkPifFunds();
  const payload = {
    status: bundle.funds.length ? 'ok' : 'empty',
    updatedAt: new Date().toISOString(),
    source: 'Сайты УК (alfacapital.ru)' + (process.env.NSD_PIF_API_KEY ? ' · НРД' : ''),
    message: bundle.funds.length ? 'Данные обновлены' : 'Нет данных УК',
    data: {
      stats: bundle.stats,
      byIsin: bundle.byIsin,
      errors: bundle.errors
    }
  };
  const out = path.join(DATA_DIR, 'pif-uk.json');
  fs.writeFileSync(out, JSON.stringify(payload) + '\n', 'utf8');
  console.log('[ok] pif-uk.json', bundle.stats, bundle.errors.length ? bundle.errors : '');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { main };
