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
    consents: 'ibrf.consents',
    agentSettings: 'ibrf.agentSettings',
    agentSignalHistory: 'ibrf.agentSignalHistory'
  };

  var DEFAULT_AGENT_SETTINGS = {
    enabled: true,
    tickers: [],
    useTopTurnoverByDefault: true,
    sensitivityMode: 'normal',
    dayMoveThreshold: 3,
    weekDownThreshold: 7,
    weekUpThreshold: 8,
    turnoverMultiplier: 1.5,
    notifyAttention: false
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
    bonds: ['OFZ_26241', 'OFZ_26238', 'OFZ_26243'],
    dividends: ['SBER', 'TATN', 'MTSS', 'MGNT', 'PLZL']
  };

  var DEFAULT_PORTFOLIO = [
    { ticker: 'SBER', qty: 50, avgPrice: 265.5, currentPrice: 278.2, buyDate: '2024-09-12', comment: 'Дивидендная позиция' },
    { ticker: 'LKOH', qty: 10, avgPrice: 7120, currentPrice: 6985, buyDate: '2025-01-20', comment: '' },
    { ticker: 'GAZP', qty: 200, avgPrice: 162.3, currentPrice: 158.9, buyDate: '2024-11-05', comment: 'Нефтегаз' },
    { ticker: 'OFZ_26241', qty: 30, avgPrice: 92.1, currentPrice: 93.4, buyDate: '2025-03-01', comment: 'ОФЗ в ядре' }
  ];

  var MACRO_KEY_RATE_LABEL = '…';

  var DEFAULT_MARKET_TICKERS = ['IMOEX'];
  var BRIEFING_QUOTE_TICKERS = ['IMOEX'];

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
    OFZ_26238: 'ОФЗ 26238',
    OFZ_26243: 'ОФЗ 26243',
    OZPH: 'Озон Фармацевтика',
    YDEX: 'Яндекс',
    SNGS: 'Сургутнефтегаз',
    SNGSP: 'Сургутнефтегаз-п',
    AFLT: 'Аэрофлот',
    SVCB: 'Совкомбанк'
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



  function isQuotaError(err) {
    if (!err) return false;
    return err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014;
  }

  function freeStorageSpace(preserveKey) {
    preserveKey = preserveKey || '';
    [KEYS.agentSignalHistory, 'ibrf.liveBriefs'].forEach(function (k) {
      if (k !== preserveKey) {
        try { localStorage.removeItem(k); } catch (e) { /* noop */ }
      }
    });
    var drop = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k === preserveKey) continue;
      if (k.indexOf('ibrf.moex.') === 0 || k.indexOf('ibrf.analytics') === 0 || k.indexOf('ofz.catalog') === 0) {
        drop.push(k);
      }
    }
    drop.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* noop */ }
    });
  }

  function saveJSON(key, data) {
    var payload = JSON.stringify(data);
    try {
      localStorage.setItem(key, payload);
      return true;
    } catch (e) {
      if (!isQuotaError(e)) throw e;
      freeStorageSpace(key);
      try {
        localStorage.setItem(key, payload);
        return true;
      } catch (e2) {
        if (!isQuotaError(e2)) throw e2;
        return false;
      }
    }
  }



  function getWatchlist() {
    var raw = loadJSON(KEYS.watchlist, []);
    return typeof Markets !== 'undefined' ? Markets.normalizeWatchlist(raw) : raw;
  }



  function setWatchlist(list) {
    if (typeof Markets !== 'undefined') list = Markets.normalizeWatchlist(list);
    saveJSON(KEYS.watchlist, list);
    renderWatchlist();
    if (typeof renderHomePage === 'function') renderHomePage();
    else if (typeof renderBriefing === 'function') renderBriefing();
    renderFeed();
    updateStats();
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }



  function newPortfolioLotId(ticker) {
    var t = normalizeTicker(ticker) || 'LOT';
    return t + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }



  function newPortfolioSaleId(ticker) {
    var t = normalizeTicker(ticker) || 'SALE';
    return 'SALE_' + t + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }



  function normalizeSale(raw) {
    if (!raw || !raw.ticker) return null;
    var t = normalizeTicker(raw.ticker);
    if (!t) return null;
    var qty = parseFloat(raw.qty);
    if (!isFinite(qty) || qty <= 0) return null;
    var buyPrice = parseFloat(raw.buyPrice);
    if (!isFinite(buyPrice)) buyPrice = null;
    var salePrice = parseFloat(raw.salePrice);
    if (!isFinite(salePrice) || salePrice <= 0) return null;
    var mk = typeof Markets !== 'undefined'
      ? Markets.normalizePositionMarket(raw, t)
      : { market: 'RU', currency: 'RUB' };
    var allocations = [];
    if (Array.isArray(raw.allocations)) {
      raw.allocations.forEach(function (a) {
        if (!a) return;
        var aq = parseFloat(a.qty);
        if (!isFinite(aq) || aq <= 0) return;
        var ab = parseFloat(a.buyPrice);
        allocations.push({
          lotId: a.lotId ? String(a.lotId) : '',
          qty: aq,
          buyPrice: isFinite(ab) ? ab : null,
          buyDate: a.buyDate ? String(a.buyDate).slice(0, 10) : ''
        });
      });
    }
    var out = {
      saleId: raw.saleId ? String(raw.saleId) : newPortfolioSaleId(t),
      lotId: raw.lotId ? String(raw.lotId) : '',
      ticker: t,
      qty: qty,
      buyPrice: buyPrice,
      buyDate: raw.buyDate ? String(raw.buyDate).slice(0, 10) : '',
      salePrice: salePrice,
      saleDate: raw.saleDate ? String(raw.saleDate).slice(0, 10) : '',
      comment: String(raw.comment || '').trim(),
      market: mk.market,
      currency: mk.currency
    };
    if (allocations.length) out.allocations = allocations;
    return out;
  }



  function normalizePosition(raw) {
    if (!raw || !raw.ticker) return null;
    var t = normalizeTicker(raw.ticker);
    if (!t) return null;
    var qty = parseFloat(raw.qty);
    if (!isFinite(qty) || qty < 0) qty = raw.qty === 0 ? 0 : null;
    var avg = parseFloat(raw.avgPrice);
    if (!isFinite(avg)) avg = null;
    var mk = typeof Markets !== 'undefined'
      ? Markets.normalizePositionMarket(raw, t)
      : { market: 'RU', currency: 'RUB' };
    var cur = parseFloat(raw.currentPrice);
    if (mk.market === 'US') {
      cur = isFinite(cur) ? cur : null;
    } else if (!isFinite(cur)) {
      cur = avg;
    }
    var out = {
      lotId: raw.lotId ? String(raw.lotId) : newPortfolioLotId(t),
      ticker: t,
      qty: qty,
      avgPrice: avg,
      currentPrice: cur,
      buyDate: raw.buyDate ? String(raw.buyDate).slice(0, 10) : '',
      comment: String(raw.comment || '').trim(),
      market: mk.market,
      currency: mk.currency
    };
    var dayChg = parseFloat(raw.dayChangePct);
    if (isFinite(dayChg)) out.dayChangePct = dayChg;
    return out;
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
    var markets = typeof Markets !== 'undefined'
      ? Markets.normalizeMarketsSettings(s)
      : { ru: true, us: false };
    return {
      briefFormat: briefFormat,
      briefingScope: briefingScope,
      essayStyle: briefFormat,
      riskProfile: s.riskProfile || 'balanced',
      markets: markets,
      baseCurrency: s.baseCurrency === 'USD' ? 'USD' : 'RUB'
    };
  }



  function setSettings(s) {
    var cur = getSettings();
    var next = Object.assign({}, cur, s || {});
    if (s && s.markets) {
      next.markets = typeof Markets !== 'undefined'
        ? Markets.normalizeMarketsSettings({ markets: s.markets })
        : s.markets;
    }
    saveJSON(KEYS.settings, next);
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



  function parseAgentEnabledFlag(v) {
    if (v === false || v === 0 || v === 'false' || v === '0') return false;
    if (v === true || v === 1 || v === 'true' || v === '1') return true;
    return true;
  }

  function parseAgentBool(v, defaultVal) {
    if (v === true || v === 1 || v === 'true' || v === '1') return true;
    if (v === false || v === 0 || v === 'false' || v === '0') return false;
    return defaultVal === undefined ? false : !!defaultVal;
  }

  function normalizeAgentSettings(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var tickers = Array.isArray(s.tickers) ? s.tickers.map(normalizeTicker).filter(Boolean) : [];
    var useTop = s.useTopTurnoverByDefault;
    if (!tickers.length) useTop = true;
    else if (useTop == null) useTop = false;
    var mode = s.sensitivityMode;
    if (['calm', 'normal', 'sensitive', 'custom'].indexOf(mode) < 0) mode = 'normal';
    var updatedAt = typeof s.updatedAt === 'string' && s.updatedAt ? s.updatedAt : null;
    return {
      enabled: parseAgentEnabledFlag(s.enabled),
      tickers: tickers,
      useTopTurnoverByDefault: !!useTop,
      sensitivityMode: mode,
      dayMoveThreshold: isFinite(Number(s.dayMoveThreshold)) ? Number(s.dayMoveThreshold) : DEFAULT_AGENT_SETTINGS.dayMoveThreshold,
      weekDownThreshold: isFinite(Number(s.weekDownThreshold)) ? Number(s.weekDownThreshold) : DEFAULT_AGENT_SETTINGS.weekDownThreshold,
      weekUpThreshold: isFinite(Number(s.weekUpThreshold)) ? Number(s.weekUpThreshold) : DEFAULT_AGENT_SETTINGS.weekUpThreshold,
      turnoverMultiplier: isFinite(Number(s.turnoverMultiplier)) ? Number(s.turnoverMultiplier) : DEFAULT_AGENT_SETTINGS.turnoverMultiplier,
      notifyAttention: parseAgentBool(s.notifyAttention, false),
      updatedAt: updatedAt
    };
  }

  function getAgentSettings() {
    return normalizeAgentSettings(loadJSON(KEYS.agentSettings, null));
  }

  function agentSettingsUpdatedAtMs(settings) {
    if (!settings || !settings.updatedAt) return 0;
    var t = Date.parse(settings.updatedAt);
    return isFinite(t) ? t : 0;
  }

  function mergeAgentSettings(local, cloud) {
    local = normalizeAgentSettings(local || {});
    cloud = normalizeAgentSettings(cloud || {});
    var localT = agentSettingsUpdatedAtMs(local);
    var cloudT = agentSettingsUpdatedAtMs(cloud);
    if (cloudT > localT) return cloud;
    if (localT > cloudT) return local;
    return normalizeAgentSettings(Object.assign({}, cloud, local, {
      updatedAt: local.updatedAt || cloud.updatedAt || null
    }));
  }

  function setAgentSettings(s) {
    var next = normalizeAgentSettings(Object.assign({}, getAgentSettings(), s || {}, {
      updatedAt: new Date().toISOString()
    }));
    saveJSON(KEYS.agentSettings, next);
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
    return next;
  }

  function getAgentSignalHistory() {
    return getAgentActionLog();
  }

  function normalizeAgentLogEntry(raw) {
    if (!raw || !raw.ticker) return null;
    var action = raw.action && ['buy', 'sell', 'skip', 'watch', 'hold'].indexOf(raw.action) >= 0 ? raw.action : null;
    return {
      id: String(raw.id || normalizeTicker(raw.ticker) + '-' + Date.now()),
      type: raw.type === 'action' || action ? 'action' : 'signal',
      action: action,
      ticker: normalizeTicker(raw.ticker),
      signalId: String(raw.signalId || ''),
      title: String(raw.title || ''),
      status: String(raw.status || ''),
      price: raw.price != null && isFinite(Number(raw.price)) ? Number(raw.price) : null,
      createdAt: raw.createdAt || new Date().toISOString(),
      note: String(raw.note || '')
    };
  }

  var AGENT_LOG_MAX = 80;

  function getAgentActionLog() {
    var list = loadJSON(KEYS.agentSignalHistory, []);
    if (!Array.isArray(list)) return [];
    return list.map(normalizeAgentLogEntry).filter(Boolean);
  }

  function setAgentActionLog(list) {
    var normalized = (Array.isArray(list) ? list : []).map(normalizeAgentLogEntry).filter(Boolean).slice(0, AGENT_LOG_MAX);
    try {
      saveJSON(KEYS.agentSignalHistory, normalized);
    } catch (e) {
      try {
        // Если localStorage переполнен, сохраняем короткий "хвост" журнала.
        saveJSON(KEYS.agentSignalHistory, normalized.slice(0, 25));
      } catch (e2) {
        try { localStorage.removeItem(KEYS.agentSignalHistory); } catch (e3) { /* noop */ }
      }
    }
    if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
  }

  function setAgentSignalHistory(list) {
    setAgentActionLog(list);
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
      return { positions: [], sales: [] };
    }
    var needsPersist = false;
    p.positions = p.positions.map(function (raw) {
      if (raw && !raw.lotId) needsPersist = true;
      return normalizePosition(raw);
    }).filter(Boolean);
    p.sales = (p.sales || []).map(normalizeSale).filter(Boolean);
    if (needsPersist) {
      saveJSON(KEYS.portfolio, p);
    }
    return p;
  }



  function setPortfolio(p) {
    if (p && Array.isArray(p.positions)) {
      p.positions = p.positions.map(normalizePosition).filter(Boolean);
    }
    if (p) {
      p.sales = (p.sales || []).map(normalizeSale).filter(Boolean);
    }
    if (!saveJSON(KEYS.portfolio, p)) {
      var err = new Error('storage_quota');
      err.code = 'storage_quota';
      throw err;
    }
    try {
      if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
    } catch (e) { /* не блокируем сохранение портфеля */ }
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
      tickerNames: getTickerNamesMap(),
      agentSettings: getAgentSettings(),
      agentActionLog: getAgentActionLog()
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
    if (data.watchlist) {
      var wl = data.watchlist;
      if (typeof Markets !== 'undefined') wl = Markets.normalizeWatchlist(wl);
      saveJSON(KEYS.watchlist, wl);
    }
    if (data.settings) {
      var imported = data.settings;
      if (typeof Markets !== 'undefined') {
        imported = Object.assign({}, imported, {
          markets: Markets.normalizeMarketsSettings(imported),
          baseCurrency: imported.baseCurrency === 'USD' ? 'USD' : 'RUB'
        });
      }
      saveJSON(KEYS.settings, imported);
    }
    if (data.alerts) saveJSON(KEYS.alerts, data.alerts);
    if (data.digest) saveJSON(KEYS.digest, normalizeDigest(data.digest));
    if (data.consents) saveJSON(KEYS.consents, data.consents);
    if (data.portfolio) saveJSON(KEYS.portfolio, data.portfolio);
    if (data.filters) saveJSON(KEYS.filters, data.filters);
    if (data.marketTiles) saveJSON(KEYS.marketTiles, data.marketTiles);
    if (data.tickerNames) saveJSON(KEYS.tickerNames, data.tickerNames);
    if (data.agentSettings) saveJSON(KEYS.agentSettings, normalizeAgentSettings(data.agentSettings));
    if (data.agentActionLog) setAgentActionLog(data.agentActionLog);
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


