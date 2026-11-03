# Price history and item matching (V1.1)

Confirming a receipt links each line to a canonical item (PI-02) and records its unit price (PI-01). Receipt abbreviations of a product already bought link to it on their own; a close-but-unsure name becomes a "same item?" question the user accepts or rejects. Prices lists every item with its latest price, and an item shows its price history with date and store. The user can rename an item, combine two, and split a name off.

## Sub-features

- `pi.match-on-confirm`: a scan confirmed through `PATCH status=confirmed`, and a manual entry, give every line a `canonical_item_id`.
- `pi.auto-link`: a receipt abbreviation of a known item ("WHL MILK 1 GAL" after "Whole Milk 1 Gal") links to it (`match_method` fuzzy or semantic).
- `pi.suggest`: a medium match ("ORG BANANAS" after "Organic Bananas", about 0.84) creates a pending suggestion, counted in `pending_suggestions`.
- `pi.accept`: accepting merges the two items and their prices.
- `pi.reject`: rejecting keeps both; the suggestion row ends `rejected`.
- `pi.history`: `GET /api/items/{id}/prices` lists every price oldest first with date and store; `has_timeline` is true from 2 prices.
- `pi.split` / `pi.merge` / `pi.rename`: unlink a name, link two items, rename.
- `pi.isolation`: another user's list is empty and the item answers 404.

## How to get to it (user POV)

Budget tab → Price history (Prices list) → an item. Also: History → a receipt → tap a line. Possible matches: the banner at the top of Prices, or the question card on the item.

## Driving it with gg-verify

```bash
$G signup prices
rid=$($G scan | jq -r .receipt_id)
$G api PATCH /api/receipts/$rid '{"status":"confirmed"}'
$G api GET /api/receipts/$rid | jq '[.items[].canonical_item_id]'          # pi.match-on-confirm: no nulls
$G api POST /api/receipts '{"store_name":"FreshCo","date":"2026-03-20","total":6.87,"items":[{"name":"ORG BANANAS","quantity":2,"unit_price":0.79,"total_price":1.58},{"name":"WHL MILK 1 GAL","quantity":1,"unit_price":5.29,"total_price":5.29}]}'
$G api GET /api/items | jq '{pending_suggestions, items: [.items[] | {canonical_name, observation_count}]}'  # pi.auto-link: milk has 2
sid=$($G api GET /api/items/suggestions | jq -r '.[0].id')                  # pi.suggest: ORG BANANAS ~ Organic Bananas
mid=$($G api POST /api/items/suggestions/$sid/accept | jq -r .id)           # pi.accept
$G api GET /api/items/$mid/prices | jq '{has_timeline, points: [.observations[] | [.date, .store_name, .unit_price]]}'  # pi.history
aid=$($G api GET /api/items/$mid | jq -r '.aliases[] | select(.alias=="ORG BANANAS") | .id')
nid=$($G api POST /api/items/$mid/aliases/$aid/split | jq -r .id)            # pi.split
$G api POST /api/items/$nid/merge "{\"into_item_id\":\"$mid\"}"             # pi.merge
$G api PATCH /api/items/$mid '{"canonical_name":"Bananas (organic)"}'       # pi.rename
$G api POST /api/receipts '{"store_name":"FreshCo","date":"2026-03-29","total":17.5,"items":[{"name":"CHKN BRST","quantity":1,"unit_price":9.0,"total_price":9.0},{"name":"Chicken Breast","quantity":1,"unit_price":8.5,"total_price":8.5}]}'
$G api POST /api/items/suggestions/$($G api GET /api/items/suggestions | jq -r '.[0].id')/reject   # pi.reject: 204
$G sql "SELECT status, method FROM item_match_suggestions"
$G sql "SELECT match_method, count(*) FROM line_items GROUP BY 1"
$G sql "SELECT count(*) FROM canonical_item_aliases WHERE embedding IS NULL"  # 0 with the model available
$G signup other && $G api GET /api/items/$mid/prices                        # pi.isolation: 404
```

## Gotchas

- Debug mode mocks only the LLM extractor. Matching runs the real local embedding model (`GG_EMBEDDING_MODEL`), which loads on the first confirm (a few seconds, and a download on a host that has never fetched it). `GG_EMBEDDINGS_ENABLED=false` matches on aliases and fuzzy similarity only, and aliases keep a null embedding.
- Manual entries carry no `unit_of_measure`, so their history's `unit_of_measure` is null and prices show without a unit. A scan's extraction supplies it.
- Exact confidences depend on the model version; the journey checks which pairs link, ask, or stay apart, not the score.
- Verified 2026-11-03 against Postgres 16 with pgvector 0.6 (run `20261103-053414`).
