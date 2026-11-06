# Spending trend: range chips 1M, 3M, 6M, 1Y, All

The Trend screen charts monthly spend ending at the selected month, with the average of as many months before for comparison. Its range chips ask for `months=1|3|6|12|all` (BC-04 AC 6, DA-10). 1M and 3M are free; 6M, 1Y and All are Premium (decisions D2 and D11): the server, never the app, answers a free user `403 premium_required`, which the app turns into an upgrade prompt. All starts at the period holding the user's own first receipt.

## Sub-features

- `trend-3` returns the 3 months ending at `period`, oldest first, by default and with `months=3`; `prior_average` is the mean of the 3 months before.
- `trend-1` returns just `period` for a free user, with `prior_average` the month before.
- `trend-current-period` names the period holding today in `current_period`, whichever `period` was asked for (the app tints that bar and leaves it out of Highlights' Lowest).
- `trend-long-free` refuses `months=6`, `12` and `all` for a free user with `403`, `detail.code` `premium_required`, `detail.feature` `trend_12_months` (one feature id for every Premium range).
- `trend-6`, `trend-12` return 6 and 12 months, oldest first, once RevenueCat's webhook has made the user Premium, with `prior_average` over as many months before (`0.0` when the user's history starts inside them).
- `trend-all` starts at the user's first receipt's period (another user's older receipt never counts), and `prior_average` is `0.0`.
- `trend-bad-months` refuses any other `months` (`2`, `24`, `ALL`) with `422`.

## How to get to it (user POV)

- Budget tab, Trend. The screen opens on 3M and asks for `months=3`. The chips under the chart ask for their range; a free user's 6M, 1Y or All shows a "See more of your spending" upgrade prompt in place of the chart and Highlights, and the month-over-month card stays. The headline ("N-month average", "YoY" on 1Y), Highlights (highest; lowest without empty or current months; trend as the headline's change, halves for All), grey bars with the current month tinted, and the prompt are UI only: this journey proves the API they read, and a Simulator check proves the screen (`docs/device-checklist.md`, "Trend range chips").

## Driving it with gg-verify

Preconditions:

- Any-mode instance; `$G doctor` shows no `FAIL`.

```bash
receipt() { $G api POST /api/receipts "{\"store_name\":\"$1\",\"date\":\"$2\",\"total\":$3,\"items\":[{\"name\":\"Rice\",\"quantity\":1,\"unit_price\":$3,\"total_price\":$3}]}" > /dev/null; }
$G signup trend-other; receipt "Corner Shop" 2024-01-10 99.00     # another user's older receipt
$G signup trend
rid=$($G scan | jq -r .receipt_id); $G api PATCH /api/receipts/$rid '{"status":"confirmed"}'   # 14.77 in 2026-03
receipt "Corner Shop" 2025-06-10 20.00; receipt "Corner Shop" 2025-11-05 30.00; receipt "Corner Shop" 2026-02-14 10.00
D='/api/dashboard/spending?period=2026-03'
$G api GET "$D" | jq -c '[[.trend[]|[.period,.spent]], .prior_average]'
# trend-3: [[["2026-01",0],["2026-02",10],["2026-03",14.77]],10]   (Oct-Dec 2025: 30 / 3)
$G api GET "$D&months=1" | jq -c '[[.trend[]|[.period,.spent]], .prior_average]'
# trend-1: [[["2026-03",14.77]],10]                                  (February)
$G api GET "$D" | jq -c '{period, current_period}'                # trend-current-period: current_period is today's month
$G api GET "$D&months=6" | jq -c .detail || true                  # trend-long-free: -> 403 premium_required, trend_12_months
$G api GET "$D&months=12" | jq -c .detail || true                 # same
$G api GET "$D&months=all" | jq -c .detail || true                # same
$G api GET "$D&months=2" || true                                   # trend-bad-months: -> 422 (also 24, ALL)
$G premium                                                         # {"status":"applied"} through the RevenueCat webhook
$G api GET "$D&months=6" | jq -c '[[.trend[]|.spent], .prior_average]'
# trend-6: [[0,30,0,0,10,14.77],0.0]                                (Apr-Sep 2025 starts before the first receipt, 2025-06-10: no fair comparison, BC-04 AC 7)
$G api GET "$D&months=12" | jq -c '{n:(.trend|length), first:.trend[0].period, last:.trend[-1].period}'
# trend-12: {"n":12,"first":"2025-04","last":"2026-03"}
$G api GET "$D&months=all" | jq -c '{n:(.trend|length), first:.trend[0].period, prior:.prior_average}'
# trend-all: {"n":10,"first":"2025-06","prior":0.0}                 (not 2024-01: that receipt is the other user's)
```

## Gotchas

- Run `trend-long-free` before `$G premium`: once the webhook grants Premium, the same user gets every range.
- `signup` switches every later call to the new user, so the other user's receipt goes in first.
- The app's own purchase (Apple's sheet, the RevenueCat SDK) cannot run here; the webhook is how the backend learns of it, so it is the real path for the API.
- `prior_average` covers as many months as the trend, ending the month before the trend starts; for All it is `0.0`, and also when the user's first receipt is after that window starts (BC-04 AC 7), as for `trend-6` here.
- Verified 2026-11-05 against Postgres 16 in debug mode for DA-10 (run `20261105-201426`).
- BC-04 AC 7 follow-up (no change when history starts inside the prior window; `trend-6` now `0.0`): run `20261105-222832`.
