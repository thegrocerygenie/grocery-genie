# Codebase Structure

**Analysis Date:** 2026-04-19
**Layout:** Monorepo with two top-level applications (`backend/`, `mobile/`) plus shared product specs (`docs/prd/`) and tooling (`.claude/`, `.planning/`).

## Top-Level Tree

```
grocery-genie/
├── CLAUDE.md              # Project-wide Claude Code instructions (authoritative)
├── README.md              # Setup, API reference, architecture overview
├── .gitignore
├── .claude/
│   └── commands/          # Slash commands (validate, done, design-ui, verify-acceptance, …)
├── .planning/
│   └── codebase/          # This directory (codebase map)
├── docs/
│   └── prd/               # Product requirements — authoritative scope/contract
├── backend/               # Python 3.12 FastAPI service
└── mobile/                # React Native (Expo) iOS client
```

## Backend Layout (`backend/`)

```
backend/
├── main.py                     # FastAPI app entrypoint — CORS, lifespan, router includes
├── pyproject.toml              # Ruff, pytest, project metadata
├── alembic.ini                 # Alembic config (sqlalchemy.url overridden in env.py)
├── migrations/
│   ├── env.py                  # Async-aware Alembic env (uses `Base.metadata`)
│   └── versions/               # (empty — no baseline revision committed; see CONCERNS.md)
├── uploads/
│   └── receipts/               # Dev-only local file storage (UUID-named JPEG/PNG)
├── app/
│   ├── __init__.py
│   ├── api/
│   │   └── routes/             # Thin HTTP handlers — one module per resource
│   │       ├── receipts.py
│   │       ├── budgets.py
│   │       ├── categories.py
│   │       ├── dashboard.py
│   │       ├── notifications.py
│   │       └── health.py
│   ├── core/                   # Cross-cutting infra
│   │   ├── config.py           # Pydantic Settings (env prefix `GG_`)
│   │   ├── dependencies.py     # FastAPI Depends() providers (db session, services, extractor)
│   │   ├── security.py         # Bearer-token auth (`get_current_user`)
│   │   ├── rate_limit.py       # In-memory sliding-window limiter
│   │   └── seed.py             # `seed_default_categories`
│   ├── models/
│   │   ├── database.py         # SQLAlchemy 2.0 ORM models (`Base`, `User`, `Receipt`, …)
│   │   └── schemas.py          # Pydantic request/response DTOs
│   ├── services/               # Business logic — imported by routes via Depends()
│   │   ├── receipt_service.py
│   │   ├── budget_service.py
│   │   ├── notification_service.py
│   │   ├── analytics_service.py
│   │   └── store_service.py
│   ├── llm/                    # Provider-agnostic LLM layer
│   │   ├── provider.py         # `ReceiptExtractor` / `CategoryAssigner` Protocols + LiteLLM + Mock impls
│   │   ├── schemas.py          # Pydantic validators for LLM structured output
│   │   └── prompts/            # Versioned system prompts (Python modules)
│   │       ├── receipt_extraction.py
│   │       └── category_assignment.py
│   ├── events/                 # Domain events (currently no registered handlers — see CONCERNS.md)
│   │   ├── dispatcher.py       # `EventDispatcher` singleton
│   │   └── types.py            # `ReceiptConfirmed`, `ItemCorrected`, `BudgetThresholdBreached`
│   ├── image/                  # Receipt image preprocessing
│   │   ├── preprocessor.py     # Blur detection, resize, thumbnail
│   │   └── storage.py          # `FileStorage` Protocol + `LocalFileStorage` impl
│   └── tasks/                  # Celery tasks
│       ├── celery_app.py       # Celery instance
│       ├── receipt_tasks.py    # (stub — see CONCERNS.md)
│       └── summary_tasks.py    # Scheduled weekly summary
└── tests/                      # Mirrors app/ structure
    ├── conftest.py             # `db_session`, `client`, `mock_extractor`, `test_image_bytes`
    ├── api/                    # Integration tests (full stack, SQLite + mock LLM)
    │   ├── test_receipts.py
    │   ├── test_budgets.py
    │   ├── test_categories.py  # (absent — category route tested via receipts flow)
    │   ├── test_dashboard.py
    │   ├── test_notifications.py
    │   ├── test_health.py
    │   ├── test_security.py    # Auth + user-isolation
    │   ├── test_edge_cases.py  # Mirrors `docs/prd/11-edge-cases.md`
    │   └── test_performance.py # MVP NFR smoke benchmarks
    ├── services/               # Unit tests — direct service calls with `db_session`
    │   ├── test_budget_service.py
    │   ├── test_notification_service.py
    │   ├── test_analytics_service.py
    │   └── test_image_preprocessing.py
    ├── tasks/
    │   └── test_summary_tasks.py
    └── llm_validation/         # Real-LLM harness (skipped without `GG_LLM_API_KEY`)
        ├── conftest.py
        ├── test_extraction_accuracy.py
        ├── test_extraction_consistency.py
        ├── test_prompt_regression.py
        ├── receipts/           # (empty — only `.gitkeep`; see CONCERNS.md)
        └── ground_truth/
            └── en_us_01.json
```

## Mobile Layout (`mobile/`)

```
mobile/
├── package.json              # Expo SDK, RN 0.83, React 19
├── app.json                  # Expo config — `"platforms": ["ios"]`
├── tsconfig.json             # strict mode, `@/*` → `src/*`
├── eslint.config.mjs
├── jest.config.js            # jest-expo preset
├── assets/                   # App icons, splash
├── app/                      # Expo Router — file-based routes
│   ├── _layout.tsx           # Root layout: `QueryClientProvider`, `SyncQueueProvider`
│   ├── (tabs)/
│   │   ├── _layout.tsx       # Tab bar (Home / Scan / History)
│   │   ├── index.tsx         # Dashboard
│   │   ├── scan.tsx          # Camera capture screen
│   │   └── history.tsx       # Past receipts list
│   ├── review.tsx            # Post-scan review & confirm
│   ├── budget-settings.tsx
│   └── notification-settings.tsx
└── src/
    ├── components/           # Shared UI primitives (currently minimal)
    ├── constants/
    │   ├── theme.ts          # Colors (light + dark), spacing, typography
    │   ├── categories.ts     # `DEFAULT_CATEGORIES` (see CONCERNS.md — mismatches backend UUIDs)
    │   ├── strings.ts        # i18n-externalized user strings
    │   └── __tests__/theme.test.ts
    ├── features/             # Feature-first; each feature is self-contained
    │   ├── receipt-capture/
    │   │   ├── components/   # CameraView, CaptureButton, ImagePreview, LineItemCard, …
    │   │   ├── hooks/        # useReceiptScan, useReceiptReview, useReceipts
    │   │   ├── services/     # receiptApi.ts (FormData scan; uses raw fetch)
    │   │   ├── types/        # ReceiptScanResponse, LineItem, …
    │   │   └── __tests__/
    │   └── budget/
    │       ├── components/   # BudgetProgressCard, CategoryBreakdown, SpendingTrendChart, …
    │       ├── hooks/        # useBudget, useCategories, useDashboard
    │       ├── services/     # budgetApi.ts
    │       ├── types/
    │       └── __tests__/
    ├── hooks/                # Cross-feature hooks (useAnalytics, useNetworkStatus, useSyncQueue, useTheme)
    ├── services/
    │   └── api.ts            # `apiClient` — shared fetch wrapper (hardcoded dev token, see CONCERNS.md)
    ├── store/                # Zustand — one store per domain
    │   ├── budgetStore.ts
    │   ├── notificationStore.ts
    │   ├── offlineStore.ts   # Pending-scan queue (persisted via AsyncStorage)
    │   ├── receiptStore.ts
    │   └── __tests__/
    ├── types/                # Cross-feature TypeScript types
    └── utils/                # (placeholder)
```

## Product Requirements (`docs/prd/`)

Numbered specs — read in order. Phase-scoping enforced via `[MVP]` / `[V1.1]` / … tags.

| File | Purpose |
|------|---------|
| `00-overview.md` | Product vision, user archetypes |
| `01-receipt-capture.md` | Capture → Extract pipeline spec |
| `02-budget-copilot.md` | MVP feature (active build) |
| `03-price-intelligence.md` | V1.1 |
| `04-household.md` | V1.5 multi-tenant |
| `05-meal-planner.md` | V2.0 |
| `06-advanced-intelligence.md` | V2.5+ |
| `07-data-model.md` | Canonical entity definitions |
| `08-api-contracts.md` | REST endpoint contract |
| `09-architecture.md` | Event model, service boundaries |
| `10-nfr.md` | Non-functional requirements |
| `11-edge-cases.md` | Edge cases → test cases |
| `12-analytics.md` | Event taxonomy |
| `13-validation-strategy.md` | Definition of Done checklist |
| `PHASE_SCOPE.md` | What's in/out of MVP (authoritative) |
| `OPEN_QUESTIONS.md` | Unresolved decisions |

## Tooling & Automation (`.claude/commands/`)

Slash commands drive the self-validation workflow described in `CLAUDE.md`.

| Command | What it runs |
|---------|--------------|
| `/validate` | Full suite (lint + type check + tests, both stacks) |
| `/validate-backend` | Ruff + pytest + alembic check + app startup |
| `/validate-mobile` | tsc + eslint + jest |
| `/validate-extraction` | LLM accuracy harness (requires `GG_LLM_API_KEY`) |
| `/verify-acceptance <story-id>` | Map PRD acceptance criteria → tests |
| `/design-ui` | Design system + Apple HIG guidance before building screens |
| `/done` | Final gate before presenting work |

## Key Locations — Where to Add New Code

| Change | Target |
|--------|--------|
| New REST endpoint | `backend/app/api/routes/<domain>.py` + router wiring in `backend/main.py` |
| New business rule | `backend/app/services/<domain>_service.py` (NOT in route handler) |
| New DB table/column | `backend/app/models/database.py` + Alembic revision under `backend/migrations/versions/` |
| New request/response DTO | `backend/app/models/schemas.py` |
| New LLM call | `backend/app/llm/provider.py` (add Protocol method + impl); prompt in `backend/app/llm/prompts/` |
| New domain event | `backend/app/events/types.py` + register handler (wiring TBD — see CONCERNS.md) |
| New async job | `backend/app/tasks/<domain>_tasks.py` |
| New screen | `mobile/app/<name>.tsx` (Expo Router file-based route) |
| New feature module | `mobile/src/features/<feature-name>/{components,hooks,services,types,__tests__}/` |
| Shared UI | `mobile/src/components/` (only if used by ≥2 features) |
| New Zustand store | `mobile/src/store/<domain>Store.ts` (one store per domain) |
| Server-state fetch | A hook inside the feature using `@tanstack/react-query` — never raw fetch in components |
| New user string | `mobile/src/constants/strings.ts` (never inline literal) |
| Theme token | `mobile/src/constants/theme.ts` |

## Naming Conventions

**Backend (Python):**
- Modules: `snake_case.py`. Service files are `<domain>_service.py`.
- Classes: `PascalCase`. Protocols suffixed with role (`ReceiptExtractor`, `CategoryAssigner`, `FileStorage`).
- ORM models in `database.py` (singular nouns: `User`, `Receipt`, `LineItem`). Pydantic DTOs in `schemas.py` with suffixes: `*Request`, `*Response`, `*Create`, `*Update`.
- Tests: `test_<module>.py` mirroring `app/<module>.py`. Test functions `test_<behavior>`.
- Config env vars prefixed `GG_` (e.g., `GG_DATABASE_URL`, `GG_LLM_API_KEY`).

**Mobile (TypeScript):**
- Components: `PascalCase.tsx`, named export.
- Hooks: `useCamelCase.ts`, named export.
- Stores: `<domain>Store.ts` exporting `use<Domain>Store`.
- Routes: lowercase-kebab filenames (`budget-settings.tsx`), default export only.
- Tests colocated: `<Name>.test.tsx` or inside `__tests__/` sibling.
- Path alias: `@/*` → `mobile/src/*`.

## Special / Generated Directories

- `backend/uploads/` — runtime-only receipt storage. Git-ignored. Not mounted at `/uploads` in `main.py` (see CONCERNS.md — images currently unreachable).
- `backend/.ruff_cache/` — Ruff cache (git-ignored).
- `backend/grocery_genie_backend.egg-info/` — setuptools metadata (git-ignored).
- `backend/__pycache__/`, `**/__pycache__/` — Python bytecode (git-ignored).
- `mobile/node_modules/` — npm deps (git-ignored).
- `mobile/.expo/`, `mobile/dist/` — Expo build artifacts (git-ignored).
- `.planning/codebase/` — this codebase map; safe to regenerate via `/gsd-map-codebase`.

---

*Structure analysis: 2026-04-19*
