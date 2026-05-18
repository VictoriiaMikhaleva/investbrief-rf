/* storage.js */

  'use strict';

  var KEYS = {
    profile: 'ibrf.profile',
    watchlist: 'ibrf.watchlist',
    settings: 'ibrf.settings',
    alerts: 'ibrf.alerts',
    digest: 'ibrf.digest',
    portfolio: 'ibrf.portfolio',
    filters: 'ibrf.filters',
    lastVisit: 'ibrf.lastVisit',
    marketTiles: 'ibrf.marketTiles',
    tickerNames: 'ibrf.tickerNames',
    consents: 'ibrf.consents'
  };

  var PRIVACY_POLICY_VERSION = '1.0';

  var IMPORTANCE_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
  var THRESHOLD_LABELS = ['Любая', 'Средняя и выше', 'Высокая и выше', 'Только критическая'];
  var TONE_LABELS = {
    positive: 'Хорошие новости',
    negative: 'Тревожные новости',
    neutral: 'Для информации'
  };
  var IMPORTANCE_LABELS = { low: 'Низкая', medium: 'Средняя', high: 'Высокая', critical: 'Критическая' };
  var EVENT_TYPE_LABELS = {
    earnings: 'Отчётность',
    rating: 'Рейтинг и обзоры',
    macro: 'Макро и рынок',
    dividend: 'Дивиденды',
    yield: 'Доходность облигаций'
  };

  var PRESETS = {
    bluechips: ['SBER', 'GAZP', 'LKOH', 'GMKN', 'NVTK', 'ROSN'],
    bonds: ['OFZ_26241', 'OFZ_26238', 'SU26238RMFS2'],
    dividends: ['SBER', 'TATN', 'MTSS', 'MGNT', 'PLZL']
  };

  var DEFAULT_PORTFOLIO = [
    { ticker: 'SBER', qty: 50, avgPrice: 265.5, currentPrice: 278.2, buyDate: '2024-09-12', comment: 'Дивидендная позиция' },
    { ticker: 'LKOH', qty: 10, avgPrice: 7120, currentPrice: 6985, buyDate: '2025-01-20', comment: '' },
    { ticker: 'GAZP', qty: 200, avgPrice: 162.3, currentPrice: 158.9, buyDate: '2024-11-05', comment: 'Нефтегаз' },
    { ticker: 'OFZ_26241', qty: 30, avgPrice: 92.1, currentPrice: 93.4, buyDate: '2025-03-01', comment: 'ОФЗ в ядре' }
  ];

  var MACRO_KEY_RATE_LABEL = '21,00%';

  var DEFAULT_MARKET_TICKERS = ['IMOEX', 'SBER', 'GAZP', 'LKOH', 'GMKN', 'TATN', 'NVTK'];

  var TICKER_SUBTITLES = {
    IMOEX: 'Индекс МосБиржи',
    MOEX: 'МосБиржа',
    SBER: 'Сбербанк',
    GAZP: 'Газпром',
    LKOH: 'ЛУКОЙЛ',
    GMKN: 'Норникель',
    TATN: 'Татнефть',
    NVTK: 'Новатэк',
    ROSN: 'Роснефть',
    MTSS: 'МТС',
    MGNT: 'Магнит',
    PLZL: 'Полюс',
    YNDX: 'Яндекс',
    VTBR: 'ВТБ',
    NLMK: 'НЛМК',
    CHMF: 'Северсталь',
    ALRS: 'АЛРОСА',
    OFZ_26241: 'ОФЗ 26241',
    OFZ_26238: 'ОФЗ 26238'
  };



  function getTickerNamesMap() {
    var map = loadJSON(KEYS.tickerNames, {});
    return map && typeof map === 'object' ? map : {};
  }



  function saveTickerName(ticker, name) {
    ticker = normalizeTicker(ticker);
    name = String(name || '').trim();
    if (!ticker || !name || normalizeTicker(name) === ticker || name === ticker) return;
    var map = getTickerNamesMap();
    if (map[ticker] === name) return;
    map[ticker] = name;
    saveJSON(KEYS.tickerNames, map);
  }



  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }



  function saveJSON(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }



  function getWatchlist() {
    return loadJSON(KEYS.watchlist, []);
  }



  function setWatchlist(list) {
    saveJSON(KEYS.watchlist, list);
    renderWatchlist();
    if (typeof renderHomePage === 'function') renderHomePage();
    else if (typeof renderBriefing === 'function') renderBriefing();
    renderFeed();
    updateStats();
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function normalizePosition(raw) {
    if (!raw || !raw.ticker) return null;
    var t = normalizeTicker(raw.ticker);
    if (!t) return null;
    var qty = parseFloat(raw.qty);
    if (!isFinite(qty) || qty < 0) qty = raw.qty === 0 ? 0 : null;
    var avg = parseFloat(raw.avgPrice);
    if (!isFinite(avg)) avg = null;
    var cur = parseFloat(raw.currentPrice);
    if (!isFinite(cur)) cur = avg;
    return {
      ticker: t,
      qty: qty,
      avgPrice: avg,
      currentPrice: cur,
      buyDate: raw.buyDate ? String(raw.buyDate).slice(0, 10) : '',
      comment: String(raw.comment || '').trim()
    };
  }



  function getProfile() {
    return loadJSON(KEYS.profile, { id: '', name: '' });
  }



  function setProfile(p) {
    saveJSON(KEYS.profile, p);
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function getSettings() {
    var s = loadJSON(KEYS.settings, {});
    var briefFormat = s.briefFormat || s.essayStyle || 'concise';
    var briefingScope = s.briefingScope || 'market';
    return {
      briefFormat: briefFormat,
      briefingScope: briefingScope,
      essayStyle: briefFormat,
      riskProfile: s.riskProfile || 'balanced'
    };
  }



  function setSettings(s) {
    saveJSON(KEYS.settings, s);
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function getAlerts() {
    return loadJSON(KEYS.alerts, { threshold: 2, channels: ['push'], rules: [] });
  }



  function setAlerts(a) {
    saveJSON(KEYS.alerts, a);
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function normalizeDigest(d) {
    d = d && typeof d === 'object' ? d : {};
    return {
      email: String(d.email || '').trim(),
      time: d.time || '08:00',
      emailConsent: !!d.emailConsent
    };
  }



  function getDigest() {
    return normalizeDigest(loadJSON(KEYS.digest, null));
  }



  function setDigest(d) {
    saveJSON(KEYS.digest, normalizeDigest(Object.assign({}, getDigest(), d || {})));
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function getConsents() {
    var c = loadJSON(KEYS.consents, null);
    if (!c || typeof c !== 'object') {
      return {
        privacyAccepted: false,
        privacyAcceptedAt: null,
        privacyPolicyVersion: null,
        digestEmail: false
      };
    }
    return {
      privacyAccepted: !!c.privacyAccepted,
      privacyAcceptedAt: c.privacyAcceptedAt || null,
      privacyPolicyVersion: c.privacyPolicyVersion || null,
      digestEmail: !!c.digestEmail
    };
  }



  function setConsents(c) {
    var cur = getConsents();
    saveJSON(KEYS.consents, {
      privacyAccepted: c.privacyAccepted != null ? !!c.privacyAccepted : cur.privacyAccepted,
      privacyAcceptedAt: c.privacyAcceptedAt != null ? c.privacyAcceptedAt : cur.privacyAcceptedAt,
      privacyPolicyVersion: c.privacyPolicyVersion != null ? c.privacyPolicyVersion : cur.privacyPolicyVersion,
      digestEmail: c.digestEmail != null ? !!c.digestEmail : cur.digestEmail
    });
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function getPortfolio() {
    var p = loadJSON(KEYS.portfolio, null);
    if (!p || !Array.isArray(p.positions)) {
      return { positions: [] };
    }
    p.positions = p.positions.map(normalizePosition).filter(Boolean);
    return p;
  }



  function setPortfolio(p) {
    saveJSON(KEYS.portfolio, p);
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function getFilters() {
    return loadJSON(KEYS.filters, {
      type: '', asset: '', eventType: '', tone: '', importance: '',
      sort: 'date-desc', search: '', onlyWatchlist: false
    });
  }



  function setFilters(f) {
    saveJSON(KEYS.filters, f);
  }



  function getLastVisit() {
    var v = localStorage.getItem(KEYS.lastVisit);
    return v ? parseInt(v, 10) : 0;
  }



  function setLastVisit(ts) {
    localStorage.setItem(KEYS.lastVisit, String(ts));
  }



  function exportAll() {
    var data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profile: getProfile(),
      watchlist: getWatchlist(),
      settings: getSettings(),
      alerts: getAlerts(),
      digest: getDigest(),
      consents: getConsents(),
      portfolio: getPortfolio(),
      filters: getFilters(),
      marketTiles: getMarketTickers(),
      tickerNames: getTickerNamesMap()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'investbrief-rf-nastroyki.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Настройки сохранены в файл');
  }



  function importAll(jsonStr) {
    var data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      showToast('Не удалось прочитать файл');
      return;
    }
    if (!data || data.version !== '1.0.0') {
      showToast('Не удалось загрузить: файл не подходит');
      return;
    }
    if (data.profile) saveJSON(KEYS.profile, data.profile);
    if (data.watchlist) saveJSON(KEYS.watchlist, data.watchlist);
    if (data.settings) saveJSON(KEYS.settings, data.settings);
    if (data.alerts) saveJSON(KEYS.alerts, data.alerts);
    if (data.digest) saveJSON(KEYS.digest, normalizeDigest(data.digest));
    if (data.consents) saveJSON(KEYS.consents, data.consents);
    if (data.portfolio) saveJSON(KEYS.portfolio, data.portfolio);
    if (data.filters) saveJSON(KEYS.filters, data.filters);
    if (data.marketTiles) saveJSON(KEYS.marketTiles, data.marketTiles);
    if (data.tickerNames) saveJSON(KEYS.tickerNames, data.tickerNames);
    loadProfileToUI();
    loadFiltersToUI();
    renderWatchlist();
    if (typeof renderHomePage === 'function') renderHomePage();
    else if (typeof renderBriefing === 'function') renderBriefing();
    renderMarketTiles();
    renderFeed();
    renderPortfolio();
    renderAlerts();
    updateStats();
    showToast('Настройки загружены');
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }


