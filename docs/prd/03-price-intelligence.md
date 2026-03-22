# Epic: Price Intelligence [V1.1]

Longitudinal price tracking that accumulates passively from receipts already being scanned. No additional user effort beyond what MVP captures.

## User Stories

### PI-01: Price History [V1.1]
**As a** user, **I want to** see the price history of any item I've purchased, **so that** I know if prices are going up.

**Acceptance Criteria:**
1. Per-item price timeline showing every recorded price with date and store.
2. Visualized as line chart with data points per purchase.
3. Price displayed as unit price (per item, per kg, per lb as applicable).
4. Minimum 2 data points required before timeline shown.

### PI-02: Item Matching [V1.1]
**As a** user, **I want to** have the app recognize the same product across different receipt formats, **so that** my price history is accurate even when stores abbreviate names differently.

**Acceptance Criteria:**
1. Hybrid matching: vector embedding similarity + fuzzy string matching (Levenshtein, Jaro-Winkler).
2. High-confidence (≥0.85) auto-link; medium (0.6–0.85) prompt user confirmation; low (<0.6) treat as distinct.
3. User can manually link or unlink items.
4. Confirmed matches create canonical item name with aliases.

### PI-03: Price Change Alerts [V1.1]
**As a** user, **I want to** receive alerts when a regularly-purchased item has a significant price change, **so that** I can react to increases or stock up during drops.

**Acceptance Criteria:**
1. Alert triggers at ≥10% change from rolling average (configurable threshold).
2. Specifies item, store, old average, new price, percent change.
3. Cooldown period (default: 7 days per item) to avoid notification fatigue.
4. Mutable per item or per store.

### PI-04: Cross-Store Comparison [V1.1]
**As a** user, **I want to** compare prices for the same item across stores, **so that** I know which store is cheapest.

**Acceptance Criteria:**
1. Side-by-side pricing for selected item across all stores with recorded prices.
2. Shows most recent price and average price per store.
3. Only stores user has scanned from are shown.
4. Accessible from item detail view or dedicated comparison screen.

## Functional Requirements

### Item Normalization & Matching [V1.1]
- Canonical item registry: each unique product has canonical name + aliases.
- Matching pipeline: exact alias match → fuzzy string (Jaro-Winkler ≥0.85) → semantic similarity (vector cosine ≥0.80) → unmatched (new canonical item).
- User confirmation for medium-confidence matches (0.6–0.85).
- Merge/split: user can merge two canonical items or split a mismatch.

### Price Tracking [V1.1]
- Every confirmed line item creates a price observation: {canonical_item_id, store_id, date, unit_price, quantity, unit_of_measure}.
- Price timeline query: all observations for a canonical item, filterable by store and date range.
- Rolling average (7-day and 30-day windows) for change detection.

### Cross-Store Comparison [V1.1]
- Single-item: most recent and average price per store for a canonical item.
- Minimum 2 observations per store per item to be included.
