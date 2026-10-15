/* article-market-sectors.js: датированное исследование секторных долей (срез 2026-10-13) */
(function () {
  'use strict';

  /**
   * Публикационный снимок. Цифры скопированы из
   * research/market-sectors/final/article-facts.json и не обновляются live.
   */
  var PUBLICATION_FACTS = {
    analysisDate: '2026-10-13',
    turnoverStartDate: '2025-10-14',
    turnoverEndDate: '2026-10-13',
    tradingDayCount: 254,
    securityCount: 259,
    universeCompanyCount: 217,
    sectors: [
      { sector: 'Энергетика', marketCapSharePct: 46.0855, turnoverSharePct: 32.4292 },
      { sector: 'Финансы', marketCapSharePct: 20.8854, turnoverSharePct: 26.9693 },
      { sector: 'Материалы', marketCapSharePct: 16.9903, turnoverSharePct: 16.5729 },
      { sector: 'Потребительский сектор', marketCapSharePct: 4.5965, turnoverSharePct: 8.9632 },
      { sector: 'Информационные технологии', marketCapSharePct: 3.943, turnoverSharePct: 5.4719 },
      { sector: 'Промышленность', marketCapSharePct: 3.6973, turnoverSharePct: 2.6011 },
      { sector: 'Коммуникационные услуги', marketCapSharePct: 1.8475, turnoverSharePct: 2.4257 },
      { sector: 'Недвижимость', marketCapSharePct: 1.2, turnoverSharePct: 4.1732 },
      { sector: 'Здравоохранение', marketCapSharePct: 0.7546, turnoverSharePct: 0.3935 }
    ],
    imoex: {
      securityCount: 44,
      companyCount: 41,
      classifiedCapSharePct: 78.1701,
      classifiedTurnoverSharePct: 83.2229
    },
    concentration: {
      top10MarketCapSharePct: 63.1216,
      top10TurnoverSharePct: 54.6461
    },
    samolet: {
      ticker: 'SMLT',
      securityTurnoverRub: 738900125751.2002,
      marketCapRub: 15185469682.8
    }
  };

  var ILLUSTRATIVE_PORTFOLIO = [
    { sector: 'Финансы', portfolioPct: 38 },
    { sector: 'Энергетика', portfolioPct: 15 },
    { sector: 'Материалы', portfolioPct: 22 }
  ];

  function round1(n) {
    return Math.round(Number(n) * 10) / 10;
  }

  function formatPct1(n) {
    return round1(n).toFixed(1).replace('.', ',') + '%';
  }

  function formatCapShare(name) {
    var s = sectorByName(name);
    return s ? formatPct1(s.marketCapSharePct) : '';
  }

  function formatWhole(n) {
    return String(Math.round(Number(n)));
  }

  function formatBn1(rub) {
    return round1(Number(rub) / 1e9).toFixed(1).replace('.', ',');
  }

  function formatRuDate(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) return iso;
    var months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    var month = months[Number(parts[1]) - 1];
    return Number(parts[2]) + ' ' + month + ' ' + parts[0] + ' года';
  }

  function sectorByName(name) {
    var i;
    for (i = 0; i < PUBLICATION_FACTS.sectors.length; i++) {
      if (PUBLICATION_FACTS.sectors[i].sector === name) return PUBLICATION_FACTS.sectors[i];
    }
    return null;
  }

  function capPct(name) {
    return formatCapShare(name);
  }

  function toPct(name) {
    var s = sectorByName(name);
    return s ? formatPct1(s.turnoverSharePct) : '';
  }

  function articleTable(className, headers, rows) {
    var html = '<div class="article-table-scroll"><table class="strategy-table' +
      (className ? ' ' + className : '') + '"><thead><tr>';
    headers.forEach(function (h) { html += '<th>' + h + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>'; }).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function maxShare(values) {
    var m = 0;
    values.forEach(function (v) { if (v > m) m = v; });
    return m || 1;
  }

  function barWidth(value, max) {
    var pct = (Number(value) / max) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    return pct.toFixed(2) + '%';
  }

  function buildCapStructureChartHtml() {
    var sectors = PUBLICATION_FACTS.sectors;
    var max = maxShare(sectors.map(function (s) { return s.marketCapSharePct; }));
    var rows = sectors.map(function (s) {
      return '<div class="article-hbar-row">' +
        '<div class="article-hbar-label">' + s.sector + '</div>' +
        '<div class="article-hbar-track" aria-hidden="true">' +
          '<div class="article-hbar-fill" style="width:' + barWidth(s.marketCapSharePct, max) + '"></div>' +
        '</div>' +
        '<div class="article-hbar-value">' + formatCapShare(s.sector) + '</div>' +
      '</div>';
    }).join('');
    return '<figure class="article-sector-chart">' +
      '<figcaption>Структура российского рынка по секторам</figcaption>' +
      '<p class="article-chart-note">Доля классифицированной капитализации на ' +
        formatRuDate(PUBLICATION_FACTS.analysisDate) + '.</p>' +
      '<div class="article-hbar-list" role="img" aria-label="Горизонтальные столбцы: доля капитализации девяти секторов">' +
        rows +
      '</div>' +
    '</figure>';
  }

  function buildCapVsTurnoverChartHtml() {
    var sectors = PUBLICATION_FACTS.sectors;
    var max = maxShare(sectors.map(function (s) {
      return Math.max(s.marketCapSharePct, s.turnoverSharePct);
    }));
    var rows = sectors.map(function (s) {
      return '<div class="article-gbar-row">' +
        '<div class="article-gbar-label">' + s.sector + '</div>' +
        '<div class="article-gbar-pair">' +
          '<div class="article-gbar-item">' +
            '<span class="article-gbar-key article-gbar-key--cap">Капитализация</span>' +
            '<div class="article-hbar-track" aria-hidden="true">' +
              '<div class="article-hbar-fill article-hbar-fill--cap" style="width:' +
                barWidth(s.marketCapSharePct, max) + '"></div>' +
            '</div>' +
            '<span class="article-hbar-value">' + formatCapShare(s.sector) + '</span>' +
          '</div>' +
          '<div class="article-gbar-item">' +
            '<span class="article-gbar-key article-gbar-key--to">Оборот 12 мес.</span>' +
            '<div class="article-hbar-track" aria-hidden="true">' +
              '<div class="article-hbar-fill article-hbar-fill--to" style="width:' +
                barWidth(s.turnoverSharePct, max) + '"></div>' +
            '</div>' +
            '<span class="article-hbar-value">' + formatPct1(s.turnoverSharePct) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<figure class="article-sector-chart article-sector-chart--compare">' +
      '<figcaption>Размер сектора и торговая активность</figcaption>' +
      '<p class="article-chart-note">Капитализация на ' +
        formatRuDate(PUBLICATION_FACTS.analysisDate) +
        ' и доля оборота с ' + formatRuDate(PUBLICATION_FACTS.turnoverStartDate) +
        ' по ' + formatRuDate(PUBLICATION_FACTS.turnoverEndDate) + '.</p>' +
      '<div class="article-chart-legend" aria-hidden="true">' +
        '<span><i class="article-legend-swatch article-legend-swatch--cap"></i>Капитализация</span>' +
        '<span><i class="article-legend-swatch article-legend-swatch--to"></i>Оборот за 12 месяцев</span>' +
      '</div>' +
      '<div class="article-gbar-list" role="img" aria-label="Сравнение доли капитализации и доли оборота по девяти секторам">' +
        rows +
      '</div>' +
    '</figure>';
  }

  function top3CapSumRounded() {
    var energy = sectorByName('Энергетика');
    var finance = sectorByName('Финансы');
    var materials = sectorByName('Материалы');
    return round1(energy.marketCapSharePct) +
      round1(finance.marketCapSharePct) +
      round1(materials.marketCapSharePct);
  }

  function restCapRounded() {
    return round1(100 - top3CapSumRounded());
  }

  function sectorTableRows() {
    return PUBLICATION_FACTS.sectors.map(function (s) {
      return [s.sector, formatCapShare(s.sector)];
    });
  }

  function turnoverHighlightRows() {
    return [
      ['Энергетика', capPct('Энергетика'), toPct('Энергетика')],
      ['Финансы', capPct('Финансы'), toPct('Финансы')],
      ['Потребительский сектор', capPct('Потребительский сектор'), toPct('Потребительский сектор')],
      ['Недвижимость', capPct('Недвижимость'), toPct('Недвижимость')]
    ];
  }

  function illustrationRows() {
    return ILLUSTRATIVE_PORTFOLIO.map(function (row) {
      return [row.sector, formatWhole(row.portfolioPct) + '%', capPct(row.sector)];
    });
  }

  function disclaimer() {
    return '<p class="muted">Материал носит образовательный характер и не является индивидуальной инвестиционной рекомендацией.</p>';
  }

  function buildMarketSectorProportionsArticleBodyHtml() {
    var f = PUBLICATION_FACTS;
    var energy = capPct('Энергетика');
    var finance = capPct('Финансы');
    var materials = capPct('Материалы');
    var financeAbout = formatWhole(sectorByName('Финансы').marketCapSharePct) + '%';
    var energyWhole = formatWhole(sectorByName('Энергетика').marketCapSharePct);
    var financeWhole = formatWhole(sectorByName('Финансы').marketCapSharePct);
    var materialsWhole = formatWhole(sectorByName('Материалы').marketCapSharePct);
    var restWhole = formatWhole(restCapRounded());
    var imoexCap = formatPct1(f.imoex.classifiedCapSharePct);
    var imoexTo = formatPct1(f.imoex.classifiedTurnoverSharePct);
    var top10Cap = formatPct1(f.concentration.top10MarketCapSharePct);
    var top10To = formatPct1(f.concentration.top10TurnoverSharePct);
    var smltTo = formatBn1(f.samolet.securityTurnoverRub);
    var smltCap = formatBn1(f.samolet.marketCapRub);

    return '' +
      '<p class="article-kicker">Что показывает структура российского рынка акций, если использовать её как точку сравнения для собственного портфеля.</p>' +
      '<h3>Главное за минуту</h3>' +
      '<p>Российский рынок акций распределён между секторами очень неравномерно. Почти 84% классифицированной капитализации приходится всего на три направления: энергетику, финансы и материалы.</p>' +
      '<p>Это можно использовать как ориентир для анализа собственного портфеля. Не для того, чтобы копировать рыночные доли, а чтобы увидеть: какие сектора в портфеле занимают заметно большую или меньшую долю, чем на рынке в целом.</p>' +
      '<p>По данным исследования ИнвестБрифа на ' + formatRuDate(f.analysisDate) +
        ', энергетика занимает около ' + energy + ' классифицированной капитализации рынка, финансы — ' +
        finance + ', материалы — ' + materials + '.</p>' +
      '<p><strong>Главная мысль:</strong> структура рынка — это точка сравнения, а не готовая схема портфеля.</p>' +
      '<h3>Как российский рынок распределён по секторам</h3>' +
      '<p>В исследование вошли ' + f.securityCount + ' торгуемых выпусков ' + f.universeCompanyCount +
        ' компаний основного режима торгов акциями Московской биржи. Фонды, ETF и другие неакционные инструменты в выборку не включались.</p>' +
      '<p>Секторная структура классифицированной части рынка выглядит так:</p>' +
      articleTable('article-sector-table', ['Сектор', 'Доля капитализации'], sectorTableRows()) +
      buildCapStructureChartHtml() +
      '<p>Главная особенность видна сразу: рынок сильно концентрирован.</p>' +
      '<p>На энергетику, финансы и материалы вместе приходится почти 84% классифицированной капитализации. Остальные шесть секторов делят между собой примерно шестую часть рынка.</p>' +
      '<h3>Что эти пропорции означают для портфеля</h3>' +
      '<p>Удобно представить структуру рынка на условных 100 рублях.</p>' +
      '<p>Примерно ' + energyWhole + ' рублей из них приходились бы на энергетику, ' +
        financeWhole + ' — на финансы и ' + materialsWhole +
        ' — на материалы. На все остальные сектора вместе оставалось бы около ' + restWhole + ' рублей.</p>' +
      '<p>Это не модель «правильного» портфеля.</p>' +
      '<p>Такое представление всего лишь показывает, насколько сам российский рынок смещён в сторону нескольких крупных направлений.</p>' +
      '<p>Поэтому портфель, который полностью повторял бы структуру рынка, тоже оказался бы достаточно концентрированным.</p>' +
      '<h3>Зачем сравнивать свой портфель с рынком</h3>' +
      '<p>Рыночные доли можно использовать как benchmark — точку отсчёта.</p>' +
      '<p>Представим, что финансы занимают в портфеле 38%, тогда как их доля в классифицированной капитализации рынка составляет около ' +
        financeAbout + '.</p>' +
      '<p>Само по себе это не говорит, что долю нужно уменьшить. Но показывает важный факт: портфель заметно сильнее рынка сконцентрирован в финансовом секторе.</p>' +
      '<p>То же работает и в обратную сторону. Если энергетика составляет 15% портфеля против примерно ' +
        energy + ' рынка, структура портфеля существенно отличается от рыночной.</p>' +
      '<p>Ценность такого сравнения не в том, чтобы автоматически исправлять отклонения, а в том, чтобы их видеть.</p>' +
      '<h3>Размер сектора и торговая активность — разные вещи</h3>' +
      '<p>Капитализация показывает размер сектора относительно рынка.</p>' +
      '<p>Оборот отвечает на другой вопрос: какая доля торговой активности приходится на его бумаги.</p>' +
      '<p>Для сравнения мы рассчитали оборот за 12 месяцев — с ' +
        formatRuDate(f.turnoverStartDate) + ' по ' + formatRuDate(f.turnoverEndDate) + '.</p>' +
      articleTable(
        'article-sector-table',
        ['Сектор', 'Доля капитализации', 'Доля оборота'],
        turnoverHighlightRows()
      ) +
      buildCapVsTurnoverChartHtml() +
      '<p>Энергетика заметно крупнее по капитализации, чем её доля в торговом обороте. У финансов, потребительского сектора и недвижимости соотношение обратное.</p>' +
      '<p>Это не означает, что один сектор «лучше» или «хуже» другого. Размер сектора и интенсивность торговли его бумагами просто описывают разные стороны рынка.</p>' +
      '<h3>Почему выделяется недвижимость</h3>' +
      '<p>На недвижимость приходится около ' + capPct('Недвижимость') +
        ' классифицированной капитализации, но около ' + toPct('Недвижимость') + ' оборота.</p>' +
      '<p>Значительный вклад в эту разницу вносят акции «Самолёта». Их оборот за рассматриваемые 12 месяцев составил около ' +
        smltTo + ' млрд ₽ при капитализации торгуемого выпуска около ' + smltCap +
        ' млрд ₽ на дату среза.</p>' +
      '<p>Здесь важно учитывать разницу периодов: оборот суммируется за целый год, тогда как капитализация фиксируется на одну дату. За это время цена акций «Самолёта» существенно изменилась.</p>' +
      '<p>Поэтому отношение доли оборота к доле капитализации мы рассматриваем только как «интенсивность торгов относительно текущего размера сектора», а не как показатель его ликвидности или инвестиционной привлекательности.</p>' +
      '<h3>IMOEX — ядро рынка, но не весь рынок</h3>' +
      '<p>Индекс МосБиржи часто используется как ориентир для российского рынка акций. При этом его состав существенно уже всей исследованной выборки.</p>' +
      '<p>На дату исследования в IMOEX входили ' + f.imoex.securityCount + ' выпуска ' +
        f.imoex.companyCount + ' компании.</p>' +
      '<p>Эти компании представляли около ' + imoexCap + ' капитализации и ' + imoexTo +
        ' оборота классифицированной части исследованного рынка.</p>' +
      '<p>Это хорошо показывает роль IMOEX: сравнительно небольшое число крупных компаний формирует основную часть рынка и ещё большую часть торговой активности.</p>' +
      '<p>Но за пределами индекса всё равно остаётся заметная часть российского рынка акций.</p>' +
      '<h3>Российский рынок концентрирован не только по секторам</h3>' +
      '<p>Концентрация заметна и на уровне отдельных компаний.</p>' +
      '<p>На десять крупнейших компаний приходится около ' + top10Cap +
        ' капитализации исследованного рынка.</p>' +
      '<p>Десять компаний с самым большим торговым оборотом формируют около ' + top10To +
        ' оборота за рассматриваемые 12 месяцев.</p>' +
      '<p>Поэтому следование структуре рынка и равномерная диверсификация — не одно и то же.</p>' +
      '<p>Рынок отражает реальный размер компаний и секторов, включая существующую концентрацию.</p>' +
      '<h3>Как использовать рыночные пропорции</h3>' +
      '<p>Условный пример сравнения портфеля с рынком. Цифры 38%, 15% и 22% — только иллюстрация, не данные пользователя и не рекомендация.</p>' +
      articleTable(
        'article-sector-table article-sector-table--example',
        ['Сектор', 'Ваш портфель', 'Российский рынок'],
        illustrationRows()
      ) +
      '<p>Такая таблица не отвечает на вопрос, что нужно купить или продать.</p>' +
      '<p>Зато она помогает увидеть:</p>' +
      '<ul>' +
        '<li>какие направления занимают в портфеле особенно большую долю относительно рынка;</li>' +
        '<li>какие представлены значительно меньше;</li>' +
        '<li>какие отклонения появились случайно;</li>' +
        '<li>какие являются осознанной особенностью выбранной структуры.</li>' +
      '</ul>' +
      '<p>И уже после этого инвестор может решать, соответствует ли такой портфель его собственным целям и отношению к риску.</p>' +
      '<h3>Итог</h3>' +
      '<p>Российский рынок акций имеет выраженную секторную концентрацию. Энергетика, финансы и материалы вместе формируют почти 84% его классифицированной капитализации.</p>' +
      '<p>Поэтому рыночная структура полезна прежде всего как ориентир для сравнения, а не как готовая пропорция портфеля.</p>' +
      '<p>Она позволяет задать простой вопрос:</p>' +
      '<p><strong>«Чем структура моего портфеля отличается от структуры рынка — и понимаю ли я, почему?»</strong></p>' +
      '<p>Если ответ на него понятен, секторные доли становятся не случайным результатом набора отдельных бумаг, а осознанной частью портфельной структуры.</p>' +
      '<h3>Как считали</h3>' +
      '<p>Исследование основано на ' + f.securityCount + ' торгуемых выпусках ' +
        f.universeCompanyCount + ' компаний основного режима торгов акциями Московской биржи.</p>' +
      '<p>Срез капитализации — ' + formatRuDate(f.analysisDate) +
        '. Под капитализацией понимается капитализация включённых в выборку торгуемых выпусков. У отдельных эмитентов на основном рынке представлен не весь акционерный капитал, поэтому показатель не всегда равен полной капитализации эмитента.</p>' +
      '<p>Торговый оборот рассчитан за период с ' + formatRuDate(f.turnoverStartDate) +
        ' по ' + formatRuDate(f.turnoverEndDate) + ', или ' + f.tradingDayCount + ' торговых дня.</p>' +
      '<p>Секторные доли рассчитаны по классифицированным компаниям с доступной оценкой капитализации. АФК «Система» оставлена вне девяти секторных групп как диверсифицированный холдинг.</p>' +
      '<p>Состав IMOEX определён на дату среза. Официальные веса индекса для расчётов не использовались.</p>' +
      disclaimer();
  }

  if (typeof window !== 'undefined') {
    window.MARKET_SECTOR_PUBLICATION_FACTS = PUBLICATION_FACTS;
    window.buildMarketSectorProportionsArticleBodyHtml = buildMarketSectorProportionsArticleBodyHtml;
  }
})();
