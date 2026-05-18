(function () {
'use strict';

  'use strict';

  var KEYS = {
    profile: 'ibrf.profile',
    watchlist: 'ibrf.watchlist',
    settings: 'ibrf.settings',
    alerts: 'ibrf.alerts',
    digest: 'ibrf.digest',
    portfolio: 'ibrf.portfolio',
    filters: 'ibrf.filters',
    lastVisit: 'ibrf.lastVisit',
    marketTiles: 'ibrf.marketTiles',
    tickerNames: 'ibrf.tickerNames'
  };

  var IMPORTANCE_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
  var THRESHOLD_LABELS = ['Любая', 'Средняя и выше', 'Высокая и выше', 'Только критическая'];
  var TONE_LABELS = { positive: 'Позитив', negative: 'Негатив', neutral: 'Нейтрально' };
  var IMPORTANCE_LABELS = { low: 'Низкая', medium: 'Средняя', high: 'Высокая', critical: 'Критическая' };
  var EVENT_TYPE_LABELS = {
    earnings: 'Отчётность',
    rating: 'Рейтинг и обзоры',
    macro: 'Макро и рынок',
    dividend: 'Дивиденды',
    yield: 'Доходность облигаций'
  };

  var PRESETS = {
    bluechips: ['SBER', 'GAZP', 'LKOH', 'GMKN', 'NVTK', 'ROSN'],
    bonds: ['OFZ_26241', 'OFZ_26238', 'SU26238RMFS2'],
    dividends: ['SBER', 'TATN', 'MTSS', 'MGNT', 'PLZL']
  };

  var DEFAULT_PORTFOLIO = [
    { ticker: 'IMOEX', avgPrice: 3180, currentPrice: 3250 },
    { ticker: 'SBER', avgPrice: 265.5, currentPrice: 278.2 },
    { ticker: 'LKOH', avgPrice: 7120, currentPrice: 6985 },
    { ticker: 'GAZP', avgPrice: 162.3, currentPrice: 158.9 },
    { ticker: 'OFZ_26241', avgPrice: 92.1, currentPrice: 93.4 }
  ];

  var DEFAULT_MARKET_TICKERS = ['IMOEX', 'SBER', 'GAZP', 'LKOH', 'GMKN', 'TATN', 'NVTK'];

  var TICKER_SUBTITLES = {
    IMOEX: 'Индекс МосБиржи',
    MOEX: 'МосБиржа',
    SBER: 'Сбербанк',
    GAZP: 'Газпром',
    LKOH: 'ЛУКОЙЛ',
    GMKN: 'Норникель',
    TATN: 'Татнефть',
    NVTK: 'Новатэк',
    ROSN: 'Роснефть',
    MTSS: 'МТС',
    MGNT: 'Магнит',
    PLZL: 'Полюс',
    YNDX: 'Яндекс',
    VTBR: 'ВТБ',
    NLMK: 'НЛМК',
    CHMF: 'Северсталь',
    ALRS: 'АЛРОСА',
    OFZ_26241: 'ОФЗ 26241',
    OFZ_26238: 'ОФЗ 26238'
  };

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

  /* Запасная лента, если RSS/API недоступны. Котировки — MOEX ISS в реальном времени. */
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

  function fetchRssXml(feedUrl) {
    var tryUrls = [];
    if (location.protocol !== 'file:') {
      tryUrls.push('/api/rss?url=' + encodeURIComponent(feedUrl));
    }
    tryUrls.push('https://api.allorigins.win/raw?url=' + encodeURIComponent(feedUrl));
    var idx = 0;
    function next() {
      if (idx >= tryUrls.length) return Promise.reject(new Error('rss fetch failed'));
      var url = tryUrls[idx++];
      return fetch(url, { credentials: 'omit' }).then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.text();
      }).catch(next);
    }
    return next();
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

  function fetchLiveBriefsFromRss() {
    var collected = [];
    var chain = Promise.resolve();
    NEWS_FEEDS.forEach(function (feed) {
      chain = chain.then(function () {
        return fetchRssXml(feed.url).then(function (xml) {
          var items = parseRssItems(xml).slice(0, 25);
          items.forEach(function (item) {
            collected.push(mapRssItemToBrief(item, feed));
          });
        }).catch(function () { /* источник недоступен */ });
      });
    });
    return chain.then(function () {
      return dedupeBriefs(collected).sort(function (a, b) {
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      }).slice(0, 120);
    });
  }

  function fetchLiveBriefsFromApi() {
    if (location.protocol === 'file:') return Promise.reject(new Error('no api'));
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
    renderBriefing();
    renderFeed();
    updateStats();
  }

  function loadLiveBriefs() {
    state.briefsLoading = true;
    var cached = readBriefsCache();
    if (cached && cached.length) {
      applyLiveBriefs(cached, 'cache');
    } else {
      renderBriefing();
      renderFeed();
    }

    fetchLiveBriefsFromApi()
      .catch(function () { return fetchLiveBriefsFromRss(); })
      .then(function (items) {
        if (items && items.length) {
          applyLiveBriefs(items, 'live');
        } else if (!LIVE_BRIEFS.length) {
          BRIEFS_SOURCE = 'demo';
          state.briefsLoading = false;
          renderBriefing();
          renderFeed();
        }
      })
      .catch(function () {
        if (!LIVE_BRIEFS.length) {
          BRIEFS_SOURCE = 'demo';
          state.briefsLoading = false;
          renderBriefing();
          renderFeed();
        }
      });
  }

  var LIVE_BRIEFS = [];
  var BRIEFS_SOURCE = 'loading';
  var BRIEFS_CACHE_KEY = 'ibrf.liveBriefs';
  var BRIEFS_CACHE_TTL = 12 * 60 * 1000;

  var NEWS_FEEDS = [
    { id: 'moex', name: 'Мосбиржа', url: 'https://www.moex.com/export/news.aspx?limit=40&lang=ru', kind: 'market', macroTicker: 'MOEX' },
    { id: 'cbr', name: 'Банк России', url: 'https://www.cbr.ru/rss/RssNews', kind: 'macro', macroTicker: 'MOEX' },
    { id: 'cbr_press', name: 'Банк России — пресс-релизы', url: 'https://www.cbr.ru/rss/RssPress', kind: 'macro', macroTicker: 'MOEX' },
    { id: 'rbc', name: 'РБК', url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', kind: 'news', macroTicker: 'MOEX' },
    { id: 'interfax', name: 'Интерфакс', url: 'https://www.interfax.ru/rss.asp', kind: 'news', macroTicker: 'MOEX' },
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
    toastTimer: null
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

  function moexFormatDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function moexCacheGet(key) {
    try {
      var raw = localStorage.getItem(MOEX_CACHE_PREFIX + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || Date.now() > parsed.expires) {
        localStorage.removeItem(MOEX_CACHE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function moexCacheSet(key, data, ttl) {
    try {
      localStorage.setItem(MOEX_CACHE_PREFIX + key, JSON.stringify({
        expires: Date.now() + (ttl || MOEX_CACHE_TTL),
        data: data
      }));
    } catch (e) { /* quota */ }
  }

  function moexFetchJson(url) {
    return fetch(url, { method: 'GET', credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('MOEX HTTP ' + res.status);
      return res.json();
    });
  }

  var acControllers = {};

  function kindLabel(kind) {
    if (kind === 'bond') return 'Облигация';
    if (kind === 'index') return 'Индекс';
    return 'Акция';
  }

  function searchLocalTickers(query) {
    var ql = String(query || '').trim().toLowerCase();
    if (!ql) return [];
    var out = [];
    if ('imoex'.indexOf(ql) === 0 || ql.indexOf('индекс') === 0 || ql.indexOf('мосбирж') >= 0) {
      out.push({ ticker: 'IMOEX', name: 'Индекс МосБиржи', kind: 'index' });
    }
    Object.keys(TICKER_SUBTITLES).forEach(function (t) {
      var name = TICKER_SUBTITLES[t];
      if (t.toLowerCase().indexOf(ql) >= 0 || name.toLowerCase().indexOf(ql) >= 0) {
        var kind = t === 'IMOEX' ? 'index' : (t.indexOf('OFZ') >= 0 || t.indexOf('SU') === 0 ? 'bond' : 'stock');
        out.push({ ticker: t, name: name, kind: kind });
      }
    });
    return out;
  }

  function cleanMoexShortName(shortname) {
    return String(shortname || '').replace(/^\++/, '').trim();
  }

  function moexPickDisplayName(shortname, secname, name, secid) {
    shortname = cleanMoexShortName(shortname);
    var candidates = [shortname, name, secname];
    var i;
    for (i = 0; i < candidates.length; i++) {
      var n = candidates[i];
      if (!n) continue;
      n = String(n).trim();
      if (!n || normalizeTicker(n) === normalizeTicker(secid)) continue;
      if (n.length < 2) continue;
      return n;
    }
    var fallback = shortname || secname || name;
    return fallback ? String(fallback).trim() : String(secid || '').trim();
  }

  function parseSingleMoexSecurityName(json, secid) {
    var sec = json.securities;
    if (sec && sec.columns && sec.data && sec.data.length) {
      var cols = sec.columns;
      function col(row, name) {
        var i = cols.indexOf(name);
        return i >= 0 ? row[i] : null;
      }
      var row = sec.data[0];
      return moexPickDisplayName(col(row, 'shortname'), col(row, 'secname'), col(row, 'name'), secid);
    }
    var desc = json.description;
    if (!desc || !desc.data) return '';
    var shortname = '';
    var name = '';
    var secname = '';
    desc.data.forEach(function (row) {
      var key = row[0];
      var val = row[2];
      if (key === 'SHORTNAME') shortname = val;
      else if (key === 'NAME') name = val;
      else if (key === 'SECNAME') secname = val;
    });
    return moexPickDisplayName(shortname, secname, name, secid);
  }

  function parseMoexSearchResults(json) {
    var sec = json.securities;
    if (!sec || !sec.columns || !sec.data) return [];
    var cols = sec.columns;
    function col(row, name) {
      var i = cols.indexOf(name);
      return i >= 0 ? row[i] : null;
    }
    var seen = {};
    var out = [];
    sec.data.forEach(function (row) {
      if (out.length >= 20) return;
      var secid = col(row, 'secid');
      if (!secid || seen[secid]) return;
      var group = String(col(row, 'group') || '');
      var board = String(col(row, 'primary_boardid') || col(row, 'boardid') || '');
      var isIndex = secid === 'IMOEX' || secid === 'RTSI';
      var isShare = group === 'stock_shares' && (board === 'TQBR' || board === 'SMAL' || board === 'TQTF');
      var isBond = group === 'stock_bonds' || board === 'TQOB' || board === 'TQCB';
      if (!isIndex && !isShare && !isBond) return;
      seen[secid] = true;
      var name = moexPickDisplayName(col(row, 'shortname'), col(row, 'secname'), col(row, 'name'), secid);
      out.push({
        ticker: normalizeTicker(secid),
        name: name,
        kind: isIndex ? 'index' : (isBond ? 'bond' : 'stock')
      });
    });
    return out;
  }

  function searchMoexSecurities(query) {
    var q = String(query || '').trim();
    if (q.length < 1) return Promise.resolve([]);
    var cacheKey = 'search.' + q.toLowerCase();
    var cached = moexCacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);
    var local = searchLocalTickers(q);
    return moexFetchJson(MOEX_ISS + '/securities.json?q=' + encodeURIComponent(q) + '&iss.meta=off&securities.columns=secid,shortname,secname,name,group,primary_boardid,boardid&limit=30')
      .then(function (json) {
        var merged = [];
        var seen = {};
        local.concat(parseMoexSearchResults(json)).forEach(function (it) {
          if (!seen[it.ticker]) {
            seen[it.ticker] = true;
            merged.push(it);
          }
        });
        merged = merged.slice(0, 12);
        moexCacheSet(cacheKey, merged, 10 * 60 * 1000);
        return merged;
      })
      .catch(function () { return local.slice(0, 12); });
  }

  function getTickerNamesMap() {
    var map = loadJSON(KEYS.tickerNames, {});
    return map && typeof map === 'object' ? map : {};
  }

  function saveTickerName(ticker, name) {
    ticker = normalizeTicker(ticker);
    name = String(name || '').trim();
    if (!ticker || !name || normalizeTicker(name) === ticker || name === ticker) return;
    var map = getTickerNamesMap();
    if (map[ticker] === name) return;
    map[ticker] = name;
    saveJSON(KEYS.tickerNames, map);
  }

  function rememberTickerItem(item) {
    if (!item || !item.ticker) return;
    if (item.name) saveTickerName(item.ticker, item.name);
  }

  function fetchMoexTickerName(ticker) {
    ticker = normalizeTicker(ticker);
    if (!ticker) return Promise.resolve('');
    if (TICKER_SUBTITLES[ticker]) return Promise.resolve(TICKER_SUBTITLES[ticker]);
    var map = getTickerNamesMap();
    if (map[ticker]) return Promise.resolve(map[ticker]);
    var cacheKey = 'secname.' + ticker;
    var cached = moexCacheGet(cacheKey);
    if (cached) {
      saveTickerName(ticker, cached);
      return Promise.resolve(cached);
    }
    return moexFetchJson(
      MOEX_ISS + '/securities/' + encodeURIComponent(ticker) + '.json?iss.meta=off'
    ).then(function (json) {
      var name = parseSingleMoexSecurityName(json, ticker);
      if (name) {
        saveTickerName(ticker, name);
        moexCacheSet(cacheKey, name, 24 * 60 * 60 * 1000);
        return name;
      }
      return searchMoexSecurities(ticker).then(function (items) {
        var exact = null;
        for (var i = 0; i < items.length; i++) {
          if (items[i].ticker === ticker) { exact = items[i]; break; }
        }
        var pick = exact || items[0];
        if (pick && pick.name) {
          saveTickerName(ticker, pick.name);
          moexCacheSet(cacheKey, pick.name, 24 * 60 * 60 * 1000);
          return pick.name;
        }
        return '';
      });
    }).catch(function () { return ''; });
  }

  function resolveTickerFromInput(raw) {
    var trimmed = String(raw || '').trim();
    if (!trimmed) return Promise.resolve('');
    var t = normalizeTicker(trimmed);
    if (/^[A-Z0-9][A-Z0-9._-]*$/i.test(t) && t.length >= 2 && !/[А-Яа-яЁё]/.test(trimmed)) {
      return fetchMoexTickerName(t).then(function () { return t; });
    }
    return searchMoexSecurities(trimmed).then(function (items) {
      if (!items.length) return normalizeTicker(trimmed);
      var want = normalizeTicker(trimmed);
      var exact = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].ticker === want) { exact = items[i]; break; }
      }
      var pick = exact || items[0];
      rememberTickerItem(pick);
      return pick.ticker;
    });
  }

  function setupTickerAutocomplete(inputId, opts) {
    opts = opts || {};
    var input = document.getElementById(inputId);
    if (!input) return null;
    var wrap = input.closest('.ticker-ac-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ticker-ac-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    var list = wrap.querySelector('.ticker-ac-list');
    if (!list) {
      list = document.createElement('ul');
      list.className = 'ticker-ac-list';
      list.setAttribute('role', 'listbox');
      list.hidden = true;
      wrap.appendChild(list);
    }

    var acState = { items: [], active: -1, timer: null, open: false };

    function closeList() {
      list.hidden = true;
      acState.open = false;
      acState.active = -1;
    }

    function openList() {
      list.hidden = false;
      acState.open = true;
    }

    function renderList() {
      if (!acState.items.length) {
        closeList();
        return;
      }
      list.innerHTML = acState.items.map(function (item, i) {
        return (
          '<li role="option" class="ticker-ac-item' + (i === acState.active ? ' active' : '') + '" data-secid="' + escapeHtml(item.ticker) + '">' +
            '<span class="ticker-ac-secid">' + escapeHtml(item.ticker) + '</span>' +
            '<span class="ticker-ac-name">' + escapeHtml(item.name) + '</span>' +
            '<span class="ticker-ac-kind">' + escapeHtml(kindLabel(item.kind)) + '</span>' +
          '</li>'
        );
      }).join('');
      openList();
    }

    function selectItem(item) {
      if (!item) return;
      rememberTickerItem(item);
      input.value = item.ticker;
      closeList();
      if (opts.onSelect) opts.onSelect(item);
    }

    function runSearch() {
      var v = input.value.trim();
      if (v.length < 1) {
        closeList();
        return;
      }
      if (v.length < 2) {
        acState.items = searchLocalTickers(v).slice(0, 12);
        acState.active = acState.items.length ? 0 : -1;
        renderList();
        return;
      }
      searchMoexSecurities(v).then(function (items) {
        acState.items = items;
        acState.active = items.length ? 0 : -1;
        renderList();
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(acState.timer);
      acState.timer = setTimeout(runSearch, 220);
    });

    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 1) runSearch();
    });

    list.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });

    list.addEventListener('click', function (e) {
      var li = e.target.closest('.ticker-ac-item');
      if (!li) return;
      var secid = li.getAttribute('data-secid');
      var item = null;
      for (var i = 0; i < acState.items.length; i++) {
        if (acState.items[i].ticker === secid) { item = acState.items[i]; break; }
      }
      selectItem(item);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' && acState.items.length) {
        e.preventDefault();
        acState.active = Math.min(acState.active + 1, acState.items.length - 1);
        renderList();
      } else if (e.key === 'ArrowUp' && acState.items.length) {
        e.preventDefault();
        acState.active = Math.max(acState.active - 1, 0);
        renderList();
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) closeList();
    });

    var ctrl = {
      handleEnter: function (e) {
        if (acState.open && acState.items.length) {
          e.preventDefault();
          var idx = acState.active >= 0 ? acState.active : 0;
          selectItem(acState.items[idx]);
          return true;
        }
        return false;
      },
      close: closeList
    };
    acControllers[inputId] = ctrl;
    return ctrl;
  }

  function resolveMoexInstrument(ticker) {
    var t = normalizeTicker(ticker);
    if (t === 'IMOEX' || t === 'MOEX' || t === 'INDEX') {
      return Promise.resolve({ type: 'index', engine: 'stock', market: 'index', board: null, secid: IMOEX_SECID });
    }
    if (BOND_SECID_MAP[t]) {
      return Promise.resolve({ type: 'bond', engine: 'stock', market: 'bonds', board: 'TQOB', secid: BOND_SECID_MAP[t] });
    }
    if (t.indexOf('SU') === 0 && t.length > 8) {
      return Promise.resolve({ type: 'bond', engine: 'stock', market: 'bonds', board: 'TQOB', secid: t });
    }
    if (t.indexOf('OFZ') === 0) {
      var cached = moexCacheGet('inst.' + t);
      if (cached) return Promise.resolve(cached);
      return moexFetchJson(MOEX_ISS + '/securities.json?q=' + encodeURIComponent(t.replace(/_/g, ' ')) + '&iss.meta=off')
        .then(function (json) {
          var sec = json.securities;
          if (!sec || !sec.data || !sec.data.length) throw new Error('bond not found');
          var cols = sec.columns;
          var secidIdx = cols.indexOf('secid');
          var secid = sec.data[0][secidIdx];
          var inst = { type: 'bond', engine: 'stock', market: 'bonds', board: 'TQOB', secid: secid };
          moexCacheSet('inst.' + t, inst, 24 * 60 * 60 * 1000);
          return inst;
        });
    }
    return Promise.resolve({ type: 'stock', engine: 'stock', market: 'shares', board: 'TQBR', secid: t });
  }

  function moexCandlesUrl(inst) {
    if (inst.type === 'index') {
      return MOEX_ISS + '/engines/' + inst.engine + '/markets/' + inst.market + '/securities/' + inst.secid + '/candles.json';
    }
    return MOEX_ISS + '/engines/' + inst.engine + '/markets/' + inst.market + '/boards/' + inst.board + '/securities/' + inst.secid + '/candles.json';
  }

  function moexMarketdataUrl(inst) {
    var q = '?iss.only=marketdata,securities&iss.meta=off';
    if (inst.type === 'index') {
      return MOEX_ISS + '/engines/' + inst.engine + '/markets/' + inst.market + '/securities/' + inst.secid + '.json' + q;
    }
    return MOEX_ISS + '/engines/' + inst.engine + '/markets/' + inst.market + '/boards/' + inst.board + '/securities/' + inst.secid + '.json' + q;
  }

  function moexHorizonQuery(horizon) {
    var till = new Date();
    var from = new Date(till);
    if (horizon === 'day') {
      from.setDate(from.getDate() - 3);
      return { interval: 60, from: moexFormatDate(from), till: moexFormatDate(till) };
    }
    if (horizon === 'week') {
      from.setDate(from.getDate() - 12);
      return { interval: 24, from: moexFormatDate(from), till: moexFormatDate(till) };
    }
    if (horizon === 'month') {
      from.setDate(from.getDate() - 45);
      return { interval: 24, from: moexFormatDate(from), till: moexFormatDate(till) };
    }
    from.setDate(from.getDate() - 400);
    return { interval: 7, from: moexFormatDate(from), till: moexFormatDate(till) };
  }

  function parseMoexCandles(json) {
    var block = json.candles;
    if (!block || !block.columns || !block.data) return [];
    var closeIdx = block.columns.indexOf('close');
    var beginIdx = block.columns.indexOf('begin');
    if (closeIdx < 0 || beginIdx < 0) return [];
    return block.data.map(function (row) {
      return { t: new Date(row[beginIdx]).getTime(), price: Number(row[closeIdx]) };
    }).filter(function (p) { return p.t && isFinite(p.price); });
  }

  function parseMoexLastPrice(json) {
    var q = parseMoexQuoteFromMd(json);
    return q ? q.price : null;
  }

  function parseMoexQuoteFromMd(json) {
    var md = json.marketdata;
    if (!md || !md.data || !md.data.length) return null;
    var cols = md.columns;
    var row = md.data[0];
    function col(name) {
      var idx = cols.indexOf(name);
      return idx >= 0 ? row[idx] : null;
    }
    function secCol(name) {
      var sec = json.securities;
      if (!sec || !sec.columns || !sec.data || !sec.data.length) return null;
      var idx = sec.columns.indexOf(name);
      return idx >= 0 ? sec.data[0][idx] : null;
    }
    var priceKeys = ['LAST', 'LCURRENTPRICE', 'LEGALCLOSEPRICE', 'CURRENTVALUE', 'MARKETPRICE'];
    var price = null;
    for (var i = 0; i < priceKeys.length; i++) {
      var v = col(priceKeys[i]);
      if (v != null && isFinite(Number(v))) {
        price = Number(v);
        break;
      }
    }
    if (price == null) return null;

    var chg = resolveMoexDayChangePct(price, col, secCol);

    return {
      price: price,
      changePct: chg != null && isFinite(Number(chg)) ? Number(chg) : null
    };
  }

  function resolveMoexDayChangePct(price, col, secCol) {
    var prev = col('PREVPRICE') || col('PREVADMITTEDQUOTE') || col('PREVCLOSE') ||
      secCol('PREVPRICE') || secCol('PREVADMITTEDQUOTE') || secCol('PREVCLOSE') ||
      secCol('PREVLEGALCLOSEPRICE');
    if (prev != null && isFinite(Number(prev)) && Number(prev) !== 0) {
      return ((price - Number(prev)) / Number(prev)) * 100;
    }

    var absChg = col('LASTCHANGE');
    var absNum = absChg != null && isFinite(Number(absChg)) ? Number(absChg) : null;
    if (absNum != null) {
      var baseFromChg = price - absNum;
      if (baseFromChg > 0) return (absNum / baseFromChg) * 100;
    }

    var pct = col('LASTCHANGEPRCNT');
    if (pct != null && isFinite(Number(pct))) {
      var pctNum = Number(pct);
      if (Math.abs(pctNum) >= 0.0005 || absNum == null || Math.abs(absNum) < 1e-12) {
        return pctNum;
      }
    }

    var altPct = col('CHANGEPRCNT');
    if (altPct != null && isFinite(Number(altPct))) return Number(altPct);

    var open = col('OPEN') || col('OPENPRICE') || col('OPENVALUE');
    if (open != null && isFinite(Number(open)) && Number(open) !== 0) {
      return ((price - Number(open)) / Number(open)) * 100;
    }

    return null;
  }

  function fetchDayChangePctFromCandles(ticker, currentPrice) {
    return fetchMoexHistory(ticker, 'day').then(function (result) {
      var s = result.series;
      if (s.length < 2) {
        return fetchMoexHistory(ticker, 'week').then(function (weekResult) {
          var ws = weekResult.series;
          if (ws.length < 2) return null;
          var prevClose = ws[ws.length - 2].price;
          var last = currentPrice != null && isFinite(currentPrice) ? currentPrice : ws[ws.length - 1].price;
          if (!prevClose || !isFinite(prevClose) || prevClose === 0) return null;
          return ((last - prevClose) / prevClose) * 100;
        });
      }
      var prevClose = s[0].price;
      var last = currentPrice != null && isFinite(currentPrice) ? currentPrice : s[s.length - 1].price;
      if (!prevClose || !isFinite(prevClose) || prevClose === 0) return null;
      return ((last - prevClose) / prevClose) * 100;
    }).catch(function () { return null; });
  }

  function fetchMoexQuote(ticker) {
    return resolveMoexInstrument(ticker).then(function (inst) {
      return moexFetchJson(moexMarketdataUrl(inst)).then(function (json) {
        var quote = parseMoexQuoteFromMd(json);
        if (!quote) return null;
        if (quote.changePct != null) return quote;
        return fetchDayChangePctFromCandles(ticker, quote.price).then(function (pct) {
          if (pct != null) quote.changePct = pct;
          return quote;
        });
      });
    });
  }

  function formatDayChangePct(pct) {
    if (pct == null || !isFinite(pct)) return '—';
    var sign = pct > 0 ? '+' : '';
    var absPct = Math.abs(pct);
    var dec = absPct > 0 && absPct < 0.05 ? 3 : 2;
    return sign + pct.toFixed(dec).replace('.', ',') + '%';
  }

  function getPositionReturnPct(pos) {
    var avg = Number(pos.avgPrice);
    var cur = Number(pos.currentPrice);
    if (!isFinite(avg) || !isFinite(cur) || avg <= 0) return null;
    return ((cur - avg) / avg) * 100;
  }

  function formatSignedPct(pct, decimals) {
    if (pct == null || !isFinite(pct)) return '—';
    if (decimals == null) {
      var absPct = Math.abs(pct);
      decimals = absPct > 0 && absPct < 0.05 ? 3 : 2;
    }
    var sign = pct > 0 ? '+' : '';
    return sign + pct.toFixed(decimals) + '%';
  }

  function getPaperDisplayPct(pos) {
    var day = pos.dayChangePct;
    if (day != null && isFinite(Number(day))) return Number(day);
    return getPositionReturnPct(pos);
  }

  function getPaperPnlTitle(pos) {
    var parts = [];
    var day = pos.dayChangePct;
    if (day != null && isFinite(Number(day))) {
      parts.push('За день: ' + formatSignedPct(Number(day)));
    }
    var ret = getPositionReturnPct(pos);
    if (ret != null) parts.push('От ср. цены: ' + formatSignedPct(ret));
    return parts.join(' · ');
  }

  function sliceSeriesForHorizon(series, horizon) {
    if (!series.length) return series;
    var now = Date.now();
    var cut = now;
    if (horizon === 'day') cut = now - 24 * 60 * 60 * 1000;
    else if (horizon === 'week') cut = now - 7 * 24 * 60 * 60 * 1000;
    else if (horizon === 'month') cut = now - 30 * 24 * 60 * 60 * 1000;
    else cut = now - 365 * 24 * 60 * 60 * 1000;
    var sliced = series.filter(function (p) { return p.t >= cut; });
    return sliced.length >= 2 ? sliced : series.slice(-Math.min(series.length, horizon === 'day' ? 24 : 30));
  }

  function fetchMoexHistory(ticker, horizon) {
    var cacheKey = 'candles.' + ticker + '.' + horizon;
    var cached = moexCacheGet(cacheKey);
    if (cached) return Promise.resolve({ series: cached, source: 'moex', cached: true });

    return resolveMoexInstrument(ticker).then(function (inst) {
      var q = moexHorizonQuery(horizon);
      var url = moexCandlesUrl(inst) + '?from=' + q.from + '&till=' + q.till + '&interval=' + q.interval + '&iss.meta=off';
      return moexFetchJson(url).then(function (json) {
        var series = sliceSeriesForHorizon(parseMoexCandles(json), horizon);
        if (series.length < 2) throw new Error('not enough candles');
        moexCacheSet(cacheKey, series);
        return { series: series, source: 'moex', inst: inst };
      });
    });
  }

  function fetchMoexLastPrice(ticker) {
    var cacheKey = 'last.' + ticker;
    var cached = moexCacheGet(cacheKey);
    if (cached != null) return Promise.resolve(cached);
    return resolveMoexInstrument(ticker).then(function (inst) {
      return moexFetchJson(moexMarketdataUrl(inst)).then(function (json) {
        var price = parseMoexLastPrice(json);
        if (price == null) throw new Error('no price');
        moexCacheSet(cacheKey, price, 5 * 60 * 1000);
        return price;
      });
    });
  }

  function updateChartStatsFromSeries(series, ticker, hoverIdx) {
    if (!series.length) return;
    var idx = hoverIdx != null && hoverIdx >= 0 && hoverIdx < series.length ? hoverIdx : series.length - 1;
    var first = series[0].price;
    var at = series[idx].price;
    var changePct = first ? ((at - first) / first) * 100 : 0;
    var min = Math.min.apply(null, series.map(function (p) { return p.price; }));
    var max = Math.max.apply(null, series.map(function (p) { return p.price; }));
    var changeEl = document.getElementById('chartStatChange');
    var sign = changePct >= 0 ? '+' : '';
    if (changeEl) {
      changeEl.textContent = sign + changePct.toFixed(2) + '%';
      changeEl.className = 'val ' + (changePct >= 0 ? 'pnl-pos' : 'pnl-neg');
    }
    var minEl = document.getElementById('chartStatMin');
    var maxEl = document.getElementById('chartStatMax');
    var lastEl = document.getElementById('chartStatLast');
    var lastLbl = document.querySelector('#portfolioChartStats .chart-stat:last-child .lbl');
    if (minEl) minEl.textContent = formatChartPrice(min, ticker);
    if (maxEl) maxEl.textContent = formatChartPrice(max, ticker);
    if (lastEl) lastEl.textContent = formatChartPrice(at, ticker);
    if (lastLbl) lastLbl.textContent = hoverIdx != null ? 'На дату' : 'Сейчас';
  }

  function setChartSourceLabel(text, isDemo) {
    var el = document.getElementById('chartSourceLabel');
    if (el) {
      el.textContent = text;
      el.style.color = isDemo ? 'var(--danger)' : 'var(--text-muted)';
    }
  }

  function darkenColor(hex, percent) {
    var color = hex.startsWith('#') ? hex.slice(1) : hex;
    if (color.length === 3) {
      color = color.split('').map(function (c) { return c + c; }).join('');
    }
    var num = parseInt(color, 16);
    var r = (num >> 16) & 0xff;
    var g = (num >> 8) & 0xff;
    var b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
    g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
    b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  function getPortfolioPaperPositions() {
    return getPortfolio().positions.filter(function (p) {
      var t = normalizeTicker(p.ticker);
      return t !== 'IMOEX' && t !== 'MOEX' && t !== 'INDEX';
    });
  }

  function renderPortfolioFolder() {
    destroyPortfolioPapersMagnet();
    var scene = document.getElementById('portfolioFolderScene');
    if (!scene) return;
    var positions = getPortfolioPaperPositions();
    var folderColor = '#3D5C47';
    var backColor = darkenColor(folderColor, 0.08);
    var open = state.folderOpen;

    if (!positions.length) {
      scene.innerHTML = '<p class="muted" style="padding:1rem;">Добавьте бумаги в портфель (кроме индекса IMOEX)</p>';
      return;
    }

    var maxTickerLen = positions.reduce(function (max, p) {
      return Math.max(max, String(p.ticker || '').length);
    }, 4);

    var papersHtml = positions.map(function (p, i) {
      var pct = getPaperDisplayPct(p);
      var cls = 'muted';
      if (pct != null && isFinite(pct)) cls = pct >= 0 ? 'pnl-pos' : 'pnl-neg';
      var pctText = formatSignedPct(pct, 2);
      var tip = getPaperPnlTitle(p);
      var active = state.chartTicker === p.ticker ? ' paper-active' : '';
      var bg = i % 3 === 0 ? darkenColor('#ffffff', 0.1) : (i % 3 === 1 ? darkenColor('#ffffff', 0.05) : '#ffffff');
      return (
        '<div class="paper paper-' + (i + 1) + active + '" data-ticker="' + escapeHtml(p.ticker) + '" ' +
          'style="--paper-bg:' + bg + ';" role="button" tabindex="0" ' +
          'aria-label="' + escapeHtml(p.ticker) + (pctText !== '—' ? ', ' + pctText : '') + '">' +
          '<span class="paper-ticker">' + escapeHtml(p.ticker) + '</span>' +
          '<span class="paper-pnl ' + cls + '"' + (tip ? ' title="' + escapeHtml(tip) + '"' : '') + '>' +
            escapeHtml(pctText) + '</span>' +
        '</div>'
      );
    }).join('');

    scene.innerHTML =
      '<div class="pf-papers-strip' + (open ? ' is-open' : '') + '" aria-hidden="' + (open ? 'false' : 'true') + '" style="--paper-ch:' + (maxTickerLen + 1) + '">' +
        papersHtml +
      '</div>' +
      '<div class="pf-folder folder' + (open ? ' open' : '') + '" id="portfolioFolder" ' +
        'style="--folder-color:' + folderColor + ';--folder-back-color:' + backColor + '">' +
        '<div class="folder__back">' +
          '<div class="folder__front"></div>' +
          '<div class="folder__front right"></div>' +
        '</div>' +
      '</div>';

    initPortfolioPapersMagnet();
  }

  function selectPortfolioTicker(ticker) {
    ticker = normalizeTicker(ticker);
    if (!findPortfolioPosition(ticker)) return;
    state.chartTicker = ticker;
    state.folderOpen = true;
    var label = document.getElementById('portfolioChartTickerLabel');
    if (label) label.textContent = ticker;
    var sel = document.getElementById('chartTickerSelect');
    if (sel) sel.value = ticker;
    renderPortfolioFolder();
    renderPortfolioChart();
    var section = document.getElementById('portfolioStockChartSection');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderMoexIndexBox() {
    var valueEl = document.getElementById('imoexValue');
    var dayEl = document.getElementById('imoexDayChange');
    var monthEl = document.getElementById('imoexMonthChange');
    var sourceEl = document.getElementById('imoexSource');
    var canvas = document.getElementById('imoexMiniChart');
    if (!valueEl || !canvas) return;

    var horizon = state.imoexHorizon || 'month';
    sourceEl.textContent = 'Загрузка данных МосБиржи…';

    Promise.all([
      moexFetchJson(moexMarketdataUrl({ type: 'index', engine: 'stock', market: 'index', secid: IMOEX_SECID })),
      fetchMoexHistory(IMOEX_SECID, horizon)
    ]).then(function (results) {
      var md = results[0];
      var hist = results[1];
      var cols = md.marketdata.columns;
      var row = md.marketdata.data[0];
      var valIdx = cols.indexOf('CURRENTVALUE');
      var chgIdx = cols.indexOf('LASTCHANGEPRC');
      var monthIdx = cols.indexOf('MONTHCHANGEPRC');
      var value = row[valIdx];
      var chg = row[chgIdx];
      var monthChg = row[monthIdx];
      valueEl.textContent = Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
      dayEl.textContent = (chg >= 0 ? '+' : '') + Number(chg).toFixed(2) + '% за день';
      dayEl.className = 'index-change ' + (chg >= 0 ? 'pnl-pos' : 'pnl-neg');
      monthEl.textContent = 'Месяц: ' + (monthChg >= 0 ? '+' : '') + Number(monthChg).toFixed(2) + '%';
      drawPriceChart(canvas, hist.series, { ticker: IMOEX_SECID, horizon: horizon });
      sourceEl.textContent = 'Источник: МосБиржа (ISS) · IMOEX · ' + new Date().toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }).catch(function () {
      valueEl.textContent = '—';
      dayEl.textContent = 'Нет данных';
      dayEl.className = 'index-change muted';
      monthEl.textContent = '';
      sourceEl.textContent = 'Данные МосБиржи недоступны';
    });
  }

  function refreshPortfolioQuotes() {
    var portfolio = getPortfolio();
    if (!portfolio.positions.length) return Promise.resolve();
    var jobs = portfolio.positions.map(function (p) {
      return fetchMoexQuote(p.ticker).then(function (q) {
        if (q && q.price != null && isFinite(q.price)) p.currentPrice = q.price;
        if (q && q.changePct != null && isFinite(q.changePct)) p.dayChangePct = q.changePct;
        else delete p.dayChangePct;
      }).catch(function () { /* keep stored */ });
    });
    return Promise.all(jobs).then(function () {
      setPortfolio(portfolio);
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    var t = url.trim();
    if (t === '#') return '#';
    try {
      var u = new URL(t, window.location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (e) { /* ignore */ }
    return '#';
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function getWatchlist() {
    return loadJSON(KEYS.watchlist, []);
  }

  function setWatchlist(list) {
    saveJSON(KEYS.watchlist, list);
    renderWatchlist();
    renderBriefing();
    renderFeed();
    updateStats();
  }

  function getProfile() {
    return loadJSON(KEYS.profile, { id: '', name: '' });
  }

  function setProfile(p) {
    saveJSON(KEYS.profile, p);
  }

  function getSettings() {
    return loadJSON(KEYS.settings, { essayStyle: 'concise', riskProfile: 'balanced' });
  }

  function setSettings(s) {
    saveJSON(KEYS.settings, s);
  }

  function getAlerts() {
    return loadJSON(KEYS.alerts, { threshold: 2, channels: ['push'], rules: [] });
  }

  function setAlerts(a) {
    saveJSON(KEYS.alerts, a);
  }

  function getDigest() {
    return loadJSON(KEYS.digest, { email: '', time: '08:00' });
  }

  function setDigest(d) {
    saveJSON(KEYS.digest, d);
  }

  function getPortfolio() {
    var p = loadJSON(KEYS.portfolio, null);
    if (!p || !Array.isArray(p.positions)) {
      return { positions: DEFAULT_PORTFOLIO.slice() };
    }
    return p;
  }

  function setPortfolio(p) {
    saveJSON(KEYS.portfolio, p);
  }

  function getFilters() {
    return loadJSON(KEYS.filters, {
      type: '', asset: '', eventType: '', tone: '', importance: '',
      sort: 'date-desc', search: '', onlyWatchlist: false
    });
  }

  function setFilters(f) {
    saveJSON(KEYS.filters, f);
  }

  function getLastVisit() {
    var v = localStorage.getItem(KEYS.lastVisit);
    return v ? parseInt(v, 10) : 0;
  }

  function setLastVisit(ts) {
    localStorage.setItem(KEYS.lastVisit, String(ts));
  }

  function showToast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2800);
  }

  function normalizeTicker(t) {
    return String(t || '').trim().toUpperCase().replace(/\s+/g, '');
  }

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
        noticeEl.textContent = 'Текст из RSS «' + getSourceLabel(b.sourceUrl, b.sourceName) +
          '». Полная версия — на сайте источника (ссылка ниже).';
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

  function filterBriefsForBriefing() {
    var wl = getWatchlist();
    var horizon = state.horizon;
    return getAllBriefs().filter(function (b) {
      if (!isInHorizon(b.publishedAt, horizon)) return false;
      if (wl.length > 0 && wl.indexOf(normalizeTicker(b.ticker)) === -1) return false;
      return true;
    }).sort(function (a, b) {
      return new Date(b.publishedAt) - new Date(a.publishedAt);
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
        '<p class="brief-summary">' + escapeHtml(content.teaser) + '</p>' +
        '<div class="brief-footer">' +
          '<button type="button" class="primary brief-read-btn" data-brief-id="' + escapeHtml(b.id) + '">Читать полностью</button>' +
          '<a class="brief-source-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(b.isLive ? ('Оригинал: ' + getSourceLabel(url, b.sourceName)) : 'Оригинал на сайте источника') + ' →</a>' +
        '</div>' +
      '</article>'
    );
  }

  function getBriefingHintHtml(wl) {
    var sourceLine = isLiveBriefsActive()
      ? 'Новости с реальных источников: Мосбиржа, Банк России, РБК, Интерфакс и др.'
      : (BRIEFS_SOURCE === 'demo'
        ? 'Не удалось загрузить RSS — показаны демо-материалы. Запустите npm start и откройте через localhost.'
        : 'Загружаем ленту с новостных источников…');
    if (wl.length > 0) {
      return escapeHtml('Сводка под ваши позиции: ' + wl.join(', ') + '.') +
        '<br>' + escapeHtml(sourceLine);
    }
    return escapeHtml(sourceLine) + '<br>' +
      escapeHtml('Добавьте бумаги в «Мои бумаги» для фильтрации ленты.');
  }

  function renderBriefing() {
    var list = filterBriefsForBriefing();
    var el = document.getElementById('briefingList');
    var hint = document.getElementById('briefingFilterHint');
    var wl = getWatchlist();
    destroyBriefingBento();
    hint.innerHTML =
      '<p class="briefing-data-notice">' + getBriefingHintHtml(wl) + '</p>';
    if (state.briefsLoading && !list.length) {
      el.innerHTML = '<div class="empty-state glass">Загружаем новости с источников…</div>';
      return;
    }
    if (list.length === 0) {
      el.innerHTML = '<div class="empty-state glass">Нет материалов сводки за выбранный горизонт.</div>';
      return;
    }
    el.innerHTML = list.map(renderBriefCard).join('');
    initBriefingBento();
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

  function renderWatchlist() {
    var list = getWatchlist();
    var el = document.getElementById('watchlistChips');
    if (list.length === 0) {
      el.innerHTML = '<span class="muted">Список пуст</span>';
      return;
    }
    el.innerHTML = list.map(function (t) {
      return '<span class="chip">' + escapeHtml(t) +
        '<button type="button" data-remove="' + escapeHtml(t) + '" aria-label="Удалить">×</button></span>';
    }).join('');
    el.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ticker = btn.getAttribute('data-remove');
        setWatchlist(getWatchlist().filter(function (x) { return x !== ticker; }));
        showToast('Удалено: ' + ticker);
      });
    });
  }

  function addTicker(raw) {
    resolveTickerFromInput(raw).then(function (t) {
      t = normalizeTicker(t);
      if (!t) {
        showToast('Введите тикер или название');
        return;
      }
      var list = getWatchlist();
      if (list.indexOf(t) !== -1) {
        showToast('Уже в списке');
        return;
      }
      list.push(t);
      setWatchlist(list);
      showToast('Добавлено: ' + t);
      document.getElementById('tickerInput').value = '';
      if (acControllers.tickerInput) acControllers.tickerInput.close();
    });
  }

  function applyPreset(name) {
    var preset = PRESETS[name];
    if (!preset) return;
    var list = getWatchlist().slice();
    preset.forEach(function (t) {
      var n = normalizeTicker(t);
      if (list.indexOf(n) === -1) list.push(n);
    });
    setWatchlist(list);
    showToast('Пресет: ' + name);
  }

  function chartSeed(ticker) {
    var s = 0;
    for (var i = 0; i < ticker.length; i++) s += ticker.charCodeAt(i);
    return s;
  }

  function chartNoise(seed, i) {
    var x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function generatePriceHistory(ticker, endPrice, horizon) {
    var cfg = CHART_HORIZONS[horizon] || CHART_HORIZONS.week;
    var seed = chartSeed(ticker);
    var vol = ticker.indexOf('OFZ') >= 0 ? 0.0045 : 0.017;
    var now = Date.now();
    var startPrice = endPrice * (0.9 + chartNoise(seed, 0) * 0.12);
    var series = [];
    var price = startPrice;
    for (var i = 0; i < cfg.points; i++) {
      if (i === cfg.points - 1) price = endPrice;
      else if (i > 0) {
        var drift = (chartNoise(seed, i + 1) - 0.5) * vol * 2;
        price = price * (1 + drift);
      }
      series.push({
        t: now - (cfg.points - 1 - i) * cfg.stepMs,
        price: price
      });
    }
    series[series.length - 1].price = endPrice;
    return series;
  }

  function formatChartPrice(value, ticker) {
    if (ticker === IMOEX_SECID || ticker === 'MOEX') {
      return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' п.';
    }
    if (ticker.indexOf('OFZ') >= 0 || (ticker.indexOf('SU') === 0 && ticker.length > 8)) return value.toFixed(2) + '%';
    if (value >= 1000) return value.toFixed(0) + ' ₽';
    return value.toFixed(2) + ' ₽';
  }

  function formatChartAxisTime(ts, horizon) {
    var d = new Date(ts);
    if (horizon === 'day') {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    if (horizon === 'year') {
      return d.toLocaleDateString('ru-RU', { month: 'short' });
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function getChartYAxisPad(ctx, minP, maxP, ticker) {
    ctx.save();
    ctx.font = '10px Inter, Manrope, sans-serif';
    var maxW = 0;
    for (var g = 0; g <= 4; g++) {
      var labelVal = maxP - ((maxP - minP) * g) / 4;
      var w = ctx.measureText(formatChartPrice(labelVal, ticker)).width;
      if (w > maxW) maxW = w;
    }
    ctx.restore();
    return Math.max(48, Math.ceil(maxW) + 14);
  }

  function formatChartHoverLabel(pt, ticker, horizon) {
    return formatChartAxisTime(pt.t, horizon) + ' · ' + formatChartPrice(pt.price, ticker);
  }

  function chartIndexAtClientX(canvas, clientX) {
    var meta = canvas._chartMeta;
    if (!meta || !meta.series || meta.series.length < 2) return -1;
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    if (x < meta.pad.left || x > meta.pad.left + meta.plotW) return -1;
    var ratio = (x - meta.pad.left) / meta.plotW;
    var idx = Math.round(ratio * (meta.series.length - 1));
    return Math.max(0, Math.min(meta.series.length - 1, idx));
  }

  function redrawPriceChartWithHover(canvas, hoverIndex) {
    var meta = canvas._chartMeta;
    if (!meta) return;
    drawPriceChart(canvas, meta.series, {
      ticker: meta.ticker,
      horizon: meta.horizon,
      hoverIndex: hoverIndex
    });
  }

  function bindChartHover(canvas) {
    if (!canvas || canvas._chartHoverBound) return;
    var wrap = canvas.parentElement;
    if (!wrap || !wrap.classList.contains('chart-canvas-wrap')) return;
    canvas._chartHoverBound = true;

    var tip = wrap.querySelector('.chart-hover-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-hover-tip';
      tip.setAttribute('aria-hidden', 'true');
      wrap.appendChild(tip);
    }

    function hideHover() {
      canvas._chartHoverIndex = null;
      tip.classList.remove('is-visible');
      tip.setAttribute('aria-hidden', 'true');
      if (canvas._chartMeta) {
        redrawPriceChartWithHover(canvas, null);
        if (canvas.id === 'portfolioPriceChart' && canvas._chartStatsSeries) {
          updateChartStatsFromSeries(canvas._chartStatsSeries, canvas._chartMeta.ticker);
        }
      }
    }

    function showHover(clientX, clientY) {
      var meta = canvas._chartMeta;
      if (!meta || !meta.series || meta.series.length < 2) {
        hideHover();
        return;
      }
      var idx = chartIndexAtClientX(canvas, clientX);
      if (idx < 0) {
        hideHover();
        return;
      }
      if (canvas._chartHoverIndex !== idx) {
        canvas._chartHoverIndex = idx;
        redrawPriceChartWithHover(canvas, idx);
        if (canvas.id === 'portfolioPriceChart' && canvas._chartStatsSeries) {
          updateChartStatsFromSeries(canvas._chartStatsSeries, meta.ticker, idx);
        }
      }
      var pt = meta.series[idx];
      tip.textContent = formatChartHoverLabel(pt, meta.ticker, meta.horizon);
      tip.classList.add('is-visible');
      tip.setAttribute('aria-hidden', 'false');
      var wrapRect = wrap.getBoundingClientRect();
      var tipX = Math.min(Math.max(clientX - wrapRect.left, 48), wrapRect.width - 48);
      var tipY = Math.max(clientY - wrapRect.top - 10, 12);
      tip.style.left = tipX + 'px';
      tip.style.top = tipY + 'px';
    }

    wrap.addEventListener('mousemove', function (e) {
      showHover(e.clientX, e.clientY);
    });
    wrap.addEventListener('mouseleave', hideHover);
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length) showHover(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    wrap.addEventListener('touchmove', function (e) {
      if (e.touches.length) {
        e.preventDefault();
        showHover(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    wrap.addEventListener('touchend', hideHover);
    wrap.addEventListener('touchcancel', hideHover);
  }

  function drawPriceChart(canvas, series, options) {
    options = options || {};
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(rect.width, 280);
    var h = Math.max(rect.height, 160);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!series || series.length < 2) {
      canvas._chartMeta = null;
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '14px Golos Text, IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Недостаточно данных', w / 2, h / 2);
      return;
    }

    var prices = series.map(function (p) { return p.price; });
    var minP = Math.min.apply(null, prices);
    var maxP = Math.max.apply(null, prices);
    var range = maxP - minP || maxP * 0.02 || 1;
    minP -= range * 0.06;
    maxP += range * 0.06;

    var pad = {
      top: 14,
      right: 12,
      bottom: 28,
      left: getChartYAxisPad(ctx, minP, maxP, options.ticker)
    };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    function xAt(i) {
      return pad.left + (i / (series.length - 1)) * plotW;
    }
    function yAt(price) {
      return pad.top + plotH - ((price - minP) / (maxP - minP)) * plotH;
    }

    canvas._chartMeta = {
      series: series,
      ticker: options.ticker,
      horizon: options.horizon,
      pad: pad,
      plotW: plotW,
      plotH: plotH,
      w: w,
      h: h,
      minP: minP,
      maxP: maxP
    };

    ctx.strokeStyle = 'rgba(43, 43, 43, 0.08)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = pad.top + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(pad.left + plotW, gy);
      ctx.stroke();
      var labelVal = maxP - ((maxP - minP) * g) / 4;
      ctx.fillStyle = '#6B6B6B';
      ctx.font = '10px Inter, Manrope, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatChartPrice(labelVal, options.ticker), pad.left - 8, gy + 3);
    }

    var up = series[series.length - 1].price >= series[0].price;
    var lineColor = up ? '#6B7A5A' : '#B85C50';
    var fillTop = up ? 'rgba(107, 122, 90, 0.22)' : 'rgba(184, 92, 80, 0.16)';

    ctx.beginPath();
    series.forEach(function (pt, idx) {
      var x = xAt(idx);
      var y = yAt(pt.price);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xAt(series.length - 1), pad.top + plotH);
    ctx.lineTo(xAt(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = fillTop;
    ctx.fill();

    ctx.beginPath();
    series.forEach(function (pt, idx) {
      var x = xAt(idx);
      var y = yAt(pt.price);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    var hoverIndex = options.hoverIndex;
    var endIdx = hoverIndex != null && hoverIndex >= 0 && hoverIndex < series.length
      ? hoverIndex
      : series.length - 1;
    var endPt = series[endIdx];

    if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < series.length) {
      var hx = xAt(hoverIndex);
      ctx.save();
      ctx.strokeStyle = 'rgba(43, 43, 43, 0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.fillStyle = lineColor;
    ctx.strokeStyle = '#faf8f4';
    ctx.lineWidth = hoverIndex != null ? 2 : 0;
    ctx.beginPath();
    ctx.arc(xAt(endIdx), yAt(endPt.price), hoverIndex != null ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    if (hoverIndex != null) ctx.stroke();

    var labelIdx = [0, Math.floor((series.length - 1) / 2), series.length - 1];
    ctx.fillStyle = '#6B6B6B';
    ctx.font = '10px Inter, Manrope, sans-serif';
    ctx.textAlign = 'center';
    labelIdx.forEach(function (idx) {
      if (idx < 0 || idx >= series.length) return;
      ctx.fillText(formatChartAxisTime(series[idx].t, options.horizon), xAt(idx), h - 8);
    });

    bindChartHover(canvas);
  }

  function findPortfolioPosition(ticker) {
    var positions = getPortfolio().positions;
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].ticker === ticker) return positions[i];
    }
    return null;
  }

  function ensurePositionForChart(ticker) {
    ticker = normalizeTicker(ticker);
    if (findPortfolioPosition(ticker)) return Promise.resolve(ticker);
    return fetchMoexLastPrice(ticker).catch(function () { return null; }).then(function (price) {
      var p = price != null && isFinite(price) ? price : 100;
      var portfolio = getPortfolio();
      portfolio.positions.unshift({ ticker: ticker, avgPrice: p, currentPrice: p });
      setPortfolio(portfolio);
      return ticker;
    });
  }

  function openPortfolioChart(ticker) {
    ticker = normalizeTicker(ticker);
    ensurePositionForChart(ticker).then(function (t) {
      state.folderOpen = true;
      if (t === 'IMOEX' || t === 'MOEX') {
        switchTab('portfolio');
        renderMoexIndexBox();
        document.getElementById('moexIndexBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      selectPortfolioTicker(t);
      switchTab('portfolio');
    });
  }

  function getTickerSubtitle(ticker) {
    ticker = normalizeTicker(ticker);
    if (TICKER_SUBTITLES[ticker]) return TICKER_SUBTITLES[ticker];
    var saved = getTickerNamesMap()[ticker];
    if (saved) return saved;
    return 'Бумага · MOEX';
  }

  function updateMarketTileSubtitle(ticker, name) {
    if (!name) return;
    var el = document.getElementById('marketTiles');
    if (!el) return;
    var sub = el.querySelector('.market-tile-wrap[data-ticker="' + ticker + '"] .market-tile-sub');
    if (sub) sub.textContent = name;
  }

  function ensureTickerNames(tickers) {
    var need = [];
    (tickers || []).forEach(function (t) {
      t = normalizeTicker(t);
      if (!t || TICKER_SUBTITLES[t] || getTickerNamesMap()[t]) return;
      if (need.indexOf(t) === -1) need.push(t);
    });
    need.forEach(function (t) {
      fetchMoexTickerName(t).then(function (name) {
        if (name) updateMarketTileSubtitle(t, name);
      });
    });
  }

  function getMarketTickers() {
    var list = loadJSON(KEYS.marketTiles, null);
    if (!Array.isArray(list) || !list.length) return DEFAULT_MARKET_TICKERS.slice();
    return list.map(normalizeTicker).filter(Boolean);
  }

  function setMarketTickers(list) {
    var normalized = [];
    list.forEach(function (t) {
      t = normalizeTicker(t);
      if (t && normalized.indexOf(t) === -1) normalized.push(t);
    });
    if (!normalized.length) normalized = DEFAULT_MARKET_TICKERS.slice();
    if (normalized.indexOf('IMOEX') > 0) {
      normalized = ['IMOEX'].concat(normalized.filter(function (x) { return x !== 'IMOEX'; }));
    }
    saveJSON(KEYS.marketTiles, normalized);
    renderMarketTiles();
  }

  function addMarketTicker(raw) {
    resolveTickerFromInput(raw).then(function (t) {
      t = normalizeTicker(t);
      if (!t) {
        showToast('Введите тикер или название');
        return;
      }
      var list = getMarketTickers();
      if (list.indexOf(t) !== -1) {
        showToast('Уже на панели котировок');
        return;
      }
      if (t === 'IMOEX') list.unshift(t);
      else list.push(t);
      setMarketTickers(list);
      var input = document.getElementById('marketTickerInput');
      if (input) input.value = '';
      if (acControllers.marketTickerInput) acControllers.marketTickerInput.close();
      showToast('Добавлено: ' + t);
    });
  }

  function removeMarketTicker(ticker) {
    ticker = normalizeTicker(ticker);
    var list = getMarketTickers();
    if (list.length <= 1) {
      showToast('Нельзя удалить последнюю бумагу');
      return;
    }
    setMarketTickers(list.filter(function (x) { return x !== ticker; }));
    showToast('Удалено: ' + ticker);
  }

  function resetMarketTickers() {
    setMarketTickers(DEFAULT_MARKET_TICKERS.slice());
    showToast('Панель котировок сброшена');
  }

  function buildMarketTileConfig(ticker) {
    return {
      ticker: ticker,
      title: ticker,
      subtitle: getTickerSubtitle(ticker),
      featured: ticker === 'IMOEX'
    };
  }

  function applyStarBorderHighlight(wrap, quote) {
    if (!wrap) return;
    wrap.classList.remove('star-border-up', 'star-border-down', 'star-border-flat', 'star-border-loading');
    if (!quote || quote.price == null) {
      wrap.classList.add('star-border-loading');
      return;
    }
    var pct = quote.changePct;
    if (pct == null || !isFinite(pct)) {
      wrap.classList.add('star-border-flat');
    } else if (pct > 0) {
      wrap.classList.add('star-border-up');
    } else if (pct < 0) {
      wrap.classList.add('star-border-down');
    } else {
      wrap.classList.add('star-border-flat');
    }
  }

  function updateMarketTileButton(btn, quote, ticker) {
    if (!btn) return;
    var wrap = btn.closest('.market-tile-wrap');
    var priceEl = btn.querySelector('[data-price]');
    var changeEl = btn.querySelector('[data-change]');
    if (!quote || quote.price == null) {
      if (priceEl) priceEl.textContent = '—';
      if (changeEl) {
        changeEl.textContent = 'нет данных';
        changeEl.className = 'market-tile-change muted';
      }
      applyStarBorderHighlight(wrap, quote);
      return;
    }
    if (priceEl) priceEl.textContent = formatChartPrice(quote.price, ticker);
    if (changeEl) {
      var pct = quote.changePct;
      changeEl.textContent = formatDayChangePct(pct);
      if (pct == null || !isFinite(pct)) {
        changeEl.className = 'market-tile-change muted';
      } else if (pct > 0) {
        changeEl.className = 'market-tile-change pnl-pos';
      } else if (pct < 0) {
        changeEl.className = 'market-tile-change pnl-neg';
      } else {
        changeEl.className = 'market-tile-change muted';
      }
    }
    applyStarBorderHighlight(wrap, quote);
  }

  var BENTO_GLOW_RGB = '61, 92, 71';
  var BENTO_SPOTLIGHT_RADIUS = 210;
  var marketTilesBentoCleanup = null;
  var briefingBentoCleanup = null;
  var portfolioPapersMagnetCleanup = null;

  function destroyPortfolioPapersMagnet() {
    if (portfolioPapersMagnetCleanup) {
      portfolioPapersMagnetCleanup();
      portfolioPapersMagnetCleanup = null;
    }
  }

  function initPortfolioPapersMagnet() {
    destroyPortfolioPapersMagnet();
    var strip = document.querySelector('#portfolioFolderScene .pf-papers-strip');
    if (!strip) return;
    var papers = strip.querySelectorAll('.paper[data-ticker]');
    if (!papers.length || bentoAnimationsDisabled()) return;

    var magnetAnims = [];
    var unbinds = [];
    papers.forEach(function (paper, i) {
      magnetAnims[i] = null;
      function onMove(e) {
        var rect = paper.getBoundingClientRect();
        var mx = (e.clientX - rect.left - rect.width / 2) * 0.07;
        var my = (e.clientY - rect.top - rect.height / 2) * 0.07;
        if (magnetAnims[i]) magnetAnims[i].kill();
        magnetAnims[i] = gsap.to(paper, {
          x: mx,
          y: my,
          scale: 1.04,
          boxShadow: '0 6px 16px rgba(31, 30, 28, 0.12)',
          duration: 0.22,
          ease: 'power2.out'
        });
      }
      function onLeave() {
        if (magnetAnims[i]) magnetAnims[i].kill();
        gsap.to(paper, {
          x: 0,
          y: 0,
          scale: 1,
          boxShadow: '0 2px 8px rgba(31, 30, 28, 0.08)',
          duration: 0.32,
          ease: 'power2.out'
        });
      }
      paper.addEventListener('mousemove', onMove);
      paper.addEventListener('mouseleave', onLeave);
      unbinds.push(function () {
        paper.removeEventListener('mousemove', onMove);
        paper.removeEventListener('mouseleave', onLeave);
        if (magnetAnims[i]) magnetAnims[i].kill();
        gsap.set(paper, { x: 0, y: 0, scale: 1, clearProps: 'transform,boxShadow' });
      });
    });
    portfolioPapersMagnetCleanup = function () {
      unbinds.forEach(function (fn) { fn(); });
    };
  }

  function bentoAnimationsDisabled() {
    return (
      window.innerWidth <= 768 ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      typeof gsap === 'undefined'
    );
  }

  function destroyMarketTilesBento() {
    if (marketTilesBentoCleanup) {
      marketTilesBentoCleanup();
      marketTilesBentoCleanup = null;
    }
  }

  function bentoSpotlightValues(radius) {
    return { proximity: radius * 0.5, fadeDistance: radius * 0.75 };
  }

  function bentoUpdateCardGlow(card, mouseX, mouseY, glow, radius) {
    var rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    card.style.setProperty('--glow-x', ((mouseX - rect.left) / rect.width) * 100 + '%');
    card.style.setProperty('--glow-y', ((mouseY - rect.top) / rect.height) * 100 + '%');
    card.style.setProperty('--glow-intensity', String(glow));
    card.style.setProperty('--glow-radius', radius + 'px');
  }

  function initMarketTilesBento() {
    destroyMarketTilesBento();
    var grid = document.getElementById('marketTiles');
    if (!grid || !grid.classList.contains('bento-section')) return;
    var cards = grid.querySelectorAll('.magic-bento-card');
    if (!cards.length) return;

    if (bentoAnimationsDisabled()) return;

    var glowColor = BENTO_GLOW_RGB;
    var spotlightRadius = BENTO_SPOTLIGHT_RADIUS;
    var spotlight = document.createElement('div');
    spotlight.className = 'market-bento-spotlight';
    document.body.appendChild(spotlight);

    function onMouseMove(e) {
      var section = grid.closest('.bento-section') || grid;
      var rect = section.getBoundingClientRect();
      var inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      var cardList = grid.querySelectorAll('.magic-bento-card');

      if (!inside) {
        gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        cardList.forEach(function (card) {
          card.style.setProperty('--glow-intensity', '0');
        });
        return;
      }

      var sv = bentoSpotlightValues(spotlightRadius);
      var minDistance = Infinity;

      cardList.forEach(function (card) {
        var cardRect = card.getBoundingClientRect();
        var centerX = cardRect.left + cardRect.width / 2;
        var centerY = cardRect.top + cardRect.height / 2;
        var distance =
          Math.hypot(e.clientX - centerX, e.clientY - centerY) -
          Math.max(cardRect.width, cardRect.height) / 2;
        var effectiveDistance = Math.max(0, distance);
        minDistance = Math.min(minDistance, effectiveDistance);

        var glowIntensity = 0;
        if (effectiveDistance <= sv.proximity) {
          glowIntensity = 1;
        } else if (effectiveDistance <= sv.fadeDistance) {
          glowIntensity = (sv.fadeDistance - effectiveDistance) / (sv.fadeDistance - sv.proximity);
        }
        bentoUpdateCardGlow(card, e.clientX, e.clientY, glowIntensity, spotlightRadius);
      });

      gsap.set(spotlight, { left: e.clientX, top: e.clientY });
      var targetOpacity =
        minDistance <= sv.proximity
          ? 0.75
          : minDistance <= sv.fadeDistance
            ? ((sv.fadeDistance - minDistance) / (sv.fadeDistance - sv.proximity)) * 0.75
            : 0;
      gsap.to(spotlight, {
        opacity: targetOpacity,
        duration: targetOpacity > 0 ? 0.2 : 0.45,
        ease: 'power2.out'
      });
    }

    function onDocLeave() {
      grid.querySelectorAll('.magic-bento-card').forEach(function (card) {
        card.style.setProperty('--glow-intensity', '0');
      });
      gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
    }

    function onTileClick(e) {
      var tile = e.target.closest('.market-tile');
      if (!tile || e.target.closest('.market-tile-remove')) return;

      var card = tile.closest('.magic-bento-card');
      if (!card) return;

      var rect = tile.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var maxDistance = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height)
      );

      var ripple = document.createElement('div');
      ripple.className = 'market-tile-bento-ripple';
      ripple.style.cssText =
        'width:' + (maxDistance * 2) + 'px;height:' + (maxDistance * 2) + 'px;' +
        'left:' + (x - maxDistance) + 'px;top:' + (y - maxDistance) + 'px;' +
        'background:radial-gradient(circle,rgba(' + glowColor + ',0.35) 0%,rgba(' + glowColor + ',0.15) 35%,transparent 70%);';
      tile.style.position = 'relative';
      tile.appendChild(ripple);

      gsap.fromTo(
        ripple,
        { scale: 0, opacity: 1 },
        {
          scale: 1,
          opacity: 0,
          duration: 0.75,
          ease: 'power2.out',
          onComplete: function () { ripple.remove(); }
        }
      );
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onDocLeave);
    grid.addEventListener('click', onTileClick);

    marketTilesBentoCleanup = function () {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onDocLeave);
      grid.removeEventListener('click', onTileClick);
      if (spotlight.parentNode) spotlight.parentNode.removeChild(spotlight);
    };
  }

  function destroyBriefingBento() {
    if (briefingBentoCleanup) {
      briefingBentoCleanup();
      briefingBentoCleanup = null;
    }
  }

  function initBriefingBento() {
    destroyBriefingBento();
    var grid = document.getElementById('briefingList');
    if (!grid) return;
    var cards = grid.querySelectorAll('.brief-card.magic-bento-card');
    if (!cards.length) return;
    if (bentoAnimationsDisabled()) return;

    var glowColor = BENTO_GLOW_RGB;
    var spotlightRadius = BENTO_SPOTLIGHT_RADIUS;
    var magnetAnims = [];
    var cardUnbinds = [];

    cards.forEach(function (card, i) {
      magnetAnims[i] = null;
      function onMove(e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var mx = (x - rect.width / 2) * 0.045;
        var my = (y - rect.height / 2) * 0.045;
        if (magnetAnims[i]) magnetAnims[i].kill();
        magnetAnims[i] = gsap.to(card, {
          x: mx,
          y: my,
          duration: 0.28,
          ease: 'power2.out'
        });
        bentoUpdateCardGlow(card, e.clientX, e.clientY, 1, spotlightRadius);
      }
      function onLeave() {
        if (magnetAnims[i]) magnetAnims[i].kill();
        gsap.to(card, { x: 0, y: 0, duration: 0.35, ease: 'power2.out' });
        card.style.setProperty('--glow-intensity', '0');
      }
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
      cardUnbinds.push(function () {
        card.removeEventListener('mousemove', onMove);
        card.removeEventListener('mouseleave', onLeave);
        if (magnetAnims[i]) magnetAnims[i].kill();
        gsap.set(card, { x: 0, y: 0 });
        card.style.setProperty('--glow-intensity', '0');
      });
    });

    var spotlight = document.createElement('div');
    spotlight.className = 'market-bento-spotlight briefing-bento-spotlight';
    document.body.appendChild(spotlight);

    function onMouseMove(e) {
      var rect = grid.getBoundingClientRect();
      var inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      var cardList = grid.querySelectorAll('.brief-card.magic-bento-card');

      if (!inside) {
        gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        return;
      }

      var sv = bentoSpotlightValues(spotlightRadius);
      var minDistance = Infinity;

      cardList.forEach(function (card) {
        var cardRect = card.getBoundingClientRect();
        var centerX = cardRect.left + cardRect.width / 2;
        var centerY = cardRect.top + cardRect.height / 2;
        var distance =
          Math.hypot(e.clientX - centerX, e.clientY - centerY) -
          Math.max(cardRect.width, cardRect.height) / 2;
        var effectiveDistance = Math.max(0, distance);
        minDistance = Math.min(minDistance, effectiveDistance);
        if (effectiveDistance > sv.fadeDistance) {
          return;
        }
        var glowIntensity = 0;
        if (effectiveDistance <= sv.proximity) {
          glowIntensity = 1;
        } else {
          glowIntensity = (sv.fadeDistance - effectiveDistance) / (sv.fadeDistance - sv.proximity);
        }
        if (glowIntensity > parseFloat(card.style.getPropertyValue('--glow-intensity') || '0')) {
          bentoUpdateCardGlow(card, e.clientX, e.clientY, glowIntensity, spotlightRadius);
        }
      });

      gsap.set(spotlight, { left: e.clientX, top: e.clientY });
      var targetOpacity =
        minDistance <= sv.proximity
          ? 0.55
          : minDistance <= sv.fadeDistance
            ? ((sv.fadeDistance - minDistance) / (sv.fadeDistance - sv.proximity)) * 0.55
            : 0;
      gsap.to(spotlight, {
        opacity: targetOpacity,
        duration: targetOpacity > 0 ? 0.2 : 0.45,
        ease: 'power2.out'
      });
    }

    function onDocLeave() {
      gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onDocLeave);

    briefingBentoCleanup = function () {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onDocLeave);
      cardUnbinds.forEach(function (fn) { fn(); });
      if (spotlight.parentNode) spotlight.parentNode.removeChild(spotlight);
    };
  }

  function renderMarketTiles() {
    var el = document.getElementById('marketTiles');
    if (!el) return;
    destroyMarketTilesBento();
    var tickers = getMarketTickers();
    if (!tickers.length) {
      el.innerHTML = '<p class="market-tiles-empty">Добавьте тикер в поле выше</p>';
      return;
    }
    el.innerHTML = tickers.map(function (ticker) {
      var tile = buildMarketTileConfig(ticker);
      var wrapCls = 'market-tile-wrap magic-bento-card magic-bento-card--border-glow star-border-container star-border-loading' + (tile.featured ? ' featured' : '');
      return (
        '<div class="' + wrapCls + '" data-ticker="' + escapeHtml(tile.ticker) + '">' +
          '<div class="border-gradient-bottom" aria-hidden="true"></div>' +
          '<div class="border-gradient-top" aria-hidden="true"></div>' +
          '<button type="button" class="market-tile star-border-inner" data-ticker="' + escapeHtml(tile.ticker) + '" aria-label="' +
            escapeHtml(tile.title + ', ' + tile.subtitle) + '">' +
            '<div class="market-tile-top">' +
              '<span class="market-tile-ticker">' + escapeHtml(tile.title) + '</span>' +
              '<span class="market-tile-sub">' + escapeHtml(tile.subtitle) + '</span>' +
            '</div>' +
            '<span class="market-tile-price" data-price>…</span>' +
            '<span class="market-tile-change muted" data-change>загрузка</span>' +
          '</button>' +
          '<button type="button" class="market-tile-remove" data-remove-ticker="' + escapeHtml(tile.ticker) +
            '" aria-label="Удалить ' + escapeHtml(tile.ticker) + '">×</button>' +
        '</div>'
      );
    }).join('');

    ensureTickerNames(tickers);

    tickers.forEach(function (ticker) {
      fetchMoexQuote(ticker).then(function (quote) {
        var btn = el.querySelector('.market-tile[data-ticker="' + ticker + '"]');
        updateMarketTileButton(btn, quote, ticker);
      }).catch(function () {
        var btn = el.querySelector('.market-tile[data-ticker="' + ticker + '"]');
        updateMarketTileButton(btn, null, ticker);
      });
    });

    initMarketTilesBento();
  }

  function renderPortfolioChart() {
    var positions = getPortfolioPaperPositions();
    var select = document.getElementById('chartTickerSelect');
    var emptyEl = document.getElementById('portfolioChartEmpty');
    var wrap = document.getElementById('portfolioChartWrap');
    var statsEl = document.getElementById('portfolioChartStats');
    var canvas = document.getElementById('portfolioPriceChart');
    var toolbar = document.getElementById('chartToolbar');
    var label = document.getElementById('portfolioChartTickerLabel');

    if (!select || !canvas) return;

    if (!positions.length) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Добавьте бумаги в портфель (кроме IMOEX)';
      }
      if (wrap) wrap.hidden = true;
      if (statsEl) statsEl.hidden = true;
      if (toolbar) toolbar.hidden = true;
      select.innerHTML = '';
      if (label) label.textContent = '—';
      setChartSourceLabel('');
      return;
    }

    select.innerHTML = positions.map(function (p) {
      return '<option value="' + escapeHtml(p.ticker) + '">' + escapeHtml(p.ticker) + '</option>';
    }).join('');

    if (!state.chartTicker || !findPortfolioPosition(state.chartTicker)) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Выберите бумагу в папке — откроется график котировок';
      }
      if (wrap) wrap.hidden = true;
      if (statsEl) statsEl.hidden = true;
      if (toolbar) toolbar.hidden = true;
      if (label) label.textContent = '—';
      setChartSourceLabel('Выберите бумагу из портфеля');
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (wrap) wrap.hidden = false;
    if (statsEl) statsEl.hidden = false;
    if (toolbar) toolbar.hidden = false;
    select.value = state.chartTicker;
    if (label) label.textContent = state.chartTicker;

    var pos = findPortfolioPosition(state.chartTicker);
    if (!pos) return;

    var reqId = ++state.chartRequestId;
    setChartSourceLabel('Загрузка данных МосБиржи…', false);

    var ctx = canvas.getContext('2d');
    var rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6B6B6B';
    ctx.font = '14px Golos Text, IBM Plex Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Загрузка…', rect.width / 2 || 140, (rect.height || 160) / 2);

    fetchMoexHistory(pos.ticker, state.chartHorizon).then(function (result) {
      if (reqId !== state.chartRequestId) return;
      canvas._chartStatsSeries = result.series;
      canvas._chartHoverIndex = null;
      drawPriceChart(canvas, result.series, { ticker: pos.ticker, horizon: state.chartHorizon });
      updateChartStatsFromSeries(result.series, pos.ticker);
      setChartSourceLabel('Источник: МосБиржа (ISS) · ' + pos.ticker, false);
      if (result.series.length) {
        pos.currentPrice = result.series[result.series.length - 1].price;
        setPortfolio(getPortfolio());
      }
    }).catch(function () {
      if (reqId !== state.chartRequestId) return;
      var fallback = generatePriceHistory(pos.ticker, pos.currentPrice, state.chartHorizon);
      canvas._chartStatsSeries = fallback;
      canvas._chartHoverIndex = null;
      drawPriceChart(canvas, fallback, { ticker: pos.ticker, horizon: state.chartHorizon });
      updateChartStatsFromSeries(fallback, pos.ticker);
      setChartSourceLabel('Демонстрационная кривая (данные МосБиржи недоступны или бумага не найдена)', true);
    });

    document.querySelectorAll('#portfolioTableBody tr').forEach(function (row) {
      row.classList.toggle('chart-row-active', row.getAttribute('data-chart-ticker') === state.chartTicker);
    });
  }

  function renderPortfolioTableBody() {
    var positions = getPortfolio().positions;
    var tbody = document.getElementById('portfolioTableBody');
    var cards = document.getElementById('portfolioCards');
    if (!tbody || !cards) return;
    tbody.innerHTML = positions.map(function (p) {
      var pnl = getPositionReturnPct(p);
      var cls = pnl != null && pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
      var avg = isFinite(Number(p.avgPrice)) ? Number(p.avgPrice).toFixed(2) : '—';
      var cur = isFinite(Number(p.currentPrice)) ? Number(p.currentPrice).toFixed(2) : '—';
      return '<tr data-chart-ticker="' + escapeHtml(p.ticker) + '"><td class="ticker">' + escapeHtml(p.ticker) +
        '</td><td>' + escapeHtml(avg) + '</td><td>' + escapeHtml(cur) +
        '</td><td class="' + cls + '">' + escapeHtml(formatSignedPct(pnl, 2)) + '</td></tr>';
    }).join('');
    cards.innerHTML = positions.map(function (p) {
      var pnl = getPositionReturnPct(p);
      var cls = pnl != null && pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
      var avg = isFinite(Number(p.avgPrice)) ? Number(p.avgPrice).toFixed(2) : '—';
      var cur = isFinite(Number(p.currentPrice)) ? Number(p.currentPrice).toFixed(2) : '—';
      return '<div class="portfolio-card"><div class="ticker">' + escapeHtml(p.ticker) + '</div>' +
        '<div class="grid"><span>Ср. цена</span><span>' + escapeHtml(avg) + '</span>' +
        '<span>Текущая</span><span>' + escapeHtml(cur) + '</span>' +
        '<span>Доходность</span><span class="' + cls + '">' + escapeHtml(formatSignedPct(pnl, 2)) + '</span></div></div>';
    }).join('');
  }

  function renderPortfolio() {
    renderPortfolioTableBody();
    renderPortfolioFolder();
    renderMoexIndexBox();
    renderPortfolioChart();
    refreshPortfolioQuotes().then(function () {
      renderPortfolioTableBody();
      renderPortfolioFolder();
      renderPortfolioChart();
    });
  }

  function renderAlerts() {
    var a = getAlerts();
    document.getElementById('alertThreshold').value = a.threshold != null ? a.threshold : 2;
    document.getElementById('alertThresholdLabel').textContent = THRESHOLD_LABELS[a.threshold] || THRESHOLD_LABELS[2];
    document.querySelectorAll('#alertChannels input[name="channel"]').forEach(function (cb) {
      cb.checked = (a.channels || []).indexOf(cb.value) !== -1;
    });
    var rulesEl = document.getElementById('alertRulesList');
    if (!a.rules || a.rules.length === 0) {
      rulesEl.innerHTML = '<p class="muted">Правил уведомлений пока нет</p>';
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
    document.getElementById('profileId').value = p.id || '';
    document.getElementById('profileName').value = p.name || '';
    document.getElementById('essayStyle').value = s.essayStyle || 'concise';
    document.getElementById('riskProfile').value = s.riskProfile || 'balanced';
  }

  function saveProfileFromUI() {
    setProfile({
      id: document.getElementById('profileId').value.trim(),
      name: document.getElementById('profileName').value.trim()
    });
    setSettings({
      essayStyle: document.getElementById('essayStyle').value,
      riskProfile: document.getElementById('riskProfile').value
    });
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-panel') === tab);
    });
    document.querySelectorAll('.sidebar-nav button, .bottom-nav button').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    if (location.hash !== '#' + tab) {
      history.replaceState(null, '', '#' + tab);
    }
    if (tab === 'briefing') {
      renderBriefing();
      renderMarketTiles();
    }
    if (tab === 'portfolio') {
      renderPortfolio();
    }
    if (tab === 'settings') renderAlerts();
  }

  function openDigestModal() {
    var d = getDigest();
    document.getElementById('digestEmail').value = d.email || '';
    document.getElementById('digestTime').value = d.time || '08:00';
    document.getElementById('digestModal').classList.add('open');
  }

  function closeDigestModal() {
    document.getElementById('digestModal').classList.remove('open');
  }

  function exportAll() {
    var data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profile: getProfile(),
      watchlist: getWatchlist(),
      settings: getSettings(),
      alerts: getAlerts(),
      digest: getDigest(),
      portfolio: getPortfolio(),
      filters: getFilters(),
      marketTiles: getMarketTickers(),
      tickerNames: getTickerNamesMap()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'investbrief-rf-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Настройки сохранены в файл');
  }

  function importAll(jsonStr) {
    var data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      showToast('Не удалось прочитать файл');
      return;
    }
    if (!data || data.version !== '1.0.0') {
      showToast('Файл не подходит: сохранён в другой версии приложения');
      return;
    }
    if (data.profile) saveJSON(KEYS.profile, data.profile);
    if (data.watchlist) saveJSON(KEYS.watchlist, data.watchlist);
    if (data.settings) saveJSON(KEYS.settings, data.settings);
    if (data.alerts) saveJSON(KEYS.alerts, data.alerts);
    if (data.digest) saveJSON(KEYS.digest, data.digest);
    if (data.portfolio) saveJSON(KEYS.portfolio, data.portfolio);
    if (data.filters) saveJSON(KEYS.filters, data.filters);
    if (data.marketTiles) saveJSON(KEYS.marketTiles, data.marketTiles);
    if (data.tickerNames) saveJSON(KEYS.tickerNames, data.tickerNames);
    loadProfileToUI();
    loadFiltersToUI();
    renderWatchlist();
    renderBriefing();
    renderMarketTiles();
    renderFeed();
    renderPortfolio();
    renderAlerts();
    updateStats();
    showToast('Настройки загружены');
  }

  function initHash() {
    var hash = (location.hash || '#briefing').replace('#', '');
    var valid = ['briefing', 'watchlist', 'portfolio', 'settings'];
    if (valid.indexOf(hash) !== -1) switchTab(hash);
    else switchTab('briefing');
  }

  function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    setupTickerAutocomplete('marketTickerInput');
    setupTickerAutocomplete('tickerInput');
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
      renderBriefing();
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

    document.getElementById('addTickerBtn').addEventListener('click', function () {
      addTicker(document.getElementById('tickerInput').value);
    });
    document.getElementById('tickerInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        if (acControllers.tickerInput) acControllers.tickerInput.handleEnter(e);
        addTicker(e.target.value);
      }
    });
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

    document.getElementById('resetPortfolioBtn').addEventListener('click', function () {
      setPortfolio({ positions: DEFAULT_PORTFOLIO.slice() });
      state.chartTicker = '';
      state.folderOpen = false;
      renderPortfolio();
      showToast('Портфель сброшен');
    });

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

    document.getElementById('portfolioTableBody').addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-chart-ticker]');
      if (!row) return;
      selectPortfolioTicker(row.getAttribute('data-chart-ticker'));
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

    ['profileId', 'profileName', 'essayStyle', 'riskProfile'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        saveProfileFromUI();
        showToast('Профиль сохранён');
      });
      document.getElementById(id).addEventListener('blur', saveProfileFromUI);
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
      setDigest({
        email: document.getElementById('digestEmail').value.trim(),
        time: document.getElementById('digestTime').value || '08:00'
      });
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
    document.getElementById('briefingList').addEventListener('click', handleBriefListClick);
    document.getElementById('briefingList').addEventListener('keydown', handleBriefListKeydown);
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

  function init() {
    if (!localStorage.getItem(KEYS.portfolio)) {
      setPortfolio({ positions: DEFAULT_PORTFOLIO.slice() });
    }
    loadProfileToUI();
    loadFiltersToUI();
    renderWatchlist();
    loadLiveBriefs();
    renderMarketTiles();
    renderPortfolio();
    renderMoexIndexBox();
    renderAlerts();
    bindEvents();
    bindChartHover(document.getElementById('portfolioPriceChart'));
    bindChartHover(document.getElementById('imoexMiniChart'));
    initHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
