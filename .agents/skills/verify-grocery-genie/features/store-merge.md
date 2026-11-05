# Store normalization and user store merge (V1.1)

"Loblaws", "LOBLAWS #1234" and "Loblaws - 1234" are one store for everyone: a branch marker at the end and punctuation normalize away, and nothing else, so different stores ("Number 1 Chinese" / "Chinese", "Bar 1802" / "Bar") never share a row. Each receipt keeps its own store name, so another user's name never shows. A different banner ("REAL CANADIAN SUPERSTORE") is joined only by the user's own merge, which groups that user's prices in history, item stats, cross-store comparison, price alerts and store mutes, and nobody else's (EC Price Intelligence 1, decision D3). A merge can be undone. The store list and merges are free; cross-store comparison and mutes are Premium (decision D8, PREM-02), so the journey makes the user Premium (`$G premium`) right before its first comparison.

## Sub-features

- `store.normalize`: receipts at "Loblaws", "LOBLAWS #1234" and "Loblaws - 1234" share one `stores` row; `GET /api/stores` lists one "Loblaws" with all their receipts.
- `store.no-false-group`: "Number 1 Chinese" and "Chinese", "Bar 1802" and "Bar", "Cafe No 5" and "Cafe" stay six stores.
- `store.saved-name` (pytest only): after the user's receipts at a merge target, or at a muted store, are purged, the group keeps the name saved on the merge or mute. The purge runs 30 days after a delete, which the API cannot fast-forward, so `backend/tests/api/test_store_merge.py::test_a_merge_target_purged_keeps_the_users_name` and `::test_a_mute_outliving_its_receipts_keeps_the_users_name` cover it; this journey checks the saved columns by SQL.
- `store.own-name`: the other user's receipt created the shared Loblaws row as "LOBLAWS #5555"; this user's receipt, store list and comparison say "Loblaws", a `PATCH` to "LOBLAWS #99" is kept on the receipt, and the history `store` filter finds "#99" but never "#5555".
- `store.list`: `GET /api/stores` lists the user's stores by name with `receipt_count` and `merged_stores`.
- `store.merge`: `POST /api/stores/{id}/merge` groups the Superstore under Loblaws: `/compare` shows one store with all four prices, `stores_below_minimum` counts groups, `/prices` names Loblaws on every point with `store_count` 1, and the `store` filter by either id returns the whole group.
- `store.merge-refused`: merging into its own group is 409; a store the user never shopped at is 404.
- `store.merge-per-user`: another user who shops at both stores still sees two stores; the shared `stores` rows keep their names (no rename, no row joined).
- `store.mute-merged`: a muted store merged into another mutes the merged group: a price change at the target sends no alert, and `muted_stores` lists the group once. Unmuting the group unmutes both.
- `store.alert-name`: a price alert from a merged store names the group's store.
- `store.unmerge`: `DELETE /api/stores/{id}/merge` splits them again (204, idempotent), and the comparison is back to two stores.
- `store.free`: the store list, normalization, receipt names and the history filter answer a free user (driven before `$G premium`); merge and unmerge are free too (`backend/tests/api/test_premium_gating.py::test_store_merge_is_free`). Comparison and mutes are Premium (D8).

## How to get to it (user POV)

Settings → Stores (`mobile/app/settings/stores.tsx`): the user's stores with their receipt counts; Merge on a store opens a sheet ("… is the same store as") listing the others; a merged store shows under its target with "Merged into …" and Unmerge. The screen is UI-only: check it on a simulator with VoiceOver.

## Driving it with gg-verify

```bash
lime() { $G api POST /api/receipts "{\"store_name\":\"$1\",\"date\":\"$2\",\"total\":$3,\"items\":[{\"name\":\"${4:-Limes}\",\"quantity\":1,\"unit_price\":$3,\"total_price\":$3}]}"; }
$G signup store-other                         # another user shops at both banners, first
lime "LOBLAWS #5555" 2026-03-01 1.00 > /dev/null; lime "REAL CANADIAN SUPERSTORE" 2026-03-02 0.80 > /dev/null
$G signup store-merge
lob1=$(lime "Loblaws" 2026-03-01 1.00 | jq -r .id); lob2=$(lime "LOBLAWS #1234" 2026-03-08 1.05 | jq -r .id)
lime "REAL CANADIAN SUPERSTORE" 2026-03-03 0.98 > /dev/null; lime "Real Canadian Superstore - 1520" 2026-03-10 1.02 > /dev/null
lime "FreshCo" 2026-03-04 1.00 Kiwis > /dev/null
for s in "Number 1 Chinese" "Chinese" "Bar 1802" "Bar" "Cafe No 5" "Cafe"; do lime "$s" 2026-03-05 1.00 Kiwis > /dev/null; done
$G api GET /api/stores | jq -c '[.stores[] | [.name, .receipt_count, (.merged_stores | length)]]'
# store.normalize + store.list + store.no-false-group + store.own-name:
# [["Bar",1,0],["Bar 1802",1,0],["Cafe",1,0],["Cafe No 5",1,0],["Chinese",1,0],["FreshCo",1,0],["Loblaws",2,0],["Number 1 Chinese",1,0],["REAL CANADIAN SUPERSTORE",2,0]]
$G sql "SELECT name, normalized_name FROM stores ORDER BY name"   # one row per normalized name; the Loblaws row is "LOBLAWS #5555"
# store.own-name: the receipt keeps its own name; a correction to the same store is kept; the filter sees only own names
$G api GET /api/receipts/$lob1 | jq -r .store_name                                   # Loblaws
$G api PATCH /api/receipts/$lob2 '{"store_name":"LOBLAWS #99"}' | jq -r .store_name  # LOBLAWS #99
$G api GET '/api/receipts?store=%2399' | jq -c '[.items[].id] == ["'$lob2'"]'        # true
$G api GET '/api/receipts?store=%235555' | jq '.total'                               # 0
lob=$($G api GET /api/stores | jq -r '.stores[] | select(.name=="Loblaws") | .id')
rcss=$($G api GET /api/stores | jq -r '.stores[] | select(.name=="REAL CANADIAN SUPERSTORE") | .id')
fresh=$($G api GET /api/stores | jq -r '.stores[] | select(.name=="FreshCo") | .id')
iid=$($G api GET '/api/items?q=limes' | jq -r '.items[0].id')
$G premium                                    # {"status":"applied"}: comparison and mutes are Premium (D8)
$G api GET /api/items/$iid/compare | jq -c '[.stores[] | [.store_name, .observation_count]]'   # two stores, 2 prices each
$G api POST /api/stores/$rcss/merge "{\"into_store_id\":\"$lob\"}" | jq -c '.stores[] | select(.name=="Loblaws")'
# store.merge: receipt_count 4, merged_stores [{REAL CANADIAN SUPERSTORE}]
$G api GET /api/items/$iid/compare | jq -c '{stores: [.stores[] | [.store_id == "'$lob'", .store_name, .observation_count, .avg_price, .latest_price]], stores_below_minimum}'
# [[true,"Loblaws",4,1.01,1.02]], stores_below_minimum 0
$G api GET /api/items/$iid/prices | jq -c '{store_count, names: [.observations[].store_name] | unique}'   # 1, ["Loblaws"]
$G api GET "/api/items/$iid/prices?store=$rcss" | jq '.observations | length'                         # 4
$G api GET /api/items/$iid | jq -c '{store_count, latest: .latest_price.store_name}'                  # 1, "Loblaws"
$G api POST /api/stores/$lob/merge "{\"into_store_id\":\"$rcss\"}"      # store.merge-refused: 409
$G sql "SELECT user_id IS NOT NULL, store_id, target_store_id, store_name, target_name FROM user_store_aliases"   # one row, this user: REAL CANADIAN SUPERSTORE | Loblaws
$G sql "SELECT name FROM stores WHERE name ILIKE '%superstore%' ORDER BY name"                       # store.merge-per-user: names unchanged
# store.mute-merged: mute FreshCo, merge it into Loblaws, then a Limes price change at Loblaws
$G api POST /api/stores/$fresh/mute
$G api POST /api/stores/$fresh/merge "{\"into_store_id\":\"$lob\"}" > /dev/null
$G api GET /api/items/price-alert-settings | jq -c '.muted_stores'      # [{id: $lob, name: "Loblaws"}]
$G sql "SELECT store_name FROM price_alert_store_mutes"                # store.saved-name: FreshCo (saved when muted)
lime "Loblaws" 2026-03-11 2.00 > /dev/null
$G api GET '/api/notifications?per_page=100' | jq '[.items[] | select(.type=="price_change")] | length'   # 0
$G api DELETE /api/stores/$lob/mute
$G api GET /api/items/price-alert-settings | jq -c '.muted_stores'      # []
# store.alert-name: a price change at the merged Superstore names Loblaws
lime "REAL CANADIAN SUPERSTORE" 2026-03-12 2.50 > /dev/null
$G api GET '/api/notifications?per_page=100' | jq -r '.items[] | select(.type=="price_change") | .body'   # "... at Loblaws, up ..."
$G api DELETE /api/stores/$rcss/merge; $G api DELETE /api/stores/$rcss/merge                          # store.unmerge: 204 twice
$G api GET /api/items/$iid/compare | jq -c '[.stores[].store_name] | sort'   # ["Loblaws","REAL CANADIAN SUPERSTORE"]
$G sql "SELECT u.email, count(a.id) FROM users u LEFT JOIN user_store_aliases a ON a.user_id = u.id WHERE u.email LIKE 'store-%' GROUP BY 1 ORDER BY 1"
# store.merge-per-user: only this user has a merge left (FreshCo into Loblaws); the other user has none
$G api POST /api/stores/00000000-0000-0000-0000-0000000000ff/merge "{\"into_store_id\":\"$lob\"}"   # store.merge-refused: 404
```

## Gotchas

- Manual entries confirm at once and record prices, so no scan is needed; the mock scan's store is always `Test Grocery Store`, which cannot show branch numbers.
- `signup` switches every later call to the new user, so the other user's receipts go in first; their grouping is shown by `user_store_aliases` holding only this user's rows, and by `backend/tests/api/test_store_merge.py::test_another_users_merge_never_changes_my_grouping`.
- The 409 and 404 calls make `$G api` exit non-zero: that is the pass.
- The price alert cooldown is per item (7 days on the server clock), so the setup's Limes prices stay within 10% of each other (no alert yet), the mute check comes before the alert-name check, and the alert-name step is the first Limes alert. A setup price 10% off the running average alerts at once and uses up the cooldown, and the later checks then see that one alert (seen in run `20261104-045758`).
- `$G sql` needs the docker shim first on `PATH` in a container without a Docker daemon, as `launch` does.
- The user is free until `$G premium` (`signup` makes no Premium user), so the steps before it prove `store.free`; the merges after it run as Premium, and pytest proves them free.
- Verified 2026-11-04 against Postgres 16 in debug mode (run `20261104-045939`; again with the end-only branch markers and per-receipt store names, run `20261104-052245`; with saved names and the "No." rule, run `20261104-055037`).
- The filler stores (Chinese, Bar) buy Kiwis at one price, so they add no price alert.
- A mute is recorded on the group's store: after `DELETE /api/stores/{id}/merge`, a mute set on the group stays with the group's store, one set before the merge stays with the merged store.
- Run in full with `$G premium` before the first comparison (decision D8) on 2026-11-04: run `20261104-231707`.
