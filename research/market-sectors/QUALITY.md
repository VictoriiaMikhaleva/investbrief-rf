# Quality / issues

Срез 2026-10-13. Missing **не** заменён на 0.

## Сводка флагов (security-level)

| Флаг | N | Смысл |
|---|---|---|
| `stale-untraded-price` | 4 | 12м оборот = 0, live LAST = 0, LEGALCLOSEPRICE всё ещё ненулевой. `marketCapRub = null` |
| `zero-turnover` | 4 | те же имена: наблюдаемый нулевой оборот, не missing |
| `listing-during-period` | 6 | `listed_from` TQBR > 2025-10-14 |
| `classification-review` | 1 | AFKS, 9 секторов недостаточно |
| `missing-turnover` | 0 | |
| duplicate tickers / companyIds | 0 | проверено validate.mjs |

## Stale capitalization (не входит в totals)

Официальный LEGALCLOSEPRICE × ISSUESIZE дал бы:

| Тикер | Компания | staleCap, млрд ₽ |
|---|---|---|
| GAZT | ГАЗ-Тек | 820 |
| GAZS | ГАЗ-сервис | 173 |
| GAZC | ГАЗКОН | 149 |
| MGNZ | Соликамский магниевый завод | 3 |

ГАЗ-Тек / ГАЗ-сервис / ГАЗКОН — инвестиционные холдинги, не операционный нефтегаз. Если включить stale cap, «ГАЗ-Тек» оказался бы 12-й компанией рынка (~820 млрд) при нулевых сделках весь год. В аналитический total **не входит**.

Сумма аналитической капитализации: **46.702 трлн ₽**.  
Classified (без AFKS): **46.626 трлн ₽**.  
Официальная MOEX `CAPITALIZATION` на ту же дату: 46.818 трлн ₽ (другой периметр, включая не-акции).

## marketCapCoverage

Сверка с полным справочником MOEX ISS `stock_shares` (все статусы). Отсутствующий класс не оценивается.

| coverage | N |
|---|---:|
| full | 205 |
| partial | 11 |
| unknown | 1 (VEON Ltd / VEON-RX) |

Partial (listed issue cap ≠ полный акционерный капитал):

- preferred-only TQBR: TRNFP, OMZZP, HIMCP, KRKOP, BISVP
- ordinary TQBR, другой класс вне выборки: SELG (SELGP traded=0), ZILL (ZILLP MTQR), CHKZ (chkzp SOTC), BRZL (BRZLP MTQR), RTGZ (RTBGP MTQR), NKSH (nkshp SOTC)

## Classification-review

**АФК «Система» (AFKS).** IMOEX, list 1, cap ≈ 75.5 млрд ₽, 12м оборот ≈ 350 млрд ₽.

Бизнес: диверсифицированный холдинг (телеком, ритейл, лес, агро, медицина, недвижимость). Текущих 9 канонических секторов недостаточно, чтобы отнести его в один сектор без искажения. Новый сектор («Холдинги и конгломераты») **не добавлялся**. В секторных долях не участвует.

## Preferred-only listed

В TQBR нет ordinary class:

- TRNFP Транснефть (крупный listed pref; ordinary на TQBR нет — cap компании занижает полный issuer)
- OMZZP ОМЗ
- HIMCP Химпром
- KRKOP Красный котельщик
- BISVP Башинформсвязь

## Листинг внутри периода оборота

DOMRF, EVRZ, BTBR, BAZA, GLRX, INCB. Оборот суммирован по доступным дням; среднее делится на 254 рыночных дня.

BTBR: старт торгов 2026-04-17 (IPO на Мосбирже).

## Экстремальные intensity на уровне отрасли

При очень малой доле капитализации и заметном обороте intensity >> 1:

- Топливная розница (EUTR ЕвроТранс): intensity ~74
- Микромобильность (WUSH Whoosh): intensity ~70

Это не «качество бумаги», а арифметика малых долей. На уровне сектора они почти не двигают потребительский intensity (1.95).

Самолёт (SMLT): cap ≈ 15 млрд ₽ при 12м обороте ≈ 739 млрд ₽. Бумага в IMOEX на эту дату **не** входит; на широком рынке даёт большую часть оборота недвижимости.

## Газпром нефть (SIBN)

List 3, cap ≈ 2.87 трлн ₽ (5-я компания рынка), 12м оборот только ≈ 130 млрд ₽. Реальная компания, низкий free-float/оборот. В энергетике тянет intensity вниз. Не stale.

## Проверки, которые прошли

- нет duplicate securities / companyIds
- ordinary+preferred не двоят company cap (SBER, TATN, SNGS)
- секторные и отраслевые суммы = сумме компаний
- доли секторов/отраслей ≈ 100% classified
- cap и turnover ≥ 0
- sanity: SBER, GAZP, LKOH, ROSN, NVTK, GMKN, PLZL, YDEX, T

## Ограничения, которые остаются

1. Listed TQBR cap ≠ полная капитализация эмитента с неторгуемыми классами.
2. Отраслевые индексы Мосбиржи покрывают ядро, не второй эшелон; хвост классифицирован вручную по IR/карточкам.
3. MOEXTL analytics дата 2026-03-19 (прочие секторные индексы — 2026-10-13).
4. 58 отраслей — research granularity; для статьи, возможно, укрупнять.
5. MTQR OTC-акции российских эмитентов сознательно вне universe.
