# Timed price alert mutes (V1.1, DA-7)

Both mute `POST`s (`/api/items/{id}/mute`, `/api/stores/{id}/mute`) take an optional `{"until": "<ISO 8601>"}`: none or `null` is forever, a time not in the future (or not a time) is `422`, an offset is stored as UTC, and muting again replaces the time (PI-03 AC 11). A timed mute ends by itself: the alert check compares `muted_until` with the server clock when a receipt is confirmed, so a confirm at or after it alerts, an ended mute is no longer listed, and nothing is sent afterwards for prices confirmed during it (AC 12, EC-PI 4). Muting is Premium (D8); a timed mute made while Premium runs to its end after a lapse, changing its time is `403 premium_required`, and it can always be removed (EC-PI 5). The basic mutes are in [price-alerts.md](./price-alerts.md); the untimed lapse in [premium.md](./premium.md).

## Sub-features

- `tm.until-api`: a past `until` is `422` (`until must be in the future`), `"soon"` is `422`; `"2026-12-05T12:00:00+02:00"` reads back on item detail as `muted_until` `"2026-12-05T10:00:00Z"`; a mute with no body replaces it with forever (`muted_until` `null`).
- `tm.expiry`: an item mute and a store mute ending about 90 seconds ahead. Confirms during them send nothing and claim no cooldown (`price_alerts_sent` empty); `price-alert-settings` lists both with their `muted_until`; the database holds them in UTC.
- `tm.lapse`: Premium lapses (RevenueCat `EXPIRATION`) while they run: still listed, item detail still `alerts_muted`, and `POST` with a new `until` is `403` `premium_required` (`price_alert_mute`).
- `tm.merge`: a mute and a merge of the same item (DA-11). Kiwis muted until a date, Pears muted forever; merging Kiwis into Pears leaves one mute row, on Pears, forever (the later end). A mute `POST` or `DELETE` on the merged-away Kiwis is `404`, never a 500. Muting and unmuting lock the item row first, so a mute racing a merge runs before or after it; the race itself is proven on Postgres by `backend/tests/services/test_mute_merge_concurrency.py` (two API calls cannot be made to overlap on cue).
- `tm.ended`: once the time passes, with no job run, `muted_items` and `muted_stores` are `[]` and item detail reads `{"alerts_muted":false,"muted_until":null}`; no alert appeared for the prices confirmed during the mutes; the next confirm of each item alerts ("Kiwis up 37%", "Pears up 37%"), for the now-free user; `DELETE` on both ended mutes is `204`.

The Alerts screen (item detail → Alerts row: "On", "Muted", "Muted until <date>"; the item's "Price alerts" switch with "Mute until" under it while muted; a switch per store that asks "Mute until"; the store-mute note and the footer) and Settings → Alerts ("Until <date>" / "Forever", an inline error on a failed unmute) are UI: check them on a simulator.

## Drive

One fresh Premium user; literal ids from each read go into the next call (`$K` Kiwis, `$L` Loblaws). Receipts are manual entries, saved confirmed.

```bash
$G signup timed; $G premium
# history: Kiwis at FreshCo and Pears at Loblaws, 1.00 on 2026-11-01 and 11-02 (POST /api/receipts)
$G api POST /api/items/$K/mute '{"until":"2020-01-01T00:00:00Z"}' || true     # tm.until-api: 422
$G api POST /api/stores/$L/mute '{"until":"soon"}' || true                     # 422
$G api POST /api/items/$K/mute '{"until":"2026-12-05T12:00:00+02:00"}'
$G api GET /api/items/$K | jq -c '{alerts_muted, muted_until}'                 # ... "2026-12-05T10:00:00Z"
$G api POST /api/items/$K/mute; $G api GET /api/items/$K | jq -c .muted_until  # null
date -u -d '+90 seconds' +%Y-%m-%dT%H:%M:%SZ                                   # END
$G api POST /api/items/$K/mute '{"until":"END"}'; $G api POST /api/stores/$L/mute '{"until":"END"}'   # tm.expiry
# Kiwis at FreshCo 1.50, Pears at Loblaws 1.50, dated today: 0 price_change notifications
$G sql "SELECT canonical_item_id, muted_until FROM price_alert_item_mutes"
$G revenuecat '<EXPIRATION for the user, event time now>'                      # tm.lapse
$G api POST /api/items/$K/mute '{"until":"2026-12-31T00:00:00Z"}' || true      # 403 premium_required
# wait until END has passed                                                    # tm.ended
$G api GET /api/items/price-alert-settings | jq -c '{muted_items, muted_stores}'   # both []
# Kiwis 1.60, Pears 1.60: two alerts, "Pears up 37%", "Kiwis up 37%"
$G api DELETE /api/items/$K/mute; $G api DELETE /api/stores/$L/mute            # 204, 204
$G signup mutemerge; $G premium                                                # tm.merge
# Kiwis ($A) and Pears ($B) at FreshCo, 1.00 each, one manual receipt
$G api POST /api/items/$A/mute '{"until":"2026-12-05T12:00:00Z"}'; $G api POST /api/items/$B/mute   # 204, 204
$G api POST /api/items/$A/merge '{"into_item_id":"$B"}' | jq -c '{canonical_name, alerts_muted, muted_until}'   # Pears, true, null
$G api POST /api/items/$A/mute || true; $G api DELETE /api/items/$A/mute || true   # 404, 404
$G sql "SELECT canonical_item_id, muted_until FROM price_alert_item_mutes"     # one row: $B, forever
```

## Gotchas

- The worktree permission check refuses a shell variable inside a `gg-verify` call in some compound commands: paste the literal ids and the END time.
- The wait is real time (no clock to move on a running server), so keep the end close: about 90 seconds covers the steps between.

## Verified

2026-11-05 against Postgres 16 in debug mode, run `20261105-173004` (DA-7). `tm.merge` verified 2026-11-05, run `20261105-231524` (DA-11; no 500 in `server.log`).
