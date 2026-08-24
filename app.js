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
      rulesEl.innerHTML = '<p class="muted hint-frame">Правил уведомлений пока нет</p>';
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
    loadMarketsToUI();
  }

  function updateMarketSettingsControls() {
    var ruEl = document.getElementById('marketRu');
    var usEl = document.getElementById('marketUs');
    if (!ruEl || !usEl) return;
    if (!usEl.checked) {
      ruEl.checked = true;
      ruEl.disabled = true;
    } else {
      ruEl.disabled = false;
    }
  }

  function loadMarketsToUI() {
    var m = getSettings().markets || { ru: true, us: false };
    if (typeof Markets !== 'undefined' && !Markets.isUsMarketAvailable() && m.us) {
      var s = getSettings();
      setSettings({
        briefFormat: s.briefFormat,
        briefingScope: s.briefingScope,
        essayStyle: s.essayStyle,
        riskProfile: s.riskProfile,
        markets: { ru: true, us: false },
        baseCurrency: 'RUB'
      });
      m = { ru: true, us: false };
      if (typeof state !== 'undefined') state.newsMarketFilter = 'RU';
    }
    var ruEl = document.getElementById('marketRu');
    var usEl = document.getElementById('marketUs');
    if (!ruEl || !usEl) return;
    ruEl.checked = !!m.ru;
    usEl.checked = !!m.us;
    updateMarketSettingsControls();
    if (typeof Markets !== 'undefined') {
      if (Markets.syncUsMarketUi) Markets.syncUsMarketUi();
      if (Markets.renderBriefingMarketTabs) Markets.renderBriefingMarketTabs();
    }
  }

  function saveMarketsFromUI() {
    var ruEl = document.getElementById('marketRu');
    var usEl = document.getElementById('marketUs');
    if (!ruEl || !usEl) return;
    var ru = ruEl.checked;
    var us = usEl.checked;
    if (!ru && !us) {
      showToast('Должен быть выбран хотя бы один рынок.');
      loadMarketsToUI();
      return;
    }
    var s = getSettings();
    setSettings({
      briefFormat: s.briefFormat,
      briefingScope: s.briefingScope,
      essayStyle: s.essayStyle,
      riskProfile: s.riskProfile,
      markets: { ru: ru, us: us },
      baseCurrency: us && !ru ? 'USD' : 'RUB'
    });
    if (typeof state !== 'undefined') {
      var nextFilter = ru && us ? 'all' : (us ? 'US' : 'RU');
      state.newsMarketFilter = typeof Markets !== 'undefined' && Markets.normalizeNewsMarketFilter
        ? Markets.normalizeNewsMarketFilter(nextFilter, { ru: ru, us: us })
        : nextFilter;
    }
    updateMarketSettingsControls();
    if (typeof Markets !== 'undefined' && Markets.renderBriefingMarketTabs) {
      Markets.renderBriefingMarketTabs();
    }
    if (typeof renderNewsMarketFilterTabs === 'function') renderNewsMarketFilterTabs();
    var newsTabs = document.getElementById('newsMarketFilterTabs');
    if (newsTabs && typeof state !== 'undefined') {
      newsTabs.querySelectorAll('[data-news-market]').forEach(function (b) {
        if (b.hidden) return;
        b.classList.toggle('active', b.getAttribute('data-news-market') === (state.newsMarketFilter || 'all'));
      });
    }
    if (typeof renderMarketMacro === 'function') renderMarketMacro(true);
    renderHomePage();
    renderWatchlist();
    renderMarketTiles();
    renderPortfolio();
    if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
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
      riskProfile: s.riskProfile || 'balanced',
      markets: s.markets,
      baseCurrency: s.baseCurrency
    });
    var digestEmail = document.getElementById('digestEmailSettings');
    if (digestEmail) {
      var emailVal = digestEmail.value.trim();
      var consentEl = document.getElementById('digestConsentSettings');
      var emailConsent = consentEl ? consentEl.checked : getDigest().emailConsent;
      if (emailVal && !emailConsent) {
        showToast('Для dev-поля email укажите согласие или очистите поле');
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

    var analyticsSubnav = document.getElementById('analyticsSubnav');
    if (analyticsSubnav) {
      analyticsSubnav.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-analytics-sub]');
        if (!btn) return;
        if (state.tab !== 'watchlist' && typeof switchTab === 'function') switchTab('watchlist');
        if (typeof switchAnalyticsSub === 'function') {
          switchAnalyticsSub(btn.getAttribute('data-analytics-sub'));
        }
      });
    }

    setupTickerAutocomplete('tickerInput');
    setupTickerAutocomplete('pfAddTicker');
    if (typeof preloadOfzSearchCatalog === 'function') preloadOfzSearchCatalog();
    setupTickerAutocomplete('feedAsset', { onSelect: function () { syncFiltersFromUI(); } });
    setupTickerAutocomplete('alertRuleTicker');

    window.addEventListener('hashchange', initHash);

    var horizonTabs = document.getElementById('horizonTabs');
    if (horizonTabs) horizonTabs.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-horizon]');
      if (!btn) return;
      state.horizon = btn.getAttribute('data-horizon');
      document.querySelectorAll('#horizonTabs button').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      renderHomePage();
    });

    function syncAllMarketTabButtons() {
      ['briefingMarketTabs', 'analyticsMarketTabs', 'portfolioMarketTabs'].forEach(function (id) {
        if (typeof Markets !== 'undefined' && Markets.renderBriefingMarketTabs) {
          Markets.renderBriefingMarketTabs(id);
        }
      });
    }
    ['briefingMarketTabs', 'analyticsMarketTabs', 'portfolioMarketTabs'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-briefing-market]');
        if (!btn) return;
        if (typeof Markets !== 'undefined' && Markets.applyBriefingMarkets) {
          Markets.applyBriefingMarkets(btn.getAttribute('data-briefing-market'));
          syncAllMarketTabButtons();
        }
      });
    });

    var securityChartTabs = document.getElementById('securityChartTabs');
    if (securityChartTabs) {
      securityChartTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-security-chart-tab]');
        if (!btn) return;
        if (typeof setSecurityChartTab === 'function') {
          setSecurityChartTab(btn.getAttribute('data-security-chart-tab'));
        }
      });
    }

    var newsMarketTabs = document.getElementById('newsMarketFilterTabs');
    if (newsMarketTabs) {
      newsMarketTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-news-market]');
        if (!btn || btn.hidden) return;
        state.newsMarketFilter = btn.getAttribute('data-news-market');
        newsMarketTabs.querySelectorAll('[data-news-market]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderHomePage();
        if (typeof renderMarketMacro === 'function') renderMarketMacro(true);
      });
    }

    var marketRu = document.getElementById('marketRu');
    var marketUs = document.getElementById('marketUs');
    if (marketRu) {
      marketRu.addEventListener('change', function () {
        saveMarketsFromUI();
        showToast('Настройки сохранены');
      });
    }
    if (marketUs) {
      marketUs.addEventListener('change', function () {
        saveMarketsFromUI();
        showToast('Настройки сохранены');
      });
    }

    var marketTilesEl = document.getElementById('marketTiles');
    if (marketTilesEl) {
      marketTilesEl.addEventListener('click', function (e) {
        var tile = e.target.closest('.market-tile');
        if (!tile) return;
        var ticker = tile.getAttribute('data-ticker');
        if (ticker) {
          if (typeof openSecurityAnalyticsModal === 'function') openSecurityAnalyticsModal(ticker);
          else if (typeof openPortfolioChart === 'function') openPortfolioChart(ticker);
        }
      });
    }


    var analyticsHorizonTabs = document.getElementById('analyticsPriceHorizonTabs');
    if (analyticsHorizonTabs) {
      analyticsHorizonTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-analytics-horizon]');
        if (!btn) return;
        state.analyticsPriceHorizon = btn.getAttribute('data-analytics-horizon');
        analyticsHorizonTabs.querySelectorAll('[data-analytics-horizon]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        if (state.analyticsTicker && typeof renderAnalyticsDetail === 'function') {
          renderAnalyticsDetail(state.analyticsTicker);
        }
      });
    }

    var secClose = document.getElementById('securityAnalyticsCloseBtn');
    if (secClose) secClose.addEventListener('click', function () {
      if (typeof closeAnalyticsModal === 'function') closeAnalyticsModal();
    });
    var secModal = document.getElementById('securityAnalyticsModal');
    if (secModal) {
      secModal.addEventListener('click', function (e) {
        if (e.target.id === 'securityAnalyticsModal' && typeof closeAnalyticsModal === 'function') {
          closeAnalyticsModal();
        }
      });
    }

    var addWatchBtn = document.getElementById('addWatchlistBtn');
    if (addWatchBtn) {
      addWatchBtn.addEventListener('click', function () {
        addTicker(document.getElementById('tickerInput').value);
      });
    }
    var tickerInput = document.getElementById('tickerInput');
    if (tickerInput) tickerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        if (acControllers.tickerInput) acControllers.tickerInput.handleEnter(e);
        addTicker(e.target.value);
      }
    });
    var pfAddBtn = document.getElementById('pfAddBtn');
    var pfFormActions = document.querySelector('.portfolio-add-form .pf-form-actions');
    if (pfFormActions) {
      pfFormActions.addEventListener('mousedown', function () {
        if (acControllers.pfAddTicker) acControllers.pfAddTicker.close();
      });
    }
    if (pfAddBtn) pfAddBtn.addEventListener('click', function () {
      if (acControllers.pfAddTicker) acControllers.pfAddTicker.close();
      addPortfolioPosition(null, { prefix: '' });
    });
    var pfCancelEditBtn = document.getElementById('pfCancelEditBtn');
    if (pfCancelEditBtn) pfCancelEditBtn.addEventListener('click', cancelPortfolioEdit);
    var pfSaleBtn = document.getElementById('pfSaleBtn');
    if (pfSaleBtn) pfSaleBtn.addEventListener('click', function () {
      commitPortfolioSale(state.pfSaleTicker);
    });
    var pfCancelSaleBtn = document.getElementById('pfCancelSaleBtn');
    if (pfCancelSaleBtn) pfCancelSaleBtn.addEventListener('click', cancelPortfolioSale);
    ['pfSaleQty', 'pfSalePrice'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        if (typeof updatePortfolioSalePreview === 'function') updatePortfolioSalePreview();
      });
      el.addEventListener('change', function () {
        if (typeof updatePortfolioSalePreview === 'function') updatePortfolioSalePreview();
      });
    });
    bindPortfolioFormEnter('pfAddTicker', '');
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

    var refreshIndexBtn = document.getElementById('refreshIndexBtn');
    if (refreshIndexBtn) refreshIndexBtn.addEventListener('click', function () {
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

    var chartSelect = document.getElementById('chartTickerSelect');
    if (chartSelect) {
      chartSelect.addEventListener('change', function () {
        selectPortfolioTicker(this.value);
      });
    }

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

    var portfolioCards = document.getElementById('portfolioCards');
    if (portfolioCards) portfolioCards.addEventListener('click', function (e) {
      var card = e.target.closest('.portfolio-card');
      if (!card) return;
      var tickerEl = card.querySelector('.ticker');
      if (!tickerEl) return;
      selectPortfolioTicker(tickerEl.textContent.trim());
    });

    var chartResizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(chartResizeTimer);
      chartResizeTimer = setTimeout(function () {
        if (state.tab === 'portfolio' && state.chartTicker) renderPortfolioChart();
        if (state.tab === 'portfolio' && state.chartTicker) {
          var pc = document.getElementById('portfolioPurchaseCandleChart');
          if (pc && pc._purchaseChartMeta && typeof drawPurchaseCandleChart === 'function') {
            var pm = pc._purchaseChartMeta;
            drawPurchaseCandleChart(pc, pm.lots, {
              ticker: pm.ticker,
              currentPrice: pm.currentPrice,
              hoverIndex: pc._purchaseHoverIndex
            });
          }
        }
        if (state.tab === 'watchlist' && state.analyticsTicker && typeof renderAnalyticsDetail === 'function') {
          renderAnalyticsDetail(state.analyticsTicker);
        }
        if (document.getElementById('imoexMiniChart')) renderMoexIndexBox();
      }, 120);
    });

    var alertThreshold = document.getElementById('alertThreshold');
    if (alertThreshold) alertThreshold.addEventListener('input', function () {
      saveAlertsFromUI();
      renderAlerts();
    });
    document.querySelectorAll('#alertChannels input').forEach(function (cb) {
      cb.addEventListener('change', saveAlertsFromUI);
    });
    var addAlertRuleBtn = document.getElementById('addAlertRuleBtn');
    if (addAlertRuleBtn) addAlertRuleBtn.addEventListener('click', function () {
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

    var exportJsonBtn = document.getElementById('exportJsonBtn');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportAll);

    var migrationBackupBtn = document.getElementById('migrationBackupBtn');
    if (migrationBackupBtn) {
      migrationBackupBtn.addEventListener('click', function () {
        if (typeof switchTab === 'function') switchTab('settings');
        window.setTimeout(function () {
          var block = document.getElementById('settingsBackupBlock');
          if (block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (exportJsonBtn) {
            exportJsonBtn.focus({ preventScroll: true });
          }
        }, 80);
      });
    }

    var importFileBtn = document.getElementById('importFileBtn');
    var importFileInput = document.getElementById('importFileInput');
    var backupImportModal = document.getElementById('backupImportConfirmModal');
    var backupImportOk = document.getElementById('backupImportConfirmOk');
    var backupImportCancel = document.getElementById('backupImportConfirmCancel');
    var pendingBackupImport = null;

    function closeBackupImportConfirm(clearInput) {
      if (backupImportModal) {
        backupImportModal.hidden = true;
        backupImportModal.classList.remove('open');
      }
      pendingBackupImport = null;
      if (clearInput && importFileInput) importFileInput.value = '';
    }

    function openBackupImportConfirm(onConfirm) {
      if (!backupImportModal || !backupImportOk || !backupImportCancel) {
        if (onConfirm) onConfirm();
        return;
      }
      pendingBackupImport = onConfirm;
      backupImportModal.hidden = false;
      backupImportModal.classList.add('open');
      backupImportOk.focus();
    }

    if (backupImportOk && !backupImportOk.dataset.bound) {
      backupImportOk.dataset.bound = '1';
      backupImportOk.addEventListener('click', function () {
        var fn = pendingBackupImport;
        closeBackupImportConfirm(false);
        if (fn) fn();
      });
    }
    if (backupImportCancel && !backupImportCancel.dataset.bound) {
      backupImportCancel.dataset.bound = '1';
      backupImportCancel.addEventListener('click', function () {
        closeBackupImportConfirm(true);
      });
    }
    if (backupImportModal && !backupImportModal.dataset.bound) {
      backupImportModal.dataset.bound = '1';
      backupImportModal.addEventListener('click', function (e) {
        if (e.target === backupImportModal) closeBackupImportConfirm(true);
      });
    }

    if (importFileBtn && importFileInput) importFileBtn.addEventListener('click', function () {
      importFileInput.click();
    });
    if (importFileInput) importFileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var inputEl = e.target;
      openBackupImportConfirm(function () {
        var reader = new FileReader();
        reader.onload = function () {
          importAll(reader.result);
          inputEl.value = '';
        };
        reader.readAsText(file);
      });
    });

    var briefArticleCloseBtn = document.getElementById('briefArticleCloseBtn');
    if (briefArticleCloseBtn) briefArticleCloseBtn.addEventListener('click', closeBriefArticleModal);
    var briefArticleModal = document.getElementById('briefArticleModal');
    if (briefArticleModal) briefArticleModal.addEventListener('click', function (e) {
      if (e.target.id === 'briefArticleModal') closeBriefArticleModal();
    });
    var articleCloseBtn = document.getElementById('articleModalCloseBtn');
    if (articleCloseBtn && typeof closeArticleModal === 'function') {
      articleCloseBtn.addEventListener('click', closeArticleModal);
    }
    var articleModal = document.getElementById('articleModal');
    if (articleModal && typeof closeArticleModal === 'function') {
      articleModal.addEventListener('click', function (e) {
        if (e.target.id === 'articleModal') closeArticleModal();
      });
    }
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
        if (typeof closeArticleModal === 'function') closeArticleModal();
        if (typeof closeAnalyticsModal === 'function') closeAnalyticsModal();
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
    if (state.analyticsPriceHorizon === 'year') state.analyticsPriceHorizon = '5y';
    bindEvents();
    try {
      if (!localStorage.getItem(KEYS.portfolio)) {
        setPortfolio({ positions: [] });
      }
      loadProfileToUI();
      loadFiltersToUI();
      renderWatchlist();
      loadLiveBriefs();
      if (typeof scheduleBriefsRefresh === 'function') scheduleBriefsRefresh();
      renderMarketTiles();
      renderMarketMacro();
      if (typeof scheduleMarketMacroRefresh === 'function') scheduleMarketMacroRefresh();
      if (typeof initWatchdog === 'function') initWatchdog();
      if (typeof Markets !== 'undefined' && Markets.renderBriefingMarketTabs) {
        ['briefingMarketTabs', 'analyticsMarketTabs', 'portfolioMarketTabs'].forEach(function (id) {
          Markets.renderBriefingMarketTabs(id);
        });
      }
      renderHomePage();
      if (typeof invalidateAgentRefresh === 'function') invalidateAgentRefresh();
      if (typeof refreshAgentSignals === 'function') refreshAgentSignals(true);
      renderPortfolio();
      updatePortfolioFormChrome();
      if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
      renderAlerts();
      bindChartHover(document.getElementById('imoexMiniChart'));
      bindChartHover(document.getElementById('analyticsPriceChart'));
      bindChartHover(document.getElementById('portfolioInsightPriceChart'));
    } catch (err) {
      console.error('InvestBrief init error', err);
    }
    initHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
