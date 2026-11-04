# Edge Cases & Error Handling

## Receipt Capture

1. **Damaged/faded receipts:** Extraction proceeds on visible content. Missing fields flagged. User prompted to fill gaps. No data fabricated.
2. **Multi-page receipts:** MVP supports single-page only. Each page is scanned as a separate receipt; nothing links the pages (Scan keeps the first page of a multi-page scan and says so, and a multi-page PDF is rejected). V1.1 stretch: multi-image linking.
3. **Non-receipt images:** Zero items extracted or confidence < 0.3 → rejected with clear error ("This doesn't appear to be a receipt").
4. **Duplicate submission:** Check for exact duplicate (same store, date, total, item count) within 24 hours. Warn before saving.
5. **Extremely long receipts (50+ items):** Pagination in review UI. Progress indicator for extended processing.

## Budget

1. **Mid-month budget change:** New amount applies to remaining days. Existing spending not retroactively recalculated.
2. **Zero-budget categories:** $0 budget triggers alert on any spend. Valid for categories user wants to eliminate.
3. **Receipts spanning periods:** Receipt date determines budget period, not scan date. Jan 31 receipt scanned Feb 2 counts toward January.
4. **Currency mismatch:** Receipt currency differs from budget currency → convert at extraction-date exchange rate. Original currency/amount preserved.
   - **MVP rule (decided 2026-11-02):** no conversion. The receipt keeps and shows its own currency, and is left out of budget spend, marked "Not counted in your budget" on Review and "Not in budget" in History. The budget currency starts as the iPhone region's currency at sign-up and can be changed in Settings → Currency. Conversion can replace this later without a data migration: receipts already store their currency.

## Price Intelligence

1. **Store name variations:** "Loblaws" vs. "Loblaws #1234" vs. "REAL CANADIAN SUPERSTORE" — store normalization with user merge. **Built in V1.1 (V11-05, decision D3):** a branch marker at the end ("#1234", "- 1234", "Store 12") and punctuation normalize away for everyone, favouring precision (a bare trailing number or a branch word inside a name stays); a user's merge (Settings → Stores) groups only that user's prices and never renames a shared store, and can be undone. Contract: `08-api-contracts.md`, "Stores: normalization and merge".
2. **Unit price ambiguity:** Per-kg vs. per-unit tracked via unit_of_measure. Only like-for-like compared.
3. **Promotional/sale prices:** No special handling. Recorded as regular observations. Averages naturally account for promotions.

Added 2026-11-04 for the V1.1 design alignment (decisions D6–D10; ACs in `03-price-intelligence.md` and `02-budget-copilot.md`). Each is a row `EC-PI | n` in the V1.1 matrix.

4. **Timed mute expiry (PI-03 AC 10–12):** a mute whose `until` has passed counts as unmuted for the next confirm, with no job needed to end it. Nothing is sent afterwards for prices confirmed while it was muted, and a muted price never uses up the cooldown. Muting again before it ends replaces the time; unmuting a mute that has just ended succeeds (idempotent). Times are stored in UTC and shown as the user's local date.
5. **Lapsed Premium with existing mutes (PREM-02 AC 3):** a forever mute stays; a timed mute runs to its end. Settings still lists both with Unmute, and unmuting works. Muting again, or changing a mute's time, answers `403 premium_required` and shows the upgrade prompt. A merge of a muted item into another still mutes the other (the mute moves, it is not a new one), for a free user too.
6. **Split with one line (PI-02 AC 10–14):** an item with a single line has nothing to split: Split is not offered, and the API answers 409. A split that would move every line answers 409 (the original keeps at least one). A name whose lines end up on both sides stays with the original; a split item's new name may match an existing item's name (it is a new item; the user can link them).
7. **Match prompt after a confirm (PI-02 AC 7, 9):** a suggestion resolved in the meantime (another device, Review Matches) is skipped. A receipt confirmed from the offline queue shows no prompt when it syncs; its suggestions wait in Review Matches. Several suggestions show one at a time; Cancel leaves the rest pending.
8. **A range with too few prices (PI-01 AC 5–6):** a range holding 0 or 1 plotted price shows the "Not enough prices in this range" message, never an empty chart; prices in another unit or currency are listed but not plotted, as before (edge case 2). The 30-day headline uses like-for-like prices only.
9. **Cooldown setting changes (PI-03 AC 8):** a new cooldown applies from the next confirm, measured from the item's last alert; shortening it never resends an alert that was held back.
10. **Store comparison ties (PI-04 AC 5–6):** two stores with the same latest price order by average, then by name, and the first gets the CHEAPEST badge; when every compared store has the same latest price there is no "Save by switching" card.
11. **Price alerts list after a merge or split (PI-03 AC 5):** a row for an item since merged opens the item it was merged into; an alert stays in the list after its item is split.

## Premium

Added 2026-11-04 (decisions D7–D9). Each is a row `EC-PREM | n` in the V1.1 matrix.

1. **Free trial (PREM-01 AC 2, 5):** the App Store decides who may take the 7-day trial (one per Apple ID per subscription group); the paywall shows "Start 7-day free trial" only when RevenueCat reports the user eligible, else "Subscribe". A user already Premium through the waitlist's free year (decision D5) sees no purchase button. Cancelling in the trial keeps Premium to the trial's end; a refund during the trial ends Premium at once, as any refund does.
2. **Plan change (PREM-01 AC 5):** monthly to yearly or back (a `PRODUCT_CHANGE` event, then a renewal on the new product) keeps Premium without a gap and updates `premium_product_id` when the new product starts.
3. **Priority OCR and Premium status (PREM-03 AC 2, 4):** the model is chosen when extraction starts: a user whose Premium lapses while a scan waits in the queue gets the default model; a scan retried after an upgrade gets the Premium one. A Premium model that is down or returns invalid output falls back to the default model, then the rule-based path.
4. **Export ranges and images (PREM-04):** a range with no receipts disables the button ("No receipts in this range"); From after To is a 422; receipt images are left out for manual receipts and for images already purged, and the export says how many were left out.
5. **Category colour and icon after a lapse (BC-05 AC 8):** a lapsed user's custom categories keep their colour and icon and still show them; only changing them needs Premium. A category created before DA-9 has the first palette colour and the default icon.

## Meal Planner

1. **Pantry quantity uncertainty:** App doesn't know exact consumption. Quantities are estimates, presented as "approximately." User correction supported.
2. **Shelf life variance:** Actual depends on storage conditions. Conservative defaults used. Framed as "Suggested use-by," not guarantees.
3. **Dietary restriction conflicts:** Recipe matching an allergen the user flagged → excluded even with high match score.
4. **Empty pantry:** <3 ingredients → meal suggestions suppressed, user prompted to scan a receipt.

## Household

1. **Simultaneous edits:** Two members scanning at same time → both processed independently. Budget aggregation via eventual consistency.
2. **Member departure:** Contributed receipts remain in household. Departing member gets copy in individual account.
3. **Admin transfer:** Sole admin deletes account → role transfers to longest-tenured member. No other members → household dissolved.
