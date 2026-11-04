# Cross-store price comparison (V1.1)

An item's price at each store the user has bought it from, side by side (PI-04): the latest price and the average, cheapest store first. A store needs 2 prices of the item to be compared, and only prices in the item's main unit and currency count. Premium (decision D8, PREM-02): a free user gets `403 premium_required` ([premium.md](./premium.md) `premium-free-features`), so this journey makes its users Premium with `$G premium`.

## Sub-features

- `pi.compare`: `GET /api/items/{id}/compare` lists each store with `latest_price`, `latest_date`, `avg_price` and `observation_count`, cheapest first by average.
- `pi.compare-minimum`: a store with 1 price is left out and counted in `stores_below_minimum`.
- `pi.compare-own-stores`: a store only another user bought from never shows; a deleted receipt's price leaves the comparison (its store drops below the minimum) and comes back on restore.
- `pi.compare-like-for-like`: a price in another currency counts toward no store.
- `pi.compare-isolation`: another user's item answers 404.

## How to get to it (user POV)

Budget tab → Price history (Prices list) → an item → Compare stores (PI-04 AC 4, `mobile/src/features/price-intelligence/components/StoreComparison.tsx`): each store's average and latest price, the cheapest named, and a line counting `stores_below_minimum`. The section is UI-only: check it on a simulator.

## Driving it with gg-verify

```bash
lime() { $G api POST /api/receipts "{\"store_name\":\"$1\",\"date\":\"$2\",\"total\":$3,${4:+\"currency\":\"$4\",}\"items\":[{\"name\":\"Limes\",\"quantity\":1,\"unit_price\":$3,\"total_price\":$3}]}"; }
$G signup compare-other                      # another user buys Limes at Costco twice
lime Costco 2026-03-01 0.20 > /dev/null; lime Costco 2026-03-02 0.20 > /dev/null
$G signup compare
$G premium                                   # {"status":"applied"}: comparison is Premium (D8)
lime FreshCo 2026-03-01 0.60 > /dev/null; lime FreshCo 2026-03-15 0.80 > /dev/null
lime Loblaws 2026-03-03 0.90 > /dev/null; rid=$(lime Loblaws 2026-03-20 1.10 | jq -r .id)
lime Metro 2026-03-05 0.40 > /dev/null
lime "Duty Free" 2026-03-06 0.30 EUR > /dev/null; lime "Duty Free" 2026-03-07 0.30 EUR > /dev/null
iid=$($G api GET '/api/items?q=limes' | jq -r '.items[0].id')
$G api GET /api/items/$iid/compare | jq -c '{currency, min_observations, stores_below_minimum, stores: [.stores[] | [.store_name, .latest_price, .latest_date, .avg_price, .observation_count]]}'
# pi.compare: FreshCo [0.8, 2026-03-15, 0.7, 2] then Loblaws [1.1, 2026-03-20, 1.0, 2]
# pi.compare-minimum: Metro absent, stores_below_minimum 1
# pi.compare-like-for-like: currency USD, Duty Free (EUR) absent
# pi.compare-own-stores: Costco (the other user's) absent
$G api DELETE /api/receipts/$rid
$G api GET /api/items/$iid/compare | jq -c '[[.stores[].store_name], .stores_below_minimum]'   # pi.compare-own-stores: [["FreshCo"],2]
$G api POST /api/receipts/$rid/restore > /dev/null
$G api GET /api/items/$iid/compare | jq -c '[.stores[].store_name]'                            # ["FreshCo","Loblaws"]
$G sql "SELECT s.name, o.currency, count(*), round(avg(o.unit_price), 2) FROM price_observations o JOIN stores s ON s.id = o.store_id GROUP BY 1, 2 ORDER BY 1"   # Costco is in the database
$G signup compare-third && $G premium && $G api GET /api/items/$iid/compare                   # pi.compare-isolation: 404
```

## Gotchas

- Manual entries carry no `unit_of_measure`, so the comparison's `unit_of_measure` is null; a scan supplies one. Unit mismatches are covered by `backend/tests/api/test_price_comparison.py::test_only_like_for_like_prices_are_compared`, since the mock scan always returns the same three items.
- `signup` switches every later call to the new user, so the other user's Costco prices go in first.
- Stores are shared rows matched by name; the `sql` check groups every user's observations, Costco included, which is the point: it is in the database but not in this user's comparison.
- The last call answers 404, so `$G api` exits non-zero there: that is the pass. The third user is Premium first: a free user gets `403 premium_required` before the item is looked up.
- Verified 2026-11-03 against Postgres 16 in debug mode (run `20261103-151240`; again with the app's screen built, run `20261103-183706`).
