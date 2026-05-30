'use strict';

const path = require('path');
const express = require('express');
const { buildTickerAnalytics, runSpotCheck } = require('../functions/lib/build-analytics');

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

app.use(express.static(ROOT, { index: 'index.html' }));

app.listen(PORT, function () {
  console.log('InvestBrief RF server http://localhost:' + PORT);
  console.log('Analytics API: http://localhost:' + PORT + '/api/analytics/GAZP');
});
