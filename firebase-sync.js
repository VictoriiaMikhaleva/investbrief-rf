/**
 * Cloud sync + auth UI for signed-in users.
 * save/load: saveUserDataToFirebase, loadUserDataFromFirebase, collectLocalUserData, applyUserData
 * debounce: scheduleFirebaseSave (≈1 с)
 * Auth UI: #authSignedOut / #authSignedIn in Настройки
 */
(function () {
  'use strict';

  var FIREBASE_SAVE_DELAY_MS = 1000;
  var SYNC_ERROR_TOAST_MS = 45000;
  var _saveTimer = null;
  var _syncInited = false;
  var _authUiBound = false;
  var _authBusy = false;
  var _lastSyncErrorToastAt = 0;

  function getFb() {
    return window.investBriefFirebase && window.investBriefFirebase.ready
      ? window.investBriefFirebase
      : null;
  }

  function getFirebaseShell() {
    return window.investBriefFirebase || null;
  }

  function firebaseUnavailableMessage() {
    var fb = getFirebaseShell();
    if (fb && fb.loading) {
      return 'Облако загружается… Подождите пару секунд и нажмите снова.';
    }
    if (fb && fb.error && fb.error.userMessage) return fb.error.userMessage;
    if (fb && fb.error && fb.error.message === 'file-protocol') {
      return 'Синхронизация не работает при открытии HTML с диска. Запустите npm start и откройте http://localhost:8787';
    }
    if (!fb || !fb.ready) {
      return 'Не удалось загрузить Firebase. Проверьте интернет и доступ к googleapis.com (иногда блокируется провайдером).';
    }
    return null;
  }

  function showCloudSyncError(message, opts) {
    opts = opts || {};
    if (typeof showToast !== 'function') return;
    var now = Date.now();
    if (!opts.force && now - _lastSyncErrorToastAt < SYNC_ERROR_TOAST_MS) return;
    _lastSyncErrorToastAt = now;
    showToast(message || 'Синхронизация недоступна, данные сохранены на этом устройстве');
  }

  function mapCloudSyncError(err) {
    var code = err && err.code ? String(err.code) : '';
    var msg = err && err.message ? String(err.message) : '';
    if (code.indexOf('permission-denied') >= 0) {
      return 'Нет доступа к облаку. Выйдите и войдите снова. Если не помогло — в Firebase Console должны быть развёрнуты правила Firestore (npm run deploy:rules).';
    }
    if (code.indexOf('unauthenticated') >= 0) {
      return 'Сессия истекла — войдите в аккаунт снова для синхронизации.';
    }
    if (code.indexOf('resource-exhausted') >= 0 || msg.indexOf('longer than') >= 0) {
      return 'Слишком много данных для облака. Очистите историю агента или экспортируйте лишнее.';
    }
    if (code.indexOf('unavailable') >= 0 || code.indexOf('network') >= 0 ||
        code.indexOf('failed-precondition') >= 0 || msg.indexOf('offline') >= 0) {
      return 'Нет связи с облаком Firebase. Проверьте интернет и повторите позже.';
    }
    if (msg.indexOf('Firestore API has not been used') >= 0 ||
        msg.indexOf('firestore.googleapis.com') >= 0) {
      return 'База Firestore не включена в проекте investor-brief-rf. Создайте Firestore в Firebase Console.';
    }
    return 'Синхронизация недоступна, данные сохранены на этом устройстве';
  }

  function sanitizeCloudValue(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map(sanitizeCloudValue).filter(function (v) { return v !== undefined; });
    }
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (key) {
        var v = sanitizeCloudValue(value[key]);
        if (v !== undefined) out[key] = v;
      });
      return out;
    }
    return null;
  }

  function prepareCloudPayload(data) {
    var payload = sanitizeCloudValue(data || {});
    if (payload.agentActionLog && payload.agentActionLog.length > 150) {
      payload.agentActionLog = payload.agentActionLog.slice(0, 150);
    }
    return payload;
  }

  function updateFirebaseLoadStatus() {
    var msg = firebaseUnavailableMessage();
    if (!msg) {
      if (!getFb() || !getFb().currentUser) return;
      return;
    }
    setAuthSyncStatus(msg);
  }

  function mergeAgentActionLogs(local, cloud) {
    var byId = {};
    var merged = [];
    (Array.isArray(local) ? local : []).concat(Array.isArray(cloud) ? cloud : []).forEach(function (raw) {
      var e = typeof normalizeAgentLogEntry === 'function' ? normalizeAgentLogEntry(raw) : raw;
      if (!e) return;
      var prev = byId[e.id];
      if (!prev || new Date(e.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
        byId[e.id] = e;
      }
    });
    Object.keys(byId).forEach(function (id) { merged.push(byId[id]); });
    merged.sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return merged.slice(0, 200);
  }

  function collectLocalUserData() {
    return {
      profile: getProfile(),
      watchlist: getWatchlist(),
      portfolio: getPortfolio(),
      settings: getSettings(),
      alerts: getAlerts(),
      digest: getDigest(),
      consents: getConsents(),
      marketTiles: getMarketTickers(),
      agentSettings: getAgentSettings(),
      agentActionLog: getAgentActionLog()
    };
  }

  function applyUserData(data) {
    if (!data || typeof data !== 'object') return;
    window._ibrfApplyingCloudData = true;
    try {
      if (data.profile) saveJSON(KEYS.profile, data.profile);
      if (data.watchlist) saveJSON(KEYS.watchlist, data.watchlist);
      if (data.portfolio) saveJSON(KEYS.portfolio, data.portfolio);
      if (data.settings) saveJSON(KEYS.settings, data.settings);
      if (data.alerts) saveJSON(KEYS.alerts, data.alerts);
      if (data.digest) saveJSON(KEYS.digest, normalizeDigest(data.digest));
      if (data.consents) saveJSON(KEYS.consents, data.consents);
      if (data.marketTiles) saveJSON(KEYS.marketTiles, data.marketTiles);
      if (data.agentSettings) {
        var localAgent = getAgentSettings();
        var mergedAgent = typeof mergeAgentSettings === 'function'
          ? mergeAgentSettings(localAgent, data.agentSettings)
          : normalizeAgentSettings(data.agentSettings);
        saveJSON(KEYS.agentSettings, mergedAgent);
        if (agentSettingsUpdatedAtMs(localAgent) >= agentSettingsUpdatedAtMs(normalizeAgentSettings(data.agentSettings))) {
          window._ibrfPushAgentSettings = true;
        }
      }
      if (data.agentActionLog) {
        setAgentActionLog(mergeAgentActionLogs(getAgentActionLog(), data.agentActionLog));
      }
    } finally {
      window._ibrfApplyingCloudData = false;
    }

    if (window._ibrfPushAgentSettings) {
      window._ibrfPushAgentSettings = false;
      if (typeof scheduleFirebaseSave === 'function') scheduleFirebaseSave();
    }

    var cloudConsents = getConsents();
    var cloudDigest = getDigest();
    if (cloudConsents.digestEmail !== cloudDigest.emailConsent) {
      window._ibrfApplyingCloudData = true;
      try {
        saveJSON(KEYS.digest, normalizeDigest(Object.assign({}, cloudDigest, {
          emailConsent: cloudConsents.digestEmail
        })));
      } finally {
        window._ibrfApplyingCloudData = false;
      }
    }

    if (typeof loadProfileToUI === 'function') loadProfileToUI();
    if (typeof loadMarketsToUI === 'function') loadMarketsToUI();
    if (typeof loadFiltersToUI === 'function') loadFiltersToUI();
    if (typeof renderWatchlist === 'function') renderWatchlist();
    if (typeof renderHomePage === 'function') renderHomePage();
    else if (typeof renderBriefing === 'function') renderBriefing();
    if (typeof renderMarketTiles === 'function') renderMarketTiles();
    if (typeof renderMarketMacro === 'function') renderMarketMacro();
    if (typeof renderPortfolio === 'function') renderPortfolio();
    if (typeof renderAlerts === 'function') renderAlerts();
    if (typeof updateStats === 'function') updateStats();
    if (typeof renderFeed === 'function') renderFeed();
    if (typeof invalidateAgentRefresh === 'function') invalidateAgentRefresh();
    if (typeof renderAgentSection === 'function') renderAgentSection();
    if (typeof renderAgentSettings === 'function') renderAgentSettings();
    if (typeof refreshAgentSignals === 'function') refreshAgentSignals(true);
  }

  function setCurrentFirebaseUser(user) {
    var fb = getFb();
    if (fb) fb.currentUser = user || null;
    renderAuthUI();
  }

  function authDisplayLabel(user) {
    if (!user) return '';
    if (user.email) return user.email;
    if (user.displayName) return user.displayName;
    return 'Аккаунт Google';
  }

  function renderAuthUI() {
    var fb = getFb();
    var signedOut = document.getElementById('authSignedOut');
    var signedIn = document.getElementById('authSignedIn');
    var labelEl = document.getElementById('authUserLabel');
    var statusEl = document.getElementById('authSyncStatus');
    if (!signedOut || !signedIn) return;

    var user = fb && fb.currentUser;
    if (user) {
      signedOut.hidden = true;
      signedIn.hidden = false;
      if (labelEl) labelEl.textContent = authDisplayLabel(user);
    } else {
      signedOut.hidden = false;
      signedIn.hidden = true;
      if (labelEl) labelEl.textContent = '';
    }
    if (statusEl && !user) {
      statusEl.textContent = '';
      statusEl.hidden = true;
    }
  }

  function setAuthSyncStatus(text) {
    var statusEl = document.getElementById('authSyncStatus');
    if (!statusEl) return;
    if (!text) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
  }

  async function saveUserDataToFirebase(opts) {
    opts = opts || {};
    var fb = getFb();
    if (!fb || !fb.currentUser || !fb.db) return false;
    try {
      var uid = fb.currentUser.uid;
      var ref = fb.doc(fb.db, 'users', uid);
      var payload = prepareCloudPayload(collectLocalUserData());
      payload.updatedAt = fb.serverTimestamp();
      await fb.setDoc(ref, payload, { merge: true });
      if (fb.currentUser) setAuthSyncStatus('Данные синхронизированы');
      return true;
    } catch (err) {
      console.warn('cloud save failed', err);
      if (!opts.silent) showCloudSyncError(mapCloudSyncError(err));
      return false;
    }
  }

  async function loadUserDataFromFirebase() {
    var fb = getFb();
    if (!fb || !fb.currentUser || !fb.db) return;
    try {
      var ref = fb.doc(fb.db, 'users', fb.currentUser.uid);
      var snap = await fb.getDoc(ref);
      if (snap.exists()) {
        applyUserData(snap.data());
        setAuthSyncStatus('Данные синхронизированы');
        if (typeof showToast === 'function') showToast('Данные синхронизированы');
      } else {
        var ok = await saveUserDataToFirebase();
        if (ok) {
          setAuthSyncStatus('Данные сохранены');
          if (typeof showToast === 'function') showToast('Данные сохранены');
        }
      }
    } catch (err) {
      console.warn('cloud load failed', err);
      setAuthSyncStatus(mapCloudSyncError(err));
      showCloudSyncError(mapCloudSyncError(err));
    }
  }

  function scheduleFirebaseSave() {
    if (window._ibrfApplyingCloudData) return;
    var fb = getFb();
    if (!fb || !fb.currentUser) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      saveUserDataToFirebase({ silent: true }).then(function (ok) {
        if (!ok) saveUserDataToFirebase({ silent: false });
      });
    }, FIREBASE_SAVE_DELAY_MS);
  }

  function mapAuthError(err) {
    var code = err && err.code ? String(err.code) : '';
    var msg = err && err.message ? String(err.message) : '';
    if (code.indexOf('unauthorized-domain') >= 0 || msg.indexOf('unauthorized-domain') >= 0) {
      return 'Вход с этой страницы недоступен. Откройте приложение по ссылке victoriiamikhaleva.github.io/investbrief-rf/';
    }
    if (code.indexOf('popup-blocked') >= 0) return 'Браузер заблокировал окно входа — разрешите всплывающие окна';
    if (code.indexOf('invalid-email') >= 0) return 'Некорректный адрес почты';
    if (code.indexOf('wrong-password') >= 0 || code.indexOf('invalid-credential') >= 0) {
      return 'Неверный email или пароль';
    }
    if (code.indexOf('email-already-in-use') >= 0) return 'Этот email уже зарегистрирован';
    if (code.indexOf('weak-password') >= 0) return 'Пароль слишком простой (минимум 6 символов)';
    if (code.indexOf('popup-closed') >= 0 || code.indexOf('cancelled-popup-request') >= 0) {
      return 'Вход отменён';
    }
    if (code.indexOf('network') >= 0 || code.indexOf('network-request-failed') >= 0) {
      return 'Нет связи с сервером';
    }
    if (code.indexOf('operation-not-allowed') >= 0) {
      return 'Этот способ входа отключён в настройках проекта';
    }
    return 'Не удалось выполнить вход. Попробуйте ещё раз';
  }

  async function withAuthBusy(fn) {
    if (_authBusy) return;
    _authBusy = true;
    try {
      await fn();
    } finally {
      _authBusy = false;
    }
  }

  function isPrivacyConsentChecked() {
    var el = document.getElementById('privacyConsent');
    return el && el.checked;
  }

  function isDigestConsentChecked() {
    var el = document.getElementById('digestConsent');
    return el && el.checked;
  }

  function applySignupConsents(email) {
    var now = new Date().toISOString();
    setConsents({
      privacyAccepted: true,
      privacyAcceptedAt: now,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      digestEmail: isDigestConsentChecked()
    });
    var digest = getDigest();
    var next = {
      emailConsent: isDigestConsentChecked(),
      time: digest.time || '08:00'
    };
    if (isDigestConsentChecked() && email && !digest.email) {
      next.email = email;
    }
    setDigest(Object.assign({}, digest, next));
    var settingsConsent = document.getElementById('digestConsentSettings');
    if (settingsConsent) settingsConsent.checked = next.emailConsent;
  }

  function applyGoogleSignInConsents(user) {
    var cur = getConsents();
    if (cur.privacyAccepted) return;
    var email = user && user.email ? user.email : '';
    setConsents({
      privacyAccepted: true,
      privacyAcceptedAt: new Date().toISOString(),
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      digestEmail: cur.digestEmail
    });
    if (email && !getDigest().email) {
      setDigest({ email: email });
    }
  }

  function bindAuthUI() {
    if (_authUiBound) return;
    _authUiBound = true;
    var emailEl = document.getElementById('authEmail');
    var passEl = document.getElementById('authPassword');
    var signInBtn = document.getElementById('authSignInBtn');
    var signUpBtn = document.getElementById('authSignUpBtn');
    var googleBtn = document.getElementById('authGoogleBtn');
    var signOutBtn = document.getElementById('authSignOutBtn');

    if (signInBtn) {
      signInBtn.addEventListener('click', function () {
        var fb = getFb();
        if (!fb) {
          showCloudSyncError(firebaseUnavailableMessage(), { force: true });
          return;
        }
        var email = emailEl ? emailEl.value.trim() : '';
        var pass = passEl ? passEl.value : '';
        if (!email || !pass) {
          showToast('Введите email и пароль');
          return;
        }
        withAuthBusy(function () {
          return fb.signInWithEmailAndPassword(fb.auth, email, pass).catch(function (err) {
            showToast(mapAuthError(err));
          });
        });
      });
    }

    if (signUpBtn) {
      signUpBtn.addEventListener('click', function () {
        var fb = getFb();
        if (!fb) {
          showCloudSyncError(firebaseUnavailableMessage(), { force: true });
          return;
        }
        var email = emailEl ? emailEl.value.trim() : '';
        var pass = passEl ? passEl.value : '';
        if (!email || !pass) {
          showToast('Введите email и пароль');
          return;
        }
        if (!isPrivacyConsentChecked()) {
          showToast('Подтвердите согласие с Политикой конфиденциальности');
          return;
        }
        withAuthBusy(function () {
          return fb.createUserWithEmailAndPassword(fb.auth, email, pass)
            .then(function () {
              applySignupConsents(email);
            })
            .catch(function (err) {
              showToast(mapAuthError(err));
            });
        });
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', function () {
        var fb = getFb();
        if (!fb) {
          showCloudSyncError(firebaseUnavailableMessage(), { force: true });
          return;
        }
        withAuthBusy(function () {
          return fb.signInWithPopup(fb.auth, fb.googleProvider)
            .then(function (cred) {
              if (cred && cred.user) applyGoogleSignInConsents(cred.user);
            })
            .catch(function (err) {
              showToast(mapAuthError(err));
            });
        });
      });
    }

    if (signOutBtn) {
      signOutBtn.addEventListener('click', function () {
        var fb = getFb();
        if (!fb) return;
        withAuthBusy(function () {
          return fb.signOut(fb.auth).then(function () {
            setAuthSyncStatus('');
            var privacy = document.getElementById('privacyConsent');
            var digestC = document.getElementById('digestConsent');
            if (privacy) privacy.checked = false;
            if (digestC) digestC.checked = false;
            showToast('Вы вышли из аккаунта');
          });
        });
      });
    }
  }

  function initFirebaseSync() {
    bindAuthUI();
    renderAuthUI();
    if (_syncInited) return;
    var fb = getFb();
    if (!fb) return;
    _syncInited = true;
    setAuthSyncStatus('');

    fb.onAuthStateChanged(fb.auth, function (user) {
      setCurrentFirebaseUser(user);
      if (user) {
        applyGoogleSignInConsents(user);
        loadUserDataFromFirebase();
      } else {
        setAuthSyncStatus('');
      }
    });
  }

  window.collectLocalUserData = collectLocalUserData;
  window.applyUserData = applyUserData;
  window.setCurrentFirebaseUser = setCurrentFirebaseUser;
  window.saveUserDataToFirebase = saveUserDataToFirebase;
  window.loadUserDataFromFirebase = loadUserDataFromFirebase;
  window.scheduleFirebaseSave = scheduleFirebaseSave;

  function tryInitFirebaseSync() {
    if (getFb()) {
      initFirebaseSync();
      return;
    }
    updateFirebaseLoadStatus();
  }

  window.addEventListener('ibrf-firebase-ready', tryInitFirebaseSync);
  window.addEventListener('ibrf-firebase-error', function () {
    updateFirebaseLoadStatus();
    showCloudSyncError(firebaseUnavailableMessage(), { force: true });
  });
  document.addEventListener('DOMContentLoaded', function () {
    bindAuthUI();
    tryInitFirebaseSync();
  });
  setTimeout(tryInitFirebaseSync, 0);
  setTimeout(tryInitFirebaseSync, 800);
  setTimeout(tryInitFirebaseSync, 2500);
})();
