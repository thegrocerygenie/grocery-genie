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
| BC-05 | 3 | Up to 10 custom categories (premium) | — | none | Gap: premium only; MVP has no premium tier (V1.1) |
| BC-05 | 4 | Corrections feed per-user mapping | Integration | `backend/tests/api/test_receipts.py::test_category_only_correction_applies_on_next_scan` | Pass |
| BC-06 | 1 | Push with total, top category, budget status | Integration | `backend/tests/tasks/test_summary_tasks.py::test_summary_gives_the_budget_status` | Pass |
| BC-06 | 1 | Push with total, top category, budget status | Integration | `backend/tests/tasks/test_summary_tasks.py::test_summary_includes_top_category` | Pass |
| BC-06 | 2 | Comparison to prior week | Integration | `backend/tests/tasks/test_summary_tasks.py::test_summary_comparison_more` | Pass |
| BC-06 | 3 | Chosen day, 9 AM local time | Integration | `backend/tests/tasks/test_summary_tasks.py::test_recipients_wait_for_9am_in_the_users_time_zone` | Pass |
| BC-06 | 3 | Chosen day, 9 AM local time | Integration | `backend/tests/tasks/test_summary_tasks.py::test_recipients_only_on_users_chosen_day` | Pass |
| BC-06 | 4 | Links to full dashboard | Unit | `mobile/src/features/notifications/__tests__/notificationTap.test.ts` "falls back to the dashboard when the route is missing" | Pass |

V1.1 matrix (Price Intelligence), started 2026-11-03 with PI-01 and PI-02; PI-03 (price change alerts) backend added the same day, its app screens (alert tap, mute buttons, threshold setting) come with V11-02. PI-04 (cross-store comparison) is not built yet.

| Story | AC | Criterion | Type | Test | Status |
|---|---|---|---|---|---|
| PI-01 | 1 | Every recorded price with date and store | Integration | `backend/tests/api/test_items.py::test_every_price_is_recorded_with_date_and_store` | Pass |
| PI-01 | 1 | Every recorded price with date and store | Component | `mobile/src/__tests__/priceHistory.test.tsx` "shows every price with its date and store, newest first (AC 1)" | Pass |
| PI-01 | 2 | Line chart, a point per purchase | Component | `mobile/src/__tests__/priceHistory.test.tsx` "plots a line chart once there are two prices (AC 2)" | Pass |
| PI-01 | 2 | Line chart, a point per purchase | Unit | `mobile/src/features/price-intelligence/utils/priceTrend.test.ts` "places one dot per purchase: x by date, y by price" | Pass |
| PI-01 | 3 | Unit price (per item, kg, lb) | Integration | `backend/tests/api/test_items.py::test_prices_are_unit_prices` | Pass |
| PI-01 | 3 | Unit price (per item, kg, lb) | Component | `mobile/src/__tests__/priceHistory.test.tsx` "shows unit prices and the change since the first price (AC 3)" | Pass |
| PI-01 | 4 | Timeline needs 2 data points | Integration | `backend/tests/api/test_items.py::test_one_price_is_not_yet_a_timeline` | Pass |
| PI-01 | 4 | Timeline needs 2 data points | Component | `mobile/src/__tests__/priceHistory.test.tsx` "waits for a second price before showing a trend (AC 4)" | Pass |
| PI-02 | 1 | Hybrid: embedding similarity + fuzzy strings | Integration | `backend/tests/services/test_item_matching.py::test_high_semantic_similarity_auto_links` | Pass |
| PI-02 | 1 | Hybrid: embedding similarity + fuzzy strings | Integration | `backend/tests/services/test_item_matching.py::test_high_fuzzy_score_auto_links_and_learns_the_alias` | Pass |
| PI-02 | 2 | >= 0.85 auto-link | Integration | `backend/tests/services/test_item_matching.py::test_high_fuzzy_score_auto_links_and_learns_the_alias` | Pass |
| PI-02 | 2 | 0.6-0.85 asks the user | Integration | `backend/tests/services/test_item_matching.py::test_medium_score_asks_the_user_and_keeps_the_line_separate` | Pass |
| PI-02 | 2 | 0.6-0.85 asks the user | Component | `mobile/src/__tests__/priceHistory.test.tsx` "asks on the item and merges when the user says Same Item" | Pass |
| PI-02 | 2 | < 0.6 distinct | Integration | `backend/tests/services/test_item_matching.py::test_low_score_is_a_distinct_item_with_no_question` | Pass |
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
| PI-03 | 2 | Item, store, old average, new price, percent | Integration | `backend/tests/tasks/test_push_tasks.py::test_a_price_change_push_opens_its_item` | Pass |
| PI-03 | 3 | Cooldown, default 7 days per item | Integration | `backend/tests/api/test_price_alerts.py::test_an_item_alerts_once_per_cooldown` | Pass |
| PI-03 | 3 | Cooldown, default 7 days per item | Integration | `backend/tests/api/test_price_alerts.py::test_the_cooldown_is_per_item` | Pass |
| PI-03 | 3 | Cooldown, default 7 days per item | Integration | `backend/tests/services/test_price_alert_service.py::test_two_concurrent_claims_for_one_item_alert_once` | Pass (Postgres only) |
| PI-03 | 4 | Mutable per item | Integration | `backend/tests/api/test_price_alerts.py::test_a_muted_item_does_not_alert` | Pass |
| PI-03 | 4 | Mutable per store | Integration | `backend/tests/api/test_price_alerts.py::test_a_muted_store_does_not_alert` | Pass |

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
- [ ] At the quota, a camera scan shows "Monthly scan limit reached". The photo is not queued: nothing appears under Pending.
- [ ] At the quota, an import from Photos or Files shows the monthly-limit alert, not "Saved to upload later". Nothing appears under Pending.
- [ ] A receipt queued offline that hits the quota when it syncs: its Pending row says "Monthly scan limit reached", and tapping it offers Enter manually or Discard. It does not retry.

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
