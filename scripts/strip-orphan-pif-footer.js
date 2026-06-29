#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const footerRe = /<p class="muted chart-source hint-frame">Реестр и витрина —[\s\S]*?Архивные фонды подгружаются отдельным файлом \(~2 МБ\)\.<\/p>/g;
const matches = html.match(footerRe) || [];
if (matches.length > 1) {
  let seen = 0;
  html = html.replace(footerRe, function (block) {
    seen += 1;
    return seen === 1 ? block : '';
  });
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('[strip-orphan-pif-footer] removed', matches.length - 1, 'duplicate(s)');
} else {
  console.log('[strip-orphan-pif-footer] ok');
}
