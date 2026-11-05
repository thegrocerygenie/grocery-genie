# Validation Strategy

How we verify that the implementation is correct, complete, and fully realizes the product vision. This document defines the testing pyramid, validation checkpoints, and acceptance verification process for each delivery phase.

## Validation Principles

- Every user story acceptance criterion maps to at least one automated test.
- LLM outputs are probabilistic — validation must account for variance, not just happy paths.
- The receipt extraction pipeline is the foundation. If extraction is wrong, everything downstream is wrong. It gets the heaviest validation investment.
- Validation happens at every layer: unit, integration, LLM quality, E2E flow, and acceptance verification.
- Each phase has a Definition of Done checklist that must pass before the phase ships.

## Testing Pyramid

### Layer 1: Unit Tests

Verify individual functions, services, and components in isolation.

**Backend (pytest):**
- Pydantic model validation: correct schemas accept valid data, reject invalid data.
- Service logic: budget calculations, category assignment from override dictionary, threshold evaluation, spending aggregation.
- Event dispatcher: correct events published with correct payloads.
- Image preprocessing: blur detection returns correct quality scores for known test images.
- LLM prompt construction: prompts assembled correctly with all required instructions.

**Mobile (Jest + RNTL):**
- Component rendering: receipt review screen displays all extracted fields.
- State management: Zustand stores update correctly on receipt confirmation, budget changes.
- Data transformation: currency formatting, date parsing, category mapping.
- Form validation: budget amount inputs, correction fields.

**Coverage target:** ≥80% line coverage for services/ and models/. Components tested for rendering and user interaction, not pixel-level layout.

### Layer 2: Integration Tests

Verify that components work together across service boundaries.

**Backend API tests (pytest + httpx.AsyncClient):**
- Full request → route → service → database → response cycle for each endpoint.
- Test against a real PostgreSQL instance (use testcontainers or a dedicated test DB).
- Verify database state after operations (receipt persisted with correct fields, budget updated).
- Verify domain events are published after receipt confirmation.
- Test error paths: invalid image format rejected, validation failures return correct error shapes.
- Test concurrent receipt submissions don't corrupt budget aggregations.

**Mobile API integration (Jest with MSW or similar mock server):**
- TanStack Query hooks fetch, cache, and invalidate correctly.
- Error states (network failure, 4xx, 5xx) handled gracefully in UI.
- Offline queue: receipts queued when network unavailable, synced when restored.

### Layer 3: LLM Extraction Validation

This is unique to Grocery Genie and deserves its own validation layer. The vision model is the foundation — everything downstream depends on extraction quality.

**Receipt Test Set:**
- Curate a set of 30+ real receipts covering:
  - English receipts (US format, Canadian format)
  - Non-English receipts (French, Spanish, German, Cyrillic)
  - Damaged/faded receipts (partial visibility)
  - Long receipts (30+ items)
  - Receipts with discounts, tax, and varying decimal formats (comma vs. period)
- For each receipt, manually create a **ground truth** JSON with the expected extraction output (store name, date, each line item with name, quantity, unit price, total price, subtotal).

**Extraction Accuracy Test Suite (pytest):**
```
For each receipt in the test set:
  1. Send the receipt image through the extraction pipeline
  2. Compare extracted output against ground truth
  3. Score per-field accuracy:
     - Store name: exact match (after normalization)
     - Date: exact match
     - Line items: fuzzy name match + numeric tolerance (±2%)
     - Subtotal: numeric tolerance (±1%)
  4. Flag any hallucinated items (items in extraction not on receipt)
  5. Flag any missed items (items on receipt not in extraction)
```

**Accuracy metrics (tracked per prompt version):**
- Field-level accuracy: % of fields extracted correctly without correction
- Item-level precision: extracted items that are real / total extracted items
- Item-level recall: real items extracted / total real items on receipt
- Hallucination rate: fabricated items / total extracted items
- Subtotal accuracy: % of receipts where extracted subtotal matches within tolerance

**Target (MVP launch):** ≥90% field-level accuracy, 0% hallucination rate, ≥95% item recall.

**Consistency validation:**
- Run each test receipt through extraction 5 times with the configured model settings.
- Flag any receipt where outputs vary across runs.
- Track consistency rate per prompt version.

**Prompt regression testing:**
- Every prompt change triggers a full test set re-evaluation.
- Accuracy metrics compared against previous prompt version.
- No prompt ships if accuracy regresses on any metric.

### Layer 4: End-to-End Flow Validation

Verify complete user journeys from mobile action to backend result and back.

**Critical E2E flows for MVP:**

| Flow | Steps | Validation |
|------|-------|------------|
| **Receipt scan → budget update** | Capture image → extract → review → confirm → budget recalculated | Budget dashboard shows updated spend. Category totals correct. Receipt appears in history. |
| **Receipt correction → learning** | Scan receipt → correct item name → confirm → scan same store again | Corrected name mapping applied on subsequent scan. UserItemMapping persisted. |
| **Category correction → retroactive update** | Correct category on item → check historical spending | All instances of that item in history reflect new category. Dashboard totals updated. |
| **Budget alert trigger** | Set budget at $100 → scan receipts totaling $82 | Push notification at 80% threshold. Notification contains remaining amount and days left. |
| **Weekly summary** | Scan 3+ receipts across a week → trigger summary | Summary contains correct total, top category, comparison to prior week. |
| **Receipt history search** | Scan 5+ receipts → search by store name | Correct receipts returned. Ordered by date DESC. Original image accessible. |
| **Offline capture → sync** | Disable network → capture receipt → re-enable network | Receipt queued locally with "pending" indicator. Syncs automatically. Budget updates after sync. |
| **Multi-language receipt** | Scan a Cyrillic receipt with comma decimal separator | Items extracted correctly. Decimal format normalized. Currency detected. |
| **Duplicate detection** | Scan same receipt twice within 24 hours | Warning displayed on second scan. User can override or discard. |
| **Non-receipt image rejection** | Submit a photo of a cat | Clear error: "This doesn't appear to be a receipt." No data persisted. |

**E2E test implementation:**
- Backend E2E: pytest tests using httpx that walk through full API flows with a real test database.
- Mobile E2E: Detox tests for critical flows (scan → review → confirm, budget dashboard load). These are slower and more brittle — limit to the 3-4 most critical journeys.
- Manual validation: for flows involving camera, push notifications, and offline behavior, maintain a manual test checklist (documented below).

### Layer 5: Acceptance Criteria Verification

Every user story in the PRD has numbered acceptance criteria. This layer ensures every criterion has a corresponding automated or manual test.

**Acceptance Criteria Traceability Matrix:**

For each epic, maintain a mapping:

MVP matrix, filled 2026-11-02. `python3 scripts/check-traceability.py` checks that every test named here exists (pytest ids collect; jest titles appear in their files). Gap rows are open: RC-01 AC 4 and RC-05 AC 1–3 wait on the receipt test set (audit rank 1); BC-05 AC 3 is premium-only, and MVP has no premium tier.

| Story | AC | Criterion | Type | Test | Status |
|---|---|---|---|---|---|
| RC-01 | 1 | Real-time edge detection overlay | Component | `mobile/src/__tests__/scanDocumentScanner.test.tsx` "opens the scanner when Scan opens, instead of the custom camera (AC 1)" | Pass |
| RC-01 | 1 | Real-time edge detection overlay | Manual | `docs/device-checklist.md` §2: Edges | Manual |
| RC-01 | 2 | Blur/low-light feedback before submission | Component | `mobile/src/__tests__/scanDocumentScanner.test.tsx` "holds back a blurry page and says why, before anything uploads (AC 2)" | Pass |
| RC-01 | 2 | Blur/low-light feedback before submission | Unit | `mobile/src/features/receipt-capture/__tests__/frameQuality.test.ts` "says dark before blurry, since a dark frame also reads blurry" | Pass |
| RC-01 | 3 | Retake before submitting | Component | `mobile/src/__tests__/scanDocumentScanner.test.tsx` "retakes a held-back page: the scanner opens again and the page is deleted (AC 3)" | Pass |
| RC-01 | 3 | Retake before submitting | Manual | `docs/device-checklist.md` §2: Capture and retake | Manual |
| RC-01 | 4 | Processing within 5 seconds | Integration | `backend/tests/llm_validation/test_extraction_accuracy.py::TestExtractionAccuracy::test_extraction_latency_p95` | Gap: skips until the receipt test set exists (audit rank 1) |
| RC-01 | 5 | Structured data displayed for review | Integration | `backend/tests/api/test_receipts.py::test_successful_extraction` | Pass |
| RC-01 | 5 | Structured data displayed for review | Component | `mobile/src/__tests__/reviewCorrections.test.tsx` "shows each item quantity" | Pass |
| RC-02 | 1 | Each field editable inline | Component | `mobile/src/__tests__/reviewCorrections.test.tsx` "sends an edited item name when the user saves" | Pass |
| RC-02 | 1 | Each field editable inline | Integration | `backend/tests/api/test_receipts.py::test_update_receipt_corrects_store_name` | Pass |
| RC-02 | 2 | Confidence below 0.7 flagged amber | Component | `mobile/src/__tests__/reviewCorrections.test.tsx` "flags each of store, date and total read with low confidence" | Pass |
| RC-02 | 2 | Confidence below 0.7 flagged amber | Component | `mobile/src/__tests__/reviewCorrections.test.tsx` "flags the price of an item read with low confidence" | Pass |
| RC-02 | 3 | Corrections saved with original extraction | Integration | `backend/tests/api/test_receipts.py::test_every_corrected_field_keeps_its_original_value` | Pass |
| RC-02 | 3 | Corrections saved with original extraction | Integration | `backend/tests/api/test_receipts.py::test_a_correction_records_who_made_it` | Pass |
| RC-02 | 4 | Nothing committed without explicit confirm | Integration | `backend/tests/api/test_receipts.py::test_update_receipt_confirm` | Pass |
| RC-02 | 4 | Nothing committed without explicit confirm | Integration | `backend/tests/services/test_budget_service.py::test_spending_excludes_pending` | Pass |
| RC-02 | 5 | Original image stored with data | Integration | `backend/tests/api/test_scanned_images.py::test_every_confirmed_scan_has_its_image_and_thumbnail` | Pass |
| RC-02 | 5 | Original image stored with data | Integration | `backend/tests/api/test_receipts.py::test_receipt_image_served_to_owner` | Pass |
| RC-03 | 1 | JPEG, PNG, HEIC supported | Integration | `backend/tests/api/test_receipt_upload_formats.py::test_heic_scan_sends_jpeg_to_extractor` | Pass |
| RC-03 | 1 | JPEG, PNG, HEIC supported | Integration | `backend/tests/api/test_scanned_images.py::test_every_confirmed_scan_has_its_image_and_thumbnail` | Pass |
| RC-03 | 2 | Single-page PDF supported | Integration | `backend/tests/api/test_receipt_upload_formats.py::test_pdf_scan_sends_rendered_jpeg_to_extractor` | Pass |
| RC-03 | 2 | Single-page PDF supported | Integration | `backend/tests/api/test_receipt_upload_formats.py::test_multi_page_pdf_is_rejected_with_422` | Pass |
| RC-03 | 3 | Same extraction and review flow | Component | `mobile/src/features/receipt-capture/__tests__/useReceiptImport.test.tsx` "uploads a library photo and opens the same review screen as a camera scan" | Pass |
| RC-03 | 4 | Minimum 300px width validated | Unit | `mobile/src/features/receipt-capture/__tests__/receiptImport.test.ts` "rejects an image narrower than 300px before uploading" | Pass |
| RC-03 | 4 | Minimum 300px width validated | Integration | `backend/tests/api/test_receipt_upload_formats.py::test_narrow_heic_is_rejected_before_extraction` | Pass |
| RC-04 | 1 | Reverse chronological order | Integration | `backend/tests/api/test_receipts.py::test_list_receipts_ordered_reverse_chronological` | Pass |
| RC-04 | 2 | Store, date, total, item count shown | Component | `mobile/src/__tests__/historyRowActions.test.tsx` "counts items in the singular and plural (L4)" | Pass |
| RC-04 | 2 | Store, date, total, item count shown | Component | `mobile/src/__tests__/historyCurrency.test.tsx` "shows each receipt in its own currency" | Pass |
| RC-04 | 3 | Tap shows full data and image | Component | `mobile/src/__tests__/receiptDetail.test.tsx` "shows the saved receipt, titled by its store" | Pass |
| RC-04 | 3 | Tap shows full data and image | Integration | `backend/tests/api/test_receipts.py::test_get_receipt` | Pass |
| RC-04 | 4 | Search by store or date range | Integration | `backend/tests/api/test_receipts.py::test_list_receipts_store_and_date_filters_compose` | Pass |
| RC-04 | 4 | Search by store or date range | Component | `mobile/src/__tests__/historyDateRange.test.tsx` "searches the range the user picks" | Pass |
| RC-05 | 1 | Six languages processed correctly | Integration | `backend/tests/llm_validation/test_prompt_regression.py::TestPromptRegression::test_no_accuracy_regression_in_any_language` | Gap: skips until the receipt test set exists (audit rank 1) |
| RC-05 | 2 | Decimal separator detected from context | — | none | Gap: needs a comma-decimal receipt in the test set (audit rank 1) |
| RC-05 | 3 | Money normalized to period decimal | — | none | Gap: same fixture as AC 2 |
| RC-05 | 4 | Currency symbol/code extracted | Integration | `backend/tests/api/test_currency.py::test_a_currency_symbol_becomes_its_code` | Pass |
| RC-05 | 4 | Currency symbol/code extracted | Unit | `backend/tests/core/test_money.py::test_normalizes_codes_and_unambiguous_symbols` | Pass |
| BC-01 | 1 | Eight default categories | Integration | `backend/tests/api/test_categories.py::test_list_categories_returns_eight_defaults` | Pass |
| BC-01 | 2 | LLM category with confidence per item | Integration | `backend/tests/api/test_receipts.py::test_scan_returns_a_category_confidence_per_item` | Pass |
| BC-01 | 3 | Low category confidence flagged for review | Component | `mobile/src/__tests__/reviewCorrections.test.tsx` "rings the category of an item categorised with low confidence" | Pass |
| BC-01 | 4 | User corrections override LLM | Integration | `backend/tests/api/test_receipts.py::test_category_only_correction_applies_on_next_scan` | Pass |
| BC-01 | 4 | User corrections override LLM | Integration | `backend/tests/api/test_receipts.py::test_name_and_category_correction_applies_on_next_scan` | Pass |
| BC-02 | 1 | Overall monthly budget configurable | Integration | `backend/tests/api/test_budgets.py::test_create_budget_success` | Pass |
| BC-02 | 2 | Per-category budgets configurable | Integration | `backend/tests/api/test_budgets.py::test_create_budget_with_category` | Pass |
| BC-02 | 2 | Per-category budgets configurable | E2E | `backend/tests/e2e/test_user_journeys.py::test_journey_per_category_budget` | Pass |
| BC-02 | 3 | Calendar months default; custom start | Integration | `backend/tests/services/test_budget_service.py::test_get_period_dates_custom_start` | Pass |
| BC-02 | 3 | Calendar months default; custom start | Integration | `backend/tests/services/test_budget_service.py::test_get_period_dates_default` | Pass |
| BC-02 | 3 | Calendar months default; custom start | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_default_period_follows_the_reset_day` | Pass |
| BC-02 | 3 | Calendar months default; custom start | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_default_period_uses_the_users_local_date` | Pass |
| BC-02 | 3 | Calendar months default; custom start | Component | `mobile/src/__tests__/dashboardResetDay.test.tsx` "labels the period by its dates and counts days within it" | Pass |
| BC-02 | 4 | Edits apply immediately to current period | Integration | `backend/tests/api/test_edge_cases.py::test_mid_month_budget_change` | Pass |
| BC-02 | 4 | Edits apply immediately to current period | Component | `mobile/src/__tests__/budgetSettings.test.tsx` "updates a changed limit instead of creating another budget" | Pass |
| BC-03 | 1 | Push at 80% (50/80/100 configurable) | Integration | `backend/tests/services/test_budget_service.py::test_check_thresholds_at_80` | Pass |
| BC-03 | 1 | Push at 80% (50/80/100 configurable) | Integration | `backend/tests/services/test_budget_service.py::test_check_thresholds_respects_user_opt_out` | Pass |
| BC-03 | 2 | Includes remaining budget and days left | Integration | `backend/tests/api/test_budget_alerts.py::test_a_threshold_alert_gives_the_remaining_budget_and_days_left` | Pass |
| BC-03 | 3 | 100% alert gives overage amount | Integration | `backend/tests/api/test_budget_alerts.py::test_the_100_percent_alert_gives_the_overage` | Pass |
| BC-03 | 4 | Per-category mute; overall still alerts | Integration | `backend/tests/api/test_budget_alerts.py::test_muting_one_category_keeps_the_overall_alerts` | Pass |
| BC-03 | 4 | Per-category mute; overall still alerts | Component | `mobile/src/__tests__/categoryAlerts.test.tsx` "mutes a category when its switch is turned off" | Pass |
| BC-04 | 1 | Per-category progress vs budget | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_with_spending` | Pass |
| BC-04 | 1 | Per-category progress vs budget | Component | `mobile/src/__tests__/dashboardAccessibility.test.tsx` "reads a capped category as one sentence" | Pass |
| BC-04 | 2 | Month-over-month, total and per category | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_compares_each_category_with_the_previous_month` | Pass |
| BC-04 | 2 | Month-over-month, total and per category | Component | `mobile/src/__tests__/trendScreen.test.tsx` "compares this month's total with last month's" | Pass |
| BC-04 | 3 | Top 10 items by spend | Integration | `backend/tests/services/test_budget_service.py::test_top_items_limited_to_10` | Pass |
| BC-04 | 3 | Top 10 items by spend | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_top_items_limit` | Pass |
| BC-04 | 4 | Rolling 3-month trend | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_trend_3_months` | Pass |
| BC-04 | 4 | Rolling 3-month trend | Component | `mobile/src/__tests__/trendScreen.test.tsx` "charts the rolling 3 months (BC-04 AC 4)" | Pass |
| BC-04 | 5 | Dashboard loads within 2 seconds | Integration | `backend/tests/api/test_p95_postgres.py::test_dashboard_p95_under_2s` (Postgres: `make backend-test-pg`) | Pass |
| BC-05 | 1 | Tap item to reassign category | E2E | `backend/tests/e2e/test_user_journeys.py::test_journey_item_correction` | Pass |
| BC-05 | 2 | Correction applied retroactively to history | Integration | `backend/tests/api/test_budget_alerts.py::test_category_correction_alerts_in_every_period_it_moves_spend` | Pass (indirect, through alerts) |
| BC-05 | 3 | Up to 10 custom categories (premium) | — | see the V1.1 matrix | Moved to V1.1 (V11-P1): MVP had no premium tier |
| BC-05 | 4 | Corrections feed per-user mapping | Integration | `backend/tests/api/test_receipts.py::test_category_only_correction_applies_on_next_scan` | Pass |
| BC-06 | 1 | Push with total, top category, budget status | Integration | `backend/tests/tasks/test_summary_tasks.py::test_summary_gives_the_budget_status` | Pass |
| BC-06 | 1 | Push with total, top category, budget status | Integration | `backend/tests/tasks/test_summary_tasks.py::test_summary_includes_top_category` | Pass |
| BC-06 | 2 | Comparison to prior week | Integration | `backend/tests/tasks/test_summary_tasks.py::test_summary_comparison_more` | Pass |
| BC-06 | 3 | Chosen day, 9 AM local time | Integration | `backend/tests/tasks/test_summary_tasks.py::test_recipients_wait_for_9am_in_the_users_time_zone` | Pass |
| BC-06 | 3 | Chosen day, 9 AM local time | Integration | `backend/tests/tasks/test_summary_tasks.py::test_recipients_only_on_users_chosen_day` | Pass |
| BC-06 | 4 | Links to full dashboard | Unit | `mobile/src/features/notifications/__tests__/notificationTap.test.ts` "falls back to the dashboard when the route is missing" | Pass |

V1.1 matrix (Price Intelligence + Premium), started 2026-11-03 with PI-01 and PI-02; PI-03 (price change alerts) backend added the same day, and its app screens (alert tap, mute switches, threshold setting) with V11-02. PI-04 (cross-store comparison): backend, then its section on item detail (AC 4) with V11-04. BC-05 AC 3 (custom categories, Premium) with V11-P1. Decision recorded with V11-P1: the LLM assigns only the eight default categories, so a custom category reaches a new scan only through the user's corrections (the item mapping, BC-05 AC 4; row "Custom category in a correction teaches the next scan"). Changing the category prompt to know custom names needs `validate-extraction` and is out of V11-P1's scope (`08-api-contracts.md`, Categories). `PREM` rows are the Premium tier (V11-P0 and V11-P4, decisions D1 and D2: `PHASE_SCOPE.md`), which has no user story ID, so the AC column names the decision. Data export (V11-P2, NFR Privacy 2) is Premium too: its rows are Story `PREM`, AC `NFR-P2`. `BC-FR | Rollover` rows are the Premium rollover toggle (V11-P3). `PREM | D5` rows are the waitlist's free year of Premium (V11-P5, plan decision D5, `docs/marketing/decisions.md` #9–#13). `EC-PI | 1` rows are `11-edge-cases.md` Price Intelligence edge case 1, store normalization with user merge (V11-05, decision D3), which has no user story ID; it is free, like the rest of price intelligence. `EC-PI | 2` and `EC-PI | 3` rows are edge cases 2 (unit price ambiguity) and 3 (promotional prices).

Design alignment rows (DA-0, 2026-11-04, decisions D6–D10, plan `.planning/PLAN-2026-11-04-v1.1-design-alignment.md`): the ACs tagged "(DA-n)" in `03-price-intelligence.md` (PI-01 AC 5–10, PI-02 AC 5–15, PI-03 AC 5–14, PI-04 AC 5–8, PREM-01 to PREM-04) and `02-budget-copilot.md` (BC-04 AC 6–10, BC-05 AC 5–8), and edge cases `EC-PI | 4`–`11` and `EC-PREM | 1`–`5` (`11-edge-cases.md`). They sit at the end of the matrix with the Test "Not yet implemented (DA-n)" and the Status "Pending" until task DA-n replaces each with its tests (the traceability script checks only named tests, so a pending row names none). Decision D8 turned the `PREM | D2` row "Free features stay free: cross-store comparison" into a Premium gate (PREM-02 AC 1); DA-1 replaced that row.

| Story | AC | Criterion | Type | Test | Status |
|---|---|---|---|---|---|
| PI-01 | 1 | Every recorded price with date and store | Integration | `backend/tests/api/test_items.py::test_every_price_is_recorded_with_date_and_store` | Pass |
| PI-01 | 1 | Every recorded price with date and store | Component | `mobile/src/__tests__/priceHistory.test.tsx` "shows every price with its date and store, newest first (AC 1)" | Pass |
| PI-01 | 2 | Line chart, a point per purchase | Component | `mobile/src/__tests__/priceHistory.test.tsx` "plots a line chart once there are two prices (AC 2)" | Pass |
| PI-01 | 2 | Line chart, a point per purchase | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "places one dot per purchase: x by date, y by price" | Pass |
| PI-01 | 3 | Unit price (per item, kg, lb) | Integration | `backend/tests/api/test_items.py::test_prices_are_unit_prices` | Pass |
| PI-01 | 3 | Unit price (per item, kg, lb) | Component | `mobile/src/__tests__/priceHistory.test.tsx` "shows unit prices in the list and the headline (AC 3)" | Pass |
| PI-01 | 4 | Timeline needs 2 data points | Integration | `backend/tests/api/test_items.py::test_one_price_is_not_yet_a_timeline` | Pass |
| PI-01 | FR | Filter the history by store and date range | Integration | `backend/tests/api/test_items.py::test_store_and_date_filters` | Pass |
| PI-01 | 4 | Timeline needs 2 data points | Component | `mobile/src/__tests__/priceHistory.test.tsx` "waits for a second price before showing a trend (AC 4)" | Pass |
| PI-01 | 1 | Every recorded price with date and store (app, at AX5: device check BUG-3) | Component | `mobile/src/__tests__/pricesLargeText.test.tsx` "stacks each price under its date and store at AX5" | Pass |
| PI-01 | 1 | Every recorded price with date and store (app, Prices list at AX5: BUG-3) | Component | `mobile/src/__tests__/pricesLargeText.test.tsx` "stacks the price under the name at AX5, and lets the name wrap" | Pass |
| PI-01 | 3 | Unit price (per item, kg, lb) (app, headline price at AX5: BUG-3) | Component | `mobile/src/__tests__/pricesLargeText.test.tsx` "keeps the headline price on one line, shrinking it to fit" | Pass |
| PI-02 | 1 | Hybrid: embedding similarity + fuzzy strings | Integration | `backend/tests/services/test_item_matching.py::test_high_semantic_similarity_auto_links` | Pass |
| PI-02 | 1 | Hybrid: embedding similarity + fuzzy strings | Integration | `backend/tests/services/test_item_matching.py::test_high_fuzzy_score_auto_links_and_learns_the_alias` | Pass |
| PI-02 | FR | Matching order: an exact alias links first, at confidence 1.0 | Integration | `backend/tests/services/test_item_matching.py::test_exact_alias_links_to_the_same_item` | Pass |
| PI-02 | 2 | Thresholds default to 0.85 fuzzy, 0.80 semantic, 0.6 ask | Unit | `backend/tests/services/test_item_matching.py::test_thresholds_default_to_the_prd_values` | Pass |
| PI-02 | 2 | >= 0.85 auto-link | Integration | `backend/tests/services/test_item_matching.py::test_high_fuzzy_score_auto_links_and_learns_the_alias` | Pass |
| PI-02 | 2 | 0.6-0.85 asks the user | Integration | `backend/tests/services/test_item_matching.py::test_medium_score_asks_the_user_and_keeps_the_line_separate` | Pass |
| PI-02 | 2 | 0.6-0.85 asks the user | Component | `mobile/src/__tests__/priceHistory.test.tsx` "asks on the item and merges when the user says Yes, merge" | Pass |
| PI-02 | 2 | < 0.6 distinct | Integration | `backend/tests/services/test_item_matching.py::test_low_score_is_a_distinct_item_with_no_question` | Pass |
| PI-02 | 2 | A qualifier difference asks, never auto-links (BUG-4) | Unit | `backend/tests/services/test_item_matching.py::test_a_qualifier_difference_is_detected` | Pass |
| PI-02 | 2 | A qualifier difference asks, never auto-links (BUG-4) | Integration | `backend/tests/services/test_item_matching.py::test_a_qualifier_difference_asks_instead_of_auto_linking` | Pass |
| PI-02 | 2 | A qualifier difference asks, never auto-links (BUG-4) | Integration | `backend/tests/services/test_item_matching.py::test_bananas_is_asked_about_not_linked_to_organic_bananas` | Pass |
| PI-02 | 2 | Same product written differently still auto-links | Integration | `backend/tests/services/test_item_matching.py::test_the_same_product_still_auto_links` | Pass |
| PI-02 | 2 | Same product written differently still auto-links | Integration | `backend/tests/services/test_item_matching.py::test_a_name_links_to_the_item_with_its_qualifiers` | Pass |
| PI-02 | 2 | A qualifier difference asks, never auto-links (BUG-4) | Unit | `backend/tests/services/test_item_matching.py::test_french_qualifiers_read_as_their_english_meaning` | Pass |
| PI-02 | 2 | Same product written differently still auto-links | Unit | `backend/tests/services/test_item_matching.py::test_common_french_product_words_carry_no_qualifier` | Pass |
| PI-02 | 3 | Manually link items | Integration | `backend/tests/api/test_items.py::test_merge_and_split_through_the_api` | Pass |
| PI-02 | 3 | Manually link items | Component | `mobile/src/__tests__/priceHistory.test.tsx` "combines the item into another one and opens the result" | Pass |
| PI-02 | 3 | Manually unlink items | Integration | `backend/tests/services/test_item_matching.py::test_split_moves_one_alias_with_its_lines_and_prices` | Pass |
| PI-02 | 3 | Manually unlink items | Component | `mobile/src/__tests__/priceHistory.test.tsx` "splits a name off into its own item after confirming" | Pass |
| PI-02 | 4 | Confirmed matches give a canonical name with aliases | Integration | `backend/tests/api/test_items.py::test_accepting_a_suggestion_merges_the_history` | Pass |
| PI-02 | 4 | Confirmed matches give a canonical name with aliases | Integration | `backend/tests/api/test_items.py::test_rename_item` | Pass |
| PI-03 | 1 | Alert at >= 10% change from the rolling average | Integration | `backend/tests/api/test_price_alerts.py::test_a_ten_percent_rise_from_the_rolling_average_alerts` | Pass |
| PI-03 | 1 | Alert at >= 10% change from the rolling average | Integration | `backend/tests/api/test_price_alerts.py::test_a_ten_percent_drop_alerts` | Pass |
| PI-03 | 1 | Alert at >= 10% change from the rolling average | Integration | `backend/tests/api/test_price_alerts.py::test_a_change_under_the_threshold_does_not_alert` | Pass |
| PI-03 | 1 | Rolling average (7-day and 30-day windows), like-for-like | Integration | `backend/tests/services/test_price_alert_service.py::test_7_and_30_day_rolling_averages` | Pass |
| PI-03 | 1 | Rolling average (7-day and 30-day windows), like-for-like | Integration | `backend/tests/api/test_price_alerts.py::test_only_like_for_like_prices_make_the_average` | Pass |
| PI-03 | 1 | Configurable threshold | Integration | `backend/tests/api/test_price_alerts.py::test_the_user_can_set_their_own_threshold` | Pass |
| PI-03 | 1 | Configurable threshold | Integration | `backend/tests/api/test_price_alerts.py::test_the_default_threshold_is_a_setting` | Pass |
| PI-03 | 2 | Item, store, old average, new price, percent | Integration | `backend/tests/api/test_price_alerts.py::test_the_alert_names_item_store_average_new_price_and_percent` | Pass |
| PI-03 | FR | The alert dispatches `PriceChangeDetected` | Integration | `backend/tests/api/test_price_alerts.py::test_the_alert_dispatches_price_change_detected` | Pass |
| PI-03 | FR | Price alert analytics (`price_alert_triggered`: direction, percent_change; once per alert sent) | Integration | `backend/tests/api/test_price_alerts.py::test_an_alert_emits_price_alert_triggered` | Pass |
| PI-03 | 2 | Item, store, old average, new price, percent | Integration | `backend/tests/tasks/test_push_tasks.py::test_a_price_change_push_opens_its_item` | Pass |
| PI-03 | 3 | Cooldown, default 7 days per item | Integration | `backend/tests/api/test_price_alerts.py::test_an_item_alerts_once_per_cooldown` | Pass |
| PI-03 | 3 | Cooldown, default 7 days per item | Integration | `backend/tests/api/test_price_alerts.py::test_the_cooldown_is_per_item` | Pass |
| PI-03 | 3 | Cooldown, default 7 days per item | Integration | `backend/tests/services/test_price_alert_service.py::test_two_concurrent_claims_for_one_item_alert_once` | Pass (Postgres only) |
| PI-03 | 4 | Mutable per item | Integration | `backend/tests/api/test_price_alerts.py::test_a_muted_item_does_not_alert` | Pass |
| PI-03 | 4 | Mutable per store | Integration | `backend/tests/api/test_price_alerts.py::test_a_muted_store_does_not_alert` | Pass |
| PI-03 | 4 | Mutable per store: unmute works after the store's receipts are purged | Integration | `backend/tests/api/test_price_alerts.py::test_a_store_can_be_unmuted_after_its_receipts_are_purged` | Pass |
| PI-03 | 4 | Mutable per store: unmute removes only the user's own mute | Integration | `backend/tests/api/test_price_alerts.py::test_unmuting_a_store_never_touches_another_users_mute` | Pass |
| PI-03 | 4 | Mutable per item: another user's item is 404 to mute and unmute | Integration | `backend/tests/api/test_price_alerts.py::test_another_users_item_cannot_be_muted_or_unmuted` | Pass |
| PI-03 | 4 | Mute analytics (`price_alert_muted`: scope item or store; unmute sends none) | Integration | `backend/tests/api/test_price_alerts.py::test_muting_emits_price_alert_muted` | Pass |
| PI-03 | FR | Only a confirm alerts; editing a confirmed receipt sends none | Integration | `backend/tests/api/test_price_alerts.py::test_editing_a_confirmed_receipt_never_sends_a_price_alert` | Pass |
| PI-03 | FR | A price alert failure never fails the confirm or the budget alert | Integration | `backend/tests/api/test_price_alerts.py::test_a_price_alert_failure_never_fails_the_confirm` | Pass |
| PI-03 | 2 | Tapping the alert opens the item | Unit | `mobile/src/features/notifications/__tests__/notificationTap.test.ts` "opens the item named in a price change alert (PI-03)" | Pass |
| PI-03 | 2 | Tapping the alert opens the item | Unit | `mobile/src/features/notifications/__tests__/notificationTap.test.ts` "opens a price change item from its id even when the url says otherwise" | Pass |
| PI-03 | 2 | Tapping the alert opens the item | Unit | `mobile/src/features/notifications/__tests__/notificationTap.test.ts` "never builds a route from a malformed price change item id" | Pass |
| PI-03 | 2 | Tapping the alert opens the item, with Back to Budget (cold start: BUG-6) | Component | `mobile/src/__tests__/pushTapColdStart.test.tsx` "opens the tapped item on top of the tabs when the tap launched the app" | Pass |
| PI-03 | 2 | Tapping the alert opens the item, with Back to Budget (cold start: BUG-6) | Component | `mobile/src/__tests__/priceAlertColdStart.test.tsx` "routes a tap that is waiting on the first frame, once the root navigator is ready" | Pass |
| PI-03 | 2 | Tapping the alert opens the item, with Back to Budget (cold start: BUG-6) | Component | `mobile/src/__tests__/priceAlertColdStart.test.tsx` "asks for the tabs under the item, in case the tap lands before the stack is built" | Pass |
| PI-03 | 2 | Tapping the alert opens the item, with Back to Budget (cold start: BUG-6) | Component | `mobile/src/__tests__/priceAlertColdStart.test.tsx` "puts the tabs under an item opened by a deep link on launch" | Pass |
| PI-03 | 4 | Mutable per item (app) | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "mutes price alerts for the item" | Pass |
| PI-03 | 4 | Mutable per item (app) | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "unmutes an item whose price alerts are muted" | Pass |
| PI-03 | 4 | Mutable per item (app): a failed save puts the switch back | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "puts the switch back and says so when a mute fails" | Pass |
| PI-03 | 4 | Mutable per store (app) | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "mutes and unmutes price alerts at each store the item was bought from" | Pass |
| PI-03 | 4 | Mutable per item or per store (app, from Settings) | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "unmutes a muted item and a muted store" | Pass |
| PI-03 | 1 | Configurable threshold (app, Settings → Alerts) | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "sets the price change threshold" | Pass |
| PI-03 | 1 | Configurable threshold (app, Settings → Alerts) | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "goes back to the default threshold" | Pass |
| PI-03 | 1 | Configurable threshold (app, Settings → Alerts) | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "turns price change alerts off" | Pass |
| PI-03 | 1 | Configurable threshold (app, Settings → Alerts) | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "says what size of change sends an alert, and when alerts are off" | Pass |
| PI-04 | 1 | Side-by-side pricing across all stores with prices | Integration | `backend/tests/api/test_price_comparison.py::test_side_by_side_latest_and_average_per_store` | Pass |
| PI-04 | 1 | Side-by-side pricing across all stores with prices | Integration | `backend/tests/api/test_price_comparison.py::test_stores_are_cheapest_first_by_average` | Pass |
| PI-04 | 2 | Most recent and average price per store | Integration | `backend/tests/api/test_price_comparison.py::test_side_by_side_latest_and_average_per_store` | Pass |
| PI-04 | 2 | Most recent and average price per store | Integration | `backend/tests/api/test_price_comparison.py::test_only_like_for_like_prices_are_compared` | Pass |
| PI-04 | 2 | Most recent and average price per store | Integration | `backend/tests/api/test_price_comparison.py::test_prices_in_another_currency_are_not_compared` | Pass |
| PI-04 | 2 | Most recent and average price per store | Integration | `backend/tests/api/test_price_comparison.py::test_average_is_rounded_half_up_to_the_cent` | Pass |
| PI-04 | 3 | Only stores the user has scanned from | Integration | `backend/tests/api/test_price_comparison.py::test_only_stores_the_user_bought_from_are_shown` | Pass |
| PI-04 | 3 | Only stores the user has scanned from | Integration | `backend/tests/api/test_price_comparison.py::test_comparison_is_private_and_unknown_items_are_404` | Pass |
| PI-04 | FR | Minimum 2 observations per store per item | Integration | `backend/tests/api/test_price_comparison.py::test_a_store_needs_two_prices_to_be_compared` | Pass |
| PI-04 | FR | Minimum 2 observations per store per item | Integration | `backend/tests/api/test_price_comparison.py::test_one_price_anywhere_compares_nothing` | Pass |
| PI-04 | 4 | From item detail or a comparison screen | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "shows the latest and average price at each store, cheapest first (AC 4)" | Pass |
| PI-04 | 4 | From item detail or a comparison screen | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "says how many stores need more prices before they compare" | Pass |
| PI-04 | 4 | From item detail or a comparison screen | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "explains an empty comparison when no store has enough prices yet" | Pass |
| BC-05 | 3 | Up to 10 custom categories, Premium: created | Integration | `backend/tests/api/test_custom_categories.py::test_premium_user_creates_a_category` | Pass |
| BC-05 | 3 | Up to 10 custom categories: the 11th is refused | Integration | `backend/tests/api/test_custom_categories.py::test_premium_user_can_create_ten_and_the_eleventh_is_refused` | Pass |
| BC-05 | 3 | Up to 10 custom categories: deleting frees a slot | Integration | `backend/tests/api/test_custom_categories.py::test_deleting_one_frees_a_slot` | Pass |
| BC-05 | 3 | Up to 10 custom categories: the cap is per user | Integration | `backend/tests/api/test_custom_categories.py::test_the_cap_is_per_user` | Pass |
| BC-05 | 3 | Premium only: a free user gets `403 premium_required` | Integration | `backend/tests/api/test_custom_categories.py::test_free_user_cannot_create_a_category` | Pass |
| BC-05 | 3 | Premium lapses: categories stay, deletable, not renamed or added | Integration | `backend/tests/api/test_custom_categories.py::test_after_premium_lapses_categories_stay_and_can_be_deleted_not_changed` | Pass |
| BC-05 | 3 | Names: 1-40 characters, unique among defaults and own | Integration | `backend/tests/api/test_custom_categories.py::test_name_must_not_repeat_a_default_or_own_category` | Pass |
| BC-05 | 3 | Rename a custom category | Integration | `backend/tests/api/test_custom_categories.py::test_premium_user_renames_a_category` | Pass |
| BC-05 | 3 | Defaults and other users' categories cannot be changed | Integration | `backend/tests/api/test_custom_categories.py::test_another_users_category_cannot_be_renamed_or_deleted` | Pass |
| BC-05 | 3 | Custom category in a correction teaches the next scan (AC 2, 4) | Integration | `backend/tests/api/test_custom_categories.py::test_custom_category_in_a_correction_teaches_the_next_scan` | Pass |
| BC-05 | 3 | Custom category in a budget, the summary and the dashboard | Integration | `backend/tests/api/test_custom_categories.py::test_custom_category_budget_and_dashboard_spending` | Pass |
| BC-05 | 3 | Another user's category is refused in corrections and budgets | Integration | `backend/tests/api/test_custom_categories.py::test_correction_refuses_another_users_category` | Pass |
| BC-05 | 3 | Another user's category is refused in corrections and budgets | Integration | `backend/tests/api/test_custom_categories.py::test_budget_refuses_another_users_category` | Pass |
| BC-05 | 3 | Delete: items move to Other, mappings clear, budgets go | Integration | `backend/tests/api/test_custom_categories.py::test_delete_moves_items_to_other_and_removes_its_budget` | Pass |
| BC-05 | 3 | Concurrent creates stop at 10; the rest get 409 | Integration (Postgres) | `backend/tests/api/test_custom_categories_concurrency.py::test_concurrent_creates_stop_at_the_cap` | Pass |
| BC-05 | 3 | Concurrent creates of one name (any case) make one | Integration (Postgres) | `backend/tests/api/test_custom_categories_concurrency.py::test_concurrent_creates_of_one_name_make_one` | Pass |
| BC-05 | 3 | Delete racing a budget, correction or scan: no 500 | Integration (Postgres) | `backend/tests/api/test_custom_categories_concurrency.py::test_budget_saved_while_its_category_is_deleted_gets_a_clean_400` | Pass |
| BC-05 | 3 | Delete racing a budget, correction or scan: no 500 | Integration (Postgres) | `backend/tests/api/test_custom_categories_concurrency.py::test_category_deleted_while_a_budget_is_saved_takes_the_budget` | Pass |
| BC-05 | 3 | Delete racing a budget, correction or scan: no 500 | Integration (Postgres) | `backend/tests/api/test_custom_categories_concurrency.py::test_correction_to_a_category_being_deleted_gets_a_clean_400` | Pass |
| BC-05 | 3 | Delete racing a budget, correction or scan: no 500 | Integration (Postgres) | `backend/tests/api/test_custom_categories_concurrency.py::test_category_deleted_during_a_correction_moves_the_item_to_other` | Pass |
| BC-05 | 3 | Delete racing a budget, correction or scan: no 500 | Integration (Postgres) | `backend/tests/api/test_custom_categories_concurrency.py::test_scan_applying_a_mapping_to_a_category_being_deleted_skips_it` | Pass |
| BC-05 | 3 | Delete racing a budget, correction or scan: no 500 | Integration (Postgres) | `backend/tests/api/test_custom_categories_concurrency.py::test_category_deleted_during_a_scan_moves_the_mapped_item_to_other` | Pass |
| BC-05 | 3 | App: a free user sees the upgrade prompt, never an error | Component | `mobile/src/__tests__/categorySettings.test.tsx` "a free user sees the upgrade prompt that opens the paywall, not an add button" | Pass |
| BC-05 | 3 | App: a refused create shows the upgrade prompt | Component | `mobile/src/__tests__/categorySettings.test.tsx` "a refused create (Premium lapsed) shows the upgrade prompt, not an error" | Pass |
| BC-05 | 3 | App: add, rename, delete | Component | `mobile/src/__tests__/categorySettings.test.tsx` "a Premium user adds a category by name, with the first colour and icon by default" | Pass |
| BC-05 | 3 | App: add, rename, delete | Component | `mobile/src/__tests__/categorySettings.test.tsx` "renames a custom category" | Pass |
| BC-05 | 3 | App: add, rename, delete | Component | `mobile/src/__tests__/categorySettings.test.tsx` "deletes a custom category after confirming" | Pass |
| BC-05 | 3 | App: at 10 the add button is disabled | Component | `mobile/src/__tests__/categorySettings.test.tsx` "at 10 the add button is disabled and says why" | Pass |
| BC-05 | 3 | App: the paywall lists custom categories | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 4: the feature list names what is built, with unlimited receipts and rollover" | Pass |
| BC-FR | Trends | 12-month trend (V1.1), Premium per D2 | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_12_month_trend_for_premium` | Pass |
| BC-FR | Trends | 3 months stays the default; `months=3` works | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_premium_user_still_gets_3_months_by_default` | Pass |
| BC-FR | Trends | 3 months stays the default; `months=3` works | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_trend_is_3_months_with_months_3` | Pass |
| BC-FR | Trends | `months` other than 3 or 12 is a 422 | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_rejects_months_other_than_3_or_12` | Pass |
| BC-FR | Trends | Free user asking for 12 months gets `403 premium_required` | Integration | `backend/tests/api/test_dashboard.py::test_dashboard_12_month_trend_needs_premium` | Pass |
| BC-FR | Trends | Trend bar amounts in the budget currency (BUG-7) | Component | `mobile/src/__tests__/trendLargeText.test.tsx` "labels each bar in euros when the budget is in euros" | Pass |
| BC-FR | Trends | Trend readable at accessibility text sizes (BUG-1) | Component | `mobile/src/__tests__/trendLargeText.test.tsx` "lets the chart grow down with the text, not up over the summary (BUG-1)" | Pass |
| BC-FR | Trends | Trend readable at accessibility text sizes (BUG-2) | Component | `mobile/src/__tests__/trendLargeText.test.tsx` "wraps the month-over-month change under the total instead of off the screen (BUG-2)" | Pass |
| BC-FR | Trends | Trend readable at accessibility text sizes | Component | `mobile/src/__tests__/trendLargeText.test.tsx` "keeps each bar amount on one line, shrinking to fit its column" | Pass |
| BC-FR | Trends | 12-month trend readable at accessibility text sizes (BUG-9) | Component | `mobile/src/__tests__/trendLargeText.test.tsx` "keeps the 12 one-letter labels to one line and a size that fits a narrow bar (BUG-9)" | Pass |
| BC-FR | Trends | VoiceOver reads the bars in month order (BUG-8) | Component | `mobile/src/__tests__/trendLargeText.test.tsx` "gives every month column the same height, so VoiceOver reads them left to right" | Pass |
| BC-FR | Rollover | Free user turning rollover on gets `403 premium_required` | Integration | `backend/tests/api/test_budget_rollover.py::test_free_user_turning_rollover_on_gets_premium_required` | Pass |
| BC-FR | Rollover | Unspent budget does not roll over by default | Integration | `backend/tests/api/test_budget_rollover.py::test_rollover_is_off_by_default` | Pass |
| BC-FR | Rollover | Optional rollover toggle (Premium), per budget | Integration | `backend/tests/api/test_budget_rollover.py::test_premium_user_turns_rollover_on_and_off` | Pass |
| BC-FR | Rollover | Optional rollover toggle (Premium), per budget | Integration | `backend/tests/api/test_budget_rollover.py::test_category_budget_carries_its_own_unspent` | Pass |
| BC-FR | Rollover | Unspent budget rolls into the next period | Integration | `backend/tests/api/test_budget_rollover.py::test_last_periods_unspent_rolls_into_this_period` | Pass |
| BC-FR | Rollover | Unspent budget rolls into the next period | Integration | `backend/tests/api/test_budget_rollover.py::test_next_periods_limit_includes_this_periods_unspent` | Pass |
| BC-FR | Rollover | Unspent budget rolls into the next period | Integration | `backend/tests/api/test_budget_rollover.py::test_carry_compounds_across_periods` | Pass |
| BC-FR | Rollover | Overspend does not carry | Integration | `backend/tests/api/test_budget_rollover.py::test_overspend_does_not_carry` | Pass |
| BC-FR | Rollover | Rollover: budget created mid-month, partial first period | Integration | `backend/tests/api/test_budget_rollover.py::test_a_budget_created_this_period_has_nothing_to_carry_yet` | Pass |
| BC-FR | Rollover | Rollover: only from the period before it was turned on | Integration | `backend/tests/api/test_budget_rollover.py::test_periods_before_rollover_was_turned_on_do_not_carry` | Pass |
| BC-FR | Rollover | Rollover: deterministic, idempotent, reads write nothing | Integration | `backend/tests/api/test_budget_rollover.py::test_reading_the_carry_is_deterministic_and_writes_nothing` | Pass |
| BC-FR | Rollover | Rollover: amount change applies from now (EC Budget 1) | Integration | `backend/tests/api/test_budget_rollover.py::test_amount_change_applies_from_now_and_keeps_the_carry` | Pass |
| BC-FR | Rollover | Rollover: start-day change keeps the carry | Integration | `backend/tests/api/test_budget_rollover.py::test_start_day_change_keeps_the_carry` | Pass |
| BC-FR | Rollover | Rollover: $0 budget never carries (EC Budget 2) | Integration | `backend/tests/api/test_budget_rollover.py::test_zero_budget_never_carries` | Pass |
| BC-FR | Rollover | Rollover: currency change restarts it (EC Budget 4) | Integration | `backend/tests/api/test_budget_rollover.py::test_currency_change_restarts_rollover` | Pass |
| BC-FR | Rollover | Rollover: deleted and restored budgets | Integration | `backend/tests/api/test_budget_rollover.py::test_restoring_a_budget_deleted_in_an_earlier_period_restarts_rollover` | Pass |
| BC-FR | Rollover | Rollover: deleted and restored budgets | Integration | `backend/tests/api/test_budget_rollover.py::test_restoring_within_the_same_period_keeps_the_carry` | Pass |
| BC-FR | Rollover | Rollover: Premium lapse pauses it and keeps the toggle | Integration | `backend/tests/api/test_budget_rollover.py::test_premium_lapse_pauses_rollover_and_keeps_the_toggle` | Pass |
| BC-FR | Rollover | Rollover: Premium lapse pauses it and keeps the toggle | Integration | `backend/tests/api/test_budget_rollover.py::test_lapsed_premium_alerts_on_the_base_amount` | Pass |
| BC-FR | Rollover | Rollover: deleted and restored budgets | Integration | `backend/tests/api/test_budget_rollover.py::test_restore_near_midnight_keeps_a_same_period_carry` | Pass |
| BC-FR | Rollover | Rollover: a budget revived through create starts with rollover off | Integration | `backend/tests/api/test_budget_rollover.py::test_a_budget_revived_through_create_starts_with_rollover_off` | Pass |
| BC-FR | Rollover | Rollover: Premium lapse pauses it and keeps the toggle | Integration | `backend/tests/api/test_budget_rollover.py::test_months_premium_lapsed_carry_when_it_returns` | Pass |
| BC-FR | Rollover | Rollover: changes use the user's local date, as the dashboard does | Integration | `backend/tests/api/test_budget_rollover.py::test_turning_rollover_on_near_midnight_uses_the_users_date` | Pass |
| BC-FR | Rollover | Rollover: changes use the user's local date, as the dashboard does | Integration | `backend/tests/api/test_budget_rollover.py::test_amount_change_near_midnight_keeps_the_carry` | Pass |
| BC-FR | Rollover | Threshold alerts use the limit with rollover (BC-03) | Integration | `backend/tests/api/test_budget_rollover.py::test_threshold_alert_fires_on_the_effective_limit` | Pass |
| BC-FR | Rollover | Threshold alerts use the limit with rollover (BC-03) | Integration | `backend/tests/api/test_budget_rollover.py::test_late_receipt_in_last_period_shrinks_the_carry_and_alerts` | Pass |
| BC-FR | Rollover | Rollover toggle analytics (`budget_rollover_toggled`) | Integration | `backend/tests/api/test_budget_rollover.py::test_toggling_rollover_emits_analytics` | Pass |
| BC-FR | Rollover | Another user's budget is 404 to turn rollover on, even for a Premium user | Integration | `backend/tests/api/test_cross_user_writes.py::test_b_cannot_turn_on_rollover_for_as_budget` | Pass |
| BC-FR | Rollover | Rollover switch per budget on Budget settings (app) | Component | `mobile/src/__tests__/budgetRollover.test.tsx` "shows a rollover switch for each budget, set as saved" | Pass |
| BC-FR | Rollover | Rollover switch per budget on Budget settings (app) | Component | `mobile/src/__tests__/budgetRollover.test.tsx` "saves only the switches that changed" | Pass |
| BC-FR | Rollover | Rollover switch per budget on Budget settings (app) | Component | `mobile/src/__tests__/budgetRollover.test.tsx` "turns rollover on for a budget it creates" | Pass |
| BC-FR | Rollover | Free user sees the upgrade prompt, never an error (app, D2) | Component | `mobile/src/__tests__/budgetRollover.test.tsx` "invites a free user to upgrade instead of showing switches" | Pass |
| BC-FR | Rollover | Free user sees the upgrade prompt, never an error (app, D2) | Component | `mobile/src/__tests__/budgetRollover.test.tsx` "opens the paywall from the prompt" | Pass |
| BC-FR | Rollover | Free user sees the upgrade prompt, never an error (app, D2) | Component | `mobile/src/__tests__/budgetRollover.test.tsx` "opens the paywall, not an error, when Premium lapsed before Save" | Pass |
| BC-FR | Rollover | Dashboard shows what rolled over (app) | Component | `mobile/src/__tests__/budgetRollover.test.tsx` "says how much of the limit rolled over" | Pass |
| BC-FR | Rollover | Dashboard shows what rolled over (app) | Component | `mobile/src/__tests__/budgetRollover.test.tsx` "says nothing without a rollover" | Pass |
| PREM | D1 | Premium: entitlement from RevenueCat only, checked with its expiry | Unit | `backend/tests/core/test_entitlements.py::test_a_user_with_no_entitlement_is_free` | Pass |
| PREM | D1 | Premium: entitlement from RevenueCat only, checked with its expiry | Unit | `backend/tests/core/test_entitlements.py::test_an_active_entitlement_before_its_expiry_is_premium` | Pass |
| PREM | D1 | Premium: entitlement from RevenueCat only, checked with its expiry | Unit | `backend/tests/core/test_entitlements.py::test_an_entitlement_past_its_expiry_is_free` | Pass |
| PREM | D1 | Premium: entitlement from RevenueCat only, checked with its expiry | Unit | `backend/tests/core/test_entitlements.py::test_an_inactive_entitlement_is_free_even_before_expiry` | Pass |
| PREM | D1 | Premium: entitlement from RevenueCat only, checked with its expiry | Unit | `backend/tests/core/test_entitlements.py::test_an_active_entitlement_without_expiry_is_premium` | Pass |
| PREM | D1 | Premium: `require_premium` gives `403 premium_required` to a free user | Unit | `backend/tests/core/test_entitlements.py::test_require_premium_refuses_a_free_user_with_premium_required` | Pass |
| PREM | D1 | Premium: `require_premium` gives `403 premium_required` to a free user | Unit | `backend/tests/core/test_entitlements.py::test_require_premium_lets_a_premium_user_through` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_initial_purchase_makes_the_user_premium` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_renewal_moves_the_expiry` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_cancellation_keeps_premium_until_the_period_ends` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refund_cancellation_ends_premium_now` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_expiration_ends_premium` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_premium_lapses_at_expiry_without_an_expiration_event` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_uncancellation_restores_premium` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_transfer_revokes_premium_from_the_old_user` | Pass |
| PREM | D1 | Premium: webhook grant, renew, cancel, expire | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_transfer_refreshes_the_new_user_from_the_rest_api` | Pass |
| PREM | D1 | Premium: webhook idempotent on event id; late events ignored | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_replayed_event_id_is_a_no_op` | Pass |
| PREM | D1 | Premium: webhook idempotent on event id; late events ignored | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_an_older_event_arriving_late_changes_nothing` | Pass |
| PREM | D1 | Premium: webhook idempotent on event id; late events ignored | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_cancellation_before_its_purchase_still_grants_premium` | Pass |
| PREM | D1 | Premium: webhook idempotent on event id; late events ignored | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refund_before_its_purchase_keeps_the_user_free` | Pass |
| PREM | D1 | Premium: webhook idempotent on event id; late events ignored | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_purchase_before_a_newer_refresh_stays_stale` | Pass |
| PREM | D1 | Premium: webhook idempotent on event id; late events ignored | Integration (Postgres) | `backend/tests/services/test_premium_service.py::test_two_concurrent_deliveries_of_one_event_apply_once` | Pass |
| PREM | D1 | Premium: webhook needs the shared secret; the app cannot grant itself Premium | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_bad_secret_is_rejected` | Pass |
| PREM | D1 | Premium: webhook needs the shared secret; the app cannot grant itself Premium | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_missing_authorization_is_rejected` | Pass |
| PREM | D1 | Premium: webhook needs the shared secret; the app cannot grant itself Premium | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_secret_without_bearer_prefix_is_accepted` | Pass |
| PREM | D1 | Premium: webhook needs the shared secret; the app cannot grant itself Premium | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_webhook_is_closed_when_no_secret_is_configured` | Pass |
| PREM | D1 | Premium: webhook needs the shared secret; the app cannot grant itself Premium | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_app_cannot_make_itself_premium` | Pass |
| PREM | D1 | Premium: events for other users, entitlements or types change nothing | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_unknown_app_user_is_acknowledged_and_ignored` | Pass |
| PREM | D1 | Premium: events for other users, entitlements or types change nothing | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_anonymous_app_user_id_resolves_through_aliases` | Pass |
| PREM | D1 | Premium: events for other users, entitlements or types change nothing | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_other_entitlement_is_ignored` | Pass |
| PREM | D1 | Premium: events for other users, entitlements or types change nothing | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_test_event_is_acknowledged` | Pass |
| PREM | D1 | Premium: events for other users, entitlements or types change nothing | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_malformed_body_is_422` | Pass |
| PREM | D1 | Premium: `is_premium` on the profile | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_free_user_is_not_premium` | Pass |
| PREM | D1 | Premium: `is_premium` on the profile | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_auth_me_carries_premium_too` | Pass |
| PREM | D1 | Premium: refresh from the RevenueCat REST API, never the app | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refresh_reads_revenuecat_not_the_app` | Pass |
| PREM | D1 | Premium: refresh from the RevenueCat REST API, never the app | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refresh_revokes_when_revenuecat_says_inactive` | Pass |
| PREM | D1 | Premium: refresh from the RevenueCat REST API, never the app | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refresh_when_revenuecat_is_down_keeps_the_stored_state` | Pass |
| PREM | D1 | Premium: refresh from the RevenueCat REST API, never the app | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refresh_without_an_api_key_is_503` | Pass |
| PREM | D1 | Premium: refresh from the RevenueCat REST API, never the app | Unit | `backend/tests/services/test_premium_service.py::test_refresh_does_not_overwrite_a_newer_webhook` | Pass |
| PREM | D1 | Premium: refresh from the RevenueCat REST API, never the app | Unit | `backend/tests/services/test_premium_service.py::test_refresh_is_stamped_with_the_read_time` | Pass |
| PREM | D1 | Premium: refresh from the RevenueCat REST API, never the app | Unit | `backend/tests/services/test_premium_service.py::test_refresh_without_a_read_time_uses_the_time_before_the_read` | Pass |
| PREM | D1 | Premium: refresh is rate limited per user (10/minute) | Unit | `backend/tests/core/test_rate_limit_tiers.py::test_premium_refreshes_past_the_per_minute_limit_get_429` | Pass |
| PREM | D1 | Premium: refresh is rate limited per user (10/minute) | Unit | `backend/tests/core/test_rate_limit_tiers.py::test_reads_do_not_use_the_refresh_allowance` | Pass |
| PREM | D1 | Premium: RevenueCat REST client reads the subscriber | Unit | `backend/tests/services/test_revenuecat_client.py::test_active_entitlement_is_read_with_the_secret_key` | Pass |
| PREM | D1 | Premium: RevenueCat REST client reads the subscriber | Unit | `backend/tests/services/test_revenuecat_client.py::test_expired_or_missing_entitlement_is_inactive` | Pass |
| PREM | D1 | Premium: RevenueCat REST client reads the subscriber | Unit | `backend/tests/services/test_revenuecat_client.py::test_grace_period_keeps_the_entitlement` | Pass |
| PREM | D1 | Premium: RevenueCat REST client reads the subscriber | Unit | `backend/tests/services/test_revenuecat_client.py::test_lifetime_entitlement_has_no_expiry` | Pass |
| PREM | D1 | Premium: RevenueCat REST client reads the subscriber | Unit | `backend/tests/services/test_revenuecat_client.py::test_errors_raise_unavailable` | Pass |
| PREM | D1 | Premium: RevenueCat REST client reads the subscriber | Unit | `backend/tests/services/test_revenuecat_client.py::test_read_time_is_revenuecats_request_date` | Pass |
| PREM | D1 | Premium: RevenueCat REST client reads the subscriber | Unit | `backend/tests/services/test_revenuecat_client.py::test_no_api_key_means_no_client` | Pass |
| PREM | D1 | Premium unlocks the 12-month trend (D2) | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_premium_unlocks_the_12_month_trend` | Pass |
| PREM | D1 | Premium unlocks unlimited receipts (D2) | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_premium_user_scans_past_the_free_quota` | Pass |
| PREM | D1 | Premium status changes are tracked (`premium_status_changed`) | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_status_change_emits_analytics` | Pass |
| PREM | D1 | Account deletion erases the RevenueCat ledger rows | Integration | `backend/tests/api/test_account_deletion.py::test_delete_account_erases_every_row_and_image` | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 4: the feature list names what is built, with unlimited receipts and rollover" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "subscribing buys the selected plan, asks the backend and shows Premium once it says so" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "a purchase the backend has not seen yet says Premium is on its way, not active" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "a cancelled purchase shows nothing alarming" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "a failed purchase says so inline" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "restore purchases asks the backend and shows Premium" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "restore with no subscription on the Apple ID says so" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "restore when the backend cannot check (503) shows an error, not the no-subscription message" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 1: Yearly first and selected, with its monthly price and the saving, then Monthly" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 6, EC-PREM 1: a Premium user sees the plan and Manage Subscription, not a purchase button" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "in Expo Go it explains purchases need the App Store build" | Pass |
| PREM | D1 | Paywall: price and benefits; subscribe and restore | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "when the offer cannot load it offers a retry" | Pass |
| PREM | D1 | RevenueCat SDK guarded outside the dev build; logs in as the user | Component | `mobile/src/features/premium/__tests__/purchases.test.ts` "is unavailable in Expo Go, which has no native module" | Pass |
| PREM | D1 | RevenueCat SDK guarded outside the dev build; logs in as the user | Component | `mobile/src/features/premium/__tests__/purchases.test.ts` "is unavailable without the RevenueCat SDK key" | Pass |
| PREM | D1 | RevenueCat SDK guarded outside the dev build; logs in as the user | Component | `mobile/src/features/premium/__tests__/purchases.test.ts` "PREM-01 AC 1: configures RevenueCat for the user and reads both plans, yearly first" | Pass |
| PREM | D1 | RevenueCat SDK guarded outside the dev build; logs in as the user | Component | `mobile/src/features/premium/__tests__/purchases.test.ts` "logs in again when another user opens the paywall" | Pass |
| PREM | D1 | RevenueCat SDK guarded outside the dev build; logs in as the user | Component | `mobile/src/features/premium/__tests__/purchases.test.ts` "reports a cancelled purchase as cancelled, not failed" | Pass |
| PREM | D1 | RevenueCat SDK guarded outside the dev build; logs in as the user | Component | `mobile/src/features/premium/__tests__/purchases.test.ts` "restores purchases for the signed-in user" | Pass |
| PREM | D1 | Settings → Premium row, from the backend `is_premium` | Component | `mobile/src/__tests__/settingsHub.test.tsx` "a free user sees the free plan and a Premium row that opens the paywall (V11-P0)" | Pass |
| PREM | D1 | Settings → Premium row, from the backend `is_premium` | Component | `mobile/src/__tests__/settingsHub.test.tsx` "a Premium user sees Premium, from the backend profile" | Pass |
| PREM | D1 | Upgrade prompt opens the paywall (D2) | Component | `mobile/src/__tests__/trendMonths.test.tsx` "the upgrade prompt opens the Premium paywall (V11-P0)" | Pass |
| PREM | D1 | Deleting the account says the subscription is not cancelled | Component | `mobile/src/__tests__/deleteAccountScreen.test.tsx` "says a Premium subscription is not cancelled by deleting (V11-P0)" | Pass |
| PREM | D1 | Premium is never active with no expiry from a late grant or a refund | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_cancellation_without_expiry_before_its_purchase_grants_no_open_premium` | Pass |
| PREM | D1 | Premium is never active with no expiry from a late grant or a refund | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refunded_non_renewing_purchase_arriving_late_grants_nothing` | Pass |
| PREM | D1 | Premium is never active with no expiry from a late grant or a refund | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refund_of_a_non_renewing_purchase_ends_premium` | Pass |
| PREM | D1 | A refund (`cancel_reason` `CUSTOMER_SUPPORT`) with no expiry ends Premium despite a stored future expiry | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_refund_without_expiry_ends_premium_despite_a_stored_future_expiry` | Pass |
| PREM | D1 | A refund (`cancel_reason` `CUSTOMER_SUPPORT`) with no expiry ends Premium despite a stored future expiry | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_purchase_arriving_after_its_refund_without_expiry_grants_nothing` | Pass |
| PREM | D1 | A plain cancellation with no expiry keeps Premium to the stored expiry | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_plain_cancellation_without_expiry_keeps_the_stored_expiry` | Pass |
| PREM | D2 | Free user over the monthly cap: `429` with `code` `receipt_quota_exceeded` | Integration | `backend/tests/api/test_free_tier_quota.py::test_scan_blocked_at_quota` | Pass |
| PREM | D2 | Free user over the monthly cap: `429` with `code` `receipt_quota_exceeded` | Integration | `backend/tests/api/test_free_tier_quota.py::test_quota_429_carries_a_stable_code_for_the_upgrade_prompt` | Pass |
| PREM | D2 | Manual entry stays open at the cap | Integration | `backend/tests/api/test_free_tier_quota.py::test_manual_entry_is_not_capped_at_quota` | Pass |
| PREM | D2 | Premium user is not blocked by the cap | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_premium_user_scans_past_the_free_quota` | Pass |
| PREM | D2 | Free features stay free: price history | Integration | `backend/tests/api/test_premium_gating.py::test_price_history_is_free` | Pass |
| PREM | D2 | Cross-store comparison: Premium from D8 (was free under D2) | Integration | `backend/tests/api/test_premium_gating.py::test_price_comparison_is_premium` | Pass (D8 replaced the D2 row) |
| PREM | D2 | Free features stay free: item matching | Integration | `backend/tests/api/test_premium_gating.py::test_item_matching_is_free` | Pass |
| PREM | D2 | Free features stay free: item merge and split | Integration | `backend/tests/api/test_premium_gating.py::test_merge_and_split_are_free` | Pass |
| PREM | D2 | Free features stay free: accept a match suggestion | Integration | `backend/tests/api/test_premium_gating.py::test_accepting_a_suggestion_is_free` | Pass |
| PREM | D2 | Free features stay free: reject a match suggestion | Integration | `backend/tests/api/test_premium_gating.py::test_rejecting_a_suggestion_is_free` | Pass |
| PREM | D2 | Free features stay free: price alerts | Integration | `backend/tests/api/test_premium_gating.py::test_price_alerts_are_free` | Pass |
| PREM | D2 | 12-month trend is Premium, one `403 premium_required` shape; 3 months stays free | Integration | `backend/tests/api/test_premium_gating.py::test_three_month_trend_is_free_and_twelve_is_premium` | Pass |
| PREM | D2 | App knows the cap by its code | Unit | `mobile/src/features/receipt-capture/__tests__/offlineQueue.test.ts` "spots the quota by its code, whatever the detail says" | Pass |
| PREM | D2 | A capped queued photo is retryable once the user is Premium (backend `is_premium`) | Component | `mobile/src/__tests__/historyOfflineQueue.test.tsx` "offers a retry, not Premium, once the user has upgraded (V11-P4)" | Pass |
| PREM | D2 | A capped queued photo is retryable once the user is Premium (backend `is_premium`) | Component | `mobile/src/__tests__/historyOfflineQueue.test.tsx` "queues the retry for later when a Premium user is offline" | Pass |
| PREM | D2 | Camera scan at the cap: upgrade prompt opens the paywall, no error | Component | `mobile/src/__tests__/scanOfflineQueue.test.tsx` "does not queue a photo over the monthly quota, and invites an upgrade (D2)" | Pass |
| PREM | D2 | Import at the cap: upgrade prompt opens the paywall, no error | Component | `mobile/src/features/receipt-capture/__tests__/useReceiptImport.test.tsx` "answers the monthly quota with the Premium upgrade prompt, not an error (D2)" | Pass |
| PREM | D2 | Import at the cap: upgrade prompt opens the paywall, no error | Unit | `mobile/src/features/receipt-capture/__tests__/receiptImport.test.ts` "does not queue a file over the monthly quota, and reports the quota" | Pass |
| PREM | D2 | Queued photo that hit the cap: upgrade prompt opens the paywall | Component | `mobile/src/__tests__/historyOfflineQueue.test.tsx` "offers Premium for a photo over the monthly quota, and keeps the photo (D2)" | Pass |
| PREM | D2 | Cap, Premium unblock and free endpoints through the API | E2E | `.agents/skills/verify-grocery-genie/features/premium.md` `premium-quota-free`, `premium-unlimited`, `premium-free-features` | Pass |
| PREM | D1 | Sandbox purchase and restore on a device | Manual | `docs/DEPLOYMENT.md` 2.9 step 6 (needs the RevenueCat keys and App Store product) | Pending |
| PREM | NFR-P2 | Export: JSON with receipts, line items, budgets and prices | Integration | `backend/tests/api/test_data_export.py::test_json_export_has_receipts_line_items_budgets_and_prices` | Pass |
| PREM | NFR-P2 | Export: CSV, a zip with one file per entity | Integration | `backend/tests/api/test_data_export.py::test_csv_export_is_a_zip_of_one_file_per_entity` | Pass |
| PREM | NFR-P2 | Export: an empty account exports empty lists and CSV headers | Integration | `backend/tests/api/test_data_export.py::test_json_export_of_an_empty_account` | Pass |
| PREM | NFR-P2 | Export: an empty account exports empty lists and CSV headers | Integration | `backend/tests/api/test_data_export.py::test_csv_export_of_an_empty_account_has_headers` | Pass |
| PREM | NFR-P2 | Export: only the user's own data, deleted receipts left out | Integration | `backend/tests/api/test_data_export.py::test_json_export_has_receipts_line_items_budgets_and_prices` | Pass |
| PREM | NFR-P2 | Export: only the user's own data, deleted receipts left out | Integration | `backend/tests/api/test_data_export.py::test_csv_export_is_a_zip_of_one_file_per_entity` | Pass |
| PREM | NFR-P2 | Export: deleted budgets left out | Integration | `backend/tests/api/test_data_export.py::test_export_leaves_out_a_deleted_budget` | Pass |
| PREM | NFR-P2 | Export: CSV formula injection escaped | Unit | `backend/tests/api/test_data_export.py::test_csv_text_cells_are_escaped` | Pass |
| PREM | NFR-P2 | Export: CSV formula injection escaped | Integration | `backend/tests/api/test_data_export.py::test_csv_escapes_store_names_too` | Pass |
| PREM | NFR-P2 | Export: Premium only (D2), `403 premium_required` | Integration | `backend/tests/api/test_data_export.py::test_export_needs_premium` | Pass |
| PREM | NFR-P2 | Export: Premium only (D2), `403 premium_required` | Integration | `backend/tests/api/test_data_export.py::test_free_user_refused_export_records_no_event` | Pass |
| PREM | NFR-P2 | Export: large accounts read in batches (receipts, line items and price observations past one page) | Integration | `backend/tests/api/test_data_export.py::test_export_reads_in_batches` | Pass |
| PREM | NFR-P2 | Export: the spooled file is closed on every path (streamed, client gone first, analytics error) | Integration | `backend/tests/api/test_data_export.py::test_export_file_closed_after_streaming` | Pass |
| PREM | NFR-P2 | Export: the spooled file is closed on every path (streamed, client gone first, analytics error) | Integration | `backend/tests/api/test_data_export.py::test_export_file_closed_when_client_disconnects_before_streaming` | Pass |
| PREM | NFR-P2 | Export: the spooled file is closed on every path (streamed, client gone first, analytics error) | Integration | `backend/tests/api/test_data_export.py::test_export_file_closed_when_analytics_fails` | Pass |
| PREM | NFR-P2 | Export: the spooled file is closed on every path (a read failing mid-build) | Integration | `backend/tests/api/test_data_export.py::test_export_file_closed_when_build_fails` | Pass |
| PREM | NFR-P2 | Export: `data_exported` analytics event | Integration | `backend/tests/api/test_data_export.py::test_export_records_data_exported_event` | Pass |
| PREM | NFR-P2 | Export: unknown format is a 422; signed out is a 401 | Integration | `backend/tests/api/test_data_export.py::test_export_rejects_unknown_format` | Pass |
| PREM | NFR-P2 | Export: unknown format is a 422; signed out is a 401 | Integration | `backend/tests/api/test_data_export.py::test_export_needs_sign_in` | Pass |
| PREM | NFR-P2 | Export (app): download with the session, iOS share sheet, cached copy removed | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "downloads the chosen options with the session token into the cache" | Pass |
| PREM | NFR-P2 | Export (app): download with the session, iOS share sheet, cached copy removed | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "opens the share sheet with the file, then deletes the cached copy" | Pass |
| PREM | NFR-P2 | Export (app): a 403 from the download is premium_required | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "a 403 from the download is premium_required (Premium lapsed meanwhile)" | Pass |
| PREM | NFR-P2 | Export (app): Settings → Export data, CSV, JSON or PDF | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "exports CSV of the last 12 months by default and opens the share sheet" | Pass |
| PREM | NFR-P2 | Export (app): Settings → Export data, CSV, JSON or PDF | Component | `mobile/src/__tests__/settingsHub.test.tsx` "opens %s in the app" | Pass |
| PREM | NFR-P2 | Export (app): a free user sees the upgrade prompt, never an error (D2) | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "a free user sees the upgrade prompt, which opens the paywall" | Pass |
| PREM | NFR-P2 | Export (app): a free user sees the upgrade prompt, never an error (D2) | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "a premium_required answer turns into the upgrade prompt, not an error" | Pass |
| PREM | NFR-P2 | Export (app): any other failure is inline, with retry | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "any other failure says so inline and can be tried again" | Pass |
| PREM | NFR-P2 | Export (app): paywall lists data export | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 4: the feature list names what is built, with unlimited receipts and rollover" | Pass |
| PREM | NFR-P2 | Export (app): share sheet on a device (Save to Files, AirDrop) | Manual | Simulator / device check; API-only verify cannot drive the share sheet | Pending |
| BC-04 | 5 | 12-month dashboard loads within 2 seconds | Integration | `backend/tests/api/test_p95_postgres.py::test_dashboard_12_month_trend_p95_under_2s` (Postgres) | Pass |
| BC-FR | Trends | 3/12-month toggle on Trend; 3 stays the default | Component | `mobile/src/__tests__/trendMonths.test.tsx` "shows 3 months by default and asks the server for 3" | Pass |
| BC-FR | Trends | 3/12-month toggle on Trend; 12 months charts every month | Component | `mobile/src/__tests__/trendMonths.test.tsx` "switching to 12 months asks the server for 12 and charts every month" | Pass |
| BC-FR | Trends | 3/12-month toggle on Trend; 12 months charts every month | Component | `mobile/src/__tests__/trendMonths.test.tsx` "compares the 12-month average with the 12 months before" | Pass |
| BC-FR | Trends | Free user sees an upgrade prompt, not an error (D2) | Component | `mobile/src/__tests__/trendMonths.test.tsx` "a free user asking for 12 months sees an upgrade prompt, not an error" | Pass |
| BC-FR | Trends | Free user sees an upgrade prompt, not an error (D2) | Component | `mobile/src/__tests__/trendMonths.test.tsx` "switching back to 3 months after the upgrade prompt shows the 3-month chart" | Pass |
| BC-FR | Trends | Free user sees an upgrade prompt, not an error (D2) | Component | `mobile/src/components/__tests__/PremiumUpgradePrompt.test.tsx` "calls onUpgrade when the upgrade button is tapped (the V11-P0 paywall seam)" | Pass |
| BC-FR | Trends | Another 12-month load failure offers a retry | Component | `mobile/src/__tests__/trendMonths.test.tsx` "another failure loading 12 months offers a retry" | Pass |
| EC-PI | 1 | Store normalization: branch numbers and punctuation drop out | Unit | `backend/tests/services/test_store_service.py::test_normalize_store_name` | Pass |
| EC-PI | 1 | Store normalization: branch numbers and punctuation drop out | Integration | `backend/tests/services/test_store_service.py::test_branch_numbers_and_punctuation_find_one_store` | Pass |
| EC-PI | 1 | Store normalization: branch numbers and punctuation drop out | Integration | `backend/tests/api/test_store_merge.py::test_branch_numbers_normalize_into_one_store` | Pass |
| EC-PI | 1 | Store normalization: existing rows kept, grouped under the oldest | Integration | `backend/tests/services/test_store_service.py::test_older_rows_that_now_normalize_together_group_together` | Pass |
| EC-PI | 1 | Store normalization: existing rows kept, grouped under the oldest | Unit | `backend/tests/services/test_store_service.py::test_the_migration_normalized_existing_stores_the_same_way` | Pass |
| EC-PI | 1 | Store normalization favours precision: no false groups | Unit | `backend/tests/services/test_store_service.py::test_different_stores_never_normalize_together` | Pass |
| EC-PI | 1 | Store normalization favours precision: no false groups | Unit | `backend/tests/services/test_store_service.py::test_the_normalized_name_fits_the_column` | Pass |
| EC-PI | 1 | Store names never cross accounts | Integration | `backend/tests/api/test_store_merge.py::test_a_receipt_shows_its_own_store_name_not_another_users` | Pass |
| EC-PI | 1 | Store names never cross accounts | Integration | `backend/tests/api/test_store_merge.py::test_correcting_the_store_name_keeps_the_correction` | Pass |
| EC-PI | 1 | Store names never cross accounts | Integration | `backend/tests/api/test_store_merge.py::test_the_history_filter_never_matches_another_users_name` | Pass |
| EC-PI | 1 | Store names never cross accounts | Integration | `backend/tests/services/test_store_service.py::test_a_group_is_named_as_the_users_own_receipts_name_it` | Pass |
| EC-PI | 1 | Store names never cross accounts | Integration | `backend/tests/api/test_store_merge.py::test_a_merge_target_purged_keeps_the_users_name` | Pass |
| EC-PI | 1 | Store names never cross accounts | Integration | `backend/tests/api/test_store_merge.py::test_a_mute_outliving_its_receipts_keeps_the_users_name` | Pass |
| EC-PI | 1 | Store list: the user's stores as they group | Integration | `backend/tests/api/test_store_merge.py::test_the_store_list_leaves_out_deleted_receipts` | Pass |
| EC-PI | 1 | User merge: per-user only, shared rows untouched (D3) | Integration | `backend/tests/services/test_store_service.py::test_a_merge_groups_only_that_users_stores` | Pass |
| EC-PI | 1 | User merge: per-user only, shared rows untouched (D3) | Integration | `backend/tests/api/test_store_merge.py::test_another_users_merge_never_changes_my_grouping` | Pass |
| EC-PI | 1 | User merge: comparison groups merged stores (PI-04) | Integration | `backend/tests/api/test_store_merge.py::test_a_merged_store_compares_as_one_store` | Pass |
| EC-PI | 1 | User merge: comparison groups merged stores (PI-04) | Integration | `backend/tests/api/test_store_merge.py::test_a_merge_can_lift_stores_over_the_comparison_minimum` | Pass |
| EC-PI | 1 | User merge: price history and item stats group merged stores (PI-01) | Integration | `backend/tests/api/test_store_merge.py::test_price_history_and_stats_group_merged_stores` | Pass |
| EC-PI | 1 | User merge: groups one level deep; merging into its own group is refused | Integration | `backend/tests/services/test_store_service.py::test_merging_a_group_moves_its_merged_stores_too` | Pass |
| EC-PI | 1 | User merge: groups one level deep; merging into its own group is refused | Integration | `backend/tests/services/test_store_service.py::test_a_store_cannot_be_merged_into_its_own_group` | Pass |
| EC-PI | 1 | User merge: groups one level deep; merging into its own group is refused | Integration | `backend/tests/api/test_store_merge.py::test_merging_into_the_same_store_is_409` | Pass |
| EC-PI | 1 | User merge: only stores the user shopped at | Integration | `backend/tests/services/test_store_service.py::test_only_stores_the_user_shopped_at_can_be_merged` | Pass |
| EC-PI | 1 | User merge: only stores the user shopped at | Integration | `backend/tests/services/test_store_service.py::test_a_branch_of_a_shopped_store_counts_as_shopped` | Pass |
| EC-PI | 1 | User merge: only stores the user shopped at | Integration | `backend/tests/api/test_store_merge.py::test_merging_a_store_the_user_never_shopped_at_is_404` | Pass |
| EC-PI | 1 | User merge: only stores the user shopped at | Integration | `backend/tests/api/test_store_merge.py::test_merge_needs_a_target` | Pass |
| EC-PI | 1 | User merge: only stores the user shopped at | Integration | `backend/tests/services/test_store_service.py::test_a_store_on_only_deleted_receipts_is_not_shopped` | Pass |
| EC-PI | 1 | Unmerge undoes a merge | Integration | `backend/tests/api/test_store_merge.py::test_unmerge_splits_the_stores_again` | Pass |
| EC-PI | 1 | Store mutes follow the user's grouping (PI-03 AC 4) | Integration | `backend/tests/api/test_store_merge.py::test_a_muted_store_merged_into_another_mutes_the_merged_store` | Pass |
| EC-PI | 1 | Store mutes follow the user's grouping (PI-03 AC 4) | Integration | `backend/tests/api/test_store_merge.py::test_after_unmerge_a_mute_stays_with_the_store_it_was_set_on` | Pass |
| EC-PI | 1 | Store mutes follow the user's grouping (PI-03 AC 4) | Integration | `backend/tests/api/test_store_merge.py::test_muting_a_merged_group_quiets_the_merged_store` | Pass |
| EC-PI | 1 | A price alert names the merged store (PI-03) | Integration | `backend/tests/api/test_store_merge.py::test_a_price_alert_names_the_merged_store` | Pass |
| EC-PI | 1 | Data export prices use the user's grouping | Integration | `backend/tests/api/test_data_export.py::test_export_prices_use_the_users_store_grouping` | Pass |
| EC-PI | 1 | Account deletion erases the user's store merges | Integration | `backend/tests/api/test_account_deletion.py::test_delete_account_erases_every_row_and_image` | Pass |
| EC-PI | 1 | Merge and unmerge from Settings → Stores (app) | Component | `mobile/src/__tests__/storeMerge.test.tsx` "merges one store into another the user picks" | Pass |
| EC-PI | 1 | Merge and unmerge from Settings → Stores (app) | Component | `mobile/src/__tests__/storeMerge.test.tsx` "unmerges a merged store" | Pass |
| EC-PI | 1 | Merge and unmerge from Settings → Stores (app) | Component | `mobile/src/__tests__/storeMerge.test.tsx` "lists the stores with their receipt counts" | Pass |
| EC-PI | 1 | Merge and unmerge from Settings → Stores (app) | Component | `mobile/src/__tests__/storeMerge.test.tsx` "says so when a merge fails" | Pass |
| EC-PI | 1 | Merge and unmerge from Settings → Stores (app) | Component | `mobile/src/__tests__/storeMerge.test.tsx` "scrolls the merge sheet when the user has many stores" | Pass |
| EC-PI | 1 | Merge and unmerge from Settings → Stores (app) | Component | `mobile/src/__tests__/settingsHub.test.tsx` "opens Stores, where the user merges the same store (V11-05)" | Pass |
| EC-PI | 1 | Merge and unmerge from Settings → Stores (app) | Manual | Simulator + VoiceOver check of Settings → Stores and its merge sheet; API-only verify cannot drive it | Pending |
| PREM | D5 | Verified account email on the waitlist gets a 12-month RevenueCat promotional grant | Integration | `backend/tests/services/test_waitlist_service.py::test_verified_account_on_the_waitlist_gets_twelve_months` | Pass |
| PREM | D5 | Email matched trimmed and lowercased | Integration | `backend/tests/services/test_waitlist_service.py::test_email_is_matched_trimmed_and_lowercased` | Pass |
| PREM | D5 | Only verified emails match | Integration | `backend/tests/services/test_waitlist_service.py::test_unverified_email_does_not_match` | Pass |
| PREM | D5 | Only verified emails match | Integration | `backend/tests/api/test_waitlist_offer.py::test_matching_never_trusts_the_client` | Pass |
| PREM | D5 | Contacts created after the cut-off don't qualify | Integration | `backend/tests/services/test_waitlist_service.py::test_contact_created_after_the_cutoff_does_not_qualify` | Pass |
| PREM | D5 | Unsubscribed contacts still qualify (decisions #10) | Integration | `backend/tests/services/test_waitlist_service.py::test_unsubscribed_contact_still_qualifies` | Pass |
| PREM | D5 | No grant outside the 90-day claim window | Integration | `backend/tests/services/test_waitlist_service.py::test_no_grant_outside_the_claim_window` | Pass |
| PREM | D5 | No grant outside the 90-day claim window | Integration | `backend/tests/api/test_waitlist_offer.py::test_claim_link_tapped_after_the_window_closes_grants_nothing` | Pass |
| PREM | D5 | Matches on verify-email | Integration | `backend/tests/api/test_waitlist_offer.py::test_verify_email_matches_and_grants_premium` | Pass |
| PREM | D5 | Matches on Apple and Google sign-in | Integration | `backend/tests/api/test_waitlist_offer.py::test_apple_sign_in_with_the_waitlist_email_matches` | Pass |
| PREM | D5 | Matches on Apple and Google sign-in | Integration | `backend/tests/api/test_waitlist_offer.py::test_google_sign_in_with_the_waitlist_email_matches` | Pass |
| PREM | D5 | Matches on a confirmed email change | Integration | `backend/tests/api/test_waitlist_offer.py::test_confirmed_email_change_matches` | Pass |
| PREM | D5 | Launch backfill over every existing account | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_launch_backfill_copies_the_audience_and_matches_existing_accounts` | Pass |
| PREM | D5 | Waitlist read from the Resend audience API or a CSV export | Integration | `backend/tests/services/test_waitlist_source.py::test_lists_every_page_of_the_audience` | Pass |
| PREM | D5 | Waitlist read from the Resend audience API or a CSV export | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_backfill_without_an_audience_matches_the_copy_already_there` | Pass |
| PREM | D5 | One free year per waitlist email, across accounts | Integration | `backend/tests/services/test_waitlist_service.py::test_one_free_year_per_waitlist_email_across_accounts` | Pass |
| PREM | D5 | One free year per waitlist email, across accounts | Integration | `backend/tests/api/test_waitlist_offer.py::test_claim_of_a_waitlist_email_already_redeemed_is_refused_at_confirm` | Pass |
| PREM | D5 | A RevenueCat failure leaves the redemption pending and retries | Integration | `backend/tests/services/test_waitlist_service.py::test_revenuecat_failure_leaves_the_redemption_pending_and_retries` | Pass |
| PREM | D5 | A RevenueCat failure leaves the redemption pending and retries | Integration | `backend/tests/api/test_waitlist_offer.py::test_revenuecat_down_keeps_verify_working_and_the_grant_pending` | Pass |
| PREM | D5 | The grant is RevenueCat's v1 promotional endpoint with end_time_ms | Unit | `backend/tests/services/test_revenuecat_client.py::test_promotional_grant_posts_the_end_time_and_no_duration` | Pass |
| PREM | D5 | Hide My Email doesn't match, but the claim step does | Integration | `backend/tests/api/test_waitlist_offer.py::test_hide_my_email_claims_through_the_settings_step` | Pass |
| PREM | D5 | The claim step can't look up who is on the waitlist | Integration | `backend/tests/api/test_waitlist_offer.py::test_claim_for_an_email_not_on_the_waitlist_sends_nothing` | Pass |
| PREM | D5 | The claim answers the same 202 for any email, does no lookup in the request, and enqueues one task | Integration | `backend/tests/api/test_waitlist_offer.py::test_listed_and_unlisted_claims_answer_alike_and_only_enqueue` | Pass |
| PREM | D5 | A Resend failure on the claim email never reaches the client | Integration | `backend/tests/api/test_waitlist_offer.py::test_a_resend_failure_never_reaches_the_client` | Pass |
| PREM | D5 | A Resend failure on the claim email never reaches the client | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_the_claim_task_swallows_a_resend_failure` | Pass |
| PREM | D5 | The claim task looks the email up and sends the link only to a listed one | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_the_claim_task_sends_the_link_only_to_a_listed_email` | Pass |
| PREM | D5 | Claims are rate limited per user (429) | Integration | `backend/tests/api/test_waitlist_offer.py::test_claims_are_limited_per_user` | Pass |
| PREM | D5 | Claims are rate limited per account and target email (same 202, nothing sent) | Integration | `backend/tests/api/test_waitlist_offer.py::test_claims_for_one_waitlist_email_are_limited_per_account` | Pass |
| PREM | D5 | Another account's claims can't lock out the member | Integration | `backend/tests/api/test_waitlist_offer.py::test_another_accounts_claims_cannot_lock_out_the_member` | Pass |
| PREM | D5 | Sign-in and verify-email wait at most a short timeout on RevenueCat, then leave the grant to the retry | Integration | `backend/tests/api/test_waitlist_offer.py::test_a_slow_revenuecat_grant_leaves_verify_fast_and_pending` | Pass |
| PREM | D5 | Sign-in and verify-email wait at most a short timeout on RevenueCat, then leave the grant to the retry | Integration | `backend/tests/api/test_waitlist_offer.py::test_a_slow_read_back_still_answers_granted` | Pass |
| PREM | D5 | A pending row is stamped before the first grant, so the retry never calls RevenueCat twice | Integration | `backend/tests/services/test_waitlist_service.py::test_pending_row_is_stamped_before_the_first_grant` | Pass |
| PREM | D5 | The retry backs off (15 min to 6 h) and gives up only 14 days after the match | Integration | `backend/tests/services/test_waitlist_service.py::test_retry_backs_off_and_gives_up_only_after_14_days` | Pass |
| PREM | D5 | The retry backs off (15 min to 6 h) and gives up only 14 days after the match | Integration | `backend/tests/services/test_waitlist_service.py::test_a_long_backoff_is_capped_at_six_hours` | Pass |
| PREM | D5 | A grant whose end time has passed is recorded as failed, not sent | Integration | `backend/tests/services/test_waitlist_service.py::test_a_grant_whose_end_time_has_passed_is_recorded_not_sent` | Pass |
| PREM | D5 | A final grant failure is logged at error level | Integration | `backend/tests/services/test_waitlist_service.py::test_a_final_failure_is_logged_at_error_level` | Pass |
| PREM | D5 | A failed grant shows as failed, and the app says to contact support | Integration | `backend/tests/api/test_waitlist_offer.py::test_a_failed_grant_shows_as_failed` | Pass |
| PREM | D5 | A failed grant shows as failed, and the app says to contact support (app) | Component | `mobile/src/__tests__/waitlistOfferScreen.test.tsx` "says a failed free year needs support, and emails support" | Pass |
| PREM | D5 | A failed grant shows as failed, and the app says to contact support (app) | Component | `mobile/src/__tests__/waitlistOfferScreen.test.tsx` "says to contact support when the free year could not be applied" | Pass |
| PREM | D5 | A RevenueCat 4xx is final: failed, with the reason | Integration | `backend/tests/services/test_waitlist_service.py::test_a_revenuecat_4xx_is_final` | Pass |
| PREM | D5 | A RevenueCat 4xx is final: failed, with the reason | Integration | `backend/tests/services/test_revenuecat_client.py::test_a_4xx_grant_is_rejected_for_good` | Pass |
| PREM | D5 | A member matched inside the window is still granted after it closes (decisions #9) | Integration | `backend/tests/services/test_waitlist_service.py::test_retry_keeps_going_after_the_window_closes` | Pass |
| PREM | D5 | Two accounts racing for one waitlist email get exactly one grant (Postgres) | Integration | `backend/tests/services/test_waitlist_concurrency.py::test_two_accounts_racing_for_one_waitlist_email_get_one_grant` | Pass |
| PREM | D5 | The Resend audience contacts are deleted once the window has closed, in batches, idempotently (plan: retention) | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_purge_deletes_the_resend_contacts_in_batches_once_closed` | Pass |
| PREM | D5 | The Resend audience contacts are deleted once the window has closed, in batches, idempotently (plan: retention) | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_a_failed_resend_delete_stops_the_run_and_a_rerun_finishes` | Pass |
| PREM | D5 | The Resend purge stops calling Resend once a run finds the audience empty | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_the_resend_purge_is_not_done_until_a_run_finds_it_empty` | Pass |
| PREM | D5 | The Resend purge stops calling Resend once a run finds the audience empty | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_the_backend_copy_is_still_purged_after_the_resend_purge_is_done` | Pass |
| PREM | D5 | The Resend audience is left alone while the window is open or without a launch date | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_purge_leaves_the_resend_audience_while_the_window_is_open` | Pass |
| PREM | D5 | The Resend audience is left alone while the window is open or without a launch date | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_purge_leaves_the_resend_audience_without_a_launch_date` | Pass |
| PREM | D5 | A separate Resend audience key, falling back to the sending key | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_the_audience_key_falls_back_to_the_sending_key` | Pass |
| PREM | D5 | Settings draws a divider between the Premium and waitlist rows (app) | Component | `mobile/src/__tests__/settingsHub.test.tsx` "draws a divider between the Premium row and the waitlist row (V11-P5)" | Pass |
| PREM | D5 | Account deletion keeps only an unlinked salted hash (decisions #13) | Integration | `backend/tests/api/test_account_deletion.py::test_redeemed_waitlist_email_outlives_the_account_as_an_unlinked_hash` | Pass |
| PREM | D5 | The waitlist copy and unlinked hashes are deleted when the window closes (decisions #11) | Integration | `backend/tests/tasks/test_waitlist_tasks.py::test_purge_after_the_window_deletes_the_waitlist_and_unlinked_hashes` | Pass |
| PREM | D5 | Settings shows "Claim your waitlist offer" only while the server allows it (app) | Component | `mobile/src/__tests__/settingsHub.test.tsx` "offers the waitlist claim only while the server says it is open (V11-P5)" | Pass |
| PREM | D5 | The claim screen sends the link and shows refusals inline (app) | Component | `mobile/src/__tests__/waitlistOfferScreen.test.tsx` "sends a link to the waitlist email and says where to look" | Pass |
| PREM | D5 | The claim screen sends the link and shows refusals inline (app) | Component | `mobile/src/__tests__/waitlistOfferScreen.test.tsx` "shows why a claim was refused, inline" | Pass |
| PREM | D5 | The claim link confirms and says the free year is on (app) | Component | `mobile/src/__tests__/waitlistOfferScreen.test.tsx` "confirms the token and says the free year is on" | Pass |
| PREM | D5 | Claim screen and link screen (app) | Manual | Simulator + VoiceOver check of Settings → Claim your waitlist offer and the claim link; API-only verify cannot drive it | Pending |
| EC-PI | 1 | User merge and unmerge: `store_merged` and `store_unmerged` analytics events | Integration | `backend/tests/api/test_store_merge.py::test_unmerge_splits_the_stores_again` | Pass |
| EC-PI | 2 | Unit price ambiguity: per-kg and per-unit prices compare only like-for-like (comparison) | Integration | `backend/tests/api/test_price_comparison.py::test_only_like_for_like_prices_are_compared` | Pass |
| EC-PI | 2 | Unit price ambiguity: per-kg and per-unit prices compare only like-for-like (timeline) | Integration | `backend/tests/api/test_items.py::test_prices_in_another_unit_are_listed_but_not_plotted` | Pass |
| EC-PI | 2 | Unit price ambiguity: per-kg and per-unit prices compare only like-for-like (alert average) | Integration | `backend/tests/services/test_price_alert_service.py::test_the_average_is_like_for_like_and_skips_deleted_receipts` | Pass |
| EC-PI | 3 | A sale price is a regular observation, in the timeline and the average | Integration | `backend/tests/api/test_price_comparison.py::test_a_sale_price_is_a_regular_observation` | Pass |
| PREM-01 | 1 | Yearly and Monthly from the RevenueCat offering, App Store prices, Yearly first with /mo and SAVE % | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 1: Yearly first and selected, with its monthly price and the saving, then Monthly" | Pass |
| PREM-01 | 1 | Yearly and Monthly from the RevenueCat offering, App Store prices, Yearly first with /mo and SAVE % | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 1: prices and the saving come from the App Store, never hard-coded" | Pass |
| PREM-01 | 1 | Yearly and Monthly from the RevenueCat offering, App Store prices, Yearly first with /mo and SAVE % | Unit | `mobile/src/features/premium/__tests__/purchases.test.ts` "PREM-01 AC 1: configures RevenueCat for the user and reads both plans, yearly first" | Pass |
| PREM-01 | 1 | Yearly and Monthly from the RevenueCat offering, App Store prices, Yearly first with /mo and SAVE % | Unit | `mobile/src/features/premium/__tests__/purchases.test.ts` "an offering with only the monthly package still shows it" | Pass |
| PREM-01 | 2 | Trial on both plans: "Start 7-day free trial" only when eligible, with the after-trial price; else Subscribe | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 2, EC-PREM 1: an eligible user starts the 7-day trial on either plan" | Pass |
| PREM-01 | 2 | Trial on both plans: "Start 7-day free trial" only when eligible, with the after-trial price; else Subscribe | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 2, EC-PREM 1: a user the App Store says cannot take the trial sees Subscribe" | Pass |
| PREM-01 | 2 | Trial on both plans: "Start 7-day free trial" only when eligible, with the after-trial price; else Subscribe | Unit | `mobile/src/features/premium/__tests__/purchases.test.ts` "PREM-01 AC 2: a plan carries the 7-day trial only when the App Store allows it" | Pass |
| PREM-01 | 2 | Trial on both plans: "Start 7-day free trial" only when eligible, with the after-trial price; else Subscribe | Unit | `mobile/src/features/premium/__tests__/purchases.test.ts` "an eligibility check that fails shows no trial, never a misleading one" | Pass |
| PREM-01 | 3 | Paywall look: × close, title "Premium", subtitle, feature icons, "Cancel anytime · Restore purchase" | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 3: the design look, × close, title, subtitle, cancel anytime and restore" | Pass |
| PREM-01 | 3 | Paywall look: × close, title "Premium", subtitle, feature icons, "Cancel anytime · Restore purchase" | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "restore purchases asks the backend and shows Premium" | Pass |
| PREM-01 | 4 | Feature list names only what is built, keeps unlimited receipts and rollover; new stay-free line | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 4: the feature list names what is built, with unlimited receipts and rollover" | Pass |
| PREM-01 | 5 | Either product, trial, trial cancel, conversion and plan switch keep Premium right | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_either_plan_grants_premium` | Pass |
| PREM-01 | 5 | Either product, trial, trial cancel, conversion and plan switch keep Premium right | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_a_trial_is_premium_until_it_ends` | Pass |
| PREM-01 | 5 | Either product, trial, trial cancel, conversion and plan switch keep Premium right | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_a_trial_cancelled_in_its_7_days_stays_premium_to_its_end` | Pass |
| PREM-01 | 5 | Either product, trial, trial cancel, conversion and plan switch keep Premium right | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_a_trial_that_converts_renews_with_no_gap` | Pass |
| PREM-01 | 5 | Either product, trial, trial cancel, conversion and plan switch keep Premium right | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_a_plan_change_keeps_premium_with_no_gap` | Pass |
| PREM-01 | 5 | Either product, trial, trial cancel, conversion and plan switch keep Premium right | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "subscribing buys the selected plan, asks the backend and shows Premium once it says so" | Pass |
| PREM-01 | 6 | Offer-unavailable, Expo Go and Premium-user states unchanged | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 6: when the offer cannot load it offers a retry" | Pass |
| PREM-01 | 6 | Offer-unavailable, Expo Go and Premium-user states unchanged | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 6: in Expo Go it explains purchases need the App Store build" | Pass |
| PREM-01 | 6 | Offer-unavailable, Expo Go and Premium-user states unchanged | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 6, EC-PREM 1: a Premium user sees the plan and Manage Subscription, not a purchase button" | Pass |
| PREM-01 | 7 | DEPLOYMENT.md lists product ids, trial offer, group, offering and packages | Manual | `docs/DEPLOYMENT.md` 2.9 (the table and steps 1–6); tests mock the offering (`mobile/src/features/premium/__tests__/purchases.test.ts`); `08-api-contracts.md` Premium gives the prices | Pass (doc reviewed; the App Store and RevenueCat setup is the user's, `docs/device-checklist.md` Free trial) |
| PREM-02 | 1 | Compare answers a free user 403 premium_required, Premium 200 | Integration | `backend/tests/api/test_premium_gating.py::test_price_comparison_is_premium` | Pass |
| PREM-02 | 1 | Compare answers a free user 403 premium_required, Premium 200 | Integration | `backend/tests/api/test_premium_gating.py::test_the_premium_check_comes_before_an_unknown_id` | Pass |
| PREM-02 | 1 | Compare answers a free user 403 premium_required, Premium 200 | Integration | `backend/tests/api/test_premium_gating.py::test_the_premium_check_comes_before_another_users_item` | Pass |
| PREM-02 | 2 | Item and store mute POST 403 for a free user; DELETE open to all | Integration | `backend/tests/api/test_premium_gating.py::test_muting_is_premium_and_unmuting_is_open` | Pass |
| PREM-02 | 2 | Item and store mute POST 403 for a free user; DELETE open to all | Integration | `backend/tests/api/test_premium_gating.py::test_the_premium_check_comes_before_an_unknown_id` | Pass |
| PREM-02 | 2 | Item and store mute POST 403 for a free user; DELETE open to all | Integration | `backend/tests/api/test_premium_gating.py::test_the_premium_check_comes_before_another_users_item` | Pass |
| PREM-02 | 3 | A mute outlives a Premium lapse: still honoured, listed and removable | Integration | `backend/tests/api/test_premium_gating.py::test_a_mute_outlives_a_premium_lapse` | Pass |
| PREM-02 | 4 | History, matching, alerts, alert settings and the alerts list stay free | Integration | `backend/tests/api/test_premium_gating.py::test_price_alerts_are_free` | Pass |
| PREM-02 | 4 | History, matching, alerts, alert settings and the alerts list stay free | Integration | `backend/tests/api/test_premium_gating.py::test_price_history_is_free` | Pass |
| PREM-02 | 4 | History, matching, alerts, alert settings and the alerts list stay free | Integration | `backend/tests/api/test_premium_gating.py::test_item_matching_is_free` | Pass |
| PREM-02 | 4 | History, matching, alerts, alert settings and the alerts list stay free | Integration | `backend/tests/api/test_premium_gating.py::test_merge_and_split_are_free` | Pass |
| PREM-02 | 4 | History, matching, alerts, alert settings and the alerts list stay free | Integration | `backend/tests/api/test_premium_gating.py::test_store_merge_is_free` | Pass |
| PREM-02 | 5 | App: comparison upgrade prompt opens the paywall; on the Alerts screen a free user turning a switch off (muting) gets the upgrade prompt and the switch stays on; a lapsed user can turn a muted switch back on | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "AC 5: item detail shows the upgrade prompt where the comparison was, and it opens the paywall" | Pass |
| PREM-02 | 5 | App: comparison upgrade prompt opens the paywall; on the Alerts screen a free user turning a switch off (muting) gets the upgrade prompt and the switch stays on; a lapsed user can turn a muted switch back on | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "AC 5: a free user turning a switch off gets the upgrade prompt and the switch stays on" | Pass |
| PREM-02 | 5 | App: comparison upgrade prompt opens the paywall; on the Alerts screen a free user turning a switch off (muting) gets the upgrade prompt and the switch stays on; a lapsed user can turn a muted switch back on | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "AC 5, EC-PI 5: a lapsed user can still turn a muted switch back on" | Pass |
| PREM-02 | 6 | App: a 403 premium_required from compare or mute shows the upgrade prompt | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "AC 6: a 403 premium_required from compare (Premium lapsed) shows the same prompt" | Pass |
| PREM-02 | 6 | App: a 403 premium_required from compare or mute shows the upgrade prompt | Component | `mobile/src/__tests__/priceAlerts.test.tsx` "AC 6: a 403 premium_required from a mute shows the upgrade prompt and puts the switch back" | Pass |
| PREM-02 | 7 | price_comparison_viewed and price_alert_muted only on success | Integration | `backend/tests/api/test_premium_gating.py::test_a_refused_comparison_or_mute_sends_no_event` | Pass |
| PREM-02 | 8 | 08-api-contracts and the verify-grocery-genie Premium journey say compare and mute POST are 403 for a free user | E2E | `.agents/skills/verify-grocery-genie/features/premium.md` `premium-free-features`, `premium-mute-lapse` (verify runs `20261104-231346`, `20261104-231422`) | Pass |
| PREM-03 | 1 | GG_LLM_PREMIUM_EXTRACTION_MODEL setting; unset uses the default; no provider in code | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_the_premium_model_setting_is_unset_by_default` | Pass |
| PREM-03 | 1 | GG_LLM_PREMIUM_EXTRACTION_MODEL setting; unset uses the default; no provider in code | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_the_premium_model_is_read_from_the_environment` | Pass |
| PREM-03 | 1 | GG_LLM_PREMIUM_EXTRACTION_MODEL setting; unset uses the default; no provider in code | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_unset_there_is_no_premium_extractor` | Pass |
| PREM-03 | 1 | GG_LLM_PREMIUM_EXTRACTION_MODEL setting; unset uses the default; no provider in code | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_a_full_litellm_name_is_sent_as_is` | Pass |
| PREM-03 | 1 | GG_LLM_PREMIUM_EXTRACTION_MODEL setting; unset uses the default; no provider in code | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_a_bare_model_name_uses_the_configured_provider_and_gateway` | Pass |
| PREM-03 | 1 | GG_LLM_PREMIUM_EXTRACTION_MODEL setting; unset uses the default; no provider in code | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_no_model_is_named_outside_the_config` | Pass |
| PREM-03 | 1 | GG_LLM_PREMIUM_EXTRACTION_MODEL setting; unset uses the default; no provider in code | Unit | `backend/tests/api/test_priority_ocr.py::test_without_a_premium_model_premium_scans_use_the_default` | Pass |
| PREM-03 | 2 | Premium scan uses the Premium model, free the default; Premium read server-side | Integration | `backend/tests/api/test_priority_ocr.py::test_a_premium_scan_is_read_by_the_premium_model` | Pass |
| PREM-03 | 2 | Premium scan uses the Premium model, free the default; Premium read server-side | Integration | `backend/tests/api/test_priority_ocr.py::test_a_free_scan_is_read_by_the_default_model` | Pass |
| PREM-03 | 2 | Premium scan uses the Premium model, free the default; Premium read server-side | Integration | `backend/tests/api/test_priority_ocr.py::test_the_app_cannot_ask_for_the_premium_model` | Pass |
| PREM-03 | 2 | Premium scan uses the Premium model, free the default; Premium read server-side | Integration | `backend/tests/api/test_priority_ocr.py::test_premium_is_read_when_each_extraction_starts` | Pass |
| PREM-03 | 3 | Through provider.py, no temperature, same validation and confidence scoring | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_the_premium_call_sends_no_temperature` | Pass |
| PREM-03 | 3 | Through provider.py, no temperature, same validation and confidence scoring | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_the_premium_call_sends_the_same_prompt_as_the_default` | Pass |
| PREM-03 | 3 | Through provider.py, no temperature, same validation and confidence scoring | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_premium_output_passes_the_same_validation` | Pass |
| PREM-03 | 3 | Through provider.py, no temperature, same validation and confidence scoring | Unit | `backend/tests/llm/test_priority_ocr_provider.py::test_category_assignment_keeps_the_default_model` | Pass |
| PREM-03 | 4 | Premium model failure falls back to the default model, then the usual failed-scan path (503, the app's offline retry, manual entry); the scan never fails because of it | Integration | `backend/tests/api/test_priority_ocr.py::test_a_failed_premium_model_hands_the_scan_to_the_default` | Pass |
| PREM-03 | 4 | Premium model failure falls back to the default model, then the usual failed-scan path (503, the app's offline retry, manual entry); the scan never fails because of it | Integration | `backend/tests/api/test_priority_ocr.py::test_when_both_models_fail_the_scan_fails_as_any_scan_does` | Pass |
| PREM-03 | 5 | receipt_extraction_completed carries extraction_tier | Integration | `backend/tests/api/test_priority_ocr.py::test_extraction_completed_carries_the_tier` | Pass |
| PREM-03 | 6 | validate-extraction on the Premium model: accuracy not below default, cost recorded, user approval | Manual | `docs/device-checklist.md` §8: Priority OCR (`run extract --premium`; harness tested by `backend/tests/llm_validation/test_harness.py::test_premium_runs_score_the_premium_model`) | Manual |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "offers 1M to All under the chart with 3M selected, and plots only that range" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "follows the chosen range, and All plots every price" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "counts calendar months back from today, and All has no start" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "clamps to the end of a shorter month" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "asks for the history once per open, and a range tap asks for nothing" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "never opens on too few prices: 1 price in 3M opens 1Y with both" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "opens on the smallest range with prices when 3M has none" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "opens on All when even 1Y has no prices" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "keeps the prices dated from the range start on, and All keeps every one" | Pass |
| PI-01 | 5 | Range control 1M/3M/6M/1Y/All, 3M first; chart follows the range, list shows every price | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "opens on 3M with 2 prices, else the smallest of 6M, 1Y, All that has 2" | Pass |
| PI-01 | 6 | Fewer than 2 plotted prices in a range: "Not enough prices in this range", no chart | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "says so instead of drawing a chart, with All one tap away" | Pass |
| PI-01 | 6 | Fewer than 2 plotted prices in a range: "Not enough prices in this range", no chart | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "shows no range control for an item with fewer than 2 prices" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "averages the 30 days up to the latest price and compares the 30 days before" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "uses like-for-like prices only" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "gives no percent with no price in the earlier window, and a fall as negative" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "reads / ea for a count and / lb for a measure" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "shows the 30-day mean with its unit and a rise in red with a plus" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "shows a fall in green with a minus sign" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "shows no percent with no price in the 30 days before" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "adds as of the latest price date when it is more than 30 days old" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "dates as of from the latest like-for-like price, as the average does" | Pass |
| PI-01 | 7 | Headline "Avg · 30d" with unit and change from the 30 days before; rise red, fall green | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "is true once the latest price is more than 30 days old" | Pass |
| PI-01 | 8 | Chart: shaded area, month labels, a dot per purchase | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "draws a shaded area under the line, month labels, and a dot per purchase" | Pass |
| PI-01 | 8 | Chart: shaded area, month labels, a dot per purchase | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "labels each month the chart spans, placed by date" | Pass |
| PI-01 | 8 | Chart: shaded area, month labels, a dot per purchase | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "thins the labels out over a long span" | Pass |
| PI-01 | 9 | Store rows lead with a coloured square, stable per store | Unit | `mobile/src/features/price-intelligence/utils/storeColor.test.ts` "gives a store the same colour every time, from its id alone" | Pass |
| PI-01 | 9 | Store rows lead with a coloured square, stable per store | Unit | `mobile/src/features/price-intelligence/utils/storeColor.test.ts` "spreads stores over the whole palette" | Pass |
| PI-01 | 9 | Store rows lead with a coloured square, stable per store | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "leads each price row and comparison row with the store’s own colour" | Pass |
| PI-01 | 10 | Back label names the opener; largest text size holds | Unit | `mobile/src/features/price-intelligence/__tests__/itemBackTitle.test.ts` "names the screen that opened the item: Items, Receipt, Price alerts (PI-01 AC 10)" | Pass |
| PI-01 | 10 | Back label names the opener; largest text size holds | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "lets the range control wrap and keeps the headline price whole" | Pass |
| PI-03 | 5 | Price alerts list: newest first, This week / Earlier, arrow, signed percent, was/now (drops add "stock-up worth it"), sparkline, tap opens item; opens from Settings → Alerts and the Budget dashboard bell (label "Price alerts") | Component | Not yet implemented (DA-4) | Pending |
| PI-03 | 6 | Empty Price alerts list says "No price alerts yet" | Component | Not yet implemented (DA-4) | Pending |
| PI-03 | 7 | Settings group: Threshold and Cooldown rows, footer from the user's settings | Component | Not yet implemented (DA-4) | Pending |
| PI-03 | 8 | Cooldown user setting 1–30 days (null default, 422 otherwise), used by the alert check | Integration | Not yet implemented (DA-4) | Pending |
| PI-03 | 9 | Alert title and body per design (a drop adds "stock-up worth it", push and in-app alike), still naming item, store, old average, new price, percent | Integration | Not yet implemented (DA-4) | Pending |
| PI-02 | 5 | "Same item?" prompt: receipt line, store, date, match %, existing item counts and avg unit price | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "shows the receipt line, store, date, match percent and the existing item" | Pass |
| PI-02 | 5 | "Same item?" prompt: receipt line, store, date, match %, existing item counts and avg unit price | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "heads a line from a receipt dated today as from today’s receipt" | Pass |
| PI-02 | 5 | "Same item?" prompt: receipt line, store, date, match %, existing item counts and avg unit price | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "reads each card to VoiceOver as one element" | Pass |
| PI-02 | 5 | "Same item?" prompt: receipt line, store, date, match %, existing item counts and avg unit price | Integration | `backend/tests/api/test_match_prompt.py::test_a_suggestion_carries_what_the_prompt_shows` | Pass |
| PI-02 | 5 | "Same item?" prompt: receipt line, store, date, match %, existing item counts and avg unit price | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "dates a line from another year with its year" | Pass |
| PI-02 | 5 | "Same item?" prompt: receipt line, store, date, match %, existing item counts and avg unit price | Integration | `backend/tests/api/test_match_prompt.py::test_the_average_is_like_for_like` | Pass |
| PI-02 | 5 | "Same item?" prompt: receipt line, store, date, match %, existing item counts and avg unit price | Integration | `backend/tests/api/test_match_prompt.py::test_the_line_shown_is_the_one_that_raised_it` | Pass |
| PI-02 | 6 | Yes, merge / Keep as separate item / Skip / Cancel; item_match_resolved only for merge and keep | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "Yes, merge accepts and shows the next suggestion" | Pass |
| PI-02 | 6 | Yes, merge / Keep as separate item / Skip / Cancel; item_match_resolved only for merge and keep | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "Keep as separate item rejects, and the prompt closes after the last" | Pass |
| PI-02 | 6 | Yes, merge / Keep as separate item / Skip / Cancel; item_match_resolved only for merge and keep | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "Skip leaves the suggestion pending and shows the next, then closes" | Pass |
| PI-02 | 6 | Yes, merge / Keep as separate item / Skip / Cancel; item_match_resolved only for merge and keep | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "Cancel closes the prompt and leaves the rest pending" | Pass |
| PI-02 | 6 | Yes, merge / Keep as separate item / Skip / Cancel; item_match_resolved only for merge and keep | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "saves a double-tapped Yes, merge once and still moves on" | Pass |
| PI-02 | 6 | Yes, merge / Keep as separate item / Skip / Cancel; item_match_resolved only for merge and keep | Integration | `backend/tests/api/test_items.py::test_accepting_a_suggestion_merges_the_history` | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "opens from Review Matches on the suggestion tapped" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "opens from item detail with only that item’s suggestions" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/priceHistory.test.tsx` "asks on the item and merges when the user says Yes, merge" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "opens after a confirm succeeds, with only that receipt’s suggestions" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "never opens when the confirm fails" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "never holds up the confirm: the app leaves the review before the fetch answers" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "does not open for a receipt that raised no suggestion" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "shows each suggestion after a confirm only once" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "gives up quietly when the fetch fails" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "opens after a manual entry is saved, for that receipt" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "does not open again when a confirmed receipt is edited" | Pass |
| PI-02 | 7 | After a confirm: at most 3, best match first; the rest stay on Review Matches | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "asks about at most the 3 best matches, best first" | Pass |
| PI-02 | 7 | After a confirm: at most 3, best match first; the rest stay on Review Matches | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "shows the capped suggestions in that order, counting up to 3" | Pass |
| PI-02 | 7 | After a confirm: only while still on the screen the confirm left the user on | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "does not open once the user has moved on before the suggestions load" | Pass |
| PI-02 | 7 | Prompt from Review Matches, item detail, and after a confirm succeeds (that receipt only) | Integration | `backend/tests/api/test_match_prompt.py::test_a_repeat_of_the_name_does_not_raise_the_suggestion_again` | Pass |
| PI-02 | 8 | GET /api/items/suggestions?receipt_id= filters and carries the prompt's fields; another user's receipt 404 | Integration | `backend/tests/api/test_match_prompt.py::test_receipt_id_returns_only_that_receipts_suggestions` | Pass |
| PI-02 | 8 | GET /api/items/suggestions?receipt_id= filters and carries the prompt's fields; another user's receipt 404 | Integration | `backend/tests/api/test_match_prompt.py::test_a_suggestion_carries_what_the_prompt_shows` | Pass |
| PI-02 | 8 | GET /api/items/suggestions?receipt_id= filters and carries the prompt's fields; another user's receipt 404 | Integration | `backend/tests/api/test_match_prompt.py::test_unknown_receipt_is_404` | Pass |
| PI-02 | 8 | GET /api/items/suggestions?receipt_id= filters and carries the prompt's fields; another user's receipt 404 | Integration | `backend/tests/api/test_match_prompt.py::test_another_users_receipt_is_404_and_their_suggestions_stay_theirs` | Pass |
| PI-02 | 8 | GET /api/items/suggestions?receipt_id= filters and carries the prompt's fields; another user's receipt 404 | Integration | `backend/tests/api/test_match_prompt.py::test_counts_and_average_are_the_callers_own` | Pass |
| PI-02 | 9 | Already-resolved suggestion (409) skipped quietly; failed save says so inline | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "passes over a suggestion already resolved (409) without an error" | Pass |
| PI-02 | 9 | Already-resolved suggestion (409) skipped quietly; failed save says so inline | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "keeps the prompt open and says so inline when a save fails" | Pass |
| PI-02 | 9 | Already-resolved suggestion (409) skipped quietly; failed save says so inline | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "passes over a suggestion merged away elsewhere (404) without an error" | Pass |
| PI-02 | 9 | Already-resolved suggestion (409) skipped quietly; failed save says so inline | Integration | `backend/tests/services/test_match_concurrency.py::test_two_answers_at_once_resolve_once` | Pass |
| PI-02 | 9 | Already-resolved suggestion (409) skipped quietly; failed save says so inline | Integration | `backend/tests/services/test_match_concurrency.py::test_an_answer_and_a_merge_of_its_item_at_once_never_deadlock` | Pass |
| PI-02 | 9 | Already-resolved suggestion (409) skipped quietly; failed save says so inline | Integration | `backend/tests/services/test_match_concurrency.py::test_accept_takes_its_item_locks_first_in_id_order` | Pass |
| PI-02 | 9 | Already-resolved suggestion (409) skipped quietly; failed save says so inline | Integration | `backend/tests/api/test_items.py::test_rejecting_a_suggestion_keeps_the_items_apart` | Pass |
| PI-02 | 10 | Split by line, including one of several lines sharing a receipt name | Component | `mobile/src/__tests__/itemSplit.test.tsx` "opens Split into 2 items with the original and its lines (AC 10)" | Pass |
| PI-02 | 10 | Split by line, including one of several lines sharing a receipt name | Component | `mobile/src/__tests__/itemSplit.test.tsx` "moves one of several lines sharing a name, naming the new item from it (AC 10, 11)" | Pass |
| PI-02 | 10 | Split by line, including one of several lines sharing a receipt name | Integration | `backend/tests/api/test_item_split.py::test_prices_name_their_line` | Pass |
| PI-02 | 10 | Split by line, including one of several lines sharing a receipt name | Integration | `backend/tests/api/test_item_split.py::test_one_of_several_lines_sharing_a_name_moves_with_its_price` | Pass |
| PI-02 | 11 | Named new items, counts and averages, "+ Add another split", Save rules | Component | `mobile/src/__tests__/itemSplit.test.tsx` "moves one of several lines sharing a name, naming the new item from it (AC 10, 11)" | Pass |
| PI-02 | 11 | Named new items, counts and averages, "+ Add another split", Save rules | Component | `mobile/src/__tests__/itemSplit.test.tsx` "enables Save once the new item has a name and a line and the original keeps one (AC 11)" | Pass |
| PI-02 | 11 | Named new items, counts and averages, "+ Add another split", Save rules | Component | `mobile/src/__tests__/itemSplit.test.tsx` "Add another split makes it Split into 3 items and lines pick their item (AC 11)" | Pass |
| PI-02 | 11 | Named new items, counts and averages, "+ Add another split", Save rules | Unit | `mobile/src/features/price-intelligence/utils/split.test.ts` "counts purchases and averages the like-for-like prices" | Pass |
| PI-02 | 11 | Named new items, counts and averages, "+ Add another split", Save rules | Unit | `mobile/src/features/price-intelligence/utils/split.test.ts` "needs every new item named, with a line, and the original keeping one" | Pass |
| PI-02 | 11 | Named new items, counts and averages, "+ Add another split", Save rules | Integration | `backend/tests/api/test_item_split.py::test_split_into_several_new_items` | Pass |
| PI-02 | 12 | Unit-price-varies warning at highest ≥ 1.5 × lowest | Unit | `mobile/src/features/price-intelligence/utils/split.test.ts` "warns when the highest is at least 1.5 times the lowest" | Pass |
| PI-02 | 12 | Unit-price-varies warning at highest ≥ 1.5 × lowest | Unit | `mobile/src/features/price-intelligence/utils/split.test.ts` "stays quiet below 1.5 times" | Pass |
| PI-02 | 12 | Unit-price-varies warning at highest ≥ 1.5 × lowest | Unit | `mobile/src/features/price-intelligence/utils/split.test.ts` "compares like for like only, and needs two prices" | Pass |
| PI-02 | 12 | Unit-price-varies warning at highest ≥ 1.5 × lowest | Component | `mobile/src/__tests__/itemSplit.test.tsx` "warns on item detail and the split screen at 1.5 times or more" | Pass |
| PI-02 | 12 | Unit-price-varies warning at highest ≥ 1.5 × lowest | Component | `mobile/src/__tests__/itemSplit.test.tsx` "says nothing when the prices are close" | Pass |
| PI-02 | 13 | Save opens the new item; observations and whole names move with their lines | Component | `mobile/src/__tests__/itemSplit.test.tsx` "saves the splits and opens the first new item (AC 13)" | Pass |
| PI-02 | 13 | Save opens the new item; observations and whole names move with their lines | Integration | `backend/tests/api/test_item_split.py::test_one_of_several_lines_sharing_a_name_moves_with_its_price` | Pass |
| PI-02 | 13 | Save opens the new item; observations and whole names move with their lines | Integration | `backend/tests/api/test_item_split.py::test_a_name_whose_lines_all_move_goes_with_them` | Pass |
| PI-02 | 13 | Save opens the new item; observations and whole names move with their lines | Integration | `backend/tests/api/test_item_split.py::test_a_name_split_across_two_new_items_stays_with_the_original` | Pass |
| PI-02 | 13 | Save opens the new item; observations and whole names move with their lines | Integration | `backend/tests/api/test_item_split.py::test_lines_of_a_deleted_receipt_go_with_their_name` | Pass |
| PI-02 | 13 | Save opens the new item; observations and whole names move with their lines | Integration | `backend/tests/services/test_split_concurrency.py::test_a_split_and_a_merge_of_its_item_at_once` | Pass |
| PI-02 | 13 | Save opens the new item; observations and whole names move with their lines | Integration | `backend/tests/services/test_split_concurrency.py::test_split_takes_its_item_lock_before_any_line` | Pass |
| PI-02 | 13 | Save opens the new item; observations and whole names move with their lines | Integration | `backend/tests/services/test_split_concurrency.py::test_a_split_and_an_accept_of_its_item_at_once` | Pass |
| PI-02 | 14 | POST /api/items/{id}/split: 201, 409 empty original, 422, 404 | Integration | `backend/tests/api/test_item_split.py::test_the_original_must_keep_a_line` | Pass |
| PI-02 | 14 | POST /api/items/{id}/split: 201, 409 empty original, 422, 404 | Integration | `backend/tests/api/test_item_split.py::test_bad_splits_are_422` | Pass |
| PI-02 | 14 | POST /api/items/{id}/split: 201, 409 empty original, 422, 404 | Integration | `backend/tests/api/test_item_split.py::test_split_is_scoped_to_the_caller` | Pass |
| PI-02 | 14 | POST /api/items/{id}/split: 201, 409 empty original, 422, 404 | Integration | `backend/tests/api/test_item_split.py::test_the_alias_split_stays_as_it_is` | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Component | `mobile/src/__tests__/itemSplit.test.tsx` "shows the intro, search, Suggested and All items with purchases and averages" | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Component | `mobile/src/__tests__/itemSplit.test.tsx` "never lists the item itself" | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Component | `mobile/src/__tests__/itemSplit.test.tsx` "searches as the user types" | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Component | `mobile/src/__tests__/itemSplit.test.tsx` "enables Link once a radio is picked, then merges and opens the result" | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Integration | `backend/tests/api/test_item_split.py::test_link_candidates_suggested_first_then_all_items` | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Integration | `backend/tests/api/test_item_split.py::test_link_candidates_rank_similar_names` | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Integration | `backend/tests/api/test_item_split.py::test_link_candidates_search` | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Integration | `backend/tests/api/test_item_split.py::test_link_candidates_are_the_callers_own` | Pass |
| PI-02 | 15 | Link items sheet: Suggested / All items, radio, N purchases · avg, Link merges | Integration | `backend/tests/api/test_item_split.py::test_item_list_rows_carry_their_average` | Pass |
| PI-03 | 10 | Mute until: Forever, 1 week, 1 month, 3 months on item and store mutes | Component | Not yet implemented (DA-7) | Pending |
| PI-03 | 11 | Mute POST takes until (null forever, past 422, replaces); muted_until returned | Integration | Not yet implemented (DA-7) | Pending |
| PI-03 | 12 | A timed mute ends by itself; nothing sent for prices during it; ended mute not listed | Integration | Not yet implemented (DA-7) | Pending |
| PI-03 | 12 | verify-budget-alerts rechecked for the expiry in _alert_on_price_changes | Formal | Not yet implemented (DA-7) | Pending |
| PI-03 | 13 | Mutes on their own Alerts screen pushed from item detail (back label: the item); every switch on = alerts on; store mute covers every item | Component | Not yet implemented (DA-7) | Pending |
| PI-03 | 14 | Settings lists mutes with Until/Forever; failed unmute keeps the row and says so | Component | Not yet implemented (DA-7) | Pending |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Integration | `backend/tests/api/test_data_export_options.py::test_export_holds_only_receipts_dated_in_the_range` | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Integration | `backend/tests/api/test_data_export_options.py::test_range_bounds_are_inclusive_and_open_ended` | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Integration | `backend/tests/api/test_data_export_options.py::test_csv_export_honours_the_range` | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Integration | `backend/tests/api/test_data_export_options.py::test_range_reads_in_batches` | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Unit | `mobile/src/features/settings/__tests__/exportRange.test.ts` "Last 12 months runs from 11 months back to this month" | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Unit | `mobile/src/features/settings/__tests__/exportRange.test.ts` "This year is January to December; All time has no bounds" | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Unit | `mobile/src/features/settings/__tests__/exportRange.test.ts` "From is the first day of its month and To the last" | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "starts on Last 12 months, with From and To months (AC 1)" | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "offers All time, This year and Custom; All time sends no dates (AC 1)" | Pass |
| PREM-04 | 1 | Range: Last 12 months first, All time and other presets, From/To months; export holds receipts in range | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "This year runs January to December" | Pass |
| PREM-04 | 2 | Format: CSV first, JSON, PDF report | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "lists CSV first and selected, then JSON and PDF report (AC 2)" | Pass |
| PREM-04 | 2 | Format: CSV first, JSON, PDF report | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "exports CSV of the last 12 months by default and opens the share sheet" | Pass |
| PREM-04 | 2 | Format: CSV first, JSON, PDF report | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "exports the PDF report when it is chosen" | Pass |
| PREM-04 | 2 | Format: CSV first, JSON, PDF report | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "names the file by date: .json, .zip for CSV, .pdf for the report" | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Integration | `backend/tests/api/test_data_export_options.py::test_includes_leave_out_the_sections_switched_off` | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Integration | `backend/tests/api/test_data_export_options.py::test_categories_and_budgets_hold_custom_categories` | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Integration | `backend/tests/api/test_data_export_options.py::test_csv_includes_only_the_chosen_files` | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Integration | `backend/tests/api/test_data_export_options.py::test_receipt_images_come_as_a_zip_with_an_images_folder` | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Integration | `backend/tests/api/test_data_export_options.py::test_images_with_csv_share_the_zip` | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Integration | `backend/tests/api/test_data_export_options.py::test_images_off_by_default` | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "has the Includes switches, receipt images off; at least one stays on (AC 3)" | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "with receipt images every format is a zip" | Pass |
| PREM-04 | 3 | Includes switches; receipt images as a zip with images/ | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "sends the format, the range and the includes in the screen order" | Pass |
| PREM-04 | 4 | "Export N receipts" from the server count; none disables it | Integration | `backend/tests/api/test_data_export_options.py::test_summary_counts_the_receipts_in_the_range` | Pass |
| PREM-04 | 4 | "Export N receipts" from the server count; none disables it | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "asks the server how many receipts the range holds" | Pass |
| PREM-04 | 4 | "Export N receipts" from the server count; none disables it | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "All time asks without dates" | Pass |
| PREM-04 | 4 | "Export N receipts" from the server count; none disables it | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "reads "Export N receipts" from the server count (AC 4)" | Pass |
| PREM-04 | 4 | "Export N receipts" from the server count; none disables it | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "with no receipts in the range the button is off (AC 4, EC-PREM 4)" | Pass |
| PREM-04 | 4 | "Export N receipts" from the server count; none disables it | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "a failed count still lets the export run" | Pass |
| PREM-04 | 5 | PDF report: monthly spend by category, top items, receipt list, chosen sections | Integration | `backend/tests/api/test_data_export_options.py::test_pdf_report_is_a_spend_summary_of_the_range` | Pass |
| PREM-04 | 5 | PDF report: monthly spend by category, top items, receipt list, chosen sections | Integration | `backend/tests/api/test_data_export_options.py::test_pdf_report_leaves_out_sections_switched_off` | Pass |
| PREM-04 | 5 | PDF report: monthly spend by category, top items, receipt list, chosen sections | Integration | `backend/tests/api/test_data_export_options.py::test_pdf_report_of_an_empty_range_and_names_outside_latin` | Pass |
| PREM-04 | 5 | PDF report: monthly spend by category, top items, receipt list, chosen sections | Integration | `backend/tests/api/test_data_export_options.py::test_pdf_report_pages_past_one_batch` | Pass |
| PREM-04 | 6 | Export and summary routes: params, Premium 403, 422, data_exported properties | Integration | `backend/tests/api/test_data_export_options.py::test_export_options_need_premium` | Pass |
| PREM-04 | 6 | Export and summary routes: params, Premium 403, 422, data_exported properties | Integration | `backend/tests/api/test_data_export_options.py::test_export_rejects_a_bad_range_format_or_include` | Pass |
| PREM-04 | 6 | Export and summary routes: params, Premium 403, 422, data_exported properties | Integration | `backend/tests/api/test_data_export_options.py::test_from_after_to_names_the_error` | Pass |
| PREM-04 | 6 | Export and summary routes: params, Premium 403, 422, data_exported properties | Integration | `backend/tests/api/test_data_export_options.py::test_summary_rejects_a_bad_date` | Pass |
| PREM-04 | 6 | Export and summary routes: params, Premium 403, 422, data_exported properties | Integration | `backend/tests/api/test_data_export_options.py::test_data_exported_carries_format_range_and_includes` | Pass |
| PREM-04 | 6 | Export and summary routes: params, Premium 403, 422, data_exported properties | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "a premium_required count (Premium lapsed) shows the upgrade prompt too" | Pass |
| PREM-04 | 7 | All time with every include still exports all data (NFR Privacy 2) | Integration | `backend/tests/api/test_data_export_options.py::test_categories_carry_their_colour_and_icon` | Pass |
| PREM-04 | 7 | All time with every include still exports all data (NFR Privacy 2) | Integration | `backend/tests/api/test_data_export_options.py::test_all_time_with_every_switch_exports_all_the_users_data` | Pass |
| PREM-04 | 8 | Intro card: "Export your receipts, prices and budgets for the dates you choose. Yours forever." | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "opens with the intro card (PREM-04 AC 8)" | Pass |
| PREM-04 | 5 | PDF report: monthly spend by category, top items, receipt list, chosen sections | Integration | `backend/tests/api/test_data_export_options.py::test_pdf_monthly_spend_counts_only_confirmed_receipts` | Pass |
| PREM-04 | 4 | "Export N receipts" from the server count; none disables it | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "with Receipts & line items off the button names no receipt count" | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Integration | `backend/tests/api/test_data_export_limits.py::test_exports_past_the_hourly_limit_get_429` | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Integration | `backend/tests/api/test_data_export_limits.py::test_a_rejected_export_does_not_use_the_allowance` | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Integration | `backend/tests/api/test_data_export_limits.py::test_the_summary_is_not_counted` | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Integration | `backend/tests/api/test_data_export_limits.py::test_a_second_export_while_one_builds_gets_429` | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Integration | `backend/tests/api/test_data_export_limits.py::test_the_slot_is_released_when_the_build_fails` | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Integration | `backend/tests/api/test_data_export_limits.py::test_parallel_exports_on_postgres_build_one_at_a_time` | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Integration | `backend/tests/api/test_data_export_limits.py::test_postgres_slot_is_released_on_error` | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Unit | `mobile/src/features/settings/__tests__/exportApi.test.ts` "a 429 from the download is export_busy (rate limited, or one already running)" | Pass |
| PREM-04 | 6 | Export limits: GG_MAX_EXPORTS_PER_HOUR, one export at a time per user (advisory lock), 429 with code and Retry-After | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "a 429 (too many exports, or one already running) says to try again later" | Pass |
| BC-05 | 5 | Built-ins have their fixed colour and icon | Integration | `backend/tests/api/test_category_looks.py::test_built_in_categories_have_their_fixed_colour_and_icon` | Pass |
| BC-05 | 5 | No choice: the first colour and icon | Integration | `backend/tests/api/test_category_looks.py::test_a_new_category_without_a_choice_gets_the_first_colour_and_icon` | Pass |
| BC-05 | 5 | Create keeps the colour and icon chosen | Integration | `backend/tests/api/test_category_looks.py::test_a_new_category_keeps_the_colour_and_icon_chosen` | Pass |
| BC-05 | 5 | Values outside the allowed sets: 422 on POST and PATCH | Integration | `backend/tests/api/test_category_looks.py::test_colour_and_icon_outside_the_allowed_sets_are_refused` | Pass |
| BC-05 | 5 | PATCH changes colour and icon, keeps the name | Integration | `backend/tests/api/test_category_looks.py::test_patch_changes_colour_and_icon_and_keeps_the_name` | Pass |
| BC-05 | 5 | PATCH with nothing to change: 422 | Integration | `backend/tests/api/test_category_looks.py::test_patch_with_nothing_to_change_is_refused` | Pass |
| BC-05 | 5 | Built-in looks cannot be changed | Integration | `backend/tests/api/test_category_looks.py::test_built_in_colours_cannot_be_changed` | Pass |
| BC-05 | 5 | Two users: another user's look is neither changed nor seen | Integration | `backend/tests/api/test_category_looks.py::test_another_users_category_colour_cannot_be_changed_or_seen` | Pass |
| BC-05 | 5 | A look-only change sends no `renamed` event | Integration | `backend/tests/api/test_category_looks.py::test_a_look_only_change_is_not_counted_as_a_rename` | Pass |
| BC-05 | 5 | Migration `20261104_0021`: rows before it read the defaults | Integration | `backend/tests/api/test_category_looks.py::test_a_category_made_before_colours_reads_the_defaults` | Pass |
| BC-05 | 5 | Migration `20261104_0021`: seeded at 0020, upgrade, downgrade, re-upgrade | Integration (Postgres) | `backend/tests/migrations/test_0021_category_color_icon.py::test_upgrade_backfills_looks_then_downgrades_and_upgrades_again` | Pass |
| BC-05 | 5 | Migration `20261104_0021`: frozen built-in looks match the app's | Unit | `backend/tests/migrations/test_0021_category_color_icon.py::test_the_migration_gives_built_ins_the_looks_the_app_has` | Pass |
| BC-05 | 5 | App palette and icons match the server's, defaults first | Unit | `mobile/src/constants/__tests__/categories.test.ts` "offers the same palette and icons as the server, defaults first" | Pass |
| BC-05 | 5 | App: new category starts on the first colour and icon | Component | `mobile/src/__tests__/categorySettings.test.tsx` "a Premium user adds a category by name, with the first colour and icon by default" | Pass |
| BC-05 | 5 | App: new category takes the colour and icon picked | Component | `mobile/src/__tests__/categorySettings.test.tsx` "a new category takes the colour and icon picked" | Pass |
| BC-05 | 5 | App: edit sends only what changed | Component | `mobile/src/__tests__/categorySettings.test.tsx` "tapping a custom category edits its colour and icon, sending only what changed" | Pass |
| BC-05 | 6 | Built-in first, Custom, New category row, footer | Component | `mobile/src/__tests__/categorySettings.test.tsx` "lists Built-in first, then Custom with a New category row and the Premium footer" | Pass |
| BC-05 | 6 | Built-ins in icon squares, read-only | Component | `mobile/src/__tests__/categorySettings.test.tsx` "lists the built-in categories as read-only, each with its own icon square" | Pass |
| BC-05 | 6 | Edit button: delete per row; Done | Component | `mobile/src/__tests__/categorySettings.test.tsx` "the Edit button shows a delete button per custom category, and Done hides them" | Pass |
| BC-05 | 6 | Edit: rename | Component | `mobile/src/__tests__/categorySettings.test.tsx` "renames a custom category" | Pass |
| BC-05 | 6 | Edit: delete after confirming | Component | `mobile/src/__tests__/categorySettings.test.tsx` "deletes a custom category after confirming" | Pass |
| BC-05 | 7 | Categories: custom in a round icon with its colour and icon | Component | `mobile/src/__tests__/categorySettings.test.tsx` "shows each custom category in a round icon with its colour and icon (AC 7)" | Pass |
| BC-05 | 7 | Picker shows the category's colour and icon | Component | `mobile/src/__tests__/categoryLooks.test.tsx` "shows a custom category in its own colour and icon" | Pass |
| BC-05 | 7 | Dashboard bars in the category's colour and icon | Component | `mobile/src/__tests__/categoryLooks.test.tsx` "draw a custom category in its own colour and icon" | Pass |
| BC-05 | 7 | Dashboard and summary API carry colour and icon | Integration | `backend/tests/api/test_category_looks.py::test_dashboard_category_bars_carry_colour_and_icon` | Pass |
| BC-05 | 7 | Spend with no budget: the bar still carries its colour and icon | Integration | `backend/tests/api/test_category_looks.py::test_a_category_with_spend_but_no_budget_carries_its_look` | Pass |
| BC-05 | 7 | Unknown or missing look falls back by name | Unit | `mobile/src/constants/__tests__/categories.test.ts` "falls back to the built-in look by name for an unknown or missing value" | Pass |
| BC-05 | 8 | After a lapse the look stays; changing it is 403 premium_required | Integration | `backend/tests/api/test_category_looks.py::test_after_a_lapse_the_look_stays_and_changing_it_needs_premium` | Pass |
| BC-05 | 8 | App: lapsed editor shows the upgrade prompt, look kept | Component | `mobile/src/__tests__/categorySettings.test.tsx` "after Premium lapses a category keeps its colour and icon, and changing them shows the upgrade prompt" | Pass |
| BC-05 | 8 | App: a 403 on save turns the editor into the upgrade prompt | Component | `mobile/src/__tests__/categorySettings.test.tsx` "a change refused with 403 premium_required turns the editor into the upgrade prompt" | Pass |
| PI-04 | 5 | "Save by switching $X / unit" card, 2+ stores and a gap above zero | Component | Not yet implemented (DA-10) | Pending |
| PI-04 | 6 | Rows lead with latest price, ordered by it; CHEAPEST badge; N purchases · avg | Component | Not yet implemented (DA-10) | Pending |
| PI-04 | 7 | Price bar per row, latest over highest latest | Component | Not yet implemented (DA-10) | Pending |
| PI-04 | 8 | VoiceOver reads a row as one element; largest text size holds | Component | Not yet implemented (DA-10) | Pending |
| BC-04 | 6 | Trend range chips 1M–All; over 3 months Premium (403, upgrade prompt); months param | Integration | Not yet implemented (DA-10) | Pending |
| BC-04 | 7 | Headline N-month average with change (YoY for 1Y) | Component | Not yet implemented (DA-10) | Pending |
| BC-04 | 8 | Highlights: Highest, Lowest (in progress), Trend | Component | Not yet implemented (DA-10) | Pending |
| BC-04 | 9 | Grey bars, current month tinted, VoiceOver per bar | Component | Not yet implemented (DA-10) | Pending |
| BC-04 | 10 | Trend strings externalized | Component | Not yet implemented (DA-10) | Pending |
| EC-PI | 4 | Timed mute expiry | Integration | Not yet implemented (DA-7) | Pending |
| EC-PI | 5 | Lapsed Premium with existing mutes | Integration | Not yet implemented (DA-1, DA-7) | Pending |
| EC-PI | 6 | Split with one line, or of every line | Integration | `backend/tests/api/test_item_split.py::test_the_original_must_keep_a_line` | Pass |
| EC-PI | 6 | Split with one line, or of every line | Component | `mobile/src/__tests__/itemSplit.test.tsx` "offers no split for an item with one purchase (EC-PI 6)" | Pass |
| EC-PI | 6 | Split with one line, or of every line | Integration | `backend/tests/api/test_item_split.py::test_a_name_split_across_two_new_items_stays_with_the_original` | Pass |
| EC-PI | 7 | Match prompt after a confirm: resolved meanwhile, offline queue, several | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "passes over a suggestion already resolved (409) without an error" | Pass |
| EC-PI | 7 | Match prompt after a confirm: resolved meanwhile, offline queue, several | Component | `mobile/src/hooks/__tests__/useSyncQueue.test.tsx` "shows no match prompt when a queued receipt syncs (EC-PI 7)" | Pass |
| EC-PI | 7 | Match prompt after a confirm: resolved meanwhile, offline queue, several | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "Yes, merge accepts and shows the next suggestion" | Pass |
| EC-PI | 7 | Match prompt after a confirm: resolved meanwhile, offline queue, several | Component | `mobile/src/__tests__/matchPrompt.test.tsx` "Cancel closes the prompt and leaves the rest pending" | Pass |
| EC-PI | 8 | A range with too few prices | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "says so instead of drawing a chart, with All one tap away" | Pass |
| EC-PI | 8 | A range with too few prices | Component | `mobile/src/__tests__/itemDetailRange.test.tsx` "counts only like-for-like prices as plotted" | Pass |
| EC-PI | 9 | Cooldown setting changes | Integration | Not yet implemented (DA-4) | Pending |
| EC-PI | 10 | Store comparison ties | Component | Not yet implemented (DA-10) | Pending |
| EC-PI | 11 | Price alerts list after a merge or split | Component | Not yet implemented (DA-4) | Pending |
| EC-PREM | 1 | Free trial eligibility, cancel and refund in the trial | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_a_trial_cancelled_in_its_7_days_stays_premium_to_its_end` | Pass |
| EC-PREM | 1 | Free trial eligibility, cancel and refund in the trial | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_a_refund_in_the_trial_ends_premium_now` | Pass |
| EC-PREM | 1 | Free trial eligibility, cancel and refund in the trial | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_a_trial_is_premium_until_it_ends` | Pass |
| EC-PREM | 1 | Free trial eligibility, cancel and refund in the trial | Component | `mobile/src/__tests__/paywallScreen.test.tsx` "PREM-01 AC 2, EC-PREM 1: a user the App Store says cannot take the trial sees Subscribe" | Pass |
| EC-PREM | 2 | Plan change monthly ↔ yearly | Integration | `backend/tests/api/test_revenuecat_webhook.py::test_a_plan_change_keeps_premium_with_no_gap` | Pass |
| EC-PREM | 3 | Priority OCR model chosen at extraction start; fallback to the default model, then the usual failed-scan path (503, the app's offline retry, manual entry) | Integration | `backend/tests/api/test_priority_ocr.py::test_premium_is_read_when_each_extraction_starts` | Pass |
| EC-PREM | 3 | Priority OCR model chosen at extraction start; fallback to the default model, then the usual failed-scan path (503, the app's offline retry, manual entry) | Integration | `backend/tests/api/test_priority_ocr.py::test_a_lapsed_premium_scan_uses_the_default_model` | Pass |
| EC-PREM | 3 | Priority OCR model chosen at extraction start; fallback to the default model, then the usual failed-scan path (503, the app's offline retry, manual entry) | Integration | `backend/tests/api/test_priority_ocr.py::test_a_failed_premium_model_hands_the_scan_to_the_default` | Pass |
| EC-PREM | 4 | Export: empty range, From after To, images left out | Integration | `backend/tests/api/test_data_export_options.py::test_summary_counts_the_receipts_in_the_range` | Pass |
| EC-PREM | 4 | Export: empty range, From after To, images left out | Integration | `backend/tests/api/test_data_export_options.py::test_from_after_to_names_the_error` | Pass |
| EC-PREM | 4 | Export: empty range, From after To, images left out | Integration | `backend/tests/api/test_data_export_options.py::test_receipt_images_come_as_a_zip_with_an_images_folder` | Pass |
| EC-PREM | 4 | Export: empty range, From after To, images left out | Integration | `backend/tests/api/test_data_export_options.py::test_pdf_report_of_an_empty_range_and_names_outside_latin` | Pass |
| EC-PREM | 4 | Export: empty range, From after To, images left out | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "picking a month makes the period Custom; From after To is refused inline (EC-PREM 4)" | Pass |
| EC-PREM | 4 | Export: empty range, From after To, images left out | Component | `mobile/src/__tests__/exportDataScreen.test.tsx` "with no receipts in the range the button is off (AC 4, EC-PREM 4)" | Pass |
| EC-PREM | 4 | Export: empty range, From after To, images left out | Unit | `mobile/src/features/settings/__tests__/exportRange.test.ts` "From after To is invalid (EC-PREM 4)" | Pass |
| EC-PREM | 5 | Category colour and icon after a lapse | Integration | `backend/tests/api/test_category_looks.py::test_after_a_lapse_the_look_stays_and_changing_it_needs_premium` | Pass |
| EC-PREM | 5 | Category made before DA-9: first colour, default icon | Integration | `backend/tests/api/test_category_looks.py::test_a_category_made_before_colours_reads_the_defaults` | Pass |

This matrix is the source of truth for completeness. A phase is not done until every row has a passing test.

## Phase Definition of Done

### MVP Definition of Done

**Functional completeness:**
- [ ] All user stories (RC-01 through RC-05, BC-01 through BC-06) have passing tests for every acceptance criterion.
- [ ] Acceptance criteria traceability matrix is 100% complete with test locations and pass status.
- [ ] All API endpoints from 08-api-contracts.md (MVP-tagged) are implemented and integration-tested.

**LLM extraction quality:**
- [ ] Receipt test set (30+ receipts) achieves ≥90% field-level accuracy.
- [ ] 0% hallucination rate across test set.
- [ ] ≥95% item recall across test set.
- [ ] Consistency validation: ≥95% of test receipts produce identical output across 5 runs.
- [ ] Prompt version documented and pinned.

**Edge cases:**
- [ ] All MVP edge cases from 11-edge-cases.md are tested (damaged receipts, duplicates, non-receipt images, long receipts, mid-month budget changes, currency mismatch, receipts spanning periods).

**Non-functional:**
- [ ] Receipt extraction ≤5 seconds (p95) measured against test set.
- [ ] Dashboard API response ≤2 seconds (p95). `backend/tests/api/test_p95_postgres.py`, run on Postgres by `make backend-test-pg` (1,000 receipts, 20 runs).
- [ ] Receipt history search ≤1 second for 1,000 receipts. Same file: a store plus date-range search at p95.
- [ ] WCAG 2.1 AA audit on all screens (automated via axe-core + manual VoiceOver test).
- [ ] Touch targets ≥44×44pt verified.

**Analytics:**
- [ ] All MVP analytics events from 12-analytics.md are instrumented and firing (receipt_scan_started, receipt_extraction_completed, receipt_correction_made, receipt_confirmed, receipt_abandoned, budget_created, budget_alert_triggered, budget_alert_opened).

**Data integrity:**
- [ ] Budget aggregation matches sum of confirmed line items (verified by SQL query against test data). `backend/tests/api/test_spend_matches_sql.py` compares the API with a hand-written SUM.
- [ ] No orphaned line items (every LineItem belongs to a Receipt).
- [ ] UserItemMapping corrections persist and are applied on subsequent extractions.
- [ ] Original receipt images stored and retrievable for every confirmed scanned receipt. Manual receipts have no image by design (decided 2026-11-02); `backend/tests/api/test_scanned_images.py` covers JPEG, PNG and PDF scans.

**Security (basic):**
- [ ] API endpoints require authentication (except health check).
- [ ] User A cannot access User B's receipts or budgets. `backend/tests/api/test_cross_user_writes.py` (every receipt and budget route answers 404; the rows are unchanged).
- [ ] Rate limiting enforced (50 submissions/hour, 300 reads/minute).

### V1.1 Definition of Done

V1.1 is Price Intelligence (PI-01 through PI-04) and the Premium tier (`PHASE_SCOPE.md`, decisions D1 and D2), aligned with the design by DA-0 to DA-10 (decisions D6–D10). The MVP boxes above still hold; these are the boxes V1.1 adds.

**Functional completeness:**
- [ ] All V1.1 user stories (PI-01 through PI-04, BC-05 AC 3) and the Premium rows (`PREM`, `BC-FR | Trends`, `BC-FR | Rollover`) have passing tests for every acceptance criterion.
- [ ] Design alignment (DA-1 to DA-10): every row the design alignment added (PI-01 AC 5–10, PI-02 AC 5–15, PI-03 AC 5–14, PI-04 AC 5–8, BC-04 AC 6–10, BC-05 AC 5–8, PREM-01 to PREM-04, `EC-PI | 4`–`11`, `EC-PREM | 1`–`5`) names its tests and passes; no row is left "Pending" except a Manual one listed in `device-checklist.md`.
- [ ] Each DA screen (item detail, Same item?, split, Link items, Price alerts, mutes, Compare stores, Trend, Categories, Export data, paywall) was checked by the reviewer against its screen in `design/claude-design/` (V1.1 sections) and in the Simulator, and keeps every PRD-required element and its large-text layout (D6).
- [ ] Premium gates follow D2 and D8: cross-store comparison, mutes (to mute; unmuting stays open), custom categories, export, rollover and trends over 3 months answer a free user `403 premium_required`, and the receipt cap `429 receipt_quota_exceeded`, each with the app's upgrade prompt; a free scan uses the default model, not Priority OCR; price history, matching and alerts stay free.
- [ ] The V1.1 traceability matrix covers every [V1.1] acceptance criterion and every V1.1 edge case, with test locations and pass status. `python3 scripts/check-traceability.py` is clean.
- [ ] All API endpoints from 08-api-contracts.md tagged V1.1 (items, stores and store merge, categories, export, rollover, the 12-month trend, the RevenueCat webhook) are implemented and integration-tested.
- [ ] `/validate` passes on main (backend on SQLite and on Postgres, `alembic check`, mobile tsc, eslint, jest).
- [ ] `/verify-grocery-genie` passes on main: its V1.1 journeys drive the API the way the app does.
- [ ] `verify-budget-alerts` passes: the TLA+ model of budget and price alerts and push delivery checks clean.
- [x] Waitlist free year of Premium (V11-P5, plan D5, [launch-open-items.md](../launch-open-items.md) §6): a verified account whose email matches a waitlist contact gets a 12-month RevenueCat promotional entitlement, within the claim window, once per waitlist email. Evidence: the `PREM | D5` rows above, chiefly `backend/tests/services/test_waitlist_service.py` (matching, cut-off, window at the match, one year per email, retry backoff over 14 days, 4xx final, grants after the window for members matched in time), `backend/tests/services/test_waitlist_concurrency.py` (two accounts racing for one email, one grant, Postgres), `backend/tests/api/test_waitlist_offer.py` (verify-email, Apple, Google, email change, the claim step answering alike for any email, its rate limits, the short RevenueCat timeout), `backend/tests/tasks/test_waitlist_tasks.py` (backfill, retry, the purge of the copy and of the Resend audience's contacts) and `backend/tests/api/test_account_deletion.py` (decision #13); the `waitlist-offer` journey of `/verify-grocery-genie`. The claim screens still need the Simulator check (the Manual row).

**LLM extraction quality:**
- [ ] Priority OCR (PREM-03, DA-2): `validate-extraction` on the Premium extraction model shows accuracy no lower than the default model's, with the model and its cost per scan recorded and approved by the user. The default model's results below still hold for free scans.
- Otherwise N/A for V1.1. The extraction and category prompts and the LLM settings are unchanged since #82. `app/llm/provider.py` and `app/core/config.py` only gained the local sentence-transformers embedder for item matching (PI-02), which sends nothing to an LLM. So the MVP accuracy boxes carry over unchanged. Custom categories reach a scan only through the user's corrections (V11-P1 decision, above). Any later prompt change runs `validate-extraction` first.
- [ ] Item-matching precision ≥80% (`PHASE_SCOPE.md`: the gate for V1.5). Evidence: the opt-in real-model pair test `backend/tests/services/test_item_matching_real_model.py::test_pair_table_with_the_real_model`, run with `GG_REAL_EMBEDDINGS=1` (sentence-transformers/all-MiniLM-L6-v2). Last measured auto-link precision: 31/31 (100%). Rerun it after any change to the matching thresholds, the embedder, or the qualifier rules.

**Edge cases:**
- [ ] All Price Intelligence edge cases from 11-edge-cases.md are tested: store name variations (store normalization with user merge, rows `EC-PI | 1`), unit price ambiguity (only like-for-like compared, per-kg against per-kg and per-unit against per-unit, rows `EC-PI | 2`), and promotional prices recorded as regular observations (row `EC-PI | 3`).
- [ ] Rollover edge cases (amount change, $0 budget, currency change, delete and restore, Premium lapse) are tested. Rows `BC-FR | Rollover` above.
- [ ] Design-alignment edge cases are tested: timed mute expiry, lapsed Premium with existing mutes, split with one line, the match prompt after a confirm, a range with too few prices, cooldown changes, comparison ties, the alerts list after a merge (rows `EC-PI | 4`–`11`), and the free trial, plan change, Priority OCR status and fallback, export ranges and images, category colours after a lapse (rows `EC-PREM | 1`–`5`).

**Non-functional:**
- [ ] Dashboard API response ≤2 seconds (p95) includes the 12-month trend query. `backend/tests/api/test_p95_postgres.py::test_dashboard_12_month_trend_p95_under_2s`, run on Postgres by `make backend-test-pg`.
- [ ] WCAG 2.1 AA on every new screen (price history, comparison, Review Matches, Settings → Alerts, Categories, Stores, Premium, the paywall): VoiceOver and dark mode, manual (below).
- [ ] Touch targets ≥44×44pt on every new screen. `mobile/src/__tests__/accessibilitySweep.test.ts` "makes every Pressable at least 44pt tall, or extends it with hitSlop" checks every Pressable in `app/` and `src/`, so the V1.1 screens too.

**Analytics:**
- [ ] All V1.1 analytics events from 12-analytics.md are instrumented and tested (price_history_viewed, price_alert_triggered, price_alert_muted, price_comparison_viewed, item_match_resolved, budget_rollover_toggled, premium_status_changed, custom_category_changed, data_exported, store_merged, store_unmerged). Each has a test that checks its properties against 12-analytics.md, including the design-alignment properties (`extraction_tier` on receipt_extraction_completed, the range and includes on data_exported).

**Data integrity:**
- [ ] Price observations follow their receipt: confirm records them, edit rebuilds them, delete removes them and restore brings them back (`test_items.py::test_deleted_receipts_leave_the_history_and_return_on_restore`).
- [ ] The design-alignment migrations (cooldown setting, timed mutes, category colour and icon, and any split change) run in order from `20261104_0021`, `alembic check` is clean, and existing rows read as before (a mute with no `muted_until` is forever, a category without a colour gets the default).
- [ ] Account deletion and purge cover the new V1.1 tables (items, aliases, match suggestions, price observations, mutes and alert records, store merges, custom categories, the RevenueCat ledger): `test_account_deletion.py::test_delete_account_erases_every_row_and_image` fills every table tied to a user and checks each is empty after the delete, and the other account untouched.
- [ ] Entitlements come only from RevenueCat's webhook and REST API, never the client.

**Security:**
- [ ] User B cannot read or change user A's items, aliases, suggestions, prices, comparisons, mutes, store merges, custom categories, export, or budget rollover: every new route answers 404 or leaves the other user's data alone (`test_items.py::test_items_are_private_to_their_user`, `test_price_alerts.py::test_another_users_item_cannot_be_muted_or_unmuted`, `test_price_comparison.py::test_comparison_is_private_and_unknown_items_are_404`, `test_custom_categories.py::test_another_users_category_cannot_be_renamed_or_deleted`, `test_item_matching.py::test_another_users_suggestion_is_not_found`, `test_store_merge.py::test_merging_a_store_the_user_never_shopped_at_is_404`, `test_store_merge.py::test_another_users_merge_never_changes_my_grouping`, `test_cross_user_writes.py::test_b_cannot_turn_on_rollover_for_as_budget`).
- [ ] The RevenueCat webhook refuses a request without its shared secret (`test_revenuecat_webhook.py::test_bad_secret_is_rejected`).

**Manual (device and human checks):** these cannot be automated and are listed in [device-checklist.md](../device-checklist.md), V1.1 section.
- [ ] RevenueCat sandbox purchase and restore; the webhook "Send test event" returns 200.
- [ ] The App Store products (`gg_premium_monthly` $4.99, `gg_premium_yearly` $39.99), the 7-day trial and the RevenueCat offering exist (the user creates them, `docs/DEPLOYMENT.md`); a sandbox purchase of each plan, a trial start and a plan switch reach the backend.
- [ ] The marketing site and its brief say $4.99/month or $39.99/year, and that store comparison and mutes are Premium (`docs/marketing/decisions.md` #18–#20).
- [ ] Price alert push tap opens the item from foreground, background and cold start.
- [ ] The device-check bug rechecks (BUG-1, 2, 3, 5, 6, 8, 9) pass on a device.
- [ ] VoiceOver and dark mode on each new screen.

## LLM Validation Harness

The extraction pipeline is the core of the product. It needs its own dedicated test harness that can be run independently.

### Structure

```
backend/
  tests/
    llm_validation/
      receipts/              # Test receipt images
        en_us_01.jpg
        en_ca_01.jpg
        fr_01.jpg
        cyrillic_01.jpg
        damaged_01.jpg
        long_receipt_01.jpg
        ...
      ground_truth/          # Expected extraction for each receipt
        en_us_01.json
        en_ca_01.json
        ...
      test_extraction_accuracy.py   # Accuracy scoring suite
      test_extraction_consistency.py # Consistency (5-run) suite
      test_prompt_regression.py     # Compare current vs. previous prompt
      conftest.py                   # Fixtures for test set loading
```

### Running the Harness

```bash
# Full accuracy evaluation (slow — calls real LLM)
pytest tests/llm_validation/ -v --tb=short

# Consistency check only
pytest tests/llm_validation/test_extraction_consistency.py -v

# Compare prompt versions
pytest tests/llm_validation/test_prompt_regression.py --prompt-version=v2 --baseline=v1
```

### Ground Truth Format

```json
{
  "receipt_id": "en_us_01",
  "store_name": "Whole Foods Market",
  "date": "2026-02-10",
  "currency": "USD",
  "items": [
    {
      "name": "Organic Bananas",
      "quantity": 1.105,
      "unit_price": 0.69,
      "total_price": 0.76
    }
  ],
  "subtotal": 47.82,
  "tax": 2.15,
  "total": 49.97,
  "notes": "Receipt uses period as decimal separator. 12 line items."
}
```

## Manual Test Checklist (Camera / Push / Offline)

Some validations cannot be fully automated. These require manual execution on a physical iOS device.

The open items below, plus device checks from launch work, are collected in [device-checklist.md](../device-checklist.md) with the setup a device session needs. Run device sessions from that list and record results there.

**Camera & Capture:**
- [ ] Camera opens with edge detection overlay visible on receipt.
- [ ] Blur warning appears when receipt is out of focus (before submission with the document scanner; before capture on the fallback camera).
- [ ] Low-light warning appears in dim environment.
- [ ] Retake button works before submission.
- [ ] Photo library picker opens and accepts JPEG, PNG, HEIC.
- [ ] PDF upload accepted from Files app.

**Push Notifications:**
- [ ] Budget 80% threshold notification received within 5 minutes of trigger.
- [ ] Budget 100% notification received with correct overage amount.
- [ ] Weekly summary notification received on configured day/time.
- [ ] Tapping notification opens relevant screen (dashboard or receipt).
- [ ] Notification preferences respected (disabled category doesn't fire).

**Offline Behavior:**
- [ ] Receipt captured while in airplane mode.
- [ ] "Pending sync" indicator visible on queued receipt.
- [ ] Receipt syncs automatically when network restored.
- [ ] Budget updates after sync completes.
- [ ] Multiple offline receipts sync in order.
- [ ] Airplane mode off → queued receipt uploads without reopening the app (reconnect path; the Simulator cannot toggle it).
- [ ] Server down while online: the queued receipt shows "waiting to upload" with **Retry Now**. Start the server and leave the app open: it uploads within about 30 seconds, with no tap.
- [ ] With the server back, tapping **Retry Now** uploads at once.

**Server Errors and Quota:**

To stop the server, stop the backend process the phone points at (`EXPO_PUBLIC_API_URL`). To reach the quota, the account needs `free_tier_receipts_per_month` receipts (default 20) created this calendar month. Manual entries count.

- [ ] Server down, relaunch as a user with receipts: Budget shows "Couldn't load your budget" and History shows "Couldn't load your receipts", each with **Try Again**. Neither shows "Scan your first receipt" or "No receipts yet".
- [ ] **Try Again** with the server back loads the data.
- [ ] At the quota (free plan), a camera scan shows the upgrade prompt "You’ve used this month’s free scans" with See Premium (opens the paywall), Enter manually and Cancel; no error pill (D2). The photo is not queued: nothing appears under Pending.
- [ ] At the quota, an import from Photos or Files shows the same upgrade prompt, not "Couldn’t import receipt" or "Saved to upload later". Nothing appears under Pending.
- [ ] A receipt queued offline that hits the quota when it syncs: its Pending row says "Monthly scan limit reached", and tapping it shows the upgrade prompt with See Premium, Enter manually, Discard and Cancel. It does not retry.
- [ ] A Premium account past 20 receipts this month scans without any prompt.

Simulator run on 2026-10-27 (PR #21) passed the server-down, automatic-retry, and import-quota items. Not yet run anywhere: the Retry Now tap, the camera quota message, the airplane-mode reconnect, and the queued receipt that hits the quota.

**Account Deletion (App Store 5.1.1(v)):**

Settings → Delete account. The API contract is in `08-api-contracts.md` (`DELETE /api/users/me`). To check the server side, query each user-owned table for the user's id. `verify-grocery-genie` has the queries.

Simulator or device:
- [x] The Delete account row sits below Sign out. The screen lists what is erased and says it can't be undone.
- [x] Delete, then Cancel in the alert: no request reaches the server, and the account stays.
- [x] Server down, Delete, then confirm: "Your account was not deleted. Check your connection and try again." The user stays signed in, and a later Delete succeeds.
- [x] Delete, then confirm, as an email account: the app opens Welcome. The server has no rows for the user and no receipt image files. The account's email and password get 401.
- [x] After the delete, relaunch the app: it stays on Welcome (the Keychain session is gone).
- [x] Apple-linked account, Delete, then close the Apple sheet: "Your account was not deleted. Confirm with Apple to delete your account." The server got one DELETE (409) and the account stays.
- [x] Dark mode, and the largest accessibility text size: the text stays readable, and the Delete account button grows instead of clipping its label.
- [ ] A receipt still in Pending for this account when it is deleted: the receipt and its photo leave the queue. Another account's Pending receipt on the same device stays.

Physical device only:
- [ ] **Sign in with Apple, full path.** This needs a device signed in to an Apple Account, and a backend with real Apple keys (`GG_APPLE_TEAM_ID`, `GG_APPLE_KEY_ID`, `GG_APPLE_CLIENT_ID`, `GG_APPLE_PRIVATE_KEY`). Sign up with Apple, then Delete and confirm. The Apple sheet asks for Face ID, and the account is deleted. Then iOS Settings → [your name] → Sign in with Apple no longer lists Grocery Genie. A server log line `apple revoke failed` means the revoke did not happen.
- [ ] **Sign in with Apple, other Apple ID.** On a device with two Apple Accounts: at the Apple sheet, choose the account that is not linked. Expected: "That's a different Apple ID from the one this account uses." The account stays.
- [ ] **Apple unreachable.** With Network Link Conditioner set to 100% loss, or a backend that cannot reach appleid.apple.com: confirm with Apple. Expected: "We couldn't reach Apple. Try again in a moment." The account stays.
- [ ] **Push after deletion.** Turn on alerts, then delete the account. No later push reaches the device for it. Then sign up again on the same device, and a budget alert arrives for the new account. Expo Go in the Simulator has no remote push.
- [ ] **Connection lost during the delete.** Turn on airplane mode right after tapping Delete account in the alert. If the server finished the delete, the next app launch returns to Welcome (every call gets 401). If it did not, the account still works.
- [ ] **VoiceOver.** It reads the erased list in order and announces "Delete account, button". It reads the alert's two choices, and announces the "not deleted" error when it appears. The Simulator has no VoiceOver; Accessibility Inspector does not count.

Simulator run on 2026-10-27: iPhone 17e, iOS 27, Expo Go, backend on Postgres. Every item marked [x] passed. The run found that the Delete account and Sign out buttons clipped their labels at the largest accessibility text size; they now grow with the text. For the Apple cancel item, the test account was marked as Apple-linked directly in the scratch database, because the local backend has no Apple keys. The Simulator had no Apple Account, so iOS showed "Sign in to your Apple Account", which the app handled as a cancel. Not run: the Pending-receipt item. Its logic is covered by `clearLocalAccountData.test.ts`.

**Native Back button (H3):**

On iOS 26 and later, react-native-screens 4.16 left the native Back button dead on the second screen pushed over the tabs: the tap scrolled the screen to the top instead. `patches/react-native-screens+4.16.0.patch` fixes this in the app's own build. Expo Go has its own compiled copy of the library, so the bug stays in Expo Go. Run these checks on a development or release build (`npx expo run:ios`), not in Expo Go.

- [x] Budget → See 3-month trend → Back → See 3-month trend → Back. Both Back taps return to Budget.
- [x] Same with Top items, and with History → a receipt → Back, twice each.
- [x] Trend → edge swipe back (start at the left edge) → Trend → Back. Back returns to Budget.
- [x] Trend → start an edge swipe, then release it halfway so Trend stays → Back. Back returns to Budget.
- [x] Tap Back twice fast on Trend: one screen pops, not two.
- [x] After all of the above, the tab bar and the History rows respond to taps.

Simulator run on 2026-10-27 (iPhone 18 Pro, iOS 27). In Expo Go, and in a debug build without the patch, the second Back was dead every time, with or without an edge swipe. Showing a header on the `(tabs)` screen made it work, which matches react-native-screens#3294. In a debug build with the patch, every item marked [x] passed. The app-wide freeze in the H3 report did not happen in 6 tries; the cancelled edge swipe only blanked Trend's large title.

That debug build needed three local changes to the generated, gitignored `ios/` project. Without them, `npx expo run:ios` fails or the app does not open on iOS 27:
- `pod install` fails: Google Sign-In's `AppCheckCore` needs modular headers for `GoogleUtilities` and `RecaptchaInterop`.
- Xcode 27 rejects pod targets with an iOS deployment target below 15.0.
- iOS 27 stops the app at launch, because the Expo SDK 54 app delegate does not use the UIScene lifecycle.
Also, `expo run:ios` treats an Xcode 27 Simulator as a physical device, so the build ran through `xcodebuild` and `simctl install`.

**Accessibility:**
- [ ] VoiceOver reads all screen elements in logical order.
- [ ] Receipt review screen: each field announced with label and value.
- [ ] Dashboard charts: summary data accessible via VoiceOver.
- [ ] All buttons and interactive elements have descriptive labels.
- [ ] Dynamic type at largest setting doesn't break layouts.

## Continuous Validation in Development

### After Every Claude Code Session

1. Run `ruff check .` and `npx tsc --noEmit` — zero errors.
2. Run `pytest` and `npm test` — all tests pass.
3. Check: does the new code have tests? If it implements an acceptance criterion, is the traceability matrix updated?

### After Every Feature Completion

1. Run the full test suite including integration tests.
2. If the feature touches the extraction pipeline, run the LLM validation harness.
3. Walk through the relevant E2E flow manually on a device or simulator.
4. Update the Definition of Done checklist for the current phase.

### Before Phase Ship

1. Every row in the acceptance criteria traceability matrix has a passing test.
2. LLM validation harness passes all thresholds.
3. Manual test checklist completed on a physical device ([device-checklist.md](../device-checklist.md)).
4. Non-functional benchmarks measured and within targets.
5. Phase Definition of Done checklist 100% complete.
