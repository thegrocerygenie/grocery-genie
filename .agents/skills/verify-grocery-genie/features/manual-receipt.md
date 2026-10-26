# Manual receipt entry

A user who cannot scan a receipt enters the store, date, and items by hand. The saved receipt is confirmed at once and counts toward spend.

## Sub-features

- `manual-create` saves a receipt with its items.
- `manual-read` shows it in the receipt list and in its detail view.
- `manual-spend` adds its total to the month's spend.

## How to get to it (user POV)

- History tab, Manual entry, fill store and items, Save.
- After a failed scan, choose Manual entry.

## Driving it with gg-verify

Preconditions:

- Any-mode instance; `$G doctor` shows no `FAIL`.

- **Sign up.** Run `$G signup manual`.
- **Create (`manual-create`).** Run `mid=$($G api POST /api/receipts '{"store_name":"Corner Shop","date":"2026-03-20","total":7.50,"items":[{"name":"Eggs 12ct","unit_price":4.00,"total_price":4.00},{"name":"Bread","unit_price":3.50,"total_price":3.50}]}' | jq -r .id)`. Status 201, `status` `confirmed`, two items.
- **Read (`manual-read`).** Run `$G api GET /api/receipts/$mid` (store `Corner Shop`, total `7.5`) and `$G api GET /api/receipts | jq '[.items[].id]'` (contains `$mid`). Then `$G sql "SELECT count(*) FROM line_items WHERE receipt_id='$mid'"` prints `2`.
- **Spend (`manual-spend`).** Run `$G api GET '/api/dashboard/spending?period=2026-03' | jq .overall.spent`. It is `7.5`.

## Gotchas

- The app sends `total` as the sum of item prices. Keep the two consistent so spend matches what the app would show.
- A manual receipt does not trigger budget alerts; `budget-alerts.md` (`alert-manual`) tracks that gap.
