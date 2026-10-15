# Source audit

Все денежные ряды — Мосбиржа ISS. Классификация — ISS + профили ИнвестБрифа + IR/сайты эмитентов. Production snapshot `data/top-turnover.json` в universe не входил.

## MOEX ISS

| Endpoint | Что берём | Период / дата | Единицы | Ограничения | Воспроизводимость |
|---|---|---|---|---|---|
| `/iss/engines/stock/markets/shares/boards.json` | список boards, `is_traded` | текущая сессия | — | `is_primary` в этой выдаче пустой | да |
| `/iss/engines/stock/markets/shares/boards/TQBR/securities.json` | SECID, SHORTNAME, SECTYPE, INSTRID, STATUS, LISTLEVEL, ISSUESIZE, ISIN; marketdata ISSUECAPITALIZATION, LAST, VALTODAY_RUR, TRADINGSTATUS | live 2026-10-14 | ISSUESIZE — штуки; ISSUECAPITALIZATION и VALTODAY_RUR — RUB | На TQBR одновременно акции, ETF и паи. ISSUECAPITALIZATION — выпуск, не эмитент. Для неторгуемых имён может держать stale quote | да, пагинация не нужна (одна страница snapshot) |
| `/iss/securities.json?engine=stock&is_trading=1&group_by=type&group_by_filter=` | emitent_id, emitent_title, emitent_inn, type, group, primary_boardid | live | — | страница по 100; type-фильтр обязателен, иначе смесь рынков | да |
| `/iss/securities.json?engine=stock&group_by=group&group_by_filter=stock_shares` | все common/preferred, включая is_traded=0 | live | — | для marketCapCoverage; исторические EQBR-алиасы отфильтровываются | да |
| `/iss/securities/{SECID}.json` | TYPE, GROUP, ISSUESIZE, listed_from/till TQBR, history_from/till | live | ISSUESIZE — штуки | нет emitent_inn в description; inn только в directory | да, кэш `raw/securities/` |
| `/iss/history/engines/stock/markets/shares/boards/TQBR/securities.json?date=2026-10-13` | LEGALCLOSEPRICE, CLOSE, VALUE на дату среза | 2026-10-13 | VALUE — RUB, CURRENCYID=SUR | 510 строк, cursor 100 | да |
| `/iss/history/engines/stock/markets/shares/boards/TQBR/securities/{SECID}.json?from=2025-10-14&till=2026-10-13` | VALUE, LEGALCLOSEPRICE, CLOSE, VOLUME, NUMTRADES | 12м | VALUE — RUB; VOLUME — штуки | страница 100 торговых дней; ~3 страницы на тикер | да, кэш `raw/history/` |
| `/iss/statistics/engines/stock/markets/index/analytics/IMOEX.json` | состав IMOEX, weight (weight не используем в агрегатах) | 2026-10-13 | weight — % индекса | 44 бумаги | да |
| `/iss/statistics/engines/stock/markets/index/analytics/{MOEXFN,…}.json` | отраслевые индексы как provenance классификации | дата индекса (MOEXTL — 2026-03-19, остальные 2026-10-13) | — | покрывают ликвидное ядро, не весь TQBR; MOEXIT смешивает IT и телеком | да |
| `/iss/statistics/engines/stock/capitalization.json` | CAPITALIZATION рынка | 2026-10-13: 46.818 трлн RUB | RUB | включает не только наш universe (фонды/прочие); **не** используется как total | да |
| `/iss/securitytypes.json` | справочник типов | — | — | id справочника ≠ SECTYPE на TQBR (1/2 vs common_share) | да |

User-Agent: `InvestBriefResearch/1.0`.

## Что не из MOEX

| Источник | Что | Зачем |
|---|---|---|
| `data/company-profiles.json` | 25 компаний: sector, industry, tickers, IR URL | каноника ИнвестБрифа |
| Сайты эмитентов / IR | бизнес для mapping новых компаний | не выводить сектор из тикера |
| Эксперт РА / gaz-tek.ru | ГАЗ-Тек = инвестхолдинг, не операционный нефтегаз | не раздувать энергетику stale cap |
| b2b-rts.ru, moex.com/n99404 | BTBR = ЭТП, не BitRiver | IT |
| iva.ru | IVAT = корпоративные коммуникации ПО | IT |
| evrotrans-ao.ru | EUTR = сеть АЗК «Трасса» | топливная розница |

Полный per-ticker provenance: `mapping/classification.json` и `datasets/companies.json` → `classificationSources`.

## Явно не источники universe

- `data/top-turnover.json` — дневной snapshot другого feature
- официальные веса IMOEX — не подставлялись как доли секторов
- `data/market-snapshot.json`
