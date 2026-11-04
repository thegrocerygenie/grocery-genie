# Data export, JSON or CSV

A Premium user downloads every receipt, line item, budget and price observation they own (NFR Privacy 2, V1.1; Premium per decision D2) from `GET /api/users/me/export?format=json|csv`: one JSON document, or a zip of `receipts.csv`, `line_items.csv`, `budgets.csv` and `price_observations.csv`. Deleted receipts, their lines and prices, and another user's data are never in it. A free user gets `403 premium_required` with `feature` `data_export`, and the server records `data_exported` only for an export it built.

## Sub-features

- `export-free` a free user's JSON and CSV requests both get `403` with `{"code":"premium_required","feature":"data_export"}`, and no `data_exported` event.
- `export-json` a Premium user's JSON export is a download (`application/json`, `attachment; filename="grocery-genie-export-YYYY-MM-DD.json"`) holding their receipts with their line items, their budget and their price observations.
- `export-csv` the CSV export is `application/zip` with the four files, each with a header row, UTF-8 with a byte order mark.
- `export-escape` a line item named `=HYPERLINK("x")` is `'=HYPERLINK(""x"")` in the CSV files (formula injection escaped) and unchanged in the JSON.
- `export-scope` the other user's receipt, user id and budget, and the user's own deleted receipt, are in neither file.
- `export-event` each export records `data_exported` with its format and counts.

## How to get to it (user POV)

- Settings → ACCOUNT → Export data. A Premium user picks JSON or CSV and taps Export data; the app downloads the file and opens the iOS share sheet (Save to Files, AirDrop, Mail). A free user sees "Export your data with Premium" with See Premium, which opens the paywall. The screen and the share sheet are UI and need a Simulator check; this journey proves the API they call.

## Driving it with gg-verify

Preconditions: a debug-mode instance; `$G doctor` shows no `FAIL`. `$G download PATH` saves the body raw (`NNN-GET-<path>.body`, next to a `.json` with the status, content type and disposition) and prints its path; `$G api` cannot hold a zip. Grant Premium with `$G revenuecat` and the `ev` builder from [premium.md](./premium.md) (its last argument is the app user id).

- **Free (`export-free`).** `$G signup export-free`. `$G api GET '/api/users/me/export?format=json' || true` prints `-> 403`, `.detail` `{"code":"premium_required","feature":"data_export",...}`. `f=$($G download '/api/users/me/export?format=csv') || true; jq -c .detail "$f"` is the same 403 body.
- **Another user's data.** `$G signup export-other`, `other=$($G api GET /api/users/me | jq -r .id)`, `orid=$($G scan | jq -r .receipt_id)`, confirm it, and `$G api POST /api/budgets '{"amount":987.65,"period_type":"monthly","period_start":"2026-03-01"}'`.
- **The Premium user.** `$G signup export`, `uid=$($G api GET /api/users/me | jq -r .id)`, `$G revenuecat "$(ev "x-$uid" INITIAL_PURCHASE $now $((now+30*day)) "$uid")"` is `applied` and `is_premium` is `true`. Scan and confirm one receipt (`rid`). Enter `$G api POST /api/receipts '{"store_name":"Corner Shop","date":"2026-03-20","total":3.5,"items":[{"name":"=HYPERLINK(\"x\")","unit_price":3.5,"total_price":3.5}]}'` (`mid`). Scan, confirm and `DELETE` a third (`gone`, `-> 204`). `$G api POST /api/budgets '{"amount":450,"period_type":"monthly","period_start":"2026-03-01"}'`.
- **JSON (`export-json`, `export-escape`).** `j=$($G download '/api/users/me/export?format=json')` prints `-> 200 (application/json)`; its `.json` shows the attachment filename. `jq` on it: `format_version` `1`, `currency` `USD`, `receipts` is `rid` (Test Grocery Store, 2026-03-15, total 15.95, 3 line items) then `mid` (Corner Shop, 1 line named `=HYPERLINK("x")`), `budgets` is the one 450.0 budget with `category` null, and `price_observations` has 4 rows, all on `rid` or `mid`.
- **CSV (`export-csv`, `export-escape`).** `z=$($G download '/api/users/me/export?format=csv')` prints `-> 200 (application/zip)`. `unzip -l "$z"` lists the four files. `unzip -p "$z" receipts.csv` has a header and the 2 receipts; `line_items.csv` has 4 rows with `receipt_id`, money with two decimals, quantity `1.000`, and the manual line as `"'=HYPERLINK(""x"")"`; `budgets.csv` one row, `450.00`; `price_observations.csv` 4 rows, the manual one also escaped.
- **Scope (`export-scope`).** `grep` for `$other`, `$orid`, `$gone` and `987.65` in the JSON file and in `unzip -p "$z"`: none found. `$G sql "SELECT id, deleted_at IS NOT NULL FROM receipts WHERE user_id = '$uid' ORDER BY date"` shows `gone` deleted, and `price_observations` still holds its 3 rows: the export leaves them out because the receipt is deleted.
- **Event (`export-event`).** `$G sql "SELECT event_name, properties FROM analytics_events WHERE user_id = '$uid' AND event_name = 'data_exported' ORDER BY created_at"` is two rows, `json` then `csv`, each `receipt_count` 2, `line_item_count` 4, `budget_count` 1, `price_observation_count` 4. The same query for the free user prints nothing.

## Gotchas

- Grep for ids, not amounts: a random UUID or timestamp can hold `999` by chance, which is why the other user's budget is `987.65`.
- `$G download` exits non-zero on a status of 400 or more, like `$G api`; add `|| true` when the refusal is the expected result.
- Batched reads for large accounts (more receipts and price observations than one 500-row page), the spooled file closed however the response ends (streamed, client gone first, analytics error), the `'` prefix for `+`, `-`, `@`, tab and carriage return, and the 422 for an unknown `format` are covered by pytest (`backend/tests/api/test_data_export.py`).
