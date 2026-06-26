/**
 * Единая версия статики для cache-busting (?v=...).
 * asset-version.json — источник правды; HTML подтягивается скриптом.
 *
 * npm run sync:assets  — применить текущую версию к HTML
 * npm run bump:assets  — новая версия (UTC YYYYMMDDHHmm) + HTML
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'asset-version.json');
const HTML_FILES = ['index.html', 'privacy.html', 'page-template.html'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function makeVersionStamp() {
  const now = new Date();
  return (
    String(now.getUTCFullYear()) +
    pad2(now.getUTCMonth() + 1) +
    pad2(now.getUTCDate()) +
    pad2(now.getUTCHours()) +
    pad2(now.getUTCMinutes())
  );
}

function readVersionFile() {
  if (!fs.existsSync(VERSION_FILE)) {
    return { version: makeVersionStamp(), updatedAt: new Date().toISOString() };
  }
  try {
    return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  } catch (err) {
    throw new Error('Не удалось прочитать asset-version.json: ' + err.message);
  }
}

function writeVersionFile(version) {
  const payload = {
    version: version,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(VERSION_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

function readTextFileUtf8(filePath) {
  var buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le');
  }
  if (buf.length >= 4 && buf[0] === 0x3c && buf[1] === 0x00) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

function writeTextFileUtf8(filePath, text) {
  fs.writeFileSync(filePath, text, 'utf8');
}

function applyVersionToHtml(html, version) {
  var next = html.replace(/\?v=[^"'\s>]+/g, '?v=' + version);
  var marker = /<!--\s*ibrf-asset-version:\s*[^>]*-->/;
  var comment = '<!-- ibrf-asset-version: ' + version + ' -->';
  if (marker.test(next)) {
    next = next.replace(marker, comment);
  } else if (/<head[^>]*>/i.test(next)) {
    next = next.replace(/<head([^>]*)>/i, '<head$1>\n  ' + comment);
  }
  return next;
}

function syncHtmlFiles(version) {
  var changed = [];
  HTML_FILES.forEach(function (name) {
    var filePath = path.join(ROOT, name);
    if (!fs.existsSync(filePath)) return;
    var before = readTextFileUtf8(filePath);
    var after = applyVersionToHtml(before, version);
    if (after !== before) {
      writeTextFileUtf8(filePath, after);
      changed.push(name);
    }
  });
  return changed;
}

function main() {
  var bump = process.argv.indexOf('--bump') !== -1;
  var data = readVersionFile();
  var version = String(data.version || '').trim();

  if (bump || !version) {
    version = bump || !version ? makeVersionStamp() : version;
    writeVersionFile(version);
  }

  var changed = syncHtmlFiles(version);
  console.log('[sync-asset-version] version=' + version + (bump ? ' (bumped)' : ''));
  if (changed.length) {
    console.log('[sync-asset-version] updated: ' + changed.join(', '));
  } else {
    console.log('[sync-asset-version] HTML already up to date');
  }
}

main();
