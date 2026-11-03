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

- **Deleted:** the user row (profile, preferences, password hash, Apple and Google subject IDs), all receipts (soft-deleted ones too), their line items and corrections, budgets and the alerts sent for them, notifications, push tokens, item mappings, the user's own categories, sign-in activity (`auth_events`, including failed sign-ins logged under the account's email), analytics events (`analytics_events`), and each receipt's image, converted JPEG, and thumbnail files.
- **Kept:** stores (shared by all users, with no user link) and the default categories.
- **Sessions:** the calling token's family is revoked. Every other token of the account fails too, because its user no longer exists (`/me` returns 401, `/api/auth/refresh` returns 400 `invalid_token`).
- **Idempotent:** image files go first (a missing file is fine), then all rows in one transaction. A run cut off before the commit leaves the account in place, so the user can call again. A second call after success returns 401: its token no longer resolves to a user.
- **Sign in with Apple** (TN3194): the server keeps no Apple token, so an account with an Apple ID signs in with Apple again, and the app sends the new authorization code. The server exchanges the code, checks that it is the account's Apple ID, and calls `https://appleid.apple.com/auth/revoke` with the refresh token (or the access token when Apple returns none). Only then does it delete. Each failure stops the deletion, and nothing is deleted:
  - `409 apple_reauth_required`: an Apple account sent no code. The app shows the Apple sheet and retries.
  - `403 apple_account_mismatch`: the code is for a different Apple ID.
  - `502 apple_revoke_failed`: the exchange or the revoke call failed, or Apple could not be reached.

## Price Intelligence [V1.1]

Built: PI-01 (price history), PI-02 (item matching) and PI-04 (cross-store comparison, backend). Every route is the signed-in user's own data; another user's item, alias or suggestion answers 404.

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
