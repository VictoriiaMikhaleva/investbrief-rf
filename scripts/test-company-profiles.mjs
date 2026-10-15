/**
 * Regression: company profiles catalog + lookup.
 * Run: npm run test:company-profiles
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

function extractQuotedTickers(block) {
  return (String(block || '').match(/'([A-Z0-9_]+)'/g) || []).map((s) => s.slice(1, -1));
}

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'company-profiles.json'), 'utf8')
);
const CompanyProfiles = require('../company-profiles.js');
const Core = require('../analytics-core.js');

CompanyProfiles.resetCompanyProfilesLoadState();
const parsed = CompanyProfiles.parseCompanyProfilesCatalog(catalog);
CompanyProfiles.setCompanyProfilesCatalog(catalog);

const CANONICAL_SECTORS = [
  'Финансы',
  'Энергетика',
  'Материалы',
  'Потребительский сектор',
  'Информационные технологии',
  'Коммуникационные услуги',
  'Промышленность',
  'Недвижимость',
  'Здравоохранение'
];
const BANNED_SECTOR_ALIASES = ['Телекоммуникации', 'Коммуникации', 'IT', 'Нефтегаз'];
const PROMO_COPY = /отличн|лидер для|перспективн|стоит обратить|надёжн(?:ый|ого) эмитент|крупнейш/i;

assert(catalog.version === 1, 'catalog version 1');
assert(Array.isArray(catalog.companies) && catalog.companies.length >= 20, 'catalog has companies');
assert(parsed.errors.length === 0, 'parse errors: ' + parsed.errors.join('; '));
assert(parsed.companies.length === catalog.companies.length, 'parsed company count');
assert(
  JSON.stringify(catalog.sectors) === JSON.stringify(CANONICAL_SECTORS),
  'catalog.sectors is canonical whitelist'
);
assert(
  JSON.stringify(CompanyProfiles.getCanonicalSectors()) === JSON.stringify(CANONICAL_SECTORS),
  'parser exposes canonical sectors'
);
BANNED_SECTOR_ALIASES.forEach((alias) => {
  assert(CANONICAL_SECTORS.indexOf(alias) < 0, 'banned sector alias not canonical: ' + alias);
});

{
  const ids = new Set();
  catalog.companies.forEach((c) => {
    assert(c.companyId && !ids.has(c.companyId), 'unique companyId ' + c.companyId);
    ids.add(c.companyId);
    ['fullName', 'sector', 'industry', 'description'].forEach((field) => {
      assert(String(c[field] || '').trim(), c.companyId + ' has ' + field);
    });
    assert(Array.isArray(c.tickers) && c.tickers.length > 0, c.companyId + ' has tickers');
    assert(CANONICAL_SECTORS.indexOf(c.sector) >= 0, c.companyId + ' sector canonical');
    assert(String(c.industry || '').trim(), c.companyId + ' industry non-empty');
    assert(Array.isArray(c.sources) && c.sources.some((s) => s && s.url), c.companyId + ' has source url');
    if (String(c.historyNote || '').trim()) {
      assert(c.sources.length > 0, c.companyId + ' historyNote has sources');
    }
    assert(!PROMO_COPY.test(c.description || ''), c.companyId + ' description is not a recommendation');
    const map = CompanyProfiles.getTickerSectorIndustry(c.tickers[0]);
    assert(map && map.companyId === c.companyId && map.sector === c.sector && map.industry === c.industry,
      c.companyId + ' ticker→sector→industry contract');
  });
}

{
  const typo = JSON.parse(JSON.stringify(catalog));
  typo.companies = typo.companies.map((c, i) => i === 0 ? Object.assign({}, c, { sector: 'Коммуникации' }) : c);
  const bad = CompanyProfiles.parseCompanyProfilesCatalog(typo);
  assert(bad.errors.some((e) => /unknown sector/.test(e)), 'sector typo/variant fails parse');
}

{
  const seen = new Set();
  catalog.companies.forEach((c) => {
    c.tickers.forEach((t) => {
      const ticker = String(t).toUpperCase();
      assert(!seen.has(ticker), 'no duplicate ticker mapping ' + ticker);
      seen.add(ticker);
    });
  });
  (catalog.nonCompanyInstruments || []).forEach((item) => {
    const ticker = String(item.ticker || '').toUpperCase();
    assert(ticker && !seen.has(ticker), 'non-company ticker not overlapping companies: ' + ticker);
    seen.add(ticker);
  });
}

assert(CompanyProfiles.getCompanyIdForTicker('SBER') === 'sber', 'SBER → sber');
assert(CompanyProfiles.getCompanyIdForTicker('sberp') === 'sber', 'SBERP → sber');
assert(
  CompanyProfiles.getCompanyProfile('SBER').fullName === CompanyProfiles.getCompanyProfile('SBERP').fullName,
  'SBER/SBERP share one profile'
);
assert(CompanyProfiles.getCompanyIdForTicker('TATN') === CompanyProfiles.getCompanyIdForTicker('TATNP'), 'TATN/TATNP same company');
assert(CompanyProfiles.getCompanyIdForTicker('SNGS') === CompanyProfiles.getCompanyIdForTicker('SNGSP'), 'SNGS/SNGSP same company');
assert(CompanyProfiles.getCompanyIdForTicker('T') === CompanyProfiles.getCompanyIdForTicker('TCSG'), 'T/TCSG same company');

assert(CompanyProfiles.getCompanyProfile('XXXXZZ') == null, 'missing profile is null');
assert(CompanyProfiles.isNonCompanyInstrument('AKMM'), 'AKMM is non-company');
assert(CompanyProfiles.isNonCompanyInstrument('LQDT'), 'LQDT is non-company');
assert(CompanyProfiles.isNonCompanyInstrument('SBFR'), 'SBFR is non-company');
assert(CompanyProfiles.isNonCompanyInstrument('SBMM'), 'SBMM is non-company');
assert(CompanyProfiles.isNonCompanyInstrument('SAFE'), 'SAFE is non-company BPIF');
assert(!CompanyProfiles.isNonCompanyInstrument('SBER'), 'SBER is a company');
assert(CompanyProfiles.getCompanyProfile('AKMM') == null, 'ETF has no company profile');
assert(CompanyProfiles.getCompanyProfile('SAFE') == null, 'SAFE has no company profile');
assert(CompanyProfiles.getCompanyIdForTicker('FLOT') === 'sovcomflot', 'FLOT → sovcomflot');
assert(CompanyProfiles.getCompanyIdForTicker('MAGN') === 'mmk', 'MAGN → mmk');
assert(CompanyProfiles.getCompanyIdForTicker('MGNT') === 'magnit', 'MGNT → magnit');
assert(
  CompanyProfiles.getCompanyIdForTicker('MAGN') !== CompanyProfiles.getCompanyIdForTicker('MGNT'),
  'MAGN (MMK) is not MGNT (Magnit)'
);
assert(!CompanyProfiles.isNonCompanyInstrument('FLOT'), 'FLOT is a company');
assert(!CompanyProfiles.isNonCompanyInstrument('MAGN'), 'MAGN is a company');

{
  const agentSrc = fs.readFileSync(path.join(ROOT, 'agent.js'), 'utf8');
  const moexSrc = fs.readFileSync(path.join(ROOT, 'moex.js'), 'utf8');
  const updateSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'update-market-data.js'), 'utf8');
  assert(/useTopTurnoverByDefault/.test(agentSrc), 'agent default mode is top turnover');
  assert(/fetchTopMoexSharesByVolume\(limit/.test(agentSrc), 'live agent list comes from top-20 helper');
  assert(/boards\/TQBR\/securities\.json/.test(moexSrc) && /sort_column=VALTODAY/.test(moexSrc),
    'canonical live source is MOEX TQBR VALTODAY');
  assert(/top-turnover\.json/.test(moexSrc) && /agent-signals\.json/.test(agentSrc),
    'repo snapshots back the live top-20');
  assert(/fetchAgentSignalsData/.test(updateSrc) && /fetchTopTurnoverData/.test(updateSrc),
    'snapshot refresh writes agent-signals from top turnover');

  const defMatch = agentSrc.match(/var DEFAULT_AGENT_TICKERS = \[([\s\S]*?)\];/);
  assert(!!defMatch, 'DEFAULT_AGENT_TICKERS found');
  const defaultTickers = extractQuotedTickers(defMatch && defMatch[1]);
  const signals = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'agent-signals.json'), 'utf8'));
  const top = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'top-turnover.json'), 'utf8'));
  const signalTickers = ((signals.data && signals.data.tickers) || []).map((t) => String(t).toUpperCase());
  const topTickers = ((top.data && top.data.top) || []).map((r) => String(r.ticker || '').toUpperCase()).filter(Boolean);
  const canonicalRepoUniverse = Array.from(new Set(defaultTickers.concat(signalTickers, topTickers)));
  canonicalRepoUniverse.forEach((ticker) => {
    assert(
      CompanyProfiles.isCoveredAgentInstrument(ticker),
      'repo Agent snapshot ticker covered: ' + ticker
    );
  });
  assert(canonicalRepoUniverse.length >= 20, 'canonical repo Agent universe size ' + canonicalRepoUniverse.length);
  assert(
    /addAgentTicker/.test(agentSrc) && /resolveAgentTickerFromInput/.test(agentSrc),
    'user may add extra TQBR tickers outside snapshots'
  );
}

{
  const before = Core.dividendReportingYear('2024-07-18');
  const afterLoad = CompanyProfiles.parseCompanyProfilesCatalog(catalog);
  const after = Core.dividendReportingYear('2024-07-18');
  assert(before === '2023' && after === '2023', 'dividendReportingYear unchanged');
  assert(afterLoad.companies.length > 0, 'catalog parse still works');
  const coreSrc = fs.readFileSync(path.join(ROOT, 'analytics-core.js'), 'utf8');
  const analyticsSrc = fs.readFileSync(path.join(ROOT, 'analytics.js'), 'utf8');
  assert(!/company-profiles|getCompanyProfile|CompanyProfiles/.test(coreSrc), 'analytics-core does not read company profiles');
  assert(!/company-profiles|getCompanyProfile|CompanyProfiles/.test(analyticsSrc), 'analytics.js does not read company profiles');
}

{
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8');
  assert(/function renderCompanyAbout/.test(uiSrc), 'ui has renderCompanyAbout');
  assert(/ensureCompanyAbout\(ticker\)/.test(uiSrc), 'analytics detail calls ensureCompanyAbout');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(/id="analyticsCompanyAbout"/.test(html), 'HTML has company about mount');
  assert(/company-profiles\.js/.test(html), 'HTML loads company-profiles.js');
}

{
  const fakeEl = { hidden: true, innerHTML: 'keep', attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; }, getAttribute: function (k) { return this.attrs[k]; } };
  const sandbox = {
    window: {},
    console,
    document: {
      getElementById: function (id) { return id === 'analyticsCompanyAbout' ? fakeEl : null; }
    },
    normalizeTicker: (t) => String(t || '').trim().toUpperCase(),
    escapeHtml: (s) => String(s || ''),
    getCompanyProfile: CompanyProfiles.getCompanyProfile,
    isNonCompanyInstrument: CompanyProfiles.isNonCompanyInstrument,
    isIndexQuoteTicker: () => false,
    isRuBondTicker: (t) => String(t).indexOf('OFZ') === 0,
    Markets: { isUsTicker: () => false },
    loadCompanyProfiles: () => Promise.resolve(CompanyProfiles.getCompanyProfilesSync())
  };
  sandbox.window = sandbox;
  const uiCode = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8');
  const start = uiCode.indexOf('function hideCompanyAboutBlock');
  const end = uiCode.indexOf('function renderAnalyticsDetail');
  assert(start >= 0 && end > start, 'extract company-about helpers from ui.js');
  vm.runInNewContext(uiCode.slice(start, end), sandbox, { timeout: 1000 });
  sandbox.renderCompanyAbout('XXXXZZ');
  assert(fakeEl.hidden === true && fakeEl.innerHTML === '', 'missing profile hides block');
  sandbox.renderCompanyAbout('AKMM');
  assert(fakeEl.hidden === true, 'ETF hides company block');
  sandbox.renderCompanyAbout('SAFE');
  assert(fakeEl.hidden === true, 'SAFE BPIF hides company block');
  sandbox.renderCompanyAbout('FLOT');
  assert(fakeEl.hidden === false, 'FLOT shows company block');
  assert(/Современный коммерческий флот/.test(fakeEl.innerHTML), 'FLOT shows official name');
  assert(/Промышленность · Морские перевозки/.test(fakeEl.innerHTML), 'FLOT shows sector · industry');
  sandbox.renderCompanyAbout('MAGN');
  assert(fakeEl.hidden === false, 'MAGN shows company block');
  assert(/Магнитогорский металлургический комбинат/.test(fakeEl.innerHTML), 'MAGN shows MMK name');
  assert(/Материалы · Чёрная металлургия/.test(fakeEl.innerHTML), 'MAGN shows sector · industry');
  sandbox.renderCompanyAbout('OFZ_26241');
  assert(fakeEl.hidden === true, 'OFZ hides company block');
  sandbox.renderCompanyAbout('SBER');
  assert(fakeEl.hidden === false, 'SBER shows company block');
  assert(/Сбербанк/.test(fakeEl.innerHTML), 'SBER shows official name');
  assert(/Финансы · Банки/.test(fakeEl.innerHTML), 'SBER shows sector · industry');
  assert(!/undefined/.test(fakeEl.innerHTML) && !/>—</.test(fakeEl.innerHTML), 'no empty placeholders');
  sandbox.renderCompanyAbout('SBERP');
  assert(/Сбербанк/.test(fakeEl.innerHTML), 'SBERP uses same Sber profile');

  let resolveLate;
  let loadCalls = 0;
  sandbox.loadCompanyProfiles = function () {
    loadCalls += 1;
    if (loadCalls === 1) {
      return new Promise(function (resolve) { resolveLate = resolve; });
    }
    return Promise.resolve();
  };
  sandbox.ensureCompanyAbout('SBER');
  sandbox.ensureCompanyAbout('T');
  assert(fakeEl.attrs['data-ticker'] === 'T', 'switch to T before late SBER load');
  resolveLate();
  await Promise.resolve();
  assert(fakeEl.attrs['data-ticker'] === 'T', 'late SBER load does not restore old profile');
  assert(/Т-Технологии/.test(fakeEl.innerHTML), 'visible profile stays T after race');
}

{
  let fetches = 0;
  CompanyProfiles.resetCompanyProfilesLoadState();
  const fakeFetch = function () {
    fetches += 1;
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(catalog); } });
  };
  await CompanyProfiles.loadCompanyProfiles({ fetch: fakeFetch });
  await CompanyProfiles.loadCompanyProfiles({ fetch: fakeFetch });
  assert(fetches === 1, 'company-profiles.json fetched once and cached');
  assert(CompanyProfiles.getCompanyProfile('SBER'), 'cached catalog usable after first load');
}

const failedLoad = await CompanyProfiles.loadCompanyProfiles({
  force: true,
  fetch: function () {
    return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } });
  }
});
assert(failedLoad && Array.isArray(failedLoad.companies), 'failed fetch still returns catalog object');

CompanyProfiles.setCompanyProfilesCatalog(catalog);
assert(CompanyProfiles.getCompanyProfile('GAZP'), 'catalog restored after failed fetch');

if (errors.length) {
  console.error('FAIL');
  errors.forEach((e) => console.error(' •', e));
  process.exit(1);
}
console.log(
  'OK  company-profiles',
  parsed.companies.length + ' companies,',
  Object.keys(parsed.byTicker).length + ' tickers,',
  Object.keys(parsed.nonCompany).length + ' non-company'
);
