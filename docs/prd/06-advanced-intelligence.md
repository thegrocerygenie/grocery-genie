# Epic: Advanced Intelligence [V2.5–V3.0]

Advanced analytical features leveraging accumulated data from earlier phases.

## User Stories

### AI-01: Basket Comparison [V2.5]
**As a** user, **I want to** see a basket-level price comparison across stores, **so that** I know which store is cheapest for my typical weekly shop overall.

**Acceptance Criteria:**
1. Auto-detected "typical basket" from items purchased in 3+ of last 5 trips.
2. Full basket priced at each store using most recent recorded prices.
3. Total cost per store + potential savings vs. cheapest.

### AI-02: Personal Inflation Index [V2.5]
**As a** user, **I want to** see a personal inflation index based on my actual purchases, **so that** I understand how price changes affect me personally.

**Acceptance Criteria:**
1. Month-over-month and year-over-year weighted price change across regularly-bought items.
2. Weights based on purchase frequency and spend share.
3. Optional comparison overlay with published CPI grocery sub-index.

### AI-03: LLM Recipe Variations [V3.0]
**As a** user, **I want to** get LLM-generated recipe variations based on available substitutions, **so that** I can still cook when missing 1–2 ingredients.

**Acceptance Criteria:**
1. Substitution suggestions are LLM-generated with nutritional awareness.
2. User accepts/rejects each substitution before generating modified recipe.
3. Substitution quality feedback (user rating) improves future suggestions.

### AI-04: Food Waste Score [V3.0]
**As a** user, **I want to** see a weekly food waste score, **so that** I can track improvement.

**Acceptance Criteria:**
1. Percentage of purchased items used vs. expired/discarded.
2. Weekly trend visualization.
3. Comparative benchmark once community data allows.

### AI-05: Restock Reminders [V2.5]
**As a** user, **I want to** get reminders to restock recurring staples, **so that** I never run out.

**Acceptance Criteria:**
1. Detects purchase frequency patterns (e.g., "milk every 8–10 days").
2. Push notification when estimated restock date approaching.
3. User can confirm, snooze, or disable per item.

### AI-06: Semantic Search [V3.0]
**As a** user, **I want to** search across all my receipts and recipes by keyword or ingredient, **so that** I can quickly find information.

**Acceptance Criteria:**
1. Full-text and semantic search across receipts, pantry, recipes.
2. Supports natural language ("How much have I spent on coffee this year?").
3. Powered by embedding-based retrieval.

## Functional Requirements

### Basket Comparison [V2.5]
- Auto-detected typical basket: items in 3+ of last 5 trips.
- Basket pricing: sum of most-recent unit prices × typical quantities per store.
- Stores ranked by total cost. Savings displayed vs. cheapest.

### Personal Inflation Index [V2.5]
- Weighted price change: items weighted by spend share.
- MoM and YoY indexes.
- Displayed as single number with drill-down to item-level contributors.

### Community Price Sharing [V2.5]
- Opt-in anonymized contributions: price observations stripped of identity, pooled regionally.
- Contributors gain access to community data for items they haven't purchased.
- Aggregation: median with count and date range. Minimum 5 contributions before surfacing.
- No individual purchase histories exposed.

### Recurring Staple Prediction [V2.5]
- Interval analysis on purchase dates. Minimum 3 purchases to establish pattern.
- Restock reminder push notification at estimated date.

### LLM Recipe Variations [V3.0]
- Near-match recipes: LLM generates substitution suggestions with nutritional impact.
- User accepts/rejects; accepted substitutions generate modified recipe.

### Semantic Search [V3.0]
- Natural language queries across receipts, pantry, recipes.
- Embedding-based retrieval over structured data.
