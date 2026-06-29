#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { fetchUkPifFunds } = require('./uk-pif-fetch');

const DATA_DIR = path.join(__dirname, '..', 'data');

function loadPifCatalog() {
  const indexPath = path.join(DATA_DIR, 'pif-index.json');
  if (!fs.existsSync(indexPath)) return [];
  try {
    const json = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return (json.data && json.data.catalog) || [];
  } catch (_) {
    return [];
  }
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const catalog = loadPifCatalog();
  const bundle = await fetchUkPifFunds({ catalog });
  const sources = ['alfacapital.ru', 'first-am.ru', 'dohod.ru'];
  if (process.env.NSD_PIF_API_KEY) sources.push('nsddata.ru');
  const payload = {
    status: bundle.funds.length ? 'ok' : 'empty',
    updatedAt: new Date().toISOString(),
    source: 'Сайты УК (' + sources.join(', ') + ')',
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
