# Phase Scope — Current Build Phase: MVP

## Active Phase: MVP (Budget Copilot)

The MVP validates one hypothesis: **users will habitually scan grocery receipts if the payoff is immediate budget visibility.** Everything in the MVP serves this hypothesis. If a feature doesn't contribute to receipt scanning adoption or budget awareness, it belongs in a later phase.

## Phase Roadmap

| Phase | Name | Focus | Entry Criteria |
|-------|------|-------|----------------|
| **MVP** | Budget Copilot | Receipt scanning + budget tracking | None (initial release) |
| V1.1 | Price Intelligence | Item normalization, price history, alerts | MVP extraction accuracy ≥90%, ≥1,000 confirmed receipts |
| V1.5 | Household | Multi-member sharing | V1.1 item matching precision ≥80%, Premium tier launched |
| V2.0 | Meal Planner | Ingredient classification, pantry, recipes | V1.5 stable, recipe database curated |
| V2.5 | Intelligence | Basket comparison, smart lists, community | V2.0 stable, ≥10K canonical items |
| V3.0 | Advanced | LLM recipe gen, taste profiles, semantic search | V2.5 stable, sufficient interaction data |

## Explicitly IN MVP Scope

- Camera-based receipt scanning with edge detection and quality feedback
- Vision model extraction to structured data with confidence scoring
- User review and correction UI with correction feedback recording
- Photo library / file upload as alternative to camera
- 8 default spending categories with LLM-based assignment
- User category correction with per-user mapping persistence
- Monthly budgets (overall and per-category) with threshold alerts
- Spending dashboard (current month, category breakdown, top items, 3-month trend)
- Weekly spending summary notification
- Receipt history with search
- Multi-language receipt support (extraction layer)
- Offline receipt capture with sync queue

## Explicitly OUT of MVP Scope

- Price history, price alerts, cross-store comparison → **V1.1**
- Item normalization and canonical item matching → **V1.1**
- Custom categories beyond default 8 → **V1.1 (Premium)**
- Data export → **V1.1+ (Premium)**
- Household sharing, multi-member anything → **V1.5**
- Ingredient classification, pantry, recipes, shopping lists → **V2.0**
- Community features, basket comparison, personal inflation → **V2.5**
- Semantic search, LLM recipe variations, taste profiles → **V3.0**

## How to Use Phase Tags

Every user story, requirement, and data entity in the PRD docs is tagged with its phase (e.g., `[MVP]`, `[V1.1]`). When working on the current phase:

1. Build everything tagged with the current phase.
2. Read later-phase docs for context and dependency awareness only.
3. Design data models and interfaces to accommodate later phases without building them.
4. Never implement a later-phase feature to "get ahead" — it causes scope creep and untested code paths.

## Resolved Tech Decisions for MVP

- **Mobile client:** React Native (Expo managed workflow), TypeScript strict, iOS-only target
- **Backend API:** Python 3.12+ with FastAPI, Pydantic v2, Celery + Redis for async tasks
- **Database:** PostgreSQL with pgvector extension, SQLAlchemy 2.0+ (async), Alembic for migrations
- **LLM provider:** Anthropic Claude Sonnet via LiteLLM (provider-agnostic, swappable via config)
- **Image processing:** Pillow + OpenCV for receipt quality assessment
- **Monetization:** MVP is fully free. No payment/subscription infrastructure in MVP.

All open questions have been resolved. See `OPEN_QUESTIONS.md` for the full decision log.

## Also Out of MVP Scope (Tech)

- Android build target (available from same codebase later)
- Payment/subscription infrastructure (V1.1)
- Local/on-device vision model (potential V1.1+ premium feature)
- Tablet-optimized layouts (stretch goal, not MVP)
- Vector embeddings / FAISS (V1.1 item matching — design the interface now, implement later)
- Fuzzy string matching beyond basic item name mapping (V1.1)
