#!/usr/bin/env node
/** Копирует analytics-core.js в functions/lib для деплоя Cloud Functions. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'analytics-core.js');
const destDir = path.join(root, 'functions', 'lib');
const dest = path.join(destDir, 'analytics-core.js');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('synced analytics-core.js -> functions/lib/analytics-core.js');
