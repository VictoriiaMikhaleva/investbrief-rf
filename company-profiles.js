/* company-profiles.js — справочник компаний для блока «О компании» в аналитике.
 * Не влияет на расчёты портфеля, дивидендов, сигналов и цен.
 */
(function (root) {
  'use strict';

  var COMPANY_PROFILES_FILE = 'company-profiles.json';
  var REQUIRED_FIELDS = ['fullName', 'sector', 'industry', 'description'];

  var _catalog = null;
  var _loaded = false;
  var _inflight = null;
  var _status = 'idle';
  var _error = '';

  function normTicker(ticker) {
    if (typeof normalizeTicker === 'function') return normalizeTicker(ticker);
    return String(ticker || '').trim().toUpperCase();
  }

  function normId(id) {
    return String(id || '').trim().toLowerCase();
  }

  function trimStr(v) {
    return String(v == null ? '' : v).trim();
  }

  function emptyCatalog(errors) {
    return {
      version: 1,
      companies: [],
      byTicker: {},
      byCompanyId: {},
      nonCompany: {},
      sectors: [],
      errors: errors || []
    };
  }

  function parseCompanyProfilesCatalog(raw) {
    var out = emptyCatalog([]);
    if (!raw || typeof raw !== 'object') {
      out.errors.push('catalog is not an object');
      return out;
    }
    out.version = Number(raw.version) || 1;
    var nonList = Array.isArray(raw.nonCompanyInstruments) ? raw.nonCompanyInstruments : [];
    nonList.forEach(function (item, idx) {
      if (!item || typeof item !== 'object') {
        out.errors.push('nonCompanyInstruments[' + idx + '] invalid');
        return;
      }
      var ticker = normTicker(item.ticker);
      if (!ticker) {
        out.errors.push('nonCompanyInstruments[' + idx + '] missing ticker');
        return;
      }
      if (out.nonCompany[ticker]) {
        out.errors.push('duplicate non-company ticker ' + ticker);
        return;
      }
      out.nonCompany[ticker] = {
        ticker: ticker,
        kind: trimStr(item.kind) || 'other',
        name: trimStr(item.name)
      };
    });

    out.sectors = [];
    (Array.isArray(raw.sectors) ? raw.sectors : []).forEach(function (name) {
      var sector = trimStr(name);
      if (!sector) return;
      if (out.sectors.indexOf(sector) >= 0) {
        out.errors.push('duplicate sector ' + sector);
        return;
      }
      out.sectors.push(sector);
    });
    if (!out.sectors.length) out.errors.push('catalog missing canonical sectors');

    var list = Array.isArray(raw.companies) ? raw.companies : [];
    list.forEach(function (row, idx) {
      if (!row || typeof row !== 'object') {
        out.errors.push('companies[' + idx + '] invalid');
        return;
      }
      var companyId = normId(row.companyId);
      if (!companyId) {
        out.errors.push('companies[' + idx + '] missing companyId');
        return;
      }
      if (out.byCompanyId[companyId]) {
        out.errors.push('duplicate companyId ' + companyId);
        return;
      }
      var tickers = [];
      (Array.isArray(row.tickers) ? row.tickers : []).forEach(function (t) {
        var ticker = normTicker(t);
        if (ticker && tickers.indexOf(ticker) < 0) tickers.push(ticker);
      });
      if (!tickers.length) {
        out.errors.push('company ' + companyId + ' has no tickers');
        return;
      }
      var missing = [];
      REQUIRED_FIELDS.forEach(function (field) {
        if (!trimStr(row[field])) missing.push(field);
      });
      if (missing.length) {
        out.errors.push('company ' + companyId + ' missing ' + missing.join(', '));
        return;
      }
      var orphanHit = [];
      tickers.forEach(function (ticker) {
        if (out.nonCompany[ticker]) orphanHit.push(ticker);
        if (out.byTicker[ticker]) orphanHit.push(ticker + '@' + out.byTicker[ticker].companyId);
      });
      if (orphanHit.length) {
        out.errors.push('company ' + companyId + ' ticker conflict: ' + orphanHit.join(', '));
        return;
      }
      var sector = trimStr(row.sector);
      var industry = trimStr(row.industry);
      if (out.sectors.length && out.sectors.indexOf(sector) < 0) {
        out.errors.push('company ' + companyId + ' unknown sector ' + sector);
        return;
      }
      var sources = [];
      (Array.isArray(row.sources) ? row.sources : []).forEach(function (src) {
        if (!src || typeof src !== 'object') return;
        var url = trimStr(src.url);
        if (!url) return;
        sources.push({ label: trimStr(src.label), url: url });
      });
      if (!sources.length) {
        out.errors.push('company ' + companyId + ' missing sources');
        return;
      }
      var profile = {
        companyId: companyId,
        tickers: tickers.slice(),
        fullName: trimStr(row.fullName),
        shortName: trimStr(row.shortName) || trimStr(row.fullName),
        sector: sector,
        industry: industry,
        description: trimStr(row.description),
        historyNote: trimStr(row.historyNote),
        sources: sources
      };
      out.companies.push(profile);
      out.byCompanyId[companyId] = profile;
      tickers.forEach(function (ticker) {
        out.byTicker[ticker] = profile;
      });
    });
    return out;
  }

  function setCompanyProfilesCatalog(raw) {
    _catalog = parseCompanyProfilesCatalog(raw);
    _loaded = true;
    _status = 'ok';
    _error = '';
    _inflight = null;
    return _catalog;
  }

  function resetCompanyProfilesLoadState() {
    _catalog = null;
    _loaded = false;
    _inflight = null;
    _status = 'idle';
    _error = '';
  }

  function getCompanyProfilesSync() {
    return _catalog || emptyCatalog([]);
  }

  function getCompanyProfile(ticker) {
    var t = normTicker(ticker);
    if (!t) return null;
    var cat = getCompanyProfilesSync();
    return cat.byTicker[t] || null;
  }

  function getCompanyIdForTicker(ticker) {
    var profile = getCompanyProfile(ticker);
    return profile ? profile.companyId : '';
  }

  function isNonCompanyInstrument(ticker) {
    var t = normTicker(ticker);
    if (!t) return false;
    return !!getCompanyProfilesSync().nonCompany[t];
  }

  function isCoveredAgentInstrument(ticker) {
    return !!getCompanyProfile(ticker) || isNonCompanyInstrument(ticker);
  }

  function getCanonicalSectors() {
    return getCompanyProfilesSync().sectors.slice();
  }

  function getTickerSectorIndustry(ticker) {
    var t = normTicker(ticker);
    var profile = getCompanyProfile(t);
    if (!profile) return null;
    return {
      companyId: profile.companyId,
      ticker: t,
      fullName: profile.fullName,
      sector: profile.sector,
      industry: profile.industry
    };
  }

  function listCompanyProfiles() {
    return getCompanyProfilesSync().companies.slice();
  }

  function getCompanyProfileLoadState() {
    var cat = getCompanyProfilesSync();
    return {
      status: _status,
      loaded: !!_loaded,
      available: _status === 'ok',
      companyCount: cat.companies.length,
      error: _error || ''
    };
  }

  function companyProfilesUrl() {
    var url = 'data/' + COMPANY_PROFILES_FILE;
    try {
      if (typeof window !== 'undefined' && window.IBRF_ASSET_VERSION) {
        url += (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(window.IBRF_ASSET_VERSION);
      }
    } catch (e) { /* */ }
    try {
      if (typeof window !== 'undefined' && window.location && window.location.href) {
        return new URL(url, window.location.href).toString();
      }
    } catch (e2) { /* */ }
    return './' + url;
  }

  function loadCompanyProfiles(options) {
    options = options || {};
    if (options.catalog) {
      return Promise.resolve(setCompanyProfilesCatalog(options.catalog));
    }
    if (_loaded && !options.force) {
      return Promise.resolve(getCompanyProfilesSync());
    }
    if (_inflight && !options.force) return _inflight;
    var fetchFn = options.fetch || (typeof fetch === 'function' ? fetch : null);
    if (typeof fetchFn !== 'function') {
      _status = 'error';
      _error = 'no-fetch';
      _inflight = null;
      return Promise.resolve(getCompanyProfilesSync());
    }
    if (_status !== 'ok') _status = 'loading';
    _inflight = Promise.resolve()
      .then(function () {
        return fetchFn(companyProfilesUrl(), { cache: 'no-store', credentials: 'omit' });
      })
      .then(function (res) {
        if (!res || !res.ok) throw new Error('http');
        return typeof res.json === 'function' ? res.json() : res;
      })
      .then(function (json) {
        return setCompanyProfilesCatalog(json);
      })
      .catch(function () {
        _inflight = null;
        if (_catalog && _catalog.companies && _catalog.companies.length) {
          _status = 'ok';
          return _catalog;
        }
        _status = 'error';
        _error = 'load-failed';
        _loaded = true;
        _catalog = emptyCatalog(['load-failed']);
        return _catalog;
      });
    return _inflight;
  }

  var api = {
    parseCompanyProfilesCatalog: parseCompanyProfilesCatalog,
    setCompanyProfilesCatalog: setCompanyProfilesCatalog,
    resetCompanyProfilesLoadState: resetCompanyProfilesLoadState,
    getCompanyProfilesSync: getCompanyProfilesSync,
    getCompanyProfile: getCompanyProfile,
    getCompanyIdForTicker: getCompanyIdForTicker,
    isNonCompanyInstrument: isNonCompanyInstrument,
    isCoveredAgentInstrument: isCoveredAgentInstrument,
    getCanonicalSectors: getCanonicalSectors,
    getTickerSectorIndustry: getTickerSectorIndustry,
    listCompanyProfiles: listCompanyProfiles,
    getCompanyProfileLoadState: getCompanyProfileLoadState,
    loadCompanyProfiles: loadCompanyProfiles
  };

  root.CompanyProfiles = api;
  root.parseCompanyProfilesCatalog = parseCompanyProfilesCatalog;
  root.setCompanyProfilesCatalog = setCompanyProfilesCatalog;
  root.resetCompanyProfilesLoadState = resetCompanyProfilesLoadState;
  root.getCompanyProfilesSync = getCompanyProfilesSync;
  root.getCompanyProfile = getCompanyProfile;
  root.getCompanyIdForTicker = getCompanyIdForTicker;
  root.isNonCompanyInstrument = isNonCompanyInstrument;
  root.isCoveredAgentInstrument = isCoveredAgentInstrument;
  root.getCanonicalSectors = getCanonicalSectors;
  root.getTickerSectorIndustry = getTickerSectorIndustry;
  root.listCompanyProfiles = listCompanyProfiles;
  root.getCompanyProfileLoadState = getCompanyProfileLoadState;
  root.loadCompanyProfiles = loadCompanyProfiles;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
