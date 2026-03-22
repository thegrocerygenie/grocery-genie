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
    "confidence": 0.85
  }
}
```

### GET /api/receipts/{id} [MVP]
Full receipt data including extraction, corrections, and original image URL.

### PATCH /api/receipts/{id} [MVP]
Submit user corrections. Accepts partial updates. Triggers correction event recording.

**Request:**
```json
{ "items": [{ "id": "item-uuid", "name": "corrected name", "category_id": "cat-uuid" }], "status": "confirmed" }
```

### GET /api/receipts?page=1&per_page=20&store=...&from=...&to=... [MVP]
Paginated receipt history with optional filters.

## Budget

### POST /api/budgets [MVP]
Create a budget.

**Request:**
```json
{ "category_id": "cat-uuid | null", "amount": 500.00, "period_type": "monthly", "period_start": "2026-03-01" }
```

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
