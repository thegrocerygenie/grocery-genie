# System Architecture Concepts

Logical architecture: service boundaries, event flows, integration points. No specific hosting, messaging, or database technologies prescribed.

## Service Boundaries

| Service | Responsibility | Phase |
|---------|---------------|-------|
| **Receipt Ingestion** | Accept images, orchestrate vision model extraction, validate, store. Publishes `ReceiptConfirmed`. | MVP |
| **Budget** | Manage budgets, compute spending aggregates, evaluate thresholds. Publishes `BudgetThresholdBreached`. | MVP |
| **Notification** | Consume threshold/alert events, manage preferences, deliver push + email. | MVP |
| **Category** | Manage taxonomy (default + custom), apply LLM categorization, maintain override dictionaries. | MVP |
| **Item Matching** | Normalize names, manage canonical registry, run fuzzy + semantic matching. Publishes `ItemMatched`. | V1.1 |
| **Price Intelligence** | Store observations, compute averages, detect changes, generate comparisons. | V1.1 |
| **Household** | Manage membership, roles, invitations. Enforce shared data access control. | V1.5 |
| **Pantry** | Maintain ingredient inventory, calculate shelf life, track freshness. Publishes `IngredientExpiring`. | V2.0 |
| **Recipe** | Manage recipe database, run matching against pantry, generate shopping lists. | V2.0 |
| **Community** | Aggregate anonymized price data, enforce privacy thresholds, serve community queries. | V2.5 |

## Event-Driven Architecture

Downstream features react to domain events asynchronously. This decouples services and enables phase-by-phase feature additions without modifying earlier services.

### Core Domain Events

| Event | Published By | Consumed By | Payload |
|-------|-------------|-------------|---------|
| `ReceiptConfirmed` | Receipt Ingestion | Budget, Item Matching, Pantry, Price Intelligence | receipt_id, user_id, household_id, store_id, date, line_items[] |
| `ItemCorrected` | Receipt Ingestion | Category, Item Matching | line_item_id, field, old_value, new_value, user_id |
| `BudgetThresholdBreached` | Budget | Notification | user_id, budget_id, threshold_percent, current_spend, budget_amount |
| `ItemMatched` | Item Matching | Price Intelligence | line_item_id, canonical_item_id, match_confidence, match_method |
| `PriceChangeDetected` | Price Intelligence | Notification | canonical_item_id, store_id, old_avg, new_price, percent_change |
| `IngredientExpiring` | Pantry | Notification, Recipe | pantry_item_id, ingredient_name, estimated_expiry, days_remaining |
| `RecipeCooked` | Recipe | Pantry | recipe_id, ingredients_used[] |

## LLM Integration Architecture

All LLM interactions go through LiteLLM as the provider-agnostic abstraction layer. Backend model swappable without code changes.

**Three model types used:**
- **Vision model** (receipt image → structured JSON): Receipt Ingestion Service, called via LiteLLM. Default: Claude Sonnet.
- **Text model** (category assignment, ingredient classification, recipe variations): Category, Pantry, Recipe services. Default: Claude Sonnet.
- **Embedding model** (semantic similarity, search): Item Matching, Search services (V1.1+, via sentence-transformers + pgvector)

**All LLM calls include:**
- System prompt versioning (prompts stored in `backend/app/llm/prompts/` as versioned Python modules)
- Temperature = 0 for extraction tasks
- Pydantic model validation on all structured outputs before persistence
- Fallback to manual/rule-based processing if LLM unavailable or returns invalid output
- Logging of prompt version, input hash, latency, and token usage for every call

## Offline & Sync Architecture

Mobile client supports offline receipt capture with eventual sync:

- Receipt images stored locally if network unavailable.
- Local queue tracks pending uploads. Sync resumes on connectivity.
- Pending receipts visible in app with "Pending sync" indicator.
- Budget totals include pending receipts (optimistic local calculation). Server totals authoritative after sync.

## Data Pipeline (5-Stage)

All features flow from the same receipt ingestion pipeline:

1. **Capture** — User photographs or uploads receipt image
2. **Extract** — Vision model processes image into raw text/observations
3. **Structure** — LLM parses raw output into clean structured JSON via prompt engineering
4. **Enrich** — Application layer categorizes, validates, cross-references, stores
5. **Act** — Downstream features consume structured data (analytics, alerts, recipes)

Stages 1–3 are the AI-powered ingestion layer. Stages 4–5 diverge per feature domain.
