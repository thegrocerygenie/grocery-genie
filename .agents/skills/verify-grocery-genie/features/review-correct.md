# Review and correct a scan

A user reviews a scanned receipt before confirming it (RC-02). The user can correct the store, the date, and each item's name, quantity, and price. Subtotal and total follow price corrections, and tax stays as extracted. Each changed field keeps its original value. An unconfirmed scan waits in History as "Needs review" and adds no spend until it is confirmed.

## Sub-features

- `review-pending-listed` lists an unconfirmed scan in History with `status` `pending_review`, and adds no spend.
- `review-reject-invalid` rejects a future date, a quantity of 0 or less, and a negative price with 422, and changes nothing.
- `review-store-date` corrects the store name and the date.
- `review-item-name` corrects an item's name.
- `review-item-quantity` corrects an item's quantity, keeps its `total_price`, and recomputes its `unit_price`.
- `review-item-price` corrects an item's `total_price`. Subtotal and total move by the same amount, and tax stays the same.
- `review-original-kept` writes one `receipt_corrections` row per changed field, with the original and the corrected value.
- `review-retry-idempotent` repeats the same save, and nothing moves: no new correction rows, no second price move.
- `review-spend-after-confirm` counts the corrected receipt in spend only after `{"status":"confirmed"}`.

## How to get to it (user POV)

- Scan tab, take or import a photo, then the Review screen. Edit the store, the date, or an item, then Confirm.
- History tab, tap a receipt marked "Needs review", which opens the same Review screen.
- The Review screen sends one `PATCH /api/receipts/{id}` with only the changed fields and `"status":"confirmed"` (`buildReceiptUpdate.ts`). Both entry points send that call, so the API journey covers both. The edit UI and the "Needs review" label need a simulator check.

## Driving it with gg-verify

Preconditions:

- Debug-mode instance; `$G doctor` shows no `FAIL`.

- **Sign up.** Run `$G signup review`.
- **Scan.** Run `rid=$($G scan | jq -r .receipt_id)`, then `$G api GET /api/receipts/$rid | jq -c '{status,store_name,date,subtotal,tax,total,items:[.items[]|{raw_name,quantity,unit_price,total_price}]}'`. Status `pending_review`, `Test Grocery Store`, `2026-03-15`, subtotal `14.77`, tax `1.18`, total `15.95`, three items each with quantity `1`.
- **Item ids.** Run `ban=$($G api GET /api/receipts/$rid | jq -r '.items[]|select(.raw_name=="Organic Bananas").id')`, and the same for `milk` (`Whole Milk 1 Gal`) and `towel` (`Paper Towels 6pk`).
- **Listed as pending (`review-pending-listed`).** `$G api GET /api/receipts | jq -c '[.items[]|{id,status}]'` lists `$rid` with `status` `pending_review`. `$G api GET '/api/dashboard/spending?period=2026-03' | jq .overall.spent` is `0`.
- **Reject invalid input (`review-reject-invalid`).** Send each body below with `$G api PATCH /api/receipts/$rid "$bad"`. Each one prints `-> 422` on stderr, and the command exits non-zero. That is the expected result.
  - `bad=$(jq -nc '{date:"2099-01-01"}')`
  - `bad=$(jq -nc --arg i "$milk" '{items:[{id:$i,quantity:0}]}')`
  - `bad=$(jq -nc --arg i "$towel" '{items:[{id:$i,total_price:-1}]}')`

  Then `$G sql "SELECT count(*) FROM receipt_corrections WHERE receipt_id='$rid'"` is `0`, and the receipt from `GET /api/receipts/$rid` still has `2026-03-15`, `pending_review`, and the values from the scan.
- **Save the corrections and confirm (`review-store-date`, `review-item-name`, `review-item-quantity`, `review-item-price`).** Build the body the Review screen sends:

  ```bash
  body=$(jq -nc --arg b "$ban" --arg m "$milk" --arg t "$towel" \
    '{store_name:"Corner Market",date:"2026-03-20",items:[{id:$b,name:"Bananas"},{id:$m,quantity:2},{id:$t,total_price:7.49}],status:"confirmed"}')
  $G api PATCH /api/receipts/$rid "$body" | jq -c '{status,store_name,date,subtotal,tax,total,items:[.items[]|{raw_name,quantity,unit_price,total_price,corrected}]}'
  ```

  Status 200. The response has `confirmed`, `Corner Market`, `2026-03-20`, subtotal `13.77` and total `14.95` (both 1.00 lower, like the price), and tax `1.18`. `Bananas` is `corrected`. `Whole Milk 1 Gal` has quantity `2`, `total_price` `4.99`, and `unit_price` `2.5`. `Paper Towels 6pk` has `total_price` `7.49` and `unit_price` `7.49`. Read it back with `$G api GET /api/receipts/$rid`, and with `$G sql "SELECT status, subtotal, tax, total, date FROM receipts WHERE id='$rid'"`.
- **Original values (`review-original-kept`).** `$G sql "SELECT field, original_value, corrected_value, line_item_id IS NULL AS on_receipt FROM receipt_corrections WHERE receipt_id='$rid' ORDER BY field"` shows exactly five rows:
  - `date`: `2026-03-15` to `2026-03-20`, on the receipt.
  - `name`: `Organic Bananas` to `Bananas`.
  - `quantity`: `1` to `2`.
  - `store_name`: `Test Grocery Store` to `Corner Market`, on the receipt.
  - `total_price`: `8.49` to `7.49`.
- **Retry (`review-retry-idempotent`).** Send the same `$body` again. Status 200, and the response still has subtotal `13.77` and total `14.95`. The `receipt_corrections` count for `$rid` is still `5`.
- **Spend (`review-spend-after-confirm`).** `$G api GET '/api/dashboard/spending?period=2026-03' | jq .overall.spent` is `13.77` (1.29 + 4.99 + 7.49). `$G api GET /api/receipts | jq -c '[.items[]|{id,status}]'` now shows `$rid` as `confirmed`.

## Gotchas

- Subtotal and total cannot be edited directly. They move only by the sum of `total_price` corrections, so a receipt-level discount that is not on any item line stays in them.
- The date check allows one day of slack (the phone's local date can be ahead of server UTC). Use a date far in the future, such as `2099-01-01`, so the 422 never depends on the time of day.
- A 422 rejects the whole body, so a bad field in a save with `"status":"confirmed"` leaves the receipt unconfirmed.
- Spend sums line-item totals and leaves out tax. The corrected receipt adds `13.77`, not its total `14.95`.
- The correction keeps the date inside March, so spend stays under `period=2026-03`. A date moved to another month moves the spend to that month.
- The API returns quantities and spend as floats (`1.0`, `0.0`), and `jq -c` prints them that way. To compare with the values above, compare numbers, for example `jq '.overall.spent+0'`, not strings. `$G sql` prints rows unaligned, as `date|2026-03-15|2026-03-20|t`.
- Build each PATCH body with `jq -nc`, as in [item-correction.md](./item-correction.md). Category corrections and their mappings are covered there, not here.
