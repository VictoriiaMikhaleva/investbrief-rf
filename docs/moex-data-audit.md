# Технический аудит работы InvestBrief РФ с данными Московской Биржи

**Дата аудита:** 28.08.2026  
**Метод:** только чтение кода, конфигов, `data/*.json` и GitHub Actions. Сетевых запросов к MOEX / ISS не выполнялось. Runtime-код не изменялся.

> Это технический аудит реализации проекта и предварительная техническая гипотеза по возможным режимам использования данных. Это не юридическое заключение и не вывод о необходимости или отсутствии необходимости заключения договора с MOEX.

---

## 1. Краткое резюме архитектуры

Сервис — статическое SPA на GitHub Pages. Рыночные котировки в production (`*.github.io`) браузер пользователя запрашивает **напрямую** с публичного ISS: `https://iss.moex.com/iss/...` через `fetch` (`moex.js` → `moexFetchJson`). Axios, XMLHttpRequest, WebSocket, EventSource не используются.

Параллельно GitHub Action `update-market-data` (~каждые 5 минут) ходит в тот же ISS **на сервере CI**, пишет снимки в `data/*.json` и публикует их вместе с сайтом. Браузер сначала пытается live ISS, при ошибке показывает snapshot. Снимки одинаковы для всех посетителей.

Серверная аналитика (`Firebase getAnalytics` / локальный `GET /api/analytics/:ticker`) сама ходит в ISS, считает метрики в `analytics-core.js` и отдаёт JSON клиенту. На GitHub Pages этот канал **выключен** (`analytics.js`: `hostname` ends with `github.io` → `shouldUseServerAnalytics() === false`). Пользователь Pages считает аналитику в браузере, снова дергая ISS.

Задержки ISS в коде **не задаются** (нет параметра `iss.delay` и нет отдельного delayed-хоста). Комментарии говорят «live», UI пишет «данные могут отображаться с задержкой». **По коду невозможно определить фактическую задержку** публичного ISS.

Слои:

| Слой | Кто ходит в ISS | Куда попадают данные |
|------|----------------|----------------------|
| Браузер Pages | каждый пользователь | UI + `localStorage` `ibrf.moex.*` |
| GitHub Actions | общий CI | `data/*.json` → все посетители |
| Firebase `getAnalytics` | Cloud Function | ответ API клиенту; in-memory TTL 15 мин |
| Firebase `dataWatchdogHourly` | Cloud Function | Firestore `meta/watchdog` (health, не котировки) |
| Yandex Cloud Function | пользовательские настройки | **запрещает** сохранять quotes/snapshots |

Новости `moex.com/export/news.aspx` — RSS публикаций, не ISS quotes.

---

## 2. Все найденные MOEX endpoints

База: `MOEX_ISS = https://iss.moex.com/iss`. Метод везде **GET**. Секретов в URL нет.

### 2.1. Браузер (production Pages)

| # | Раздел | Файл / функция | Шаблон endpoint | Параметры | Что | Когда | Где | Fallback | Кэш | Дальше |
|---|--------|----------------|-----------------|-----------|-----|-------|-----|----------|-----|--------|
| 1 | Котировка бумаги/индекса/ОФЗ | `moex.js` `moexMarketdataUrl` + `fetchMoexQuote` | `/engines/{engine}/markets/{market}/boards/{board}/securities/{secid}.json` (индекс без `/boards/`) | `iss.only=marketdata,securities`, `iss.meta=off` | LAST и запасные ценовые поля, VALTODAY, % дня | загрузка плиток, портфель, аналитика, агент, ОФЗ-карточка | браузер | US → Yahoo; облигации — цепочка полей | `ibrf.moex.last.{ticker}` 5 мин | UI цена/%, mark-to-market, агент |
| 2 | История цены (свечи) | `moex.js` `fetchMoexHistory` | `/engines/.../securities/{secid}/candles.json` | `from`, `till`, `interval` (60=час для «день», 24=день иначе), `start` | `candles.close`, `candles.begin` | графики, агент неделя/месяц, портфель | браузер | нет | `ibrf.moex.candles.v4.{ticker}.{horizon}` 15 мин (год/5л — 30 мин) | график; последняя точка может подмениться LAST |
| 3 | Топ‑20 оборота | `moex.js` `fetchTopMoexSharesByVolumeDirect` | `/engines/stock/markets/shares/boards/TQBR/securities.json` | `securities.columns=SECID,SHORTNAME`; `marketdata.columns=SECID,LAST,VALTODAY,LASTTOPREVPRICE`; `sort_column=VALTODAY&sort_order=desc&limit=60+` | LAST, VALTODAY, LASTTOPREVPRICE | загрузка сводки + таймер 60 с | браузер | `data/top-turnover.json` | `ibrf.moex.moex.topvol.20` 60 с | карточки топ‑20 |
| 4 | Оборот IMOEX 10д | `fetchImoexTurnoverWeekDirect` | `/history/engines/stock/markets/index/securities/IMOEX.json` | `from`, `till`, `history.columns=TRADEDATE,VALUE`, `start` | дневной VALUE | сводка | браузер | snapshot в `top-turnover.json` | `imoex.turnover.v10` 5 мин | столбцы оборота |
| 5 | VALTODAY IMOEX сессии | `fetchImoexValTodayLive` | `/engines/stock/markets/index/securities/IMOEX.json` | `marketdata.columns=SECID,VALTODAY,TRADEDATE,TRADE_SESSION_DATE,UPDATETIME` | VALTODAY сессии | сводка | браузер | история без live-столбца | `imoex.valtoday` 5 мин | последний столбец графика оборота |
| 6 | FX CETS | `fetchMoexFxSpot` | `/engines/currency/markets/selt/boards/CETS/securities/{USD000UTSTOM\|EUR_RUB__TOM\|CNYRUB_TOM}.json` (+ alt SECID) | LAST, LASTTOPREVPRICE, PREVPRICE, OPEN, MARKETPRICE, … | спот USD/EUR/CNY | макро-плитки, таймер 5 мин | браузер | ЦБ `cbr-xml-daily.ru` | `moex.fx.{code}` 2 мин | макро |
| 7 | FORTS | `fetchMoexFortsRows` | `/engines/futures/markets/forts/securities.json` | `SECID,SHORTNAME,ASSETCODE` + `LAST,LASTTOPREVPRICE,VALTODAY`, paging `start/limit=100` | LAST нефти/металлов/кофе/какао | макро | браузер | нет отдельного JSON | `forts.rows` 15 мин | макро-плитки |
| 8 | Поиск бумаг | `searchMoexSecurities` | `/securities.json` | `q=`, `columns=secid,shortname,...`, `limit=30` | справочник | ввод в поиске | браузер | локальный `TICKER_SUBTITLES` | `search.{q}` 10 мин | автокомплит |
| 9 | Имя бумаги | `fetchMoexTickerName` | `/securities/{ticker}.json` | `iss.meta=off` | SHORTNAME/SECNAME | подписи карточек | браузер | локальная карта имён | `ibrf.tickerNames` | UI |
| 10 | ОФЗ каталог TQOB | `ofz.js` `fetchOfzBondCatalogDirect` | `/engines/stock/markets/bonds/boards/TQOB/securities.json` | securities: SECID,SHORTNAME,COUPONPERCENT,MATDATE,COUPONPERIOD,FACEVALUE,COUPONVALUE,NEXTCOUPON,ACCRUEDINT; marketdata: LAST,YIELDATWAPRICE,VALTODAY,DURATION,UPDATETIME; `limit=500` | каталог + YTM/оборот | вкладка ОФЗ | браузер | `data/ofz.json`, hard fallback | `ofz.catalog` (через moex cache) | таблица/график ОФЗ |
| 11 | ОФЗ мета | `fetchOfzSecurityMeta` | `/securities/{secid}.json` | `iss.only=securities,description` | FACEVALUE, купон, MATDATE | карточка выпуска | браузер | preset каталога | нет отдельного | карточка |
| 12 | Купонный календарь | `fetchOfzCouponSchedule` | `/securities/{secid}/bondization.json` | `iss.only=coupons`, `limit=500` | coupondate, value, valueprc | карточка ОФЗ | браузер | нет | нет | график купонов |
| 13 | Дивиденды | `analytics.js` `fetchMoexDividends` | `/securities/{ticker}/dividends.json` | `iss.meta=off` | registryclosedate, value | аналитика / карточки KPI | браузер | `data/dividend-patches.json` | составной кэш аналитики 30 мин | график/список див. |
| 14 | История акций EOD | `fetchMoexShareHistoryRange` | `/history/engines/stock/markets/shares/boards/{TQTF\|TQBR}/securities/{ticker}.json` | `from`, `till`, `history.columns=TRADEDATE,CLOSE,VALUE`, `start` | CLOSE, VALUE по дням | аналитика (клиент) | браузер | нет | `ibrf.analytics.v*` | divAvg5y, TR, оборот года |
| 15 | Оборот агента | `agent.js` `fetchAgentDailyTurnover` | `/history/.../boards/TQBR/securities/{ticker}.json` | TRADEDATE, VALUE, ~14 дней | дневной VALUE | цикл агента | браузер | `data/agent-signals.json` | нет отдельного | отношение оборот/среднее |
| 16 | БПИФ last | `pif.js` `fetchBpifLive` | `/engines/stock/markets/shares/boards/TQBR/securities/{t}/marketdata.json` | LAST,VALTODAY,SPREAD,BID,OFFER,SYSTIME | LAST, VALTODAY (**BID/OFFER в ответе не используются**) | открытие карточки БПИФ | браузер | цена пая с сайта УК | нет | KPI «Цена MOEX», оборот |
| 17 | iNAV БПИФ | `pif.js` | `/engines/stock/markets/index/securities/{inavSecid}/marketdata.json` | CURRENTVALUE, SYSTIME | iNAV | карточка БПИФ | браузер | нет | нет | KPI iNAV + премия |
| 18 | RSS новости | `news.js` | `https://www.moex.com/export/news.aspx?limit=40&lang=ru` | lang, limit | заголовки новостей | загрузка ленты + интервал | браузер (часто через `/api/rss` прокси) | другие RSS / DEMO | `ibrf.liveBriefs.v5` 5 мин | лента |

Переменные шаблонов: `engine` ∈ {stock, currency, futures}; `market` ∈ {shares, bonds, index, selt, forts}; `board` ∈ {TQBR, TQOB, TQTF, CETS, SMAL}; `secid`/`ticker`; `horizon` → interval/from/till.

### 2.2. CI / скрипты (сервер)

| # | Файл | Endpoint (как в коде) | Расписание | Куда |
|---|--------|----------------------|------------|------|
| 19 | `scripts/update-market-data.js` | TQBR top VALTODAY; IMOEX history VALUE; IMOEX VALTODAY; IMOEX CURRENTVALUE+LASTCHANGEPRC; TQOB каталог; TQBR candles interval=24 для агента | cron `*/5 * * * *` + workflow_dispatch | `data/top-turnover.json`, `market-snapshot.json`, `ofz.json`, `agent-signals.json` |
| 20 | `scripts/build-pif-data.js` | `/engines/stock/markets/shares/securities.json` LAST,VALTODAY,SPREAD (фильтр имени «БПИФ») | вручную `npm run build:pif` | поля тикера в `pif-*.json` |
| 21 | `scripts/update-dividend-patches.js` | `/securities/{ticker}/dividends.json` | workflow дивидендов | сверка; патчи пишет из Smart-Lab |
| 22 | `scripts/test-analytics.mjs`, `smoke-health.mjs`, `test-agent.mjs` | те же ISS URL | CI / вручную | не в UI |

### 2.3. Backend

| # | Файл | Endpoint | Когда | Примечание |
|---|------|----------|-------|------------|
| 23 | `functions/lib/moex-fetch.js` | dividends; history TQTF+TQBR CLOSE+VALUE; TQBR marketdata LAST,LASTTOPREVPRICE,VALTODAY | запрос `getAnalytics` / `npm start` | in-memory 15 мин |
| 24 | `functions/index.js` watchdog | IMOEX LAST; FORTS LAST; GAZP history TRADEDATE | hourly | Firestore health |
| 25 | `server/server.js` | не ходит в MOEX сам; вызывает `buildTickerAnalytics` | `npm start` | тот же слой, что Firebase |
| 26 | `yandex-cloud/investbrief-api` | **нет ISS** | sync пользователя | явно запрещает quotes |

Сторонний прокси котировок (кроме RSS `/api/rss`) не найден. Yahoo — только US, не MOEX.

---

## 3. Публичные JSON / snapshot с данными MOEX

CSV нет. Все ниже лежат в корне Pages и доступны по прямой ссылке (`/investbrief-rf/data/...`).

| Файл | Содержимое, связанное с MOEX | `updatedAt` / source (на момент аудита файлов) | Персональных данных |
|------|------------------------------|--------------------------------------------------|---------------------|
| `data/top-turnover.json` | top[20]: ticker, name, price←LAST, valToday←VALTODAY, changePct←LASTTOPREVPRICE; turnoverWeek IMOEX VALUE | CI ~5 мин, source «MOEX ISS» | нет |
| `data/market-snapshot.json` | imoex.price←CURRENTVALUE, imoex.changePct←LASTCHANGEPRC; fx может быть ЦБ | CI, «MOEX ISS + CBR» | нет |
| `data/ofz.json` | каталог TQOB: last, yieldPct←YIELDATWAPRICE, vol, duration, купоны | CI | нет |
| `data/agent-signals.json` | cards: currentPrice, dayChangePct, weekChangePct, обороты, сигналы | CI, построен из ISS + candles | нет |
| `data/dividend-patches.json` | не ISS; Smart-Lab + раскрытие, **дополнение** к dividends.json | ручной/CI дивидендов | нет |
| `data/pif-index.json`, `pif-archive.json`, `pif-disclosure.json` | реестр ЦБ; тикеры БПИФ могут быть сматчены с MOEX на этапе build | build:pif | нет |
| `data/pif-uk.json` | сайты УК, не ISS | — | нет |

Технически snapshot — **одна копия на всех пользователей** (повторная выдача ранее полученного ISS).

---

## 4. Таблица «данные → что видит пользователь»

| Данные | Исходное поле ISS | Что на экране | Где | Режим |
|--------|-------------------|---------------|-----|--------|
| Цена акции/ETF | LAST (иначе LCURRENTPRICE → LEGALCLOSEPRICE → CURRENTVALUE → MARKETPRICETODAY → MARKETPRICE → WAPRICE → CLOSEPRICE) | число ₽ | топ‑20, плитки, аналитика, портфель, БПИФ «Цена MOEX» | **A** (с цепочкой fallback) |
| % за день топ‑20 | LASTTOPREVPRICE | «+1,10%» | карточки топ‑20 | **A** |
| % за день quote | чаще **пересчёт** (LAST−PREVPRICE)/PREVPRICE | «+x%» | плитки, портфель, агент | **C** (если нет prev — LASTCHANGE / OPEN) |
| Оборот сессии | VALTODAY | «N млрд ₽» | топ‑20, БПИФ, агент | **A** |
| IMOEX уровень | CURRENTVALUE (snapshot) или LAST-цепочка quote | число индекса | плитка IMOEX | **A** |
| Оборот IMOEX день | history VALUE / live VALTODAY | столбцы млрд ₽ | сводка | **A** |
| USD/EUR/CNY | LAST CETS | курс | макро | **A** (иначе ЦБ) |
| FORTS LAST | LAST | нефть/Au/… | макро | **A** |
| ОФЗ last | LAST | цена | таблица ОФЗ | **A** |
| ОФЗ YTM | YIELDATWAPRICE | % | таблица/график | **A** (имя в UI — доходность) |
| НКД | ACCRUEDINT | в карточке | ОФЗ | **A** |
| Купон % | COUPONPERCENT | % | ОФЗ | **A** |
| Дюрация | DURATION | дни | ОФЗ | **A** |
| Дивиденд на акцию | dividends.value | ₽ в списке/графике | аналитика | **A** |
| Свечи | candles.close | линия графика | аналитика/портфель | **A** (последняя точка может быть LAST) |
| iNAV | CURRENTVALUE | KPI | БПИФ | **A** |
| Премия к iNAV | (LAST−iNAV)/iNAV | % | БПИФ | **C** |
| divAvg5y | Σ дивидендов / средняя CLOSE года | % | карточка/аналитика | **C** |
| Прогноз 12м | сумма объявленных/paid12m | ₽ или «пусто» | аналитика | **C** |
| Полная доходность 12м | CLOSE якоря + сумма див. | % | аналитика | **C** |
| Зона внимания | пороги на % и VALTODAY | заголовок + факт в тексте | агент | **C** (+ в тексте есть исходный %) |
| PnL портфеля | qty × (LAST − avgPrice пользователя) | ₽ / % | портфель | **C** |
| BID/OFFER | запрашиваются у БПИФ | **не выводятся** | — | **B** |
| SPREAD | в build-pif | в runtime UI не найден показ | — | **B** |
| RSS MOEX | не ISS | заголовок новости | лента | не котировка |

---

## 5. Исходные / внутренние / расчётные

### Поля ISS, реально читаемые кодом

| Поле | Откуда | Использование | Пользователю | Как | UI |
|------|--------|---------------|--------------|-----|-----|
| LAST | marketdata shares/bonds/index/selt/forts | цена | да | исходное (если есть) | цены |
| LASTTOPREVPRICE | TQBR top, FORTS, CETS | % дня топ‑20 / макро | да | исходное | топ‑20, FORTS |
| PREVPRICE / PREVWAPRICE | securities/marketdata | знаменатель % | косвенно | расчёт | % |
| OPEN / OPENPRICE | marketdata | fallback % | нет прямо | расчёт | % |
| LEGALCLOSEPRICE, MARKETPRICE, MARKETPRICETODAY, WAPRICE, CLOSEPRICE, LCURRENTPRICE, CURRENTVALUE | marketdata | fallback цены; IMOEX snapshot = CURRENTVALUE | да, как «цена» | исходное выбранное | цена |
| LASTCHANGE, LASTCHANGEPRCNT, CHANGEPRCNT | marketdata | fallback % | как % | смесь | % |
| LASTCHANGEPRC | IMOEX snapshot | % IMOEX | да | исходное | плитка |
| VALTODAY / VALTODAY_RUR / VALUE | marketdata / history | оборот | да | исходное | топ, графики, БПИФ |
| TRADEDATE, TRADE_SESSION_DATE, UPDATETIME, SYSTIME | marketdata | дата сессии, stale | подпись «на дату» | исходное | подписи |
| CLOSE (history) | history | средняя CLOSE года, TR, график объёма | CLOSE как цена графика аналитики (через history); средняя не показывается | CLOSE — A на графике; средняя — C | аналитика |
| candles.close / begin | candles | график | да | исходное | графики |
| SECID, SHORTNAME, SECNAME, group, boardid | securities | идентификация | тикер/имя | исходное | везде |
| YIELDATWAPRICE, YIELD, YIELDLASTCOUPON | bonds | YTM | да | исходное | ОФЗ |
| DURATION | bonds | дюрация | да | исходное | ОФЗ |
| COUPONPERCENT, COUPONVALUE, COUPONPERIOD, NEXTCOUPON, MATDATE, FACEVALUE, ACCRUEDINT | bonds | параметры | да | исходное | ОФЗ |
| coupondate, value, valueprc | bondization | график купонов | да | исходное | ОФЗ |
| registryclosedate, value | dividends | выплаты | да | исходное | аналитика |
| ASSETCODE | FORTS | выбор нефти/Au | нет | внутреннее | — |
| BID, OFFER, SPREAD | BPIF marketdata | запрошены | нет (кроме возможного spread в build) | внутреннее | — |
| ISIN, REGNUMBER | BPIF build | матчинг ЦБ↔тикер | косвенно | внутреннее | каталог ПИФ |

### Режим C — расчётные показатели

| Показатель | Формула / алгоритм (как в коде) | Входы | UI | Восстановить исходное поле? | Рядом исходное? |
|------------|----------------------------------|-------|-----|------------------------------|-----------------|
| % дня (quote) | `(LAST − PREVPRICE) / PREVPRICE × 100` | LAST, PREVPRICE | плитки, портфель | нет однозначно | цена да |
| divAvg5y | для каждого отчётного года: Σ выплат / **средняя CLOSE** года; среднее по годам с валидным yield | dividends.value, history.CLOSE | KPI «див. 5л» | нет | список выплат да |
| Прогноз 12м | сумма объявленных дат вперёд 12м, иначе paid12m; null если последняя выплата >18 мес | dividends | KPI прогноз | частично | список дат да |
| totalReturn12m | `(endCLOSE + Σдив12м − startCLOSE) / startCLOSE × 100` | CLOSE якорей, dividends | «полн. доходн. 12м» | нет | нет CLOSE якорей |
| Оборот года (график) | history.VALUE по дням, срез ~252 дня | VALUE | график оборота | VALUE дня ≈ столбец | да как столбцы |
| Агент day/week | сравнение % с порогом 3/7/8% (настройки) | LASTTOPREVPRICE или пересчёт, candles | зона | в тексте есть % | цена на карточке |
| Агент оборот | `VALTODAY / avg(VALUE 7д) ≥ multiplier` | VALTODAY, VALUE | зона | нет среднего | оборот дня может быть |
| Агент month high/low | цена vs 15% диапазона max/min свечей месяца | candles.close | зона | нет | цена да |
| Премия БПИФ | `(LAST − CURRENTVALUE_iNAV) / iNAV × 100` | LAST, CURRENTVALUE | KPI | нет | LAST и iNAV рядом |
| Вес в портфеле | `qty×price / Σ` | LAST + ввод пользователя | портфель | нет | цена да |
| PnL | `(current − avgPrice) × qty` | LAST + ввод | портфель | нет | цена и средняя да |

`LASTTOPREVPRICE` на топ‑20 — это поле ISS (уже %), не отдельный «наш» расчёт.

---

## 6. Кэширование, хранение и повторная выдача

| Механизм | Файл | Ключ / место | TTL | Кто получает | Публичная повторная выдача (технически) |
|---------|------|--------------|-----|--------------|------------------------------------------|
| localStorage ISS | `moex.js` / `news.js` | `ibrf.moex.*` | 1–30 мин в зависимости от ключа; дефолт 15 мин | только этот браузер | нет (локально) |
| localStorage аналитика | `analytics.js` | `ibrf.analytics.v17.*` | 30 мин + проверка lastTradeDate | этот браузер | нет |
| Память браузера | `_dataFileCache` | `data/*.json` | 60 с | этот браузер | нет |
| JSON на Pages | `data/*.json` | репозиторий | обновление CI ~5 мин | **все посетители** | **да**: один снимок ISS раздаётся всем |
| Память Cloud Function | `build-analytics.js` `Map` | ticker | 15 мин | все клиенты API (не Pages) | да, в пределах инстанса функции |
| HTTP Cache-Control | `server/server.js` | ответ `/api/analytics` | max-age=300 | клиенты локального сервера | да, 5 мин |
| Firestore | `meta/watchdog` | health | hourly | не UI котировок | нет котировок |
| Firestore users | `firebase-sync.js` | портфель/настройки | — | владелец аккаунта | **нет** ISS (в payload нет quotes) |
| YDB | investbrief-api | user data | — | владелец | код **запрещает** quotes/snapshots |
| IndexedDB / sessionStorage | — | — | — | — | не найдено |
| Портфель | `ibrf.portfolio` | в т.ч. `currentPrice` с LAST | пока пользователь не обновит | этот браузер / sync аккаунта | цена сохраняется у пользователя, не общий рынок |

CI пишет общие файлы → GitHub Pages отдаёт их любому, кто открыл URL. Это технически общая повторная выдача сохранённого ISS, не персональный кэш.

---

## 7. Streaming / websocket / orderbook

**Streaming/websocket не обнаружены. Данные запрашиваются через REST-запросы** (`fetch`, метод GET).

Long polling, EventSource, подписки на поток — нет.

Стакан (order book / bids-offers depth / individual orders) **не строится и не показывается**.

`BID` и `OFFER` перечислены в `marketdata.columns` запроса БПИФ (`pif.js`), но в разбор ответа попадают только LAST и VALTODAY. **Стакан и данные индивидуальных заявок не используются.**

«Live» в коде = повтор REST раз в 60 с (топ‑20) или 5 мин (макро), не поток сделок.

---

## 8. Предварительное сопоставление с режимами MOEX

Ориентиры тарифов — из задания, не из договора. Это **гипотеза по сходству**, не квалификация.

| Функция | Источник | Данные | Частота | Свежесть по коду | Исходные на экране? | Производный? | Хранение | Наиболее похожий режим (гипотеза) | Почему | Уверенность | Уточнить у MOEX |
|--------|----------|--------|---------|------------------|----------------------|--------------|----------|-------------------------------------|--------|-------------|-----------------|
| Топ‑20 цена и VALTODAY | TQBR securities.json | LAST, VALTODAY, LASTTOPREVPRICE | 60 с + CI 5 мин | неизвестна задержка ISS; код целится в сессию | да | нет | snapshot всем | ближе к **публичному показу текущих/сессионных** (Real Time Deal **или** Delayed, зависит от задержки ISS) | исходные поля сессии на всех | средняя | задержка публичного ISS; считается ли VALTODAY «deal data» |
| Плитки / портфель LAST | marketdata per ticker | LAST | по экрану | неизвестна | да | PnL — да | localStorage last 5 мин | то же | mark-to-market показывает цену | средняя | достаточно ли EOD для учёта |
| Свечи день interval=60 | candles | close почасовые | по открытию графика | intraday бары | да | нет | localStorage | ближе к **intraday/delayed**, не EOD | почасовые точки | высокая (тип), низкая (задержка) | лицензия на candles interval&lt;24 |
| История/свечи D1 | candles interval=24 / history CLOSE | дневные | по разделу | EOD + сегодняшняя LAST в хвосте | да | divAvg/TR | кэш + API | **Trading Results / EOD** + хвост сессии | дневные CLOSE | средняя | хвост LAST меняет режим? |
| Дивиденды ISS | dividends.json | даты и ₽ | по тикеру | справочные, не тик | да | avg/forecast | patches JSON | скорее справочник/EOD, не realtime deals | корпоративные события | средняя | dividends.json в том же договоре? |
| ОФЗ YTM/LAST/НКД | TQOB + bondization | LAST, YIELDATWAPRICE, ACCRUEDINT | открытие раздела + CI | неизвестна | да | нет | ofz.json всем | показ рыночных параметров облигаций | полный каталог TQOB | средняя | объём TQOB; YTM = derived ISS или исходное поле |
| iNAV + премия | index CURRENTVALUE + LAST | iNAV, премия | карточка БПИФ | неизвестна | iNAV да; премия C | премия | нет общего | показ индекса/котировки | премия — наш расчёт | средняя | iNAV как index data |
| Агент зоны | quote+history | % и обороты | цикл агента + CI snapshot | смесь | в тексте % да | статус «зона» | agent-signals.json всем | смесь **display** исходных % и **derived** ярлыка | не чистый non-display | средняя | non-display если убрать числа? |
| Snapshot JSON | CI | копия top/ofz/imoex | 5 мин | как в момент CI | да, при fallback | нет | **всем** | публичная раздача сохранённого ISS | один файл на всех | высокая (факт раздачи) | snapshot = redistribution? |
| Макро FORTS | forts LAST | цены фьючерсов | 5 мин | неизвестна | да | нет | localStorage | показ другого рынка (FORTS) | отдельный engine | средняя | отдельный рынок в тарифе |
| FX CETS | LAST | курс | 5 мин | неизвестна | да | нет | localStorage | валютный рынок SELT | да | средняя | SELT vs stock |
| Поиск q= | securities.json | имена | ввод | справочник | имена | нет | 10 мин | справочник инструментов | не сделки | высокая | covered by ISS terms? |
| Watchdog | LAST ping | не UI | час | — | нет | нет | Firestore | ближе к **non-display** служебному | нет показа пользователю | высокая | объём ping |
| RSS moex.com/export | не ISS | новости | лента | публикации | заголовки | нет | кэш briefs | вне ISS quotes | новости сайта | высокая | не market data feed |

**Derived Data (ориентир 93 750 ₽):** потенциально похожи публичные KPI `divAvg5y`, `totalReturn12m`, прогноз 12м, «зона внимания», премия к iNAV, PnL — если MOEX сочтёт их распространяемой производной. Это **не автоматическая квалификация**.

**Non-display (ориентир 7 500 ₽):** чисто внутренние — BID/OFFER (не показываются), ASSETCODE, watchdog ping. Агент **не** чистый non-display: порог применяется, но исходный % печатается.

---

## 9. Ответы на 12 вопросов

1. **Показывает ли сайт исходную текущую цену MOEX?**  
   Да: LAST (или первое ненулевое из цепочки) выводится как цена на топ‑20, плитках, аналитике, портфеле, ОФЗ, БПИФ.

2. **Насколько свежая цена по реализации?**  
   Код запрашивает ISS marketdata без `delay`, обновляет топ‑20 раз в 60 с. **По коду невозможно определить фактическую задержку** публичного ISS. UI сам предупреждает о возможной задержке.

3. **Оборот как исходное число?**  
   Да: VALTODAY (и history VALUE) показываются в млрд/млн ₽.

4. **Есть ли realtime вообще?**  
   Потока сделок нет. Есть частый REST к marketdata. Это не доказанный realtime feed. Юридически/фактически задержка ISS неизвестна.

5. **Стакан?**  
   Нет. BID/OFFER не отображаются.

6. **Облигации сейчас:**  
   TQOB: LAST, YIELDATWAPRICE, VALTODAY, DURATION, UPDATETIME, купонные поля, НКД, MATDATE, bondization coupons. Не TQCB-корп в основном UI (поиск может отфильтровать stock_bonds).

7. **Индексы:**  
   IMOEX: CURRENTVALUE/LAST, LASTCHANGEPRC/пересчёт, VALTODAY сессии, history VALUE 10 дней, candles. iNAV БПИФ — отдельный index SECID, CURRENTVALUE.

8. **Исторические:**  
   candles (час/день/неделя в зависимости от горизонта, до 5 лет); history CLOSE+VALUE по TQTF+TQBR с 1 янв (окно 5л−1); IMOEX VALUE ~45 дней; агент VALUE ~14 дней; dividends.json вся лента выплат.

9. **Расчётные, не прямые поля:**  
   % дня (часто); divAvg5y; прогноз 12м; totalReturn12m; зоны агента; премия к iNAV; веса и PnL портфеля; отношение оборота к среднему 7д.

10. **Перевод MVP на delayed / EOD?**  
    Технически да: заменить marketdata на history/EOD snapshot, убрать interval=60 и таймер 60 с. Изменится: топ «прямо сейчас», live mark портфеля, iNAV, YTM «сейчас», почасовой график. Сводка дня, див.KPI, каталог ОФЗ/ПИФ, новости, учёт лотов — сохранятся на EOD-снимке.

11. **Realtime только на узком наборе?**  
    Да технически: оставить ISS marketdata для IMOEX + N тикеров; остальное — `data/*.json` / history. Сейчас такого разделения нет (топ‑20 тянет 60+ строк TQBR).

12. **Что убрать без потери ядра сводки?**  
    FORTS-commodities, почасовые свечи, live iNAV, поиск ISS (заменить статическим списком), таймер 60 с, FORTS watchdog. Ядро: новости, портфель-учёт, EOD топ/IMOEX, див.аналитика, ОФЗ-обзор.

---

## 10. Рекомендации по снижению зависимости (не реализовано)

### A. Без потери основной ценности MVP

| Что | Endpoints | Поля | UX | Ближе к режиму | Сложность | Риски |
|----|-----------|------|-----|----------------|-----------|-------|
| Убрать таймер 60 с; топ только из `top-turnover.json` после клиринга/редкого CI | TQBR securities.json live | LAST/VALTODAY станут снимком | нет «сейчас», есть «на дату снимка» | EOD / delayed snapshot | низко | юридически snapshot всё ещё раздача |
| Отключить FORTS-плитки | forts/securities.json | LAST фьючерсов | меньше макро | меньше рынков | низко | пустые плитки |
| Не запрашивать BID/OFFER/SPREAD | pif marketdata | исчезнут неиспользуемые поля | нет | меньше order-like полей | низко | нет |
| Свечи только interval=24 | candles | нет почасовых close | график «день» = несколько дневных точек | EOD | низко | бедный внутридневной график |
| Реже CI (1× после сессии) | update-market-data | все snapshot | менее свежий fallback | EOD | низко | stale днём если ISS упал |

### B. Умеренная потеря UX

| Что | Endpoints | UX | Сложность | Риски |
|----|-----------|-----|-----------|-------|
| Портфель: только цена пользователя, LAST опционально | fetchMoexQuote | нет авто-переоценки | средне | «устаревшая оценка» |
| Топ без цены, только ранг по EOD VALUE | history вместо VALTODAY | нет live % | средне | другой смысл «топ» |
| Убрать iNAV/премию | index marketdata БПИФ | только реестр ЦБ | низко | слабее карточка БПИФ |
| Агент: только новости, без ценовых зон | quote+history агента | зоны по событиям | средне | агент беднее |

### C. Заметная потеря UX, меньше MOEX

| Что | UX | Сложность |
|----|-----|-----------|
| Не показывать LAST нигде, только див. и новости | сводка без котировок | высоко продуктово |
| Удалить snapshot JSON с Pages | нет общего fallback | средне |
| ОФЗ без YTM/LAST, только параметры выпуска из раскрытия | таблица без рынка | средне |

### D. Не трогать без ответа MOEX

- Является ли публичный ISS на `iss.moex.com` из браузера «публичным распространением» и какой задержки.
- VALTODAY / LASTTOPREVPRICE как Deal Data vs Trading Results.
- Общий `data/*.json` на GitHub Pages.
- `divAvg5y` / TR12m как Derived Data.
- Отдельные рынки: TQBR, TQOB, SELT, FORTS, index.
- dividends.json и bondization.
- Неполный объём (топ‑20 vs весь TQBR) — индивидуальная корректировка платы.

---

## 11. Что не удалось определить по коду

- Фактическая задержка ISS (15 мин / меньше / больше) без запроса и без договора.
- Отдаёт ли ISS разные LAST в торговую сессию vs после клиринга.
- Попадает ли GitHub Pages fetch под те же правила, что и витрина iss.moex.com для человека.
- Размер реального трафика (число уникальных тикеров × пользователей).
- Использует ли кто-то `getAnalytics` в production (на github.io — нет).
- Насколько `CURRENTVALUE` IMOEX совпадает с LAST в сессии.
- Полный список БПИФ inavSecid (в JSON каталога, не разбирался построчно из‑за размера).

---

## 12. Вопросы к MOEX

1. Публичный ISS `iss.moex.com` без логина: какая задержка marketdata LAST/VALTODAY?
2. Fetch из браузера посетителя сайта = display redistribution?
3. Публикация `data/*.json` (копия ISS) на GitHub Pages — redistribution сохранённых данных?
4. VALTODAY и LASTTOPREVPRICE — Deal Data, delayed stream или trading results?
5. Candles `interval=60` vs `24` — разные продукты?
6. Поля облигаций YIELDATWAPRICE / DURATION / ACCRUEDINT — исходные или derived ISS?
7. dividends.json и bondization — в том же договоре, что котировки?
8. Index CURRENTVALUE (IMOEX, iNAV) — отдельный рынок/продукт?
9. SELT и FORTS — отдельные рынки для non-display/display?
10. Можно ли ограничить договор топ‑20 TQBR + IMOEX EOD и как это влияет на плату?
11. Расчёт средней дивдоходности и TR на сайте — Derived Data для публичного распространения?
12. Служебный watchdog (LAST без UI) — non-display?

---

## Просмотренные файлы

- `moex.js`, `news.js`, `analytics.js`, `analytics-core.js`, `ofz.js`, `agent.js`, `pif.js`, `portfolio.js`, `ui.js`, `markets.js`, `storage.js` (только ключи/кэш, логика учёта не менялась)
- `functions/index.js`, `functions/lib/moex-fetch.js`, `functions/lib/build-analytics.js`, `functions/lib/analytics-core.js`
- `server/server.js`
- `scripts/update-market-data.js`, `scripts/build-pif-data.js`, `scripts/update-dividend-patches.js`, `scripts/smoke-health.mjs`, `scripts/test-analytics.mjs`, `scripts/test-agent.mjs`
- `.github/workflows/update-market-data.yml`, `analytics.yml`, `smoke.yml`
- `yandex-cloud/investbrief-api/index.js`
- `data/top-turnover.json`, `market-snapshot.json`, `ofz.json`, `agent-signals.json`, `dividend-patches.json` (заголовки)
- `docs/moex-data-map.md` (предыдущая продуктовая карта, не заменяла этот аудит)
- `index.html` (API URL аналитики)
- `watchdog.js`, `firebase-sync.js`, `firebase-init.mjs`

**Не просматривались построчно** из‑за размера: полное содержимое `data/pif-index.json` / `pif-archive.json` (~2 МБ каждый).

## Изменённые файлы

- Создан только этот отчёт: `docs/moex-data-audit.md`.
- Runtime-код, endpoints, расчёты, `storage.js`, `portfolio.js`, backend **не изменялись**.
