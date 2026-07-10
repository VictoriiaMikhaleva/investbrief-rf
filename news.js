/* news.js */
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }



  function parseBriefPublishedAt(pubDateStr) {
    if (!pubDateStr) return new Date();
    var pub = new Date(pubDateStr);
    if (isNaN(pub.getTime())) return new Date();
    var now = Date.now();
    if (pub.getTime() > now + 5 * 60 * 1000) return new Date();
    return pub;
  }



  function hoursAgo(h) {
    var d = new Date();
    d.setTime(d.getTime() - h * 60 * 60 * 1000);
    return d.toISOString();
  }

  /* Запасная лента при недоступности источников новостей. */
  var DEMO_BRIEFS = [
    { id: 'b1', ticker: 'SBER', type: 'stock', market: 'RU', publishedAt: daysAgo(1), eventType: 'earnings', tone: 'positive', importance: 'high',
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
    { id: 'b15', ticker: 'ROSN', type: 'stock', market: 'RU', publishedAt: hoursAgo(7), eventType: 'dividend', tone: 'neutral', importance: 'low',
      title: 'Роснефть: календарь раскрытий без сюрпризов',
      summary: 'Даты МСФО и собрания акционеров подтверждены, дивидендную политику не меняли. Оценка по-прежнему завязана на Urals и налог на сверхприбыль.',
      sourceUrl: 'https://www.rosneft.ru/investors/' },
    { id: 'b16', ticker: 'AAPL', type: 'stock', market: 'US', publishedAt: hoursAgo(3), eventType: 'earnings', tone: 'positive', importance: 'high',
      title: 'Apple: ожидания по выручке сервисов выше консенсуса',
      summary: 'Аналитики повышают прогноз по подпискам и экосистеме. Рынок ждёт деталей маржинальности iPhone в следующем квартале.',
      sourceUrl: 'https://www.apple.com/newsroom/' },
    { id: 'b17', ticker: 'NVDA', type: 'stock', market: 'US', publishedAt: hoursAgo(5), eventType: 'rating', tone: 'positive', importance: 'critical',
      title: 'NVIDIA: спрос на ускорители ИИ остаётся ключевым драйвером',
      summary: 'Инвесторы обсуждают очередность поставок и долю в дата-центрах. Волатильность высокая, но интерес к сектору сохраняется.',
      sourceUrl: 'https://nvidianews.nvidia.com/' },
    { id: 'b18', ticker: 'MSFT', type: 'stock', market: 'US', publishedAt: daysAgo(1), eventType: 'earnings', tone: 'neutral', importance: 'medium',
      title: 'Microsoft: облако и Copilot в фокусе отчётности',
      summary: 'Рынок смотрит на темпы роста Azure и монетизацию ИИ-функций. Рекомендации домов в основном удерживают позитивный взгляд.',
      sourceUrl: 'https://news.microsoft.com/' },
    { id: 'b19', ticker: 'TSLA', type: 'stock', market: 'US', publishedAt: hoursAgo(8), eventType: 'macro', tone: 'negative', importance: 'high',
      title: 'Tesla: давление на маржу из-за ценовой конкуренции',
      summary: 'Инвесторы обсуждают скидки и объёмы поставок. Краткосрочно бумага чувствительна к макро и новостям по автономному вождению.',
      sourceUrl: 'https://www.tesla.com/' }
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
    b16: 'Apple остаётся в центре внимания перед отчётностью: рынок закладывает устойчивый рост сервисной выручки. Для держателей важно отделить краткосрочные ожидания по iPhone от долгосрочной модели экосистемы.\n\nВолатильность по технологическому сектору США остаётся повышенной — новости по ставке ФРС и мультипликаторам влияют на весь кластер.',
    b17: 'NVIDIA продолжает задавать тон сектору полупроводников: спрос на GPU для дата-центров остаётся главной темой для инвесторов. Любые сигналы о сроках поставок или конкуренции быстро отражаются в котировках.\n\nПозиция в портфеле имеет смысл только при понимании цикличности и концентрации риска в одном имени.',
    b18: 'Microsoft готовится к очередному раскрытию: рынок ждёт цифр по облаку и прогрессу в монетизации ИИ-инструментов. Исторически бумага менее волатильна, чем чистые «чиповые» истории, но чувствительна к оценке сектора в целом.',
    b19: 'Tesla снова в фокусе из-за ценовой политики и темпов поставок. Инвесторы обсуждают, насколько скидки съедают маржу и как это соотносится с долгосрочной стратегией по автономному вождению.\n\nДля краткосрочного трейда бумага остаётся одной из самых новостных в индексе технологических компаний.',
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



  function cyrillicLetterRatio(text) {
    var s = String(text || '');
    var cyr = 0;
    var lat = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0x0400 && c <= 0x04FF) cyr += 1;
      else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) lat += 1;
    }
    var letters = cyr + lat;
    if (!letters) return 1;
    return cyr / letters;
  }



  /** В ленте — русский заголовок; англоязычные дубли Мосбиржи отсекаем. */
  function isRussianBriefText(title, summary, feed) {
    var titleText = String(title || '').trim();
    if (!titleText) return false;
    if (feed && (feed.market === 'US' || feed.lang === 'en')) {
      return isInvestmentRelevantBrief(title, summary, summary, feed);
    }
    if (feed && feed.id === 'moex' && cyrillicLetterRatio(titleText) < 0.12 && /[a-zA-Z]{5,}/.test(titleText)) {
      return false;
    }
    if (cyrillicLetterRatio(titleText) >= 0.2) return true;
    var combined = titleText + ' ' + String(summary || '');
    var ratio = cyrillicLetterRatio(combined);
    var longLatin = /[a-zA-Z]{6,}/.test(combined);
    if (longLatin && ratio < 0.35) return false;
    return ratio >= 0.1;
  }



  /** Мосбиржа, ЦБ, Smart-Lab — узкие тематические ленты; остальное — только с проверкой темы. */
  var CURATED_INVESTMENT_FEEDS = {
    moex: true,
    cbr: true,
    cbr_press: true,
    cbr_currency: true,
    smartlab: true,
    smartlab_stocks: true
  };

  var INVESTMENT_TOPIC_KEYWORDS = [
    'акци', 'облигац', 'офз', 'бирж', 'мосбирж', 'moex', 'imoex', 'индекс',
    'инвест', 'инвестиц', 'портфел', 'дивиденд', 'котиров', 'торг', 'лот', 'стакан',
    'эмитент', 'размещен', 'ipo', 'spo', 'байбэк', 'buyback',
    'ключев', 'ставк', 'цб ', 'банк росс', 'инфляц', 'дефляц',
    'рубл', 'доллар', 'евро', 'юан', 'валют', 'курс', 'нефт', 'brent', 'urals',
    'газ', 'золот', 'металл', 'никел', 'паллад', 'алюмин',
    'прибыл', 'убыт', 'выручк', 'ebitda', 'отчёт', 'отчет', 'мсфо', 'рсбу', 'квартал',
    'санкц', 'экспорт', 'импорт', 'таргет', 'рекомендац', 'рейтинг',
    'аукцион', 'минфин', 'гособлигац', 'купон', 'доходност', 'дюрац',
    'капитал', 'акционер', 'собран', 'дивполит',
    'фондов', 'etf', 'бпиф', 'фьючерс', 'опцион', 'ликвидност', 'волатильност',
    's&p', 'nasdaq', 'фрс', 'fed', 'opec', 'опек',
    'сбер', 'газпром', 'лукойл', 'новатэк', 'норникел', 'втб', 'роснефт', 'татнефт',
    'кредит', 'займ', 'еврооблигац', 'облигационн', 'syndicated',
    'тариф', 'пошлин', 'ввп', 'рецесс', 'безработ'
  ];

  var NON_INVESTMENT_TOPIC_KEYWORDS = [
    'нападк', 'перепалк', 'колкост', 'не дружит', 'перестал друж', 'умолял', 'умолять',
    'оскорбил', 'оскорблен', 'скандал',
    'стрельб', 'убийств', 'погиб', 'жертв', 'ранен', 'пострадав',
    'террор', 'взрыв', 'пожар', 'дтп', 'авария', 'изнасил', 'похищ',
    'футбол', 'хоккей', 'теннис', 'олимпиад', 'чемпионат мир',
    'кино', 'сериал', 'актёр', 'актрис', 'певец', 'певиц', 'шоу-бизнес',
    'свадьб', 'развод', 'беремен', 'родил', 'скончал', 'похорон',
    'землетряс', 'ураган', 'наводнен', 'извержен',
    'исламск', 'мечет', 'церков', 'религиозн',
    'подростк', 'школьник', 'полици', 'задержан', 'арестован',
    'калифорни', 'техас', 'флорид', 'кентукки',
    'бпла', 'беспилотн', 'беспилотник', ' дрон', 'дронов', 'дроны',
    'сбит', 'сбили', 'сбитых', 'сбито', 'перехват', 'перехвачен',
    'обстрел', 'ракетн', ' атак', 'атакован', 'удар по', 'воздушн', 'тревог',
    ' пво', 'фронт', 'мобилизац', 'военнослуж', 'артиллер'
  ];



  function isMilitaryConflictNews(text) {
    var t = (' ' + String(text || '').toLowerCase() + ' ');
    if (t.indexOf('бпла') >= 0) return true;
    if (t.indexOf('беспилотн') >= 0) return true;
    if (/\bдрон/.test(t) || t.indexOf(' дрон') >= 0 || t.indexOf('дронов') >= 0) return true;
    if (t.indexOf('сбит') >= 0 || t.indexOf('перехват') >= 0) return true;
    if (t.indexOf('обстрел') >= 0 || t.indexOf('ракет') >= 0) return true;
    if (t.indexOf('воздушн') >= 0 && t.indexOf('тревог') >= 0) return true;
    return false;
  }



  function countInvestmentTopicHits(text) {
    var t = (' ' + String(text || '').toLowerCase() + ' ');
    var hits = 0;
    for (var i = 0; i < INVESTMENT_TOPIC_KEYWORDS.length; i++) {
      if (t.indexOf(INVESTMENT_TOPIC_KEYWORDS[i]) >= 0) hits += 1;
    }
    return hits;
  }



  function isInvestmentRelevantBrief(title, summary, body, feed) {
    if (feed && CURATED_INVESTMENT_FEEDS[feed.id]) return true;
    var text = (title || '') + ' ' + (summary || '') + ' ' + (body || '');
    if (isMilitaryConflictNews(title) || isMilitaryConflictNews(text)) return false;
    var t = (' ' + text.toLowerCase() + ' ');
    var investHits = countInvestmentTopicHits(text);
    if (!investHits) return false;
    for (var i = 0; i < NON_INVESTMENT_TOPIC_KEYWORDS.length; i++) {
      if (t.indexOf(NON_INVESTMENT_TOPIC_KEYWORDS[i]) >= 0 && investHits < 2) return false;
    }
    return true;
  }



  function buildLiveRssBody(rssItem) {
    var desc = stripHtmlText(rssItem.description || '');
    var content = stripHtmlText(rssItem.content || '');
    var parts = [];
    if (desc) parts.push(desc);
    if (content && content !== desc) parts.push(content);
    var body = parts.join('\n\n').trim();
    if (body.length > 8000) body = body.slice(0, 7997) + '…';
    return body;
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
    if (typeof Markets !== 'undefined' && Markets.US_CATALOG) {
      var usHit = null;
      Markets.US_CATALOG.forEach(function (item) {
        if (usHit) return;
        var tk = item.ticker.toLowerCase();
        if (t.indexOf(' ' + tk + ' ') >= 0 || t.indexOf(' ' + tk + '.') >= 0) {
          usHit = { ticker: item.ticker, type: 'stock' };
        }
      });
      if (usHit) return usHit;
    }
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
    if (!LIVE_BRIEFS.length) return DEMO_BRIEFS;
    return LIVE_BRIEFS.slice();
  }



  function isLiveBriefsActive() {
    return LIVE_BRIEFS.length > 0 && BRIEFS_SOURCE !== 'demo' && BRIEFS_SOURCE !== 'loading';
  }



  function readBriefsCache() {
    try {
      var raw = localStorage.getItem(BRIEFS_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.items || Date.now() > parsed.expires) return null;
      return { items: parsed.items, savedAt: parsed.savedAt || 0 };
    } catch (e) {
      return null;
    }
  }



  function writeBriefsCache(items) {
    try {
      localStorage.setItem(BRIEFS_CACHE_KEY, JSON.stringify({
        expires: Date.now() + BRIEFS_CACHE_TTL,
        savedAt: Date.now(),
        items: items
      }));
    } catch (e) { /* quota */ }
  }



  function isBriefsCacheStale(savedAt) {
    if (!savedAt) return true;
    return Date.now() - savedAt > BRIEFS_STALE_AFTER_MS;
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
      market: 'RU',
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
        pubDate: rssTagText(item, 'pubDate') || rssTagText(item, 'dc:date') || rssTagText(item, 'updated'),
        description: rssTagText(item, 'description'),
        content: rssItemContent(item)
      });
    }
    return out;
  }



  var RSS_FETCH_TIMEOUT_MS = 18000;
  var BRIEFS_LOAD_TIMEOUT_MS = 75000;
  var RSS_FEED_BATCH_SIZE = 3;
  var RSS_FEED_BATCH_PAUSE_MS = 250;
  var RSS_FEED_RETRY_COUNT = 2;
  var RSS2JSON_ITEM_COUNT = 25;
  var BRIEFS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  var BRIEFS_STALE_AFTER_MS = 8 * 60 * 1000;



  /** Локальный бэкенд (npm start) — на GitHub Pages API нет, только RSS через прокси. */
  function hasLocalNewsApi() {
    if (location.protocol === 'file:') return false;
    var host = (location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  }

  function getRssRetryCount() {
    // На GitHub Pages внешний прокси часто даёт CORS/52x, лишние ретраи только шумят консоль.
    return hasLocalNewsApi() ? RSS_FEED_RETRY_COUNT : 0;
  }

  var RSS_QUIET_LOG = true;
  var _rssFailHosts = {};

  function noteRssFeedFail(feedUrl) {
    if (!RSS_QUIET_LOG) return;
    var host = feedUrl;
    try { host = new URL(feedUrl).hostname; } catch (e) { /* noop */ }
    _rssFailHosts[host] = (_rssFailHosts[host] || 0) + 1;
  }

  function flushRssQuietLog() {
    if (!RSS_QUIET_LOG) return;
    var hosts = Object.keys(_rssFailHosts);
    if (!hosts.length) return;
    var parts = hosts.map(function (h) { return h + ' (' + _rssFailHosts[h] + ')'; });
    console.info('[InvestBrief] Часть RSS-лент временно недоступна: ' + parts.join(', ') + '. Новости обновятся позже.');
    _rssFailHosts = {};
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

  if (typeof window !== 'undefined') {
    window.fetchTextViaProxies = fetchTextViaProxies;
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
    // На GitHub Pages allorigins даёт CORS/52x и забивает консоль — только rss2json.
    return fetchRssViaRss2Json(feedUrl).catch(function () {
      noteRssFeedFail(feedUrl);
      return [];
    });
  }



  function fetchRssFeedItemsWithRetry(feedUrl) {
    return fetchWithRetry(function () {
      return fetchRssFeedItems(feedUrl);
    }, getRssRetryCount());
  }



  function mapRssItemToBrief(rssItem, feed) {
    var title = stripHtmlText(rssItem.title);
    var plain = stripHtmlText([rssItem.title, rssItem.description, rssItem.content].join(' '));
    var body = buildLiveRssBody(rssItem);
    if (!body) body = plain;
    var summary = stripHtmlText(rssItem.description || body);
    if (summary.length > 320) summary = summary.slice(0, 317) + '…';
    if (!isRussianBriefText(title, summary, feed)) return null;
    if (!isInvestmentRelevantBrief(title, summary, body, feed)) return null;
    var asset = matchNewsTicker(plain, feed);
    var eventType = detectNewsEventType(plain);
    var tone = detectNewsTone(plain);
    var pub = parseBriefPublishedAt(rssItem.pubDate);
    return {
      id: briefIdFromLink(rssItem.link),
      ticker: asset.ticker,
      type: asset.type,
      publishedAt: pub.toISOString(),
      category: feed.category || null,
      feedId: feed.id || null,
      eventType: eventType,
      tone: tone,
      importance: importanceNumToLevel(calcNewsImportance(eventType, feed.kind)),
      title: title,
      summary: summary || title,
      body: body,
      sourceUrl: rssItem.link,
      sourceName: feed.name,
      market: feed.market || (feed.id === 'rbc_world' ? 'US' : 'RU'),
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
    }).slice(0, 180);
    BRIEFS_SOURCE = 'live';
    writeBriefsCache(LIVE_BRIEFS);
    if (typeof renderHomePage === 'function') renderHomePage();
    else renderBriefing();
    renderFeed();
    updateStats();
  }



  function fetchLiveBriefsFromRss() {
    var collected = [];

    function fetchOneFeed(feed) {
      return fetchRssFeedItemsWithRetry(feed.url)
        .then(function (items) {
          return items.map(function (item) {
            return mapRssItemToBrief(item, feed);
          }).filter(function (b) { return b; });
        })
        .catch(function () { return []; });
    }

    function runBatch(start) {
      var batch = NEWS_FEEDS_SORTED.slice(start, start + RSS_FEED_BATCH_SIZE);
      if (!batch.length) return Promise.resolve();
      return Promise.all(batch.map(fetchOneFeed))
        .then(function (parts) {
          parts.forEach(function (part) {
            if (part.length) collected = collected.concat(part);
          });
          if (collected.length) mergeLiveBriefsPartial(collected);
          return delayMs(RSS_FEED_BATCH_PAUSE_MS).then(function () {
            return runBatch(start + RSS_FEED_BATCH_SIZE);
          });
        });
    }

    return runBatch(0).then(function () {
      flushRssQuietLog();
      return sortBriefsNewest(dedupeBriefs(collected)).slice(0, 180);
    });
  }



  function fetchLiveBriefsFromApi() {
    if (!hasLocalNewsApi()) return Promise.reject(new Error('no api'));
    return fetch('/api/briefs?limit=180&sort=newest', { credentials: 'omit' })
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



  function fetchLiveBriefsQuiet() {
    var livePromise = hasLocalNewsApi()
      ? fetchLiveBriefsFromApi().catch(function () { return fetchLiveBriefsFromRss(); })
      : fetchLiveBriefsFromRss();
    return fetchWithTimeout(livePromise, BRIEFS_LOAD_TIMEOUT_MS)
      .then(function (items) {
        if (items && items.length) applyLiveBriefs(items, 'live');
        return items;
      })
      .catch(function () { return null; });
  }



  function scheduleBriefsRefresh() {
    if (typeof window === 'undefined') return;
    if (window._ibrfBriefsRefreshTimer) return;
    window._ibrfBriefsRefreshTimer = setInterval(function () {
      if (document.hidden) return;
      fetchLiveBriefsQuiet();
    }, BRIEFS_REFRESH_INTERVAL_MS);
    if (window._ibrfBriefsVisibilityBound) return;
    window._ibrfBriefsVisibilityBound = true;
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) fetchLiveBriefsQuiet();
    });
  }



  function loadLiveBriefs() {
    state.briefsLoading = true;
    BRIEFS_SOURCE = 'loading';
    var cached = readBriefsCache();
    if (cached && cached.items && cached.items.length) {
      LIVE_BRIEFS = cached.items;
      BRIEFS_SOURCE = 'cache';
      if (typeof renderHomePage === 'function') renderHomePage();
      else renderBriefing();
      renderFeed();
      if (isBriefsCacheStale(cached.savedAt)) fetchLiveBriefsQuiet();
    } else {
      if (typeof renderHomePage === 'function') renderHomePage();
      else renderBriefing();
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
        scheduleBriefsRefresh();
      });
  }

  var LIVE_BRIEFS = [];
  var BRIEFS_SOURCE = 'loading';
  var BRIEFS_CACHE_KEY = 'ibrf.liveBriefs.v5';
  var BRIEFS_CACHE_TTL = 5 * 60 * 1000;

  var NEWS_FEEDS = [
    { id: 'moex', name: 'Мосбиржа', url: 'https://www.moex.com/export/news.aspx?limit=40&lang=ru', kind: 'market', macroTicker: 'MOEX', category: 'Российский рынок', priority: 1 },
    { id: 'cbr', name: 'Банк России', url: 'https://www.cbr.ru/rss/RssNews', kind: 'macro', macroTicker: 'MOEX', category: 'Макроэкономика', priority: 1 },
    { id: 'rbc', name: 'РБК — экономика', url: 'https://rssexport.rbc.ru/rbcnews/category/economics/30/full.rss', kind: 'news', macroTicker: 'MOEX', category: 'Макроэкономика', priority: 1 },
    { id: 'interfax', name: 'Интерфакс', url: 'https://www.interfax.ru/rss.asp', kind: 'news', macroTicker: 'MOEX', category: 'Российский рынок', priority: 1 },
    { id: 'cbr_press', name: 'Банк России — пресс-релизы', url: 'https://www.cbr.ru/rss/RssPress', kind: 'macro', macroTicker: 'MOEX', category: 'Макроэкономика', priority: 2 },
    { id: 'cbr_currency', name: 'Банк России — валюта', url: 'https://www.cbr.ru/rss/RssCurrency', kind: 'macro', macroTicker: 'MOEX', category: 'Валюта', priority: 2 },
    { id: 'rbc_finances', name: 'РБК — финансы', url: 'https://rssexport.rbc.ru/rbcnews/category/finances/30/full.rss', kind: 'news', macroTicker: 'MOEX', category: 'Российский рынок', priority: 2 },
    { id: 'rbc_world', name: 'РБК — мир', url: 'https://rssexport.rbc.ru/rbcnews/category/world/30/full.rss', kind: 'news', macroTicker: 'MOEX', category: 'Международные рынки', market: 'US', priority: 2 },
    { id: 'smartlab', name: 'Smart-Lab — облигации', url: 'https://smart-lab.ru/bonds/rss/all/', kind: 'analytics', macroTicker: 'MOEX', category: 'Макроэкономика', priority: 3 },
    { id: 'smartlab_stocks', name: 'Smart-Lab — акции', url: 'https://smart-lab.ru/stocks/rss/', kind: 'analytics', macroTicker: 'MOEX', category: 'Российский рынок', priority: 3 }
  ];

  var NEWS_FEEDS_SORTED = NEWS_FEEDS.slice().sort(function (a, b) {
    return (a.priority || 9) - (b.priority || 9);
  });

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
    analyticsSub: 'stocks',
    horizon: 'today',
    newsMarketFilter: 'all',
    chartHorizon: 'week',
    imoexHorizon: 'month',
    chartTicker: '',
    analyticsTicker: '',
    analyticsPriceHorizon: '5y',
    folderOpen: false,
    chartRequestId: 0,
    briefArticleReqId: 0,
    briefsLoading: true,
    toastTimer: null,
    pfEditTicker: '',
    pfEditLotId: '',
    pfEditPrefix: '',
    pfSaleTicker: '',
    pfExpandedTickers: {}
  };
  if (typeof globalThis !== 'undefined') globalThis.state = state;
  else if (typeof window !== 'undefined') window.state = state;

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

  /* Алиасы тикеров → SECID; актуальный secid подтягивается через MOEX при первом запросе */
  var BOND_SECID_MAP = {
    OFZ_26241: 'SU26241RMFS8',
    OFZ_26238: 'SU26238RMFS4',
    OFZ_26243: 'SU26243RMFS4',
    OFZ_26244: 'SU26244RMFS6',
    OFZ_29024: 'SU29024RMFS8',
    SU26241RMFS2: 'SU26241RMFS8',
    SU26238RMFS0: 'SU26238RMFS4',
    SU26238RMFS2: 'SU26238RMFS4',
    SU26243RMFS8: 'SU26243RMFS4'
  };



  function isInHorizon(isoDate, horizon) {
    var pub = new Date(isoDate);
    var now = new Date();
    var start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (horizon === 'today') {
      var rollingStart = new Date(now);
      rollingStart.setTime(now.getTime() - 24 * 60 * 60 * 1000);
      return pub >= rollingStart && pub <= now;
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
    /* Счётчик непрочитанных в навигации отключён. */
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
    if (b.isLive) {
      var liveBody = stripHtmlText(b.body || '');
      var liveSummary = stripHtmlText(b.summary || '');
      if (liveBody && liveSummary && liveBody !== liveSummary && liveBody.indexOf(liveSummary) === -1) {
        return liveSummary + '\n\n' + liveBody;
      }
      if (liveBody) return liveBody;
      if (liveSummary) return liveSummary;
    }
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
    var paras = doc.querySelectorAll('article p, .article__text p, .article_text p, .news-text p, .l-col p, p');
    var chunks = [];
    for (var j = 0; j < paras.length && chunks.length < 4; j++) {
      var p = (paras[j].textContent || '').replace(/\s+/g, ' ').trim();
      if (p.length > 60) chunks.push(p);
    }
    if (chunks.length) return chunks.join('\n\n');
    return null;
  }



  function fetchBriefSourceExcerpt(url) {
    if (!url || url === '#') return Promise.resolve(null);
    var fetchHtml = typeof fetchTextViaProxies === 'function'
      ? fetchTextViaProxies(url)
      : fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url))
        .then(function (res) { return res.json(); })
        .then(function (data) { return data && data.contents ? data.contents : ''; });
    return fetchHtml
      .then(extractBriefExcerptFromHtml)
      .catch(function () { return null; });
  }



  function enrichBriefArticleBody(b, content, reqId, bodyEl, noticeEl) {
    var mainBody = content.body || '';
    var sourceLabel = getSourceLabel(b.sourceUrl, b.sourceName);

    function renderWithExcerpt(excerpt) {
      if (reqId !== state.briefArticleReqId) return;
      var html = '';
      if (mainBody.length > 40) {
        html += '<p class="brief-excerpt-label">Краткое содержание</p>' + formatBriefBodyHtml(mainBody);
      }
      if (excerpt && excerpt.length > 40) {
        var excerptStart = mainBody.slice(0, Math.min(mainBody.length, excerpt.length));
        if (excerptStart !== excerpt) {
          html +=
            '<div class="brief-source-excerpt">' +
              '<p class="brief-excerpt-label">С сайта «' + escapeHtml(sourceLabel) + '»</p>' +
              formatBriefBodyHtml(excerpt) +
            '</div>';
        }
      }
      bodyEl.innerHTML = html || formatBriefBodyHtml(mainBody);
      if (noticeEl) {
        noticeEl.textContent = 'Полная публикация — на сайте источника (ссылка ниже).';
        noticeEl.hidden = false;
      }
    }

    fetchBriefSourceExcerpt(b.sourceUrl).then(renderWithExcerpt).catch(function () {
      renderWithExcerpt(null);
    });
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
    b = normalizeBriefMarket(b);
    var toneClass = 'tag-tone-' + (b.tone || 'neutral');
    var marketLabel = typeof Markets !== 'undefined' ? Markets.marketBadgeLabel(b.market) : 'Россия';
    var marketCls = b.market === 'US' ? 'us' : 'ru';
    return (
      '<span class="ticker">' + escapeHtml(b.ticker) + '</span>' +
      '<span class="market-badge market-badge--' + marketCls + '">' + escapeHtml(marketLabel) + '</span>' +
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

    enrichBriefArticleBody(b, content, reqId, bodyEl, noticeEl);
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
    getWatchlist().forEach(function (item) {
      var n = typeof Markets !== 'undefined' ? Markets.normalizeWatchlistItem(item) : { ticker: item };
      var t = normalizeTicker(n && n.ticker);
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



  function normalizeBriefMarket(b) {
    if (!b) return b;
    if (b.market === 'US' || b.market === 'RU') return b;
    var mk = typeof Markets !== 'undefined' && Markets.isUsTicker(b.ticker) ? 'US' : 'RU';
    return Object.assign({}, b, { market: mk });
  }

  function filterBriefsForBriefingFrom(briefs) {
    var horizon = state.horizon;
    var scope = getSettings().briefingScope;
    var positions = getPositionTickers();
    var list = briefs.map(normalizeBriefMarket);
    if (typeof Markets !== 'undefined') list = Markets.filterBriefsByMarket(list);
    return list.filter(function (b) {
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
    b = enrichBriefAnalytics(b);
    var impClass = 'importance-' + (b.importance || 'medium');
    var content = getBriefContent(b);
    var url = safeUrl(b.sourceUrl);
    var whyHtml = b.whyImportant
      ? '<p class="brief-why"><strong>Почему это важно:</strong> ' + escapeHtml(b.whyImportant) + '</p>'
      : '';
    var checklistHtml = b.checklist && b.checklist.length
      ? ('<div class="brief-checklist"><strong>Что проверить:</strong><ul>' +
          b.checklist.slice(0, 4).map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') +
        '</ul></div>')
      : '';
    var tagsHtml = b.impactTags && b.impactTags.length
      ? ('<div class="impact-tags">' + b.impactTags.map(function (tag) {
          return '<span class="tag tag-importance">' + escapeHtml(tag) + '</span>';
        }).join('') + '</div>')
      : '';
    return (
      '<article class="glass brief-card magic-bento-card magic-bento-card--border-glow ' + escapeHtml(impClass) + '" ' +
        'data-brief-id="' + escapeHtml(b.id) + '" tabindex="0" role="button" ' +
        'aria-label="Открыть материал: ' + escapeHtml(b.title) + '">' +
        '<div class="brief-meta">' + renderBriefMetaHtml(b) + '</div>' +
        '<h3 class="brief-title">' + escapeHtml(b.title) + '</h3>' +
        '<p class="brief-summary">' + escapeHtml(getBriefDisplayTeaser(b)) + '</p>' +
        whyHtml +
        checklistHtml +
        tagsHtml +
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
      ? 'Только новости рынка и инвестиций: Мосбиржа, Банк России, РБК, Интерфакс, Smart-Lab. Обновление каждые 5 мин.'
      : (BRIEFS_SOURCE === 'demo'
        ? 'Сейчас не удалось загрузить ленту — показаны примеры материалов. Обновите страницу через минуту.'
        : (state.briefsLoading
          ? 'Загружаем ленту из новостных источников… Пока показаны примеры.'
          : (BRIEFS_SOURCE === 'loading'
            ? 'Не удалось обновить ленту — показаны примеры. Обновите страницу.'
            : 'Загружаем ленту из новостных источников…')));
    if (scope === 'mine') {
      if (positions.length) {
        return escapeHtml('Сводка по интересующим бумагам: ' + positions.join(', ') + '.') +
          '<br>' + escapeHtml(sourceLine);
      }
      return escapeHtml('Добавьте интересующие позиции, чтобы видеть только релевантные события.') +
        '<br>' + escapeHtml(sourceLine);
    }
    return escapeHtml('Сейчас показана общая сводка по выбранным рынкам. Добавьте интересующие позиции, чтобы видеть только релевантные события.') +
      '<br>' + escapeHtml(sourceLine);
  }

  function renderNewsMarketFilterTabs() {
    var el = document.getElementById('newsMarketFilterTabs');
    var wrap = el ? el.closest('.briefing-market-filter') : null;
    if (!el) return;
    var markets = typeof Markets !== 'undefined' ? Markets.getMarketsEnabled() : { ru: true, us: false };
    if (!markets.ru && !markets.us) {
      if (wrap) wrap.hidden = true;
      return;
    }
    if (wrap) wrap.hidden = false;
    if (markets.ru && markets.us) {
      if (typeof Markets !== 'undefined' && Markets.normalizeNewsMarketFilter) {
        state.newsMarketFilter = Markets.normalizeNewsMarketFilter(state.newsMarketFilter, markets);
      } else if (state.newsMarketFilter !== 'RU' && state.newsMarketFilter !== 'US' && state.newsMarketFilter !== 'all') {
        state.newsMarketFilter = 'all';
      }
      el.querySelectorAll('[data-news-market]').forEach(function (btn) {
        btn.hidden = false;
        btn.classList.toggle('active', btn.getAttribute('data-news-market') === (state.newsMarketFilter || 'all'));
      });
      return;
    }
    el.querySelectorAll('[data-news-market]').forEach(function (btn) {
      var code = btn.getAttribute('data-news-market');
      if (code === 'all') {
        btn.hidden = true;
        return;
      }
      if (markets.ru && !markets.us) btn.hidden = code === 'US';
      else if (markets.us && !markets.ru) btn.hidden = code === 'RU';
      else btn.hidden = false;
      btn.classList.toggle('active', (markets.ru && code === 'RU') || (markets.us && code === 'US'));
    });
    if (!markets.ru || !markets.us) {
      state.newsMarketFilter = markets.us && !markets.ru ? 'US' : 'RU';
    }
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
    renderNewsMarketFilterTabs();
    if (typeof renderMarketMacro === 'function') renderMarketMacro();
    if (hint) {
      hint.innerHTML = '<p class="briefing-data-notice hint-frame">' + getBriefingHintHtml() + '</p>';
    }
    if (!topEl && !myEl) {
      if (legacyEl) {
        renderBriefListInto(legacyEl, filterBriefsForBriefing(), 'Нет материалов сводки за выбранный горизонт.');
      }
      initBriefingBento();
      updateStats();
      if (typeof renderAgentSection === 'function') renderAgentSection();
      return;
    }
    var base = filterBriefsForBriefing();
    renderTodayCategoryCards(base);
    var positions = getPositionTickers();
    var topList = sortBriefsByImportance(base).slice(0, 5);
    var myList = sortBriefsByImportance(filterBriefsForPositions(base, positions)).slice(0, 12);
    renderBriefListInto(topEl, topList, 'Нет главных событий за выбранный горизонт.');
    renderBriefListInto(myEl, myList, positions.length
      ? 'Нет новостей по интересующим бумагам за этот период.'
      : 'Добавьте интересующие позиции в список — здесь появятся связанные новости.');
    initBriefingBento();
    updateStats();
    if (typeof renderAgentSection === 'function') renderAgentSection();
  }

  var TODAY_CATEGORIES = [
    'Макроэкономика',
    'Российский рынок',
    'Международные рынки',
    'Сырьё',
    'Валюта',
    'Сводка по интересующим бумагам'
  ];

  function inferBriefCategory(b) {
    if (b.category && TODAY_CATEGORIES.indexOf(b.category) >= 0) return b.category;
    var t = ((b.title || '') + ' ' + (b.summary || '')).toLowerCase();
    var source = String(b.sourceName || '').toLowerCase();
    if (b.feedId === 'cbr_currency' || source.indexOf('валют') >= 0) return 'Валюта';
    if (b.feedId === 'rbc_world') return 'Международные рынки';
    if (b.market === 'US') return 'Международные рынки';
    if (/(s&p|nasdaq|dow jones|wall street|евросоюз|евроцентробанк|ecb\b|фрс\b|fed\b|opec|опек|китай.*рын|япон.*рын)/.test(t)) {
      return 'Международные рынки';
    }
    if (/(нефт|brent|urals|газпром|газ\b|золот|серебр|металл|паллад|никел|алюмин|угл|сырь)/.test(t)) return 'Сырьё';
    if (/(рубл|доллар|евро|юан|валют|курс валют|forex)/.test(t)) return 'Валюта';
    if (source.indexOf('банк росс') >= 0 || b.feedId === 'cbr' || b.feedId === 'cbr_press') return 'Макроэкономика';
    if (/(ставк|цб |банк росс|инфляц|минфин|офз|ключев|макроэкон|ввп|денежно-кредит)/.test(t)) return 'Макроэкономика';
    return 'Российский рынок';
  }



  function categoryMatchScore(b, cat) {
    if (!b || !cat) return 0;
    if ((b.category || inferBriefCategory(b)) === cat) return 10;
    var t = ((b.title || '') + ' ' + (b.summary || '')).toLowerCase();
    var rules = {
      'Макроэкономика': /(ставк|цб|инфляц|минфин|офз|ключев|макро|ввп|аукцион)/,
      'Российский рынок': /(акци|мосбирж|moex|imoex|эмитент|ipo|дивиденд|отчёт|отчет|бирж)/,
      'Международные рынки': /(s&p|nasdaq|фрс|fed|евросоюз|китай|япон|wall street|международ)/,
      'Сырьё': /(нефт|brent|urals|газ|золот|металл|сырь)/,
      'Валюта': /(рубл|доллар|евро|юан|валют|курс)/
    };
    return rules[cat] && rules[cat].test(t) ? 5 : 0;
  }

  function inferImpactTags(b) {
    if (b.impactTags && b.impactTags.length) return b.impactTags;
    var t = ((b.title || '') + ' ' + (b.summary || '')).toLowerCase();
    var tags = [];
    if (/(дивиденд|выплат|отсечк)/.test(t)) tags.push('Дивиденды');
    if (/(отч[её]т|мсфо|рсбу|прибыл|выручк)/.test(t)) tags.push('Отчётность');
    if (/(санкц|риск|волатиль|давлен)/.test(t)) tags.push('Риск');
    if (/(таргет|оценк|рейтинг|мультипликатор)/.test(t)) tags.push('Оценка');
    if (/(ставк|цб|инфляц|фрс)/.test(t)) tags.push('Макро');
    if (/(рубл|доллар|евро|юан|валют)/.test(t)) tags.push('Валюта');
    if (/(нефт|газ|золот|металл|сырь)/.test(t)) tags.push('Сырьё');
    return tags.length ? tags.slice(0, 3) : ['Макро'];
  }

  function inferChecklist(b) {
    if (b.checklist && b.checklist.length) return b.checklist;
    var tags = inferImpactTags(b);
    var out = [];
    if (tags.indexOf('Дивиденды') >= 0) out.push('проверить дату отсечки');
    if (tags.indexOf('Отчётность') >= 0) out.push('сверить показатели с консенсусом');
    if (tags.indexOf('Оценка') >= 0) out.push('сравнить мультипликаторы с сектором');
    if (tags.indexOf('Макро') >= 0) out.push('оценить влияние ставки и инфляции');
    if (tags.indexOf('Валюта') >= 0) out.push('проверить чувствительность к курсу');
    if (tags.indexOf('Сырьё') >= 0) out.push('сверить динамику сырья и маржи');
    if (!out.length) out.push('проверить первоисточник');
    return out.slice(0, 4);
  }

  function inferWhyImportant(b) {
    if (b.whyImportant) return b.whyImportant;
    var tags = inferImpactTags(b);
    if (tags.indexOf('Дивиденды') >= 0) return 'Событие влияет на ожидаемую дивидендную доходность и интерес к бумаге перед отсечкой.';
    if (tags.indexOf('Отчётность') >= 0) return 'Публикация результатов меняет ожидания по прибыли и справедливой оценке компании.';
    if (tags.indexOf('Макро') >= 0) return 'Новость задаёт общий фон риск-аппетита и стоимость капитала для рынка.';
    return 'Новость может изменить оценку рисков и сценарий по бумаге в ближайшие сессии.';
  }

  function enrichBriefAnalytics(b) {
    var next = Object.assign({}, b);
    next.category = inferBriefCategory(next);
    next.impactTags = inferImpactTags(next);
    next.checklist = inferChecklist(next);
    next.whyImportant = inferWhyImportant(next);
    return next;
  }

  function renderTodayCategoryCards(briefs) {
    var el = document.getElementById('todayMarketCategories');
    if (!el) return;
    var positions = getPositionTickers();
    var enriched = briefs.map(enrichBriefAnalytics);
    var grouped = {};
    var usedInCategory = {};
    TODAY_CATEGORIES.forEach(function (c) { grouped[c] = []; });

    function pushToCategory(b, cat) {
      if (!grouped[cat] || grouped[cat].length >= 3) return;
      var key = b.id || b.sourceUrl;
      var slotKey = cat + ':' + key;
      if (usedInCategory[slotKey]) return;
      grouped[cat].push(b);
      usedInCategory[slotKey] = true;
    }

    enriched.forEach(function (b) {
      pushToCategory(b, b.category || inferBriefCategory(b));
    });

    var contentCats = TODAY_CATEGORIES.filter(function (c) { return c !== 'Сводка по интересующим бумагам'; });
    contentCats.forEach(function (cat) {
      var pool = enriched.slice().sort(function (a, b) {
        return categoryMatchScore(b, cat) - categoryMatchScore(a, cat);
      });
      pool.forEach(function (b) {
        if (grouped[cat].length >= 3) return;
        if (categoryMatchScore(b, cat) > 0) pushToCategory(b, cat);
      });
      pool.forEach(function (b) {
        if (grouped[cat].length >= 3) return;
        pushToCategory(b, cat);
      });
    });

    enriched.forEach(function (b) {
      if (positions.indexOf(normalizeTicker(b.ticker)) >= 0) {
        pushToCategory(b, 'Сводка по интересующим бумагам');
      }
    });
    el.innerHTML = TODAY_CATEGORIES.map(function (cat) {
      var items = grouped[cat] || [];
      return '<article class="news-category-card"><h4>' + escapeHtml(cat) + '</h4>' +
        (items.length
          ? '<ul>' + items.slice(0, 3).map(function (b) {
              return '<li>' + escapeHtml(b.title) + '</li>';
            }).join('') + '</ul>'
          : '<p class="muted">Событий пока нет</p>') +
      '</article>';
    }).join('');
  }

  var ARTICLE_READ_LABEL = 'Читать →';

  function estimateArticleReadMinutesLabel(bodyHtml) {
    if (typeof window !== 'undefined' && typeof window.estimateArticleReadMinutesLabel === 'function') {
      return window.estimateArticleReadMinutesLabel(bodyHtml);
    }
    var html = String(bodyHtml || '');
    var text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    var wordCount = text.split(/\s+/).filter(Boolean).length;
    var tables = (html.match(/<table/gi) || []).length;
    var minutes = Math.max(1, Math.ceil(wordCount / 170 + tables * 1.25));
    var low = Math.max(1, minutes - 1);
    var high = minutes + (tables >= 4 ? 2 : 1);
    if (low >= high) return high + ' минут';
    return low + '–' + high + ' минут';
  }

  function formatArticleReadTimeLabel(article) {
    if (!article) return '';
    if (article.readMinutesLabel) {
      return 'время прочтения/время ознакомления: ' + article.readMinutesLabel;
    }
    if (article.bodyHtml) {
      var estimated = estimateArticleReadMinutesLabel(article.bodyHtml);
      if (estimated) {
        return 'время прочтения/время ознакомления: ' + estimated;
      }
    }
    var m = Number(article.readMinutes);
    if (!m || m < 1) return '';
    var word = (m % 10 === 1 && m % 100 !== 11) ? 'минута'
      : (m % 10 >= 2 && m % 10 <= 4 && (m % 100 < 10 || m % 100 >= 20)) ? 'минуты'
      : 'минут';
    return 'время прочтения/время ознакомления: ' + m + ' ' + word;
  }

  function isReadingTimeBadge(text) {
    return /\d+[\s–-]*\d*\s*минут/i.test(String(text || ''));
  }

  function getArticleBadges(article) {
    var chips = [];
    if (article.badges && article.badges.length) {
      chips = article.badges.filter(function (b) { return !isReadingTimeBadge(b); });
    } else {
      if (article.riskLevel) {
        var r = String(article.riskLevel);
        if (/риск/i.test(r) || r === 'Смешанный профиль') chips.push(r);
        else chips.push(r + ' риск');
      }
      if (article.horizon) chips.push(article.horizon);
    }
    var readLabel = formatArticleReadTimeLabel(article);
    if (readLabel) chips.push(readLabel);
    return chips;
  }

  function renderArticleMetaChips(badges) {
    if (!badges || !badges.length) return '';
    return '<div class="article-meta">' + badges.map(function (b) {
      var readCls = String(b).indexOf('время прочтения/время ознакомления') === 0
        ? ' article-meta-chip--read-time' : '';
      return '<span class="article-meta-chip' + readCls + '">' + escapeHtml(b) + '</span>';
    }).join('') + '</div>';
  }

  function renderArticleCard(article) {
    var desc = article.summary || article.subtitle || '';
    return '<article class="article-card" data-article-id="' + escapeHtml(article.id) + '">' +
      '<h4>' + escapeHtml(article.title) + '</h4>' +
      '<p>' + escapeHtml(desc) + '</p>' +
      renderArticleMetaChips(getArticleBadges(article)) +
      '<button type="button" class="primary article-card-btn" data-open-article="' + escapeHtml(article.id) + '">' +
        ARTICLE_READ_LABEL +
      '</button>' +
    '</article>';
  }

  function renderArticleFeatured(article) {
    var desc = article.summary || article.subtitle || '';
    return '<article class="article-featured" data-article-id="' + escapeHtml(article.id) + '">' +
      '<h3 class="article-featured-title">' + escapeHtml(article.title) + '</h3>' +
      '<p class="article-featured-desc">' + escapeHtml(desc) + '</p>' +
      renderArticleMetaChips(getArticleBadges(article)) +
      '<button type="button" class="primary article-card-btn" data-open-article="' + escapeHtml(article.id) + '">' +
        ARTICLE_READ_LABEL +
      '</button>' +
    '</article>';
  }

  function bindArticleOpenHandlers(root) {
    if (!root) return;
    root.querySelectorAll('[data-open-article]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openArticleModal(btn.getAttribute('data-open-article'));
      });
    });
  }

  function renderArticlesBlock() {
    var list = (typeof window !== 'undefined' && window.EDUCATIONAL_ARTICLES) ? window.EDUCATIONAL_ARTICLES : [];
    var featured = list.find(function (a) { return a.featured; });
    var rest = list.filter(function (a) { return !a.featured; });

    var featuredEl = document.getElementById('articlesFeatured');
    if (featuredEl) {
      featuredEl.innerHTML = featured ? renderArticleFeatured(featured) : '';
      bindArticleOpenHandlers(featuredEl);
    }

    var navList = document.getElementById('articlesNavList');
    if (navList) {
      navList.innerHTML = rest.length
        ? rest.map(renderArticleCard).join('')
        : '<p class="muted">Материалы будут добавлены позже.</p>';
      bindArticleOpenHandlers(navList);
    }
  }

  function openArticleModal(id) {
    var list = (typeof window !== 'undefined' && window.EDUCATIONAL_ARTICLES) ? window.EDUCATIONAL_ARTICLES : [];
    var article = list.find(function (a) { return a.id === id; });
    if (!article) return;
    var modal = document.getElementById('articleModal');
    var title = document.getElementById('articleModalTitle');
    var body = document.getElementById('articleModalBody');
    if (!modal || !title || !body) return;
    title.textContent = article.title;
    body.innerHTML = article.bodyHtml || '<p>Материал готовится.</p>';
    modal.hidden = false;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeArticleModal() {
    var modal = document.getElementById('articleModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.hidden = true;
    document.body.style.overflow = '';
  }



  function renderBriefing() {
    renderHomePage();
  }



  function applyFeedFilters(briefs) {
    var f = getFilters();
    var wl = getWatchlist().map(function (item) {
      var n = typeof Markets !== 'undefined' ? Markets.normalizeWatchlistItem(item) : { ticker: item };
      return normalizeTicker(n && n.ticker);
    });
    var q = (f.search || '').toLowerCase();
    var filtered = briefs.map(normalizeBriefMarket);
    if (typeof Markets !== 'undefined') filtered = Markets.filterBriefsByMarket(filtered);
    filtered = filtered.filter(function (b) {
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


