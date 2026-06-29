'use strict';

const path = require('path');
const express = require('express');
const { buildTickerAnalytics, runSpotCheck } = require('../functions/lib/build-analytics');
const { fetchUkPifFunds, lookupUkFund } = require('../scripts/uk-pif-fetch');

const PORT = Number(process.env.PORT) || 8787;
const ROOT = path.resolve(__dirname, '..');

const app = express();

app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get('/api/analytics/spot-check', function (req, res) {
  runSpotCheck().then(function (report) {
    res.status(report.ok ? 200 : 503).json(report);
  }).catch(function (err) {
    res.status(500).json({ ok: false, error: err.message || 'error' });
  });
});

app.get('/api/analytics/:ticker', function (req, res) {
  const force = req.query.refresh === '1' || req.query.force === '1';
  buildTickerAnalytics(req.params.ticker, { forceRefresh: force }).then(function (data) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(data);
  }).catch(function (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'analytics_error', ticker: req.params.ticker });
  });
});

app.get('/api/pif/uk', function (req, res) {
  const isin = String(req.query.isin || '').trim();
  const name = String(req.query.name || '').trim();
  const refresh = req.query.refresh === '1';
  const cacheKey = '_ukPifCache';
  const ttl = 15 * 60 * 1000;

  function respond(bundle) {
    const fund = lookupUkFund(bundle, { isin, name });
    if (!fund) {
      res.status(404).json({ error: 'uk_fund_not_found', isin, name });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ fund, stats: bundle.stats, updatedAt: new Date().toISOString() });
  }

  const cached = app.locals[cacheKey];
  if (!refresh && cached && (Date.now() - cached.at) < ttl) {
    respond(cached.bundle);
    return;
  }

  fetchUkPifFunds().then(function (bundle) {
    app.locals[cacheKey] = { at: Date.now(), bundle };
    respond(bundle);
  }).catch(function (err) {
    res.status(502).json({ error: err.message || 'uk_fetch_error' });
  });
});

app.get('/api/pif/uk/catalog', function (req, res) {
  const refresh = req.query.refresh === '1';
  const cacheKey = '_ukPifCatalog';
  const ttl = 60 * 60 * 1000;
  const cached = app.locals[cacheKey];
  if (!refresh && cached && (Date.now() - cached.at) < ttl) {
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json(cached.payload);
    return;
  }
  fetchUkPifFunds().then(function (bundle) {
    const payload = {
      status: 'ok',
      updatedAt: new Date().toISOString(),
      data: { stats: bundle.stats, byIsin: bundle.byIsin, errors: bundle.errors }
    };
    app.locals[cacheKey] = { at: Date.now(), payload };
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json(payload);
  }).catch(function (err) {
    res.status(502).json({ error: err.message || 'uk_fetch_error' });
  });
});

app.use(express.static(ROOT, { index: 'index.html' }));

app.listen(PORT, function () {
  console.log('InvestBrief RF server http://localhost:' + PORT);
  console.log('Analytics API: http://localhost:' + PORT + '/api/analytics/GAZP');
});
