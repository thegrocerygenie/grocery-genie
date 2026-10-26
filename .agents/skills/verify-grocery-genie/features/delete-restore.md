# Delete and restore a receipt

A user deletes a receipt and can restore it from Recently deleted within the retention window (30 days). A deleted receipt drops out of lists and spend until it is restored.

## Sub-features

- `delete-soft` removes the receipt from the list and from spend.
- `delete-listed` shows it in Recently deleted with days remaining.
- `delete-restore` brings it back to the list and to spend.

## How to get to it (user POV)

- History tab, open a receipt, Delete.
- Settings, Recently deleted, Restore.

## Driving it with gg-verify

Preconditions:

- Debug-mode instance; `$G doctor` shows no `FAIL`.

- **Sign up and confirm a receipt.** Run `$G signup delete`, `rid=$($G scan | jq -r .receipt_id)`, and `$G api PATCH /api/receipts/$rid '{"status":"confirmed"}'`. `$G api GET '/api/dashboard/spending?period=2026-03' | jq .overall.spent` is `14.77`.
- **Delete (`delete-soft`).** Run `$G api DELETE /api/receipts/$rid`. Status 204. `$G api GET /api/receipts | jq '[.items[].id]'` no longer contains `$rid`, and the March spend is `0.0`. `$G sql "SELECT deleted_at IS NOT NULL FROM receipts WHERE id='$rid'"` prints `t`.
- **Listed (`delete-listed`).** Run `$G api GET /api/receipts/recently-deleted`. One entry with `id` `$rid`, `type` `receipt`, and `days_remaining` `30` or `29`.
- **Restore (`delete-restore`).** Run `$G api POST /api/receipts/$rid/restore`. Status 200. The receipt is back in `GET /api/receipts`, and the March spend is `14.77` again.

## Gotchas

- `GET /api/receipts/$rid` on a deleted receipt returns 404. That is the intended behavior, not a failure.
- Restoring after the retention window returns 410. This journey cannot reach it without waiting 30 days, so report it as unreachable.
