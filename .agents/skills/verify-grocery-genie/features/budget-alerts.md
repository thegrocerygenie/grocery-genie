# Budget alerts

A user with a monthly budget gets one alert when confirmed spending reaches each threshold they have on: 80% and 100% by default, 50% on request (BC-03). Each threshold alerts once per budget period, and the alert states the remaining amount and days left, or the overage at 100%.

## Sub-features

- `alert-thresholds` alerts at each enabled threshold the spend has reached. 80% and 100% are on by default, and 50% is opt-in.
- `alert-opt-in` alerts at 50% once the user turns it on in notification settings.
- `alert-once` adds no second alert for a threshold already alerted in the period.
- `alert-text` shows the remaining amount and days left below 100%, and the overage at 100%.
- `alert-manual` alerts when a manually entered receipt pushes spend over a threshold.
- `alert-push-queued` leaves each alert pending for push delivery (`push_status` empty).

## How to get to it (user POV)

- Budget tab, set a monthly budget, then scan and confirm receipts. Alerts arrive as push notifications.
- Settings, Notification settings, turn on the 50% alert.
- Budget tab, set a monthly budget, then add receipts through Manual entry (History tab).

## Driving it with gg-verify

Preconditions:

- Debug-mode instance; `$G doctor` shows no `FAIL`.
- Each mock scan adds `14.77` to spend (line items; tax is left out). Against an `18.33` budget: one scan is 80.6%, two are 161%, three are 242%.

- **Sign up and budget.** Run `$G signup alerts` and `$G api POST /api/budgets '{"amount":18.33,"period_type":"monthly","period_start":"2026-03-01"}'`. Status 201.
- **First receipt, 80.6% (`alert-thresholds`).** Run `rid=$($G scan | jq -r .receipt_id)` and `$G api PATCH /api/receipts/$rid '{"status":"confirmed"}'`. Then `$G api GET '/api/notifications?per_page=100' | jq -r '.items[].title'` lists only `Budget 80% Reached`.
- **Second receipt, 161%.** Scan and confirm again. The list adds exactly one `Budget Exceeded`.
- **Third receipt, 242% (`alert-once`).** Scan and confirm again. The list still has two alerts. `$G sql "SELECT threshold_percent FROM budget_alerts_sent ORDER BY 1"` prints `80` and `100`, and `$G sql "SELECT count(*) FROM notifications WHERE type='budget_threshold'"` prints `2`.
- **Text (`alert-text`).** Run `$G api GET '/api/notifications?per_page=100' | jq -r '.items[] | "\(.title) | \(.body)"'`. The 80% body is `$3.56 remaining with <n> days left in this period.` The `Budget Exceeded` body is `You've exceeded your budget by $11.21.`
- **Push queued (`alert-push-queued`).** `$G sql "SELECT count(*) FROM notifications WHERE type='budget_threshold' AND push_status IS NULL"` prints `2`. Delivery itself needs the Celery worker and beat plus Expo, so it is out of this journey.
- **50% opt-in (`alert-opt-in`).** Run `$G signup alerts-fifty`, then `$G api PATCH /api/users/me '{"notification_thresholds":{"fifty":true}}'`. The response shows `fifty` `true`. Make the same budget call, then scan and confirm once. The list holds `Budget 50% Reached` and `Budget 80% Reached`.
- **Manual entry (`alert-manual`).** Run `$G signup manual-alert`, the same budget call, then `$G api POST /api/receipts '{"store_name":"Corner Shop","date":"2026-03-20","total":16.00,"items":[{"name":"Rice 5lb","unit_price":16.00,"total_price":16.00}]}'`. Status 201. `$G api GET '/api/dashboard/spending?period=2026-03' | jq .overall.percent` is `87.3`. Expected per BC-03 #1: the notification list holds `Budget 80% Reached`.

## Gotchas

- Alert titles are `Budget 50% Reached`, `Budget 80% Reached`, and `Budget Exceeded` (100%). Match on these, not on a percentage field.
- The March 2026 period has ended, so the alert body says `0 days left`. Do not assert the day count.
- A user who turns a threshold off gets no alert for it. The `notif_threshold_*` columns on `users` hold the settings; read them with `$G sql` when an alert is missing.
- `alert-manual` drives `POST /api/receipts` only, because the Manual entry screen sends no confirming `PATCH`. Never add one to make it pass. It failed until fix `4d81efa` (2026-10-26), which runs the same alert path (`_after_confirm`) when a manual receipt is saved.
