/* manual-data.js: ручные справочники аналитики/статей */
(function () {
  'use strict';

  var DIVIDEND_DATA = {
    SBER: {
      avgYield5y: 9.1,
      history: [
        { year: 2021, yield: 6.8, dividend: 18.7 },
        { year: 2022, yield: 0, dividend: 0 },
        { year: 2023, yield: 10.5, dividend: 25.0 },
        { year: 2024, yield: 11.2, dividend: 33.3 },
        { year: 2025, yield: 9.4, dividend: 34.8 }
      ],
      source: 'manual'
    },
    LKOH: {
      avgYield5y: 10.3,
      history: [
        { year: 2021, yield: 7.6, dividend: 537 },
        { year: 2022, yield: 0, dividend: 0 },
        { year: 2023, yield: 12.1, dividend: 945 },
        { year: 2024, yield: 11.0, dividend: 890 },
        { year: 2025, yield: 10.7, dividend: 920 }
      ],
      source: 'manual'
    },
    MTSS: {
      avgYield5y: 11.4,
      history: [
        { year: 2021, yield: 9.8, dividend: 29.5 },
        { year: 2022, yield: 10.1, dividend: 33.9 },
        { year: 2023, yield: 12.8, dividend: 34.3 },
        { year: 2024, yield: 12.4, dividend: 35.0 },
        { year: 2025, yield: 11.9, dividend: 35.0 }
      ],
      source: 'manual'
    }
  };

  var STRATEGY_EXAMPLES = {
    isExample: true,
    note: 'Расчёт будет добавлен после подключения исторических данных.',
    rows: [
      { strategy: '60/40', stocks: '60%', bonds: '40%', return10y: '—', drawdown: '—', fit: 'Сбалансированный инвестор' },
      { strategy: '80/20', stocks: '80%', bonds: '20%', return10y: '—', drawdown: '—', fit: 'Готовность к высокой волатильности' },
      { strategy: '50/50', stocks: '50%', bonds: '50%', return10y: '—', drawdown: '—', fit: 'Консервативный долгий горизонт' }
    ]
  };

  var EDUCATIONAL_ARTICLES = [
    {
      id: 'long-term-strategies-6040-8020-5050',
      title: 'Плюсы и минусы стратегий долгосрочного инвестирования: 60/40, 80/20 и 50/50',
      summary: 'Как выбрать пропорцию акций и облигаций под ваш риск-профиль и горизонт.',
      bodyHtml:
        '<h3>1. Что такое портфельная стратегия</h3>' +
        '<p>Портфельная стратегия — это заранее заданная доля классов активов и правила ребалансировки. Она помогает снизить влияние эмоций и принимать решения по плану.</p>' +
        '<h3>2. Стратегия 60/40</h3>' +
        '<p>Классический баланс: 60% акций и 40% облигаций. Подходит как базовая долгосрочная модель при умеренной волатильности.</p>' +
        '<h3>3. Стратегия 80/20</h3>' +
        '<p>Более агрессивный профиль: выше потенциальный рост, но и просадки могут быть заметно глубже.</p>' +
        '<h3>4. Стратегия 50/50</h3>' +
        '<p>Более защитный вариант, где стабильность важнее максимальной доходности.</p>' +
        '<h3>5. Сравнение стратегий за 10 лет</h3>' +
        '<p class="muted">Расчёт будет добавлен после подключения исторических данных.</p>' +
        '<h3>6. Кому какая стратегия подходит</h3>' +
        '<div class="strategy-grid">' +
          '<article class="strategy-card"><h4>60/40</h4><p>Акции 60%<br>Облигации 40%<br>Риск: средний<br>Горизонт: 5+ лет</p></article>' +
          '<article class="strategy-card"><h4>80/20</h4><p>Акции 80%<br>Облигации 20%<br>Риск: высокий<br>Горизонт: 7-10+ лет</p></article>' +
          '<article class="strategy-card"><h4>50/50</h4><p>Акции 50%<br>Облигации 50%<br>Риск: умеренный<br>Горизонт: 3-5+ лет</p></article>' +
        '</div>' +
        '<h3>7. Риски</h3>' +
        '<p>Даже консервативный портфель может показывать отрицательную доходность на отдельных отрезках. Важно учитывать инфляцию, валютный риск и дисциплину ребалансировки.</p>' +
        '<h3>8. Вывод</h3>' +
        '<p>Стратегия должна соответствовать вашему горизонту, допустимой просадке и целям. Универсального распределения для всех инвесторов не существует.</p>' +
        '<table class="strategy-table"><thead><tr><th>Стратегия</th><th>Доля акций</th><th>Доля облигаций</th><th>Доходность за 10 лет</th><th>Максимальная просадка</th><th>Кому подходит</th></tr></thead>' +
          '<tbody>' +
            STRATEGY_EXAMPLES.rows.map(function (row) {
              return '<tr><td>' + row.strategy + '</td><td>' + row.stocks + '</td><td>' + row.bonds + '</td><td>' +
                row.return10y + '</td><td>' + row.drawdown + '</td><td>' + row.fit + '</td></tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
        '<p class="muted">Данные в таблице приведены как шаблон: ' + STRATEGY_EXAMPLES.note + '</p>'
    }
  ];

  if (typeof window !== 'undefined') {
    window.DIVIDEND_DATA = DIVIDEND_DATA;
    window.STRATEGY_EXAMPLES = STRATEGY_EXAMPLES;
    window.EDUCATIONAL_ARTICLES = EDUCATIONAL_ARTICLES;
  }
})();

