/* agent.js — Агент наблюдения (не торговый бот) */
(function () {
  'use strict';

  var DEFAULT_AGENT_TICKERS = [
    'SBER', 'GAZP', 'LKOH', 'GMKN', 'TATN', 'NVTK', 'ROSN', 'SNGS', 'SNGSP',
    'PLZL', 'MGNT', 'MTSS', 'MOEX', 'AFLT', 'ALRS', 'CHMF', 'NLMK', 'SVCB', 'OZPH', 'YDEX'
  ];

  var _agentCards = [];
  var _agentLoading = false;
  var _agentLastRefreshAt = 0;
  var _agentLastSignalFingerprint = '';
  var _agentRefreshTimer = null;
  var _agentVisibilityBound = false;
  var _agentRefreshSeq = 0;
  var _agentLastError = null;

  function agentMoexIss() {
    return (typeof MOEX_ISS !== 'undefined' && MOEX_ISS) ? MOEX_ISS : 'https://iss.moex.com/iss';
  }
  var AGENT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
  var AGENT_STALE_AFTER_MS = 20 * 60 * 1000;
  var _agentBriefingBound = false;
  var _agentSettingsBound = false;
  var _agentLogBound = false;
  var _agentLogFilter = { kind: 'all', search: '' };
  var AGENT_SETTINGS_PREFIX = 'agentSettings';

  var AGENT_ACTION_LABELS = {
    buy: 'Купил',
    sell: 'Продал',
    skip: 'Пропустил',
    watch: 'В наблюдение',
    hold: 'Держу'
  };

  var SENSITIVITY_PRESETS = {
    calm: {
      sensitivityMode: 'calm',
      dayMoveThreshold: 5,
      weekDownThreshold: 10,
      weekUpThreshold: 12,
      turnoverMultiplier: 2
    },
    normal: {
      sensitivityMode: 'normal',
      dayMoveThreshold: 3,
      weekDownThreshold: 7,
      weekUpThreshold: 8,
      turnoverMultiplier: 1.5
    },
    sensitive: {
      sensitivityMode: 'sensitive',
      dayMoveThreshold: 2,
      weekDownThreshold: 5,
      weekUpThreshold: 6,
      turnoverMultiplier: 1.2
    }
  };

  var SENSITIVITY_MODE_LABELS = {
    calm: { title: 'Спокойная', desc: 'Показывает только сильные движения.' },
    normal: { title: 'Обычная', desc: 'Подходит большинству инвесторов.' },
    sensitive: { title: 'Чуткая', desc: 'Показывает больше зон внимания.' }
  };

  function thresholdsMatch(a, b) {
    return a.dayMoveThreshold === b.dayMoveThreshold &&
      a.weekDownThreshold === b.weekDownThreshold &&
      a.weekUpThreshold === b.weekUpThreshold &&
      a.turnoverMultiplier === b.turnoverMultiplier;
  }

  function detectSensitivityMode(settings) {
    var keys = ['calm', 'normal', 'sensitive'];
    for (var i = 0; i < keys.length; i++) {
      if (thresholdsMatch(settings, SENSITIVITY_PRESETS[keys[i]])) return keys[i];
    }
    return 'custom';
  }

  function getSensitivitySummaryText(mode, settings) {
    settings = settings || getAgentSettings();
    if (mode === 'calm') {
      return 'Агент будет реагировать только на сильные движения и заметный рост оборота.';
    }
    if (mode === 'normal') {
      return 'Агент покажет зону внимания при движении от 3% за день, снижении от 7% за неделю или обороте в 1,5 раза выше обычного.';
    }
    if (mode === 'sensitive') {
      return 'Агент будет показывать больше зон внимания, включая умеренные движения цены и оборота.';
    }
    return 'Свои значения: от ' + settings.dayMoveThreshold + '% за день, снижение от ' +
      settings.weekDownThreshold + '% за неделю, рост от ' + settings.weekUpThreshold +
      '%, оборот ×' + String(settings.turnoverMultiplier).replace('.', ',') + '.';
  }

  function buildAgentSensitivityHtml(cfg) {
    var p = cfg.prefix;
    var titleTag = cfg.headingTag || 'h4';
    var modesHtml = ['calm', 'normal', 'sensitive'].map(function (mode) {
      var lbl = SENSITIVITY_MODE_LABELS[mode];
      return (
        '<button type="button" class="agent-mode-card" data-agent-prefix="' + escapeHtml(p) + '" data-agent-mode="' + mode + '" aria-pressed="false">' +
          '<span class="agent-mode-card__title">' + escapeHtml(lbl.title) + '</span>' +
          '<span class="agent-mode-card__desc">' + escapeHtml(lbl.desc) + '</span>' +
        '</button>'
      );
    }).join('');
    return (
      '<div class="agent-sensitivity-body">' +
        '<' + titleTag + ' class="agent-rules-title agent-settings-subtitle">Настроить чувствительность</' + titleTag + '>' +
        '<p class="muted agent-sensitivity-lead">Чем чувствительнее агент, тем чаще он будет показывать зоны внимания.</p>' +
        '<div class="agent-sensitivity-modes" role="group" aria-label="Режим чувствительности">' + modesHtml + '</div>' +
        '<p class="agent-sensitivity-summary" id="' + escapeHtml(p) + 'SensitivitySummary"></p>' +
        '<details class="agent-sensitivity-advanced">' +
          '<summary>Расширенные настройки</summary>' +
          '<div class="agent-advanced-fields">' +
            '<div class="agent-advanced-field">' +
              '<label class="muted" for="' + p + 'DayMove">Заметное движение за день</label>' +
              '<input type="number" id="' + p + 'DayMove" min="0.5" max="20" step="0.5" value="3" />' +
              '<p class="agent-field-hint muted">Агент покажет зону внимания, если цена изменилась сильнее этого значения за день.</p>' +
            '</div>' +
            '<div class="agent-advanced-field">' +
              '<label class="muted" for="' + p + 'WeekDown">Заметное снижение за неделю</label>' +
              '<input type="number" id="' + p + 'WeekDown" min="1" max="30" step="0.5" value="7" />' +
              '<p class="agent-field-hint muted">Агент покажет зону внимания, если бумага заметно снизилась за неделю.</p>' +
            '</div>' +
            '<div class="agent-advanced-field">' +
              '<label class="muted" for="' + p + 'WeekUp">Заметный рост за неделю</label>' +
              '<input type="number" id="' + p + 'WeekUp" min="1" max="30" step="0.5" value="8" />' +
              '<p class="agent-field-hint muted">Агент покажет зону внимания, если бумага быстро выросла за неделю.</p>' +
            '</div>' +
            '<div class="agent-advanced-field">' +
              '<label class="muted" for="' + p + 'Turnover">Необычный оборот торгов</label>' +
              '<input type="number" id="' + p + 'Turnover" min="1" max="5" step="0.1" value="1.5" />' +
              '<p class="agent-field-hint muted">Агент покажет зону внимания, если оборот выше обычного в указанное число раз.</p>' +
            '</div>' +
          '</div>' +
        '</details>' +
      '</div>' +
      '<button type="button" id="' + escapeHtml(cfg.saveBtnId) + '" class="primary agent-sensitivity-save">Сохранить настройки</button>'
    );
  }

  var AGENT_SENSITIVITY_MOUNT_VER = '2';

  function mountAgentSensitivityPanel() {
    var settingsRoot = document.getElementById('agentSettingsSensitivityRoot');
    if (settingsRoot && settingsRoot.dataset.mounted !== AGENT_SENSITIVITY_MOUNT_VER) {
      settingsRoot.innerHTML = buildAgentSensitivityHtml({
        prefix: AGENT_SETTINGS_PREFIX,
        saveBtnId: 'agentSettingsSaveRulesBtn',
        headingTag: 'h4'
      });
      settingsRoot.dataset.mounted = AGENT_SENSITIVITY_MOUNT_VER;
      delete settingsRoot.dataset.sensitivityBound;
    }
  }

  function updateSensitivityModeCards(prefix, mode) {
    document.querySelectorAll('.agent-mode-card[data-agent-prefix="' + prefix + '"]').forEach(function (btn) {
      var active = btn.getAttribute('data-agent-mode') === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function updateSensitivitySummary(prefix, mode, settings) {
    var el = document.getElementById(prefix + 'SensitivitySummary');
    if (el) el.textContent = getSensitivitySummaryText(mode, settings);
  }

  function applyPresetToPanel(prefix, mode) {
    var preset = SENSITIVITY_PRESETS[mode];
    if (!preset) return;
    var map = {
      DayMove: preset.dayMoveThreshold,
      WeekDown: preset.weekDownThreshold,
      WeekUp: preset.weekUpThreshold,
      Turnover: preset.turnoverMultiplier
    };
    Object.keys(map).forEach(function (key) {
      var el = document.getElementById(prefix + key);
      if (el) el.value = map[key];
    });
    updateSensitivityModeCards(prefix, mode);
    updateSensitivitySummary(prefix, mode, preset);
  }

  function loadAgentRulesToUI() {
    ensureAgentSensitivityBound();
    var s = getAgentSettings();
    var prefix = AGENT_SETTINGS_PREFIX;
    var mode = s.sensitivityMode;
    if (mode !== 'custom') {
      var detected = detectSensitivityMode(s);
      mode = detected === 'custom' ? 'custom' : (s.sensitivityMode || detected);
    }
    if (mode === 'custom') {
      var map = {
        DayMove: s.dayMoveThreshold,
        WeekDown: s.weekDownThreshold,
        WeekUp: s.weekUpThreshold,
        Turnover: s.turnoverMultiplier
      };
      Object.keys(map).forEach(function (key) {
        var el = document.getElementById(prefix + key);
        if (el) el.value = map[key];
      });
      updateSensitivityModeCards(prefix, 'custom');
      updateSensitivitySummary(prefix, 'custom', s);
      return;
    }
    applyPresetToPanel(prefix, mode);
  }

  function readAgentRulesFromPanel(prefix) {
    prefix = prefix || AGENT_SETTINGS_PREFIX;
    function num(suffix, fallback) {
      var el = document.getElementById(prefix + suffix);
      var v = el ? parseFloat(el.value) : NaN;
      return isFinite(v) ? v : fallback;
    }
    var values = {
      dayMoveThreshold: num('DayMove', 3),
      weekDownThreshold: num('WeekDown', 7),
      weekUpThreshold: num('WeekUp', 8),
      turnoverMultiplier: num('Turnover', 1.5)
    };
    var mode = detectSensitivityMode(values);
    values.sensitivityMode = mode;
    return values;
  }

  function readAgentTickersFromChips() {
    var tickers = [];
    document.querySelectorAll('#agentSettingsTickerChips [data-agent-remove]').forEach(function (btn) {
      var t = normalizeTicker(btn.getAttribute('data-agent-remove') || '');
      if (t && tickers.indexOf(t) < 0) tickers.push(t);
    });
    return tickers;
  }

  function saveAgentSettingsFromUI() {
    ensureAgentSensitivityBound();
    var prefix = AGENT_SETTINGS_PREFIX;
    var tickers = readAgentTickersFromChips();
    var payload = Object.assign({}, readAgentRulesFromPanel(prefix), {
      tickers: tickers,
      useTopTurnoverByDefault: !tickers.length
    });
    var enabledToggle = document.getElementById('agentEnabledToggle');
    var notifyToggle = document.getElementById('agentNotifyAttention');
    if (enabledToggle) payload.enabled = enabledToggle.checked;
    if (notifyToggle) payload.notifyAttention = notifyToggle.checked;
    setAgentSettings(payload);
    renderAgentChips(tickers);
    loadAgentRulesToUI();
    syncAgentSettingsControls();
    refreshAgentSignals(true);
    if (typeof showToast === 'function') showToast('Настройки агента сохранены');
  }

  function bindAgentSensitivityPanel() {
    var prefix = AGENT_SETTINGS_PREFIX;
    var root = document.getElementById('agentSettingsSensitivityRoot');
    if (!root || root.dataset.sensitivityBound) return;
    root.dataset.sensitivityBound = '1';

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.agent-mode-card[data-agent-prefix="' + prefix + '"]');
      if (!btn) return;
      applyPresetToPanel(prefix, btn.getAttribute('data-agent-mode'));
    });
    ['DayMove', 'WeekDown', 'WeekUp', 'Turnover'].forEach(function (suffix) {
      var el = document.getElementById(prefix + suffix);
      if (!el) return;
      el.addEventListener('input', function () {
        var values = readAgentRulesFromPanel(prefix);
        updateSensitivityModeCards(prefix, values.sensitivityMode);
        updateSensitivitySummary(prefix, values.sensitivityMode, values);
      });
    });
  }

  function ensureAgentSensitivityBound() {
    mountAgentSensitivityPanel();
    bindAgentSensitivityPanel();
  }

  function loadTopTurnoverTickers(limit) {
    limit = limit || 20;
    var cacheKey = 'moex.topvol.' + limit;
    try {
      if (typeof MOEX_CACHE_PREFIX !== 'undefined') {
        var raw = localStorage.getItem(MOEX_CACHE_PREFIX + cacheKey);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.data && parsed.data.length && Date.now() <= parsed.expires) {
            return Promise.resolve(parsed.data.map(function (r) { return r.ticker; }));
          }
        }
      }
    } catch (e) { /* */ }
    if (typeof fetchTopMoexSharesByVolume === 'function') {
      return fetchTopMoexSharesByVolume(limit, false).then(function (rows) {
        return rows.map(function (r) { return r.ticker; });
      }).catch(function () {
        return DEFAULT_AGENT_TICKERS.slice();
      });
    }
    return Promise.resolve(DEFAULT_AGENT_TICKERS.slice());
  }

  function resolveAgentTickerList(settings) {
    settings = settings || getAgentSettings();
    if (!settings.enabled) return Promise.resolve([]);
    if (settings.tickers.length) return Promise.resolve(settings.tickers.slice());
    if (settings.useTopTurnoverByDefault || !settings.tickers.length) {
      return loadTopTurnoverTickers(20).then(function (list) {
        return list && list.length ? list : DEFAULT_AGENT_TICKERS.slice();
      });
    }
    return Promise.resolve(DEFAULT_AGENT_TICKERS.slice());
  }

  function pctChange(first, last) {
    if (first == null || last == null || !isFinite(first) || !isFinite(last) || first === 0) return null;
    return ((last - first) / first) * 100;
  }

  function fetchAgentDailyTurnover(ticker, daysBack) {
    daysBack = daysBack || 14;
    ticker = normalizeTicker(ticker);
    var till = new Date();
    var from = new Date(till);
    from.setDate(from.getDate() - daysBack);
    var fromStr = typeof moexFormatDateMsk === 'function' ? moexFormatDateMsk(from) : from.toISOString().slice(0, 10);
    var tillStr = typeof moexFormatDateMsk === 'function' ? moexFormatDateMsk(till) : till.toISOString().slice(0, 10);
    var url = agentMoexIss() + '/history/engines/stock/markets/shares/boards/TQBR/securities/' +
      encodeURIComponent(ticker) + '.json?from=' + fromStr + '&till=' + tillStr +
      '&iss.meta=off&history.columns=TRADEDATE,VALUE';
    return moexFetchJson(url).then(function (json) {
      var hist = json.history;
      if (!hist || !hist.data || !hist.data.length) return [];
      var iDate = hist.columns.indexOf('TRADEDATE');
      var iVal = hist.columns.indexOf('VALUE');
      return hist.data.map(function (row) {
        return {
          date: String(row[iDate] || '').slice(0, 10),
          value: isFinite(Number(row[iVal])) ? Number(row[iVal]) : null
        };
      }).filter(function (r) { return r.date; });
    }).catch(function () { return []; });
  }

  function avgTurnover7d(dailyRows) {
    if (!dailyRows || !dailyRows.length) return null;
    var vals = dailyRows.filter(function (r) { return r.value != null && isFinite(r.value) && r.value > 0; });
    if (vals.length < 2) return null;
    var slice = vals.slice(-7);
    if (!slice.length) return null;
    var sum = slice.reduce(function (a, r) { return a + r.value; }, 0);
    return sum / slice.length;
  }

  function fetchAgentSecurityData(ticker) {
    ticker = normalizeTicker(ticker);
    var quoteP = typeof fetchMoexQuote === 'function'
      ? fetchMoexQuote(ticker).catch(function () { return null; })
      : Promise.resolve(null);
    var weekP = typeof fetchMoexHistory === 'function'
      ? fetchMoexHistory(ticker, 'week').catch(function () { return null; })
      : Promise.resolve(null);
    var monthP = typeof fetchMoexHistory === 'function'
      ? fetchMoexHistory(ticker, 'month').catch(function () { return null; })
      : Promise.resolve(null);
    var dailyP = fetchAgentDailyTurnover(ticker, 14);

    return Promise.all([quoteP, weekP, monthP, dailyP]).then(function (parts) {
      var quote = parts[0];
      var week = parts[1];
      var month = parts[2];
      var daily = parts[3] || [];

      if (!quote || quote.price == null || !isFinite(quote.price)) {
        return { ticker: ticker, insufficient: true };
      }

      var weekSeries = week && week.series ? week.series : [];
      var monthSeries = month && month.series ? month.series : [];
      var weekChangePct = weekSeries.length >= 2
        ? pctChange(weekSeries[0].price, weekSeries[weekSeries.length - 1].price)
        : null;

      var monthPrices = monthSeries.map(function (p) { return p.price; }).filter(function (v) { return isFinite(v); });
      var monthHigh = monthPrices.length ? Math.max.apply(null, monthPrices) : null;
      var monthLow = monthPrices.length ? Math.min.apply(null, monthPrices) : null;

      var todayTurnover = quote.valueToday != null && isFinite(quote.valueToday) ? quote.valueToday : null;
      var avg7 = avgTurnover7d(daily);
      if (todayTurnover == null && daily.length) {
        var lastDay = daily[daily.length - 1];
        if (lastDay && lastDay.value != null) todayTurnover = lastDay.value;
      }

      var nameP = typeof fetchMoexTickerName === 'function'
        ? fetchMoexTickerName(ticker).catch(function () { return getTickerSubtitle(ticker); })
        : Promise.resolve(getTickerSubtitle(ticker));

      return nameP.then(function (name) {
        return {
          ticker: ticker,
          name: name || getTickerSubtitle(ticker),
          currentPrice: quote.price,
          dayChangePct: quote.changePct,
          weekChangePct: weekChangePct,
          monthHigh: monthHigh,
          monthLow: monthLow,
          todayTurnover: todayTurnover,
          avgTurnover7d: avg7,
          insufficient: false
        };
      });
    }).catch(function () {
      return { ticker: ticker, insufficient: true };
    });
  }

  function findRelatedEventsForTicker(ticker) {
    var t = normalizeTicker(ticker);
    if (typeof getAllBriefs !== 'function') return [];
    return getAllBriefs().filter(function (b) {
      return normalizeTicker(b.ticker) === t;
    }).slice(0, 5);
  }

  function analyzeAgentSignals(securityData, relatedEvents, agentSettings) {
    if (!securityData || securityData.insufficient) return [];
    var s = agentSettings || getAgentSettings();
    var signals = [];
    var d = securityData;
    var dayTh = s.dayMoveThreshold;
    var wDown = s.weekDownThreshold;
    var wUp = s.weekUpThreshold;
    var turnMul = s.turnoverMultiplier;

    if (d.dayChangePct != null && d.dayChangePct <= -dayTh) {
      signals.push({
        id: 'day-down',
        title: 'Заметное снижение за день',
        reasons: [
          'Цена снизилась больше чем на ' + dayTh + '% за день.',
          'Такое движение может быть связано с новостью, общим рынком или продажами в секторе.',
          'Агент отмечает бумагу как зону внимания, но не делает торговую рекомендацию.'
        ],
        checklist: [
          'новости по компании',
          'общий индекс МосБиржи',
          'оборот торгов',
          'дивиденды или отчётность',
          'долю бумаги в портфеле'
        ]
      });
    }

    if (d.dayChangePct != null && d.dayChangePct >= dayTh) {
      signals.push({
        id: 'day-up',
        title: 'Заметный рост за день',
        reasons: [
          'Цена выросла больше чем на ' + dayTh + '% за день.',
          'Движение может быть связано с новостью, ожиданиями дивидендов или общим ростом рынка.',
          'Если бумага есть в портфеле, стоит проверить, не выросла ли её доля слишком сильно.'
        ],
        checklist: [
          'причину роста',
          'оборот торгов',
          'новости по компании',
          'ближайшие корпоративные события',
          'долю позиции в портфеле'
        ]
      });
    }

    if (d.weekChangePct != null && d.weekChangePct <= -wDown) {
      signals.push({
        id: 'week-down',
        title: 'Снижение за неделю',
        reasons: [
          'Цена заметно снизилась за неделю.',
          'Агент проверяет такие движения, потому что они могут указывать на изменение ожиданий рынка.',
          'Важно понять, это временная просадка или ухудшение факторов по бумаге.'
        ],
        checklist: [
          'новости за неделю',
          'сектор',
          'индекс МосБиржи',
          'дивидендные ожидания',
          'финансовые показатели компании'
        ]
      });
    }

    if (d.weekChangePct != null && d.weekChangePct >= wUp) {
      signals.push({
        id: 'week-up',
        title: 'Рост за неделю',
        reasons: [
          'Бумага быстро выросла за неделю.',
          'Рост может быть реакцией на позитивные новости, дивиденды или приток спроса.',
          'Агент отмечает движение, чтобы пользователь оценил его устойчивость.'
        ],
        checklist: [
          'подтверждается ли рост оборотом',
          'есть ли свежие новости',
          'не находится ли бумага около локального максимума',
          'не выросла ли доля бумаги в портфеле'
        ]
      });
    }

    if (d.todayTurnover != null && d.avgTurnover7d != null && d.avgTurnover7d > 0 &&
        d.todayTurnover >= d.avgTurnover7d * turnMul) {
      signals.push({
        id: 'turnover-high',
        title: 'Оборот выше среднего',
        reasons: [
          'Сегодня по бумаге торгуют активнее обычного.',
          'Рост оборота может означать повышенный интерес рынка или реакцию на событие.',
          'Такой сигнал важен, потому что движение цены с высоким оборотом обычно заслуживает большего внимания.'
        ],
        checklist: [
          'была ли новость по бумаге',
          'совпадает ли рост оборота с изменением цены',
          'как ведёт себя сектор',
          'есть ли дивидендные или отчётные события'
        ]
      });
    }

    if (d.monthHigh != null && d.monthLow != null && d.monthHigh > d.monthLow && d.currentPrice != null) {
      var range = d.monthHigh - d.monthLow;
      if (d.currentPrice <= d.monthLow + range * 0.15) {
        signals.push({
          id: 'month-low',
          title: 'Близко к нижней границе месяца',
          reasons: [
            'Цена находится рядом с нижней частью месячного диапазона.',
            'Это может быть зона повышенного внимания для инвестора.',
            'Важно понять, снижение связано с временной волатильностью или с ухудшением факторов.'
          ],
          checklist: [
            'новости по компании',
            'динамику оборота',
            'рынок в целом',
            'ближайшие отчёты и дивиденды'
          ]
        });
      }
      if (d.currentPrice >= d.monthHigh - range * 0.15) {
        signals.push({
          id: 'month-high',
          title: 'Близко к верхней границе месяца',
          reasons: [
            'Цена находится рядом с верхней частью месячного диапазона.',
            'Это может означать сильный спрос или приближение к зоне фиксации прибыли другими участниками.',
            'Агент не предлагает действие, а показывает, что бумага находится около важной области.'
          ],
          checklist: [
            'подтверждается ли движение оборотом',
            'есть ли свежий позитив',
            'не выглядит ли рост перегретым',
            'как изменилась доля бумаги в портфеле'
          ]
        });
      }
    }

    if (relatedEvents && relatedEvents.length) {
      signals.push({
        id: 'event',
        title: 'Есть событие по бумаге',
        reasons: [
          'В сводке найдено событие по этой бумаге.',
          'События по компании могут влиять на ожидания рынка.',
          'Агент показывает его отдельно, чтобы пользователь не пропустил важную информацию.'
        ],
        checklist: [
          'источник события',
          'дату публикации',
          'влияние на дивиденды',
          'влияние на прибыль или долговую нагрузку',
          'реакцию цены и оборота'
        ],
        events: relatedEvents
      });
    }

    return signals;
  }

  function deriveAgentStatus(signals) {
    if (!signals || !signals.length) return 'Спокойно';
    if (signals.some(function (s) { return s.id === 'event'; })) return 'Есть событие';
    if (signals.some(function (s) { return s.id === 'day-down' || s.id === 'day-up'; })) return 'Сильное движение';
    return 'Зона внимания';
  }

  function statusClass(status) {
    if (status === 'Сильное движение') return 'agent-status--strong';
    if (status === 'Есть событие') return 'agent-status--event';
    if (status === 'Зона внимания') return 'agent-status--watch';
    return 'agent-status--calm';
  }

  function signalLogDayKey(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (typeof moexFormatDateMsk === 'function') return moexFormatDateMsk(d);
    return d.toISOString().slice(0, 10);
  }

  function shouldRefreshAgentData(force) {
    if (force) return true;
    if (_agentLoading) return false;
    if (!_agentCards.length) return true;
    if (!_agentLastRefreshAt) return true;
    return Date.now() - _agentLastRefreshAt >= AGENT_STALE_AFTER_MS;
  }

  function buildAgentSignalFingerprint(cards) {
    if (!cards || !cards.length) return '';
    return cards.map(function (c) {
      if (!c.signals || !c.signals.length) return c.ticker + ':';
      return c.ticker + ':' + c.signals.map(function (s) { return s.id; }).sort().join(',');
    }).sort().join('|');
  }

  function maybeNotifyAgentAttention(cards) {
    var settings = getAgentSettings();
    if (!settings.notifyAttention) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    var fp = buildAgentSignalFingerprint(cards);
    if (!fp) return;
    if (!_agentLastSignalFingerprint) {
      _agentLastSignalFingerprint = fp;
      return;
    }
    if (fp === _agentLastSignalFingerprint) return;
    _agentLastSignalFingerprint = fp;
    var count = countAttentionZones(cards);
    if (!count) return;
    var samples = [];
    cards.forEach(function (c) {
      if (!c.signals || !c.signals.length) return;
      c.signals.forEach(function (s) {
        if (samples.length < 4) samples.push(c.ticker + ': ' + s.title);
      });
    });
    try {
      new Notification('InvestBrief — зоны внимания', {
        body: count + ' ' + pluralZones(count) + (samples.length ? '. ' + samples.join('; ') : ''),
        tag: 'ibrf-agent-attention',
        renotify: true
      });
    } catch (e) { /* Safari / старые браузеры */ }
  }

  function scheduleAgentRefresh() {
    if (typeof window === 'undefined' || _agentRefreshTimer) return;
    _agentRefreshTimer = setInterval(function () {
      if (document.hidden) return;
      if (!getAgentSettings().enabled) return;
      if (shouldRefreshAgentData(false)) refreshAgentSignals(false);
    }, AGENT_REFRESH_INTERVAL_MS);
    if (_agentVisibilityBound) return;
    _agentVisibilityBound = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (!getAgentSettings().enabled) return;
      if (shouldRefreshAgentData(false)) refreshAgentSignals(false);
    });
  }

  function appendSignalHistory(cards) {
    var history = getAgentActionLog();
    var now = new Date().toISOString();
    var todayKey = signalLogDayKey(now);
    cards.forEach(function (card) {
      if (!card.signals || !card.signals.length) return;
      card.signals.forEach(function (sig) {
        var dup = history.some(function (h) {
          return h.ticker === card.ticker && h.type === 'signal' &&
            (h.signalId === sig.id || h.title === sig.title) &&
            signalLogDayKey(h.createdAt) === todayKey;
        });
        if (dup) return;
        history.unshift({
          id: card.ticker + '-' + sig.id + '-' + Date.now(),
          type: 'signal',
          action: null,
          ticker: card.ticker,
          signalId: sig.id,
          title: sig.title,
          status: card.status,
          price: card.currentPrice != null && isFinite(card.currentPrice) ? card.currentPrice : null,
          createdAt: now,
          note: ''
        });
      });
    });
    setAgentActionLog(history);
  }

  function formatLogType(entry) {
    if (entry.type === 'signal') return 'Сигнал';
    return AGENT_ACTION_LABELS[entry.action] || 'Действие';
  }

  function computeAgentLogStats(log) {
    var cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    var recent = log.filter(function (e) {
      return new Date(e.createdAt).getTime() >= cutoff;
    });
    var signals = recent.filter(function (e) { return e.type === 'signal'; });
    var actions = recent.filter(function (e) { return e.type === 'action'; });
    var byAction = { buy: 0, sell: 0, skip: 0, watch: 0 };
    actions.forEach(function (e) {
      if (byAction[e.action] != null) byAction[e.action]++;
    });
    var reactionPct = signals.length ? Math.round(actions.length / signals.length * 100) : 0;
    return { signals: signals.length, actions: actions.length, byAction: byAction, reactionPct: reactionPct };
  }

  function filterAgentLog(log) {
    var kind = _agentLogFilter.kind;
    var q = _agentLogFilter.search;
    return log.filter(function (e) {
      if (kind === 'signal' && e.type !== 'signal') return false;
      if (kind === 'action' && e.type !== 'action') return false;
      if (['buy', 'sell', 'skip', 'watch', 'hold'].indexOf(kind) >= 0 &&
        (e.type !== 'action' || e.action !== kind)) return false;
      if (q) {
        var hay = (e.ticker + ' ' + e.title + ' ' + e.status + ' ' + e.signalId).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function logAgentUserAction(ticker, action, meta) {
    meta = meta || {};
    ticker = normalizeTicker(ticker);
    if (!ticker || !action) return;
    var card = _agentCards.find(function (c) { return c.ticker === ticker; });
    var label = AGENT_ACTION_LABELS[action] || action;
    var sigTitle = meta.signalTitle || '';
    var entry = {
      id: ticker + '-' + action + '-' + Date.now(),
      type: 'action',
      action: action,
      ticker: ticker,
      signalId: meta.signalId || '',
      title: sigTitle ? (label + ': ' + sigTitle) : label,
      status: card ? card.status : (meta.status || ''),
      price: card && card.currentPrice != null && isFinite(card.currentPrice) ? card.currentPrice : null,
      createdAt: new Date().toISOString(),
      note: meta.note || ''
    };
    var log = getAgentActionLog();
    log.unshift(entry);
    setAgentActionLog(log);
    if (action === 'watch' && typeof addTicker === 'function') addTicker(ticker);
    showToast(label + ' — ' + ticker + ' записано в журнал');
    renderAgentLogPanel();
    renderAgentHistory();
  }

  function renderAgentLogPanel() {
    bindAgentLogUI();
    var log = getAgentActionLog();
    var statsEl = document.getElementById('agentLogStats');
    var bodyEl = document.getElementById('agentLogBody');
    var emptyEl = document.getElementById('agentLogEmpty');
    if (!statsEl && !bodyEl) return;

    if (statsEl) {
      var st = computeAgentLogStats(log);
      statsEl.innerHTML =
        '<div class="agent-log-stat"><span class="agent-log-stat-num">' + st.signals + '</span><span class="agent-log-stat-label muted">сигналов за 30 дн.</span></div>' +
        '<div class="agent-log-stat"><span class="agent-log-stat-num">' + st.actions + '</span><span class="agent-log-stat-label muted">ваших действий</span></div>' +
        '<div class="agent-log-stat"><span class="agent-log-stat-num">' + st.reactionPct + '%</span><span class="agent-log-stat-label muted">реакция на сигналы</span></div>' +
        '<div class="agent-log-stat"><span class="agent-log-stat-num">' + st.byAction.buy + ' / ' + st.byAction.sell + '</span><span class="agent-log-stat-label muted">купил / продал</span></div>';
    }

    if (bodyEl) {
      var filtered = filterAgentLog(log);
      if (emptyEl) emptyEl.hidden = filtered.length > 0;
      bodyEl.innerHTML = filtered.slice(0, 100).map(function (e) {
        var dt = e.createdAt
          ? new Date(e.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '—';
        var typeClass = e.type === 'signal' ? 'signal' : (e.action || 'action');
        return (
          '<tr>' +
            '<td><time datetime="' + escapeHtml(e.createdAt || '') + '">' + escapeHtml(dt) + '</time></td>' +
            '<td><span class="agent-log-type agent-log-type--' + escapeHtml(typeClass) + '">' + escapeHtml(formatLogType(e)) + '</span></td>' +
            '<td>' + escapeHtml(e.ticker) + '</td>' +
            '<td>' + escapeHtml(e.title) + '</td>' +
            '<td>' + escapeHtml(formatAgentPrice(e.price)) + '</td>' +
          '</tr>'
        );
      }).join('');
    }
  }

  function bindAgentLogUI() {
    if (_agentLogBound) return;
    _agentLogBound = true;
    var kindEl = document.getElementById('agentLogFilterKind');
    var searchEl = document.getElementById('agentLogFilterSearch');
    var clearBtn = document.getElementById('agentLogClearBtn');
    if (kindEl) {
      kindEl.addEventListener('change', function () {
        _agentLogFilter.kind = kindEl.value;
        renderAgentLogPanel();
      });
    }
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        _agentLogFilter.search = searchEl.value.trim().toLowerCase();
        renderAgentLogPanel();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (!confirm('Очистить весь журнал сигналов и действий?')) return;
        setAgentActionLog([]);
        renderAgentLogPanel();
        renderAgentHistory();
        showToast('Журнал очищен');
      });
    }
  }

  function formatAgentPrice(price) {
    if (price == null || !isFinite(price)) return '—';
    if (price >= 1000) return price.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ' ₽';
    return price.toFixed(2).replace('.', ',') + ' ₽';
  }

  function formatAgentDayChange(pct) {
    if (typeof formatDayChangePct === 'function') return formatDayChangePct(pct);
    if (pct == null || !isFinite(pct)) return '—';
    var sign = pct > 0 ? '+' : '';
    return sign + pct.toFixed(2).replace('.', ',') + '%';
  }

  function dayChangeClass(pct) {
    if (pct == null || !isFinite(pct)) return '';
    if (pct > 0) return 'agent-change--up';
    if (pct < 0) return 'agent-change--down';
    return '';
  }

  function pluralZones(count) {
    var mod10 = count % 10;
    var mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'зона внимания';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'зоны внимания';
    return 'зон внимания';
  }

  function countAttentionZones(cards) {
    if (!cards || !cards.length) return 0;
    return cards.reduce(function (sum, card) {
      if (card.insufficient || !card.signals || !card.signals.length) return sum;
      return sum + card.signals.length;
    }, 0);
  }

  function renderAgentBriefingMeta() {
    var settings = getAgentSettings();
    var zonesEl = document.getElementById('agentZonesToday');
    var disabledEl = document.getElementById('agentDisabledNote');
    var grid = document.getElementById('agentGrid');
    var section = document.getElementById('agentObservationSection');
    if (!zonesEl) return;

    if (!settings.enabled) {
      zonesEl.textContent = '';
      if (disabledEl) disabledEl.hidden = false;
      if (grid) grid.hidden = true;
      if (section) section.classList.add('agent-section--disabled');
      return;
    }

    if (disabledEl) disabledEl.hidden = true;
    if (grid) grid.hidden = false;
    if (section) section.classList.remove('agent-section--disabled');

    if (_agentLoading) {
      zonesEl.textContent = 'Проверяем бумаги…';
      return;
    }

    var count = countAttentionZones(_agentCards);
    var main = count
      ? ('Сегодня: ' + count + ' ' + pluralZones(count))
      : 'Сегодня зон внимания нет';
    if (_agentLastRefreshAt) {
      var refreshed = new Date(_agentLastRefreshAt).toLocaleString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
      main += ' · данные ' + refreshed;
    }
    zonesEl.textContent = main;
  }

  function renderAgentChips(tickers) {
    var el = document.getElementById('agentSettingsTickerChips');
    if (!el) return;
    tickers = tickers || [];
    if (!tickers.length) {
      el.innerHTML = '<p class="muted agent-empty-chips">Добавьте бумаги, за которыми агент будет наблюдать.</p>';
      return;
    }
    el.innerHTML = tickers.map(function (t) {
      return (
        '<span class="agent-chip">' +
          escapeHtml(t) +
          '<button type="button" class="agent-chip-remove" data-agent-remove="' + escapeHtml(t) + '" aria-label="Удалить ' + escapeHtml(t) + '">×</button>' +
        '</span>'
      );
    }).join('');
    syncAgentSettingsControls();
  }

  function renderAgentHistory() {
    var el = document.getElementById('agentHistoryList');
    if (!el) return;
    var history = getAgentActionLog().slice(0, 10);
    if (!history.length) {
      el.innerHTML = '<p class="muted">История появится после первых сигналов или ваших действий.</p>';
      return;
    }
    el.innerHTML = history.map(function (h) {
      var dt = h.createdAt ? new Date(h.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      var typeLabel = formatLogType(h);
      var typeClass = h.type === 'action' ? 'agent-history-type agent-history-type--action' : 'agent-history-type';
      return (
        '<article class="agent-history-item">' +
          '<div class="agent-history-head">' +
            '<span class="agent-history-ticker">' + escapeHtml(h.ticker) + '</span>' +
            '<span class="' + typeClass + '">' + escapeHtml(typeLabel) + '</span>' +
            '<span class="agent-history-title">' + escapeHtml(h.title) + '</span>' +
            (h.status && h.type === 'signal' ? '<span class="agent-status ' + statusClass(h.status) + '">' + escapeHtml(h.status) + '</span>' : '') +
          '</div>' +
          (dt ? '<time class="muted agent-history-time">' + escapeHtml(dt) + (h.price != null ? ' · ' + escapeHtml(formatAgentPrice(h.price)) : '') + '</time>' : '') +
        '</article>'
      );
    }).join('');
  }

  function renderAgentCardHtml(card) {
    if (card.insufficient) {
      return (
        '<article class="agent-card agent-card--empty" data-agent-ticker="' + escapeHtml(card.ticker) + '">' +
          '<div class="agent-card-head">' +
            '<span class="agent-card-ticker">' + escapeHtml(card.ticker) + '</span>' +
          '</div>' +
          '<p class="muted">Данных пока недостаточно</p>' +
          '<div class="agent-card-actions">' +
            '<button type="button" class="ghost agent-hide-btn" data-agent-hide="' + escapeHtml(card.ticker) + '">Скрыть из наблюдения</button>' +
          '</div>' +
        '</article>'
      );
    }

    var signalsHtml = '';
    if (card.signals.length) {
      signalsHtml = '<ul class="agent-signal-titles">' +
        card.signals.map(function (sig) {
          return '<li class="agent-signal-title">' + escapeHtml(sig.title) + '</li>';
        }).join('') + '</ul>';
    } else {
      signalsHtml = '<p class="muted agent-calm-text">Сильных движений и необычного оборота не найдено.</p>';
    }

    return (
      '<article class="agent-card" data-agent-ticker="' + escapeHtml(card.ticker) + '">' +
        '<div class="agent-card-head">' +
          '<div class="agent-card-id">' +
            '<span class="agent-card-ticker">' + escapeHtml(card.ticker) + '</span>' +
            '<span class="agent-card-name muted">' + escapeHtml(card.name) + '</span>' +
          '</div>' +
          '<span class="agent-status ' + statusClass(card.status) + '">' + escapeHtml(card.status) + '</span>' +
        '</div>' +
        '<div class="agent-card-metrics">' +
          '<span class="agent-metric">' + escapeHtml(formatAgentPrice(card.currentPrice)) + '</span>' +
          '<span class="agent-metric ' + dayChangeClass(card.dayChangePct) + '">' + escapeHtml(formatAgentDayChange(card.dayChangePct)) + ' за день</span>' +
        '</div>' +
        '<div class="agent-signals-preview">' + signalsHtml + '</div>' +
        '<div class="agent-card-actions">' +
          '<button type="button" class="ghost agent-detail-btn" data-agent-detail="' + escapeHtml(card.ticker) + '">Подробнее</button>' +
          '<button type="button" class="ghost agent-hide-btn" data-agent-hide="' + escapeHtml(card.ticker) + '">Скрыть из наблюдения</button>' +
        '</div>' +
        '<div class="agent-card-expanded" id="agentExpanded-' + escapeHtml(card.ticker) + '" hidden></div>' +
      '</article>'
    );
  }

  function renderAgentGrid() {
    var grid = document.getElementById('agentGrid');
    if (!grid) return;
    if (_agentLoading) {
      grid.innerHTML = '<p class="muted">Загрузка данных агента…</p>';
      renderAgentBriefingMeta();
      return;
    }
    if (!getAgentSettings().enabled) {
      grid.innerHTML = '';
      renderAgentBriefingMeta();
      return;
    }
    if (_agentLastError) {
      grid.innerHTML = '<p class="muted agent-error">' + escapeHtml(_agentLastError) +
        ' <button type="button" class="ghost agent-retry-inline" id="agentRetryInlineBtn">Повторить</button></p>';
      var retryBtn = document.getElementById('agentRetryInlineBtn');
      if (retryBtn && !retryBtn.dataset.bound) {
        retryBtn.dataset.bound = '1';
        retryBtn.addEventListener('click', function () { refreshAgentSignals(true); });
      }
      renderAgentBriefingMeta();
      return;
    }
    if (!_agentCards.length) {
      grid.innerHTML = '<p class="muted">Список наблюдения пуст. Нажмите «Настроить», чтобы выбрать бумаги.</p>';
      renderAgentBriefingMeta();
      return;
    }
    grid.innerHTML = _agentCards.map(renderAgentCardHtml).join('');
    renderAgentBriefingMeta();
  }

  function refreshAgentSignals(force) {
    var settings = getAgentSettings();
    if (!settings.enabled) {
      _agentCards = [];
      _agentLastRefreshAt = 0;
      _agentLastError = null;
      renderAgentGrid();
      return Promise.resolve();
    }
    if (_agentLoading && !force) return Promise.resolve();
    if (!shouldRefreshAgentData(!!force)) {
      renderAgentGrid();
      return Promise.resolve();
    }
    var seq = ++_agentRefreshSeq;
    _agentLoading = true;
    _agentLastError = null;
    renderAgentGrid();
    return resolveAgentTickerList(settings).then(function (tickers) {
      if (seq !== _agentRefreshSeq) return;
      var chips = settings.tickers.length ? settings.tickers.slice() : tickers.slice();
      renderAgentChips(chips);
      if (!tickers.length) {
        _agentCards = [];
        _agentLoading = false;
        _agentLastError = 'Не удалось получить список бумаг. Проверьте интернет.';
        renderAgentGrid();
        return;
      }
      return Promise.all(tickers.map(function (ticker) {
        return fetchAgentSecurityData(ticker).then(function (data) {
          var events = findRelatedEventsForTicker(ticker);
          var signals = analyzeAgentSignals(data, events, settings);
          return {
            ticker: ticker,
            name: data.name || (typeof getTickerSubtitle === 'function' ? getTickerSubtitle(ticker) : ticker),
            currentPrice: data.currentPrice,
            dayChangePct: data.dayChangePct,
            insufficient: data.insufficient,
            signals: signals,
            status: deriveAgentStatus(signals)
          };
        });
      })).then(function (cards) {
        if (seq !== _agentRefreshSeq) return;
        _agentCards = cards;
        _agentLoading = false;
        _agentLastRefreshAt = Date.now();
        _agentLastError = null;
        var okCount = cards.filter(function (c) { return !c.insufficient; }).length;
        if (!okCount) {
          _agentLastError = 'Нет котировок MOEX по выбранным бумагам. Попробуйте обновить позже.';
        }
        appendSignalHistory(cards);
        maybeNotifyAgentAttention(cards);
        renderAgentGrid();
        renderAgentHistory();
        renderAgentLogPanel();
      });
    }).catch(function (err) {
      if (seq !== _agentRefreshSeq) return;
      _agentLoading = false;
      _agentCards = [];
      _agentLastError = 'Ошибка загрузки данных агента. Проверьте интернет и нажмите «Обновить».';
      console.warn('agent refresh failed', err);
      renderAgentGrid();
    });
  }

  function hideAgentTicker(ticker) {
    ticker = normalizeTicker(ticker);
    var settings = getAgentSettings();
    resolveAgentTickerList(settings).then(function (current) {
      var next = current.filter(function (t) { return t !== ticker; });
      setAgentSettings({
        tickers: next,
        useTopTurnoverByDefault: !next.length
      });
      refreshAgentSignals(true);
    });
  }

  function addAgentTicker(raw) {
    var input = String(raw || '').trim();
    if (!input) return;
    var settings = getAgentSettings();
    resolveAgentTickerList(settings).then(function (current) {
      var resolveP = typeof resolveTickerFromInput === 'function'
        ? resolveTickerFromInput(input)
        : Promise.resolve(normalizeTicker(input));
      resolveP.then(function (ticker) {
        ticker = normalizeTicker(ticker);
        if (!ticker) {
          showToast('Не удалось найти бумагу. Проверьте тикер.');
          return;
        }
        if (current.indexOf(ticker) >= 0) {
          showToast('Бумага уже в списке наблюдения.');
          return;
        }
        return fetchMoexQuote(ticker).then(function (q) {
          if (!q || q.price == null) {
            showToast('Не удалось найти бумагу. Проверьте тикер.');
            return;
          }
          var next = current.concat([ticker]);
          setAgentSettings({
            tickers: next,
            useTopTurnoverByDefault: !next.length
          });
          renderAgentChips(next);
          refreshAgentSignals(true);
        }).catch(function () {
          showToast('Не удалось найти бумагу. Проверьте тикер.');
        });
      });
    });
  }

  function resetAgentToTop20() {
    setAgentSettings({ tickers: [], useTopTurnoverByDefault: true });
    resolveAgentTickerList(getAgentSettings()).then(function (tickers) {
      renderAgentChips(tickers);
    });
    refreshAgentSignals(true);
  }

  function removeAgentTicker(ticker) {
    ticker = normalizeTicker(ticker);
    var settings = getAgentSettings();
    var list = settings.tickers.length ? settings.tickers.slice() : [];
    resolveAgentTickerList(settings).then(function (current) {
      var base = settings.tickers.length ? list : current;
      var next = base.filter(function (t) { return t !== ticker; });
      setAgentSettings({
        tickers: next,
        useTopTurnoverByDefault: !next.length
      });
      renderAgentChips(next.length ? next : null);
      if (!next.length) {
        resolveAgentTickerList(getAgentSettings()).then(function (list) {
          renderAgentChips(list);
        });
      }
      refreshAgentSignals(true);
    });
  }

  function toggleAgentDetail(ticker) {
    ticker = normalizeTicker(ticker);
    var card = _agentCards.find(function (c) { return c.ticker === ticker; });
    if (!card) return;
    var expanded = document.getElementById('agentExpanded-' + ticker);
    if (!expanded) return;
    var open = !expanded.hidden;
    document.querySelectorAll('.agent-card-expanded').forEach(function (el) { el.hidden = true; });
    if (open) return;
    if (card.insufficient) return;
    var html = card.signals.length
      ? card.signals.map(function (sig) {
          var eventsHtml = '';
          if (sig.events && sig.events.length) {
            eventsHtml = '<ul class="agent-event-list">' + sig.events.map(function (ev) {
              return '<li>' + escapeHtml(ev.title || '') + '</li>';
            }).join('') + '</ul>';
          }
          return (
            '<div class="agent-signal agent-signal--expanded">' +
              '<h5>' + escapeHtml(sig.title) + '</h5>' +
              '<div class="agent-reasons"><p>Почему появился сигнал:</p><ol>' +
                sig.reasons.map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') +
              '</ol></div>' +
              '<div class="agent-checklist"><p>Что проверить:</p><ul>' +
                sig.checklist.map(function (c) { return '<li>' + escapeHtml(c) + '</li>'; }).join('') +
              '</ul></div>' + eventsHtml +
              '<div class="agent-signal-actions">' +
                '<p class="muted agent-signal-actions-label">Ваша реакция на сигнал:</p>' +
                '<div class="row agent-signal-actions-row">' +
                  '<button type="button" class="primary" data-agent-log-action="buy" data-agent-ticker="' + escapeHtml(card.ticker) + '" data-agent-signal-id="' + escapeHtml(sig.id) + '" data-agent-signal-title="' + escapeHtml(sig.title) + '">Купил</button>' +
                  '<button type="button" class="ghost" data-agent-log-action="sell" data-agent-ticker="' + escapeHtml(card.ticker) + '" data-agent-signal-id="' + escapeHtml(sig.id) + '" data-agent-signal-title="' + escapeHtml(sig.title) + '">Продал</button>' +
                  '<button type="button" class="ghost" data-agent-log-action="skip" data-agent-ticker="' + escapeHtml(card.ticker) + '" data-agent-signal-id="' + escapeHtml(sig.id) + '" data-agent-signal-title="' + escapeHtml(sig.title) + '">Пропустил</button>' +
                  '<button type="button" class="ghost" data-agent-log-action="watch" data-agent-ticker="' + escapeHtml(card.ticker) + '" data-agent-signal-id="' + escapeHtml(sig.id) + '" data-agent-signal-title="' + escapeHtml(sig.title) + '">В наблюдение</button>' +
                '</div>' +
              '</div>' +
            '</div>'
          );
        }).join('')
      : '<p class="muted">Сильных движений и необычного оборота не найдено.</p>';
    expanded.innerHTML = html;
    expanded.hidden = false;
  }

  function syncAgentSettingsControls() {
    var settings = getAgentSettings();
    var enabledToggle = document.getElementById('agentEnabledToggle');
    if (enabledToggle) enabledToggle.checked = settings.enabled !== false;
    var notifyToggle = document.getElementById('agentNotifyAttention');
    if (notifyToggle) notifyToggle.checked = !!settings.notifyAttention;
    var disabled = settings.enabled === false;
    var listWrap = document.querySelector('.agent-settings-list');
    if (listWrap) listWrap.classList.toggle('agent-settings-list--disabled', disabled);
    var sensBody = document.querySelector('#agentSettingsSensitivityRoot .agent-sensitivity-body');
    if (sensBody) sensBody.classList.toggle('agent-settings-panel--disabled', disabled);
    var saveBtn = document.getElementById('agentSettingsSaveRulesBtn');
    if (saveBtn) saveBtn.disabled = false;
    var addBtn = document.getElementById('agentSettingsAddTickerBtn');
    var resetBtn = document.getElementById('agentSettingsResetTop20Btn');
    var tickerInput = document.getElementById('agentSettingsTickerInput');
    if (addBtn) addBtn.disabled = disabled;
    if (resetBtn) resetBtn.disabled = disabled;
    if (tickerInput) tickerInput.disabled = disabled;
    document.querySelectorAll('#agentSettingsTickerChips [data-agent-remove]').forEach(function (btn) {
      btn.disabled = disabled;
    });
  }

  function openAgentSettings() {
    if (typeof switchTab === 'function') switchTab('settings');
    window.setTimeout(function () {
      renderAgentSettings();
      var block = document.getElementById('agentSettingsBlock');
      if (block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function bindAgentBriefingUI() {
    if (_agentBriefingBound) return;
    _agentBriefingBound = true;

    var refreshBtn = document.getElementById('agentRefreshBtn');
    var configureBtn = document.getElementById('agentConfigureBtn');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { refreshAgentSignals(true); });
    }
    if (configureBtn) {
      configureBtn.addEventListener('click', openAgentSettings);
    }

    document.addEventListener('click', function (e) {
      var hideBtn = e.target.closest('[data-agent-hide]');
      if (hideBtn) {
        hideAgentTicker(hideBtn.getAttribute('data-agent-hide'));
        return;
      }
      var detailBtn = e.target.closest('[data-agent-detail]');
      if (detailBtn) {
        toggleAgentDetail(detailBtn.getAttribute('data-agent-detail'));
        return;
      }
      var logBtn = e.target.closest('[data-agent-log-action]');
      if (logBtn) {
        logAgentUserAction(
          logBtn.getAttribute('data-agent-ticker'),
          logBtn.getAttribute('data-agent-log-action'),
          {
            signalId: logBtn.getAttribute('data-agent-signal-id') || '',
            signalTitle: logBtn.getAttribute('data-agent-signal-title') || ''
          }
        );
      }
    });
  }

  function agentSettingsActionBlocked() {
    if (getAgentSettings().enabled !== false) return false;
    if (typeof showToast === 'function') showToast('Включите агента наблюдения');
    return true;
  }

  function bindAgentSettingsBlockActions() {
    var block = document.getElementById('agentSettingsBlock');
    if (!block || block.dataset.agentActionsBound) return;
    block.dataset.agentActionsBound = '1';
    block.addEventListener('click', function (e) {
      if (e.target.closest('#agentSettingsSaveRulesBtn')) {
        saveAgentSettingsFromUI();
        return;
      }
      if (e.target.closest('#agentSettingsAddTickerBtn')) {
        if (agentSettingsActionBlocked()) return;
        var input = document.getElementById('agentSettingsTickerInput');
        if (input) {
          addAgentTicker(input.value);
          input.value = '';
        }
        return;
      }
      if (e.target.closest('#agentSettingsResetTop20Btn')) {
        if (agentSettingsActionBlocked()) return;
        resetAgentToTop20();
        return;
      }
      var removeBtn = e.target.closest('#agentSettingsTickerChips [data-agent-remove]');
      if (removeBtn) {
        if (agentSettingsActionBlocked()) return;
        e.preventDefault();
        removeAgentTicker(removeBtn.getAttribute('data-agent-remove'));
      }
    });
    var input = document.getElementById('agentSettingsTickerInput');
    if (input && !input.dataset.agentEnterBound) {
      input.dataset.agentEnterBound = '1';
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        if (agentSettingsActionBlocked()) return;
        addAgentTicker(input.value);
        input.value = '';
      });
    }
  }

  function bindAgentSettingsUI() {
    if (_agentSettingsBound) return;
    _agentSettingsBound = true;
    ensureAgentSensitivityBound();
    bindAgentSettingsBlockActions();

    var enabledToggle = document.getElementById('agentEnabledToggle');
    if (enabledToggle) {
      enabledToggle.addEventListener('change', function () {
        setAgentSettings({ enabled: enabledToggle.checked });
        syncAgentSettingsControls();
        refreshAgentSignals(true);
      });
    }

    var notifyToggle = document.getElementById('agentNotifyAttention');
    if (notifyToggle) {
      notifyToggle.addEventListener('change', function () {
        setAgentSettings({ notifyAttention: notifyToggle.checked });
        if (notifyToggle.checked && typeof Notification !== 'undefined' &&
            Notification.permission === 'default') {
          Notification.requestPermission().catch(function () { /* */ });
        }
      });
    }

    if (typeof setupTickerAutocomplete === 'function') setupTickerAutocomplete('agentSettingsTickerInput');
  }

  function renderAgentSettings() {
    bindAgentSettingsBlockActions();
    bindAgentSettingsUI();
    syncAgentSettingsControls();
    loadAgentRulesToUI();
    var settings = getAgentSettings();
    resolveAgentTickerList(settings).then(function (tickers) {
      renderAgentChips(settings.useTopTurnoverByDefault && !settings.tickers.length
        ? tickers.slice()
        : settings.tickers.slice());
    });
    renderAgentHistory();
  }

  function renderAgentSection() {
    var section = document.getElementById('agentObservationSection');
    if (!section) return;
    bindAgentBriefingUI();
    scheduleAgentRefresh();
    renderAgentBriefingMeta();
    if (shouldRefreshAgentData(false)) {
      refreshAgentSignals(false);
    } else {
      renderAgentGrid();
    }
    renderAgentLogPanel();
  }

  window.analyzeAgentSignals = analyzeAgentSignals;
  window.loadTopTurnoverTickers = loadTopTurnoverTickers;
  window.renderAgentSection = renderAgentSection;
  window.renderAgentSettings = renderAgentSettings;
  window.openAgentSettings = openAgentSettings;
  window.refreshAgentSignals = refreshAgentSignals;
  window.invalidateAgentRefresh = function () {
    _agentLastRefreshAt = 0;
  };
  window.loadAgentRulesToUI = loadAgentRulesToUI;
})();
