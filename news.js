/* news.js */
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  }



  function hoursAgo(h) {
    var d = new Date();
    d.setTime(d.getTime() - h * 60 * 60 * 1000);
    return d.toISOString();
  }

  /* Запасная лента при недоступности источников новостей. */
  var DEMO_BRIEFS = [
    { id: 'b1', ticker: 'SBER', type: 'stock', publishedAt: daysAgo(1), eventType: 'earnings', tone: 'positive', importance: 'high',
      title: 'Сбербанк: I квартал сильнее ожиданий рынка',
      summary: 'Чистая прибыль и ROE превысили консенсус-прогноз. Розничный блок тянет результат, резервы растут умеренно — дивидендный сценарий без сюрпризов.',
      sourceUrl: 'https://www.sberbank.com/ru/investor-relations' },
    { id: 'b2', ticker: 'LKOH', type: 'stock', publishedAt: daysAgo(3), eventType: 'rating', tone: 'neutral', importance: 'medium',
      title: 'ЛУКОЙЛ: брокеры спорят о capex, но не о дивидендах',
      summary: 'После отчёта дома разошлись в оценках инвестпрограммы. Целевые цены скорректировали в узком коридоре — выплаты по-прежнему в центре истории.',
      sourceUrl: 'https://lukoil.ru/InvestorAndShareholder/PerformanceResults' },
    { id: 'b3', ticker: 'GAZP', type: 'stock', publishedAt: daysAgo(5), eventType: 'macro', tone: 'negative', importance: 'high',
      title: 'Газпром: экспорт и логистика давят на оценку',
      summary: 'Рынок закладывает риски по маршрутам и контрактным условиям. Краткосрочно бумага остаётся заложником макро и переговорной повестки.',
      sourceUrl: 'https://www.gazprom.ru/investors/' },
    { id: 'b4', ticker: 'GMKN', type: 'stock', publishedAt: daysAgo(7), eventType: 'earnings', tone: 'positive', importance: 'medium',
      title: 'Норникель: металлы держат маржу, ESG — в повестке',
      summary: 'Премии к LME по никелю и палладию поддерживают операционный результат. Инвесторы ждут деталей по «зелёному» capex и календарю выплат.',
      sourceUrl: 'https://www.nornickel.ru/investors/' },
    { id: 'b5', ticker: 'TATN', type: 'stock', publishedAt: daysAgo(12), eventType: 'dividend', tone: 'positive', importance: 'high',
      title: 'Татнефть: совет рекомендует дивиденд выше прошлого года',
      summary: 'Рекомендация по выплате выглядит щедрой на фоне сектора. Рынок оценивает, насколько она опирается на устойчивый денежный поток, а не на разовый эффект цен.',
      sourceUrl: 'https://www.tatneft.ru/' },
    { id: 'b6', ticker: 'OFZ_26241', type: 'bond', publishedAt: daysAgo(14), eventType: 'yield', tone: 'neutral', importance: 'medium',
      title: 'ОФЗ 26241: спокойная доходность в ядре портфеля',
      summary: 'Спред к ключевой стабилен, ликвидность достаточна для розницы. На горизонте 2–3 лет бумагу держат как якорь при ожидании смягчения ДКП.',
      sourceUrl: 'https://www.moex.com/ru/bondization/' },
    { id: 'b7', ticker: 'MOEX', type: 'macro', publishedAt: daysAgo(20), eventType: 'macro', tone: 'neutral', importance: 'critical',
      title: 'Ставка ЦБ и рынок: акции и ОФЗ в режиме ожидания',
      summary: 'Последнее решение по ключевой задаёт длинный «хвост» ожиданий. IMOEX ходит в узком коридоре — лидируют финансы и нефтегаз, объёмы без всплеска.',
      sourceUrl: 'https://www.moex.com/' },
    { id: 'b8', ticker: 'SBER', type: 'stock', publishedAt: daysAgo(28), eventType: 'dividend', tone: 'positive', importance: 'low',
      title: 'Сбербанк: отсечка по дивидендам — что учесть',
      summary: 'Дата закрытия реестра близко: размер выплаты совпадает с утверждённым календарём. Для стратегий «дивидендный захват» важны налоги и срок зачисления.',
      sourceUrl: 'https://www.sberbank.com/ru/investor-relations' },
    { id: 'b9', ticker: 'LKOH', type: 'stock', publishedAt: hoursAgo(5), eventType: 'macro', tone: 'negative', importance: 'high',
      title: 'ЛУКОЙЛ: Brent слабеет — акции отстают с лагом',
      summary: 'Коррекция сырья после отчёта по запасам в США давит на сектор. Исторически котировки ЛУКОЙЛа догоняют нефть за 1–2 сессии — волатильность может вырасти.',
      sourceUrl: 'https://lukoil.ru/' },
    { id: 'b10', ticker: 'SBER', type: 'stock', publishedAt: hoursAgo(2), eventType: 'earnings', tone: 'positive', importance: 'high',
      title: 'Сбербанк: сессия в плюсе на фоне банковского сектора',
      summary: 'Внутридневные метрики — кредитование и комиссии — без сюрпризов. Акции чуть опережают индекс финансов; на настроение влияют ОФЗ и курс юаня.',
      sourceUrl: 'https://www.sberbank.com/ru/investor-relations' },
    { id: 'b11', ticker: 'GAZP', type: 'stock', publishedAt: hoursAgo(4), eventType: 'macro', tone: 'neutral', importance: 'medium',
      title: 'Газпром: поставки по плану, рынок ждёт цифр',
      summary: 'Экспортные потоки без заметных срывов — котировки больше следуют за европейскими хабами в пересчёте на рубль. Следующий катализатор — операционная статистика по добыче.',
      sourceUrl: 'https://www.gazprom.ru/investors/' },
    { id: 'b12', ticker: 'NVTK', type: 'stock', publishedAt: hoursAgo(1), eventType: 'rating', tone: 'positive', importance: 'high',
      title: 'Новатэк: «покупать» сохраняют, спорят о размере выплаты',
      summary: 'После отчётности большинство домов оставили позитивные рекомендации. В фокусе — LNG-проекты, валютная выручка и итоговый дивиденд на акцию.',
      sourceUrl: 'https://www.novatek.ru/ru/investors/' },
    { id: 'b13', ticker: 'MOEX', type: 'macro', publishedAt: hoursAgo(6), eventType: 'macro', tone: 'neutral', importance: 'critical',
      title: 'Итоги сессии: IMOEX в середине диапазона недели',
      summary: 'Лидеры — SBER и LKOH, металлурги отстают. Объём торгов на уровне среднего за пять дней; завтра — инфляция и аукцион ОФЗ.',
      sourceUrl: 'https://www.moex.com/n25391' },
    { id: 'b14', ticker: 'GMKN', type: 'stock', publishedAt: hoursAgo(3), eventType: 'earnings', tone: 'positive', importance: 'medium',
      title: 'Норникель: никель с премией, ремонты в календаре',
      summary: 'Цены LME поддерживают маржу выше среднего за пять лет. Компания обновила график плановых остановок — рынок оценивает влияние на квартальный объём.',
      sourceUrl: 'https://www.nornickel.ru/investors/' },
    { id: 'b15', ticker: 'ROSN', type: 'stock', publishedAt: hoursAgo(7), eventType: 'dividend', tone: 'neutral', importance: 'low',
      title: 'Роснефть: календарь раскрытий без сюрпризов',
      summary: 'Даты МСФО и собрания акционеров подтверждены, дивидендную политику не меняли. Оценка по-прежнему завязана на Urals и налог на сверхприбыль.',
      sourceUrl: 'https://www.rosneft.ru/investors/' }
  ];

  var BRIEF_BODIES_BY_ID = {
    b1: 'Сбербанк опубликовал результаты I квартала: чистая прибыль заметно выше среднего прогноза аналитиков, рентабельность капитала (ROE) удерживается в целевом коридоре. Розница и цифровые сервисы дали основной вклад в рост, расходы на резервы под закладки выросли, но без «сюрприза» для рынка.\n\nНа конференц-колле инвесторы будут спрашивать про темпы кредитования, маржу по комиссиям и долю высокодоходного портфеля. Пока дома не видят повода пересматривать дивидендный сценарий — акции реагируют сдержанно позитивно.\n\nДля портфеля важно сопоставить оценку банка с траекторией ключевой ставки: при более длинной паузе ЦБ мультипликаторы сектора могут получить поддержку.',
    b2: 'После квартального отчёта ЛУКОЙЛа инвестдома обновили модели: часть сохранила рекомендации «покупать», часть снизила целевые цены — главный повод споров вокруг роста капзатрат на новые проекты. При этом дивидендная тема почти не пострадала: рынок по-прежнему смотрит на свободный денежный поток и коридор Urals.\n\nСравнение с пиковыми годами показывает: компания может поддерживать выплаты при текущей нефти, но запас прочности уже не бесконечный. Любое ужесточение налоговой нагрузки или просадка котировок сырья быстро отразится на мультипликаторе.\n\nБлижайший катализатор — комментарии менеджмента по срокам проектов и обновлённый guidance на отраслевых конференциях.',
    b3: 'Акции Газпрома остаются под давлением новостей об экспортной логистике и переговорах по контрактным условиям. Инвесторы закладывают риск, что выручка газового сегмента в ближайших кварталах будет расти медленнее, чем ожидали в начале года.\n\nКотировки чувствительны к любым сигналам о переносе пусков и ограничениях по маршрутам — даже без официальных сюрпризов в отчётности премия за риск в оценке сжимается. На вебинаре для акционеров ждут цифр по добыче и capex.\n\nДля долгосрочного портфеля вопрос не в одном квартале, а в устойчивости экспортной модели: пока неясность высока, бумага останется волатильной относительно нефтяных «мажоров».',
    b4: 'Норникель отчитался на фоне сильных цен по палладию и никелю: маржа металлургического дивизиона держится выше среднего за несколько лет. Параллельно компания продвигает ESG-повестку — рынок ждёт подробностей по целям по выбросам и «зелёному» capex.\n\nКлючевой вопрос для акционеров — хватит ли денежного потока одновременно на дивиденды, ремонт фонда и рост инвестпрограммы без увеличения чистого долга. Пока баланс выглядит комфортно, но цикл металлов быстро меняет картину.\n\nСледите за котировками LME и курсом рубля: для экспортёра это прямые драйверы прибыли на горизонте квартала.',
    b5: 'Совет директоров Татнефти рекомендовал дивиденд выше уровня прошлого года — на текущих ценах доходность выглядит заметно привлекательнее среднего по нефтяному сектору. Окончательное решение общего собрания и дата отсечки — следующий юридически значимый шаг.\n\nРынок обсуждает, насколько щедрая рекомендация опирается на устойчивый операционный поток, а не на разовый эффект высоких цен на нефть в отчётном периоде. Скептики указывают на цикличность сектора; сторонники — на дисциплину расходов и низкий долг.\n\nЕсли вы держите бумагу ради выплаты, заранее проверьте налоговый режим счёта и календарь зачисления — детали в материалах эмитента.',
    b6: 'ОФЗ 26241 — типичная «рабочая лошадка» в длинном консервативном портфеле: спред к ключевой ставке стабилен, в стакане достаточно ликвидности даже для розничного объёма. Дюрация умеренная — бумага не играет в агрессивную ставочную ставку, но даёт предсказуемую доходность.\n\nСпрос поддерживают фонды, которые готовятся к смягчению ДКП, и инвесторы, уходящие от краткой кривой в доходные инструменты с понятным риском. Волатильность котировок за последние недели оставалась ниже, чем у корпоративного сегмента.\n\nНа горизонте 2–3 лет бумагу часто держат как якорь: важно следить за аукционами Минфина и реакцией на инфляционные сюрпризы — они задают направление всей кривой.',
    b7: 'Решение Банка России по ключевой ставке снова расставило акценты: рынок закладывает более длинную паузу перед следующим снижением, чем хотели бы «голуби» в акциях. Индекс IMOEX торгуется в узком диапазоне — лидируют финансы и нефтегаз, металлурги и потребсектор отстают.\n\nДлинные ОФЗ чувствительны к любому пересмоту инфляционных ожиданий: завтрашняя статистика и комментарии регулятора могут сдвинуть доходности быстрее, чем корпоративные спреды. Акции в такой среде выигрывают у облигаций только при конкретных корпоративных катализаторах.\n\nДля сбалансированного портфеля это напоминание: макро задаёт потолок и пол для риска — без него даже сильная отчётность эмитента не всегда конвертируется в рост котировок.',
    b8: 'Сбербанк напомнил о приближении даты закрытия реестра по дивидендам: размер выплаты совпадает с ранее опубликованным календарём, сюрпризов инвесторы не ждут. Для стратегий «дивидендный захват» это рутинный, но важный технический этап.\n\nИмеет смысл заранее проверить, на каком счёте учитываются бумаги, какой налог удержат и когда ожидать зачисление — ошибки на отсечке дороже, чем кажется на первый взгляд. После выплаты котировки нередко проходят фазу «продали новость».\n\nЕсли вы в портфеле держите Сбер ради дохода, а не трейда, отсечка — повод сверить долю позиции с риском концентрации в одном эмитенте.',
    b9: 'Нефть Brent отступила после отчёта по коммерческим запасам в США — нефтегазовый сектор на МосБирже отреагировал с типичным лагом в одну–две сессии. ЛУКОЙЛ исторически коррелирует с сырьём чуть сильнее, чем «чистый» индекс нефти.\n\nНа этой неделе волатильность может вырасти: выходят отчёты крупных международных компаний и обновляются краткосрочные прогнозы по спросу. Часть спекулянтивных длинных позиций в секторе уже сокращена — это повышает риск резких внутридневных движений.\n\nЕсли вы держите ЛУКОЙЛ как нефтяную ставку, имеет смысл следить не только за Brent, но и за дисконтом Urals и налоговыми новостями — для российских эмитентов они не менее важны.',
    b10: 'В ходе сессии Сбербанк торговался чуть лучше индекса банков: внутридневные метрики — объёмы кредитования и комиссионный доход — уложились в ожидания, без позитивного или негативного сюрприза. Рынок воспринимает это как подтверждение базового сценария после сильного квартала.\n\nНа настроение влияли вторичные факторы: динамика длинных ОФЗ, курс юаня и общий риск-аппетит по emerging markets. В такой конфигурации «голубые фишки» банков часто становятся убежищем при умеренной волатильности.\n\nДля краткосрочного трейда важны уровни ликвидности в стакане и поток новостей по макро — один сильный принт по инфляции может перечеркнуть спокойный «банковский» день.',
    b11: 'Газпром: экспортные поставки идут по утверждённому графику, существенных срывов за неделю не зафиксировано. Котировки в основном следуют за европейскими газовыми хабами в пересчёте на рубль — фундаментальных «прорывов» в новостной ленте не было.\n\nИнвесторы ждут операционной статистики по добыче и комментариев по капзатратам на новые месторождения. Пока переговорная повестка по экспорту остаётся главным источником риска в оценке, а не квартальные цифры.\n\nБумага подходит не для ставки на быстрый рост, а для сценария «держать с дисконтом и пересматривать при ясности по маршрутам». Терпение и низкая доля в портфеле — разумная тактика в текущей фазе цикла.',
    b12: 'Новатэк после отчётности остаётся в фокусе LNG-темы: большинство брокеров сохранили рекомендации «покупать», спор развернулся вокруг итогового дивиденда на акцию, а не вокруг операционного провала. Проекты по сжиженному газу по-прежнему задают долгосрочный нарратив.\n\nРынок обсуждает валютную составляющую выручки: укрепление рубля формально давит на отчётность в рублях, но частично компенсируется hedging и контрактной структурой. Слабый рубль, наоборот, поддерживает дивидендную историю для локальных держателей.\n\nБлижайшие катализаторы — guidance по объёмам отгрузки и любые новости по санкционным ограничениям на оборудование. Это акция с премией за качество бизнеса и дисконтом за геополитику.',
    b13: 'Торговая сессия на МосБирже завершилась без драматургии: IMOEX закрылся ближе к середине недельного диапазона. Лидировали SBER и LKOH, металлурги и отдельные имена второго эшелона отставали — картина типичная для «выборочного» риск-он.\n\nОбъём торгов сопоставим со средним за пять сессий: крупных перераспределений между акциями и облигациями не видно. Завтра на календаре инфляционная статистика и аукцион ОФЗ — оба события могут задать тон открытию.\n\nЕсли вы торгуете индексными идеями, следите за динамикой ставок: при росте доходности длинных ОФЗ акции часто теряют краткосрочный импульс, даже при хороших микроновостях по отдельным эмитентам.',
    b14: 'Норникель обновил календарь плановых ремонтов на квартал — рынок оценивает, насколько остановки срежут объём при текущих ценах на никель с премией к LME. Маржа сегмента остаётся выше среднего за пять лет, что поддерживает оптимизм по дивидендам.\n\nESG-инвесторы отмечают прогресс в раскрытии выбросов, но ждут цифр по инвестициям в «зелёную» металлургию — без них премия за устойчивость не расширится. Для чисто финансового инвестора важнее цикл LME и курс рубля.\n\nКраткосрочно бумага может ходить в корреляции с глобальными металлургическими ETF; долгосрочно — в связке с политикой выплат и дисциплиной долга.',
    b15: 'Роснефть опубликовала обновлённый календарь корпоративных событий: даты раскрытия МСФО и годового собрания без сдвигов, изменений в дивидендной политике не анонсировали. Для рынка это «техническая» новость, но полезная для планирования.\n\nОценка акций по-прежнему завязана на Urals и налог на сверхприбыль — любой сигнал по ставке или льготам двигает модели быстрее, чем операционные мелочи. В секторе Роснефть часто воспринимают как ставку на дисциплину государственного участия и дивидендный поток.\n\nЕсли бумага есть в портфеле ради дохода, сверьте её вес с другими «нефтяными» именами — концентрация в одном факторе (цена нефти) легко превращается в скрытый макро-риск.'
  };



  function stripHtmlText(html) {
    if (!html) return '';
    var el = document.createElement('div');
    el.innerHTML = String(html);
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }



  function importanceNumToLevel(score) {
    var n = Number(score);
    if (!Number.isFinite(n)) return 'medium';
    if (n >= 85) return 'critical';
    if (n >= 72) return 'high';
    if (n >= 58) return 'medium';
    return 'low';
  }



  function detectNewsEventType(text) {
    var t = String(text || '').toLowerCase();
    var rules = [
      { type: 'earnings', keys: ['отчет', 'мсфо', 'рсбу', 'прибыл', 'выручк'] },
      { type: 'dividend', keys: ['дивиденд', 'выплат', 'отсечк'] },
      { type: 'rating', keys: ['рейтинг', 'таргет', 'рекомендац'] },
      { type: 'yield', keys: ['облигац', 'купон', 'офз', 'доходност'] },
      { type: 'macro', keys: ['ключев', 'инфляц', 'цб', 'ставк', 'рубл', 'санкц'] }
    ];
    var i, j, best = 'macro', bestScore = 0;
    for (i = 0; i < rules.length; i++) {
      var hits = 0;
      for (j = 0; j < rules[i].keys.length; j++) {
        if (t.indexOf(rules[i].keys[j]) >= 0) hits += 1;
      }
      if (hits > bestScore) {
        bestScore = hits;
        best = rules[i].type;
      }
    }
    return best;
  }



  function detectNewsTone(text) {
    var t = String(text || '').toLowerCase();
    var pos = 0;
    var neg = 0;
    ['рост', 'повыш', 'рекорд', 'улучш', 'прибыл'].forEach(function (w) {
      if (t.indexOf(w) >= 0) pos += 1;
    });
    ['падени', 'сниж', 'убыт', 'дефолт', 'санкц', 'риск'].forEach(function (w) {
      if (t.indexOf(w) >= 0) neg += 1;
    });
    if (pos > neg) return 'positive';
    if (neg > pos) return 'negative';
    return 'neutral';
  }



  function calcNewsImportance(eventType, sourceKind) {
    var base = { earnings: 82, dividend: 78, rating: 74, yield: 73, macro: 66, general: 50 };
    var boost = { market: 8, macro: 8, news: 4, analytics: 6 };
    return (base[eventType] || 55) + (boost[sourceKind] || 0);
  }



  function matchNewsTicker(text, feed) {
    var t = (' ' + String(text || '').toLowerCase() + ' ');
    var i, j, best = null, bestHits = 0;
    for (i = 0; i < NEWS_ASSET_MATCHERS.length; i++) {
      var m = NEWS_ASSET_MATCHERS[i];
      var hits = 0;
      if (t.indexOf(' ' + m.id.toLowerCase() + ' ') >= 0) hits += 2;
      for (j = 0; j < m.aliases.length; j++) {
        if (t.indexOf(m.aliases[j]) >= 0) hits += 1;
      }
      if (hits > bestHits) {
        bestHits = hits;
        best = m;
      }
    }
    if (best && bestHits > 0) return { ticker: best.id, type: best.type };
    if (feed && feed.macroTicker) return { ticker: feed.macroTicker, type: 'macro' };
    return { ticker: 'MOEX', type: 'macro' };
  }



  function briefIdFromLink(link) {
    var s = String(link || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'live-' + Math.abs(h).toString(36);
  }



  function getAllBriefs() {
    return LIVE_BRIEFS.length ? LIVE_BRIEFS : DEMO_BRIEFS;
  }



  function isLiveBriefsActive() {
    return LIVE_BRIEFS.length > 0 && BRIEFS_SOURCE !== 'demo';
  }



  function readBriefsCache() {
    try {
      var raw = localStorage.getItem(BRIEFS_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.items || Date.now() > parsed.expires) return null;
      return parsed.items;
    } catch (e) {
      return null;
    }
  }



  function writeBriefsCache(items) {
    try {
      localStorage.setItem(BRIEFS_CACHE_KEY, JSON.stringify({
        expires: Date.now() + BRIEFS_CACHE_TTL,
        items: items
      }));
    } catch (e) { /* quota */ }
  }



  function mapApiBriefToUi(item) {
    var essay = stripHtmlText(item.essay || item.title || '');
    var summary = essay.length > 320 ? essay.slice(0, 317) + '…' : essay;
    return {
      id: item.id,
      ticker: item.assetId || 'MOEX',
      type: item.assetType === 'bond' ? 'bond' : (item.assetType === 'macro' ? 'macro' : 'stock'),
      publishedAt: item.publishedAt || new Date().toISOString(),
      eventType: item.eventType || 'macro',
      tone: item.tone || 'neutral',
      importance: importanceNumToLevel(item.importance),
      title: item.title || 'Без заголовка',
      summary: summary,
      body: essay,
      sourceUrl: item.sourceUrl || '#',
      sourceName: item.sourceName || 'источник',
      isLive: true
    };
  }



  function rssTagText(item, tagName) {
    var nodes = item.getElementsByTagName(tagName);
    if (nodes.length) return (nodes[0].textContent || '').trim();
    return '';
  }



  function rssItemContent(item) {
    var enc = item.getElementsByTagNameNS('http://purl.org/rss/1.0/modules/content/', 'encoded');
    if (enc.length) return enc[0].textContent || '';
    return rssTagText(item, 'description');
  }



  function parseRssItems(xml) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    var nodes = doc.querySelectorAll('item');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var item = nodes[i];
      var title = rssTagText(item, 'title');
      var link = rssTagText(item, 'link');
      if (!title || !link) continue;
      out.push({
        title: title,
        link: link,
        pubDate: rssTagText(item, 'pubDate'),
        description: rssTagText(item, 'description'),
        content: rssItemContent(item)
      });
    }
    return out;
  }



  var RSS_FETCH_TIMEOUT_MS = 12000;
  var BRIEFS_LOAD_TIMEOUT_MS = 55000;
  var RSS_FEED_STAGGER_MS = 700;
  var RSS_FEED_RETRY_COUNT = 2;
  var RSS2JSON_ITEM_COUNT = 12;



  /** Локальный бэкенд (npm start) — на GitHub Pages API нет, только RSS через прокси. */
  function hasLocalNewsApi() {
    if (location.protocol === 'file:') return false;
    var host = (location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  }



  function fetchWithTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms);
      })
    ]);
  }



  function delayMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }



  function fetchWithRetry(task, retries) {
    return task().catch(function (err) {
      if (retries <= 0) throw err;
      return delayMs(900).then(function () {
        return fetchWithRetry(task, retries - 1);
      });
    });
  }



  function proxyUrlsFor(targetUrl) {
    var enc = encodeURIComponent(targetUrl);
    var urls = [];
    if (hasLocalNewsApi()) {
      urls.push('/api/rss?url=' + enc);
    }
    urls.push('https://api.allorigins.win/raw?url=' + enc);
    return urls;
  }



  function fetchTextViaProxies(targetUrl) {
    var tryUrls = proxyUrlsFor(targetUrl);
    var idx = 0;
    function next() {
      if (idx >= tryUrls.length) return Promise.reject(new Error('proxy fetch failed'));
      var url = tryUrls[idx++];
      return fetchWithTimeout(
        fetch(url, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
          if (!res.ok) throw new Error('http ' + res.status);
          return res.text();
        }),
        RSS_FETCH_TIMEOUT_MS
      ).catch(next);
    }
    return next();
  }



  function fetchRssXmlRaw(feedUrl) {
    return fetchTextViaProxies(feedUrl);
  }



  function mapRss2JsonItems(data) {
    if (!data || data.status !== 'ok' || !Array.isArray(data.items)) {
      throw new Error('rss2json empty');
    }
    return data.items.map(function (item) {
      return {
        title: item.title || '',
        link: item.link || item.guid || '',
        pubDate: item.pubDate || '',
        description: item.description || '',
        content: item.content || item.description || ''
      };
    }).filter(function (item) {
      return item.title && item.link;
    });
  }



  /** JSON-прокси для GitHub Pages. Только rss2json.com — api.rss2json.com редиректит на /proxy/ и ломается с <base href>. */
  function fetchRssViaRss2Json(feedUrl) {
    var api =
      'https://rss2json.com/api.json?rss_url=' +
      encodeURIComponent(feedUrl) +
      '&count=' +
      RSS2JSON_ITEM_COUNT;
    return fetchWithTimeout(
      fetch(api, { credentials: 'omit', cache: 'no-store', redirect: 'follow' }).then(function (res) {
        if (!res.ok) throw new Error('rss2json ' + res.status);
        if (res.url && /\/proxy\//i.test(res.url)) throw new Error('rss2json redirect');
        return res.json();
      }),
      RSS_FETCH_TIMEOUT_MS
    ).then(mapRss2JsonItems);
  }



  function fetchRssViaAllOrigins(feedUrl) {
    var api = 'https://api.allorigins.win/get?url=' + encodeURIComponent(feedUrl);
    return fetchWithTimeout(
      fetch(api, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('allorigins ' + res.status);
        return res.json();
      }),
      RSS_FETCH_TIMEOUT_MS
    ).then(function (data) {
      var xml = data && data.contents;
      if (!xml) throw new Error('allorigins empty');
      var parsed = parseRssItems(xml);
      if (!parsed.length) throw new Error('allorigins parse');
      return parsed;
    });
  }



  function fetchRssFeedItems(feedUrl) {
    if (hasLocalNewsApi()) {
      return fetchWithTimeout(
        fetchRssXmlRaw(feedUrl).then(function (xml) {
          var parsed = parseRssItems(xml);
          if (parsed.length) return parsed;
          return fetchRssViaRss2Json(feedUrl);
        }).catch(function () {
          return fetchRssViaRss2Json(feedUrl).catch(function () { return []; });
        }),
        RSS_FETCH_TIMEOUT_MS
      );
    }
    return fetchRssViaRss2Json(feedUrl)
      .catch(function () { return fetchRssViaAllOrigins(feedUrl); })
      .catch(function () { return []; });
  }



  function fetchRssFeedItemsWithRetry(feedUrl) {
    return fetchWithRetry(function () {
      return fetchRssFeedItems(feedUrl);
    }, RSS_FEED_RETRY_COUNT);
  }



  function mapRssItemToBrief(rssItem, feed) {
    var plain = stripHtmlText([rssItem.title, rssItem.description, rssItem.content].join(' '));
    var body = stripHtmlText(rssItem.content || rssItem.description || '');
    if (!body) body = plain;
    var summary = stripHtmlText(rssItem.description || body);
    if (summary.length > 320) summary = summary.slice(0, 317) + '…';
    var asset = matchNewsTicker(plain, feed);
    var eventType = detectNewsEventType(plain);
    var tone = detectNewsTone(plain);
    var pub = rssItem.pubDate ? new Date(rssItem.pubDate) : new Date();
    if (isNaN(pub.getTime())) pub = new Date();
    return {
      id: briefIdFromLink(rssItem.link),
      ticker: asset.ticker,
      type: asset.type,
      publishedAt: pub.toISOString(),
      eventType: eventType,
      tone: tone,
      importance: importanceNumToLevel(calcNewsImportance(eventType, feed.kind)),
      title: stripHtmlText(rssItem.title),
      summary: summary || stripHtmlText(rssItem.title),
      body: body,
      sourceUrl: rssItem.link,
      sourceName: feed.name,
      isLive: true
    };
  }



  function dedupeBriefs(list) {
    var seen = {};
    var out = [];
    list.forEach(function (b) {
      var key = b.sourceUrl || b.id;
      if (seen[key]) return;
      seen[key] = true;
      out.push(b);
    });
    return out;
  }



  function sortBriefsNewest(list) {
    return list.sort(function (a, b) {
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
  }



  function mergeLiveBriefsPartial(collected) {
    if (!collected.length) return;
    LIVE_BRIEFS = dedupeBriefs(collected).sort(function (a, b) {
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    }).slice(0, 120);
    BRIEFS_SOURCE = 'live';
    writeBriefsCache(LIVE_BRIEFS);
    if (typeof renderHomePage === 'function') renderHomePage();
    else renderBriefing();
    renderFeed();
    updateStats();
  }



  function fetchLiveBriefsFromRss() {
    var collected = [];
    return NEWS_FEEDS.reduce(function (chain, feed, feedIndex) {
      return chain
        .then(function () {
          if (feedIndex > 0) return delayMs(RSS_FEED_STAGGER_MS);
        })
        .then(function () {
          return fetchRssFeedItemsWithRetry(feed.url);
        })
        .then(function (items) {
          var part = items.map(function (item) {
            return mapRssItemToBrief(item, feed);
          });
          if (part.length) {
            collected = collected.concat(part);
            mergeLiveBriefsPartial(collected);
          }
          return part;
        })
        .catch(function () {
          return [];
        });
    }, Promise.resolve()).then(function () {
      return sortBriefsNewest(dedupeBriefs(collected)).slice(0, 120);
    });
  }



  function fetchLiveBriefsFromApi() {
    if (!hasLocalNewsApi()) return Promise.reject(new Error('no api'));
    return fetch('/api/briefs?limit=120&sort=newest', { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('api ' + res.status);
        return res.json();
      })
      .then(function (items) {
        if (!items || !items.length) throw new Error('api empty');
        return items.map(mapApiBriefToUi);
      });
  }



  function applyLiveBriefs(items, source) {
    LIVE_BRIEFS = items;
    BRIEFS_SOURCE = source;
    writeBriefsCache(items);
    state.briefsLoading = false;
    if (typeof renderHomePage === 'function') renderHomePage();
    else renderBriefing();
    renderFeed();
    updateStats();
  }



  function finishBriefsLoading(fallbackDemo) {
    state.briefsLoading = false;
    if (LIVE_BRIEFS.length) {
      if (BRIEFS_SOURCE === 'loading') BRIEFS_SOURCE = 'live';
    } else if (fallbackDemo) {
      BRIEFS_SOURCE = 'demo';
    } else if (BRIEFS_SOURCE === 'loading') {
      BRIEFS_SOURCE = 'demo';
    }
    if (typeof renderHomePage === 'function') renderHomePage();
    else renderBriefing();
    renderFeed();
    updateStats();
  }



  function loadLiveBriefs() {
    state.briefsLoading = true;
    BRIEFS_SOURCE = 'loading';
    var cached = readBriefsCache();
    if (cached && cached.length) {
      LIVE_BRIEFS = cached;
      BRIEFS_SOURCE = 'cache';
      renderBriefing();
      renderFeed();
    } else {
      renderBriefing();
      renderFeed();
    }

    var livePromise = hasLocalNewsApi()
      ? fetchLiveBriefsFromApi().catch(function () { return fetchLiveBriefsFromRss(); })
      : fetchLiveBriefsFromRss();

    fetchWithTimeout(livePromise, BRIEFS_LOAD_TIMEOUT_MS)
      .then(function (items) {
        if (items && items.length) {
          applyLiveBriefs(items, 'live');
          return;
        }
        finishBriefsLoading(!LIVE_BRIEFS.length);
      })
      .catch(function () {
        finishBriefsLoading(!LIVE_BRIEFS.length);
      })
      .finally(function () {
        if (state.briefsLoading) finishBriefsLoading(!LIVE_BRIEFS.length);
      });
  }

  var LIVE_BRIEFS = [];
  var BRIEFS_SOURCE = 'loading';
  var BRIEFS_CACHE_KEY = 'ibrf.liveBriefs';
  var BRIEFS_CACHE_TTL = 12 * 60 * 1000;

  var NEWS_FEEDS = [
    { id: 'moex', name: 'Мосбиржа', url: 'https://www.moex.com/export/news.aspx?limit=40&lang=ru', kind: 'market', macroTicker: 'MOEX' },
    { id: 'cbr', name: 'Банк России', url: 'https://www.cbr.ru/rss/RssNews', kind: 'macro', macroTicker: 'MOEX' },
    { id: 'interfax', name: 'Интерфакс', url: 'https://www.interfax.ru/rss.asp', kind: 'news', macroTicker: 'MOEX' },
    { id: 'cbr_press', name: 'Банк России — пресс-релизы', url: 'https://www.cbr.ru/rss/RssPress', kind: 'macro', macroTicker: 'MOEX' },
    { id: 'rbc', name: 'РБК', url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', kind: 'news', macroTicker: 'MOEX' },
    { id: 'smartlab', name: 'Smart-Lab', url: 'https://smart-lab.ru/bonds/rss/all/', kind: 'analytics', macroTicker: 'MOEX' }
  ];

  var NEWS_ASSET_MATCHERS = [
    { id: 'SBER', type: 'stock', aliases: ['сбербанк', 'сбер ', ' sber', 'sberbank'] },
    { id: 'GAZP', type: 'stock', aliases: ['газпром', 'gazprom', ' gazp'] },
    { id: 'LKOH', type: 'stock', aliases: ['лукойл', 'lukoil', ' lkoh'] },
    { id: 'ROSN', type: 'stock', aliases: ['роснефть', 'rosneft', ' rosn'] },
    { id: 'NVTK', type: 'stock', aliases: ['новатэк', 'novatek', ' nvtk'] },
    { id: 'GMKN', type: 'stock', aliases: ['норникель', 'nornickel', ' gmkn', 'гмк '] },
    { id: 'TATN', type: 'stock', aliases: ['татнефть', 'tatneft', ' tatn'] },
    { id: 'MTSS', type: 'stock', aliases: [' мтс ', 'mtss'] },
    { id: 'VTBR', type: 'stock', aliases: ['втб', 'vtb', ' vtbr'] },
    { id: 'MOEX', type: 'stock', aliases: ['мосбирж', 'moex', 'московск бирж'] },
    { id: 'IMOEX', type: 'macro', aliases: ['imoex', 'индекс мосбирж', 'индекс ммвб'] },
    { id: 'OFZ_26241', type: 'bond', aliases: ['офз 26241', '26241', 'su26241'] }
  ];

  var state = {
    tab: 'briefing',
    horizon: 'today',
    chartHorizon: 'week',
    imoexHorizon: 'month',
    chartTicker: '',
    folderOpen: false,
    chartRequestId: 0,
    briefArticleReqId: 0,
    briefsLoading: true,
    toastTimer: null,
    pfEditTicker: '',
    pfEditPrefix: ''
  };

  var CHART_HORIZONS = {
    day: { label: 'День', points: 24, stepMs: 60 * 60 * 1000 },
    week: { label: 'Неделя', points: 7, stepMs: 24 * 60 * 60 * 1000 },
    month: { label: 'Месяц', points: 30, stepMs: 24 * 60 * 60 * 1000 },
    year: { label: 'Год', points: 52, stepMs: 7 * 24 * 60 * 60 * 1000 }
  };

  var MOEX_ISS = 'https://iss.moex.com/iss';
  var MOEX_CACHE_PREFIX = 'ibrf.moex.';
  var MOEX_CACHE_TTL = 15 * 60 * 1000;
  var IMOEX_SECID = 'IMOEX';

  var BOND_SECID_MAP = {
    OFZ_26241: 'SU26241RMFS2',
    OFZ_26238: 'SU26238RMFS0',
    OFZ_26243: 'SU26243RMFS8',
    OFZ_26244: 'SU26244RMFS6',
    OFZ_29024: 'SU29024RMFS8',
    SU26238RMFS2: 'SU26238RMFS0'
  };



  function isInHorizon(isoDate, horizon) {
    var pub = new Date(isoDate);
    var now = new Date();
    var start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (horizon === 'today') {
      var end = new Date(start);
      end.setDate(end.getDate() + 1);
      return pub >= start && pub < end;
    }
    if (horizon === 'week') {
      var weekStart = new Date(start);
      weekStart.setDate(weekStart.getDate() - 7);
      return pub >= weekStart;
    }
    if (horizon === 'month') {
      var monthStart = new Date(start);
      monthStart.setDate(monthStart.getDate() - 30);
      return pub >= monthStart;
    }
    return true;
  }



  function countNewBriefs() {
    var last = getLastVisit();
    var briefs = getAllBriefs();
    if (!last) return briefs.length;
    return briefs.filter(function (b) {
      return new Date(b.publishedAt).getTime() > last;
    }).length;
  }



  function updateStats() {
    var n = countNewBriefs();
    var badges = [
      document.getElementById('sidebarBriefBadge'),
      document.getElementById('navBriefBadge')
    ];
    badges.forEach(function (badge) {
      if (!badge) return;
      if (n > 0) {
        badge.hidden = false;
        badge.textContent = n > 99 ? '99+' : String(n);
      } else {
        badge.hidden = true;
      }
    });
  }



  function getBriefById(id) {
    var briefs = getAllBriefs();
    for (var i = 0; i < briefs.length; i++) {
      if (briefs[i].id === id) return briefs[i];
    }
    return null;
  }



  function getSourceLabel(url, sourceName) {
    if (sourceName) return sourceName;
    try {
      var host = new URL(url).hostname.replace(/^www\./, '');
      if (host.indexOf('moex') >= 0) return 'Мосбиржа';
      if (host.indexOf('cbr.ru') >= 0) return 'Банк России';
      if (host.indexOf('rbc.ru') >= 0) return 'РБК';
      if (host.indexOf('interfax') >= 0) return 'Интерфакс';
      if (host.indexOf('smart-lab') >= 0) return 'Smart-Lab';
      return host;
    } catch (e) {
      return 'официальный сайт';
    }
  }



  function buildBriefBody(b) {
    if (b.isLive && b.body) return b.body;
    if (b.body) return b.body;
    if (BRIEF_BODIES_BY_ID[b.id]) return BRIEF_BODIES_BY_ID[b.id];
    var company = getTickerSubtitle(b.ticker);
    var et = EVENT_TYPE_LABELS[b.eventType] || 'корпоративное событие';
    return b.summary + '\n\n' + company + ' (' + b.ticker + '): ' + et + '. Подробности — в материале на сайте источника (ссылка ниже).';
  }



  function getBriefTeaser(b) {
    if (b.teaser) return b.teaser;
    return b.summary;
  }



  function getBriefDisplayTeaser(b) {
    var content = getBriefContent(b);
    var fmt = getSettings().briefFormat || 'concise';
    var teaser = content.teaser || '';
    if (fmt === 'concise') {
      if (teaser.length > 140) return teaser.slice(0, 137) + '…';
      return teaser;
    }
    if (fmt === 'analytical') {
      var body = content.body || '';
      var extra = body.split(/\n\n+/)[0] || '';
      if (extra && extra.length > 40 && teaser.indexOf(extra.slice(0, 40)) === -1) {
        return teaser + ' ' + extra.slice(0, 220) + (extra.length > 220 ? '…' : '');
      }
    }
    return teaser;
  }



  function getBriefContent(b) {
    if (!b || !b.id) return { teaser: '', body: '' };
    return {
      teaser: getBriefTeaser(b),
      body: buildBriefBody(b)
    };
  }



  function extractBriefExcerptFromHtml(html) {
    if (!html) return null;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var metas = doc.querySelectorAll('meta[property="og:description"], meta[name="og:description"], meta[name="description"]');
    for (var i = 0; i < metas.length; i++) {
      var text = (metas[i].getAttribute('content') || '').trim();
      if (text.length > 40) return text;
    }
    return null;
  }



  function fetchBriefSourceExcerpt(url) {
    if (!url || url === '#') return Promise.resolve(null);
    var proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    return fetch(proxyUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed');
        return res.text();
      })
      .then(extractBriefExcerptFromHtml)
      .catch(function () { return null; });
  }



  function ensureBriefArticleNoticeEl() {
    var notice = document.getElementById('briefArticleNotice');
    if (notice) return notice;
    var bodyEl = document.getElementById('briefArticleBody');
    if (!bodyEl || !bodyEl.parentElement) return null;
    notice = document.createElement('p');
    notice.id = 'briefArticleNotice';
    notice.className = 'brief-article-notice muted';
    notice.hidden = true;
    bodyEl.parentElement.insertBefore(notice, bodyEl);
    return notice;
  }



  function formatBriefBodyHtml(text) {
    return String(text || '').split(/\n\n+/).map(function (p) {
      p = p.trim();
      if (!p) return '';
      return '<p>' + escapeHtml(p) + '</p>';
    }).join('');
  }



  function renderBriefMetaHtml(b) {
    var toneClass = 'tag-tone-' + (b.tone || 'neutral');
    return (
      '<span class="ticker">' + escapeHtml(b.ticker) + '</span>' +
      '<span class="tag tag-importance">' + escapeHtml(IMPORTANCE_LABELS[b.importance] || b.importance) + '</span>' +
      '<span class="tag ' + escapeHtml(toneClass) + '">' + escapeHtml(TONE_LABELS[b.tone] || b.tone) + '</span>' +
      '<span class="muted">' + escapeHtml(new Date(b.publishedAt).toLocaleString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      })) + '</span>'
    );
  }



  function openBriefArticleModal(id) {
    var b = getBriefById(id);
    if (!b) return;
    var content = getBriefContent(b);
    var reqId = ++state.briefArticleReqId;
    var modal = document.getElementById('briefArticleModal');
    var bodyEl = document.getElementById('briefArticleBody');
    var noticeEl = ensureBriefArticleNoticeEl();
    document.getElementById('briefArticleMeta').innerHTML = renderBriefMetaHtml(b);
    document.getElementById('briefArticleTitle').textContent = b.title;
    bodyEl.innerHTML = formatBriefBodyHtml(content.body);
    if (noticeEl) {
      noticeEl.textContent = 'Проверяем сайт источника…';
      noticeEl.hidden = false;
    }
    var link = document.getElementById('briefArticleSourceLink');
    link.href = safeUrl(b.sourceUrl);
    link.textContent = getSourceLabel(b.sourceUrl, b.sourceName) + ' →';
    modal.hidden = false;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (b.isLive) {
      if (noticeEl) {
        noticeEl.textContent = 'Краткий текст с сайта «' + getSourceLabel(b.sourceUrl, b.sourceName) +
          '». Полная версия — по ссылке ниже.';
        noticeEl.hidden = false;
      }
      return;
    }

    fetchBriefSourceExcerpt(b.sourceUrl).then(function (excerpt) {
      if (reqId !== state.briefArticleReqId) return;
      if (excerpt && excerpt.length > 40) {
        bodyEl.innerHTML =
          '<div class="brief-source-excerpt">' +
            '<p class="brief-excerpt-label">С сайта источника</p>' +
            formatBriefBodyHtml(excerpt) +
          '</div>' +
          '<p class="brief-excerpt-label">Сводка InvestBrief</p>' +
          formatBriefBodyHtml(content.body);
        if (noticeEl) noticeEl.hidden = true;
      } else if (noticeEl) {
        noticeEl.textContent = 'Полный текст публикации — на сайте источника (ссылка ниже).';
        noticeEl.hidden = false;
      }
    });
  }



  function closeBriefArticleModal() {
    var modal = document.getElementById('briefArticleModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.hidden = true;
    document.body.style.overflow = '';
  }



  function handleBriefListClick(e) {
    if (e.target.closest('.brief-source-link')) return;
    var readBtn = e.target.closest('.brief-read-btn[data-brief-id]');
    if (readBtn) {
      e.preventDefault();
      openBriefArticleModal(readBtn.getAttribute('data-brief-id'));
      return;
    }
    var card = e.target.closest('.brief-card[data-brief-id]');
    if (!card) return;
    openBriefArticleModal(card.getAttribute('data-brief-id'));
  }



  function handleBriefListKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.brief-card[data-brief-id]');
    if (!card) return;
    e.preventDefault();
    openBriefArticleModal(card.getAttribute('data-brief-id'));
  }



  function getPositionTickers() {
    var map = {};
    getWatchlist().forEach(function (t) {
      t = normalizeTicker(t);
      if (t) map[t] = true;
    });
    getPortfolio().positions.forEach(function (p) {
      var t = normalizeTicker(p.ticker);
      if (t && t !== 'IMOEX' && t !== 'MOEX' && t !== 'INDEX') map[t] = true;
    });
    return Object.keys(map);
  }



  function sortBriefsByImportance(briefs) {
    return briefs.slice().sort(function (a, b) {
      var ia = IMPORTANCE_ORDER[b.importance] || 0;
      var ib = IMPORTANCE_ORDER[a.importance] || 0;
      if (ia !== ib) return ia - ib;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
  }



  function filterBriefsForBriefingFrom(briefs) {
    var horizon = state.horizon;
    var scope = getSettings().briefingScope;
    var positions = getPositionTickers();
    return briefs.filter(function (b) {
      if (!isInHorizon(b.publishedAt, horizon)) return false;
      if (scope === 'mine' && positions.length) {
        return positions.indexOf(normalizeTicker(b.ticker)) !== -1;
      }
      return true;
    }).sort(function (a, b) {
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
  }



  function filterBriefsForBriefing() {
    return filterBriefsForBriefingFrom(getAllBriefs());
  }



  function filterBriefsForPositions(briefs, tickers) {
    if (!tickers.length) return [];
    return briefs.filter(function (b) {
      return tickers.indexOf(normalizeTicker(b.ticker)) !== -1;
    });
  }



  function renderBriefCard(b) {
    var impClass = 'importance-' + (b.importance || 'medium');
    var content = getBriefContent(b);
    var url = safeUrl(b.sourceUrl);
    return (
      '<article class="glass brief-card magic-bento-card magic-bento-card--border-glow ' + escapeHtml(impClass) + '" ' +
        'data-brief-id="' + escapeHtml(b.id) + '" tabindex="0" role="button" ' +
        'aria-label="Открыть материал: ' + escapeHtml(b.title) + '">' +
        '<div class="brief-meta">' + renderBriefMetaHtml(b) + '</div>' +
        '<h3 class="brief-title">' + escapeHtml(b.title) + '</h3>' +
        '<p class="brief-summary">' + escapeHtml(getBriefDisplayTeaser(b)) + '</p>' +
        '<div class="brief-footer">' +
          '<button type="button" class="primary brief-read-btn" data-brief-id="' + escapeHtml(b.id) + '">Читать полностью</button>' +
          '<a class="brief-source-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(b.isLive ? ('Оригинал: ' + getSourceLabel(url, b.sourceName)) : 'Оригинал на сайте источника') + ' →</a>' +
        '</div>' +
      '</article>'
    );
  }



  function getBriefingHintHtml() {
    var positions = getPositionTickers();
    var scope = getSettings().briefingScope;
    var sourceLine = isLiveBriefsActive()
      ? 'Новости из официальных источников: Мосбиржа, Банк России, РБК, Интерфакс и др.'
      : (BRIEFS_SOURCE === 'demo'
        ? 'Сейчас не удалось загрузить ленту — показаны примеры материалов. Обновите страницу через минуту.'
        : (state.briefsLoading
          ? 'Загружаем ленту с новостных источников… Пока показаны примеры.'
          : (BRIEFS_SOURCE === 'loading'
            ? 'Не удалось обновить ленту — показаны примеры. Обновите страницу.'
            : 'Загружаем ленту с новостных источников…')));
    if (scope === 'mine') {
      if (positions.length) {
        return escapeHtml('Сводка по вашим бумагам: ' + positions.join(', ') + '.') +
          '<br>' + escapeHtml(sourceLine);
      }
      return escapeHtml('Добавьте бумаги в наблюдение или портфель — сводка покажет только их.') +
        '<br>' + escapeHtml(sourceLine);
    }
    return escapeHtml(sourceLine);
  }



  function renderBriefListInto(el, list, emptyMsg) {
    if (!el) return;
    if (state.briefsLoading && !list.length) {
      var interim = filterBriefsForBriefingFrom(DEMO_BRIEFS);
      if (interim.length) {
        el.innerHTML = interim.map(renderBriefCard).join('');
        return;
      }
      el.innerHTML = '<div class="empty-state glass">Загружаем новости…</div>';
      return;
    }
    if (!list.length) {
      el.innerHTML = '<div class="empty-state glass">' + escapeHtml(emptyMsg) + '</div>';
      return;
    }
    el.innerHTML = list.map(renderBriefCard).join('');
  }



  function renderHomePage() {
    var topEl = document.getElementById('topBriefsList');
    var myEl = document.getElementById('myBriefsList');
    var legacyEl = document.getElementById('briefingList');
    var hint = document.getElementById('briefingFilterHint');
    destroyBriefingBento();
    if (hint) {
      hint.innerHTML = '<p class="briefing-data-notice">' + getBriefingHintHtml() + '</p>';
    }
    if (!topEl && !myEl) {
      if (legacyEl) {
        renderBriefListInto(legacyEl, filterBriefsForBriefing(), 'Нет материалов сводки за выбранный горизонт.');
      }
      initBriefingBento();
      updateStats();
      return;
    }
    var base = filterBriefsForBriefing();
    var positions = getPositionTickers();
    var topList = sortBriefsByImportance(base).slice(0, 5);
    var myList = sortBriefsByImportance(filterBriefsForPositions(base, positions)).slice(0, 12);
    renderBriefListInto(topEl, topList, 'Нет главных событий за выбранный горизонт.');
    renderBriefListInto(myEl, myList, positions.length
      ? 'Нет новостей по вашим бумагам за этот период.'
      : 'Добавьте тикеры в наблюдение или портфель — здесь появятся связанные новости.');
    initBriefingBento();
    updateStats();
  }



  function renderBriefing() {
    renderHomePage();
  }



  function applyFeedFilters(briefs) {
    var f = getFilters();
    var wl = getWatchlist();
    var q = (f.search || '').toLowerCase();
    var filtered = briefs.filter(function (b) {
      if (f.type && b.type !== f.type) return false;
      if (f.asset && normalizeTicker(b.ticker).indexOf(normalizeTicker(f.asset)) === -1) return false;
      if (f.eventType && b.eventType !== f.eventType) return false;
      if (f.tone && b.tone !== f.tone) return false;
      if (f.importance && b.importance !== f.importance) return false;
      if (f.onlyWatchlist && wl.length > 0 && wl.indexOf(normalizeTicker(b.ticker)) === -1) return false;
      if (q) {
        var bc = getBriefContent(b);
        var hay = (b.title + ' ' + bc.teaser + ' ' + bc.body).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    if (f.sort === 'date-asc') {
      filtered.sort(function (a, b) { return new Date(a.publishedAt) - new Date(b.publishedAt); });
    } else if (f.sort === 'importance') {
      filtered.sort(function (a, b) {
        return (IMPORTANCE_ORDER[b.importance] || 0) - (IMPORTANCE_ORDER[a.importance] || 0);
      });
    } else {
      filtered.sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });
    }
    return filtered;
  }



  function renderFeed() {
    var el = document.getElementById('feedList');
    if (!el) return;
    var list = applyFeedFilters(getAllBriefs());
    if (list.length === 0) {
      el.innerHTML = '<div class="empty-state glass">Ничего не найдено по фильтрам.</div>';
      return;
    }
    el.innerHTML = list.map(renderBriefCard).join('');
  }



  function syncFiltersFromUI() {
    if (!document.getElementById('feedType')) return;
    setFilters({
      type: document.getElementById('feedType').value,
      asset: document.getElementById('feedAsset').value,
      eventType: document.getElementById('feedEvent').value,
      tone: document.getElementById('feedTone').value,
      importance: document.getElementById('feedImportance').value,
      sort: document.getElementById('feedSort').value,
      search: document.getElementById('feedSearch').value,
      onlyWatchlist: document.getElementById('feedOnlyWatchlist').checked
    });
    renderFeed();
  }



  function loadFiltersToUI() {
    if (!document.getElementById('feedType')) return;
    var f = getFilters();
    document.getElementById('feedType').value = f.type || '';
    document.getElementById('feedAsset').value = f.asset || '';
    document.getElementById('feedEvent').value = f.eventType || '';
    document.getElementById('feedTone').value = f.tone || '';
    document.getElementById('feedImportance').value = f.importance || '';
    document.getElementById('feedSort').value = f.sort || 'date-desc';
    document.getElementById('feedSearch').value = f.search || '';
    document.getElementById('feedOnlyWatchlist').checked = !!f.onlyWatchlist;
  }


