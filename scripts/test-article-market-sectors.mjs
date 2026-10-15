/**
 * Publication facts for the market-sector article must stay aligned
 * with research/market-sectors/final/article-facts.json.
 * Run: npm run test:article-market-sectors
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

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function loadArticleModule() {
  const code = fs.readFileSync(path.join(ROOT, 'article-market-sectors.js'), 'utf8');
  const window = {};
  vm.runInNewContext(code, { window, console });
  return window;
}

const factsPath = path.join(ROOT, 'research', 'market-sectors', 'final', 'article-facts.json');
const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
const sectorSummary = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'research', 'market-sectors', 'final', 'sector-summary.json'), 'utf8')
);
const articleWindow = loadArticleModule();
const pub = articleWindow.MARKET_SECTOR_PUBLICATION_FACTS;
const html = articleWindow.buildMarketSectorProportionsArticleBodyHtml();
const manual = fs.readFileSync(path.join(ROOT, 'manual-data.js'), 'utf8');

function sectorFact(name) {
  return facts.topSectorsByMarketCap.find((s) => s.sector === name);
}

function sectorPub(name) {
  return pub.sectors.find((s) => s.sector === name);
}

function sectorSummaryRow(name) {
  return sectorSummary.sectors.find((s) => s.sector === name);
}

assert(facts.analysisDate === '2026-10-13', 'article-facts analysisDate');
assert(facts.securityCount === 259, 'article-facts securityCount');
assert(facts.universeCompanyCount === 217, 'article-facts companyCount');

assert(pub && Array.isArray(pub.sectors) && pub.sectors.length === 9, 'publication facts expose 9 sectors');
assert(typeof html === 'string' && html.length > 500, 'article HTML is generated');

assert(pub.analysisDate === facts.analysisDate, 'pub analysisDate matches article-facts');
assert(pub.securityCount === facts.securityCount, 'pub securityCount matches article-facts');
assert(pub.universeCompanyCount === facts.universeCompanyCount, 'pub companyCount matches article-facts');
assert(pub.tradingDayCount === facts.tradingDayCount, 'pub tradingDayCount matches article-facts');
assert(pub.imoex.companyCount === facts.imoex.companyCount, 'pub IMOEX companies match');
assert(pub.imoex.securityCount === facts.imoex.securityCount, 'pub IMOEX securities match');
assert(pub.imoex.classifiedCapSharePct === facts.imoex.classifiedCapSharePct, 'pub IMOEX cap share match');
assert(
  pub.imoex.classifiedTurnoverSharePct === facts.imoex.classifiedTurnoverSharePct,
  'pub IMOEX turnover share match'
);
assert(
  pub.concentration.top10MarketCapSharePct === facts.concentration.top10MarketCapSharePct,
  'pub top10 cap match'
);
assert(
  pub.concentration.top10TurnoverSharePct === facts.concentration.top10TurnoverSharePct,
  'pub top10 turnover match'
);
assert(pub.samolet.securityTurnoverRub === facts.samolet.securityTurnoverRub, 'pub SMLT turnover match');
assert(pub.samolet.marketCapRub === facts.samolet.marketCapRub, 'pub SMLT cap match');

const expectedSectors = [
  ['Энергетика', 46.1],
  ['Финансы', 20.9],
  ['Материалы', 17.0],
  ['Потребительский сектор', 4.6],
  ['Информационные технологии', 3.9],
  ['Промышленность', 3.7],
  ['Коммуникационные услуги', 1.8],
  ['Недвижимость', 1.2],
  ['Здравоохранение', 0.8]
];

expectedSectors.forEach(function ([name, displayPct]) {
  const src = sectorFact(name);
  const snap = sectorPub(name);
  const sum = sectorSummaryRow(name);
  assert(src, 'article-facts has sector ' + name);
  assert(snap, 'publication snapshot has sector ' + name);
  assert(sum, 'sector-summary has sector ' + name);
  if (src && snap) {
    assert(snap.marketCapSharePct === src.marketCapSharePct, name + ' cap share copied from article-facts');
    assert(snap.turnoverSharePct === src.turnoverSharePct, name + ' turnover share copied from article-facts');
  }
  if (src && sum) {
    assert(sum.marketCapSharePct === src.marketCapSharePct, name + ' sector-summary cap matches article-facts');
    assert(sum.turnoverSharePct === src.turnoverSharePct, name + ' sector-summary turnover matches article-facts');
  }
  if (src) {
    assert(round1(src.marketCapSharePct) === displayPct, name + ' display pct ' + displayPct);
  }
});
assert(sectorFact('Коммуникационные услуги').marketCapSharePct === 1.8475, 'communications source 1.8475');
assert(round1(sectorFact('Коммуникационные услуги').marketCapSharePct) === 1.8, 'communications arithmetic 1.8');
assert(html.indexOf('1,8%') !== -1, 'communications displayed as 1,8%');
assert(html.indexOf('1,9%') === -1, 'communications not displayed as 1,9%');

assert(round1(facts.imoex.classifiedCapSharePct) === 78.2, 'IMOEX cap 78.2');
assert(round1(facts.imoex.classifiedTurnoverSharePct) === 83.2, 'IMOEX turnover 83.2');
assert(facts.imoex.companyCount === 41, 'IMOEX 41 companies');
assert(round1(facts.concentration.top10MarketCapSharePct) === 63.1, 'top10 cap 63.1');
assert(round1(facts.concentration.top10TurnoverSharePct) === 54.6, 'top10 turnover 54.6');
assert(round1(facts.samolet.securityTurnoverRub / 1e9) === 738.9, 'SMLT turnover 738.9 bn');
assert(round1(facts.samolet.marketCapRub / 1e9) === 15.2, 'SMLT cap ~15.2 bn');

[
  '46,1%',
  '20,9%',
  '17,0%',
  '4,6%',
  '3,9%',
  '3,7%',
  '1,8%',
  '1,2%',
  '0,8%',
  '32,4%',
  '27,0%',
  '9,0%',
  '4,2%',
  '78,2%',
  '83,2%',
  '63,1%',
  '54,6%',
  '738,9',
  '15,2',
  '259',
  '217',
  '41'
].forEach(function (token) {
  assert(html.indexOf(token) !== -1, 'article HTML contains ' + token);
});

assert(html.indexOf('Структура российского рынка по секторам') !== -1, 'chart 1 caption');
assert(html.indexOf('Размер сектора и торговая активность') !== -1, 'chart 2 caption');
assert((html.match(/article-hbar-row/g) || []).length === 9, 'chart 1 has 9 sector bars');
assert((html.match(/article-gbar-row/g) || []).length === 9, 'chart 2 has 9 grouped rows');
assert(html.indexOf('fetch(') === -1 && html.indexOf('iss.moex') === -1, 'article HTML is not live MOEX');

const EXPECTED_SUMMARY = 'Что показывает структура российского рынка акций, если использовать её как точку сравнения для собственного портфеля.';
const summaryMatch = manual.match(/id:\s*'market-sector-proportions-portfolio'[\s\S]{0,500}?summary:\s*'([^']+)'/);
const subtitleMatch = manual.match(/id:\s*'market-sector-proportions-portfolio'[\s\S]{0,500}?subtitle:\s*'([^']+)'/);
assert(summaryMatch && summaryMatch[1] === EXPECTED_SUMMARY, 'article summary matches approved copy');
assert(subtitleMatch && subtitleMatch[1] === EXPECTED_SUMMARY, 'article subtitle matches approved copy');
assert(html.indexOf(EXPECTED_SUMMARY) !== -1, 'article body uses approved summary');
assert(manual.indexOf('Как устроены секторные доли российского рынка') === -1, 'old summary copy removed');
assert(manual.indexOf('не как готовую модель') === -1, 'old “готовую модель” copy removed');

assert(/id:\s*'market-sector-proportions-portfolio'/.test(manual), 'article id in manual-data.js');
assert(
  /id:\s*'market-sector-proportions-portfolio'[\s\S]{0,400}featured:\s*true/.test(manual) === false,
  'new article is not featured'
);
assert(
  /id:\s*'getting-started-investing-strategy'[\s\S]{0,80}featured:\s*true/.test(manual),
  'starter article stays featured'
);

const banned = [
  'рекомендуем',
  'оптимальный портфель',
  'лучший сектор',
  'перспективный сектор'
];
banned.forEach(function (word) {
  assert(html.toLowerCase().indexOf(word) === -1, 'no banned phrase: ' + word);
});
assert(html.indexOf('Это не модель «правильного» портфеля') !== -1, 'allowed negative phrase');
assert(html.split('правильного').length - 1 === 1, 'правильного only once, in the negative phrase');

if (errors.length) {
  console.error('FAIL');
  errors.forEach(function (e) { console.error(' - ' + e); });
  process.exit(1);
}

console.log('PASS');
console.log('analysisDate ' + facts.analysisDate);
console.log('securities ' + facts.securityCount);
console.log('companies ' + facts.universeCompanyCount);
console.log('sectors ' + pub.sectors.length);
