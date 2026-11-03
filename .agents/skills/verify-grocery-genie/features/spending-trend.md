# Spending trend, 3 or 12 months

The Trend screen charts monthly spend split by category, ending at the selected month, with the average of the months before for comparison. The trend is 3 months by default. 12 months is Premium (V1.1, decision D2): a free user who asks for it gets `403 premium_required`, which the app turns into an upgrade prompt.

## Sub-features

- `trend-3` returns the 3 months ending at `period`, oldest first, by default and with `months=3`.
- `trend-12-free` refuses `months=12` for a free user with `403` and `detail.code` `premium_required`, `detail.feature` `trend_12_months`.
- `trend-bad-months` refuses any `months` other than 3 or 12 with `422`.

## How to get to it (user POV)

- Budget tab, Trend. The 3/12-month toggle arrives with V11-06b; until then the app only asks for 3 months.

## Driving it with gg-verify

Preconditions:

- Any-mode instance; `$G doctor` shows no `FAIL`.

- **Sign up and add spend.** Run `$G signup trend`, then `rid=$($G scan | jq -r .receipt_id)` and `$G api PATCH /api/receipts/$rid '{"status":"confirmed"}'` (14.77 in 2026-03). Add a manual receipt in the 12-month window but outside the 3-month one: `$G api POST /api/receipts '{"store_name":"Corner Shop","date":"2025-06-10","total":20.00,"items":[{"name":"Rice","unit_price":20.00,"total_price":20.00}]}'`.
- **3 months (`trend-3`).** `$G api GET '/api/dashboard/spending?period=2026-03' | jq -c '[.trend[]|{period,spent}]'` is `[{"period":"2026-01","spent":0.0},{"period":"2026-02","spent":0.0},{"period":"2026-03","spent":14.77}]`. The same call with `&months=3` returns the same trend.
- **12 months, free user (`trend-12-free`).** `$G api GET '/api/dashboard/spending?period=2026-03&months=12'` prints `-> 403` on stderr and exits non-zero (append `|| true`). Its body `.detail` is `{"code":"premium_required","feature":"trend_12_months","message":"This feature is part of Grocery Genie Premium."}`.
- **Bad value (`trend-bad-months`).** `$G api GET '/api/dashboard/spending?period=2026-03&months=6' || true` prints `-> 422`.

## Gotchas

- Nobody is Premium until V11-P0 ships (`is_premium` in `backend/app/core/entitlements.py` returns false), so the Premium 12-month trend cannot be driven through the API yet. pytest covers it with the entitlement overridden (`tests/api/test_dashboard.py::test_dashboard_12_month_trend_for_premium`). Once V11-P0 lands, add a `trend-12-premium` step that makes the user Premium the way the app does and reads 12 months back.
- `prior_average` covers as many months as the trend (3, or 12), ending the month before the trend starts.
