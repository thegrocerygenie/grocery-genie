# App Store metadata draft (en-US and en-CA)

Status: draft, 2026-11-14. Not submitted. Markets: US + Canada (see `docs/seo-strategy.md`, section 11).

Limits: name 30, subtitle 30, keywords 100 (comma-separated, no spaces, no repeats of words already in name/subtitle). Character counts below were checked by script.

| Field | en-US | en-CA |
|---|---|---|
| Name (30/30) | Grocery Genie: Receipt Scanner | Grocery Genie: Receipt Scanner |
| Subtitle (25/30) | Budget & spending tracker | Budget & spending tracker |
| Keywords | `expense,groceries,food,money,scan,shopping,save,cash,organizer,ai,family,bill,cost,categories,ocr` (97/100) | same as en-US |

Revised 2026-11-14 from Google Keyword Planner data (`docs/seo-strategy.md`, section 3). Previous draft: name "Grocery Genie: Receipt Budget", subtitle "Scan receipts, track spending". Nobody searches "receipt budget".

Why these words:
- **Name:** "receipt scanner" and "receipt scanner app" are the largest queries we can honestly claim (1K–10K a month in the US, 100–1K in Canada).
- **Subtitle:** Apple combines words across the name, subtitle and keyword field, so "grocery budget" (1K–10K US), "spending tracker" and "budget tracker" are covered without repeating "grocery".
- **Keywords:**
  - `expense`: "expense tracker app" (1K–10K US).
  - `save`, `money`: "grocery apps to save money", the top grocery query in Canada.
  - `organizer`: "receipt organizer app", "receipt scanner and organizer" (100–1K US).
  - `family`, `cost`, `bill`: budget-size searches ("grocery budget for family of 4", "average grocery bill").
  - `ai`, `ocr`: "ai receipt scanner", "ocr receipt scanner". The app does read receipts with AI, so both are accurate.
  - `scan`: "scan receipts", which also completes "scan receipts budget app".
  - `cash`: cash receipts that bank feeds miss.
- **Left out:** "price" (see the next note), "list" and "calculator" (the app has neither a grocery list nor a calculator), "household" (sharing is V1.5), "app" (Apple adds it), and singular/plural duplicates such as "receipts".
- **"price":** "grocery price comparison app" is 1K–10K in the US. If the launch build includes price history, swap `ocr` for `price` (99/100). Store comparison wording must follow marketing decision #19.

Notes:
- Spelling differences between US and Canadian English are negligible for this product ("budget", "groceries"), so the en-CA listing uses the same text. It differs by screenshots and description examples. The old en-CA "CAD" keyword was dropped: there is no evidence anyone searches for it.
- **No store or competitor brand names in metadata** (Loblaws, Walmart, Mint, YNAB, etc.). Apple rejects trademarks you don't own. Use brand names on the website only, in honest comparison content.
- No keywords for features that are not in the submitted build (flyers, meal planning; price tracking until it ships). Misleading metadata is a rejection and review-score risk.
- Do not repeat words already in the name or subtitle ("grocery", "genie", "receipt", "scanner", "budget", "spending", "tracker"): Apple already indexes them. After launch, check ranks with an ASO tool and swap out keywords that bring no impressions.
- Show CAD amounts in the en-CA screenshots (for example "$187.40" at a Canadian store) so the listing looks native. Use placeholder store names, not real brands.
- French (fr-CA) is a possible later localization for Quebec. The app has a language setting, so check what it supports before promising it.

## Description opening (conversion copy, not indexed by Apple)

> Scan a grocery receipt and see exactly where your money went. Grocery Genie reads every line, sorts it into spending categories, and shows your monthly budget at a glance, with alerts before you overspend and a short summary each week.

Do not mention price history, household sharing, pantry or meal planning until those ship.

## Before submission

- [x] Replace the keywords after real keyword data is available (Keyword Planner, 2026-11-14).
- [ ] Decide `ocr` or `price` in the keyword field (depends on whether price history is in the launch build).
- [ ] Privacy policy URL: `https://grocerygenie.app/privacy`. Support URL: `https://grocerygenie.app/support`.
- [ ] App Privacy ("nutrition label") answers must match the in-app policy (`privacy.ts`) and the table in `docs/legal/privacy-review-2026-10-27.md`.
- [x] In-app account deletion exists on `origin/main`. Verify on a device before submission (see `docs/device-checklist.md`).
- [ ] Sign in with Apple: `account_service.revoke_sign_in_grants` revokes the grant after the user re-authenticates with Apple. Confirm on a real Apple ID that the app disappears from Settings > Apple ID > Sign in with Apple after deletion.

## After launch

- [ ] **Check real App Store rankings.** The keywords above were chosen from Google search volumes, which only stand in for App Store searches. In the first 2–4 weeks after launch, use App Store Connect (App Analytics → Sources → App Store Search) and an ASO tool (AppFollow, Sensor Tower, or a free tier) to see which keywords rank and bring impressions. Replace the ones that bring none, one change at a time every 4–6 weeks (`docs/seo-strategy.md`, sections 4 and 9).
