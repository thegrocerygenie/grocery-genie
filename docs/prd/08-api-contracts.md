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

### GET /api/budgets [MVP]
The user's active budgets, overall first. Response: a list of `{ "id", "category_id", "amount", "period_type", "period_start", "rollover_enabled" }`.

### PATCH /api/budgets/{id} [MVP]
Edit a budget; takes effect immediately. `period_start` is optional and moves the start day.

**Request:**
```json
{ "amount": 650.00, "period_start": "2026-03-15" }
```

### DELETE /api/budgets/{id} [MVP] · POST /api/budgets/{id}/restore [MVP]
Soft-delete, and restore within 30 days. Restore returns 409 when the category already has another active budget.

### GET /api/budgets/summary?period=2026-02 [MVP]
Budget vs. actual for specified period.

**Response:**
```json
{
  "period": "2026-02",
  "overall": { "budget": 500, "spent": 387.42, "remaining": 112.58, "percent": 77.5 },
  "categories": [
    { "category_id": "uuid", "name": "Groceries", "budget": 300, "spent": 245.10, "percent": 81.7 }
  ]
}
```

### GET /api/dashboard/spending?period=2026-03 [MVP]
Spending dashboard (BC-04): the budget summary above, the top 10 items, a 3-month trend (oldest first, ending at `period`), and a month-over-month comparison per category. `category_changes` lists every category with spend in `period` or `previous_period`, largest current spend first; uncategorized spend is left out. `prior_average` is the mean monthly spend over the 3 months before the trend window (0.0 when there was none), for comparing with the trend's own average. `has_receipts` is true when the user has any receipt outside Recently Deleted, in any period; the app shows its first-scan state only when it is false. Each top item carries the category that holds most of its spend (`category_id` and `category_name` are null when uncategorized). Each trend month splits its `spent` into `categories`, largest first; uncategorized spend is kept there (`category_id` null, name "Uncategorized") so the parts add up to `spent`.

**Response:**
```json
{
  "period": "2026-03",
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
  "has_receipts": true
}
```

**`months` [V1.1].** `?months=3|12` sets the trend length (default `3`; `GET /api/dashboard/spending?period=2026-03&months=12`). With `12`, `trend` holds the 12 months ending at `period`, oldest first, and `prior_average` covers the 12 months before them; the rest of the response is unchanged. Any other value returns `422`.

The 12-month trend is Premium (decision D2). A free user asking for `months=12` gets `403`, which the app turns into an upgrade prompt, never an error screen:

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

- **Deleted:** the user row (profile, preferences, password hash, Apple and Google subject IDs), all receipts (soft-deleted ones too), their line items and corrections, budgets and the alerts sent for them, notifications, push tokens, price alert cooldowns and mutes (`price_alerts_sent`, `price_alert_item_mutes`, `price_alert_store_mutes`), the RevenueCat webhook events matched to the account (`revenuecat_events`), item mappings, the user's own categories, sign-in activity (`auth_events`, including failed sign-ins logged under the account's email), analytics events (`analytics_events`), and each receipt's image, converted JPEG, and thumbnail files.
- **Kept:** stores (shared by all users, with no user link) and the default categories.
- **Not cancelled:** an App Store Premium subscription. Apple bills it until the user cancels it in iOS Settings; the delete screen says so.
- **Sessions:** the calling token's family is revoked. Every other token of the account fails too, because its user no longer exists (`/me` returns 401, `/api/auth/refresh` returns 400 `invalid_token`).
- **Idempotent:** image files go first (a missing file is fine), then all rows in one transaction. A run cut off before the commit leaves the account in place, so the user can call again. A second call after success returns 401: its token no longer resolves to a user.
- **Sign in with Apple** (TN3194): the server keeps no Apple token, so an account with an Apple ID signs in with Apple again, and the app sends the new authorization code. The server exchanges the code, checks that it is the account's Apple ID, and calls `https://appleid.apple.com/auth/revoke` with the refresh token (or the access token when Apple returns none). Only then does it delete. Each failure stops the deletion, and nothing is deleted:
  - `409 apple_reauth_required`: an Apple account sent no code. The app shows the Apple sheet and retries.
  - `403 apple_account_mismatch`: the code is for a different Apple ID.
  - `502 apple_revoke_failed`: the exchange or the revoke call failed, or Apple could not be reached.

## Premium [V1.1]

Premium ($5.99/month, decision D1) is an App Store subscription sold through RevenueCat. The backend trusts only RevenueCat for it: the webhook below and RevenueCat's REST API, never the app. Premium gates only the V1.1 extras (D2): the 12-month trend, custom categories, data export, budget rollover, and unlimited receipts. A free user asking for the trend, custom categories, export or rollover gets `403 premium_required` (above). The receipt cap is the one exception: a free user past it gets `429 receipt_quota_exceeded` (below), because the scan itself stays free.

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

Everything else in price intelligence stays free (D2): price history, item matching, price alerts and cross-store comparison answer a free user `200`.

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

### GET /api/users/me/export?format=json|csv

Data export (NFR Privacy 2), Premium (D2). A free user gets `403 premium_required` with `"feature": "data_export"`; an unknown `format` is `422`. `format` defaults to `json`.

**Scope:** the signed-in user's own receipts, line items, budgets and price observations, as every other read (households arrive in V1.5). Deleted receipts and budgets are left out, and so are the line items and prices of a deleted receipt. Receipts of every status are included, with their `status`.

**Response** `200`, as a download (`Content-Disposition: attachment; filename="grocery-genie-export-YYYY-MM-DD.json"` or `.zip`, `Cache-Control: no-store`):

- `json` (`application/json`): one document. Receipts are oldest first, each with its line items in receipt order.
  ```json
  {
    "format_version": 1,
    "exported_at": "2026-11-03T10:00:00Z",
    "currency": "USD",
    "receipts": [
      { "id": "uuid", "date": "2026-03-01", "store_name": "FreshCo", "store_location": null,
        "subtotal": 4.88, "tax": 0.0, "total": 4.88, "currency": "USD", "status": "confirmed",
        "created_at": "2026-03-01T12:00:00Z",
        "line_items": [
          { "id": "uuid", "receipt_id": "uuid", "position": 0, "name": "ORG BANANAS",
            "quantity": 2.0, "unit_price": 0.69, "total_price": 1.38, "unit_of_measure": "lb",
            "category": "Groceries", "canonical_item_id": "uuid", "canonical_item_name": "ORG BANANAS",
            "corrected": false } ] } ],
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
  A budget's `category` is null for the overall budget. `currency` is the budget currency (`currency_preference`).
- `csv` (`application/zip`): `receipts.csv`, `line_items.csv` (with `receipt_id`), `budgets.csv` and `price_observations.csv`, with the same columns as the JSON. UTF-8 with a byte order mark, so Excel reads accented names; money has two decimals, quantities three. A text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a spreadsheet does not run it as a formula (CSV injection). JSON values are not escaped.

**Large accounts:** rows are read 500 at a time (keyset pages) into a spooled temporary file, in memory up to 8 MB and on disk past that, which is then streamed with its `Content-Length`. Memory stays bounded however many receipts there are, and the database work is done before the first byte is sent.

Records `data_exported` (12-analytics.md). The 300 reads/minute limit applies.

## Price Intelligence [V1.1]

Built: PI-01 (price history), PI-02 (item matching), PI-03 (price change alerts, below) and PI-04 (cross-store comparison), backend and app. Every route is the signed-in user's own data; another user's item, alias or suggestion answers 404.

Confirming a receipt (scan + `PATCH status=confirmed`, or a manual entry) links each line to a canonical item and records its price. `LineItemResponse` carries `canonical_item_id`. Matching: exact alias → fuzzy (mean of Jaro-Winkler and Levenshtein on word-sorted names, ≥0.85 links) → semantic (embedding cosine, ≥0.80 links) → new item, with a suggestion for the user when the best candidate scored ≥0.6. Names whose numbers differ ("milk 1%" / "milk 2%") never match by similarity.

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
      "latest_price": { "unit_price": 0.79, "unit_of_measure": "lb", "currency": "USD", "date": "2026-03-12", "store_name": "Loblaws" }
    }
  ],
  "total": 1, "page": 1, "per_page": 20,
  "pending_suggestions": 2
}
```

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
    { "receipt_id": "uuid", "date": "2026-03-01", "store_id": "uuid", "store_name": "FreshCo", "unit_price": 0.69, "quantity": 2.0, "unit_of_measure": "lb", "currency": "USD", "in_timeline": true }
  ]
}
```
`unit_of_measure` and `currency` are those of most of the item's prices; a price in another unit or currency has `in_timeline: false` (listed, not plotted). `has_timeline` is false until the timeline has `min_points` prices (PI-01 AC 4).

### PATCH /api/items/{canonical_id}
**Request:** `{ "canonical_name": "Organic Bananas" }` → item detail.

### POST /api/items/{canonical_id}/merge
**Request:** `{ "into_item_id": "uuid" }`. The item's aliases, lines and prices move to `into_item_id`, which is returned; the item is deleted. 409 when merging an item into itself.

### POST /api/items/{canonical_id}/aliases/{alias_id}/split
201 with the new item: the alias, its lines and their prices. 409 when it is the item's only alias.

### GET /api/items/suggestions
Pending suggestions: `[{ "id", "item": {id, canonical_name}, "suggested_item": {id, canonical_name}, "confidence", "method" }]`.

### POST /api/items/suggestions/{id}/accept
Same product: merges `item` into `suggested_item` and returns it. 409 when already resolved.

### POST /api/items/suggestions/{id}/reject
204. Different products: both items stay.

### Price change alerts (PI-03) [V1.1]

Contract frozen 2026-11-03 (V11-01); the app (V11-02) uses it: an alert tap opens `/items/{canonical_item_id}`, item detail has the item and store mute switches, and Settings → Alerts the on/off switch, the threshold and the muted list.

**When one is sent.** Confirming a receipt (scan + `PATCH status=confirmed`, or a manual entry) compares each of its prices with the item's 30-day rolling average: the item's earlier prices in the same unit and currency, dated in the 30 days up to the receipt's date, this receipt left out. Two lines of one item on one receipt count as one price, their mean. A change of at least the user's threshold (`GG_PRICE_ALERT_THRESHOLD_PERCENT`, default 10), up or down, sends an alert, when:
- the average has at least `GG_PRICE_ALERT_MIN_OBSERVATIONS` earlier prices (default 2);
- alerts are on, and neither the item nor the receipt's store is muted;
- the item has not alerted in the last `GG_PRICE_ALERT_COOLDOWN_DAYS` (default 7, on the server clock). A muted item or store, or a change under the threshold, does not use up the cooldown.

Only a confirm alerts: editing a confirmed receipt later sends none. A failure in the price alert check is logged and never fails the confirm.

**The notification** (`GET /api/notifications`, and the push the existing pipeline sends):
```json
{
  "type": "price_change",
  "title": "Organic Bananas price up 20%",
  "body": "Organic Bananas: $0.78/lb at Loblaws, up 20% from your 30-day average of $0.65/lb.",
  "data": "{\"canonical_item_id\": \"uuid\", \"store_id\": \"uuid\"}"
}
```
`data` is a JSON string, as for every notification; `store_id` is null for a receipt with no store. The body names the item, the store, the 30-day average, the new price and the percent (rounded); "/lb" follows the price for a measured unit. The push's `data` is `{notification_id, type: "price_change", url: "/items/{canonical_item_id}", canonical_item_id, store_id}`, so a tap opens the item.

### GET /api/items/price-alert-settings
```json
{
  "enabled": true,
  "threshold_percent": 10,
  "default_threshold_percent": 10,
  "cooldown_days": 7,
  "muted_items": [{ "id": "uuid", "canonical_name": "Organic Bananas" }],
  "muted_stores": [{ "id": "uuid", "name": "Loblaws" }]
}
```
`threshold_percent` is the user's own, or the default when they have not set one.

### PUT /api/items/price-alert-settings
**Request:** `{ "enabled": false }`, `{ "threshold_percent": 15 }`, or both. A field left out stays as it is; `"threshold_percent": null` goes back to the default. `threshold_percent` is 1–100 (422 otherwise). Returns the settings above.

### POST /api/items/{canonical_id}/mute · DELETE /api/items/{canonical_id}/mute
204. No price alerts for the item, or alerts again. Both are idempotent; another user's item is 404. Item detail (`GET /api/items/{canonical_id}`) carries `alerts_muted: bool`. Merging a muted item into another mutes the other.

### POST /api/stores/{store_id}/mute · DELETE /api/stores/{store_id}/mute
204. No price alerts for prices paid at the store, or alerts again. Idempotent. Muting a store the user has no receipt from is 404 (stores are shared across users); unmuting removes only the user's own mute and is never 404, so a mute whose receipts were since deleted and purged can still be undone. Store ids come from `GET /api/items/{canonical_id}/prices` (`observations[].store_id`).

### GET /api/items/{canonical_id}/compare
Cross-store comparison (PI-04): the item's latest and average unit price at each store the user has bought it from, cheapest first.

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
