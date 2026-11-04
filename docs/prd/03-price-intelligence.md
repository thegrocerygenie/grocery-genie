# Epic: Price Intelligence [V1.1]

Longitudinal price tracking that accumulates passively from receipts already being scanned. No additional user effort beyond what MVP captures.

**Free and Premium (decisions D2 and D8, 2026-11-04).** Price history, item matching (suggestions, merge, split, link) and price alerts are free. Cross-store comparison (PI-04) and price-alert mutes (PI-03 AC 4) are Premium from D8 (PREM-02 below); a mute made before then, or before Premium lapsed, keeps working and can always be removed.

**Design alignment (decisions D6–D10, 2026-11-04).** The ACs marked "DA-n" were added for the V1.1 design alignment (`design/claude-design/components-v2/roadmap-v11.jsx`, `v1-pi-gap.jsx`; plan `.planning/PLAN-2026-11-04-v1.1-design-alignment.md`). The look and copy follow the design (D6) unless an earlier AC requires otherwise; where they differ, the AC says which one wins. Each AC id (story + number) is stable: tasks and the V1.1 matrix in `13-validation-strategy.md` cite it.

**User answers (2026-11-04), recorded in the ACs below:** mute durations are Forever, 1 week, 1 month and 3 months (PI-03 AC 10); the 7-day trial applies to both plans (PREM-01 AC 2); a price-drop alert shows "was $X avg, now $Y" and also the design's "stock-up worth it" line, and a rise keeps "was/now" (PI-03 AC 5); export starts on Last 12 months with All time as an option, and its intro line no longer says it exports everything (PREM-04 AC 1, 8); the PDF report is a spend summary: monthly spend by category, top items and a receipt list (PREM-04 AC 5); Trend 6M, 1Y and All are Premium, 1M and 3M free (BC-04 AC 6); the paywall keeps Unlimited receipts and Budget rollover (PREM-01 AC 4); the split warning fires when the highest unit price is at least 1.5 times the lowest (PI-02 AC 12); the Price alerts list opens from Settings → Alerts and from the Budget dashboard's bell (PI-03 AC 5).

## User Stories

### PI-01: Price History [V1.1]
**As a** user, **I want to** see the price history of any item I've purchased, **so that** I know if prices are going up.

**Acceptance Criteria:**
1. Per-item price timeline showing every recorded price with date and store.
2. Visualized as line chart with data points per purchase.
3. Price displayed as unit price (per item, per kg, per lb as applicable).
4. Minimum 2 data points required before timeline shown.
5. [V1.1] (DA-3) A range control under the chart: 1M, 3M, 6M, 1Y, All, with 3M selected first. The chart plots only the prices dated in the range (`GET /api/items/{id}/prices?from=&to=`); the price list still shows every price (AC 1). Each option is a button with an accessibility label ("3 months") and a selected state.
6. [V1.1] (DA-3) A range with fewer than 2 plotted prices shows no chart and says "Not enough prices in this range", with All one tap away (AC 4, per range). An item with fewer than 2 prices in all shows no range control.
7. [V1.1] (DA-3) The headline is "Avg · 30d": the mean of the item's like-for-like prices dated in the 30 days up to its latest price, with the unit ("/ ea", "/ lb"), and the percent change from the mean of the 30 days before that window: a rise in red with "+", a fall in green with "−". No price in the earlier window: no percent.
8. [V1.1] (DA-3) The chart draws the line over a shaded area, with month labels along the time axis, and keeps a dot for every purchase (AC 2; the design dots only the latest).
9. [V1.1] (DA-3) Each store row on item detail and on Compare stores leads with a coloured square; a store keeps the same colour on both screens and across visits.
10. [V1.1] (DA-3) The back button names the screen that opened item detail ("Items", "Receipt", "Price alerts"), and the screen holds at the largest accessibility text size: the range control wraps or scrolls, and no price is truncated.

### PI-02: Item Matching [V1.1]
**As a** user, **I want to** have the app recognize the same product across different receipt formats, **so that** my price history is accurate even when stores abbreviate names differently.

**Acceptance Criteria:**
1. Hybrid matching: vector embedding similarity + fuzzy string matching (Levenshtein, Jaro-Winkler).
2. High-confidence (≥0.85) auto-link; medium (0.6–0.85) prompt user confirmation; low (<0.6) treat as distinct. Exception: names whose qualifiers differ (organic, fat, size, flavour, store brand, colour, form, diet, e.g. "Bananas" / "Organic Bananas") never auto-link; even at ≥0.85 they prompt user confirmation.
3. User can manually link or unlink items.
4. Confirmed matches create canonical item name with aliases.
5. [V1.1] (DA-5) A medium-confidence suggestion (AC 2) opens a full-screen "Same item?" prompt: "We think these are the same product. Confirm to merge price history."; a card with the line as the receipt printed it, the store and the date (headed "From today's receipt" when the receipt is dated today, else "From your receipt"); the match percent ("72% match", the suggestion's confidence rounded); and an "Existing item" card with its name, "N purchases · M stores" and "Avg unit price $X / unit".
6. [V1.1] (DA-5) "Yes, merge" accepts the suggestion, "Keep as separate item" rejects it, "Skip" leaves it pending and shows the next one, and "Cancel" closes the prompt, leaving the rest pending. After the last suggestion the prompt closes. `item_match_resolved` fires for merge and keep, never for skip or cancel.
7. [V1.1] (DA-5) The prompt opens from Review Matches (each suggestion), from item detail when the item has a pending suggestion, and right after a receipt is confirmed when that receipt's lines raised suggestions: only after the confirm has succeeded, never blocking it, and only for that receipt's suggestions.
8. [V1.1] (DA-5) `GET /api/items/suggestions?receipt_id=` returns only the suggestions raised by that receipt's lines (another user's receipt: 404), and every suggestion carries what the prompt shows: the receipt line name, store name and date, and the existing item's purchase count, store count, average unit price and unit.
9. [V1.1] (DA-5) A suggestion already resolved elsewhere (409) is skipped without an error; a failed save keeps the prompt open and says so inline.
10. [V1.1] (DA-6) Split by line: "Split" on item detail opens "Split into 2 items", with the original item ("N purchases · $X avg") and its lines (date, store, unit price) to pick from. Any single line can move, including one of several lines that share a receipt name (today only a whole name splits off, and never the item's only name).
11. [V1.1] (DA-6) Each new item has a name field (prefilled from its first line's receipt name, required) and shows its purchase count and average as lines are picked. "+ Add another split" adds one more new item ("Split into 3 items"). Save is enabled once every new item has a name and a line, and the original keeps at least one line.
12. [V1.1] (DA-6) When an item's like-for-like unit prices vary a lot (the highest is at least 1.5 times the lowest), item detail and the split screen show "We grouped these as one item but the unit price varies a lot. Split if these are different products."
13. [V1.1] (DA-6) After Save the app opens the first new item. Each moved line takes its price observation along, so history, comparison and alerts use the new grouping. A receipt name whose lines all moved goes with them (later scans of it match the new item); a name with lines left on both sides stays with the original.
14. [V1.1] (DA-6) `POST /api/items/{id}/split` with `{ "splits": [{ "name": "...", "line_item_ids": ["..."] }] }` answers 201 with the new items; 409 when the original would keep no line; 422 for an empty name, an empty split, or a line that is not the item's; another user's item 404. The alias split stays as it is.
15. [V1.1] (DA-6) "Link items" is a modal sheet (Cancel, Link): "Pick an existing item to merge "<name>" into.", a search field, a "Suggested" group (the item's pending suggestions first, then the most similar names) and "All items". Each row has a radio and "N purchases · $X avg"; Link is enabled once one is picked and merges into it. The item itself is never listed.

### PI-03: Price Change Alerts [V1.1]
**As a** user, **I want to** receive alerts when a regularly-purchased item has a significant price change, **so that** I can react to increases or stock up during drops.

**Acceptance Criteria:**
1. Alert triggers at ≥10% change from rolling average (configurable threshold).
2. Specifies item, store, old average, new price, percent change.
3. Cooldown period (default: 7 days per item) to avoid notification fatigue.
4. Mutable per item or per store. Muting is Premium from D8 (PREM-02); unmuting is open to everyone.
5. [V1.1] (DA-4) An in-app "Price alerts" list: the user's price change notifications, newest first, grouped "This week" and "Earlier". A row has an arrow on red (rise) or green (fall), the item name, the signed percent in the same colour, "<Store> · was $X avg, now $Y" (a fall shows it too, AC 2, with the design's "stock-up worth it" on a line under it), and a sparkline of the item's recent prices. Tapping a row opens the item. The list opens from Settings → Alerts and from a bell button on the Budget dashboard (accessibility label "Price alerts").
6. [V1.1] (DA-4) With no price alerts, the list says "No price alerts yet" and that one comes when a regular buy moves by the threshold or more.
7. [V1.1] (DA-4) The list ends with a "Settings" group: Threshold (the existing setting) and Cooldown rows, with the footer "Cooldown: N days · alerts at ≥T% change" from the user's settings.
8. [V1.1] (DA-4) Cooldown is a user setting (AC 3's default stays 7 days, `GG_PRICE_ALERT_COOLDOWN_DAYS`): 1, 3, 7, 14 or 30 days. `PUT /api/items/price-alert-settings` takes `cooldown_days` (1–30; `null` back to the default; 422 otherwise), `GET` returns it with `default_cooldown_days`, and the alert check uses the user's value. A migration adds the user column.
9. [V1.1] (DA-4) Alert copy follows the design: the title "<Item> up N%" or "<Item> down N%", and the body "<Item> at <Store>: was $X avg, now $Y" with "/lb" after a measured price, followed for a price drop by "stock-up worth it" (as in AC 5); push and in-app read the same, and still name item, store, old average, new price and percent (AC 2).
10. [V1.1] (DA-7) A "Mute until" choice on item and store mutes: Forever (first), 1 week, 1 month, 3 months (the user's choice; the design shows only Forever).
11. [V1.1] (DA-7) `POST /api/items/{id}/mute` and `POST /api/stores/{id}/mute` take an optional `{ "until": "<ISO 8601 time>" }`; none or `null` is forever, a time not in the future is 422, and muting again replaces the time. Item detail and the alert settings carry each mute's `muted_until`. A migration adds it to both mute tables.
12. [V1.1] (DA-7) A timed mute ends by itself: a confirm at or after `until` alerts as if unmuted, nothing is sent afterwards for prices confirmed during the mute, and an ended mute is no longer listed. The `verify-budget-alerts` model is rechecked for the change to `_alert_on_price_changes`.
13. [V1.1] (DA-7) The mutes move to their own "Alerts" screen, as in the design: item detail has an "Alerts" row (reading "On", "Muted" or "Muted until <date>") that pushes it, and its back button names the item. Every switch on it means alerts on, the iOS convention: an "Item-level" group with the switch "Price alerts", "For <item> across all stores" (on: alerts for the item; off: muted, with the "Mute until" row under it), and a "Per store" group with a switch per store (on: alerts at that store; turning one off asks "Mute until"), with a line that a store mute covers every item bought there. The footer reads "You'll still see price changes in the item detail — just no notifications." The design's item switch is labelled "Mute price alerts" and drawn on when muted; this AC turns it the other way so both groups read the same.
14. [V1.1] (DA-7) Settings → Alerts lists each mute with "Until <date>" or "Forever" and Unmute; a failed unmute keeps the row and says so inline, and can be tried again.

### PI-04: Cross-Store Comparison [V1.1]
**As a** user, **I want to** compare prices for the same item across stores, **so that** I know which store is cheapest.

**Acceptance Criteria:**
1. Side-by-side pricing for selected item across all stores with recorded prices.
2. Shows most recent price and average price per store.
3. Only stores user has scanned from are shown.
4. Accessible from item detail view or dedicated comparison screen.
5. [V1.1] (DA-10) A "Save by switching" card: the gap between the highest and lowest latest price among the compared stores, as "$X / <unit>", with "<cheapest store> vs. <priciest store>". Shown only with 2 or more stores and a gap above zero.
6. [V1.1] (DA-10) Each store row leads with its latest price (large, on the right), with "N purchases · avg $X" under the store name and the store's square (PI-01 AC 9). Rows are ordered by latest price, cheapest first (ties: average, then name), and the cheapest gets a "CHEAPEST" badge.
7. [V1.1] (DA-10) Under each row a bar in the store's colour, its length the store's latest price over the highest latest price.
8. [V1.1] (DA-10) VoiceOver reads each row as one element (store, cheapest, latest price, average, purchases), and at the largest text size nothing is truncated.

## Functional Requirements

### Item Normalization & Matching [V1.1]
- Canonical item registry: each unique product has canonical name + aliases.
- Matching pipeline: exact alias match → fuzzy string (Jaro-Winkler ≥0.85) → semantic similarity (vector cosine ≥0.80) → unmatched (new canonical item).
- User confirmation for medium-confidence matches (0.6–0.85).
- Merge/split: user can merge two canonical items or split a mismatch.

### Price Tracking [V1.1]
- Every confirmed line item creates a price observation: {canonical_item_id, store_id, date, unit_price, quantity, unit_of_measure}.
- Price timeline query: all observations for a canonical item, filterable by store and date range.
- Rolling average (7-day and 30-day windows) for change detection.

### Cross-Store Comparison [V1.1]
- Single-item: most recent and average price per store for a canonical item.
- Minimum 2 observations per store per item to be included.
- Premium from D8 (PREM-02): a free user gets `403 premium_required` and the app's upgrade prompt.

## Premium [V1.1]

Premium launched in V1.1 through RevenueCat (decision D1). It has no epic of its own, so its stories live here. The `PREM` rows in the V1.1 matrix cite them by id; the older rows cite decisions D1, D2 and D5.

### PREM-01: Paywall and plans [V1.1]
**As a** user, **I want to** choose a monthly or yearly plan, and try Premium free first, **so that** I can pay the way that suits me.

**Acceptance Criteria (DA-1, decision D7):**
1. [V1.1] The paywall shows the RevenueCat offering's Yearly and Monthly packages, priced from the App Store, never hard-coded (US: $39.99 a year and $4.99 a month). Yearly comes first and is selected, with "/yr · $3.33/mo" and a "SAVE 33%" badge; the per-month price and the percent come from the two prices (the percent rounded down).
2. [V1.1] Both plans carry the 7-day free trial (the user's choice). When the App Store says the user can take it, the button reads "Start 7-day free trial" for whichever plan is selected, and the terms say what is billed after it ("7 days free, then $39.99/year" or "then $4.99/month"); otherwise it reads "Subscribe". The billing terms, Terms of Use and Privacy Policy links stay.
3. [V1.1] The paywall looks like the design: a round × close button at the top right (accessibility label "Close"), the star badge, the title "Premium", "Unlock the full power of your receipts.", a feature list with an icon per row, and "Cancel anytime · Restore purchase" under the button, where Restore works as before.
4. [V1.1] The feature list names only what Premium unlocks in the build: Cross-store comparison, Custom categories, Data export (with "CSV/JSON/PDF" once PREM-04 ships), 12-month trends, Per-item & per-store mute, Priority OCR processing (once PREM-03 ships), and also Unlimited receipts and Budget rollover, which Premium includes though the design leaves them out (D6 keeps them). The "stay free" line becomes "Price history and price alerts stay free."
5. [V1.1] Either product grants Premium. A trial (RevenueCat `period_type` `TRIAL`) is Premium until it ends; a trial cancelled during the 7 days stays Premium until then and then ends; a trial that converts renews with no gap; a switch between monthly and yearly keeps Premium with no gap. `premium_product_id` records the product.
6. [V1.1] The existing states hold: the offering cannot load (retry), Expo Go (needs the App Store build), and a Premium user (the plan and Manage Subscription, not a purchase button).
7. [V1.1] `docs/DEPLOYMENT.md` lists the product ids (`gg_premium_monthly` $4.99, `gg_premium_yearly` $39.99), the 7-day introductory offer on both, the subscription group, and the RevenueCat offering and its packages, as the steps the user follows in App Store Connect and RevenueCat; the tests mock the offering. `08-api-contracts.md` gives the new prices.

### PREM-02: Premium price intelligence [V1.1]
**As a** Premium user, **I want** cross-store comparison and alert mutes, **so that** I can shop where it's cheapest and hear only the alerts I want.

**Acceptance Criteria (DA-1, decision D8):**
1. [V1.1] `GET /api/items/{id}/compare` answers a free user `403 premium_required` (the shape `require_premium` gives) and a Premium user 200 as before.
2. [V1.1] `POST /api/items/{id}/mute` and `POST /api/stores/{id}/mute` answer a free user `403 premium_required`; both `DELETE`s stay open to every user.
3. [V1.1] A mute made while Premium keeps working after Premium lapses (alerts still skip it until it ends, PI-03 AC 12), stays listed in Settings → Alerts, and can be removed.
4. [V1.1] Price history, item matching (suggestions, merge, split, link), price alerts, the alert settings (on/off, threshold, cooldown) and the Price alerts list stay free.
5. [V1.1] In the app, item detail shows a free user an upgrade prompt where the comparison was, which opens the paywall, never an error. On the Alerts screen (PI-03 AC 13), a free user turning a switch off (muting) gets the upgrade prompt and the switch stays on; a lapsed user can still turn a muted switch back on.
6. [V1.1] A 403 `premium_required` from either route (Premium lapsed meanwhile) shows the same upgrade prompt.
7. [V1.1] `price_comparison_viewed` fires only for a comparison shown, and `price_alert_muted` only for a mute saved.
8. [V1.1] DA-1 updates the docs and journeys that say comparison and mutes are free: `08-api-contracts.md` (Premium, compare, mutes), and the `verify-grocery-genie` Premium journey (`.agents/skills/verify-grocery-genie/features/premium.md`): `premium-free-features` expects `403 premium_required` for compare and for both mute POSTs, `204` for unmute, and `200` for the rest, and a Premium user's compare and mute succeed.

### PREM-03: Priority OCR [V1.1]
**As a** Premium user, **I want** my receipts read by a stronger model, **so that** I correct fewer of them.

**Acceptance Criteria (DA-2, decision D9):**
1. [V1.1] A setting `llm_premium_extraction_model` (`GG_LLM_PREMIUM_EXTRACTION_MODEL`) names the extraction model for Premium scans as a LiteLLM model name; unset, Premium scans use the default model. No provider or model is named in code.
2. [V1.1] A Premium user's scan is extracted with that model and a free user's with the default; Premium is read on the server when the extraction starts, never from the app.
3. [V1.1] The call goes through `app/llm/provider.py` with no `temperature`, and its output passes the same Pydantic validation and confidence scoring as the default model's. Category assignment is unchanged.
4. [V1.1] If the Premium model fails or returns invalid output, the scan is retried on the default model, then the rule-based fallback, as for any scan; a scan never fails because of the Premium model.
5. [V1.1] `receipt_extraction_completed` carries `extraction_tier` (`priority` or `standard`), documented in `12-analytics.md`.
6. [V1.1] Before merge, `validate-extraction` runs the receipt test set on the Premium model: accuracy no lower than the default's, with the model and its cost per scan recorded, and the user approves the choice.

### PREM-04: Data export options [V1.1]
**As a** Premium user, **I want to** choose what to export, for which dates and in which format, **so that** I get a file I can use.

**Acceptance Criteria (DA-8, decision D10):**
1. [V1.1] A "Range" group: Period (Last 12 months, All time, This year, Custom) with From and To months; Last 12 months is selected first (design and the user's choice), and All time is always an option. The export holds the receipts dated in the range, their line items and the prices they recorded.
2. [V1.1] A "Format" group: CSV ("Spreadsheet-ready", a zip of one file per entity, as before) first, JSON ("For developers") and PDF report ("Formatted summary").
3. [V1.1] An "Includes" group of switches: Receipts & line items, Price history, Categories & budgets (on) and Receipt images (off). At least one stays on. With Receipt images on, the download is a zip of the export and an `images/` folder with each scanned receipt's image; manual receipts and purged images have none.
4. [V1.1] The button reads "Export N receipts", N being the receipts in the range from the server; with none it is disabled and says "No receipts in this range".
5. [V1.1] The PDF report is a spend summary of the range (the user's choice): monthly spend by category, the top items, and a list of receipts (date, store, total), leaving out a section whose switch is off.
6. [V1.1] `GET /api/users/me/export` takes `format=json|csv|pdf`, `from`, `to` and `include`, and `GET /api/users/me/export/summary?from=&to=` gives the receipt count. Both are Premium (`403 premium_required`); a bad range, format or include is 422. `data_exported` carries the format, the range and the includes.
7. [V1.1] All time with every switch on still exports all the user's data (NFR Privacy 2).
8. [V1.1] The screen opens with the design's intro card (icon and line), reworded because the default range is not everything: "Export your receipts, prices and budgets for the dates you choose. Yours forever."
