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
- Run each test receipt through extraction 5 times with temperature=0.
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

| Story ID | Criterion # | Test Type | Test Location | Status |
|----------|------------|-----------|---------------|--------|
| RC-01 | 1 | Manual | Mobile E2E checklist | — |
| RC-01 | 2 | Manual | Mobile E2E checklist | — |
| RC-01 | 3 | Manual | Mobile E2E checklist | — |
| RC-01 | 4 | Integration | backend/tests/api/test_receipts.py | — |
| RC-01 | 5 | Integration | backend/tests/api/test_receipts.py | — |
| RC-02 | 1 | Component | mobile/src/features/receipt-capture/__tests__/ | — |
| RC-02 | 2 | Integration | backend/tests/api/test_receipts.py | — |
| ... | ... | ... | ... | ... |

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
- [ ] Dashboard API response ≤2 seconds (p95).
- [ ] Receipt history search ≤1 second for 1,000 receipts.
- [ ] WCAG 2.1 AA audit on all screens (automated via axe-core + manual VoiceOver test).
- [ ] Touch targets ≥44×44pt verified.

**Analytics:**
- [ ] All MVP analytics events from 12-analytics.md are instrumented and firing (receipt_scan_started, receipt_extraction_completed, receipt_correction_made, receipt_confirmed, receipt_abandoned, budget_created, budget_alert_triggered, budget_alert_opened).

**Data integrity:**
- [ ] Budget aggregation matches sum of confirmed line items (verified by SQL query against test data).
- [ ] No orphaned line items (every LineItem belongs to a Receipt).
- [ ] UserItemMapping corrections persist and are applied on subsequent extractions.
- [ ] Original receipt images stored and retrievable for every confirmed receipt.

**Security (basic):**
- [ ] API endpoints require authentication (except health check).
- [ ] User A cannot access User B's receipts or budgets.
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

**Camera & Capture:**
- [ ] Camera opens with edge detection overlay visible on receipt.
- [ ] Blur warning appears when receipt is out of focus.
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
3. Manual test checklist completed on a physical device.
4. Non-functional benchmarks measured and within targets.
5. Phase Definition of Done checklist 100% complete.
