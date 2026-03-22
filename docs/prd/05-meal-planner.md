# Epic: Meal Planner [V2.0]

Recipe suggestions grounded in what the user actually bought, with expiry-aware prioritization. Inverts the traditional meal planning workflow: shop first, plan meals after.

## User Stories

### MP-01: Ingredient Classification [V2.0]
**As a** user, **I want to** have my receipt items classified as cooking ingredients with normalized names, **so that** the app knows what's in my kitchen.

**Acceptance Criteria:**
1. LLM maps line items to normalized ingredients (e.g., "BNLS CHKN BRST 2LB" → "chicken breast, 2 lbs").
2. Includes quantity and unit extraction.
3. Non-food items excluded from pantry.
4. User can override any classification.

### MP-02: Virtual Pantry [V2.0]
**As a** user, **I want to** see a virtual pantry reflecting my recent purchases minus estimated consumption, **so that** I know what's available.

**Acceptance Criteria:**
1. Auto-populates from scanned receipts.
2. Shelf life by category (produce: 5–7 days, dairy: 7–14, pantry: 6+ months).
3. Visual indicators: green (fresh), amber (use soon), red (likely expired).
4. User can mark items as "used" or "discarded."
5. Pantry deducts ingredients when recipe marked as "cooked."

### MP-03: Recipe Suggestions [V2.0]
**As a** user, **I want to** receive recipe suggestions based on ingredients I currently have, **so that** I can cook without an extra shopping trip.

**Acceptance Criteria:**
1. Matching engine scores recipes by ingredient overlap with pantry.
2. Results grouped: "Full match" (all available), "Missing 1–2 items" (with list).
3. Minimum 500 curated recipes at launch.
4. Dietary filters: vegetarian, vegan, gluten-free, low-carb, dairy-free, nut-free.
5. Recipes using soon-to-expire ingredients prioritized.

### MP-04: Expiry Notifications [V2.0]
**As a** user, **I want to** receive push notifications when ingredients are about to expire, **so that** I use food before it wastes.

**Acceptance Criteria:**
1. Push 2 days before estimated expiry for perishables.
2. Includes ingredient name and 1–2 quick recipe suggestions.
3. Grouped if 3+ items expiring same day.
4. Snooze (1 day) or dismiss. Can mark as used from notification.

### MP-05: Smart Shopping List [V2.0]
**As a** user, **I want to** generate a shopping list from selected recipes minus pantry items, **so that** I only buy what I need.

**Acceptance Criteria:**
1. Select 1+ recipes, app generates consolidated ingredient list.
2. Pantry items with sufficient quantity auto-excluded.
3. User can add/remove from generated list.
4. Shareable via standard mobile share sheet.

## Functional Requirements

### Ingredient Classification [V2.0]
- LLM maps line items to normalized ingredient entities: {ingredient_name, quantity, unit, category (produce/dairy/meat/pantry/etc.)}.
- Non-food items excluded automatically.
- Ambiguous items flagged for user confirmation.
- Confirmed mappings stored per user, take priority on subsequent scans.

### Pantry Management [V2.0]
- Auto-populates on receipt confirmation with classified ingredients.
- Shelf life defaults by category. User override per item.
- States: Fresh (>3 days), Use Soon (1–3 days), Likely Expired (past estimate).
- Manual ops: Used, Partially Used (update qty), Discarded (waste tracking input).
- Duplicate detection: same ingredient from new receipt sums quantities, resets shelf life.

### Recipe Matching [V2.0]
- 500+ curated recipes tagged with ingredients, dietary labels, prep time, cuisine.
- Score = (matched / total required) × pantry freshness weight.
- Buckets: Full Match (100%), Near Match (75–99%), Partial Match (50–74%).
- Expiry-aware: recipes using nearest-to-expiry ingredients ranked higher.
- Filters: dietary, cuisine, prep time, servings.

### Shopping List Generation [V2.0]
- Generated from selected recipes: aggregated ingredients minus pantry.
- Quantities adjusted for servings.
- Editable and shareable (text format).

### Expiry Notifications [V2.0]
- Push 2 days before estimated expiry.
- Include ingredient name + up to 2 recipe suggestions.
- Batch: 3+ items same day → single grouped notification.
- Actionable: snooze (1 day), dismiss, mark as used.
