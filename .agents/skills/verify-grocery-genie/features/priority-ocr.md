# Priority OCR: Premium scans read by a stronger model

Premium users' receipts are read by the Premium extraction model (`GG_LLM_PREMIUM_EXTRACTION_MODEL`, decision D9, PRD PREM-03); free users' by the default model (`GG_LLM_MODEL`). The app sends nothing about it: the backend reads the user's entitlement, which only RevenueCat writes, when extraction starts. Each receipt stores the model that read it (`receipts.extraction_model`), and `receipt_extraction_completed` carries `extraction_tier` (`priority` or `standard`). A Premium model that fails hands the scan to the default model.

## Sub-features

- `ocr-free` a free user's scan is read by the default model: `extraction_model` `mock`, tier `standard`.
- `ocr-premium` after RevenueCat grants Premium, the same user's next scan is read by the Premium model: `extraction_model` `mock:verify/premium-model`, tier `priority`. The scan response and confirm are unchanged.
- `ocr-lapse` after an `EXPIRATION`, the next scan is back on the default model (EC-PREM 3: chosen when extraction starts).

## How to get to it (user POV)

- Nothing to tap: the user scans a receipt as always (Scan tab, capture, review, confirm). The paywall lists "Priority OCR processing" once PREM-03 ships (PREM-01 AC 4, DA-1). What the user sees is a review with fewer corrections; the routing itself shows only in the backend.

## Driving it with gg-verify

Preconditions:

- Debug-mode instance (`$G launch`); `$G doctor` shows no `FAIL`. Debug launch sets `GG_LLM_PREMIUM_EXTRACTION_MODEL=verify/premium-model` (see `launch.txt`, `premium_extraction_model:`), and debug mode stubs that model as the mock extractor named `mock:verify/premium-model`. `$G revenuecat JSON` grants and ends Premium as in [premium.md](./premium.md).

```bash
$G signup priority-ocr
uid=$($G api GET /api/users/me | jq -r .id)
now=$(date +%s000); day=86400000
```

- **Free (`ocr-free`).** `rid=$($G scan | jq -r .receipt_id)`. `$G sql "SELECT extraction_model FROM receipts WHERE id = '$rid'"` is `mock`. `$G sql "SELECT properties->>'extraction_tier' FROM analytics_events WHERE user_id = '$uid' AND event_name = 'receipt_extraction_completed'"` is `standard`.
- **Premium (`ocr-premium`).** `$G revenuecat "{\"api_version\":\"1.0\",\"event\":{\"id\":\"ocr-g-$uid\",\"type\":\"INITIAL_PURCHASE\",\"app_user_id\":\"$uid\",\"aliases\":[\"$uid\"],\"entitlement_ids\":[\"premium\"],\"product_id\":\"gg_premium_monthly\",\"environment\":\"SANDBOX\",\"event_timestamp_ms\":$now,\"expiration_at_ms\":$((now+30*day))}}"` prints `{"status":"applied"}`. `rid2=$($G scan | jq -r .receipt_id)`; the scan prints the usual mock receipt. `$G sql "SELECT extraction_model FROM receipts WHERE id = '$rid2'"` is `mock:verify/premium-model`; the analytics query above now also lists `priority`. `$G api PATCH /api/receipts/$rid2 '{"status":"confirmed"}'` prints `-> 200`.
- **Lapse (`ocr-lapse`).** The same body with id `ocr-e-$uid`, type `EXPIRATION`, `event_timestamp_ms` `$((now+1000))` and `expiration_at_ms` `$now` prints `applied`; `$G api GET /api/users/me | jq .is_premium` is `false`. `rid3=$($G scan | jq -r .receipt_id)`; its `extraction_model` is `mock` again.

## Gotchas

- The app cannot ask for the Premium model: `$G scan` sends no extra fields, so `backend/tests/api/test_priority_ocr.py::test_the_app_cannot_ask_for_the_premium_model` proves that a Premium claim in the form or a header is ignored.
- Debug mode never fails a mock scan, so the fallback (a failed Premium model handing the scan to the default, PREM-03 AC 4) is proven by pytest (`backend/tests/api/test_priority_ocr.py`), not here. With `--live-llm`, set `GG_LLM_PREMIUM_EXTRACTION_MODEL` to a model name your key cannot use to drive it: the scan still answers `200` and `extraction_model` is the default model.
- `--live-llm` does not set a Premium model: without one, Premium scans use the default model (AC 1). Export `GG_LLM_PREMIUM_EXTRACTION_MODEL` on the launch command to test a real one; that costs real API calls.
- Analytics rows are written after the response; if the `analytics_events` query is empty, run it again a second later.
