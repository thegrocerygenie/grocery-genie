# Premium through RevenueCat

Premium ($5.99/month, V1.1 decision D1) is an App Store subscription sold through RevenueCat. The backend never believes the app about it: RevenueCat's webhook (`POST /api/webhooks/revenuecat`, authenticated by a shared secret) and its REST API set the entitlement on the user row, the profile shows it as `is_premium`, and every Premium gate reads it. Premium unlocks the 12-month trend, custom categories ([custom-categories.md](./custom-categories.md)), unlimited receipts and data export ([data-export.md](./data-export.md)) today (D2); a free user asking for any of them gets `403 premium_required` or the monthly `429 receipt_quota_exceeded`. Price history, matching, price alerts and comparison stay free.

## Sub-features

- `premium-free` a new user has `is_premium` false and `premium_expires_at` null on `/api/users/me` and `/api/auth/me`, and `months=12` gets `403 premium_required`.
- `premium-auth` a webhook call with a wrong secret gets `401` with `detail.code` `invalid_webhook_secret` and writes nothing to `revenuecat_events`.
- `premium-grant` an `INITIAL_PURCHASE` event answers `{"status":"applied"}`; the profile shows `is_premium` true and the event's expiry, and `months=12` returns 12 months.
- `premium-replay` the same event id again answers `{"status":"duplicate"}` and leaves one ledger row.
- `premium-renew` a `RENEWAL` moves `premium_expires_at`.
- `premium-stale` an event older than the last applied one answers `{"status":"stale"}` and changes nothing.
- `premium-cancel` a `CANCELLATION` keeps Premium until its expiry.
- `premium-expire` an `EXPIRATION` ends Premium: `is_premium` false, and `months=12` is `403` again.
- `premium-ignored` a `TEST` event answers `ignored`, and an event for an app user id that is no Grocery Genie user answers `unknown_user`; both are `200`, so RevenueCat stops retrying.
- `premium-refresh-unconfigured` `POST /api/users/me/premium/refresh` without a RevenueCat API key answers `503 revenuecat_unavailable` and leaves the entitlement alone.
- `premium-refresh-limit` the refresh is limited per user: the 11th in a minute answers `429` (each one reads RevenueCat).
- `premium-cancel-first` a `CANCELLATION` delivered before the `INITIAL_PURCHASE` it cancels: the late purchase still answers `applied` and makes the user Premium to the cancellation's expiry.
- `premium-unlimited` a Premium user's 21st scan of the month succeeds (a free user's is `429`).
- `premium-quota-free` a free user with 20 receipts this month: the next scan is `429` with `code` `receipt_quota_exceeded`, `feature` `unlimited_receipts`, `limit` 20 and the old `detail` string; a manual entry still answers `201`.
- `premium-free-features` the same free user gets `200` (`204` for a mute) on price history, comparison, item list and suggestions, price alert settings, mute and unmute, and notifications; the 3-month trend is `200`, 12 months `403 premium_required`.
- `premium-delete` deleting the account deletes its `revenuecat_events` rows.

## How to get to it (user POV)

- Settings, Premium row ("Free plan · Upgrade"), opens the paywall: what Premium unlocks, the App Store price, Subscribe, Restore Purchases, Terms of Use and Privacy Policy. The Trend screen's "See your whole year" prompt opens the same paywall. After Apple's purchase sheet, the app calls `POST /api/users/me/premium/refresh` and shows Premium only once the profile says `is_premium`. The paywall, the SDK and Apple's sheet are UI and need a development build on a device with a sandbox Apple ID (`docs/DEPLOYMENT.md` 2.9); this journey proves what the backend does with RevenueCat's events.

## Driving it with gg-verify

Preconditions:

- Debug-mode instance; `$G doctor` shows no `FAIL`. `launch` sets a random `GG_REVENUECAT_WEBHOOK_SECRET` (kept in state, never in evidence) and no `GG_REVENUECAT_API_KEY`; `$G revenuecat JSON` posts with that secret, `--secret VALUE` with another.

Set up the user and an event builder (RevenueCat's body, trimmed to the fields the backend reads; times in epoch ms):

```bash
$G signup premium
uid=$($G api GET /api/users/me | jq -r .id)
now=$(date +%s000); day=86400000
ev() {  # ev ID TYPE EVENT_AT EXPIRES_AT [APP_USER_ID]
  jq -nc --arg id "$1" --arg t "$2" --argjson at "$3" --argjson exp "$4" --arg u "${5:-$uid}" \
    '{api_version:"1.0",event:{id:$id,type:$t,app_user_id:$u,aliases:[$u],entitlement_ids:["premium"],product_id:"gg_premium_monthly",environment:"SANDBOX",event_timestamp_ms:$at,expiration_at_ms:$exp}}'
}
```

- **Free (`premium-free`).** `$G api GET /api/users/me | jq -c '{is_premium,premium_expires_at}'` is `{"is_premium":false,"premium_expires_at":null}`; the same from `/api/auth/me`. `$G api GET '/api/dashboard/spending?period=2026-03&months=12' || true` prints `-> 403` with `.detail.code` `premium_required`.
- **Wrong secret (`premium-auth`).** `$G revenuecat "$(ev "g-$uid" INITIAL_PURCHASE $now $((now+30*day)))" --secret wrong || true` prints `-> 401` and `{"detail":{"code":"invalid_webhook_secret",...}}`. `$G sql "SELECT event_id FROM revenuecat_events WHERE event_id = 'g-$uid'"` prints nothing, and the profile is still free.
- **Grant (`premium-grant`).** `$G revenuecat "$(ev "g-$uid" INITIAL_PURCHASE $now $((now+30*day)))"` prints `{"status":"applied"}`. `$G api GET /api/users/me | jq .is_premium` is `true` and `premium_expires_at` is 30 days out; `/api/auth/me` agrees. `$G sql "SELECT premium_active, premium_product_id FROM users WHERE id = '$uid'"` is `t|gg_premium_monthly`. `$G api GET '/api/dashboard/spending?period=2026-03&months=12' | jq '.trend|length'` is `12`.
- **Replay (`premium-replay`).** The same `$G revenuecat "$(ev "g-$uid" INITIAL_PURCHASE $now $((now+30*day)))"` prints `{"status":"duplicate"}`. `$G sql "SELECT event_type, outcome FROM revenuecat_events WHERE user_id = '$uid'"` is one row, `INITIAL_PURCHASE|applied`.
- **Renew (`premium-renew`).** `$G revenuecat "$(ev "r-$uid" RENEWAL $((now+1000)) $((now+60*day)))"` is `applied`; `premium_expires_at` is now 60 days out.
- **Stale (`premium-stale`).** `$G revenuecat "$(ev "s-$uid" EXPIRATION $((now-1000)) $now)"` is `{"status":"stale"}`; the profile is still Premium with the 60-day expiry.
- **Cancel (`premium-cancel`).** `$G revenuecat "$(ev "c-$uid" CANCELLATION $((now+2000)) $((now+60*day)))"` is `applied`; `is_premium` stays `true` (auto-renew off, paid to the period's end).
- **Expire (`premium-expire`).** `$G revenuecat "$(ev "e-$uid" EXPIRATION $((now+3000)) $now)"` is `applied`; `is_premium` is `false`, and `months=12` prints `-> 403` again.
- **Ignored (`premium-ignored`).** `$G revenuecat "$(ev "t-$uid" TEST $now $now)"` is `{"status":"ignored"}`. `$G revenuecat "$(ev "u-$uid" INITIAL_PURCHASE $now $((now+30*day)) 00000000-0000-0000-0000-00000000dead)"` is `{"status":"unknown_user"}`. Both exit 0.
- **Refresh, no API key (`premium-refresh-unconfigured`).** `$G api POST /api/users/me/premium/refresh || true` prints `-> 503` with `.detail.code` `revenuecat_unavailable`; `is_premium` is unchanged.
- **Refresh limit (`premium-refresh-limit`).** Right after the step above, `for i in $(seq 1 10); do $G api POST /api/users/me/premium/refresh || true; done` prints `-> 503` nine times, then `-> 429`: ten refreshes a minute (`GG_MAX_PREMIUM_REFRESHES_PER_MINUTE`), counted apart from the 300 requests a minute.
- **Unlimited receipts (`premium-unlimited`).** `$G revenuecat "$(ev "g2-$uid" UNCANCELLATION $((now+4000)) $((now+30*day)))"` is `applied`. Then `for i in $(seq 1 21); do $G scan > /dev/null || echo "scan $i failed"; done` prints no failure: 21 scans this month, past the free plan's 20.
- **Delete (`premium-delete`).** `$G api DELETE /api/users/me` prints `-> 204`. `$G sql "SELECT event_id FROM revenuecat_events WHERE user_id = '$uid' OR event_id IN ('g-$uid','r-$uid','s-$uid','c-$uid','e-$uid','g2-$uid')"` prints nothing. The `TEST` and unknown-user rows (`t-`, `u-`) stay: they were never linked to the user (`user_id` null).
- **Cancellation first (`premium-cancel-first`).** After the delete, `$G signup premium-oo` and `uid=$($G api GET /api/users/me | jq -r .id)`. `$G revenuecat "$(ev "oc-$uid" CANCELLATION $((now+5000)) $((now+10*day)))"` is `applied` and `is_premium` stays `false` (nothing bought yet). Then the older purchase, `$G revenuecat "$(ev "op-$uid" INITIAL_PURCHASE $now $((now+30*day)))"`, is `applied`, not `stale`: `is_premium` is `true` and `premium_expires_at` is 10 days out, the cancellation's expiry.
- **Free user at the cap (`premium-quota-free`).** Last, in a fresh user (`$G signup quota`, `uid=$($G api GET /api/users/me | jq -r .id)`, `today=$(date -u +%F)`), make 20 manual entries this month, half at each of two stores: `lime() { $G api POST /api/receipts "{\"store_name\":\"$1\",\"date\":\"$today\",\"total\":$2,\"items\":[{\"name\":\"Limes\",\"quantity\":1,\"unit_price\":$2,\"total_price\":$2}]}" > /dev/null; }` then `for i in $(seq 1 10); do lime FreshCo 0.80; lime Loblaws 1.00; done` (20 times `-> 201`). `$G scan || true` prints `-> 429` and `{"detail":"Monthly receipt quota exceeded (20 receipts/month on Free tier).","code":"receipt_quota_exceeded","feature":"unlimited_receipts","limit":20}`. One more manual entry is still `-> 201`.
- **Free features stay free (`premium-free-features`).** Same user, still free: `iid=$($G api GET '/api/items?q=limes' | jq -r '.items[0].id')`. `GET /api/items/$iid/prices` is `200` with 21 observations (the 20 entries and the one after the cap); `GET /api/items/$iid/compare` lists `["FreshCo","Loblaws"]`; `GET /api/items/suggestions`, `GET` and `PUT /api/items/price-alert-settings '{"threshold_percent":15}'` and `GET /api/notifications` are `200`; `POST` and `DELETE /api/items/$iid/mute` are `204`. `GET /api/dashboard/spending` is `200` with 3 months; `months=12` is `-> 403` `premium_required`. Then `$G revenuecat "$(ev "q-$uid" INITIAL_PURCHASE $now $((now+30*day)))"` is `applied`, and the next two `$G scan` calls are `-> 200` (`premium-unlimited` on the same user) and `months=12` returns 12.

## Gotchas

- Each event id must be new per run: the ids above end in the user's id. Reusing an id from an earlier step is the replay check, not a new event.
- Order matters: `event_timestamp_ms` older than the last applied event is `stale`, which is why each step's event time grows (`now+1000`, `+2000`, ...).
- `premium-unlimited` makes 21 scans: run it before the delete, and keep the hourly limit (50 receipt submissions) in mind if you rerun it on the same user.
- The REST refresh with a real key (and a webhook landing during its read), `TRANSFER` events, refund cancellations and two concurrent deliveries of one event are covered by pytest (`backend/tests/api/test_revenuecat_webhook.py`, `backend/tests/services/test_premium_service.py` and `backend/tests/services/test_revenuecat_client.py`) with RevenueCat's API mocked: this instance never calls RevenueCat.
- `premium-quota-free` makes 21 receipt submissions on one user and the Premium scans after it two more: with `premium-unlimited`'s 21 on another user that stays under the hourly limit (50 per user). The cap counts receipts by creation time this month, so the manual entries' `date` does not matter.
- The app turns `receipt_quota_exceeded` into the upgrade prompt (See Premium, Enter manually), not an error, and once the profile says `is_premium` it offers a capped queued photo an upload again (Upload now); that is UI, covered by jest and the manual checklist in `docs/prd/13-validation-strategy.md`.
