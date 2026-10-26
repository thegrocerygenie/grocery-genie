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
      { "id": "item-uuid", "name": "Organic Bananas", "quantity": 1.105, "unit_price": 280.00, "total_price": 309.40, "category_id": "cat-uuid", "category_confidence": 0.92, "extraction_confidence": 0.88 }
    ],
    "subtotal": 609.40,
    "confidence": 0.85,
    "store_name_confidence": 0.95,
    "date_confidence": 0.90,
    "total_confidence": 0.88
  }
}
```

- `store_name_confidence`, `date_confidence`, and `total_confidence` are 0.0–1.0, or `null` when the model gave no score. The review screen flags each one below 0.7. A future or unreadable date gives a `date_confidence` of 0.5 or less.

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
Spending dashboard (BC-04): the budget summary above, the top 10 items, a 3-month trend (oldest first, ending at `period`), and a month-over-month comparison per category. `category_changes` lists every category with spend in `period` or `previous_period`, largest current spend first; uncategorized spend is left out. Each top item carries the category that holds most of its spend (`category_id` and `category_name` are null when uncategorized). Each trend month splits its `spent` into `categories`, largest first; uncategorized spend is kept there (`category_id` null, name "Uncategorized") so the parts add up to `spent`.

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
  "previous_period": "2026-02",
  "category_changes": [
    { "category_id": "uuid", "name": "Groceries", "spent": 30.0, "previous_spent": 20.0 }
  ]
}
```

## Price Intelligence [V1.1]

### GET /api/items/{canonical_id}/prices?store=...&from=...&to=...
Price observations for a canonical item.

### GET /api/items/{canonical_id}/compare
Cross-store comparison.

**Response:**
```json
{
  "item": "Organic Bananas",
  "stores": [
    { "store_name": "Store A", "latest_price": 1.29, "avg_price": 1.35, "observation_count": 12 }
  ]
}
```

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
