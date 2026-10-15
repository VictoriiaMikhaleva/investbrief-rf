'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const MOEX_ISS = 'https://iss.moex.com/iss';
export const USER_AGENT = 'InvestBriefResearch/1.0 (+https://victoriiamikhaleva.github.io/investbrief-rf/)';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const RAW = path.join(ROOT, 'raw');
export const MAPPING = path.join(ROOT, 'mapping');
export const DATASETS = path.join(ROOT, 'datasets');
export const FINAL = path.join(ROOT, 'final');
export const HISTORY_DIR = path.join(RAW, 'history');

export const FORBIDDEN_SECTOR_ALIASES = [
  'Потребительский',
  'IT',
  'Коммуникации',
  'Телекоммуникации',
  'Потреб',
  'Недвижка'
];

export const ANALYSIS_DATE = '2026-10-13';
export const TURNOVER_START = '2025-10-14';
export const TURNOVER_END = '2026-10-13';

export const SECTOR_INDICES = [
  { id: 'MOEXFN', title: 'Индекс МосБиржи финансов' },
  { id: 'MOEXOG', title: 'Индекс МосБиржи нефти и газа' },
  { id: 'MOEXEU', title: 'Индекс МосБиржи электроэнергетики' },
  { id: 'MOEXCH', title: 'Индекс МосБиржи химии и нефтехимии' },
  { id: 'MOEXMM', title: 'Индекс МосБиржи металлов и добычи' },
  { id: 'MOEXTL', title: 'Индекс МосБиржи телекоммуникаций' },
  { id: 'MOEXIT', title: 'Индекс МосБиржи ИТ и телеком' },
  { id: 'MOEXCN', title: 'Индекс МосБиржи потребительского сектора' },
  { id: 'MOEXTN', title: 'Индекс МосБиржи транспорта' },
  { id: 'MOEXRE', title: 'Индекс МосБиржи недвижимости' },
  { id: 'MOEXINN', title: 'Индекс МосБиржи инноваций' },
  { id: 'MOEXBMI', title: 'Индекс МосБиржи широкого рынка' }
];

export function ensureDirs() {
  for (const dir of [RAW, MAPPING, DATASETS, FINAL, HISTORY_DIR, path.join(RAW, 'securities')]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) v = v.join('|');
    if (typeof v === 'object') v = JSON.stringify(v);
    const s = String(v);
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export async function moexFetchJson(url, { retries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error('MOEX HTTP ' + res.status);
      }
      if (!res.ok) throw new Error('MOEX HTTP ' + res.status + ' ' + url);
      return await res.json();
    } catch (err) {
      lastErr = err;
      const wait = 400 * Math.pow(2, i);
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export function mapTable(table) {
  if (!table || !table.columns) return [];
  return (table.data || []).map((row) => {
    const obj = {};
    table.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

export async function fetchAllPages(baseUrl, tableName) {
  let start = 0;
  const all = [];
  for (;;) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const json = await moexFetchJson(baseUrl + sep + 'start=' + start + '&iss.meta=off');
    const table = tableName ? json[tableName] : json[Object.keys(json).find((k) => json[k] && json[k].data)];
    const rows = mapTable(table);
    if (!rows.length) break;
    all.push(...rows);
    const cursor = json[tableName ? tableName + '.cursor' : Object.keys(json).find((k) => k.endsWith('.cursor'))];
    const cur = cursor && cursor.data && cursor.data[0];
    if (cur && Number(cur[2]) > 0 && start + rows.length < Number(cur[1])) {
      start += Number(cur[2]);
      continue;
    }
    if (rows.length < 100) break;
    start += rows.length;
    if (start > 20000) break;
  }
  return all;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mapPool(items, concurrency, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return ret;
}

export function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
