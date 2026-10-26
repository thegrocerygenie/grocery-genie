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

- [Scan and confirm a receipt](./scan-confirm.md) covers scan, review, confirm, and spend on the dashboard.
- [Review and correct a scan](./review-correct.md) covers correcting the store, the date, and an item's name, quantity, and price before confirming. It also covers the original values kept for each correction, the 422 checks, the retry, and unconfirmed scans in History.
- [Budget alerts](./budget-alerts.md) covers the 50/80/100% alerts once per threshold per period, and alerts from manual entries.
- [Manual receipt entry](./manual-receipt.md) covers entering a receipt without a photo and its effect on spend.
- [Item category correction](./item-correction.md) covers correcting an item's category, retroactive update, and the mapping applied to the next scan.
- [Delete and restore a receipt](./delete-restore.md) covers soft delete, the recently-deleted list, restore, and spend.
