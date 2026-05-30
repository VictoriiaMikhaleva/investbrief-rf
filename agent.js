/* agent.js — Агент наблюдения (не торговый бот) */
(function () {
  'use strict';

  var DEFAULT_AGENT_TICKERS = [
    'SBER', 'GAZP', 'LKOH', 'GMKN', 'TATN', 'NVTK', 'ROSN', 'SNGS', 'SNGSP',
    'PLZL', 'MGNT', 'MTSS', 'MOEX', 'AFLT', 'ALRS', 'CHMF', 'NLMK', 'SVCB', 'OZPH', 'YDEX'
  ];

  var _agentCards = [];
  var _agentLoading = false;
  var _agentListOpen = false;
  var _agentRulesOpen = false;
  var _agentBound = false;

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
      '<' + titleTag + ' class="agent-rules-title">Настроить чувствительность</' + titleTag + '>' +
      '<p class="muted agent-sensitivity-lead hint-frame">Чем чувствительнее агент, тем чаще он будет показывать зоны внимания.</p>' +
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
      '<button type="button" id="' + escapeHtml(cfg.saveBtnId) + '" class="primary agent-sensitivity-save">Сохранить настройки</button>'
    );
  }

  function mountAgentSensitivityPanels() {
    var rulesPanel = document.getElementById('agentRulesPanel');
    if (rulesPanel && !rulesPanel.dataset.mounted) {
      rulesPanel.innerHTML = buildAgentSensitivityHtml({
        prefix: 'agentRule',
        saveBtnId: 'agentSaveRulesBtn',
        headingTag: 'h4'
      });
      rulesPanel.dataset.mounted = '1';
    }
    var settingsRoot = document.getElementById('agentSettingsSensitivityRoot');
    if (settingsRoot && !settingsRoot.dataset.mounted) {
      settingsRoot.innerHTML = buildAgentSensitivityHtml({
        prefix: 'agentSettings',
        saveBtnId: 'agentSettingsSaveRulesBtn',
        headingTag: 'h3'
      });
      settingsRoot.dataset.mounted = '1';
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
    var mode = s.sensitivityMode;
    if (mode !== 'custom') {
      var detected = detectSensitivityMode(s);
      mode = detected === 'custom' ? 'custom' : (s.sensitivityMode || detected);
    }
    if (mode === 'custom') {
      ['agentRule', 'agentSettings'].forEach(function (prefix) {
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
      });
      return;
    }
    applyPresetToPanel('agentRule', mode);
    applyPresetToPanel('agentSettings', mode);
  }

  function readAgentRulesFromPanel(prefix) {
    prefix = prefix || 'agentRule';
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

  function bindAgentSensitivityPanel(prefix, saveBtnId) {
    var rootId = prefix === 'agentRule' ? 'agentRulesPanel' : 'agentSettingsSensitivityRoot';
    var root = document.getElementById(rootId);
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
    var saveBtn = document.getElementById(saveBtnId);
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var next = readAgentRulesFromPanel(prefix);
        setAgentSettings(next);
        loadAgentRulesToUI();
        refreshAgentSignals(true);
        if (typeof showToast === 'function') showToast('Настройки сохранены');
      });
    }
  }

  function ensureAgentSensitivityBound() {
    mountAgentSensitivityPanels();
    bindAgentSensitivityPanel('agentRule', 'agentSaveRulesBtn');
    bindAgentSensitivityPanel('agentSettings', 'agentSettingsSaveRulesBtn');
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
    if (settings.useTopTurnoverByDefault) {
      return loadTopTurnoverTickers(20).then(function (list) {
        return list && list.length ? list : DEFAULT_AGENT_TICKERS.slice();
      });
    }
    return Promise.resolve([]);
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
    var url = MOEX_ISS + '/history/engines/stock/markets/shares/boards/TQBR/securities/' +
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

  function appendSignalHistory(cards) {
    var history = getAgentSignalHistory();
    var now = new Date().toISOString();
    cards.forEach(function (card) {
      if (!card.signals || !card.signals.length) return;
      card.signals.forEach(function (sig) {
        var dup = history.some(function (h) {
          return h.ticker === card.ticker && h.title === sig.title &&
            (Date.now() - new Date(h.createdAt).getTime()) < 30 * 60 * 1000;
        });
        if (dup) return;
        history.unshift({
          id: card.ticker + '-' + sig.id + '-' + Date.now(),
          ticker: card.ticker,
          title: sig.title,
          status: card.status,
          createdAt: now,
          reasons: sig.reasons.slice(),
          checklist: sig.checklist.slice()
        });
      });
    });
    setAgentSignalHistory(history.slice(0, 50));
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

  function renderAgentChips(tickers) {
    var el = document.getElementById('agentTickerChips');
    if (!el) return;
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
  }

  function renderAgentHistory() {
    var el = document.getElementById('agentHistoryList');
    if (!el) return;
    var history = getAgentSignalHistory().slice(0, 5);
    if (!history.length) {
      el.innerHTML = '<p class="muted">История появится после первых сигналов.</p>';
      return;
    }
    el.innerHTML = history.map(function (h) {
      var dt = h.createdAt ? new Date(h.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      return (
        '<article class="agent-history-item">' +
          '<div class="agent-history-head">' +
            '<span class="agent-history-ticker">' + escapeHtml(h.ticker) + '</span>' +
            '<span class="agent-history-title">' + escapeHtml(h.title) + '</span>' +
            '<span class="agent-status ' + statusClass(h.status) + '">' + escapeHtml(h.status) + '</span>' +
          '</div>' +
          (dt ? '<time class="muted agent-history-time">' + escapeHtml(dt) + '</time>' : '') +
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
      return;
    }
    if (!_agentCards.length) {
      grid.innerHTML = '<p class="muted">Список наблюдения пуст. Настройте бумаги или верните топ‑20 по обороту.</p>';
      return;
    }
    grid.innerHTML = _agentCards.map(renderAgentCardHtml).join('');
  }

  function refreshAgentSignals(force) {
    var settings = getAgentSettings();
    if (!settings.enabled) {
      _agentCards = [];
      renderAgentGrid();
      return Promise.resolve();
    }
    _agentLoading = true;
    renderAgentGrid();
    return resolveAgentTickerList(settings).then(function (tickers) {
      renderAgentChips(settings.useTopTurnoverByDefault && !settings.tickers.length
        ? tickers.slice()
        : settings.tickers.slice());
      if (!tickers.length) {
        _agentCards = [];
        _agentLoading = false;
        renderAgentGrid();
        return;
      }
      return Promise.all(tickers.map(function (ticker) {
        return fetchAgentSecurityData(ticker).then(function (data) {
          var events = findRelatedEventsForTicker(ticker);
          var signals = analyzeAgentSignals(data, events, settings);
          return {
            ticker: ticker,
            name: data.name || getTickerSubtitle(ticker),
            currentPrice: data.currentPrice,
            dayChangePct: data.dayChangePct,
            insufficient: data.insufficient,
            signals: signals,
            status: deriveAgentStatus(signals)
          };
        });
      })).then(function (cards) {
        _agentCards = cards;
        _agentLoading = false;
        appendSignalHistory(cards);
        renderAgentGrid();
        renderAgentHistory();
      });
    }).catch(function () {
      _agentLoading = false;
      _agentCards = [];
      renderAgentGrid();
    });
  }

  function hideAgentTicker(ticker) {
    ticker = normalizeTicker(ticker);
    var settings = getAgentSettings();
    resolveAgentTickerList(settings).then(function (current) {
      var next = current.filter(function (t) { return t !== ticker; });
      setAgentSettings({ tickers: next, useTopTurnoverByDefault: false });
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
          setAgentSettings({ tickers: next, useTopTurnoverByDefault: false });
          refreshAgentSignals(true);
        }).catch(function () {
          showToast('Не удалось найти бумагу. Проверьте тикер.');
        });
      });
    });
  }

  function resetAgentToTop20() {
    setAgentSettings({ tickers: [], useTopTurnoverByDefault: true });
    refreshAgentSignals(true);
  }

  function removeAgentTicker(ticker) {
    ticker = normalizeTicker(ticker);
    var settings = getAgentSettings();
    var list = settings.tickers.length ? settings.tickers.slice() : [];
    resolveAgentTickerList(settings).then(function (current) {
      var base = settings.tickers.length ? list : current;
      var next = base.filter(function (t) { return t !== ticker; });
      setAgentSettings({ tickers: next, useTopTurnoverByDefault: false });
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
            '</div>'
          );
        }).join('')
      : '<p class="muted">Сильных движений и необычного оборота не найдено.</p>';
    expanded.innerHTML = html;
    expanded.hidden = false;
  }

  function bindAgentUI() {
    if (_agentBound) return;
    _agentBound = true;
    ensureAgentSensitivityBound();
    loadAgentRulesToUI();

    var refreshBtn = document.getElementById('agentRefreshBtn');
    var configBtn = document.getElementById('agentConfigureListBtn');
    var rulesBtn = document.getElementById('agentConfigureRulesBtn');
    var addBtn = document.getElementById('agentAddTickerBtn');
    var resetBtn = document.getElementById('agentResetTop20Btn');
    var input = document.getElementById('agentTickerInput');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { refreshAgentSignals(true); });
    }
    if (configBtn) {
      configBtn.addEventListener('click', function () {
        _agentListOpen = !_agentListOpen;
        var panel = document.getElementById('agentListPanel');
        if (panel) panel.hidden = !_agentListOpen;
        configBtn.setAttribute('aria-expanded', _agentListOpen ? 'true' : 'false');
      });
    }
    if (rulesBtn) {
      rulesBtn.addEventListener('click', function () {
        _agentRulesOpen = !_agentRulesOpen;
        var panel = document.getElementById('agentRulesPanel');
        if (panel) {
          panel.hidden = !_agentRulesOpen;
          if (_agentRulesOpen) loadAgentRulesToUI();
        }
        rulesBtn.setAttribute('aria-expanded', _agentRulesOpen ? 'true' : 'false');
      });
    }
    if (addBtn && input) {
      addBtn.addEventListener('click', function () { addAgentTicker(input.value); input.value = ''; });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { addAgentTicker(input.value); input.value = ''; }
      });
    }
    if (resetBtn) resetBtn.addEventListener('click', resetAgentToTop20);
    if (typeof setupTickerAutocomplete === 'function') setupTickerAutocomplete('agentTickerInput');

    document.addEventListener('click', function (e) {
      var hideBtn = e.target.closest('[data-agent-hide]');
      if (hideBtn) {
        hideAgentTicker(hideBtn.getAttribute('data-agent-hide'));
        return;
      }
      var removeBtn = e.target.closest('[data-agent-remove]');
      if (removeBtn) {
        removeAgentTicker(removeBtn.getAttribute('data-agent-remove'));
        return;
      }
      var detailBtn = e.target.closest('[data-agent-detail]');
      if (detailBtn) {
        toggleAgentDetail(detailBtn.getAttribute('data-agent-detail'));
      }
    });
  }

  function renderAgentSection() {
    var section = document.getElementById('agentObservationSection');
    if (!section) return;
    bindAgentUI();
    loadAgentRulesToUI();
    var settings = getAgentSettings();
    var chipsTickers = settings.tickers.length
      ? settings.tickers
      : [];
    if (chipsTickers.length) renderAgentChips(chipsTickers);
    renderAgentHistory();
    if (!_agentCards.length && !_agentLoading) {
      refreshAgentSignals(false);
    } else {
      renderAgentGrid();
    }
  }

  window.analyzeAgentSignals = analyzeAgentSignals;
  window.loadTopTurnoverTickers = loadTopTurnoverTickers;
  window.renderAgentSection = renderAgentSection;
  window.refreshAgentSignals = refreshAgentSignals;
  window.loadAgentRulesToUI = loadAgentRulesToUI;
})();
