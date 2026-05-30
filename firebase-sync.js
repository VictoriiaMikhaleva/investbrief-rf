/**
 * Cloud sync + auth UI for signed-in users.
 * save/load: saveUserDataToFirebase, loadUserDataFromFirebase, collectLocalUserData, applyUserData
 * debounce: scheduleFirebaseSave (≈1 с)
 * Auth UI: #authSignedOut / #authSignedIn in Настройки
 */
(function () {
  'use strict';

  var FIREBASE_SAVE_DELAY_MS = 1000;
  var _saveTimer = null;
  var _syncInited = false;
  var _authBusy = false;

  function getFb() {
    return window.investBriefFirebase && window.investBriefFirebase.ready
      ? window.investBriefFirebase
      : null;
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
      if (data.agentSettings) saveJSON(KEYS.agentSettings, normalizeAgentSettings(data.agentSettings));
      if (data.agentActionLog) setAgentActionLog(data.agentActionLog);
    } finally {
      window._ibrfApplyingCloudData = false;
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
    if (typeof renderAgentSection === 'function') renderAgentSection();
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

  async function saveUserDataToFirebase() {
    var fb = getFb();
    if (!fb || !fb.currentUser || !fb.db) return false;
    try {
      var uid = fb.currentUser.uid;
      var ref = fb.doc(fb.db, 'users', uid);
      var payload = collectLocalUserData();
      payload.updatedAt = fb.serverTimestamp();
      await fb.setDoc(ref, payload, { merge: true });
      return true;
    } catch (err) {
      console.warn('cloud save failed', err);
      if (typeof showToast === 'function') {
        showToast('Синхронизация недоступна, данные сохранены на этом устройстве');
      }
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
      setAuthSyncStatus('');
      if (typeof showToast === 'function') {
        showToast('Синхронизация недоступна, данные сохранены на этом устройстве');
      }
    }
  }

  function scheduleFirebaseSave() {
    if (window._ibrfApplyingCloudData) return;
    var fb = getFb();
    if (!fb || !fb.currentUser) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      saveUserDataToFirebase();
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
          showToast('Синхронизация недоступна, данные сохранены на этом устройстве');
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
          showToast('Синхронизация недоступна, данные сохранены на этом устройстве');
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
          showToast('Синхронизация недоступна, данные сохранены на этом устройстве');
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
    if (_syncInited) return;
    var fb = getFb();
    if (!fb) return;
    _syncInited = true;

    bindAuthUI();
    renderAuthUI();

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
    if (getFb()) initFirebaseSync();
  }

  window.addEventListener('ibrf-firebase-ready', tryInitFirebaseSync);
  window.addEventListener('ibrf-firebase-error', function () {
    if (typeof showToast === 'function') {
      showToast('Синхронизация недоступна, данные сохранены на этом устройстве');
    }
  });
  document.addEventListener('DOMContentLoaded', tryInitFirebaseSync);
  setTimeout(tryInitFirebaseSync, 0);
  setTimeout(tryInitFirebaseSync, 800);
})();
