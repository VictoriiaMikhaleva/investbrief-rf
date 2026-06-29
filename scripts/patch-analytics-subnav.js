#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const subnav = `
          <div class="analytics-subnav horizon-tabs" role="tablist" id="analyticsSubnav" aria-label="Раздел аналитики">
            <button type="button" data-analytics-sub="stocks" class="active">Акции</button>
            <button type="button" data-analytics-sub="ofz">ОФЗ</button>
            <button type="button" data-analytics-sub="pifs">ПИФы</button>
          </div>
`;

if (!html.includes('id="analyticsSubnav"')) {
  html = html.replace(
    /(<section id="tab-watchlist"[\s\S]*?<div class="panel-intro hint-frame panel-intro--one-line">\s*<p>)[^<]+(<\/p>\s*<\/div>)/,
    '$1Не является индивидуальной инвестиционной рекомендацией. Акции, ОФЗ и паевые фонды — в одном разделе.$2' + subnav
  );

  html = html.replace(
    /(<div class="briefing-market-toolbar" hidden>\s*<div class="market-filter-tabs" id="analyticsMarketTabs")/,
    '<div class="analytics-subview active" id="analyticsSubviewStocks" data-analytics-subview="stocks">\n          $1'
  );

  html = html.replace(
    /(<\/section>\s*)(<section class="home-block ofz-section glass" id="ofzSection")/,
    '$1</div>\n\n          <div class="analytics-subview" id="analyticsSubviewOfz" data-analytics-subview="ofz" hidden>\n          $2'
  );

  html = html.replace(
    /(<p class="muted chart-source hint-frame">Котировки, купоны, дюрация и доходность —[\s\S]*?<\/section>\s*)(<\/section>\s*<section id="tab-portfolio")/,
    '$1</div>\n        $2'
  );
}

const pifsPanelMatch = html.match(/<section id="tab-pifs" class="panel" data-panel="pifs">([\s\S]*?)<\/section>\s*<section id="tab-articles"/);
if (pifsPanelMatch && !html.includes('id="analyticsSubviewPifs"')) {
  let inner = pifsPanelMatch[1]
    .replace(/<h2>[\s\S]*?<\/div>\s*/m, '')
    .trim();
  const pifsBlock = '\n          <div class="analytics-subview" id="analyticsSubviewPifs" data-analytics-subview="pifs" hidden>\n' + inner + '\n          </div>\n        ';
  html = html.replace(
    /<section id="tab-pifs" class="panel" data-panel="pifs">[\s\S]*?<\/section>\s*/,
    pifsBlock
  );
}

html = html.replace(/\s*<button type="button" class="book-nav[^"]*" data-tab="pifs"[\s\S]*?<\/button>\s*/g, '\n');

if (!html.includes('analyticsSubnav')) {
  console.error('[patch-analytics-subnav] failed — markers missing');
  process.exitCode = 1;
} else {
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('[patch-analytics-subnav] ok');
}
