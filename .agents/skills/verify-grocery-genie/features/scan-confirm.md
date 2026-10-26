# Scan and confirm a receipt

A user photographs or imports a receipt, reviews the extracted store, date, and items, and confirms it. The confirmed receipt then counts toward the month's spend on the dashboard.

## Sub-features

- `scan-extract` uploads a photo and gets back a pending receipt with extracted items.
- `scan-review` reads the pending receipt back for review.
- `scan-confirm` confirms the receipt.
- `scan-spend` shows the confirmed total in the month's spend.
- `scan-live` extracts a real receipt photo with the live LLM (`--live-llm` only).

## How to get to it (user POV)

- Scan tab, take a photo with the camera, then the Review screen, then Confirm.
- Scan tab, import from the photo library or Files, then Review, then Confirm.
- Both entry points send the same `POST /api/receipts/scan` upload, so the API journey covers both. The camera and picker UI need a simulator check.

## Driving it with gg-verify

Preconditions:

- Debug-mode instance; `$G doctor` shows no `FAIL`.

- **Sign up.** Run `$G signup scan`. Prints the new email.
- **Extract (`scan-extract`).** Run `rid=$($G scan | jq -r .receipt_id)`. Status 200. The response has `status` `pending_review`, `extraction.store_name` `Test Grocery Store`, `extraction.total` `15.95`, three items.
- **Review (`scan-review`).** Run `$G api GET /api/receipts/$rid`. Status 200, `status` `pending_review`, three `items` with ids.
- **Confirm (`scan-confirm`).** Run `$G api PATCH /api/receipts/$rid '{"status":"confirmed"}'`. Status 200. Then `$G sql "SELECT status FROM receipts WHERE id='$rid'"` prints `confirmed`.
- **Spend (`scan-spend`).** Run `$G api GET '/api/dashboard/spending?period=2026-03' | jq .overall`. `spent` is `14.77`, the sum of the three items.
- **Live extraction (`scan-live`).** Launch with `GG_LLM_API_KEY` set and `$G launch --live-llm`, then `$G signup scan-live` and `$G scan <photo.jpg|png|heic|pdf>` with a real receipt photo. The extracted store, date, total, and items match the photo. Without a key this sub-feature is unreachable: report it that way.

## Gotchas

- The mock receipt is dated `2026-03-15`, so spend shows under `period=2026-03`, not the current month.
- From the second scan for the same user, `duplicate_warning` is `true`. Confirm still works.
- Spend sums line-item totals and leaves out tax, so it is `14.77`, not the receipt total `15.95`.
- An unconfirmed (`pending_review`) receipt does not count toward spend. Assert spend only after the confirm.
