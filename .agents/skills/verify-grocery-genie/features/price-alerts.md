# Price change alerts (V1.1)

Confirming a receipt compares each price with the item's 30-day rolling average (its earlier prices in the same unit and currency). A change of at least the user's threshold, 10% by default, up or down, sends one `price_change` notification naming the item, store, average, new price and percent, with `data` `{canonical_item_id, store_id}`. An item alerts at most once in 7 days. The user can turn alerts off, set their own threshold, and mute an item or a store (PI-03).

## Sub-features

- `pa.settings`: `GET /api/items/price-alert-settings` gives `enabled`, `threshold_percent` (10), `default_threshold_percent`, `cooldown_days` (7), `muted_items`, `muted_stores`; `PUT` changes `enabled` and `threshold_percent` (1-100, `null` resets; 0 is 422).
- `pa.alert`: a third price 10% above the average of two earlier ones sends one alert; its body names item, store, `$4.00` average, `$4.40` new price, `up 10%`; a `price_alerts_sent` row records it.
- `pa.cooldown`: a further change for the same item within 7 days sends nothing.
- `pa.threshold`: with the threshold at 25, a 20% change sends nothing and a 40% change alerts.
- `pa.mute-item`: `POST /api/items/{id}/mute` (204, idempotent) sets `alerts_muted` on the item and lists it in `muted_items`; a muted item's change sends nothing; `DELETE` unmutes.
- `pa.mute-store`: `POST /api/stores/{id}/mute` lists the store in `muted_stores`; a change at that store sends nothing; `DELETE` unmutes.
- `pa.concurrent`: two receipts confirmed at the same moment with the same big change alert once (the ledger's unique key, on Postgres).
- `pa.isolation`: another user muting the item, or a store they never shopped at, gets 404.

## How to get to it (user POV)

A push or the notification list (tapping opens the item, V11-02). Settings → Notifications → Price alerts for the switch and threshold; item detail for Mute item and Mute store (V11-02). The API is complete before the screens.

## Driving it with gg-verify

Manual entries keep each step to one item and set the dates; the window runs back from each receipt's date, and the cooldown runs on the server clock.

```bash
$G signup price-alerts
$G api GET /api/items/price-alert-settings                                   # pa.settings: defaults
$G api PUT /api/items/price-alert-settings '{"threshold_percent":0}'        # pa.settings: 422
milk() { $G api POST /api/receipts "{\"store_name\":\"FreshCo\",\"date\":\"$1\",\"total\":$2,\"items\":[{\"name\":\"$3\",\"quantity\":1,\"unit_price\":$2,\"total_price\":$2}]}" > /dev/null; }
milk 2026-11-01 4.00 Milk; milk 2026-11-02 4.00 Milk
milk 2026-11-03 4.40 Milk                                                    # pa.alert
$G api GET /api/notifications | jq '[.items[] | select(.type=="price_change") | {title, body, data}]'
$G sql "SELECT count(*) FROM price_alerts_sent"                              # 1
milk 2026-11-03 5.00 Milk                                                    # pa.cooldown: still 1 alert
$G api GET /api/notifications | jq '[.items[] | select(.type=="price_change")] | length'
$G api PUT /api/items/price-alert-settings '{"threshold_percent":25}'        # pa.threshold
milk 2026-11-01 3.00 Eggs; milk 2026-11-02 3.00 Eggs
milk 2026-11-03 3.60 Eggs                                                    # +20%: none
milk 2026-11-03 4.48 Eggs                                                    # +40% of 3.20: alert (2 in all)
$G api PUT /api/items/price-alert-settings '{"threshold_percent":null}'      # back to 10
milk 2026-11-01 2.00 Bread; milk 2026-11-02 2.00 Bread
bread=$($G api GET '/api/items?q=bread' | jq -r '.items[0].id')
$G api POST /api/items/$bread/mute; $G api POST /api/items/$bread/mute       # pa.mute-item: 204 twice
$G api GET /api/items/$bread | jq .alerts_muted                              # true
milk 2026-11-03 3.00 Bread                                                   # muted: none
$G api DELETE /api/items/$bread/mute
store=$($G api GET /api/items/$bread/prices | jq -r '.observations[0].store_id')
$G api POST /api/stores/$store/mute                                          # pa.mute-store
$G api GET /api/items/price-alert-settings | jq '{muted_items, muted_stores}'
milk 2026-11-03 3.10 Bread                                                   # store muted: none (still 2)
$G api DELETE /api/stores/$store/mute
milk 2026-11-01 5.00 Butter; milk 2026-11-02 5.00 Butter
milk 2026-11-03 8.00 Butter & milk 2026-11-03 8.00 Butter & wait            # pa.concurrent
$G sql "SELECT title FROM notifications WHERE type='price_change' ORDER BY created_at"  # Milk, Eggs, Butter once
$G sql "SELECT count(*) FROM price_alerts_sent"                              # 3
$G signup other
$G api POST /api/items/$bread/mute; $G api POST /api/stores/$store/mute      # pa.isolation: 404, 404
```

## Gotchas

- An alert needs two earlier prices in the 30 days up to the receipt's date (`GG_PRICE_ALERT_MIN_OBSERVATIONS`). A user's first and second purchase of an item never alert.
- The cooldown counts from when the alert was sent (server clock), not the receipt date, so one run can show only one alert per item. Each sub-feature uses its own item.
- Muting checks happen before the cooldown is claimed, so a muted change does not use up the cooldown.
- The mock scan's items carry `unit_of_measure`; manual entries carry none. The average compares like with like, so a scanned per-lb price and a manual unitless price of the same item are separate series.
- Pushes go through the existing pipeline (`deliver_pending_pushes`), which needs a Celery worker and an Expo token; the journey checks the notification rows. `backend/tests/tasks/test_push_tasks.py::test_a_price_change_push_opens_its_item` covers the push payload.
- Verified 2026-11-03 against Postgres 16 (run `20261103-152228`).
