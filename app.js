/* app.js */
  function renderAlerts() {
    var a = getAlerts();
    document.getElementById('alertThreshold').value = a.threshold != null ? a.threshold : 2;
    document.getElementById('alertThresholdLabel').textContent = THRESHOLD_LABELS[a.threshold] || THRESHOLD_LABELS[2];
    document.querySelectorAll('#alertChannels input[name="channel"]').forEach(function (cb) {
      cb.checked = (a.channels || []).indexOf(cb.value) !== -1;
    });
    var rulesEl = document.getElementById('alertRulesList');
    if (!a.rules || a.rules.length === 0) {
      rulesEl.innerHTML = '<p class="muted hint-split">Правил уведомлений пока нет</p>';
      var rulesHint = rulesEl.querySelector('.hint-split');
      if (rulesHint && typeof HintType !== 'undefined') HintType.refresh(rulesHint);
      return;
    }
    rulesEl.innerHTML = a.rules.map(function (r, i) {
      return '<div class="alert-rule"><span class="ticker">' + escapeHtml(r.ticker) + '</span>' +
        '<span class="tag">' + escapeHtml(r.type) + '</span>' +
        '<button type="button" data-rule-index="' + i + '" class="danger">Удалить</button></div>';
    }).join('');
    rulesEl.querySelectorAll('[data-rule-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-rule-index'), 10);
        var alerts = getAlerts();
        alerts.rules.splice(idx, 1);
        setAlerts(alerts);
        renderAlerts();
        showToast('Уведомление удалено');
      });
    });
  }



  function saveAlertsFromUI() {
    var channels = [];
    document.querySelectorAll('#alertChannels input[name="channel"]:checked').forEach(function (cb) {
      channels.push(cb.value);
    });
    var a = getAlerts();
    a.threshold = parseInt(document.getElementById('alertThreshold').value, 10);
    a.channels = channels;
    setAlerts(a);
    document.getElementById('alertThresholdLabel').textContent = THRESHOLD_LABELS[a.threshold] || '';
  }



  function loadProfileToUI() {
    var p = getProfile();
    var s = getSettings();
    var profileId = document.getElementById('profileId');
    if (profileId) profileId.value = p.id || '';
    document.getElementById('profileName').value = p.name || '';
    var briefFormat = document.getElementById('briefFormat');
    if (briefFormat) briefFormat.value = s.briefFormat || 'concise';
    var briefingScope = document.getElementById('briefingScope');
    if (briefingScope) briefingScope.value = s.briefingScope || 'market';
    var digest = getDigest();
    var digestEmail = document.getElementById('digestEmailSettings');
    if (digestEmail) digestEmail.value = digest.email || '';
    var digestConsentSettings = document.getElementById('digestConsentSettings');
    if (digestConsentSettings) digestConsentSettings.checked = !!digest.emailConsent;
    var telegram = document.getElementById('telegramChatId');
    if (telegram) telegram.value = (getAlerts().telegramChat || '');
    var digestTime = document.getElementById('digestTime');
    if (digestTime) digestTime.value = getDigest().time || '08:00';
  }



  function saveProfileFromUI() {
    setProfile({
      id: (document.getElementById('profileId') || {}).value ? document.getElementById('profileId').value.trim() : (getProfile().id || ''),
      name: document.getElementById('profileName').value.trim()
    });
    var s = getSettings();
    var briefFormatEl = document.getElementById('briefFormat');
    var scopeEl = document.getElementById('briefingScope');
    setSettings({
      briefFormat: briefFormatEl ? briefFormatEl.value : s.briefFormat,
      briefingScope: scopeEl ? scopeEl.value : s.briefingScope,
      essayStyle: briefFormatEl ? briefFormatEl.value : s.briefFormat,
      riskProfile: s.riskProfile || 'balanced'
    });
    var digestEmail = document.getElementById('digestEmailSettings');
    if (digestEmail) {
      var emailVal = digestEmail.value.trim();
      var consentEl = document.getElementById('digestConsentSettings');
      var emailConsent = consentEl ? consentEl.checked : getDigest().emailConsent;
      if (emailVal && !emailConsent) {
        showToast('Включите согласие на email-дайджест или очистите поле email');
        return;
      }
      setDigest({
        email: emailVal,
        time: (document.getElementById('digestTime') || {}).value || getDigest().time || '08:00',
        emailConsent: emailConsent
      });
      setConsents({ digestEmail: emailConsent });
    }
    var telegram = document.getElementById('telegramChatId');
    if (telegram) {
      var a = getAlerts();
      a.telegramChat = telegram.value.trim();
      setAlerts(a);
    }
    renderHomePage();
  }



  function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    setupTickerAutocomplete('marketTickerInput');
    setupTickerAutocomplete('tickerInput');
    setupTickerAutocomplete('pfAddTicker');
    setupTickerAutocomplete('pfWatchAddTicker');
    setupTickerAutocomplete('feedAsset', { onSelect: function () { syncFiltersFromUI(); } });
    setupTickerAutocomplete('alertRuleTicker');

    window.addEventListener('hashchange', initHash);

    document.getElementById('horizonTabs').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-horizon]');
      if (!btn) return;
      state.horizon = btn.getAttribute('data-horizon');
      document.querySelectorAll('#horizonTabs button').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      renderHomePage();
    });

    document.getElementById('marketTiles').addEventListener('click', function (e) {
      var removeBtn = e.target.closest('[data-remove-ticker]');
      if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        removeMarketTicker(removeBtn.getAttribute('data-remove-ticker'));
        return;
      }
      var tile = e.target.closest('.market-tile');
      if (!tile) return;
      var ticker = tile.getAttribute('data-ticker');
      if (ticker) openPortfolioChart(ticker);
    });

    document.getElementById('addMarketTickerBtn').addEventListener('click', function () {
      addMarketTicker(document.getElementById('marketTickerInput').value);
    });
    document.getElementById('marketTickerInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        if (acControllers.marketTickerInput) acControllers.marketTickerInput.handleEnter(e);
        addMarketTicker(e.target.value);
      }
    });
    document.getElementById('resetMarketTickersBtn').addEventListener('click', resetMarketTickers);

    var addWatchBtn = document.getElementById('addWatchlistBtn');
    if (addWatchBtn) {
      addWatchBtn.addEventListener('click', function () {
        addTicker(document.getElementById('tickerInput').value);
      });
    }
    var addPfFromWatch = document.getElementById('addPortfolioFromWatchBtn');
    if (addPfFromWatch) {
      addPfFromWatch.addEventListener('click', addPortfolioFromWatchInput);
    }
    document.getElementById('tickerInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        if (acControllers.tickerInput) acControllers.tickerInput.handleEnter(e);
        addTicker(e.target.value);
      }
    });
    var pfAddBtn = document.getElementById('pfAddBtn');
    if (pfAddBtn) pfAddBtn.addEventListener('click', function () { addPortfolioPosition(null, { prefix: '' }); });
    var pfWatchAddBtn = document.getElementById('pfWatchAddBtn');
    if (pfWatchAddBtn) pfWatchAddBtn.addEventListener('click', function () { addPortfolioPosition(null, { prefix: 'Watch' }); });
    var pfCancelEditBtn = document.getElementById('pfCancelEditBtn');
    if (pfCancelEditBtn) pfCancelEditBtn.addEventListener('click', cancelPortfolioEdit);
    var pfWatchCancelEditBtn = document.getElementById('pfWatchCancelEditBtn');
    if (pfWatchCancelEditBtn) pfWatchCancelEditBtn.addEventListener('click', cancelPortfolioEdit);
    bindPortfolioFormEnter('pfAddTicker', '');
    bindPortfolioFormEnter('pfWatchAddTicker', 'Watch');
    document.querySelectorAll('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyPreset(btn.getAttribute('data-preset'));
      });
    });

    ['feedType', 'feedAsset', 'feedEvent', 'feedTone', 'feedImportance', 'feedSort', 'feedSearch', 'feedOnlyWatchlist'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', syncFiltersFromUI);
      el.addEventListener('input', syncFiltersFromUI);
    });

    document.getElementById('resetPortfolioBtn').addEventListener('click', clearPortfolio);

    document.getElementById('portfolioFolderHost').addEventListener('click', function (e) {
      var paper = e.target.closest('.paper[data-ticker]');
      if (paper) {
        e.stopPropagation();
        selectPortfolioTicker(paper.getAttribute('data-ticker'));
        return;
      }
      if (e.target.closest('#portfolioFolder')) {
        state.folderOpen = !state.folderOpen;
        renderPortfolioFolder();
      }
    });

    document.getElementById('refreshIndexBtn').addEventListener('click', function () {
      renderMoexIndexBox();
      showToast('Индекс обновлён');
    });

    document.querySelectorAll('#imoexHorizonTabs [data-imoex-horizon]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.imoexHorizon = btn.getAttribute('data-imoex-horizon');
        document.querySelectorAll('#imoexHorizonTabs [data-imoex-horizon]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderMoexIndexBox();
      });
    });

    document.getElementById('chartTickerSelect').addEventListener('change', function () {
      selectPortfolioTicker(this.value);
    });

    document.querySelectorAll('#chartHorizonTabs [data-chart-horizon]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.chartHorizon = btn.getAttribute('data-chart-horizon');
        document.querySelectorAll('#chartHorizonTabs [data-chart-horizon]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderPortfolioChart();
      });
    });

    document.querySelectorAll('.portfolio-table-body').forEach(function (tbody) {
      tbody.addEventListener('click', handlePortfolioTableClick);
    });

    document.getElementById('portfolioCards').addEventListener('click', function (e) {
      var card = e.target.closest('.portfolio-card');
      if (!card) return;
      var tickerEl = card.querySelector('.ticker');
      if (!tickerEl) return;
      selectPortfolioTicker(tickerEl.textContent.trim());
    });

    var chartResizeTimer;
    window.addEventListener('resize', function () {
      if (state.tab !== 'portfolio') return;
      clearTimeout(chartResizeTimer);
      chartResizeTimer = setTimeout(renderPortfolioChart, 120);
    });

    document.getElementById('alertThreshold').addEventListener('input', function () {
      saveAlertsFromUI();
      renderAlerts();
    });
    document.querySelectorAll('#alertChannels input').forEach(function (cb) {
      cb.addEventListener('change', saveAlertsFromUI);
    });
    document.getElementById('addAlertRuleBtn').addEventListener('click', function () {
      var raw = document.getElementById('alertRuleTicker').value;
      var type = document.getElementById('alertRuleType').value;
      resolveTickerFromInput(raw).then(function (ticker) {
        ticker = normalizeTicker(ticker);
        if (!ticker) { showToast('Укажите тикер или название'); return; }
        var a = getAlerts();
        if (!a.rules) a.rules = [];
        a.rules.push({ ticker: ticker, type: type, createdAt: new Date().toISOString() });
        setAlerts(a);
        document.getElementById('alertRuleTicker').value = '';
        if (acControllers.alertRuleTicker) acControllers.alertRuleTicker.close();
        renderAlerts();
        showToast('Уведомление добавлено');
      });
    });

    ['profileId', 'profileName', 'briefFormat', 'briefingScope', 'digestEmailSettings', 'telegramChatId', 'digestTime'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        saveProfileFromUI();
        showToast('Настройки сохранены');
      });
      el.addEventListener('blur', saveProfileFromUI);
    });

    document.getElementById('exportJsonBtn').addEventListener('click', exportAll);
    document.getElementById('importFileBtn').addEventListener('click', function () {
      document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        importAll(reader.result);
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    document.getElementById('digestBtnSidebar').addEventListener('click', openDigestModal);
    document.getElementById('digestBtnBrief').addEventListener('click', openDigestModal);
    document.getElementById('digestCancelBtn').addEventListener('click', closeDigestModal);
    document.getElementById('digestSaveBtn').addEventListener('click', function () {
      var emailVal = document.getElementById('digestEmail').value.trim();
      var consentEl = document.getElementById('digestConsentModal');
      var emailConsent = consentEl ? consentEl.checked : false;
      if (emailVal && !emailConsent) {
        showToast('Отметьте согласие на получение дайджеста на email');
        return;
      }
      setDigest({
        email: emailVal,
        time: (document.getElementById('digestTimeModal') || document.getElementById('digestTime')).value || '08:00',
        emailConsent: emailConsent
      });
      setConsents({ digestEmail: emailConsent });
      var digestEmailSettings = document.getElementById('digestEmailSettings');
      if (digestEmailSettings) digestEmailSettings.value = emailVal;
      var digestConsentSettings = document.getElementById('digestConsentSettings');
      if (digestConsentSettings) digestConsentSettings.checked = emailConsent;
      closeDigestModal();
      showToast('Дайджест сохранён');
    });
    document.getElementById('digestModal').addEventListener('click', function (e) {
      if (e.target.id === 'digestModal') closeDigestModal();
    });

    document.getElementById('briefArticleCloseBtn').addEventListener('click', closeBriefArticleModal);
    document.getElementById('briefArticleModal').addEventListener('click', function (e) {
      if (e.target.id === 'briefArticleModal') closeBriefArticleModal();
    });
    ['topBriefsList', 'myBriefsList', 'briefingList'].forEach(function (id) {
      var listEl = document.getElementById(id);
      if (!listEl) return;
      listEl.addEventListener('click', handleBriefListClick);
      listEl.addEventListener('keydown', handleBriefListKeydown);
    });
    var feedListEl = document.getElementById('feedList');
    if (feedListEl) {
      feedListEl.addEventListener('click', handleBriefListClick);
      feedListEl.addEventListener('keydown', handleBriefListKeydown);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeBriefArticleModal();
        closeDigestModal();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        setLastVisit(Date.now());
      }
    });
    window.addEventListener('beforeunload', function () {
      setLastVisit(Date.now());
    });
  }



  function bindPortfolioFormEnter(inputId, prefix) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        if (acControllers[inputId]) acControllers[inputId].handleEnter(e);
        addPortfolioPosition(null, { prefix: prefix });
      }
    });
  }



  function init() {
    if (!localStorage.getItem(KEYS.portfolio)) {
      setPortfolio({ positions: [] });
    }
    loadProfileToUI();
    loadFiltersToUI();
    renderWatchlist();
    loadLiveBriefs();
    renderMarketTiles();
    renderMarketMacro();
    renderHomePage();
    renderPortfolio();
    updatePortfolioFormChrome();
    renderMoexIndexBox();
    renderAlerts();
    bindEvents();
    bindChartHover(document.getElementById('portfolioPriceChart'));
    bindChartHover(document.getElementById('imoexMiniChart'));
    initHash();
    if (typeof HintType !== 'undefined') HintType.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
