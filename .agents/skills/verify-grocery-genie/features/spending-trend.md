# Spending trend, 3 or 12 months

The Trend screen charts monthly spend split by category, ending at the selected month, with the average of the months before for comparison. The trend is 3 months by default. 12 months is Premium (V1.1, decision D2): a free user who asks for it gets `403 premium_required`, which the app turns into an upgrade prompt.

## Sub-features

- `trend-3` returns the 3 months ending at `period`, oldest first, by default and with `months=3`.
- `trend-12-free` refuses `months=12` for a free user with `403` and `detail.code` `premium_required`, `detail.feature` `trend_12_months`.
- `trend-12-premium` returns 12 months, oldest first, once RevenueCat's webhook has made the user Premium (V11-P0).
- `trend-bad-months` refuses any `months` other than 3 or 12 with `422`.

## How to get to it (user POV)

- Budget tab, Trend. The screen opens on 3 months and asks for `months=3`. The 3 Months / 12 Months toggle at the top asks for `months=12` (V11-06b); a free user sees a "See your whole year" upgrade prompt in place of the chart, and the month-over-month summary and categories stay. The toggle and prompt are UI only: this journey proves the API they read, and a Simulator check proves the screen.

## Driving it with gg-verify

Preconditions:

- Any-mode instance; `$G doctor` shows no `FAIL`.

- **Sign up and add spend.** Run `$G signup trend`, then `rid=$($G scan | jq -r .receipt_id)` and `$G api PATCH /api/receipts/$rid '{"status":"confirmed"}'` (14.77 in 2026-03). Add a manual receipt in the 12-month window but outside the 3-month one: `$G api POST /api/receipts '{"store_name":"Corner Shop","date":"2025-06-10","total":20.00,"items":[{"name":"Rice","unit_price":20.00,"total_price":20.00}]}'`.
- **3 months (`trend-3`).** `$G api GET '/api/dashboard/spending?period=2026-03' | jq -c '[.trend[]|{period,spent}]'` is `[{"period":"2026-01","spent":0.0},{"period":"2026-02","spent":0.0},{"period":"2026-03","spent":14.77}]`. The same call with `&months=3` returns the same trend.
- **12 months, free user (`trend-12-free`).** `$G api GET '/api/dashboard/spending?period=2026-03&months=12'` prints `-> 403` on stderr and exits non-zero (append `|| true`). Its body `.detail` is `{"code":"premium_required","feature":"trend_12_months","message":"This feature is part of Grocery Genie Premium."}`.
- **12 months, Premium user (`trend-12-premium`).** Make the user Premium the way RevenueCat does, through its webhook (see [premium.md](./premium.md)): `uid=$($G api GET /api/users/me | jq -r .id)`, then `$G revenuecat "$(jq -nc --arg u "$uid" --argjson now "$(date +%s000)" '{api_version:"1.0",event:{id:"trend-grant-\($u)",type:"INITIAL_PURCHASE",app_user_id:$u,entitlement_ids:["premium"],product_id:"gg_premium_monthly",event_timestamp_ms:$now,expiration_at_ms:($now+2592000000)}}')"` prints `{"status":"applied"}`. Now `$G api GET '/api/dashboard/spending?period=2026-03&months=12' | jq -c '[.trend[]|.period] | [length, first, last]'` is `[12,"2025-04","2026-03"]`, and the 2025-06 month holds the manual receipt: `jq '.trend[]|select(.period=="2025-06").spent'` is `20.0`.
- **Bad value (`trend-bad-months`).** `$G api GET '/api/dashboard/spending?period=2026-03&months=6' || true` prints `-> 422`.

## Gotchas

- Run `trend-12-free` before `trend-12-premium`: once the webhook grants Premium, the same user gets 12 months.
- The app's own purchase (Apple's sheet, the RevenueCat SDK) cannot run here; the webhook is how the backend learns of it, so it is the real path for the API.
- `prior_average` covers as many months as the trend (3, or 12), ending the month before the trend starts.
