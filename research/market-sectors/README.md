# Research: российский рынок акций по секторам

Ветка `research-market-sectors`. Не production UI. Не статья.

Цифры для будущей статьи брать из `final/article-facts.json`, не из raw.

## Как воспроизвести

Даты зафиксированы в `scripts/lib.mjs`:

- `analysisDate = 2026-10-13`
- оборот: `2025-10-14` — `2026-10-13`
- board: `TQBR`
- history columns: `TRADEDATE,CLOSE,LEGALCLOSEPRICE,VALUE,VOLUME,NUMTRADES,CURRENCYID`

Порядок:

```
node research/market-sectors/scripts/fetch-raw.mjs
node research/market-sectors/scripts/build-datasets.mjs
node research/market-sectors/scripts/build-final.mjs
node research/market-sectors/scripts/validate.mjs
```

`fetch-raw.mjs` кэширует ISS в `raw/` (локально, не в git). Повторный запуск не перекачивает history, если кэш совпадает с окном дат.

`build-final.mjs` читает уже собранные `datasets/` + `raw/iss-stock-shares-all.json` и не пересобирает оборот.

## Что коммитить / что нет

В git:

- `scripts/`
- `mapping/`
- `final/` — compact publication datasets
- `datasets/` — промежуточный analytic layer (компактный)
- methodology / sources / quality / findings / этот README
- `research/market-sectors/.gitignore`

Не коммитить: `raw/` (ISS snapshots, per-ticker history, security meta). Восстанавливается `fetch-raw.mjs`.

## Final files

| Файл | Назначение |
|---|---|
| `final/article-facts.json` | проверенные факты для текста статьи |
| `final/company-summary.json` + `.csv` | компании + coverage + classificationStatus |
| `final/sector-summary.json` + `.csv` | 9 канонических секторов + unclassified bucket |
| `final/industry-summary.json` + `.csv` | отрасли |
| `final/cap-coverage.json` | full / partial / unknown |

Документы: [METHODOLOGY.md](METHODOLOGY.md) · [SOURCES.md](SOURCES.md) · [QUALITY.md](QUALITY.md) · [FINDINGS.md](FINDINGS.md)
