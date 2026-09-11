# Portfolio v1 freeze

Дата фиксации: 11.09.2026  
HEAD: `24e853c7`  
Статус: **P0/P1 closed**

Portfolio v1 frozen after split/P1b stabilization.  
P0/P1 closed.

## Что заморожено

Логика портфеля v1 после стабилизации split / P1b:

- generic split contract и `data/split-events.json`;
- открытые позиции (qty по операциям и с учётом дробления, стоимость/PnL в одной шкале);
- P1b writer продаж (qty как в брокере, `lotQtyDelta` в JSON);
- summary-карточки на split-aware метриках;
- UI-предупреждение для ambiguous-шкалы (кейс T);
- fail-safe продажи при недоступном каталоге дроблений;
- единая подпись новой split-продажи vs legacy.

Не менять без отдельного решения: `portfolio.js`, `split-events.js`, `storage.js`, формулы writer/realized, JSON schema.

## Remaining P2

- mobile-wrap длинных предупреждений;
- отдельный export/import test для sale-metadata;
- reverse split не поддерживается writer’ом;
- last-known-good catalog только в памяти вкладки;
- новые сплиты добавляются через `data/split-events.json`.

## Tests

- `npm run test:portfolio` OK
- `node scripts/test-split-events.mjs` OK
- `npm run test:analytics` OK
- `npm run test:agent` OK
