/**
 * Deterministic checks for the volatility-harvesting article.
 * Run: npm run test:article-volatility-harvesting
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

function loadArticleModule() {
  const code = fs.readFileSync(path.join(ROOT, 'article-volatility-harvesting.js'), 'utf8');
  const window = {};
  vm.runInNewContext(code, { window, console });
  return window;
}

const articleWindow = loadArticleModule();
const html = articleWindow.buildVolatilityHarvestingArticleBodyHtml
  ? articleWindow.buildVolatilityHarvestingArticleBodyHtml()
  : '';
const manual = fs.readFileSync(path.join(ROOT, 'manual-data.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');

assert(
  typeof articleWindow.buildVolatilityHarvestingArticleBodyHtml === 'function',
  'builder exists'
);
assert(typeof html === 'string' && html.length > 500, 'article HTML is substantial');
assert(
  typeof articleWindow.calculateRebalancingIllustration === 'function',
  'illustration helper exists'
);

const n = articleWindow.calculateRebalancingIllustration();
assert(n.startTotal === 100, 'startTotal === 100');
assert(n.afterFirstA === 62.5, 'afterFirstA === 62.5');
assert(n.afterFirstB === 40, 'afterFirstB === 40');
assert(n.afterFirstTotal === 102.5, 'afterFirstTotal === 102.5');
assert(n.rebalancedPerAsset === 51.25, 'rebalancedPerAsset === 51.25');
assert(n.finalRebalancedA === 41, 'finalRebalancedA === 41');
assert(n.finalRebalancedB === 64.0625, 'finalRebalancedB === 64.0625');
assert(n.finalRebalancedTotal === 105.0625, 'finalRebalancedTotal === 105.0625');
assert(n.finalNoRebalanceA === 50, 'finalNoRebalanceA === 50');
assert(n.finalNoRebalanceB === 50, 'finalNoRebalanceB === 50');
assert(n.finalNoRebalanceTotal === 100, 'finalNoRebalanceTotal === 100');
assert(n.difference === 5.0625, 'difference === 5.0625');

[
  '100,00 ₽',
  '102,50 ₽',
  '51,25 ₽',
  '41,00 ₽',
  '64,06 ₽',
  '105,06 ₽',
  '5,06 ₽'
].forEach(function (token) {
  assert(html.indexOf(token) !== -1, 'article HTML contains ' + token);
});

assert(
  html.indexOf('сбором волатильности (volatility harvesting)') !== -1,
  'Russian term first: сбор волатильности'
);
assert(
  html.indexOf('премией за ребалансировку (rebalancing premium)') !== -1,
  'Russian term first: премия за ребалансировку'
);
assert(
  html.indexOf('сбором волатильности') !== -1 &&
    html.indexOf('сбором волатильности') < html.indexOf('volatility harvesting'),
  'Russian term appears before volatility harvesting'
);
assert(
  html.indexOf('премией за ребалансировку') !== -1 &&
    html.indexOf('премией за ребалансировку') < html.indexOf('rebalancing premium'),
  'Russian term appears before rebalancing premium'
);
assert(
  (html.match(/volatility harvesting/g) || []).length === 1,
  'English term volatility harvesting appears once'
);
assert(
  (html.match(/rebalancing premium/g) || []).length === 1,
  'English term rebalancing premium appears once'
);
assert(!/<h3>[^<]*Volatility harvesting/i.test(html), 'no English heading Volatility harvesting');
assert(!/<h3>[^<]*Rebalancing premium/i.test(html), 'no English heading Rebalancing premium');

const TITLE = '«Сливки волатильности»: как работает премия за ребалансировку';
const SUMMARY = 'Почему колебания цен могут создавать эффект при систематическом восстановлении долей портфеля и почему он не является гарантированной дополнительной доходностью.';
const entryMatch = manual.match(/id:\s*'volatility-harvesting-rebalancing-premium'[\s\S]{0,900}?bodyHtml:/);
assert(/id:\s*'volatility-harvesting-rebalancing-premium'/.test(manual), 'article id in manual-data.js');
assert(
  /id:\s*'volatility-harvesting-rebalancing-premium'[\s\S]{0,400}title:\s*'«Сливки волатильности»: как работает премия за ребалансировку'/.test(manual),
  'title exact'
);
assert(
  /id:\s*'volatility-harvesting-rebalancing-premium'[\s\S]{0,500}?subtitle:\s*'Почему колебания цен могут создавать эффект при систематическом восстановлении долей портфеля и почему он не является гарантированной дополнительной доходностью.'/.test(manual),
  'subtitle exact'
);
assert(
  /id:\s*'volatility-harvesting-rebalancing-premium'[\s\S]{0,700}?summary:\s*'Почему колебания цен могут создавать эффект при систематическом восстановлении долей портфеля и почему он не является гарантированной дополнительной доходностью.'/.test(manual),
  'summary exact'
);
assert(
  /id:\s*'volatility-harvesting-rebalancing-premium'[\s\S]{0,800}?badges:\s*\[\s*'Портфель',\s*'Ребалансировка',\s*'Средний уровень'\s*\]/.test(manual),
  'badges exact'
);
assert(html.indexOf(SUMMARY) !== -1, 'kicker uses approved summary');
assert(
  /id:\s*'volatility-harvesting-rebalancing-premium'[\s\S]{0,400}featured:\s*true/.test(manual) === false,
  'new article is not featured'
);
assert(
  /id:\s*'getting-started-investing-strategy'[\s\S]{0,80}featured:\s*true/.test(manual),
  'starter article stays featured'
);
void TITLE;
void entryMatch;

const marketIdx = manual.indexOf("id: 'market-sector-proportions-portfolio'");
const volIdx = manual.indexOf("id: 'volatility-harvesting-rebalancing-premium'");
const nextIdx = manual.indexOf("id: 'long-term-strategies-6040-8020-5050'");
assert(marketIdx !== -1 && volIdx > marketIdx, 'new article is after market-sector article');
assert(nextIdx === -1 || volIdx < nextIdx, 'new article is immediately before the next catalog article');

const scriptSectors = indexHtml.indexOf('article-market-sectors.js');
const scriptVol = indexHtml.indexOf('article-volatility-harvesting.js');
const scriptManual = indexHtml.indexOf('manual-data.js');
assert(scriptSectors !== -1 && scriptVol !== -1 && scriptManual !== -1, 'scripts are linked in index.html');
assert(scriptSectors < scriptVol && scriptVol < scriptManual, 'article module loads after sectors and before manual-data');
assert(packageJson.indexOf('test:article-volatility-harvesting') !== -1, 'package script registered');

const headings = [
  'Главное за минуту',
  'Что такое ребалансировка',
  'Откуда берётся идея «сбора волатильности»',
  'Простой пример',
  'Волатильность сама по себе не является источником дохода',
  'Почему низкая корреляция помогает, но ничего не гарантирует',
  'Когда ребалансировка может проигрывать',
  'Ребалансировка — это не попытка угадать рынок',
  'Как часто нужно возвращать доли',
  'Почему издержки имеют значение',
  'А где здесь «премия за ребалансировку»',
  '«Сливки волатильности» и структура портфеля',
  'Что полезно увидеть перед ребалансировкой',
  'Это не торговля волатильностью',
  'Итог'
];
headings.forEach(function (heading) {
  assert(html.indexOf('<h3>' + heading + '</h3>') !== -1, 'heading present: ' + heading);
});

assert((html.match(/article-rebal-state"/g) || []).length === 3, 'visual #1 has 3 states');
assert((html.match(/article-rebal-outcome"/g) || []).length === 2, 'visual #2 has 2 outcome bars');
assert(html.indexOf('canvas') === -1, 'no canvas');
assert(html.indexOf('fetch(') === -1, 'no fetch');
assert(html.indexOf('Chart.js') === -1 && html.indexOf('chart.js') === -1, 'no Chart.js');
assert(html.indexOf('iss.moex') === -1, 'no live MOEX data');
assert(html.indexOf('<svg') === -1, 'no SVG');
assert(
  html.indexOf('Пример специально построен так, чтобы относительное лидерство') !== -1,
  'example marked as illustrative'
);
assert(html.indexOf('Это не прогноз рыночной доходности.') !== -1, 'example is not a forecast');
assert(html.indexOf('Иллюстративный сценарий, не прогноз доходности.') !== -1, 'visual #2 note');
assert(html.indexOf(' vs ') === -1 && html.indexOf('>vs<') === -1, 'no Latin vs in UI');
assert(html.indexOf('Без ребалансировки') !== -1, 'uses «без ребалансировки»');
assert(html.indexOf('С ребалансировкой') !== -1, 'uses «с ребалансировкой»');
assert(html.indexOf('aria-label="Три состояния портфеля') !== -1, 'visual #1 has ARIA label');
assert(
  html.indexOf('Материал носит образовательный характер и не является индивидуальной инвестиционной рекомендацией.') !== -1,
  'disclaimer matches market-sector article'
);

const lower = html.toLowerCase();
[
  'гарантированная прибыль',
  'гарантированная доходность',
  'всегда повышает доходность',
  'оптимальный порог',
  'лучший способ',
  'правильный портфель',
  'идеальный портфель'
].forEach(function (phrase) {
  assert(lower.indexOf(phrase) === -1, 'no banned positive promise: ' + phrase);
});
assert(lower.indexOf('не является гарантированной дополнительной доходностью') !== -1, 'negative guarantee wording kept');

if (errors.length) {
  console.error('FAIL');
  errors.forEach(function (e) { console.error(' - ' + e); });
  process.exit(1);
}

console.log('PASS');
console.log('article id volatility-harvesting-rebalancing-premium');
console.log('html chars ' + html.length);
console.log('final rebalanced ' + n.finalRebalancedTotal);
console.log('difference ' + n.difference);
