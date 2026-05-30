/**
 * watchdog.js — невидимый агент свежести данных.
 * Локально: пока вкладка открыта + при возврате на страницу.
 * Облако: Firestore meta/watchdog (Cloud Function каждый час).
 */
(function () {
  'use strict';

  var WATCHDOG_KEY = 'ibrf.watchdog';
  var DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
  var MIN_INTERVAL_MS = 5 * 60 * 1000;
  var _timer = null;
  var _running = false;
  var _inited = false;
  var _cloudUnsub = null;

  function loadWatchdogState() {
    try {
      var raw = localStorage.getItem(WATCHDOG_KEY);
      if (!raw) return getDefaultWatchdogState();
      var s = JSON.parse(raw);
      return normalizeWatchdogState(s);
    } catch (e) {
      return getDefaultWatchdogState();
    }
  }

  function getDefaultWatchdogState() {
    return {
      enabled: true,
      intervalMs: DEFAULT_INTERVAL_MS,
      lastRunAt: null,
      lastOkAt: null,
      lastError: null,
      lastCloudSyncAt: null,
      lastCloudOk: null
    };
  }

  function normalizeWatchdogState(s) {
    s = s && typeof s === 'object' ? s : {};
    var interval = Number(s.intervalMs);
    if (!isFinite(interval) || interval < MIN_INTERVAL_MS) interval = DEFAULT_INTERVAL_MS;
    return {
      enabled: s.enabled !== false,
      intervalMs: interval,
      lastRunAt: s.lastRunAt || null,
      lastOkAt: s.lastOkAt || null,
      lastError: s.lastError || null,
      lastCloudSyncAt: s.lastCloudSyncAt || null,
      lastCloudOk: s.lastCloudOk == null ? null : !!s.lastCloudOk
    };
  }

  function saveWatchdogState(s) {
    try {
      localStorage.setItem(WATCHDOG_KEY, JSON.stringify(normalizeWatchdogState(s)));
    } catch (e) { /* quota */ }
  }

  function isStale(state) {
    if (!state.lastRunAt) return true;
    return Date.now() - state.lastRunAt >= state.intervalMs;
  }

  function getFirebaseApi() {
    return window.investBriefFirebase && window.investBriefFirebase.ready
      ? window.investBriefFirebase
      : null;
  }

  function cloudUpdatedAtMs(data) {
    if (!data || !data.updatedAt) return 0;
    if (typeof data.updatedAt.toMillis === 'function') return data.updatedAt.toMillis();
    if (data.updatedAt.seconds != null) return Number(data.updatedAt.seconds) * 1000;
    return 0;
  }

  function shouldSyncFromCloud(local, cloudMs) {
    if (!cloudMs) return false;
    var lastCloud = local.lastCloudSyncAt || 0;
    return cloudMs > lastCloud;
  }

  function fetchCloudWatchdogMeta() {
    var fb = getFirebaseApi();
    if (!fb || !fb.db) return Promise.resolve(null);
    return fb.getDoc(fb.doc(fb.db, 'meta', 'watchdog')).then(function (snap) {
      return snap.exists() ? snap.data() : null;
    }).catch(function () { return null; });
  }

  function refreshBriefsQuiet() {
    if (typeof fetchLiveBriefsQuiet === 'function') {
      return fetchLiveBriefsQuiet().catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  function refreshMacroQuiet(force) {
    if (typeof refreshMacroDataSilent === 'function') {
      return refreshMacroDataSilent(!!force).catch(function () { return null; });
    }
    if (typeof renderMarketMacro === 'function' && state && state.tab === 'briefing') {
      try { renderMarketMacro(!!force); } catch (e) { /* */ }
    }
    return Promise.resolve(null);
  }

  function refreshAgentQuiet() {
    if (typeof getAgentSettings !== 'function' || typeof refreshAgentSignals !== 'function') {
      return Promise.resolve(null);
    }
    if (!getAgentSettings().enabled) return Promise.resolve(null);
    return Promise.resolve(refreshAgentSignals(false)).catch(function () { return null; });
  }

  function refreshHomeIfVisible() {
    if (!state || state.tab !== 'briefing') return;
    if (typeof renderHomePage === 'function') renderHomePage();
  }

  function runWatchdogCycle(reason) {
    var cfg = loadWatchdogState();
    if (!cfg.enabled) return Promise.resolve({ skipped: true });
    if (_running) return Promise.resolve({ skipped: true, busy: true });
    if (document.hidden && reason !== 'manual' && reason !== 'cloud') {
      return Promise.resolve({ skipped: true, hidden: true });
    }

    _running = true;
    var started = Date.now();
    var hadError = false;

    return Promise.all([
      refreshBriefsQuiet(),
      refreshMacroQuiet(true),
      refreshAgentQuiet()
    ]).then(function (results) {
      results.forEach(function (r) {
        if (r === null && reason !== 'init') hadError = true;
      });
      refreshHomeIfVisible();
      var next = normalizeWatchdogState(Object.assign({}, cfg, {
        lastRunAt: started,
        lastOkAt: hadError ? cfg.lastOkAt : started,
        lastError: hadError ? 'partial_failure' : null
      }));
      saveWatchdogState(next);
      updateWatchdogDevUI(next);
      return { ok: !hadError, at: started, reason: reason || 'interval' };
    }).catch(function (err) {
      var next = normalizeWatchdogState(Object.assign({}, cfg, {
        lastRunAt: started,
        lastError: err && err.message ? String(err.message) : 'error'
      }));
      saveWatchdogState(next);
      updateWatchdogDevUI(next);
      return { ok: false, error: true };
    }).then(function (result) {
      _running = false;
      return result;
    });
  }

  function applyCloudWatchdogMeta(meta, reason) {
    if (!meta) return Promise.resolve();
    var cfg = loadWatchdogState();
    if (!cfg.enabled) return Promise.resolve();
    var cloudMs = cloudUpdatedAtMs(meta);
    if (!shouldSyncFromCloud(cfg, cloudMs)) {
      updateWatchdogDevUI(loadWatchdogState(), meta);
      return Promise.resolve();
    }
    return runWatchdogCycle(reason || 'cloud').then(function () {
      saveWatchdogState(normalizeWatchdogState(Object.assign({}, loadWatchdogState(), {
        lastCloudSyncAt: cloudMs,
        lastCloudOk: meta.ok != null ? !!meta.ok : null
      })));
      updateWatchdogDevUI(loadWatchdogState(), meta);
    });
  }

  function checkCloudWatchdogSignal(reason) {
    return fetchCloudWatchdogMeta().then(function (meta) {
      return applyCloudWatchdogMeta(meta, reason || 'cloud');
    });
  }

  function subscribeCloudWatchdog() {
    var fb = getFirebaseApi();
    if (!fb || !fb.onSnapshot || _cloudUnsub) return;
    try {
      _cloudUnsub = fb.onSnapshot(fb.doc(fb.db, 'meta', 'watchdog'), function (snap) {
        if (!snap.exists()) return;
        applyCloudWatchdogMeta(snap.data(), 'cloud-live');
      }, function () { /* offline / rules */ });
    } catch (e) { /* */ }
  }

  function scheduleWatchdogTimer() {
    var cfg = loadWatchdogState();
    if (_timer) clearInterval(_timer);
    _timer = null;
    if (!cfg.enabled) return;
    _timer = setInterval(function () {
      runWatchdogCycle('interval');
    }, cfg.intervalMs);
  }

  function onVisibilityWake() {
    if (document.hidden) return;
    var cfg = loadWatchdogState();
    if (cfg.enabled && isStale(cfg)) runWatchdogCycle('visibility');
    checkCloudWatchdogSignal('visibility-cloud');
  }

  function formatDevTs(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function updateWatchdogDevUI(cfg, cloudMeta) {
    cfg = cfg || loadWatchdogState();
    var statusEl = document.getElementById('watchdogDevStatus');
    if (!statusEl) return;
    var cloudMs = cloudMeta ? cloudUpdatedAtMs(cloudMeta) : cfg.lastCloudSyncAt;
    var cloudLine = cloudMs
      ? ('Облако: ' + formatDevTs(cloudMs) + (cfg.lastCloudOk === false ? ' (частично)' : '') + '. ')
      : 'Облако: нет метки. ';
    statusEl.textContent = cfg.enabled
      ? (cloudLine + 'Локально: ' + formatDevTs(cfg.lastRunAt) + ' · успешно ' + formatDevTs(cfg.lastOkAt) +
        ' · интервал ' + Math.round(cfg.intervalMs / 60000) + ' мин.')
      : 'Сторож данных отключён';
  }

  function bindWatchdogDevUI() {
    var toggle = document.getElementById('watchdogEnabled');
    var intervalEl = document.getElementById('watchdogIntervalMin');
    var runBtn = document.getElementById('watchdogRunNowBtn');
    var cloudBtn = document.getElementById('watchdogCloudCheckBtn');
    var cfg = loadWatchdogState();
    if (toggle) toggle.checked = cfg.enabled;
    if (intervalEl) intervalEl.value = Math.round(cfg.intervalMs / 60000);

    if (toggle) {
      toggle.addEventListener('change', function () {
        var next = normalizeWatchdogState(Object.assign({}, loadWatchdogState(), { enabled: toggle.checked }));
        saveWatchdogState(next);
        scheduleWatchdogTimer();
        updateWatchdogDevUI(next);
      });
    }
    if (intervalEl) {
      intervalEl.addEventListener('change', function () {
        var mins = parseInt(intervalEl.value, 10);
        if (!isFinite(mins) || mins < 5) mins = 60;
        var next = normalizeWatchdogState(Object.assign({}, loadWatchdogState(), { intervalMs: mins * 60000 }));
        saveWatchdogState(next);
        scheduleWatchdogTimer();
        updateWatchdogDevUI(next);
      });
    }
    if (runBtn) {
      runBtn.addEventListener('click', function () {
        runWatchdogCycle('manual').then(function () {
          if (typeof showToast === 'function') showToast('Локальная проверка выполнена');
        });
      });
    }
    if (cloudBtn) {
      cloudBtn.addEventListener('click', function () {
        checkCloudWatchdogSignal('manual-cloud').then(function () {
          if (typeof showToast === 'function') showToast('Сверка с облаком выполнена');
        });
      });
    }
    updateWatchdogDevUI(cfg);
  }

  function bindFirebaseWatchdog() {
    checkCloudWatchdogSignal('firebase');
    subscribeCloudWatchdog();
    fetchCloudWatchdogMeta().then(function (meta) {
      updateWatchdogDevUI(loadWatchdogState(), meta);
    });
  }

  function initWatchdog() {
    if (_inited) return;
    _inited = true;
    bindWatchdogDevUI();
    scheduleWatchdogTimer();
    document.addEventListener('visibilitychange', onVisibilityWake);
    window.addEventListener('ibrf-firebase-ready', bindFirebaseWatchdog);
    if (getFirebaseApi()) bindFirebaseWatchdog();
    var cfg = loadWatchdogState();
    if (cfg.enabled && isStale(cfg)) {
      setTimeout(function () { runWatchdogCycle('init'); }, 4000);
    }
  }

  window.initWatchdog = initWatchdog;
  window.runWatchdogCycle = runWatchdogCycle;
  window.getWatchdogState = loadWatchdogState;
  window.refreshWatchdogDevUI = updateWatchdogDevUI;
  window.checkCloudWatchdogSignal = checkCloudWatchdogSignal;
})();
