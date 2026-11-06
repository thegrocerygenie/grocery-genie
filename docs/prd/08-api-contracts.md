# API Contract Sketches

Conceptual contracts for key endpoints. Auth headers and error envelope omitted for brevity.

## Receipt Ingestion

### POST /api/receipts/scan [MVP]
Submit receipt image for processing. Returns job ID for async polling or sync result.

**Request:** multipart/form-data with image file (JPEG, PNG, HEIC, PDF)

**Response (202 Accepted):**
```json
{ "job_id": "uuid", "status": "processing", "estimated_seconds": 5 }
```

**Response (200 OK, fast path):**
```json
{
  "receipt_id": "uuid",
  "status": "pending_review",
  "extraction": {
    "store_name": "...",
    "date": "2026-02-15",
    "items": [
      { "id": "item-uuid", "name": "Organic Bananas", "quantity": 1.105, "unit_price": 280.00, "total_price": 309.40, "category_id": "cat-uuid", "category_confidence": 0.92, "extraction_confidence": 0.88, "warnings": [] }
    ],
    "subtotal": 609.40,
    "confidence": 0.85,
    "store_name_confidence": 0.95,
    "date_confidence": 0.90,
    "total_confidence": 0.88,
    "warnings": []
  }
}
```

- `store_name_confidence`, `date_confidence`, and `total_confidence` are 0.0–1.0, or `null` when the model gave no score. The review screen flags each one below 0.7. A future, missing or unreadable date gives a `date_confidence` of 0.5 or less, and a missing or unreadable date is stored as today.
- `store_name` is `null` when the model can't read it. Then `store_name_confidence` is 0.0 and the receipt has no store until the user enters one.
- `warnings` lists what the extraction checks found, for review: on the receipt, a subtotal that doesn't match the items, a missing store name, or a missing, unreadable or future date; on an item, a total that doesn't match quantity × unit price. Empty when nothing was found.
- `currency` is the receipt's own ISO 4217 code. The model returns a code, a symbol that names one currency (€ becomes EUR), or null; null, or a symbol that names several (such as $), takes the user's `currency_preference`, and an unrecognized value adds a warning. A receipt in another currency than the user's is saved and shown in its own currency but left out of budget spend (see Budget).
- An extraction with no line items returns `422` with `"This doesn't appear to be a receipt."`, the same as one with an overall `confidence` below 0.3. Nothing is stored. A `503` means the model couldn't be reached or gave an unusable answer; the app retries it.
- **AI consent** (App Store 5.1.2(i)): the scan sends the image, and the item names on it, to Anthropic's Claude. Without the user's consent to the current policy version (see `PUT /api/users/me/ai-consent`), the scan returns `403` before it reads the file. Nothing is stored or sent:
  ```json
  { "detail": { "code": "ai_consent_required", "message": "...", "policy_version": "2026-10-27" } }
  ```
  Manual receipts (`POST /api/receipts`) never call the AI and need no consent.

### GET /api/receipts/{id} [MVP]
Full receipt data including extraction, corrections, and original image URL. It also returns the stored `store_name_confidence`, `date_confidence`, and `total_confidence`, so a scan reopened from History is flagged the same way. The list endpoint returns them too.

### PATCH /api/receipts/{id} [MVP]
Submit user corrections. Accepts partial updates; send only the fields the user changed. Each changed field is stored in `receipt_corrections` with its original and corrected value, and triggers correction event recording.

**Request:**
```json
{
  "store_name": "corrected store",
  "date": "2026-03-15",
  "items": [{ "id": "item-uuid", "name": "corrected name", "category_id": "cat-uuid", "quantity": 2, "total_price": 4.98 }],
  "status": "confirmed"
}
```

- `date` later than today + 1 day returns 422. `quantity` must be > 0 and `total_price` >= 0, or 422.
- A quantity edit keeps `total_price` (what was paid) and recomputes `unit_price`.
- Subtotal and total are not editable. A `total_price` correction moves both by the same amount; tax is kept as extracted.
- An item's `category_id` must be a default category or one of the user's own custom categories ([Categories](#categories-v11)); any other id returns 400 and nothing is saved.

### GET /api/receipts?page=1&per_page=20&store=...&from=...&to=... [MVP]
Paginated receipt history with optional filters.

## Budget

**Currency [MVP].** Budgets are in the user's `currency_preference`. Every spend total (`/budgets/summary`, `/dashboard/spending`, threshold alerts, the weekly summary) counts only confirmed receipts in that currency; a receipt in another currency stays in History, marked "Not in budget" by the app. Amounts are not converted (decision 2026-11-02; `11-edge-cases.md`). Changing the currency changes which receipts count, and leaves budget amounts as they are.

### POST /api/budgets [MVP]
Set a budget. A user has at most one active budget per category (`null` = overall). If one exists, POST updates its amount and period start and returns 200; otherwise it creates one and returns 201.

**Request:**
```json
{ "category_id": "cat-uuid | null", "amount": 500.00, "period_type": "monthly", "period_start": "2026-03-01" }
```
A deleted budget with the same category and `period_start` comes back as a new budget (`201`), with `rollover_enabled` false (V1.1).

### GET /api/budgets [MVP]
The user's active budgets, overall first. Response: a list of `{ "id", "category_id", "amount", "period_type", "period_start", "rollover_enabled" }`.

### PATCH /api/budgets/{id} [MVP]
Edit a budget; takes effect immediately. `period_start` is optional and moves the start day.

**Request:**
```json
{ "amount": 650.00, "period_start": "2026-03-15" }
```

### PUT /api/budgets/{id}/rollover [V1.1, Premium]
Turn rollover on or off for one budget (BC-FR Budget Management; rules in `07-data-model.md`, Budget rollover). Idempotent: turning it on again keeps the run. Returns the budget as in `GET /api/budgets`. A free user gets `403 premium_required` with `feature: "budget_rollover"`; an unknown or deleted budget, 404.

**Request:**
```json
{ "enabled": true }
```

### DELETE /api/budgets/{id} [MVP] · POST /api/budgets/{id}/restore [MVP]
Soft-delete, and restore within 30 days. Restore returns 409 when the category already has another active budget.

`category_id` on POST must be a default category or one of the user's own custom categories, or the call returns 400.

### GET /api/budgets/summary?period=2026-02 [MVP]
Budget vs. actual for specified period. `budget` is the period's limit: the amount plus `rolled_over`, what rolled over into it (V1.1, Premium rollover; 0 without it, and while Premium lapses). `remaining`, `percent` and threshold alerts use that limit. A future period shows the carry the current period would leave at today's spend.

**Response:**
```json
{
  "period": "2026-02",
  "overall": { "budget": 500, "spent": 387.42, "remaining": 112.58, "percent": 77.5, "rolled_over": 0.0 },
  "categories": [
    { "category_id": "uuid", "name": "Groceries", "budget": 300, "spent": 245.10, "remaining": 54.90, "percent": 81.7, "rolled_over": 0.0 }
  ]
}
```

### GET /api/dashboard/spending?period=2026-03 [MVP]
Spending dashboard (BC-04): the budget summary above, the top 10 items, a 3-month trend (oldest first, ending at `period`), and a month-over-month comparison per category. `category_changes` lists every category with spend in `period` or `previous_period`, largest current spend first; uncategorized spend is left out. `prior_average` is the mean monthly spend over the 3 months before the trend window (0.0 when there was none), for comparing with the trend's own average. `has_receipts` is true when the user has any receipt outside Recently Deleted, in any period; the app shows its first-scan state only when it is false. Each top item carries the category that holds most of its spend (`category_id` and `category_name` are null when uncategorized). Each trend month splits its `spent` into `categories`, largest first; uncategorized spend is kept there (`category_id` null, name "Uncategorized") so the parts add up to `spent`.

**Current period.** Without `period`, the response is about the period that holds today in the user's time zone (`users.timezone`; UTC when unset). Periods reset on the overall budget's start day and are named for the month they start in, so with a start day of 15, October 10 is in `2026-09` (September 15 – October 14). The app sends no `period` and reads it from the response. `period_start` and `period_end` are the period's first and last days, for any `period`; the app takes the day count, days left, and pace from them.

**Response:**
```json
{
  "period": "2026-03",
  "period_start": "2026-03-01",
  "period_end": "2026-03-31",
  "overall": { "budget": 500, "spent": 35.0, "remaining": 465.0, "percent": 7.0 },
  "categories": [ "…as in /api/budgets/summary" ],
  "top_items": [ { "name": "Bananas", "total_spent": 5.0, "count": 1, "category_id": "uuid", "category_name": "Groceries" } ],
  "trend": [
    { "period": "2026-01", "spent": 0.0, "budget": 500, "categories": [] },
    "…",
    { "period": "2026-03", "spent": 35.0, "budget": 500, "categories": [
      { "category_id": "uuid", "name": "Groceries", "spent": 30.0 },
      { "category_id": null, "name": "Uncategorized", "spent": 5.0 }
    ] }
  ],
  "prior_average": 150.0,
  "previous_period": "2026-02",
  "category_changes": [
    { "category_id": "uuid", "name": "Groceries", "spent": 30.0, "previous_spent": 20.0 }
  ],
  "has_receipts": true,
  "current_period": "2026-03"
}
```

**`months` [V1.1].** `?months=1|3|6|12|all` sets the trend length, one per range chip on Trend (BC-04 AC 6, DA-10; default `3`; `GET /api/dashboard/spending?period=2026-03&months=12`). With a number N, `trend` holds the N months ending at `period`, oldest first, and `prior_average` covers the N months before them. With `all`, `trend` starts at the period holding the user's first receipt that counts toward spend (confirmed, not in Recently Deleted, in the budget currency; another user's never), and is just `period` when there is none on or before it; `prior_average` is `0.0`, since nothing comes before the first receipt. The rest of the response is unchanged. Any other value (`2`, `24`, `ALL`) returns `422`.

`current_period` is the period holding today in the user's time zone, whichever `period` was asked for; Trend tints that month's bar and, since it is not over, leaves it out of Highlights' Lowest (BC-04 AC 8, 9).

`1` and `3` are free; `6`, `12` and `all` are Premium (decisions D2 and D11), checked on the server against the stored entitlement, never the app's. A free user asking for one gets `403` (`feature` stays `trend_12_months` for all three), which the app turns into an upgrade prompt, never an error screen:

```json
{ "detail": { "code": "premium_required", "feature": "trend_12_months", "message": "This feature is part of Grocery Genie Premium." } }
```

`code: "premium_required"` is the stable error for every Premium-only feature; `feature` names which one. The check lives in `backend/app/core/entitlements.py` (`is_premium`, and the `require_premium(feature)` dependency for a route that is Premium as a whole); see [Premium](#premium-v11).

## User currency

### POST /api/auth/sign-up · /api/auth/apple · /api/auth/google [MVP]
Each takes an optional `currency_preference`: the iPhone region's currency, used only when the call creates the account. A value that isn't a 3-letter code is ignored (the account keeps `USD`); it never fails sign-up.

### PATCH /api/users/me [MVP]
`currency_preference` must be a 3-letter ISO 4217 code (stored upper-case), or the call returns `422`. The app sets it in Settings → Currency.

`timezone` must be an IANA time zone name (such as `Europe/Berlin`), or the call returns `422`. Sign-up, Apple and Google sign-in also take it, for a new account only (a bad value is ignored, and the account keeps `UTC`). The weekly summary goes out at 9 AM in it. The profile returns `timezone`.

`muted_alert_categories` is a list of category ids, replaced whole; their budgets send no threshold alerts (BC-03 AC 4). The profile returns it under `preferences`.

### POST /api/receipts (manual) [MVP]
`currency` is optional and defaults to the user's `currency_preference`; it must be a 3-letter code.
An item's `category_id`, when given, must be a default category or one of the user's own; any other id returns 400.

## Categories [V1.1]

The eight default categories, plus up to 10 custom categories per user (BC-05 AC 3). A custom category belongs to one user (Category has no household in the data model). Custom categories work everywhere a default does: correcting an item (and the item mapping it teaches the next scan, BC-05 AC 4), budgets, the budget summary and the dashboard. **Known limitation (decided in V11-P1):** the LLM category prompt lists only the eight defaults, so a scan never assigns a custom category by itself. A custom category reaches a new scan only through the user's corrections: correcting an item teaches its item mapping, and the next scan of that item lands there (BC-05 AC 4). Teaching the prompt the user's custom names would change extraction and need the `validate-extraction` harness, so it is left for later.

Creating and renaming are Premium (decision D2): a free user gets `403 premium_required` with `feature: "custom_categories"`. **When Premium lapses** the user's categories stay: they list, keep their items, colour and icon, still take corrections and budgets, and can be deleted; only create and change (name, colour, icon) return 403 until Premium is back.

**Colour and icon (BC-05 AC 5, DA-9).** Every category has a `color` and an `icon`, both names (never hex codes or SF Symbol names; the app maps them, `backend/app/models/category_looks.py`). The eight built-ins have fixed ones: Groceries `green`/`cart`, Household `blue`/`house`, Personal Care `pink`/`heart`, Beverages `indigo`/`cup`, Snacks & Treats `orange`/`cake`, Baby & Kids `yellow`/`family`, Pet `teal`/`paw`, Other `gray`/`tag`. A custom category takes a colour from `indigo, purple, pink, red, orange, yellow, green, mint, teal, cyan, blue, brown` and an icon from `tag, leaf, gift, sparkles, fork-knife, wineglass, dumbbell, pills, book, gamecontroller, wrench, airplane`; the first of each (`indigo`, `tag`) when none is chosen, and for every custom category made before DA-9. Any other value, `null` included, is a 422. Changing them is Premium like a rename; after a lapse they stay (AC 8).

### GET /api/categories
Defaults first (by `sort_order`), then the user's own in the order they were made. Each: `{ "id", "name", "is_default", "sort_order", "color", "icon" }`. Another user's categories never list.

The budget summary (`GET /api/budgets/summary`) and the dashboard (`GET /api/dashboard/spending`) carry each category's `color` and `icon` in `categories[]` too, for the dashboard's bars (AC 7).

### POST /api/categories
Request `{ "name": "Garden", "color": "mint", "icon": "leaf" }`; `color` and `icon` are optional (default `indigo`, `tag`). Whitespace in the name is collapsed, and it must be 1–40 characters (422 otherwise). Returns `201` with the category.
- `409 { "detail": { "code": "category_limit_reached", "limit": 10, "message": … } }` when the user already has 10.
- `409 { "detail": { "code": "category_name_taken", "message": … } }` when a default or one of the user's own categories has the name, ignoring case. Two users may use the same name.

### PATCH /api/categories/{id}
Rename or restyle: any of `{ "name": "Yard", "color": "green", "icon": "gift" }`, same rules and errors as POST; a field left out keeps its value, and a body with none is a 422. Premium (a lapsed user gets `403 premium_required`). A default category or another user's returns 404.

### DELETE /api/categories/{id}
Returns `204`. Not Premium-gated, so a lapsed user can still remove what they made. The spending it held is kept:
- its line items move to the default "Other" category, so totals and history don't change;
- item mappings that pointed at it lose their category, so the next scan of those items is assigned afresh;
- its budgets (active or in Recently Deleted) are removed, with the alerts sent for them;
- it leaves `muted_alert_categories`.

A default category or another user's returns 404. Deleting sends no budget alert; spend that moved into "Other" counts toward its budget from the next receipt on.

**Concurrent requests.** Creates, renames and deletes of one user's categories take turns, so two creates at once cannot pass the cap of 10 or the name check together (the loser gets the 409). A request that puts a custom category on a row (a correction, a budget, a manual receipt, a scan applying an item mapping) takes turns with its delete: if it is first, the delete then moves or removes what it wrote, as above; if the delete is first, a correction, budget or manual receipt gets `400` (unknown category) and a scan leaves that item to be assigned afresh. Neither side gets a 500.

## Onboarding

### POST /api/users/me/onboarding-complete [MVP]
Ends onboarding, with or without a budget (Skip on Set Budget). Idempotent: a repeat call keeps the first completion time. Returns the user profile with `needs_onboarding: false`.

`needs_onboarding` (on `/api/auth/me`, `/api/users/me`, and the sign-up and sign-in token pairs) is true only while the user has not completed onboarding and has no active monthly budget. After completion, deleting the budget does not restart onboarding.

## AI Consent

### PUT /api/users/me/ai-consent [MVP]
Records that the user allows receipts to go to third-party AI (App Store 5.1.2(i)). The app sends the policy version of the text it showed. Returns the user profile.

**Request:**
```json
{ "policy_version": "2026-10-27" }
```

- `409 ai_consent_version_mismatch` (with `current_policy_version`) when the version is not the current one: the app shows the new text first.
- Idempotent: a repeat call keeps the first `granted_at`.

### DELETE /api/users/me/ai-consent [MVP]
Withdraws consent; scans return `403 ai_consent_required` until the user allows them again. Idempotent. Returns the user profile.

The profile (`/api/auth/me`, `/api/users/me`) carries the consent:
```json
"ai_consent": { "granted": true, "granted_at": "2026-10-27T10:00:00Z", "policy_version": "2026-10-27", "current_policy_version": "2026-10-27" }
```
`granted` is true only for consent to the current version. A new version (`AI_CONSENT_POLICY_VERSION` in `backend/app/services/ai_consent.py`) asks every user again.

## Account

### DELETE /api/users/me [MVP]
Deletes the signed-in account and everything it owns, at once and for good (App Store Review Guideline 5.1.1(v)). Returns 204.

**Request** (optional; a Sign in with Apple account must send it):
```json
{ "apple_authorization_code": "fresh code from Sign in with Apple" }
```

- **Deleted:** the user row (profile, preferences, password hash, Apple and Google subject IDs), all receipts (soft-deleted ones too), their line items and corrections, budgets and the alerts sent for them, notifications, push tokens, price alert cooldowns and mutes (`price_alerts_sent`, `price_alert_item_mutes`, `price_alert_store_mutes`), the RevenueCat webhook events matched to the account (`revenuecat_events`), a pending waitlist claim, item mappings, the user's own categories, sign-in activity (`auth_events`, including failed sign-ins logged under the account's email), analytics events (`analytics_events`), and each receipt's image, converted JPEG, and thumbnail files.
- **Kept:** stores (shared by all users, with no user link) and the default categories. A waitlist free year (`waitlist_redemptions`, V11-P5) keeps only its salted hash of the waitlist email and its status, unlinked from the account, until the claim window closes (decisions #13), so a new account cannot take a second free year with the same waitlist email.
- **Not cancelled:** an App Store Premium subscription. Apple bills it until the user cancels it in iOS Settings; the delete screen says so.
- **Sessions:** the calling token's family is revoked. Every other token of the account fails too, because its user no longer exists (`/me` returns 401, `/api/auth/refresh` returns 400 `invalid_token`).
- **Idempotent:** image files go first (a missing file is fine), then all rows in one transaction. A run cut off before the commit leaves the account in place, so the user can call again. A second call after success returns 401: its token no longer resolves to a user.
- **Sign in with Apple** (TN3194): the server keeps no Apple token, so an account with an Apple ID signs in with Apple again, and the app sends the new authorization code. The server exchanges the code, checks that it is the account's Apple ID, and calls `https://appleid.apple.com/auth/revoke` with the refresh token (or the access token when Apple returns none). Only then does it delete. Each failure stops the deletion, and nothing is deleted:
  - `409 apple_reauth_required`: an Apple account sent no code. The app shows the Apple sheet and retries.
  - `403 apple_account_mismatch`: the code is for a different Apple ID.
  - `502 apple_revoke_failed`: the exchange or the revoke call failed, or Apple could not be reached.

## Premium [V1.1]

Premium ($4.99/month or $39.99/year, each with a 7-day free trial: decision D7, 2026-11-04, replacing D1's $5.99; PREM-01) is an App Store subscription sold through RevenueCat: products `gg_premium_monthly` and `gg_premium_yearly`, in the current offering's Monthly and Annual packages (`docs/DEPLOYMENT.md` 2.9). Either product grants Premium; a trial (RevenueCat `period_type` `TRIAL`) is Premium until it ends, and converts or changes plan with no gap. The backend trusts only RevenueCat for it: the webhook below and RevenueCat's REST API, never the app. Premium gates the V1.1 extras (D2): trends over 3 months (6M, 1Y, All; D11), custom categories, data export, budget rollover, and unlimited receipts, and (decision D8, PREM-02) cross-store comparison and muting price alerts (below). A free user asking for the trend, custom categories, export, rollover, comparison or a mute gets `403 premium_required` (above), with `feature` one of `trend_12_months`, `custom_categories`, `data_export`, `budget_rollover`, `price_comparison`, `price_alert_mute`. The receipt cap is the one exception: a free user past it gets `429 receipt_quota_exceeded` (below), because the scan itself stays free. Custom categories: [Categories](#categories-v11).

The profile (`/api/auth/me`, `/api/users/me`, and every route that returns it) carries the entitlement:
```json
"is_premium": true,
"premium_expires_at": "2026-12-04T10:00:00Z"
```
`premium_expires_at` is the end of the paid period (null for a free user, or a grant with no end). A user is Premium while the entitlement is active and before that time, so a missed expiration webhook cannot keep anyone Premium. `PATCH /api/users/me` cannot set either field.

**Unlimited receipts.** `POST /api/receipts/scan` refuses a free user's scan past `GG_FREE_TIER_RECEIPTS_PER_MONTH` (20) receipts in the month with `429`; a Premium user has no monthly cap (the hourly rate limit still applies). Manual entries count toward the 20, but `POST /api/receipts` is never refused by the cap. The body:
```json
{ "detail": "Monthly receipt quota exceeded (20 receipts/month on Free tier).", "code": "receipt_quota_exceeded", "feature": "unlimited_receipts", "limit": 20 }
```
`code` is the stable test; the hourly rate limit's `429` has none. It is not `403 premium_required`, because the scan itself is a free feature: the month's allowance is spent. `detail` stays a string because app builds from before V1.1 match it ("quota") and must keep treating the cap as final, not retrying it. The app answers it with the upgrade prompt (See Premium opens the paywall, or Enter manually), never an error (D2).

**Priority OCR (D9, PREM-03).** `POST /api/receipts/scan` reads a Premium user's receipt with the Premium extraction model (`GG_LLM_PREMIUM_EXTRACTION_MODEL`) and a free user's with the default model. The request and the response are unchanged: the app sends nothing about it, and the server reads Premium from the user's entitlement when extraction starts. A Premium model that fails hands the scan to the default model, so the response is the same `200` (or the usual `503` when the default fails too). The model that read the receipt is stored as `receipts.extraction_model`.

Price history, item matching (suggestions, merge, split), price alerts, the alert settings and the notifications list stay free (D2, D8) and answer a free user `200`. Cross-store comparison and muting are Premium (D8, PREM-02): `GET /api/items/{canonical_id}/compare` answers a free user `403 premium_required` (`feature` `price_comparison`), and `POST /api/items/{canonical_id}/mute` and `POST /api/stores/{store_id}/mute` too (`price_alert_mute`). The Premium check comes first, so a free user gets the 403 even for an id that would be 404. Both mute `DELETE`s stay open to everyone, and a mute made while Premium keeps working after a lapse: alerts still skip it, `GET /api/items/price-alert-settings` still lists it, and it can be removed. `price_comparison_viewed` and `price_alert_muted` are recorded only for a comparison served and a mute saved.

### POST /api/webhooks/revenuecat

Called by RevenueCat, not the app. Authenticated by the `Authorization` header, which must equal `GG_REVENUECAT_WEBHOOK_SECRET` (alone or after `Bearer `); a missing or wrong value, or no secret configured, returns `401 invalid_webhook_secret` and changes nothing.

**Request:** RevenueCat's webhook body. The backend reads `event.id`, `type`, `app_user_id`, `original_app_user_id`, `aliases`, `entitlement_ids` (or the older `entitlement_id`), `product_id`, `expiration_at_ms`, `event_timestamp_ms`, `transferred_from` and `transferred_to`; it ignores the rest. A body without `event.id` and `event.type` is `422`.

**Response** `200`, also for an event that changes nothing, so RevenueCat stops retrying it:
```json
{ "status": "applied" }
```

| `status` | Meaning |
|---|---|
| `applied` | The user's entitlement was updated. |
| `duplicate` | This event id was received before: nothing changes. Each id is claimed once in `revenuecat_events`. |
| `stale` | Older (`event_timestamp_ms`) than the event or REST read that last set the user's entitlement: webhooks can arrive out of order. One exception is `applied`: a grant older than the `CANCELLATION` or `BILLING_ISSUE` that last set the entitlement (it arrived after its own cancellation) makes the user Premium, to that newer event's expiry. A cancellation does not end access early, and a refund's expiry is already past, so a refunded purchase still grants nothing. |
| `ignored` | Not about the Premium entitlement (`GG_REVENUECAT_ENTITLEMENT_ID`, default `premium`), or a type that changes nothing (`TEST`, `SUBSCRIPTION_PAUSED`, ...). |
| `unknown_user` | None of the event's app user ids (`app_user_id`, `original_app_user_id`, `aliases`) is a Grocery Genie user. The app logs in to RevenueCat with the user's id, so a purchase made before sign-in is found through `aliases`. |

| Event `type` | Effect |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `PRODUCT_CHANGE`, `NON_RENEWING_PURCHASE`, `SUBSCRIPTION_EXTENDED`, `TEMPORARY_ENTITLEMENT_GRANT`, `REFUND_REVERSED` | Premium until `expiration_at_ms` (none: no end). |
| `CANCELLATION`, `BILLING_ISSUE` | Stays as it is; the expiry moves to `expiration_at_ms` (none sent: the stored expiry stays). Auto-renew is off, so Premium lasts to the end of the paid period. |
| `CANCELLATION` with `cancel_reason` `CUSTOMER_SUPPORT` (a refund) | Premium ends now and `premium_expires_at` is cleared, whatever expiry the event or the user row holds, so a late grant from before the refund is `stale`. |
| `EXPIRATION` | Premium ends. |
| `TRANSFER` | The purchase moved to another app user id (a restore on another account). Each user in `transferred_from` and `transferred_to` is read back from the REST API; without an API key, the old owners lose Premium and the new owner gets it with its next event or refresh. |

### POST /api/users/me/premium/refresh

Reads the signed-in user's entitlement from RevenueCat's REST API (`GET /v1/subscribers/{user id}` with `GG_REVENUECAT_API_KEY`) and stores it. The app calls it after a purchase or "Restore purchases", so Premium shows without waiting for the webhook. The request body, if any, is ignored. Returns the user profile.

- `503 revenuecat_unavailable`: no API key is configured, or RevenueCat could not be read. The stored entitlement is unchanged; the webhook still delivers it.
- `429`: more than 10 refreshes in a minute for this user (`GG_MAX_PREMIUM_REFRESHES_PER_MINUTE`). Each refresh reads RevenueCat, so it has its own count, apart from the 300 requests a minute.

The stored state is stamped with the time of RevenueCat's answer (`request_date_ms`). A webhook applied after that read is newer and is kept; the refresh then returns the stored state unchanged.

### The waitlist's free year [V1.1]

The marketing site promised waitlist sign-ups a free year of Premium (`docs/marketing/decisions.md` #2, #7, #9–#13). An account qualifies when its **verified** email, trimmed and lowercased, equals a waitlist contact's (the site's Resend audience, copied into `waitlist_entries`) created before `GG_WAITLIST_CUTOFF`; unsubscribed contacts count. Grants happen only inside the claim window: 90 days (`GG_WAITLIST_CLAIM_WINDOW_DAYS`) from `GG_PREMIUM_LAUNCHED_AT`; unset, the window is closed. Each match grants the Premium entitlement through RevenueCat's REST API (`POST /v1/subscribers/{user id}/entitlements/{GG_REVENUECAT_ENTITLEMENT_ID}/promotional` with `end_time_ms` = the match plus 12 months; `duration` is not sent), then reads it back as `premium/refresh` does. One free year per waitlist email, ever, and one per account.

Matching runs, with nothing extra from the app, inside:
- `POST /api/auth/apple` and `POST /api/auth/google` (the provider verified the email);
- `POST /api/auth/verify-email`;
- `POST /api/users/me/email-change/confirm`;
- the launch backfill and a daily rerun (`app.tasks.waitlist_tasks`).

Those routes answer exactly as before, and never wait long on RevenueCat: a match is committed as `pending` (stamped as an attempt) before RevenueCat is called, and the request waits at most `GG_WAITLIST_INLINE_GRANT_TIMEOUT_SECONDS` (3 s) for the grant and the read-back together. If RevenueCat is slow, fails with a 5xx, 408 or 429, or no API key is set, the match stays `pending` and a beat task retries it with the same end date, backing off from 15 minutes to 6 hours between attempts. The window is checked only at the match (decision #9): retries go on after it closes. It stops for good (`failed`, reason kept, logged at error level) on a RevenueCat 4xx, `GG_WAITLIST_GRANT_RETRY_DAYS` (14) days after the match, or if the end time has passed.

#### GET /api/users/me/waitlist-offer
```json
{
  "window_open": true,
  "claim_available": false,
  "closes_at": "2027-04-01T00:00:00Z",
  "redemption": { "status": "granted", "expires_at": "2028-01-10T12:00:00Z" }
}
```
`claim_available`: the window is open and the account has no free year; the app shows Settings → "Claim your waitlist offer" only then. `redemption` is null until a match; `status` is `pending` (the grant is being retried), `granted`, or `failed` (it could not be applied; the app says to contact support); `expires_at` is when the free year ends. `closes_at` is null while no launch date is set.

#### POST /api/users/me/waitlist-offer/claim
For an account whose email is not the waitlist one (Apple's Hide My Email, another address). The email-change pattern: the server sends a confirmation link to the waitlist email (`grocerygenie://onboarding/confirm-waitlist-claim?token=…`, valid 24 hours).
```json
{ "email": "member@example.com" }
```
**Response** `202 {"status": "sent"}` at once, for any email. The route never looks at the waitlist: it enqueues one Celery task, which looks the email up and sends the link only to a qualifying, unredeemed waitlist email. So the answer, its timing and its errors are the same whether or not the email is on the waitlist, and a Resend failure is only logged by the worker. Errors, which depend only on the account: `409 waitlist_offer_closed` (window not open), `409 waitlist_offer_redeemed` (this account already has its free year), `422 invalid_email`, `429` (more than `GG_MAX_WAITLIST_CLAIMS_PER_HOUR`, 5, claims an hour from this account). Past `GG_MAX_WAITLIST_CLAIMS_PER_EMAIL_PER_DAY` (3) claims a day from this account for one waitlist email, the answer is the same `202` and no link is sent; the count is per account, so another account can't use up a member's claims.

#### POST /api/users/me/waitlist-offer/confirm
No session needed: the token from the link is the proof that the user holds the waitlist email.
```json
{ "token": "…" }
```
**Response** `200` with the redemption (`{"status": "granted" | "pending" | "failed", "expires_at": "…"}`). Errors: `400 invalid_token` (unknown, used or expired link), `409 waitlist_offer_closed`, `409 waitlist_offer_redeemed` (the account, or the waitlist email, already has its free year), `409 waitlist_not_eligible` (the contact left the waitlist since the link was sent).

### GET /api/users/me/export?format=json|csv|pdf&from=&to=&include=

Data export (NFR Privacy 2), Premium (D2), with the options of PREM-04 (DA-8). A free user gets `403 premium_required` with `"feature": "data_export"`.

**Parameters** (all optional):

- `format`: `json` (default), `csv` or `pdf`.
- `from`, `to`: the first and last day of the range, `YYYY-MM-DD`, both inclusive; either left out is open-ended, both left out is all time. The app sends whole months (From the first day of its month, To the last), and starts on the last 12 calendar months. The range picks receipts by their `date`; their line items and the price observations they recorded go with them. Categories and budgets are settings, not dated, and are never cut by the range.
- `include`: comma-separated sections, at least one: `receipts` (receipts and line items), `prices` (price observations), `budgets` (categories and budgets), `images` (receipt images). Left out: `receipts,prices,budgets` (images off), the export before PREM-04.

`422` for an unknown `format`, a date that is not `YYYY-MM-DD`, an empty or unknown `include` (`{"code": "invalid_include"}`), and `from` after `to` (`{"code": "invalid_range"}`).

**Scope:** the signed-in user's own receipts, line items, categories (the built-in ones and their own), budgets and price observations, as every other read (households arrive in V1.5). Deleted receipts and budgets are left out, and so are the line items and prices of a deleted receipt. Receipts of every status are included, with their `status`. All time with every section on is everything the user has (PREM-04 AC 7).

**Response** `200`, as a download (`Content-Disposition: attachment; filename="grocery-genie-export-YYYY-MM-DD.json"`, `.zip`, or `grocery-genie-report-YYYY-MM-DD.pdf`; `Cache-Control: no-store`):

- `json` (`application/json`): one document. Receipts are oldest first, each with its line items in receipt order. A section switched off is left out, key and all.
  ```json
  {
    "format_version": 1,
    "exported_at": "2026-11-03T10:00:00Z",
    "currency": "USD",
    "range": { "from": "2025-12-01", "to": "2026-11-30" },
    "includes": ["receipts", "prices", "budgets"],
    "receipts": [
      { "id": "uuid", "date": "2026-03-01", "store_name": "FreshCo", "store_location": null,
        "subtotal": 4.88, "tax": 0.0, "total": 4.88, "currency": "USD", "status": "confirmed",
        "created_at": "2026-03-01T12:00:00Z",
        "line_items": [
          { "id": "uuid", "receipt_id": "uuid", "position": 0, "name": "ORG BANANAS",
            "quantity": 2.0, "unit_price": 0.69, "total_price": 1.38, "unit_of_measure": "lb",
            "category": "Groceries", "canonical_item_id": "uuid", "canonical_item_name": "ORG BANANAS",
            "corrected": false } ] } ],
    "categories": [ { "id": "uuid", "name": "Groceries", "is_default": true, "color": "green", "icon": "cart" } ],
    "budgets": [
      { "id": "uuid", "category": null, "category_id": null, "amount": 450.0, "currency": "USD",
        "period_type": "monthly", "period_start": "2026-03-01", "rollover_enabled": false,
        "created_at": "2026-03-01T12:00:00Z" } ],
    "price_observations": [
      { "id": "uuid", "date": "2026-03-01", "canonical_item_id": "uuid", "item_name": "ORG BANANAS",
        "store_name": "FreshCo", "unit_price": 0.69, "quantity": 2.0, "unit_of_measure": "lb",
        "currency": "USD", "receipt_id": "uuid", "line_item_id": "uuid" } ]
  }
  ```
  `range` holds `null` for an open bound. A category carries its `color` and `icon` (BC-05 AC 5, names as in [Categories](#categories-v11)). A budget's `category` is null for the overall budget. `currency` is the budget currency (`currency_preference`).
- `csv` (`application/zip`): `receipts.csv` and `line_items.csv` (with `receipt_id`) for `receipts`, `categories.csv` and `budgets.csv` for `budgets`, `price_observations.csv` for `prices`, with the same columns as the JSON. UTF-8 with a byte order mark, so Excel reads accented names; money has two decimals, quantities three. A text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a spreadsheet does not run it as a formula (CSV injection). JSON values are not escaped.
- `pdf` (`application/pdf`): a spend report of the range (PREM-04 AC 5): the range, the receipt count, then "Monthly spend by category" (for `budgets`), "Top items" (the ten most spent on) and "Receipts" (date, store, total; for `receipts`). Spend counts what the budget dashboard counts: confirmed receipts in the user's currency; the receipt list shows every receipt in its own currency, marking one not confirmed. `prices` has no section of its own. A range with no receipts says "No receipts in this range." The report uses the PDF's built-in Helvetica (Windows-1252): a letter outside it is drawn without its accent, or as `?` (JSON and CSV keep every name as it is).
- With `images`, every format comes as one zip (`application/zip`): the CSV files at the top, or the JSON or PDF file, and `images/` with each scanned receipt's image as `images/<receipt id>.<ext>` (`.jpg`, `.png`, `.heic` or `.pdf`; a HEIC or PDF upload's JPEG copy first, as the receipt screen shows). A manual receipt has no image, and an image no longer stored is left out; `images/README.txt` says how many images there are and how many receipts have none.

**Large accounts:** rows are read 500 at a time (keyset pages) into a spooled temporary file, in memory up to 8 MB and on disk past that, which is then streamed with its `Content-Length`. Receipt images are read one at a time and stored in the zip uncompressed (they are compressed already). The PDF report is built in memory (about a kilobyte a page, one line per receipt) before it is written. Memory stays bounded however many receipts there are, and the database work is done before the first byte is sent. The export is built in the request, as before PREM-04: no background job.

**Limits:** the export is built whole in the request, receipt images included, so each user gets `GG_MAX_EXPORTS_PER_HOUR` (10) exports an hour and one at a time. Past either, `429` with `Retry-After`:
```json
{ "detail": { "code": "export_rate_limited", "message": "Too many exports this hour. Try again later." } }
```
(`Retry-After: 600`), or `export_in_progress` while another export of the user's is being built (`Retry-After: 30`). The one-at-a-time slot is a Postgres advisory lock on the request's transaction (`pg_try_advisory_xact_lock`), so every API worker sees it and the database releases it when the transaction ends, committed, rolled back on an error, or with a dropped connection. A refused request (422, 403 or `export_in_progress`) does not use up the hourly count, and the summary below is not counted. A build whose client has gone stops before its next page of 500 receipts or prices: it closes its spooled file, ends its transaction (which frees the slot), sends nothing and records no `data_exported`; the export still counts toward the hour. The route asks `request.is_disconnected()` before each page. That works only because every middleware in front of the route is plain ASGI: a Starlette `BaseHTTPMiddleware` in the stack hides the disconnect, and the build would run to the end. The spooled file is closed however the response ends. The app shows one message for either 429: the native download gives only the status, not the body.

Records `data_exported` with the format, the range and the includes (12-analytics.md). The 300 reads/minute limit applies too.

### GET /api/users/me/export/summary?from=&to=

The receipt count behind the app's "Export N receipts" button (PREM-04 AC 4): the user's not-deleted receipts dated in the range, with `from` and `to` as for the export. Premium (`403 premium_required`, `"feature": "data_export"`); `422` for a bad date or `from` after `to` (`invalid_range`).

**Response** `200`: `{ "receipt_count": 1247 }`

## Price Intelligence [V1.1]

Built: PI-01 (price history), PI-02 (item matching), PI-03 (price change alerts, below) and PI-04 (cross-store comparison), backend and app. Every route is the signed-in user's own data; another user's item, alias or suggestion answers 404.

Confirming a receipt (scan + `PATCH status=confirmed`, or a manual entry) links each line to a canonical item and records its price. `LineItemResponse` carries `canonical_item_id`. Matching: exact alias → fuzzy (mean of Jaro-Winkler and Levenshtein on word-sorted names, ≥0.85 links) → semantic (embedding cosine, ≥0.80 links) → new item, with a suggestion for the user when the best candidate scored ≥0.6. Names whose numbers differ ("milk 1%" / "milk 2%") never match by similarity. Names whose qualifiers differ (organic, fat, size, flavour, store brand, colour, form, diet: "Bananas" / "Organic Bananas") never auto-link, however high they score: the line gets its own item and, at ≥0.6, a suggestion. Fuzzy scoring reads qualifier abbreviations as the word ("ORG" is organic, "WHL" whole, "WHL WHT" whole wheat). Common French qualifier words read as their English meaning, accents ignored ("biologique" / "bio" organic, "écrémé" nonfat, "sans gluten" gluten free). The list is `backend/app/services/item_qualifiers.py`.

### GET /api/items?q=&page=&per_page=
Items with at least one price, most recently bought first. `q` searches names and aliases.

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "canonical_name": "Organic Bananas",
      "unit_of_measure": "lb",
      "observation_count": 12,
      "store_count": 2,
      "latest_price": { "unit_price": 0.79, "unit_of_measure": "lb", "currency": "USD", "date": "2026-03-12", "store_name": "Loblaws" },
      "avg_unit_price": 0.74
    }
  ],
  "total": 1, "page": 1, "per_page": 20,
  "pending_suggestions": 2
}
```
[V1.1] (DA-6, PI-02 AC 11, 15) `avg_unit_price` is the mean unit price of the item's prices in the unit and currency most of them are in, rounded half up to the cent, over the caller's receipts not deleted (`null` with none): the "N purchases · $X avg" of the Link items sheet and the split screen. Item detail carries it too.

### GET /api/items/{canonical_id}
The list fields plus `aliases: [{id, alias}]` and `suggestions` (pending questions about this item).

### GET /api/items/{canonical_id}/prices?store={store_id}&from=YYYY-MM-DD&to=YYYY-MM-DD
Price observations for a canonical item, oldest first.

**Response:**
```json
{
  "item": { "id": "uuid", "canonical_name": "Organic Bananas" },
  "unit_of_measure": "lb",
  "currency": "USD",
  "has_timeline": true,
  "min_points": 2,
  "store_count": 2,
  "observations": [
    { "receipt_id": "uuid", "line_item_id": "uuid", "line_name": "ORG BANANAS", "date": "2026-03-01", "store_id": "uuid", "store_name": "FreshCo", "unit_price": 0.69, "quantity": 2.0, "unit_of_measure": "lb", "currency": "USD", "in_timeline": true }
  ]
}
```
`unit_of_measure` and `currency` are those of most of the item's prices; a price in another unit or currency has `in_timeline: false` (listed, not plotted). `has_timeline` is false until the timeline has `min_points` prices (PI-01 AC 4).

`from` and `to` (inclusive) keep the prices dated in that range; `has_timeline` and `store_count` then count those alone, while `unit_of_measure` and `currency` stay the full history's, so a range never changes which series is plotted. Item detail asks once, with no filter: its range control (PI-01 AC 5) and the 30-day headline (AC 7) work from that full history in the app, so opening an item records one `price_history_viewed` and a range tap records none.

### PATCH /api/items/{canonical_id}
**Request:** `{ "canonical_name": "Organic Bananas" }` → item detail.

### POST /api/items/{canonical_id}/merge
**Request:** `{ "into_item_id": "uuid" }`. The item's aliases, lines and prices move to `into_item_id`, which is returned; the item is deleted. 409 when merging an item into itself.

### POST /api/items/{canonical_id}/aliases/{alias_id}/split
201 with the new item: the alias, its lines and their prices. 409 when it is the item's only alias.

### POST /api/items/{canonical_id}/split
[V1.1] (DA-6, PI-02 AC 10-14) Split by line.

**Request:** `{ "splits": [{ "name": "Olive oil 3L", "line_item_ids": ["uuid"] }] }` (1 to 10 splits). A line is one of the item's on the caller's confirmed receipts that are not deleted: the `line_item_id`s of its prices. Any line can move, though its receipt name has other lines.

**Response** `201 { "items": [<item detail>, ...] }`: the new items, in the order of `splits`, each with its lines and their prices (each line's observation moves with it, so history, comparison and alerts use the new grouping; nothing is copied). A receipt name all of whose lines went to one new item goes with them: its alias, and its lines on Recently Deleted receipts, so a restore and later scans join the new item. A name with lines left on the original, or spread over two new items, stays with the original. A new item's name may equal an existing item's (it is still a new item; the user can link them). The item's pending suggestions go with the line that raised them (the line matching made the item from, which keeps `match_method` `new`): when it moved, they belong to its new item, so an accept merges only that item's lines; one whose line stayed stays. A muted item's new items are muted too (`alerts_muted`, PI-03 AC 4), until the same `muted_until` (DA-7); an ended mute is not copied.

Errors: `409` when the original would keep no line (also an item with one line, EC-PI 6); `422` for an empty name, an empty split, no split, a line that is not the item's, or one line in two splits; `404` for another user's item. The split locks the item before it reads or moves anything, the order merge and accept use (items first), so a split racing a merge of the item waits: the merge then takes what is left, or the split finds the item gone (404).

### GET /api/items/{canonical_id}/link-candidates?q=
[V1.1] (DA-6, PI-02 AC 15) The Link items sheet: `{ "suggested": [<item summary>], "items": [<item summary>] }`. `suggested` holds the item's pending suggestions (newest first), then up to 5 of the most similar other items by name or alias (fuzzy score ≥ 0.6, best first); `items` every other item with a price, most recently bought first (at most 500). `q` narrows both by name or alias, as `GET /api/items`. The item itself is never listed, and nothing is listed twice. Another user's item: 404.

### GET /api/items/suggestions
Pending suggestions, newest first:

```json
[{
  "id": "uuid",
  "item": { "id": "uuid", "canonical_name": "BNLS CHKN BRST 2LB" },
  "suggested_item": { "id": "uuid", "canonical_name": "Chicken breast, boneless" },
  "confidence": 0.72,
  "method": "fuzzy",
  "receipt_line": { "receipt_id": "uuid", "name": "BNLS CHKN BRST 2LB", "store_name": "Costco", "date": "2026-04-19" },
  "suggested_item_stats": { "purchase_count": 14, "store_count": 3, "avg_unit_price": 8.99, "unit_of_measure": "lb", "currency": "USD" }
}]
```

[V1.1] (DA-5, PI-02 AC 5, 8) `receipt_line` and `suggested_item_stats` are what the "Same item?" prompt shows; item detail's `suggestions` carry them too. `receipt_line` is the line that raised the suggestion (the one matching made the new item from, else the item's latest line), as printed, with its receipt's store and date; `null` when the item has no line on a confirmed receipt the user can see. `suggested_item_stats` counts only the caller's prices on receipts not deleted: purchases, stores as the user groups them, and the mean unit price in the unit and currency most of them are in (`avg_unit_price` `null` with no price).

`?receipt_id=<uuid>`: only the suggestions that receipt's lines raised (a line there made the new item the suggestion asks about), for the prompt after a confirm (PI-02 AC 7). A later receipt that repeats the name links to that item by its alias and raises nothing. 404 for an unknown, deleted or another user's receipt; `[]` for a receipt that raised none. The confirm matches its lines inline, so its suggestions are there once the confirm answers.

### POST /api/items/suggestions/{id}/accept
Same product: merges `item` into `suggested_item` and returns it. 409 when already resolved; 404 once accepted (the merge drops the suggestion). Accept and reject lock the suggestion (accept locks its two items first, in id order, as a merge does), so of two answers at once the second waits and gets 409. The prompt treats both as resolved elsewhere and moves on (PI-02 AC 9).

### POST /api/items/suggestions/{id}/reject
204. Different products: both items stay.

### Price change alerts (PI-03) [V1.1]

Contract frozen 2026-11-03 (V11-01); the app (V11-02) uses it: an alert tap opens `/items/{canonical_item_id}`, item detail's Alerts row opens the item and store mute switches (DA-7), and Settings → Alerts the on/off switch, the threshold and the muted list.

**When one is sent.** Confirming a receipt (scan + `PATCH status=confirmed`, or a manual entry) compares each of its prices with the item's 30-day rolling average: the item's earlier prices in the same unit and currency, dated in the 30 days up to the receipt's date, this receipt left out. Two lines of one item on one receipt count as one price, their mean. A change of at least the user's threshold (`GG_PRICE_ALERT_THRESHOLD_PERCENT`, default 10), up or down, sends an alert, when:
- the average has at least `GG_PRICE_ALERT_MIN_OBSERVATIONS` earlier prices (default 2);
- alerts are on, and neither the item nor the receipt's store is muted: a mute counts while its `muted_until` is null (forever) or later than the confirm's server time (UTC), so a confirm at or after it alerts as if unmuted, with no job to end it (PI-03 AC 12, DA-7). Nothing is sent afterwards for prices confirmed while muted;
- the item has not alerted in the user's cooldown: their `cooldown_days` (PI-03 AC 8, DA-4), or `GG_PRICE_ALERT_COOLDOWN_DAYS` (default 7) when they set none, on the server clock. The cooldown is read when the alert is claimed, so a changed one counts from the item's last alert, and shortening it never resends an alert that was held back (EC-PI 9). A muted item or store, or a change under the threshold, does not use up the cooldown.

Only a confirm alerts: editing a confirmed receipt later sends none. A failure in the price alert check is logged and never fails the confirm.

**The notification** (`GET /api/notifications`, and the push the existing pipeline sends). The copy follows the design (PI-03 AC 9, DA-4); push and in-app read the same title and body:
```json
{
  "type": "price_change",
  "title": "Organic Bananas up 20%",
  "body": "Organic Bananas at Loblaws: was $0.65/lb avg, now $0.78/lb",
  "data": "{\"canonical_item_id\": \"uuid\", \"store_id\": \"uuid\", \"item_name\": \"Organic Bananas\", \"store_name\": \"Loblaws\", \"direction\": \"up\", \"percent\": 20, \"old_average\": \"$0.65/lb\", \"new_price\": \"$0.78/lb\", \"recent_prices\": [0.65, 0.65, 0.78]}"
}
```
A drop reads "<Item> down N%" and its body ends " · stock-up worth it". `data` is a JSON string, as for every notification; `store_id` and `store_name` are null for a receipt with no store ("<Item>: was ... avg, now ..."). The body names the item, the store, the 30-day average, the new price and the percent (rounded, in the title); "/lb" follows the price for a measured unit. Since DA-4 `data` also carries what a Price alerts row shows (PI-03 AC 5), as it was sent: `item_name`, `store_name`, `direction` (`up`/`down`), the signed `percent`, `old_average` and `new_price` as shown, and `recent_prices`, the item's last like-for-like prices up to this one, oldest first (at most 8, the alerted price last). An alert sent before DA-4 has only `canonical_item_id` and `store_id`; the app then shows its title and body. Merging an item into another moves the user's alerts for it to the other's `canonical_item_id` (EC-PI 11), and a split leaves them as they are. The push's `data` is `{notification_id, type: "price_change", url: "/items/{canonical_item_id}", canonical_item_id, store_id}`, so a tap opens the item.

**The Price alerts list** (PI-03 AC 5): `GET /api/notifications?type=price_change&order=newest`. `type` keeps one kind of notification; `order` is `unread` (the default: unread first, then newest) or `newest` (by date alone; 422 otherwise). Paged as before (`page`, `per_page` up to 100); `total` counts the filtered list. Only the caller's own notifications.

### GET /api/items/price-alert-settings
```json
{
  "enabled": true,
  "threshold_percent": 10,
  "default_threshold_percent": 10,
  "cooldown_days": 7,
  "default_cooldown_days": 7,
  "muted_items": [{ "id": "uuid", "canonical_name": "Organic Bananas", "muted_until": "2026-12-01T17:00:00Z" }],
  "muted_stores": [{ "id": "uuid", "name": "Loblaws", "muted_until": null }]
}
```
`threshold_percent` and `cooldown_days` are the user's own, or the default when they have not set one. `muted_items` and `muted_stores` list live mutes only, each with `muted_until` (UTC; null is forever; DA-7): an ended mute is not listed (PI-03 AC 12).

### PUT /api/items/price-alert-settings
**Request:** any of `{ "enabled": false }`, `{ "threshold_percent": 15 }`, `{ "cooldown_days": 14 }`. A field left out stays as it is; `"threshold_percent": null` and `"cooldown_days": null` go back to the default. `threshold_percent` is 1–100 and `cooldown_days` an integer 1–30 (the app offers 1, 3, 7, 14 and 30; PI-03 AC 8); 422 otherwise. Returns the settings above.

### POST /api/items/{canonical_id}/mute · DELETE /api/items/{canonical_id}/mute
The `POST` is Premium (D8, PREM-02 AC 2): a free user gets `403 premium_required` (`feature` `price_alert_mute`); the `DELETE` stays open to everyone. 204. No price alerts for the item, or alerts again. Both are idempotent; another user's item is 404. Item detail (`GET /api/items/{canonical_id}`) carries `alerts_muted: bool` and `muted_until` (null when forever or not muted). Merging a muted item into another mutes the other; when both are muted the later end stays (forever is the latest), and an ended mute moves nothing (EC-PI 5). A mute or unmute and a merge of the same item run one after the other (each locks the item row first, DA-11): a mute that lands first is moved by the merge, and one that waited on a merge deleting its item is `404`.

**Timed mutes (PI-03 AC 10-12, DA-7).** Both mute `POST`s take an optional body `{ "until": "<ISO 8601 time>" }`. No body, or `"until": null`, mutes forever. A time with an offset is converted to UTC; one with none is taken as UTC; one not later than the server clock is `422`, as is a string that is not a time. Muting again replaces the time (a timed mute made forever, forever made timed, or an ended mute started again). The mute ends by itself at `until`. After Premium lapses, a timed mute runs to its end and can be removed, but changing its time is a mute `POST`, so `403 premium_required` (EC-PI 5). The app offers Forever, 1 week, 1 month and 3 months, counted on the phone's calendar.

### POST /api/stores/{store_id}/mute · DELETE /api/stores/{store_id}/mute
The `POST` is Premium (D8, PREM-02 AC 2): a free user gets `403 premium_required` (`feature` `price_alert_mute`); the `DELETE` stays open to everyone. 204. No price alerts for prices paid at the store, or alerts again. Idempotent. Muting a store the user has no receipt from is 404 (stores are shared across users); unmuting removes only the user's own mute and is never 404, so a mute whose receipts were since deleted and purged can still be undone. Store ids come from `GET /api/items/{canonical_id}/prices` (`observations[].store_id`), `/compare` or `GET /api/stores`.

**Mutes and merged stores (V11-05).** A mute covers the store as the user groups it ([Stores](#stores-normalization-and-merge-v11)): muting any store of a group mutes the whole group, and the mute is recorded on the group's store (`muted_stores` lists it once, with the group's id and name). Muting a group again replaces the user's other mutes inside it, so the group has one `muted_until` (DA-7). A muted store merged into another mutes the merged group. Unmuting a group removes every one of the user's mutes inside it. Unmerging leaves each mute on the store it was recorded on: a mute set on a store before it was merged stays with that store, and one set on the group stays with the group's store. A store mute or unmute and a store merge or unmerge of the same user run one after the other (both take the user's store-merge lock first, DA-11), so a mute or unmute of a group always acts on the group as the merge left it.

### Stores: normalization and merge [V1.1]

EC Price Intelligence 1 ("Loblaws" vs "Loblaws #1234" vs "REAL CANADIAN SUPERSTORE"), decision D3. Free, like the rest of price intelligence.

**Normalization, for everyone.** A store name is matched on its normalized form (at most 255 characters): casefolded, accents dropped, a branch marker at the very end dropped ("#1234", " - 1234", "Store 1234", "No. 12" with its period, "No #12", "Unit 7", "Location 3"; never "No 5" or "Number 9": "Cafe No 5" and "Diner Number 9" are names), punctuation turned into spaces, apostrophes removed. "Loblaws", "LOBLAWS #1234" and "Loblaws - 1234" are one store. Normalization favours precision, because stores are shared rows: two different stores grouped together could not be split by a user, while a missed group costs one manual merge. So a branch word inside a name stays ("Number 1 Chinese", "Unit 7 Cafe", "No. 12 Bakery" are not "Chinese", "Cafe", "Bakery"), and a bare trailing number always stays ("Bar 1802", "Pizza 1990", "Bodega 101", "Forever 21", "Costco 2", and also "LOBLAWS 1234" and "Dollarama 1000", which the user merges by hand). A new receipt joins the store row of its normalized name. Rows saved before normalization that now share a normalized name are kept (receipts keep pointing at their own row) and group under the oldest of them, which gives the group its id.

**Names never cross accounts.** A store row is shared and keeps the name its first receipt gave it, which can be another user's. So a receipt carries its own `store_name` (`receipts.store_name`): the name printed on it, or the user's correction (`PATCH /api/receipts/{id}` with `store_name` keeps the corrected text even when it normalizes to the same row). Receipt detail, history, its `store` filter (a substring of those names), Recently Deleted and the export's `receipts[].store_name` read it. Wherever a store group is named (store list, `/prices`, `/compare`, item `latest_price`, alert bodies, `muted_stores`, the export's price rows) the name is the one on the user's own oldest receipt of that store. A merge saves the user's names for both stores, and a mute the user's name for its store, so once the user's receipts there are purged the group keeps the saved name; the row's name shows only for a store the user has neither a receipt nor a saved name for.

**A user's merge, for that user only.** A different banner ("REAL CANADIAN SUPERSTORE") is joined by the user: their prices of the merged store group under the other everywhere stores group prices: `GET /api/items` and item detail (`store_count`, `latest_price.store_name`), `/prices` (`store_id`, `store_name`, `store_count`, and the `store` filter, which takes any store of a group and returns the whole group), `/compare` (one row per group, counted once in `stores_below_minimum`), price alert bodies, store mutes (above) and the data export's `price_observations[].store_name`. A receipt keeps its own store name (above): a merge does not change receipt detail, history, its `store` filter or the export's `receipts[].store_name`. Shared store rows are never renamed or joined, and another user's merges never change this user's grouping.

### GET /api/stores
The user's stores, as their prices group them, by name. Only stores on receipts the user has not deleted.
```json
{
  "stores": [
    { "id": "uuid", "name": "Loblaws", "receipt_count": 4,
      "merged_stores": [{ "id": "uuid", "name": "REAL CANADIAN SUPERSTORE" }] }
  ]
}
```
`id` is the group's store; `merged_stores` are the stores the user merged into it.

### POST /api/stores/{store_id}/merge
**Request:** `{ "into_store_id": "uuid" }`. The store, and any store already merged into it, now group under `into_store_id`'s group, which keeps its name. Groups stay one level deep. Returns `GET /api/stores`. 404 when either store is not one the user has a receipt from that is not deleted (a branch of one they have counts; so does muting a store); 409 when the two already group as one (including a store into itself); 422 without `into_store_id`. Records `store_merged`.

### DELETE /api/stores/{store_id}/merge
204. Undo the merge of this store (an id from `merged_stores`): its prices group on their own again. Stores merged into it before it was merged moved to the target then, and stay there. Idempotent, and never 404: it removes only the user's own merge. Records `store_unmerged`.

### GET /api/items/{canonical_id}/compare
Cross-store comparison (PI-04): the item's latest and average unit price at each store the user has bought it from, cheapest first. The app re-orders the rows by latest price (ties: average, then name), badges the first CHEAPEST, and shows "Save by switching", the highest latest price less the lowest, when 2 or more stores differ (PI-04 AC 5–7, EC-PI 10, DA-10). Premium (D8, PREM-02 AC 1): a free user gets `403 premium_required` (`feature` `price_comparison`).

**Response:**
```json
{
  "item": { "id": "uuid", "canonical_name": "Organic Bananas" },
  "unit_of_measure": "lb",
  "currency": "USD",
  "min_observations": 2,
  "stores": [
    { "store_id": "uuid", "store_name": "FreshCo", "latest_price": 0.71, "latest_date": "2026-03-05", "avg_price": 0.70, "observation_count": 2 },
    { "store_id": "uuid", "store_name": "Loblaws", "latest_price": 0.81, "latest_date": "2026-03-06", "avg_price": 0.80, "observation_count": 2 }
  ],
  "stores_below_minimum": 1
}
```
- **Like for like:** `unit_of_measure` and `currency` are those of most of the item's prices, as in `/prices`. Only prices in that unit and currency count toward `latest_price`, `avg_price` and `observation_count` (edge case "unit price ambiguity"; no currency conversion).
- **Stores:** only stores on the user's own receipts that are not deleted (AC 3). A price from a receipt with no store is left out. A store needs `min_observations` like-for-like prices to be listed; `stores_below_minimum` counts the stores with fewer, so the app can say why one is missing.
- **Order:** cheapest first by `avg_price`, then by `latest_price`, then by name. `latest_price` is the price on the newest receipt date at that store; `avg_price` is the plain mean of its prices, rounded to the cent.
- **Empty:** `stores` is `[]` when no store has enough prices; the item still answers 200. Another user's or an unknown item answers 404.

## Household [V1.5]

### POST /api/households
Create household. Requesting user becomes admin.

### POST /api/households/{id}/invite
**Request:** `{ "email": "member@example.com", "role": "contributor" }`

## Meal Planner [V2.0]

### GET /api/pantry
Current pantry contents with freshness status.

### GET /api/recipes/suggestions?dietary=vegetarian&max_prep_time=30
Recipe suggestions ranked by pantry overlap and expiry urgency.

**Response:**
```json
{
  "suggestions": [
    {
      "recipe_id": "uuid",
      "name": "Chicken Stir Fry",
      "match_score": 0.85,
      "matched_ingredients": 6,
      "total_ingredients": 7,
      "missing": ["garlic"],
      "has_expiring_ingredient": true
    }
  ]
}
```

### POST /api/shopping-list/generate
**Request:** `{ "recipe_ids": ["uuid1", "uuid2"], "servings_override": { "uuid1": 4 } }`

Returns consolidated shopping list minus pantry stock.
