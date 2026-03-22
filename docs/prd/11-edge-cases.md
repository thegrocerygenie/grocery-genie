# Edge Cases & Error Handling

## Receipt Capture

1. **Damaged/faded receipts:** Extraction proceeds on visible content. Missing fields flagged. User prompted to fill gaps. No data fabricated.
2. **Multi-page receipts:** MVP supports single-page only. Multi-page scanned as separate images, manually linked. V1.1 stretch: multi-image linking.
3. **Non-receipt images:** Zero items extracted or confidence < 0.3 → rejected with clear error ("This doesn't appear to be a receipt").
4. **Duplicate submission:** Check for exact duplicate (same store, date, total, item count) within 24 hours. Warn before saving.
5. **Extremely long receipts (50+ items):** Pagination in review UI. Progress indicator for extended processing.

## Budget

1. **Mid-month budget change:** New amount applies to remaining days. Existing spending not retroactively recalculated.
2. **Zero-budget categories:** $0 budget triggers alert on any spend. Valid for categories user wants to eliminate.
3. **Receipts spanning periods:** Receipt date determines budget period, not scan date. Jan 31 receipt scanned Feb 2 counts toward January.
4. **Currency mismatch:** Receipt currency differs from budget currency → convert at extraction-date exchange rate. Original currency/amount preserved.

## Price Intelligence

1. **Store name variations:** "Loblaws" vs. "Loblaws #1234" vs. "REAL CANADIAN SUPERSTORE" — store normalization with user merge.
2. **Unit price ambiguity:** Per-kg vs. per-unit tracked via unit_of_measure. Only like-for-like compared.
3. **Promotional/sale prices:** No special handling. Recorded as regular observations. Averages naturally account for promotions.

## Meal Planner

1. **Pantry quantity uncertainty:** App doesn't know exact consumption. Quantities are estimates, presented as "approximately." User correction supported.
2. **Shelf life variance:** Actual depends on storage conditions. Conservative defaults used. Framed as "Suggested use-by," not guarantees.
3. **Dietary restriction conflicts:** Recipe matching an allergen the user flagged → excluded even with high match score.
4. **Empty pantry:** <3 ingredients → meal suggestions suppressed, user prompted to scan a receipt.

## Household

1. **Simultaneous edits:** Two members scanning at same time → both processed independently. Budget aggregation via eventual consistency.
2. **Member departure:** Contributed receipts remain in household. Departing member gets copy in individual account.
3. **Admin transfer:** Sole admin deletes account → role transfers to longest-tenured member. No other members → household dissolved.
