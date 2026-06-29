/* pif.js — паевые инвестиционные фонды: реестр ЦБ, раскрытие, котировки БПИФ */
(function () {
  'use strict';

  var KIND_LABEL = { opif: 'ОПИФ', zpif: 'ЗПИФ', ipif: 'ИПИФ', bpif: 'БПИФ', other: 'Прочее' };
  var STATUS_LABEL = {
    formed: 'Сформирован',
    forming: 'Формируется',
    terminating: 'Прекращение',
    excluded: 'Исключён',
    formation_expired: 'Срок формирования истёк',
    registered: 'Зарегистрирован',
    approved: 'Согласован',
    other: '—'
  };
  var TYPE_CARDS = [
    { kind: 'opif', title: 'ОПИФ', text: 'Открытый фонд: паи обычно можно купить и погасить в рабочие дни у управляющей компании или через агента.' },
    { kind: 'ipif', title: 'ИПИФ', text: 'Интервальный фонд: выход из фонда — только в «окна», указанные в правилах доверительного управления.' },
    { kind: 'zpif', title: 'ЗПИФ', text: 'Закрытый фонд: часто долгосрочные и менее ликвидные активы; выход по правилам фонда или при его завершении.' },
    { kind: 'bpif', title: 'БПИФ', text: 'Биржевой фонд: паи торгуются на МосБирже через брокерский счёт; доступны котировки и расчётная стоимость (iNAV).' }
  ];

  var _catalog = [];
  var _activeCatalog = [];
  var _archiveCatalog = [];
  var _meta = null;
  var _disclosure = null;
  var _ukBundle = null;
  var _ukLive = null;
  var _archiveLoaded = false;
  var _loading = false;
  var _loadError = '';
  var _bound = false;
  var _selectedId = null;
  var _liveQuote = null;
  var _view = {
    kind: 'all',
    status: 'formed',
    search: '',
    page: 1,
    pageSize: 40,
    includeArchive: false
  };

  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function expandRow(r) {
    return {
      id: r.id,
      kind: r.k,
      kindLabel: KIND_LABEL[r.k] || r.k,
      status: r.st,
      statusLabel: STATUS_LABEL[r.st] || r.st,
      name: r.n,
      shortName: r.sn,
      category: r.cat,
      regDate: r.rd,
      termEnd: r.te,
      qualifiedOnly: r.q,
      exchangeListed: r.ex,
      ukName: r.uk,
      isin: r.isin,
      ticker: r.t,
      inavSecid: r.inav,
      hasShowcase: !!r.hs,
      ukUrl: r.url
    };
  }

  function fetchDataFile(name) {
    if (typeof getInvestbriefDataFile === 'function') {
      return getInvestbriefDataFile(name);
    }
    return fetch('./data/' + name).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function loadPifIndex() {
    if (_catalog.length && _meta) return Promise.resolve();
    _loading = true;
    _loadError = '';
    updatePifLoadStatus('Загрузка реестра ПИФ (Банк России)…');
    return fetchDataFile('pif-index.json').then(function (snap) {
      if (!snap || !snap.data || !snap.data.catalog) throw new Error('Пустой реестр');
      _meta = {
        asOf: snap.data.asOf,
        stats: snap.data.stats,
        updatedAt: snap.updatedAt,
        source: snap.source
      };
      _activeCatalog = snap.data.catalog.map(expandRow);
      _catalog = _activeCatalog.slice();
      _loading = false;
      updatePifLoadStatus();
      return snap;
    }).catch(function (err) {
      _loading = false;
      _loadError = err && err.message ? String(err.message) : 'Ошибка загрузки реестра';
      updatePifLoadStatus();
      return null;
    });
  }

  function loadPifDisclosure() {
    if (_disclosure) return Promise.resolve(_disclosure);
    return fetchDataFile('pif-disclosure.json').then(function (snap) {
      _disclosure = (snap && snap.data && snap.data.showcase) ? snap.data.showcase : {};
      return _disclosure;
    }).catch(function () {
      _disclosure = {};
      return _disclosure;
    });
  }

  function loadPifUk() {
    if (_ukBundle) return Promise.resolve(_ukBundle);
    return fetchDataFile('pif-uk.json').then(function (snap) {
      _ukBundle = (snap && snap.data) ? snap.data : { byIsin: {}, stats: {} };
      return _ukBundle;
    }).catch(function () {
      _ukBundle = { byIsin: {}, stats: {} };
      return _ukBundle;
    });
  }

  function loadPifArchive() {
    if (_archiveLoaded) return Promise.resolve();
    return fetchDataFile('pif-archive.json').then(function (snap) {
      if (snap && snap.data && snap.data.catalog) {
        _archiveCatalog = snap.data.catalog.map(expandRow);
        _archiveLoaded = true;
        rebuildCatalog();
      }
      updatePifLoadStatus();
    }).catch(function () {
      updatePifLoadStatus('Архив реестра недоступен');
    });
  }

  function rebuildCatalog() {
    _catalog = _activeCatalog.slice();
    if (_view.includeArchive && _archiveCatalog.length) {
      _catalog = _catalog.concat(_archiveCatalog);
    }
  }

  function updatePifLoadStatus(msg) {
    var el = document.getElementById('pifLoadStatus');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      return;
    }
    if (_loadError) {
      el.textContent = _loadError;
      return;
    }
    if (!_meta) {
      el.textContent = '';
      return;
    }
    var s = _meta.stats || {};
    var parts = [];
    if (_meta.asOf) parts.push('реестр ЦБ на ' + _meta.asOf);
    parts.push((s.total || _catalog.length) + ' фондов в базе');
    if (s.withShowcase) parts.push('раскрытие по ' + s.withShowcase + ' фондам');
    if (_ukBundle && _ukBundle.stats && _ukBundle.stats.total) {
      parts.push('УК: стоимость пая и СЧА по ' + _ukBundle.stats.total + ' фондам');
    }
    if (s.withMoex) parts.push('котировки MOEX: ' + s.withMoex + ' БПИФ');
    el.textContent = parts.join(' · ');
  }

  function renderTypeCards() {
    var grid = document.getElementById('pifTypeGrid');
    if (!grid) return;
    grid.innerHTML = TYPE_CARDS.map(function (c) {
      return '<article class="pif-type-card" data-pif-kind-card="' + c.kind + '">' +
        '<h4 class="pif-type-card__title">' + esc(c.title) + '</h4>' +
        '<p class="muted pif-type-card__text">' + esc(c.text) + '</p>' +
        '</article>';
    }).join('');
    grid.querySelectorAll('[data-pif-kind-card]').forEach(function (card) {
      card.addEventListener('click', function () {
        _view.kind = card.getAttribute('data-pif-kind-card');
        _view.page = 1;
        var sel = document.getElementById('pifFilterKind');
        if (sel) sel.value = _view.kind;
        applyPifTableView();
      });
    });
  }

  function filteredRows() {
    var q = _view.search.trim().toLowerCase();
    var activeStatuses = ['formed', 'forming', 'terminating', 'registered', 'approved', 'formation_expired'];
    return _catalog.filter(function (r) {
      if (_view.kind !== 'all' && r.kind !== _view.kind) return false;
      if (_view.status !== 'all') {
        if (r.status !== _view.status) return false;
      } else if (activeStatuses.indexOf(r.status) < 0 && !_view.includeArchive) {
        return false;
      }
      if (!q) return true;
      var hay = [r.id, r.name, r.shortName, r.ukName, r.ticker, r.isin, r.category].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    }).sort(function (a, b) {
      if (a.status === 'formed' && b.status !== 'formed') return -1;
      if (b.status === 'formed' && a.status !== 'formed') return 1;
      if (a.kind === 'bpif' && b.kind !== 'bpif') return -1;
      if (b.kind === 'bpif' && a.kind !== 'bpif') return 1;
      return (a.shortName || a.name).localeCompare(b.shortName || b.name, 'ru');
    });
  }

  function renderPifTable() {
    var tbody = document.getElementById('pifTableBody');
    var note = document.getElementById('pifTableNote');
    if (!tbody) return;
    if (_loading) {
      tbody.innerHTML = '<tr><td colspan="9" class="muted">Загрузка…</td></tr>';
      if (note) note.textContent = '';
      return;
    }
    var rows = filteredRows();
    var totalPages = Math.max(1, Math.ceil(rows.length / _view.pageSize));
    if (_view.page > totalPages) _view.page = totalPages;
    var start = (_view.page - 1) * _view.pageSize;
    var pageRows = rows.slice(start, start + _view.pageSize);
    if (!pageRows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="muted">Ничего не найдено</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(function (r, idx) {
        var sel = r.id === _selectedId ? ' pif-row--selected' : '';
        var tickerCell = r.ticker
          ? '<button type="button" class="linkish" data-pif-ticker="' + esc(r.ticker) + '">' + esc(r.ticker) + '</button>'
          : '—';
        return '<tr class="pif-row' + sel + '" data-pif-id="' + esc(r.id) + '">' +
          '<td>' + (start + idx + 1) + '</td>' +
          '<td>' + esc(r.kindLabel) + '</td>' +
          '<td>' + esc(r.statusLabel) + '</td>' +
          '<td class="pif-name-cell" title="' + esc(r.name) + '">' + esc(r.shortName || r.name) + '</td>' +
          '<td class="muted">' + esc(r.category) + '</td>' +
          '<td class="muted pif-uk-cell" title="' + esc(r.ukName) + '">' + esc(r.ukName) + '</td>' +
          '<td>' + tickerCell + '</td>' +
          '<td class="muted">' + (r.hasShowcase ? 'да' : '—') + '</td>' +
          '<td>' + (r.qualifiedOnly ? 'Да' : (r.qualifiedOnly === false ? 'Нет' : '—')) + '</td>' +
          '</tr>';
      }).join('');
    }
    if (note) {
      note.textContent = 'Показано ' + (pageRows.length ? (start + 1) + '–' + (start + pageRows.length) : '0') +
        ' из ' + rows.length + ' · стр. ' + _view.page + ' / ' + totalPages;
    }
    var pag = document.getElementById('pifPagination');
    if (pag) {
      pag.innerHTML =
        '<button type="button" class="ghost small" id="pifPagePrev"' + (_view.page <= 1 ? ' disabled' : '') + '>←</button>' +
        '<span class="muted">' + _view.page + ' / ' + totalPages + '</span>' +
        '<button type="button" class="ghost small" id="pifPageNext"' + (_view.page >= totalPages ? ' disabled' : '') + '>→</button>';
      var prev = document.getElementById('pifPagePrev');
      var next = document.getElementById('pifPageNext');
      if (prev) prev.addEventListener('click', function () { if (_view.page > 1) { _view.page--; applyPifTableView(); } });
      if (next) next.addEventListener('click', function () { if (_view.page < totalPages) { _view.page++; applyPifTableView(); } });
    }
  }

  function formatPct(v) {
    if (v == null || !isFinite(v)) return '—';
    var sign = v > 0 ? '+' : '';
    return sign + v.toFixed(2).replace('.', ',') + '%';
  }

  function formatRubLarge(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' млрд ₽';
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' млн ₽';
    return Number(v).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + ' ₽';
  }

  function lookupUkForRow(row) {
    if (_ukLive && row && row.isin && _ukLive.isin === row.isin) return _ukLive;
    if (!_ukBundle || !row) return null;
    if (row.isin && _ukBundle.byIsin && _ukBundle.byIsin[row.isin]) return _ukBundle.byIsin[row.isin];
    var name = (row.shortName || row.name || '').toLowerCase();
    if (!name || !_ukBundle.byIsin) return null;
    var keys = Object.keys(_ukBundle.byIsin);
    for (var i = 0; i < keys.length; i++) {
      var f = _ukBundle.byIsin[keys[i]];
      var fn = (f.fundName || '').toLowerCase();
      if (fn && (name.indexOf(fn.slice(0, 22)) >= 0 || fn.indexOf(name.slice(0, 22)) >= 0)) return f;
    }
    return null;
  }

  function buildCompositionHtml(uk) {
    if (!uk || !uk.composition || !uk.composition.length) return '';
    var rows = uk.composition.slice(0, 20).map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td class="muted">' + esc(c.isin || '—') + '</td><td>' +
        (c.pct != null ? c.pct.toFixed(2).replace('.', ',') + '%' : '—') + '</td><td class="muted">' +
        formatRubLarge(c.valueRub) + '</td></tr>';
    }).join('');
    var more = uk.composition.length > 20
      ? '<p class="muted pif-comp-more">и ещё ' + (uk.composition.length - 20) + ' позиций — см. сайт УК</p>'
      : '';
    return '<h4 class="analytics-chart-lbl pif-comp-title">Состав портфеля · ' + esc(uk.ukLabel || 'УК') + '</h4>' +
      '<p class="muted analytics-chart-note">На дату ' + esc(uk.shareDate || '—') + ' · ' + esc(uk.source || '') + '</p>' +
      '<div class="table-wrap pif-comp-wrap"><table class="strategy-table pif-comp-table"><thead><tr>' +
      '<th>Актив</th><th>ISIN</th><th>Доля</th><th>Стоимость</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + more;
  }

  function formatPrice(v) {
    if (v == null || !isFinite(v)) return '—';
    return Number(v).toFixed(4).replace('.', ',') + ' ₽';
  }

  function renderPifDetail(row) {
    var panel = document.getElementById('pifDetailPanel');
    if (!panel) return;
    if (!row) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    var title = document.getElementById('pifDetailTitle');
    var meta = document.getElementById('pifDetailMeta');
    var body = document.getElementById('pifDetailBody');
    var links = document.getElementById('pifDetailLinks');
    if (title) title.textContent = row.shortName || row.name;
    if (meta) {
      meta.innerHTML = '<span class="tag">' + esc(row.kindLabel) + '</span> ' +
        '<span class="tag">' + esc(row.statusLabel) + '</span>' +
        (row.ticker ? ' <span class="tag">' + esc(row.ticker) + '</span>' : '');
    }
    var kpis = document.getElementById('pifDetailKpis');
    var uk = lookupUkForRow(row);
    if (kpis) {
      var live = _liveQuote || {};
      kpis.innerHTML =
        '<div class="pif-kpi"><span class="pif-kpi-lbl">Правила ДУ</span><span class="pif-kpi-val">' + esc(row.id) + '</span></div>' +
        (uk && uk.sharePrice != null ? '<div class="pif-kpi"><span class="pif-kpi-lbl">Стоимость пая</span><span class="pif-kpi-val">' + formatPrice(uk.sharePrice) + '</span></div>' : '') +
        (uk && uk.shareDate ? '<div class="pif-kpi"><span class="pif-kpi-lbl">Дата пая</span><span class="pif-kpi-val">' + esc(uk.shareDate) + '</span></div>' : '') +
        (uk && uk.schaRub != null ? '<div class="pif-kpi"><span class="pif-kpi-lbl">СЧА (оценка)</span><span class="pif-kpi-val">' + formatRubLarge(uk.schaRub) + '</span></div>' : '') +
        (uk && uk.yield12m != null ? '<div class="pif-kpi"><span class="pif-kpi-lbl">Дох. 12 мес.</span><span class="pif-kpi-val">' + formatPct(uk.yield12m) + '</span></div>' : '') +
        (row.ticker ? '<div class="pif-kpi"><span class="pif-kpi-lbl">Цена MOEX</span><span class="pif-kpi-val">' + formatPrice(live.last) + '</span></div>' : '') +
        (live.inav != null ? '<div class="pif-kpi"><span class="pif-kpi-lbl">iNAV</span><span class="pif-kpi-val">' + formatPrice(live.inav) + '</span></div>' : '') +
        (live.premium != null ? '<div class="pif-kpi"><span class="pif-kpi-lbl">Премия к iNAV</span><span class="pif-kpi-val">' + formatPct(live.premium) + '</span></div>' : '') +
        (live.vol != null ? '<div class="pif-kpi"><span class="pif-kpi-lbl">Оборот</span><span class="pif-kpi-val">' + (live.vol / 1e6).toFixed(1).replace('.', ',') + ' млн ₽</span></div>' : '');
    }
    var disc = _disclosure && _disclosure[row.id] ? _disclosure[row.id] : null;
    if (body) {
      var html = '';
      if (uk) {
        html += '<p class="muted pif-uk-source">Данные УК: <strong>' + esc(uk.ukLabel || '—') + '</strong>';
        if (uk.fundUrl) html += ' · <a href="' + esc(uk.fundUrl) + '" target="_blank" rel="noopener noreferrer">страница фонда</a>';
        html += '</p>';
        html += buildCompositionHtml(uk);
      } else {
        html += '<p class="muted pif-uk-missing">Стоимость пая, СЧА и состав с сайта УК пока не подгружены для этого фонда. Откройте сайт управляющей компании из ссылок ниже — там обязательное раскрытие по 5609-У.</p>';
      }
      html += '<dl class="pif-detail-dl">';
      html += '<dt>Управляющая компания</dt><dd>' + esc(row.ukName || '—') + '</dd>';
      html += '<dt>Категория</dt><dd>' + esc(row.category || '—') + '</dd>';
      if (row.isin) html += '<dt>ISIN</dt><dd>' + esc(row.isin) + '</dd>';
      html += '<dt>Биржевой оборот</dt><dd>' + (row.exchangeListed ? 'Да' : (row.exchangeListed === false ? 'Нет' : '—')) + '</dd>';
      html += '<dt>Для квал. инвесторов</dt><dd>' + (row.qualifiedOnly ? 'Да' : (row.qualifiedOnly === false ? 'Нет' : '—')) + '</dd>';
      html += '<dt>Полное название</dt><dd>' + esc(row.name) + '</dd>';
      if (disc) {
        html += '<dt class="pif-detail-section">Раскрытие ЦБ</dt><dd></dd>';
        if (disc.stype) html += '<dt>Стратегия</dt><dd>' + esc(disc.stype) + '</dd>';
        if (disc.bench) html += '<dt>Бенчмарк</dt><dd>' + esc(disc.bench) + '</dd>';
        if (disc.fee) html += '<dt>Вознаграждение УК</dt><dd>' + esc(disc.fee) + '</dd>';
        if (disc.feeOk && disc.feeOk !== 'не предусмотрено') html += '<dt>За успех</dt><dd>' + esc(disc.feeOk) + '</dd>';
        if (disc.feeMax) html += '<dt>Макс. расходы</dt><dd>' + esc(disc.feeMax) + '</dd>';
        if (disc.ret12) html += '<dt>Доходность пая 12 мес.</dt><dd>' + esc(disc.ret12) + '</dd>';
        if (disc.surcharge && disc.surcharge !== 'не предусмотрено') html += '<dt>Надбавки</dt><dd class="pif-multiline">' + esc(disc.surcharge) + '</dd>';
        if (disc.discount && disc.discount !== 'не предусмотрено') html += '<dt>Скидки</dt><dd class="pif-multiline">' + esc(disc.discount) + '</dd>';
      } else if (!row.hasShowcase) {
        html += '<dt class="pif-detail-section">Раскрытие</dt><dd class="muted">Подробные параметры из витрины ЦБ доступны не для всех фондов (в т.ч. ЗПИФ для квал. инвесторов). Смотрите сайт УК и правила ДУ.</dd>';
      }
      html += '</dl>';
      body.innerHTML = html;
    }
    if (links) {
      var parts = [];
      var ukRow = lookupUkForRow(row);
      var ukSite = (disc && disc.ukUrl) || row.ukUrl || (ukRow && ukRow.ukUrl);
      if (ukSite) parts.push('<a href="' + esc(ukSite) + '" target="_blank" rel="noopener noreferrer">Сайт УК</a>');
      if (ukRow && ukRow.fundUrl) parts.push('<a href="' + esc(ukRow.fundUrl) + '" target="_blank" rel="noopener noreferrer">Фонд на сайте УК</a>');
      if (row.ticker) {
        parts.push('<a href="https://www.moex.com/ru/issue.aspx?board=TQBR&amp;code=' + encodeURIComponent(row.ticker) + '" target="_blank" rel="noopener noreferrer">Карточка на МосБирже</a>');
      }
      parts.push('<a href="https://cbr.ru/RSCI/data_showcase/" target="_blank" rel="noopener noreferrer">Витрина данных ЦБ</a>');
      parts.push('<a href="https://cbr.ru/vfs/finmarkets/files/supervision/list_PIF.xlsx" target="_blank" rel="noopener noreferrer">Реестр ЦБ (XLSX)</a>');
      links.innerHTML = parts.join(' · ');
    }
  }

  function fetchBpifLive(row) {
    _liveQuote = null;
    if (!row || !row.ticker || typeof moexFetchJson !== 'function') {
      renderPifDetail(row);
      return Promise.resolve();
    }
    var t = row.ticker;
    var priceUrl = (typeof MOEX_ISS !== 'undefined' ? MOEX_ISS : 'https://iss.moex.com/iss') +
      '/engines/stock/markets/shares/boards/TQBR/securities/' + encodeURIComponent(t) +
      '/marketdata.json?iss.meta=off&iss.only=marketdata&marketdata.columns=LAST,VALTODAY,SPREAD,BID,OFFER,SYSTIME';
    var inavUrl = row.inavSecid
      ? (typeof MOEX_ISS !== 'undefined' ? MOEX_ISS : 'https://iss.moex.com/iss') +
        '/engines/stock/markets/index/securities/' + encodeURIComponent(row.inavSecid) +
        '/marketdata.json?iss.meta=off&iss.only=marketdata&marketdata.columns=CURRENTVALUE,SYSTIME'
      : null;
    var p1 = moexFetchJson(priceUrl).then(function (json) {
      var md = json.marketdata;
      if (!md || !md.data || !md.data[0]) return {};
      var cols = md.columns;
      var li = cols.indexOf('LAST');
      var vi = cols.indexOf('VALTODAY');
      return {
        last: li >= 0 ? Number(md.data[0][li]) : null,
        vol: vi >= 0 ? Number(md.data[0][vi]) : null
      };
    }).catch(function () { return {}; });
    var p2 = inavUrl
      ? moexFetchJson(inavUrl).then(function (json) {
          var md = json.marketdata;
          if (!md || !md.data || !md.data[0]) return {};
          var ci = md.columns.indexOf('CURRENTVALUE');
          return { inav: ci >= 0 ? Number(md.data[0][ci]) : null };
        }).catch(function () { return {}; })
      : Promise.resolve({});
    return Promise.all([p1, p2]).then(function (pair) {
      var q = Object.assign({}, pair[0], pair[1]);
      if (q.last != null && q.inav != null && q.inav > 0) {
        q.premium = ((q.last - q.inav) / q.inav) * 100;
      }
      _liveQuote = q;
      if (_selectedId === row.id) renderPifDetail(row);
    });
  }

  function fetchUkLive(row) {
    _ukLive = null;
    if (!row) return Promise.resolve();
    var params = [];
    if (row.isin) params.push('isin=' + encodeURIComponent(row.isin));
    if (row.shortName || row.name) params.push('name=' + encodeURIComponent(row.shortName || row.name));
    if (!params.length) return Promise.resolve();
    return fetch('/api/pif/uk?' + params.join('&')).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (json) {
      if (json && json.fund && _selectedId === row.id) {
        _ukLive = json.fund;
        renderPifDetail(row);
      }
    }).catch(function () { return null; });
  }

  function selectPifRow(id) {
    _selectedId = id;
    var row = _catalog.find(function (r) { return r.id === id; }) || null;
    _liveQuote = null;
    _ukLive = null;
    renderPifTable();
    if (!row) {
      renderPifDetail(null);
      return Promise.resolve();
    }
    return loadPifDisclosure().then(function () {
      return loadPifUk();
    }).then(function () {
      renderPifDetail(row);
      return Promise.all([fetchBpifLive(row), fetchUkLive(row)]);
    });
  }

  function applyPifTableView() {
    renderPifTable();
  }

  function bindPifUI() {
    if (_bound) return;
    _bound = true;
    renderTypeCards();

    var section = document.getElementById('pifSection');
    if (section) {
      section.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !t.id) return;
        if (t.id === 'pifFilterKind') { _view.kind = t.value; _view.page = 1; applyPifTableView(); }
        if (t.id === 'pifFilterStatus') { _view.status = t.value; _view.page = 1; applyPifTableView(); }
        if (t.id === 'pifIncludeArchive') {
          _view.includeArchive = !!t.checked;
          if (_view.includeArchive) {
            loadPifArchive().then(function () { rebuildCatalog(); applyPifTableView(); });
          } else {
            rebuildCatalog();
            applyPifTableView();
          }
        }
      });
      section.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'pifFilterSearch') {
          _view.search = e.target.value;
          _view.page = 1;
          clearTimeout(section._pifSearchTimer);
          section._pifSearchTimer = setTimeout(applyPifTableView, 200);
        }
      });
      section.addEventListener('click', function (e) {
        var tr = e.target.closest('[data-pif-id]');
        if (tr) {
          selectPifRow(tr.getAttribute('data-pif-id'));
          return;
        }
        if (e.target.id === 'pifFilterResetBtn') {
          _view.kind = 'all';
          _view.status = 'formed';
          _view.search = '';
          _view.page = 1;
          var k = document.getElementById('pifFilterKind');
          var s = document.getElementById('pifFilterStatus');
          var q = document.getElementById('pifFilterSearch');
          if (k) k.value = 'all';
          if (s) s.value = 'formed';
          if (q) q.value = '';
          applyPifTableView();
        }
        if (e.target.id === 'pifRefreshBtn') loadPifData(true);
        if (e.target.id === 'pifArticleBtn' && typeof openArticleModal === 'function') {
          openArticleModal('pif-types-overview');
        }
      });
    }

    var refreshBtn = document.getElementById('pifRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { loadPifData(true); });
  }

  function loadPifData(force) {
    if (_loading && !force) return Promise.resolve();
    if (force) {
      _catalog = [];
      _activeCatalog = [];
      _archiveCatalog = [];
      _meta = null;
      _disclosure = null;
      _ukBundle = null;
      _ukLive = null;
      _archiveLoaded = false;
    }
    return loadPifIndex().then(function () {
      return loadPifUk();
    }).then(function () {
      if (!_catalog.length) return;
      applyPifTableView();
      if (_selectedId) selectPifRow(_selectedId);
    });
  }

  function renderPifSection() {
    var section = document.getElementById('pifSection');
    if (!section) return;
    if (typeof Markets !== 'undefined' && !Markets.getMarketsEnabled().ru) {
      section.closest('.panel').hidden = true;
      return;
    }
    bindPifUI();
    if (!_catalog.length && !_loading) loadPifData(false);
    else applyPifTableView();
  }

  window.renderPifSection = renderPifSection;
  window.loadPifData = loadPifData;
})();
