# Методология: российский рынок акций по секторам

Срез: **2026-10-13**. Оборот: **2025-10-14 — 2026-10-13** (254 торговых дня TQBR).

Это descriptive research. Показатель `turnoverIntensity` — не инвестиционный score, а отношение доли оборота к доле капитализации.

## 1. Market universe

**Включено:** торгуемые обыкновенные и привилегированные акции компаний на основном режиме Т+ акций Мосбиржи.

Фильтр фактического среза TQBR:

- `BOARDID = TQBR`
- `INSTRID = EQIN`
- `SECTYPE ∈ {1, 2}` (обыкновенные / привилегированные)
- `STATUS = A`
- `type ∈ {common_share, preferred_share}` по `/iss/securities.json`

**Почему TQBR, но не «весь TQBR».**  
TQBR называется «Т+: Акции и ДР», но в текущей сессии на нём лежат и фонды. На 2026-10-13 в TQBR было 510 инструментов: 259 акций компаний (включены), 117 ETF, 132 пая, 1 GDR, 1 бумага со статусом N.

TQBR **достаточен** как основной рынок акций, если отфильтровать не-акции. Другие boards для этого исследования не добавлялись.

**Исключено**

| Что | Почему |
|---|---|
| ETF / БПИФ (`IFTF`, `stock_etf`) | не компания |
| Паи ПИФ (`IFA1`, `stock_ppif`) | не компания |
| GDR OKEY (`SECTYPE=D`) | депозитарная расписка, не ordinary/preferred |
| AMEZ `STATUS=N` | не активный листинг |
| SMAL | неполные лоты тех же акций; сложение оборота задвоило бы VALUE |
| SPEQ | поставка по СК, не основной стакан |
| MTQR (`ОТС: Акции Т+`, engine `otc`) | внебиржевой T+, не основной рынок. Там 11 ordinary + 2 preferred (Удмуртнефть, Т Плюс и др.) |
| Иностранные бумаги FQBR/TQBD | другой market (`foreignshares`) |
| Индексы, облигации, фонды на TQTF/TQIF | не акции компаний |

IMOEX **не** является universe. Это отдельный маркер `isIMOEX`.

## 2. Дата среза капитализации

`analysisDate = 2026-10-13`

Это последняя дата, по которой TQBR history доступна последовательно для всего universe (`history_till` SBER/TQBR = 2026-10-13). 2026-10-14 на момент сбора ещё не был закрытым history-днём.

Капитализация всех бумаг считается на эту одну дату. Живой `ISSUECAPITALIZATION` на 2026-10-14 хранится как контрольное поле, но не смешивается в аналитический cap.

## 3. Период оборота

- `turnoverStartDate = 2025-10-14`
- `turnoverEndDate = 2026-10-13`
- календарное окно: 365 дней, **12 месяцев** до analysisDate включительно
- торговых дней TQBR в окне: **254** (календарь = даты истории SBER на TQBR)

## 4. Оборот

Поле MOEX ISS history: **`VALUE`**.

Проверка единиц: для SBER на 2026-10-13 `VOLUME=26_998_547` акций, `VALUE=7_745_760_461.25`, `CURRENCYID=SUR` (рублёвый код MOEX). `VOLUME × цена ≈ VALUE`. Это стоимость сделок в рублях, не количество акций.

В live-стакане аналог — `VALTODAY_RUR` (для SBER совпадает с `VALTODAY`).

Формулы:

```
totalTurnoverRub(secid) = Σ VALUE_d
  по d ∈ [2025-10-14, 2026-10-13],
  где VALUE_d конечно.

tradingDays = 254   # рыночные дни TQBR, не календарные

averageDailyTurnoverRub(secid) = totalTurnoverRub / 254
```

День без сделок, если строка history есть и `VALUE=0`, входит в сумму как 0. Это наблюдение, не missing.

Отсутствующая история (`rowCount=0`) → `totalTurnoverRub = null`, флаг `missing-turnover`. В этом срезе таких бумаг нет.

IPO/листинг внутри периода: сумма по доступным дням, флаг `listing-during-period`. Знаменатель среднего всё равно 254 рыночных дня (сопоставимость между именами).

На уровне компании оборот **суммируется** по всем классам акций (`SBER+SBERP`, `TATN+TATNP`, `SNGS+SNGSP`).

## 5. Капитализация

MOEX даёт капитализацию **на выпуск (issue / security class)**, не на эмитента.

Поле live marketdata: `ISSUECAPITALIZATION`.  
Семантика: ≈ `ISSUESIZE × цена`. Проверка SBER: `ISSUESIZE=21_586_948_000`, `LAST≈286.22`, issue cap ≈ 6.173 трлн, отношение к `ISSUESIZE×LAST` ≈ 0.999.  
SBERP — отдельный выпуск (`ISSUESIZE=1_000_000_000`, issue cap ≈ 0.286 трлн). Это не double count: разные классы акций.

Аналитический cap на analysisDate:

```
если ISSUESIZE и LEGALCLOSEPRICE[2026-10-13] > 0
   и (VALUE в этот день > 0 или был ненулевой оборот за 12м):
     marketCapRub = ISSUESIZE × LEGALCLOSEPRICE
     method = issuesize * LEGALCLOSEPRICE[analysisDate]
иначе если LAST live > 0:
     marketCapRub = ISSUESIZE × LAST
     flag = used-live-price
иначе:
     marketCapRub = null
     flag = stale-untraded-price
     staleCapRub сохраняется для аудита и в сумму рынка НЕ входит
```

`LEGALCLOSEPRICE=0` / отсутствие сделок при ненулевой «официальной» цене трактуется как stale quote, не как капитализация. Так отфильтрованы GAZT/GAZS/GAZC/MGNZ.

Компания:

```
marketCapRub(company) = Σ marketCapRub по listed share classes
```

Суммирование выпусков — правильная семантика MOEX issue cap. Не суммируется «issuer-level» поле: его в ISS нет.

**Термин для статьи:** «капитализация включённых в выборку торгуемых выпусков».  
Без оговорки нельзя писать «стоимость всей компании» / «полная капитализация эмитента».

Поле `marketCapCoverage`:

- `full` — все известные по MOEX ISS классы акций эмитента входят в TQBR-выборку;
- `partial` — в выборке не все классы (preferred-only, unlisted/other-board class). Отсутствующий класс **не оценивается**;
- `unknown` — иностранный эмитент или нет emitent_id.

Не используется `price × shares outstanding` из сторонних источников. `ISSUESIZE` — поле MOEX ISS.

## 6. Компания

Ключ: `companyId`.

1. Явный mapping в `classification-rules.mjs` (включая 25 компаний из `data/company-profiles.json`).
2. Иначе `emitent_id` / `emitent_inn` из `/iss/securities.json`.

SBER и SBERP — одна компания. 25 production profiles ≠ весь рынок; research mapping шире и **не** записывается в production `company-profiles.json`.

## 7. Секторы и отрасли

Канонические 9 секторов ИнвестБрифа сохранены. Новая каноническая отрасль верхнего уровня **не добавлялась**.

АФК «Система» (`AFKS`) в 9 секторов не помещена: диверсифицированный холдинг. В final dataset: `classificationStatus = unclassified-diversified-holding`, `sector = null`. Новый production sector не добавлялся. В секторные доли не входит; оборот и cap вынесены в `unclassified` bucket.

Отрасли — единый naming (не «Нефтянка» / «Нефть» / «Нефтегаз»). «Нефть и газ» vs «Газ» разделены по профилю бизнеса (как в company-profiles: Газпром/Новатэк = Газ, Лукойл/Роснефть = Нефть и газ).

Источники классификации (порядок):

1. `data/company-profiles.json` для 25 известных компаний
2. research mapping с provenance (IR / сайт эмитента / карточка Мосбиржи)
3. отраслевые индексы Мосбиржи (`MOEXFN`, `MOEXOG`, `MOEXEU`, …) как MOEX-классификация, не как веса

Конфликты с индексами Мосбиржи, где каноника ИнвестБрифа уже задана:

- OZON: MOEXIT, в профиле — потребительский сектор / интернет-торговля
- OZPH, MDMG, GEMC, PRMD, APTK: MOEXCN, в research — здравоохранение
- SVAV (СОЛЛЕРС): MOEXCN, research — промышленность / автомобилестроение

## 8. IMOEX

Состав: `/iss/statistics/engines/stock/markets/index/analytics/IMOEX.json` на 2026-10-13, 44 бумаги / 41 компания.

`isIMOEX` на бумаге = secid в этом списке (включая SBERP, TATNP, SNGSP, TRNFP).  
`isIMOEX` на компании = хотя бы один listed class в составе.

Веса IMOEX **не** копируются. Доли считаются той же cap/turnover methodology, что и для широкого рынка.

## 9. Агрегаты

Для сектора и отрасли:

- `companyCount`
- `marketCapRub` / `marketCapSharePct` — знаменатель **`classifiedMarketCapRub`**
- `totalTurnoverRub` / `turnoverSharePct` — знаменатель **`classifiedTurnoverRub`**
- `averageDailyTurnoverRub = totalTurnoverRub / 254`
- `turnoverIntensity = turnoverSharePct / marketCapSharePct` при `marketCapSharePct > 0`

Это **интенсивность торгов относительно текущего размера сектора**: доля 12-месячного оборота / доля капитализации на analysisDate. Это не liquidity score и не инвестиционная привлекательность. Метрика сопоставляет прошлый оборот с текущим размером.

Доли 9 секторов ≈ 100% classified. АФК Система — отдельный unclassified bucket. Stale-cap (null) в сумму cap не входит.

Доли top-10 компаний в `concentration` считаются от `totalUniverseMarketCapRub` / `totalUniverseTurnoverRub` (все компании с non-null cap / все компании universe).

## 10. Воспроизведение

См. [README.md](README.md). Порядок:

```
node research/market-sectors/scripts/fetch-raw.mjs
node research/market-sectors/scripts/build-datasets.mjs
node research/market-sectors/scripts/build-final.mjs
node research/market-sectors/scripts/validate.mjs
```

`raw/` — локальный кэш ISS, в git не коммитится.
