/* article-volatility-harvesting.js: образовательная статья о сборе волатильности */
(function () {
  'use strict';

  var ILLUSTRATION = {
    startA: 50,
    startB: 50,
    firstMoveA: 1.25,
    firstMoveB: 0.80,
    secondMoveA: 0.80,
    secondMoveB: 1.25
  };

  function calculateRebalancingIllustration() {
    var startA = ILLUSTRATION.startA;
    var startB = ILLUSTRATION.startB;
    var startTotal = startA + startB;
    var afterFirstA = startA * ILLUSTRATION.firstMoveA;
    var afterFirstB = startB * ILLUSTRATION.firstMoveB;
    var afterFirstTotal = afterFirstA + afterFirstB;
    var afterFirstWeightA = afterFirstA / afterFirstTotal;
    var afterFirstWeightB = afterFirstB / afterFirstTotal;
    var rebalancedPerAsset = afterFirstTotal / 2;
    var finalRebalancedA = rebalancedPerAsset * ILLUSTRATION.secondMoveA;
    var finalRebalancedB = rebalancedPerAsset * ILLUSTRATION.secondMoveB;
    var finalRebalancedTotal = finalRebalancedA + finalRebalancedB;
    var finalNoRebalanceA = startA * ILLUSTRATION.firstMoveA * ILLUSTRATION.secondMoveA;
    var finalNoRebalanceB = startB * ILLUSTRATION.firstMoveB * ILLUSTRATION.secondMoveB;
    var finalNoRebalanceTotal = finalNoRebalanceA + finalNoRebalanceB;
    return {
      startA: startA,
      startB: startB,
      startTotal: startTotal,
      afterFirstA: afterFirstA,
      afterFirstB: afterFirstB,
      afterFirstTotal: afterFirstTotal,
      afterFirstWeightA: afterFirstWeightA,
      afterFirstWeightB: afterFirstWeightB,
      rebalancedPerAsset: rebalancedPerAsset,
      finalRebalancedA: finalRebalancedA,
      finalRebalancedB: finalRebalancedB,
      finalRebalancedTotal: finalRebalancedTotal,
      finalNoRebalanceA: finalNoRebalanceA,
      finalNoRebalanceB: finalNoRebalanceB,
      finalNoRebalanceTotal: finalNoRebalanceTotal,
      difference: finalRebalancedTotal - finalNoRebalanceTotal
    };
  }

  function formatRub(n) {
    return Number(n).toFixed(2).replace('.', ',') + ' ₽';
  }

  function formatPctRounded(weight) {
    return String(Math.round(Number(weight) * 100)) + '%';
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

  function disclaimer() {
    return '<p class="muted">Материал носит образовательный характер и не является индивидуальной инвестиционной рекомендацией.</p>';
  }

  function buildMechanicsChartHtml(n) {
    var movedA = formatPctRounded(n.afterFirstWeightA);
    var movedB = formatPctRounded(n.afterFirstWeightB);
    return '<figure class="article-rebal-chart">' +
      '<figcaption>Как ребалансировка возвращает веса</figcaption>' +
      '<p class="article-chart-note">Условный портфель из двух частей. Цифры после движения совпадают с примером ниже.</p>' +
      '<div class="article-rebal-legend" aria-hidden="true">' +
        '<span><i class="article-rebal-swatch article-rebal-swatch--a"></i>Актив А</span>' +
        '<span><i class="article-rebal-swatch article-rebal-swatch--b"></i>Актив Б</span>' +
      '</div>' +
      '<div class="article-rebal-stack-list" role="img" aria-label="Три состояния портфеля: старт 50 на 50, после движения около 61 на 39, после ребалансировки снова 50 на 50">' +
        '<div class="article-rebal-state">' +
          '<div class="article-rebal-state-name">Старт</div>' +
          '<div class="article-rebal-stack" aria-hidden="true">' +
            '<span class="article-rebal-seg article-rebal-seg--a" style="width:50%"><span class="article-rebal-seg-label">А 50%</span></span>' +
            '<span class="article-rebal-seg article-rebal-seg--b" style="width:50%"><span class="article-rebal-seg-label">Б 50%</span></span>' +
          '</div>' +
          '<div class="article-rebal-state-values">' +
            '<span class="article-rebal-key article-rebal-key--a">А 50%</span>' +
            '<span class="article-rebal-key article-rebal-key--b">Б 50%</span>' +
          '</div>' +
        '</div>' +
        '<div class="article-rebal-state">' +
          '<div class="article-rebal-state-name">После движения</div>' +
          '<div class="article-rebal-stack" aria-hidden="true">' +
            '<span class="article-rebal-seg article-rebal-seg--a" style="width:' + movedA + '"><span class="article-rebal-seg-label">А ≈ ' + movedA + '</span></span>' +
            '<span class="article-rebal-seg article-rebal-seg--b" style="width:' + movedB + '"><span class="article-rebal-seg-label">Б ≈ ' + movedB + '</span></span>' +
          '</div>' +
          '<div class="article-rebal-state-values">' +
            '<span class="article-rebal-key article-rebal-key--a">А ≈ ' + movedA + '</span>' +
            '<span class="article-rebal-key article-rebal-key--b">Б ≈ ' + movedB + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="article-rebal-state">' +
          '<div class="article-rebal-state-name">После ребалансировки</div>' +
          '<div class="article-rebal-stack" aria-hidden="true">' +
            '<span class="article-rebal-seg article-rebal-seg--a" style="width:50%"><span class="article-rebal-seg-label">А 50%</span></span>' +
            '<span class="article-rebal-seg article-rebal-seg--b" style="width:50%"><span class="article-rebal-seg-label">Б 50%</span></span>' +
          '</div>' +
          '<div class="article-rebal-state-values">' +
            '<span class="article-rebal-key article-rebal-key--a">А 50%</span>' +
            '<span class="article-rebal-key article-rebal-key--b">Б 50%</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</figure>';
  }

  function outcomeWidth(value, max) {
    var pct = (Number(value) / Number(max)) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    return pct.toFixed(2) + '%';
  }

  function buildOutcomeChartHtml(n) {
    var max = n.finalRebalancedTotal;
    return '<figure class="article-rebal-chart article-rebal-chart--outcomes">' +
      '<figcaption>Что получилось в условном примере</figcaption>' +
      '<p class="article-chart-note">Иллюстративный сценарий, не прогноз доходности.</p>' +
      '<div class="article-rebal-outcome-list" role="img" aria-label="Сравнение итога условного примера: без ребалансировки ' +
        formatRub(n.finalNoRebalanceTotal) + ', с ребалансировкой ' + formatRub(n.finalRebalancedTotal) + '">' +
        '<div class="article-rebal-outcome">' +
          '<div class="article-rebal-outcome-label">Без ребалансировки</div>' +
          '<div class="article-rebal-outcome-track" aria-hidden="true">' +
            '<div class="article-rebal-outcome-fill" style="width:' +
              outcomeWidth(n.finalNoRebalanceTotal, max) + '"></div>' +
          '</div>' +
          '<div class="article-rebal-outcome-value">' + formatRub(n.finalNoRebalanceTotal) + '</div>' +
        '</div>' +
        '<div class="article-rebal-outcome">' +
          '<div class="article-rebal-outcome-label">С ребалансировкой</div>' +
          '<div class="article-rebal-outcome-track" aria-hidden="true">' +
            '<div class="article-rebal-outcome-fill" style="width:' +
              outcomeWidth(n.finalRebalancedTotal, max) + '"></div>' +
          '</div>' +
          '<div class="article-rebal-outcome-value">' + formatRub(n.finalRebalancedTotal) + '</div>' +
        '</div>' +
      '</div>' +
    '</figure>';
  }

  function exampleTableRows(n) {
    return [
      ['Старт', formatRub(n.startA), formatRub(n.startB), formatRub(n.startTotal)],
      ['После первого движения', formatRub(n.afterFirstA), formatRub(n.afterFirstB), formatRub(n.afterFirstTotal)],
      ['После ребалансировки', formatRub(n.rebalancedPerAsset), formatRub(n.rebalancedPerAsset), formatRub(n.afterFirstTotal)],
      ['После второго движения', formatRub(n.finalRebalancedA), formatRub(n.finalRebalancedB), formatRub(n.finalRebalancedTotal)]
    ];
  }

  function sectorDriftRows() {
    return [
      ['Финансы', '25%', '34%'],
      ['Энергетика', '25%', '20%'],
      ['Материалы', '25%', '24%'],
      ['Остальные', '25%', '22%']
    ];
  }

  function buildVolatilityHarvestingArticleBodyHtml() {
    var n = calculateRebalancingIllustration();
    var movedA = formatPctRounded(n.afterFirstWeightA);
    var movedB = formatPctRounded(n.afterFirstWeightB);

    return '' +
      '<p class="article-kicker">Почему колебания цен могут создавать эффект при систематическом восстановлении долей портфеля — и почему он не является гарантированной дополнительной доходностью.</p>' +
      '<h3>Главное за минуту</h3>' +
      '<p>Волатильность обычно воспринимают как неприятную сторону инвестиций: цены меняются, стоимость портфеля колеблется, а результат становится менее предсказуемым.</p>' +
      '<p>Но у портфеля из нескольких активов есть ещё одна особенность. Когда его части движутся по-разному, первоначальные доли постепенно меняются. Один актив становится слишком большим относительно исходной структуры, другой — слишком маленьким.</p>' +
      '<p>Если инвестор периодически возвращает портфель к выбранным пропорциям, он механически сокращает долю того, что относительно выросло, и увеличивает долю того, что относительно отстало.</p>' +
      '<p>В профессиональной литературе связанный с этим эффект называют сбором волатильности (volatility harvesting), а возможную прибавку от систематического восстановления долей — премией за ребалансировку (rebalancing premium).</p>' +
      '<p>Но слово «премия» здесь не означает гарантированную дополнительную прибыль.</p>' +
      '<p>Ребалансировка может помочь использовать относительные колебания активов, а может долго проигрывать портфелю, в котором победителям просто позволили расти дальше.</p>' +
      '<p><strong>Главная мысль:</strong> «сливки волатильности» — это не прибыль из любых колебаний рынка. Это возможный эффект дисциплинированной ребалансировки диверсифицированного портфеля.</p>' +

      '<h3>Что такое ребалансировка</h3>' +
      '<p>Представим портфель из двух частей: актив А — 50%, актив Б — 50%.</p>' +
      '<p>Если А растёт быстрее, структура сама собой смещается. Через некоторое время портфель может стать, например, 60 / 40: выросшая часть занимает больше места, отставшая — меньше.</p>' +
      '<p>Ребалансировка уменьшает долю выросшей части и увеличивает долю отставшей, возвращая выбранные веса.</p>' +
      '<p>Это не обязательно означает, что инвестор считает А дорогим, а Б дешёвым.</p>' +
      '<p>Решение принимается потому, что структура портфеля отклонилась от заранее выбранной.</p>' +
      '<p>Поэтому основная функция ребалансировки — управление структурой и риском, а не максимизация доходности. Доходность может измениться как побочный эффект, но это не обещание лучшего результата.</p>' +
      buildMechanicsChartHtml(n) +

      '<h3>Откуда берётся идея «сбора волатильности»</h3>' +
      '<p>Идея начинается не с того, что «цены скачут — значит, можно заработать». Она начинается с простого наблюдения: активы движутся неодинаково.</p>' +
      '<p>Когда части портфеля расходятся, веса отклоняются от исходной структуры. Систематическая ребалансировка периодически фиксирует часть относительного роста: инвестор сокращает долю того, что выросло сильнее, и направляет средства в часть, доля которой уменьшилась.</p>' +
      '<p>Если затем относительное лидерство меняется, повторное восстановление весов может дать эффект, которого не было бы у портфеля, оставленного «как есть».</p>' +
      '<p>Важно не перевернуть причинную связь. Высокая волатильность сама по себе не создаёт прибыль. Чем сильнее скачут цены, тем больше не становится гарантированный результат. Речь идёт о взаимодействии нескольких активов, их относительных движений и правил, по которым инвестор возвращает доли.</p>' +

      '<h3>Простой пример</h3>' +
      '<p>Возьмём искусственный счёт из двух активов.</p>' +
      '<p>Старт: актив А = ' + formatRub(n.startA) + ', актив Б = ' + formatRub(n.startB) +
        ', портфель = ' + formatRub(n.startTotal) + '.</p>' +
      '<p>В первом периоде А +25%, а Б −20%. Получаем А = ' + formatRub(n.afterFirstA) +
        ', Б = ' + formatRub(n.afterFirstB) + ', портфель = ' + formatRub(n.afterFirstTotal) +
        '. Вес становится примерно ' + movedA + ' на ' + movedB + '.</p>' +
      '<p>Ребалансировка возвращает равные доли: ' + formatRub(n.rebalancedPerAsset) +
        ' + ' + formatRub(n.rebalancedPerAsset) + '.</p>' +
      '<p>Во втором периоде роли меняются: А −20%, Б +25%. После этого А = ' +
        formatRub(n.finalRebalancedA) + ', Б = ' + formatRub(n.finalRebalancedB) +
        ', портфель = ' + formatRub(n.finalRebalancedTotal) + '.</p>' +
      articleTable(
        'article-rebal-table',
        ['Этап', 'Актив А', 'Актив Б', 'Портфель'],
        exampleTableRows(n)
      ) +
      '<p>Без ребалансировки тот же путь выглядит иначе. А: 50 × 1,25 × 0,80 = ' +
        formatRub(n.finalNoRebalanceA) + '. Б: 50 × 0,80 × 1,25 = ' +
        formatRub(n.finalNoRebalanceB) + '. Итог: ' + formatRub(n.finalNoRebalanceTotal) + '.</p>' +
      '<p>Разница в этом сценарии составляет ' + formatRub(n.difference) + '.</p>' +
      '<p>Пример специально построен так, чтобы относительное лидерство активов поменялось местами.</p>' +
      '<p>Это не прогноз рыночной доходности.</p>' +
      buildOutcomeChartHtml(n) +

      '<h3>Волатильность сама по себе не является источником дохода</h3>' +
      '<p>Из примера легко сделать ложный вывод: чем сильнее скачут цены, тем больше можно заработать. Это не так.</p>' +
      '<p>Волатильность сама по себе не гарантирует положительный эффект. Неровность доходностей может ухудшать геометрический темп роста капитала: плюс 20% и минус 20% не оставляют стоимость на месте, а опускают её ниже исходного уровня.</p>' +
      '<p>Поэтому речь идёт не о пользе колебаний как таковых. Эффект появляется, если вообще появляется, из взаимодействия нескольких активов и правил управления их весами.</p>' +

      '<h3>Почему низкая корреляция помогает, но ничего не гарантирует</h3>' +
      '<p>Если активы движутся почти одинаково, их веса мало меняются. Возвращать почти нечего: структура и так остаётся близкой к исходной.</p>' +
      '<p>Если движения различаются, отклонения весов возникают чаще. Тогда у ребалансировки появляется больше поводов сработать.</p>' +
      '<p>Но низкая корреляция сама по себе не гарантирует положительную премию. Если один актив долго и устойчиво лидирует, регулярная продажа его части может ухудшить результат: инвестор снова и снова сокращает то, что продолжает расти.</p>' +

      '<h3>Когда ребалансировка может проигрывать</h3>' +
      '<p>Представим, что доля лидера проходит путь 50% → 55% → 60% → 65%. Растущая часть постепенно занимает всё большую долю портфеля.</p>' +
      '<p>Портфель без ребалансировки оставляет победителя расти. Ребалансирующийся портфель периодически продаёт его часть и добавляет отставшее.</p>' +
      '<p>При длительном тренде это может означать отставание: дисциплина сохраняет исходную структуру, но отрезает часть дальнейшего роста лидера.</p>' +
      '<p>Падение цены не означает автоматически, что актив стал хорошей покупкой. Если изменилась сама инвестиционная идея — бизнес, долг, правила, роль бумаги в портфеле, — механическое восстановление доли может увеличить проблемную позицию.</p>' +

      '<h3>Ребалансировка — это не попытка угадать рынок</h3>' +
      '<p>Прогноз звучит так: «Я думаю, что актив скоро вырастет».</p>' +
      '<p>Ребалансировка звучит иначе: «Его доля отклонилась от заранее выбранной структуры».</p>' +
      '<p>Это разные решения. В первом случае инвестор спорит с рынком о будущем. Во втором — возвращает портфель к собственному плану, даже если не знает, что будет дальше с ценой.</p>' +

      '<h3>Как часто нужно возвращать доли</h3>' +
      '<p>На практике встречаются три подхода. Календарный: смотреть портфель в заранее выбранные даты. Пороговый: действовать, когда доля ушла дальше выбранного отклонения. Комбинированный: проверять по календарю, а сделку делать только если порог уже пройден.</p>' +
      '<p>Универсальной частоты нет. Частая ребалансировка увеличивает количество операций. Слишком редкая позволяет структуре сильнее отклоняться от выбранных весов.</p>' +
      '<p>Выбор — это компромисс между контролем весов и издержками, а не поиск единственно верного расписания.</p>' +

      '<h3>Почему издержки имеют значение</h3>' +
      '<p>Каждая операция может стоить денег: комиссия брокера, спред между ценой покупки и продажи, возможное влияние самой сделки на цену и возможные налоговые последствия. Это не налоговая консультация, а напоминание, что «бумажный» эффект и результат на счёте — разные вещи.</p>' +
      '<p>Теоретическая премия может исчезнуть после издержек. Чем чаще инвестор возвращает доли ради малых отклонений, тем выше шанс, что расходы съедят разницу.</p>' +
      '<p>Новые пополнения, купоны и дивиденды иногда можно направлять в отставшие части портфеля. Так веса восстанавливаются без лишней продажи активов.</p>' +

      '<h3>А где здесь «премия за ребалансировку»</h3>' +
      '<p>Премия за ребалансировку — это не отдельная гарантированная выплата.</p>' +
      '<p>Это разница результата, которая может возникнуть между выбранной стратегией ребалансировки и альтернативой на конкретной траектории рынка.</p>' +
      '<p>Она зависит от движений активов, исходных и целевых весов, момента операций, издержек и того, с чем именно сравнивают результат. На одной траектории разница будет в пользу восстановления долей, на другой — против.</p>' +

      '<h3>«Сливки волатильности» и структура портфеля</h3>' +
      '<p>В статье о секторных пропорциях российского рынка главный вопрос звучал так: «Чем структура моего портфеля отличается от структуры рынка — и понимаю ли я, почему?»</p>' +
      '<p>Для ребалансировки этого сравнения недостаточно. Рынок остаётся точкой отсчёта, но возвращать нужно не рыночные веса сами по себе, а собственную исходную и целевую структуру портфеля.</p>' +
      '<p>Рыночные доли не нужно автоматически восстанавливать. Если инвестор сознательно держит меньше энергетики или больше финансов, чем рынок, это особенность плана, а не ошибка, которую рынок «просит исправить».</p>' +
      '<p>Условный пример ниже ничего не говорит о «нужных» секторах. Он показывает только, как выбранные доли могут разъехаться после движения цен.</p>' +
      articleTable(
        'article-rebal-table article-rebal-table--sectors',
        ['Сектор', 'Исходная доля', 'Текущая доля'],
        sectorDriftRows()
      ) +
      '<p>Эта таблица ещё ничего не говорит о необходимости сделки.</p>' +
      '<p>Она показывает другое: рынок уже изменил первоначальную структуру портфеля.</p>' +

      '<h3>Что полезно увидеть перед ребалансировкой</h3>' +
      '<p>Перед тем как что-то покупать или продавать, полезно понять, какой была исходная структура и насколько она изменилась. Затем — чем вызвано изменение: движением цен или собственными операциями. Если сдвинулась сама инвестиционная идея, механически возвращать старую долю незачем. Если идея на месте, следующий вопрос практический: можно ли восстановить веса новым пополнением, а не продажей.</p>' +
      '<p>Это объяснение логики решения, а не персональная рекомендация купить или продать конкретный актив.</p>' +

      '<h3>Это не торговля волатильностью</h3>' +
      '<p>В этой статье «сбор волатильности» не означает торговлю опционами, продажу волатильности, ставку на индекс волатильности или краткосрочный скальпинг.</p>' +
      '<p>Речь только о диверсифицированном портфеле и систематическом восстановлении весов.</p>' +

      '<h3>Итог</h3>' +
      '<p>Волатильность сама по себе не создаёт бесплатной доходности.</p>' +
      '<p>Но когда разные части диверсифицированного портфеля движутся неодинаково, их веса отклоняются от исходной структуры.</p>' +
      '<p>Ребалансировка позволяет систематически возвращать эти веса назад.</p>' +
      '<p>При некоторых траекториях рынка это способно создавать премию за ребалансировку. При других — снижать результат по сравнению с портфелем, в котором победителям позволили расти дальше.</p>' +
      '<p>Поэтому полезный вопрос здесь не «как заработать на колебаниях», а более простой:</p>' +
      '<p><strong>Какие доли я хотел видеть в своём портфеле — и что рынок уже успел с ними сделать?</strong></p>' +
      disclaimer();
  }

  if (typeof window !== 'undefined') {
    window.calculateRebalancingIllustration = calculateRebalancingIllustration;
    window.buildVolatilityHarvestingArticleBodyHtml = buildVolatilityHarvestingArticleBodyHtml;
  }
})();
