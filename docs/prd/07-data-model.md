# Data Model Concepts

Technology-agnostic entity model. Describes entities, relationships, and access patterns. No specific database prescribed.

## Core Entities

| Entity | Key Attributes | Relationships | Phase |
|--------|---------------|---------------|-------|
| **User** | id, email, name, locale, currency_preference, created_at | Has many Receipts; belongs to 0–1 Household; has many UserItemMappings | MVP |
| **Household** | id, name, created_by, created_at | Has many HouseholdMembers; has many Receipts (via members) | V1.5 |
| **HouseholdMember** | household_id, user_id, role (admin/contributor/viewer), joined_at | Belongs to Household and User | V1.5 |
| **Receipt** | id, user_id, household_id (nullable), store_id, date, subtotal, tax, total, currency, image_url, extraction_confidence, status (pending/confirmed), created_at | Belongs to User; has many LineItems; belongs to Store | MVP |
| **LineItem** | id, receipt_id, raw_name, canonical_item_id (nullable), quantity, unit_price, total_price, unit_of_measure, category_id, category_confidence, corrected (bool) | Belongs to Receipt; belongs to CanonicalItem; belongs to Category | MVP |
| **Category** | id, name, is_default (bool), user_id (nullable for defaults), sort_order | Has many LineItems | MVP |
| **Store** | id, name, normalized_name, location (optional) | Has many Receipts | MVP |
| **Budget** | id, user_id, household_id (nullable), category_id (nullable for overall), amount, period_start, period_type (monthly), rollover_enabled | Belongs to User or Household; optionally to Category | MVP |
| **CanonicalItem** | id, canonical_name, aliases[], unit_of_measure, created_at | Has many LineItems; has many PriceObservations | V1.1 |
| **PriceObservation** | canonical_item_id, store_id, date, unit_price, quantity, user_id | Belongs to CanonicalItem; belongs to Store | V1.1 |
| **UserItemMapping** | user_id, raw_text_pattern, canonical_item_id, category_id, confidence_override | Belongs to User; references CanonicalItem and Category | MVP |
| **Ingredient** | id, canonical_item_id, ingredient_name, category (produce/dairy/meat/pantry/etc.), default_shelf_life_days | Extends CanonicalItem | V2.0 |
| **PantryItem** | id, user_id, household_id, ingredient_id, quantity, unit, purchased_date, estimated_expiry, status (fresh/use_soon/expired/used/discarded) | Belongs to User/Household; belongs to Ingredient | V2.0 |
| **Recipe** | id, name, description, prep_time_min, cuisine, servings, dietary_labels[], source | Has many RecipeIngredients | V2.0 |
| **RecipeIngredient** | recipe_id, ingredient_id, quantity, unit, is_optional | Belongs to Recipe; belongs to Ingredient | V2.0 |

## Primary Access Patterns

| Pattern | Query Shape | Frequency | Phase |
|---------|------------|-----------|-------|
| User's receipts (history) | Receipts by user_id, ordered by date DESC, paginated | High (every app open) | MVP |
| Spending by category (dashboard) | Sum LineItem.total_price grouped by category_id, filtered by user_id + date range | High (dashboard load) | MVP |
| Budget vs. actual | Budget amount vs. spending sum for user_id + category_id + period | High (dashboard + alerts) | MVP |
| Item name resolution | UserItemMapping by user_id + raw_text_pattern (exact first, then fuzzy) | High (every extraction) | MVP |
| Price history for item | PriceObservations by canonical_item_id, optionally by store_id, ordered by date | Medium | V1.1 |
| Cross-store price comparison | Latest PriceObservation per store_id for a canonical_item_id | Medium | V1.1 |
| Household receipts | Receipts by household_id, ordered by date DESC | Medium | V1.5 |
| Pantry contents | PantryItems by user_id/household_id where status != used/discarded, ordered by estimated_expiry ASC | High (meal planner) | V2.0 |
| Recipe matching | Recipes where required ingredient_ids overlap with active PantryItem ingredient_ids | Medium | V2.0 |

## Multi-Tenancy Design

The schema supports household sharing from day one, even though features launch in V1.5:

- Every Receipt has `user_id` (who scanned) and optional `household_id` (which household).
- Household queries filter by `household_id`. Individual queries filter by `user_id`.
- Budgets exist at user level or household level, independently.
- When joining a household, existing receipts optionally migrated (user choice). When leaving, contributed receipts remain.
- Price observations shared within household regardless of which member scanned.
