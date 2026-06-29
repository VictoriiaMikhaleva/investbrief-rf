#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const pifsStart = html.indexOf('<div class="analytics-subview" id="analyticsSubviewPifs"');
if (pifsStart === -1) {
  console.error('[fix-analytics-html] pifs subview not found');
  process.exit(1);
}

let pifsEnd = html.indexOf('</div>', html.indexOf('</section>', pifsStart) + 10);
if (pifsEnd === -1) pifsEnd = html.lastIndexOf('</div>', html.indexOf('<section id="tab-articles"'));
pifsEnd += '</div>'.length;

let pifsBlock = html.slice(pifsStart, pifsEnd);
pifsBlock = pifsBlock.replace(/\s*<p class="muted chart-source hint-frame">Реестр и витрина[\s\S]*?<\/p>\s*<\/section>\s*<\/section>\s*$/, '\n');

html = html.slice(0, pifsStart) + html.slice(pifsEnd);
html = html.replace(/(<\/section>\s*<\/div>)\s*<\/section>\s*(<section id="tab-portfolio")/, '$1\n\n' + pifsBlock + '\n        </section>\n\n        $2');

if (!html.includes('analyticsSubviewPifs') || html.indexOf('analyticsSubviewPifs') > html.indexOf('tab-portfolio')) {
  console.error('[fix-analytics-html] pifs still outside watchlist');
  process.exit(1);
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[fix-analytics-html] ok');
