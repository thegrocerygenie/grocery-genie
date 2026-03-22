# Grocery Genie

Mobile app that transforms grocery receipts into budget tracking, price intelligence, and meal planning from a single scan.

## Current Build Phase: MVP (Budget Copilot)

See `docs/prd/PHASE_SCOPE.md` for what's in and out of scope.
**Do not build features from later phases (V1.1+) unless explicitly asked.**

## Tech Stack

### Mobile Client
- **Framework:** React Native with Expo (managed workflow)
- **Language:** TypeScript (strict mode)
- **Navigation:** Expo Router (file-based routing)
- **State Management:** Zustand for client state, TanStack Query for server state
- **Camera:** expo-camera + expo-image-manipulator for receipt capture
- **UI Components:** React Native's core components + custom design system
- **Testing:** Jest + React Native Testing Library (unit/component), Detox (E2E)
- **Linting:** ESLint + Prettier
- **Target Platform:** iOS-only at launch (do not build Android target until explicitly asked)

### Backend API
- **Framework:** Python 3.12+ with FastAPI
- **Database:** PostgreSQL with pgvector extension. SQLAlchemy 2.0+ (async, via asyncpg). Alembic for migrations.
- **Validation:** Pydantic v2 for request/response schemas and LLM output validation
- **Task Queue:** Celery + Redis for async receipt processing, notifications, scheduled summaries
- **Image Processing:** Pillow + OpenCV for receipt image quality assessment and preprocessing
- **Testing:** pytest + httpx (async-aware test client for FastAPI)
- **Linting:** Ruff (linter + formatter)
- **Fuzzy Matching (V1.1):** rapidfuzz for string similarity (Jaro-Winkler, Levenshtein)
- **Embeddings (V1.1):** sentence-transformers + FAISS (or pgvector for simpler queries)
- API contracts defined in `docs/prd/08-api-contracts.md`

### LLM Integration
- **Provider abstraction:** LiteLLM as the provider-agnostic interface
- **Default provider:** Anthropic Claude Sonnet via LiteLLM. Evaluate against receipt test set; switch if another provider wins on accuracy.
- **Receipt extraction:** Vision model processes receipt image → structured JSON
- **Category assignment:** Text model classifies line items into spending categories
- **Output validation:** Pydantic models validate all LLM structured outputs before persistence
- Temperature = 0 for all extraction tasks
- Structured JSON output with schema enforcement
- Fallback to rule-based processing if LLM unavailable or returns invalid output

### Monetization
- MVP launches fully free (no paywall, no payment infrastructure)
- Premium tier introduces with V1.1
- Do not build payment/subscription logic in MVP

## Project Structure

```
# Monorepo with mobile client and backend API

mobile/                  # React Native (Expo) iOS client
  app/                   # Expo Router file-based routes
  src/
    components/          # Shared UI components
    features/            # Feature modules (receipt-capture, budget, etc.)
      receipt-capture/   # components/, hooks/, services/, types/, __tests__/
      budget/            # Same structure per feature
    hooks/               # Shared custom hooks
    services/            # Shared API layer
    store/               # Zustand stores (one per domain)
    types/               # Global TypeScript types
    utils/               # Utility functions
    constants/           # App constants, category defaults, i18n strings

backend/                 # Python FastAPI backend
  app/
    api/routes/          # Route handlers by domain (receipts.py, budgets.py, etc.)
    core/                # Config, security, dependencies
    models/              # Pydantic models (request/response + DB schemas)
    services/            # Business logic layer
    llm/                 # LLM abstraction (provider.py, prompts/, schemas.py)
    events/              # Domain event definitions and dispatcher
    tasks/               # Celery async tasks (receipt processing, notifications)
    image/               # Image preprocessing (quality, crop, blur detection)
  tests/                 # pytest tests mirroring app/ structure
  main.py                # FastAPI app entrypoint

docs/prd/                # Product requirements — see directory for full listing

.claude/commands/        # Claude Code slash commands for autonomous workflow
  verify-backend.md      # /verify-backend — lint, test, structure, app startup
  verify-mobile.md       # /verify-mobile — types, lint, test, structure
  verify-all.md          # /verify-all — full gate check + acceptance audit
  implement-feature.md   # /implement-feature — autonomous implement → verify → fix loop
```

## Development Workflow

Claude Code operates in self-validating loops. Do not wait for human review after each step — instead, implement, verify, fix, and proceed.

### Slash Commands
- `/implement-feature` — Autonomous feature implementation loop. Reads PRD, implements, tests, verifies against acceptance criteria, self-corrects.
- `/verify-backend` — Run after every backend change. Lint, tests, schema validation, structure check, app startup.
- `/verify-mobile` — Run after every mobile change. Types, lint, tests, structure check.
- `/verify-all` — Full gate check before any milestone. Runs everything + acceptance criteria audit.

### After EVERY code change:
1. Run the relevant verification command (`/verify-backend` or `/verify-mobile`).
2. If anything fails, fix it immediately before writing more code.
3. Never accumulate failures — fix as you go.

### After completing a feature:
1. Run `/verify-all`.
2. Walk through each acceptance criterion from the PRD and confirm a test covers it.
3. Check `docs/prd/11-edge-cases.md` for relevant edge cases and ensure they're tested.
4. Report what was built, what's tested, and what needs manual verification.

### After completing a phase:
1. Walk through the Definition of Done checklist in `docs/prd/13-validation-strategy.md`.
2. Every checkbox must pass before the phase ships.

## Self-Validation Workflow

**Do not present work as complete without validating it first.**

After completing any task (feature, bugfix, refactor, scaffold):

1. Run `/validate` to execute the full lint + type check + test suite across both workstreams. Fix any failures and re-run until clean.
2. If the task implements a user story, run `/verify-acceptance {story-id}` to confirm every acceptance criterion is satisfied and tested.
3. If the task changes LLM prompts or extraction logic, run `/validate-extraction` to verify accuracy hasn't regressed.
4. Run `/done` as the final gate before presenting results.

**Self-correction rules:**
- If a test fails, read the failure, fix the root cause (not just the test), and re-run.
- If a lint rule fails, fix the code to comply — do not disable the rule.
- If an acceptance criterion isn't satisfied, implement it before reporting done.
- If code from a later phase (V1.1+) was accidentally introduced, remove it.
- After fixing, always re-run validation from the start to catch cascading issues.

**When to ask for human input vs. self-correct:**
- Self-correct: lint failures, type errors, test failures, missing tests, missing acceptance criteria implementation.
- Ask for input: ambiguous PRD requirements, architecture decisions not covered in docs, tradeoffs where both options are defensible, UI/UX design choices.

## Key Conventions

- Every requirement is tagged with its delivery phase: `[MVP]`, `[V1.1]`, `[V1.5]`, `[V2.0]`, `[V2.5]`, `[V3.0]`
- Phase boundaries are strict. Do not pull features from a later phase into an earlier one.
- User stories follow: "As a {role}, I want to {action}, so that {benefit}."
- All LLM integrations use a provider-agnostic interface. Do not hardcode a specific model provider.
- Receipt data flows through a 5-stage pipeline: Capture → Extract → Structure → Enrich → Act
- Data model supports multi-tenant (household) from the schema level, even in MVP.
- Event-driven architecture: downstream features react to domain events, not synchronous calls.
- Every acceptance criterion must have a corresponding automated test. See `docs/prd/13-validation-strategy.md`.
- LLM extraction changes require running the validation harness against the receipt test set before merging.

## Self-Validation (Automated)

Hooks and commands enforce correctness automatically. See `.claude/skills/self-validation.md` for the full workflow.

- **PostToolUse hook** auto-formats Python (ruff) and TypeScript (prettier) on every file edit.
- **Stop hook** runs lint, type check, and tests when you finish a task. If anything fails, you must fix it before completing.
- **TDD workflow:** For every acceptance criterion, write the failing test first, then implement. Use `/implement <story-id>`.
- **Verification commands:**
  - `/verify-story <id>` — verify one user story's acceptance criteria
  - `/verify-epic <name>` — verify all stories in an epic
  - `/verify-phase` — run the full MVP Definition of Done checklist
  - `/validate-extraction` — run LLM accuracy harness
  - `/implement <id>` — implement a story with built-in TDD and self-validation

## Core Domain Events

These events drive the system. Reference `docs/prd/09-architecture.md` for full details.

- `ReceiptConfirmed` — triggers budget recalculation, item matching, pantry update, price recording
- `ItemCorrected` — triggers category/mapping learning
- `BudgetThresholdBreached` — triggers push notification
- `PriceChangeDetected` — triggers alert (V1.1)
- `IngredientExpiring` — triggers notification + recipe suggestion (V2.0)

## Data Model Quick Reference

Core MVP entities: User, Receipt, LineItem, Category, Store, Budget, UserItemMapping.
See `docs/prd/07-data-model.md` for full entity definitions and access patterns.

## Commands

### Mobile Client (from `mobile/`)
```bash
npx expo start --ios       # Start with iOS simulator
npm test                   # Run Jest tests
npx tsc --noEmit           # Type-check
npx eslint . --fix         # Lint and auto-fix
npx expo prebuild --platform ios   # Generate native project
```

### Backend API (from `backend/`)
```bash
uvicorn main:app --reload              # Dev server
pytest                                  # Run tests
ruff check . && ruff format .          # Lint + format
alembic upgrade head                   # Run DB migrations
alembic revision --autogenerate -m ""  # Generate migration
celery -A app.tasks worker --loglevel=info  # Celery worker
pytest tests/llm_validation/ -v        # LLM accuracy harness
```

Hooks auto-run linting and type checks after every file edit. Use `/validate` for full suite.

## Code Style

### Mobile (TypeScript / React Native)
- TypeScript strict mode — no `any` types. Proper typing for all props, state, API responses.
- Functional components only. Named exports for components/hooks; default export only for route screens.
- Colocated tests: `Component.test.tsx` next to `Component.tsx`.
- Feature-first organization by domain (receipt-capture/, budget/), not by file type.
- TanStack Query for all API calls — no raw fetch in components. Zustand stores: one per domain, small and focused.
- No inline styles — use `StyleSheet.create`. All colors, spacing, typography from `src/constants/theme.ts`.
- All user-facing strings externalized for i18n.
- Accessibility: every interactive element needs `accessibilityLabel`. Test with VoiceOver.
- **When building any screen or component, run `/design-ui` first** for design system rules, screen-specific guidance, and Apple HIG compliance.

### Backend (Python / FastAPI)
- Python 3.12+ with modern syntax (type hints, `match`, `|` unions). Async by default — `async def` for all routes and services.
- Pydantic models for everything — requests, responses, LLM output, config. Never pass raw dicts between layers.
- SQLAlchemy models separate from Pydantic schemas. Use `.model_validate()` to convert. Async DB sessions via `Depends()`.
- Service layer pattern — thin route handlers (validate → call service → return). Business logic in `app/services/`.
- Dependency injection via `Depends()` for DB sessions, auth, services. No global state.
- LLM calls always through `app/llm/provider.py` — never call LiteLLM directly from routes/services.
- System prompts versioned in `app/llm/prompts/` as Python modules. Prompt changes trackable in git.
- Domain events for cross-service communication — publish events, never call other services directly.
- Tests mirror app structure. `httpx.AsyncClient` for API tests. No bare `except:`. Ruff for lint + format.

## iOS-Specific
- iOS 16+ only. No Android-specific code or platform checks.
- `expo-camera` for capture, `expo-image-manipulator` for preprocessing, `expo-notifications` for push (APNs).
- Apple HIG for navigation patterns. Touch targets ≥44×44pt. Assets in `app.json`.

## Important Context
- System prompts are specification documents — each instruction addresses a specific model failure.
- Temperature 0 improves determinism but doesn't guarantee it. Validation layers essential.
- International receipts use varied decimal separators — parsing must handle locale-specific formats.
- Competitive moat is the data pipeline and three-layer value extraction, not UI polish.
