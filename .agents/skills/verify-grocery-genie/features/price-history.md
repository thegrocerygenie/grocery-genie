# Price history and item matching (V1.1)

Confirming a receipt links each line to a canonical item (PI-02) and records its unit price (PI-01). Receipt abbreviations of a product already bought link to it on their own; a close-but-unsure name, or a close name that differs in a qualifier (plain "Bananas" after "Organic Bananas"), becomes a "same item?" question the user accepts or rejects. Items (the list, titled "Prices" before DA-3) lists every item with its latest price, and an item shows its price history with date and store. The user can rename an item, combine two, and split a name off.

## Sub-features

- `pi.match-on-confirm`: a scan confirmed through `PATCH status=confirmed`, and a manual entry, give every line a `canonical_item_id`.
- `pi.auto-link`: a receipt abbreviation of a known item ("WHL MILK 1 GAL" after "Whole Milk 1 Gal", "ORG BANANAS" after "Organic Bananas") links to it (`match_method` fuzzy or semantic).
- `pi.qualifier`: a name that differs in a qualifier never auto-links (BUG-4). "Bananas" after "Organic Bananas" scores about 0.86 semantic, above the 0.80 link bar, yet becomes its own item (`match_method` new) with a pending suggestion, and Organic Bananas keeps only organic prices.
- `pi.abbrev-french`: "WHL WHT BREAD" after "Whole Wheat Bread" links (fuzzy 1.0); "Lait écrémé 2 L" after "Lait entier 2 L" (semantic about 0.83, above the link bar) asks, because French qualifiers read as English ones (écrémé nonfat, entier whole).
- `pi.suggest`: a medium match ("Chicken Breast" after "CHKN BRST", about 0.77 fuzzy) creates a pending suggestion, counted in `pending_suggestions`.
- `pi.accept`: accepting merges the two items and their prices.
- `pi.reject`: rejecting keeps both; the suggestion row ends `rejected`, and the next scan of that name links to its own item by alias, with no new question.
- `pi.history`: `GET /api/items/{id}/prices` lists every price oldest first with date and store; `has_timeline` is true from 2 prices.
- `pi.range`: item detail (PI-01 AC 5, DA-3) asks `GET /api/items/{id}/prices` once, with no filter, and its range control (1M/3M/6M/1Y/All, counted back from today, opening on 3M or the smallest range with prices) filters that history in the app, so opening an item records exactly one `price_history_viewed` and a range tap records none. The API's own `from` filter still answers (has_timeline and store_count for the range alone), but the app does not use it. Each price's `store_id` is the same store id `/compare` gives, which the app colours its store squares by (PI-01 AC 9). Another user's item answers 404.
- `pi.split` / `pi.merge` / `pi.rename`: unlink a name, link two items, rename.
- `pi.isolation`: another user's list is empty and the item answers 404.

## How to get to it (user POV)

Budget tab → Items → an item. Also: History → a receipt → tap a line. Possible matches: the banner at the top of Items, or the question card on the item.

## Driving it with gg-verify

```bash
$G signup prices
rid=$($G scan | jq -r .receipt_id)
$G api PATCH /api/receipts/$rid '{"status":"confirmed"}'
$G api GET /api/receipts/$rid | jq '[.items[].canonical_item_id]'          # pi.match-on-confirm: no nulls
$G api POST /api/receipts '{"store_name":"FreshCo","date":"2026-03-20","total":7.86,"items":[{"name":"ORG BANANAS","quantity":2,"unit_price":0.79,"total_price":1.58},{"name":"WHL MILK 1 GAL","quantity":1,"unit_price":5.29,"total_price":5.29},{"name":"Bananas","quantity":1,"unit_price":0.99,"total_price":0.99}]}'
$G api GET /api/items | jq '{pending_suggestions, items: [.items[] | {canonical_name, observation_count}]}'  # pi.auto-link: Organic Bananas 2, milk 2. pi.qualifier: Bananas 1, pending 1
$G sql "SELECT raw_name, match_method, match_confidence FROM line_items"   # ORG BANANAS and WHL MILK fuzzy; Bananas new
$G api GET /api/items/suggestions | jq '[.[] | {item: .item.canonical_name, suggested: .suggested_item.canonical_name, confidence, method}]'  # pi.qualifier: Bananas ~ Organic Bananas, semantic ~0.86
$G api POST /api/items/suggestions/$($G api GET /api/items/suggestions | jq -r '.[0].id')/reject   # pi.reject: 204
$G api POST /api/receipts '{"store_name":"FreshCo","date":"2026-03-29","total":18.49,"items":[{"name":"CHKN BRST","quantity":1,"unit_price":9.0,"total_price":9.0},{"name":"Chicken Breast","quantity":1,"unit_price":8.5,"total_price":8.5},{"name":"BANANAS","quantity":1,"unit_price":0.99,"total_price":0.99}]}'   # BANANAS: the Bananas item by alias, no new question
sid=$($G api GET /api/items/suggestions | jq -r '.[0].id')                  # pi.suggest: Chicken Breast ~ CHKN BRST
$G api POST /api/items/suggestions/$sid/accept | jq '{canonical_name, aliases: [.aliases[].alias]}'   # pi.accept
mid=$($G api GET /api/items | jq -r '.items[] | select(.canonical_name=="Organic Bananas") | .id')
$G api GET /api/items/$mid/prices | jq '{has_timeline, points: [.observations[] | [.date, .store_name, .unit_price]]}'  # pi.history: 1.29 and 0.79, no 0.99
aid=$($G api GET /api/items/$mid | jq -r '.aliases[] | select(.alias=="ORG BANANAS") | .id')
nid=$($G api POST /api/items/$mid/aliases/$aid/split | jq -r .id)            # pi.split
$G api POST /api/items/$nid/merge "{\"into_item_id\":\"$mid\"}"             # pi.merge
$G api PATCH /api/items/$mid '{"canonical_name":"Bananas (organic)"}'       # pi.rename
$G sql "SELECT status, method FROM item_match_suggestions"                  # the rejected one; an accepted one is merged away
$G sql "SELECT match_method, count(*) FROM line_items GROUP BY 1"
$G sql "SELECT count(*) FROM canonical_item_aliases WHERE embedding IS NULL"  # 0 with the model available
$G signup french
$G api POST /api/receipts '{"store_name":"IGA","date":"2026-03-20","total":8.98,"items":[{"name":"Whole Wheat Bread","quantity":1,"unit_price":3.49,"total_price":3.49},{"name":"Lait entier 2 L","quantity":1,"unit_price":5.49,"total_price":5.49}]}'
$G api POST /api/receipts '{"store_name":"IGA","date":"2026-03-27","total":8.78,"items":[{"name":"WHL WHT BREAD","quantity":1,"unit_price":3.29,"total_price":3.29},{"name":"Lait écrémé 2 L","quantity":1,"unit_price":5.49,"total_price":5.49}]}'
$G api GET /api/items | jq '{pending_suggestions, items: [.items[] | {canonical_name, observation_count}]}'  # pi.abbrev-french: Whole Wheat Bread 2, each milk 1, pending 1
$G signup other && $G api GET /api/items/$mid/prices                        # pi.isolation: 404
$G signup range                                                              # pi.range
$G api POST /api/receipts '{"store_name":"FreshCo","date":"2026-02-10","total":2.0,"items":[{"name":"Avocado","quantity":1,"unit_price":2.0,"total_price":2.0}]}'
$G api POST /api/receipts '{"store_name":"Loblaws","date":"2026-08-15","total":2.2,"items":[{"name":"Avocado","quantity":1,"unit_price":2.2,"total_price":2.2}]}'
$G api POST /api/receipts '{"store_name":"FreshCo","date":"2026-10-20","total":2.6,"items":[{"name":"Avocado","quantity":1,"unit_price":2.6,"total_price":2.6}]}'
av=$($G api GET /api/items | jq -r '.items[0].id')
$G api GET "/api/items/$av/prices" | jq -c '[.observations[] | [.date, .store_name, .store_id[0:8], .unit_price]]'  # the app's one request: 3 prices, FreshCo's id on both of its prices
$G sql "SELECT event_name, properties->>'store_count' FROM analytics_events WHERE event_name = 'price_history_viewed' AND user_id IN (SELECT id FROM users WHERE email LIKE 'range-%')"   # one row, store_count 2
$G api POST /api/receipts '{"store_name":"FreshCo","date":"2026-10-28","total":2.4,"items":[{"name":"Avocado","quantity":1,"unit_price":2.4,"total_price":2.4}]}'   # a 3rd FreshCo price; Loblaws has 1, below the compare minimum
$G premium && $G api GET "/api/items/$av/compare" | jq -c '[.stores[] | [.store_name, .store_id[0:8]]]'  # FreshCo, with the same id as on /prices
$G signup rangeother && $G api GET "/api/items/$av/prices" || true          # 404
```

## Gotchas

- Debug mode mocks only the LLM extractor. Matching runs the real local embedding model (`GG_EMBEDDING_MODEL`), which loads on the first confirm (a few seconds, and a download on a host that has never fetched it). `GG_EMBEDDINGS_ENABLED=false` matches on aliases and fuzzy similarity only, and aliases keep a null embedding.
- The ranges count back from today on the phone and filter in the app; the API sees only the one plain request.
- Manual entries carry no `unit_of_measure`, so their history's `unit_of_measure` is null and prices show without a unit. A scan's extraction supplies it.
- Exact confidences depend on the model version; the journey checks which pairs link, ask, or stay apart, not the score.
- Qualifier words and their receipt abbreviations are listed in `backend/app/services/item_qualifiers.py`. If an abbreviation is missing there, a true match asks instead of linking. This journey found "WHL" (whole) missing at first, and the device check "WHL WHT" (whole wheat). French words match without accents ("ECREME" is écrémé).
- Verified 2026-11-03 against Postgres 16 with pgvector 0.6 (run `20261103-053414`), and with the qualifier steps the same day (run `20261103-220037`). The WHL WHT and French steps verified 2026-11-04 (run `20261104-040224`). `pi.range` verified 2026-11-05 (run `20261105-042923`), and with the single request (run `20261105-045304`).
