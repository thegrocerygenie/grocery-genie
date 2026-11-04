# Grocery Genie verification map

This directory is the maintained source for verifying the user-facing behavior of the Grocery Genie backend through the API the iOS app calls. Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- An instance launched by this skill: `$G launch` printed `READY`, and `$G doctor` shows no `FAIL`. `G=.agents/skills/verify-grocery-genie/scripts/gg-verify`.
- Debug mode unless the feature says otherwise. Mock scans return `Test Grocery Store`, `2026-03-15`, total `15.95`.
- Each journey starts with its own `$G signup <feature-id>`, so its user owns no earlier data.

## Driving conventions

- Call routes in the order the app does. Scan is always `$G scan` followed by `$G api PATCH /api/receipts/$rid '{"status":"confirmed"}'`.
- Read every mutation back through a second API view (dashboard, receipt detail, list) and through `$G sql` on the table it writes.
- Treat commands as literal. Keep JSON keys and route paths unchanged.

## Proof and skip reporting

- Name the feature ID, sub-feature ID, mode, and evidence directory (`$G last`) with every result.
- A journey that fails is reported as failed, with expected and actual values and the evidence file. A known product gap stays a failure until the product changes.
- Report an unreachable sub-feature with the command tried and the missing precondition, such as `GG_LLM_API_KEY` for live extraction.
- A sub-feature passing through one entry point does not verify its other entry points.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with gg-verify`, `Gotchas`.

## Features

- [AI receipt reading consent](./ai-consent.md) covers the 403 on a scan without consent, granting and withdrawing it, the policy version check, and manual receipts without consent.
- [Scan and confirm a receipt](./scan-confirm.md) covers scan, review, confirm, and spend on the dashboard.
- [Review and correct a scan](./review-correct.md) covers correcting the store, the date, and an item's name, quantity, and price before confirming. It also covers the original values kept for each correction, the 422 checks, the retry, and unconfirmed scans in History.
- [Budget alerts](./budget-alerts.md) covers the 50/80/100% alerts once per threshold per period, and alerts from manual entries.
- [Manual receipt entry](./manual-receipt.md) covers entering a receipt without a photo and its effect on spend.
- [Item category correction](./item-correction.md) covers correcting an item's category, retroactive update, and the mapping applied to the next scan.
- [Delete and restore a receipt](./delete-restore.md) covers soft delete, the recently-deleted list, restore, and spend.
- [Spending trend, 3 or 12 months](./spending-trend.md) (V1.1) covers the default 3-month trend, `403 premium_required` for a free user asking for 12 months, 12 months once the user is Premium, and the 422 on any other length. The Trend screen's 3/12-month toggle and upgrade prompt read these; they need a Simulator check.
- [Price history and item matching](./price-history.md) (V1.1) covers matching lines to items on confirm, auto-links, a qualifier difference ("Bananas" / "Organic Bananas", or French "Lait entier" / "Lait écrémé") asking instead of linking, "same item?" suggestions accepted and rejected, the price history, split, merge, rename, and isolation between users.
- [Price change alerts](./price-alerts.md) (V1.1) covers the alert at the threshold from the 30-day average, its text and data, the 7-day cooldown, the user threshold and on/off switch, item and store mutes, two concurrent confirms alerting once, isolation between users, and the calls the app makes from an alert tap and from Settings.
- [Cross-store price comparison](./price-comparison.md) (V1.1) covers latest and average price per store, cheapest first, the 2-price minimum, only the user's own stores, like-for-like currency, and isolation.
- [Store normalization and user store merge](./store-merge.md) (V1.1) covers branch numbers and punctuation grouping into one store, the user's store list, merging a banner into another store (comparison, price history, the store filter and item stats as one store), 409 and 404 refusals, the merge staying the user's own with shared rows unrenamed, a muted store merged into another muting the group, a price alert naming the merged store, unmerge, and all of it for a free user. Settings → Stores is UI and needs a Simulator check.
- [Budget rollover](./budget-rollover.md) (V1.1, Premium) covers `403 premium_required` for a free user, turning rollover on, last period's unspent amount in this period's limit, a threshold alert on that limit, a late last-period receipt shrinking the carry and alerting, the next period's carry, a budget created this month, an amount change, a deleted budget saved again starting with rollover off, a Premium lapse, and account deletion. The rollover switches, upgrade prompt and "rolled over" line are UI and need a Simulator check.
- [Custom categories](./custom-categories.md) (V1.1, Premium) covers `403 premium_required` for a free user, creating up to 10 and the 11th refused, names unique among the defaults and the user's own, rename, a custom category in a budget, a correction, the mapping for the next scan and the dashboard, keeping them after Premium lapses (delete only), delete moving items to "Other", isolation between users, and account deletion. Settings → Categories, the pickers and the paywall row need a Simulator check.
- [Premium through RevenueCat](./premium.md) (V1.1) covers the webhook's secret check, grant, renewal, cancellation and expiration, a replayed event id changing nothing, an older event arriving late, a cancellation delivered before its purchase, unknown users, `is_premium` on the profile, the 12-month trend and unlimited receipts it unlocks, a free user at the monthly cap getting `429 receipt_quota_exceeded` while price history, matching, price alerts and comparison stay `200` (D2), the REST refresh without an API key, and its per-user rate limit. The paywall, purchase and restore are UI and need a device with a sandbox Apple ID.
- [Data export, JSON or CSV](./data-export.md) (V1.1) covers `403 premium_required` for a free user, a Premium user's JSON and CSV (zip) exports with their receipts, line items, budget and price observations, CSV formula escaping, the other user's data and deleted receipts left out, and the `data_exported` event. Settings → Export data and the share sheet are UI and need a Simulator check.
