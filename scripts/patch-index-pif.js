#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

function resolveConflictMarkers(src) {
  if (!src.includes('<<<<<<<')) return src;
  const lines = src.split('\n');
  const out = [];
  let mode = 'keep';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('<<<<<<<')) {
      mode = 'skip';
      continue;
    }
    if (line.startsWith('=======')) {
      mode = 'keep';
      continue;
    }
    if (line.startsWith('>>>>>>>')) {
      mode = 'keep';
      continue;
    }
    if (mode === 'keep') out.push(line);
  }
  return out.join('\n');
}

html = resolveConflictMarkers(html);

const navBtn = `        <button type="button" class="book-nav" data-tab="pifs" style="--book-color:#7A5C8A;--book-text:#F7F4EE">
          <span class="book-nav__3d" aria-hidden="true">
            <span class="book-nav__spine"></span>
            <span class="book-nav__pages"></span>
            <span class="book-nav__cover book-nav__cover--textured">
              <span class="book-nav__title book-nav__title--empty" aria-hidden="true"></span>
            </span>
          </span>
          <span class="book-nav__text">
            <span class="book-nav__name">ПИФы</span>
          </span>
        </button>
`;

const bottomBtn = `        <button type="button" class="book-nav book-nav--bottom" data-tab="pifs" style="--book-color:#7A5C8A;--book-text:#F7F4EE">
          <span class="book-nav__3d" aria-hidden="true">
            <span class="book-nav__spine"></span>
            <span class="book-nav__pages"></span>
            <span class="book-nav__cover book-nav__cover--textured book-nav__cover--simple">
              <span class="book-nav__title" data-typing-mobile="ПИФы">ПИФы</span>
            </span>
          </span>
          <span class="book-nav__name">ПИФы</span>
        </button>
`;

const panel = fs.readFileSync(path.join(__dirname, '_pif-panel-snippet.html'), 'utf8');

if (!html.includes('data-tab="pifs"')) {
  html = html.replace(
    '        <button type="button" class="book-nav" data-tab="articles"',
    navBtn + '        <button type="button" class="book-nav" data-tab="articles"'
  );
  html = html.replace(
    '        <button type="button" class="book-nav book-nav--bottom" data-tab="articles"',
    bottomBtn + '        <button type="button" class="book-nav book-nav--bottom" data-tab="articles"'
  );
}

if (!html.includes('id="tab-pifs"')) {
  html = html.replace(
    '        <section id="tab-articles" class="panel" data-panel="articles">',
    panel
  );
}

if (!html.includes('./pif.js')) {
  html = html.replace(
    /<script src="\.\/ofz\.js\?v=[^"]+"><\/script>/,
    (m) => m + '\n  <script src="./pif.js?v=202606291200"></script>'
  );
}

fs.writeFileSync(file, html, 'utf8');
console.log('patched index.html', fs.statSync(file).size, 'bytes');
