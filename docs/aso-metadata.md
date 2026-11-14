# App Store metadata draft (en-US and en-CA)

Status: draft, 2026-11-14. Not submitted. Markets: US + Canada (see `docs/seo-strategy.md`, section 11).

Limits: name 30, subtitle 30, keywords 100 (comma-separated, no spaces, no repeats of words already in name/subtitle). Character counts below were checked by script.

| Field | en-US | en-CA |
|---|---|---|
| Name (29/30) | Grocery Genie: Receipt Budget | Grocery Genie: Receipt Budget |
| Subtitle (29/30) | Scan receipts, track spending | Scan receipts, track spending |
| Keywords | `grocery,budget,receipt,scanner,expense,tracker,shopping,food,spending,money,groceries,categories` (96/100) | `grocery,budget,receipt,scanner,expense,tracker,shopping,food,spending,money,groceries,CAD` (89/100) |

Notes:
- Spelling differences between US and Canadian English are negligible for this product ("budget", "groceries"), so the en-CA listing differs mainly by keywords, screenshots and description examples.
- **No store or competitor brand names in metadata** (Loblaws, Walmart, Mint, YNAB, etc.). Apple rejects trademarks you don't own. Use brand names on the website only, in honest comparison content.
- No keywords for features that do not exist (flyers, price tracking, meal planning). Misleading metadata is a rejection and review-score risk.
- Do not repeat "grocery", "receipt", "scan", "spending" if already in the name or subtitle: Apple already indexes those words. Revisit the keyword list once App Store Connect shows which terms are repeated, and trim to add new terms.
- Show CAD amounts in the en-CA screenshots (for example "$187.40" at a Canadian store) so the listing looks native. Use placeholder store names, not real brands.
- French (fr-CA) is a possible later localization for Quebec. The app has a language setting, so check what it supports before promising it.

## Description opening (conversion copy, not indexed by Apple)

> Scan a grocery receipt and see exactly where your money went. Grocery Genie reads every line, sorts it into spending categories, and shows your monthly budget at a glance, with alerts before you overspend and a short summary each week.

Do not mention price history, household sharing, pantry or meal planning until those ship.

## Before submission

- [ ] Replace the keywords after real keyword data is available (Keyword Planner or an ASO tool).
- [ ] Privacy policy URL: `https://grocerygenie.app/privacy`. Support URL: `https://grocerygenie.app/support`.
- [ ] App Privacy ("nutrition label") answers must match the in-app policy (`privacy.ts`) and the table in `docs/legal/privacy-review-2026-10-27.md`.
- [x] In-app account deletion exists on `origin/main`. Verify on a device before submission (see `docs/device-checklist.md`).
- [ ] Sign in with Apple: `account_service.revoke_sign_in_grants` revokes the grant after the user re-authenticates with Apple. Confirm on a real Apple ID that the app disappears from Settings > Apple ID > Sign in with Apple after deletion.
