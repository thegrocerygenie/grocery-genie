# Coding Conventions

**Analysis Date:** 2026-04-19

This document defines the conventions used in the `grocery-genie` monorepo. Two workstreams apply: **mobile** (React Native / Expo / TypeScript) and **backend** (Python 3.12 / FastAPI). Rules differ per workstream — see the relevant section when adding code.

## Naming Patterns

**Mobile files:**
- React components — `PascalCase.tsx`. Example: `mobile/src/features/budget/components/BudgetProgressCard.tsx`.
- Hooks — `camelCase.ts` with a `use` prefix. Example: `mobile/src/hooks/useSyncQueue.ts`, `mobile/src/features/receipt-capture/hooks/useReceiptScan.ts`.
- Zustand stores — `camelCase.ts` suffixed with `Store`. Example: `mobile/src/store/offlineStore.ts`, `mobile/src/store/receiptStore.ts`.
- API service modules — `camelCase.ts` suffixed with `Api`. Example: `mobile/src/features/budget/services/budgetApi.ts`.
- Route screens under `mobile/app/` — `kebab-case.tsx`. Example: `mobile/app/budget-settings.tsx`, `mobile/app/notification-settings.tsx`.
- Test files — colocated in `__tests__/` directory adjacent to the source. Pattern: `<SourceName>.test.tsx` for components, `<sourceName>.test.ts` for hooks/stores. Example: `mobile/src/features/budget/__tests__/BudgetProgressCard.test.tsx`.

**Mobile identifiers:**
- Components — `PascalCase`. Example: `BudgetProgressCard`, `ReceiptHistoryItem`.
- Props interfaces — `<ComponentName>Props`. Example: `interface BudgetProgressCardProps { ... }` in `BudgetProgressCard.tsx:5`.
- Hooks — `camelCase` with `use` prefix. Example: `useBudgetCreate`, `useAnalytics`.
- Zustand hooks — `use<Domain>Store`. Example: `useOfflineStore`, `useReceiptStore`.
- Type aliases for unions — `PascalCase`. Example: `type CaptureMode = 'camera' | 'library'` in `mobile/src/features/receipt-capture/types/index.ts`.
- Constants — `camelCase` object exports (not `UPPER_SNAKE`) for theme/strings tokens: `colors`, `spacing`, `typography`, `strings`. Top-level singletons like `DEV_AUTH_TOKEN` in `mobile/src/services/api.ts:4` use `UPPER_SNAKE_CASE`.

**Backend files:**
- All modules — `snake_case.py`. Example: `backend/app/services/budget_service.py`, `backend/app/api/routes/receipts.py`.
- Test modules — `test_<subject>.py`, mirroring the `app/` tree under `backend/tests/`. Example: `backend/tests/api/test_receipts.py` corresponds to `backend/app/api/routes/receipts.py`.
- Route modules live under `backend/app/api/routes/` and are named by domain: `receipts.py`, `budgets.py`, `dashboard.py`, `categories.py`, `notifications.py`, `health.py`.

**Backend identifiers:**
- Classes (services, Pydantic, SQLAlchemy) — `PascalCase`. Example: `BudgetService`, `ReceiptResponse`, `LineItem`.
- Functions/methods, variables — `snake_case`. Example: `async def get_current_user(...)` in `backend/app/core/security.py:12`.
- Module-level constants — `UPPER_SNAKE_CASE`. Example: `ALLOWED_CONTENT_TYPES`, `QUALITY_CHECKABLE_TYPES`, `DEFAULT_THRESHOLDS`.
- Pydantic schemas — suffix by role: `*Request` for input, `*Response` for output, `*Extraction` for LLM-structured output, `*Summary` for aggregates. Examples in `backend/app/models/schemas.py`: `BudgetCreateRequest`, `BudgetResponse`, `ReceiptExtraction`, `BudgetSummaryResponse`.
- Private helpers prefixed with `_`. Example: `_receipt_to_response` in `backend/app/api/routes/receipts.py:59`, `_content_type_to_ext` in `backend/app/api/routes/receipts.py:55`.
- Factory/provider functions — `get_<thing>`. Example: `get_settings()` in `backend/app/core/config.py:40`, `get_db()` in `backend/app/core/dependencies.py:40`, `get_receipt_extractor()` in `backend/app/llm/provider.py:224`.

## Code Style

### Mobile

**Formatting:**
- Tool — Prettier 3.x (declared in `mobile/package.json:40`). Command: `npm run format` or `npx prettier --check .`.
- Hook — editing any `mobile/**/*.ts` or `.tsx` triggers `tsc --noEmit` via PostToolUse hook (`.claude/settings.json:24-32`).

**Linting:**
- Tool — ESLint 9 (flat config) extending `eslint-config-expo` in `mobile/eslint.config.mjs`.
- Custom rule: `'no-console': 'warn'` (`mobile/eslint.config.mjs:7`). Use `useAnalytics().emit(...)` from `mobile/src/hooks/useAnalytics.ts` instead of `console.log`.
- Ignored: `node_modules/`, `.expo/`, `ios/`, `android/`.

**TypeScript:**
- Strict mode enabled (`mobile/tsconfig.json:4`).
- No `any` — use `unknown` for boundary/untrusted data and narrow safely. Example: `ApiError` constructor takes `data: unknown` in `mobile/src/services/api.ts:16`.
- Path alias — `@/*` maps to `./src/*`. Example import: `import { colors } from '@/constants/theme';`.
- Exports: functional components and hooks use **named exports** (`export function BudgetProgressCard(...)`). Default exports are reserved for Expo Router screens (`mobile/app/**/*.tsx` use `export default function`).
- Do **not** use `React.FC`. Type props with a named `interface` inline on the destructured parameter. See `BudgetProgressCard.tsx:25-31`.

### Backend

**Formatting:**
- Tool — Ruff (lint + format). Declared in `backend/pyproject.toml:38-47`.
- Line length — 88 (`backend/pyproject.toml:40`).
- Target — Python 3.12+. Use modern syntax: `X | None` over `Optional[X]`, `dict[str, int]` over `Dict`, `match` statements, `from collections.abc import AsyncGenerator` for types.
- Hook — editing any `backend/**/*.py` triggers `ruff check --quiet` via PostToolUse hook (`.claude/settings.json:15-23`).

**Linting (ruff):**
- Enabled rule sets: `E` (pycodestyle errors), `F` (pyflakes), `I` (isort), `UP` (pyupgrade), `B` (flake8-bugbear), `SIM` (simplify) — `backend/pyproject.toml:43`.
- Per-file ignores: `B008` (function call in default argument) is allowed in `backend/app/api/routes/*.py` and `backend/app/core/security.py` because `Depends()` idiomatically appears as a default value.

**Async-by-default:**
- Route handlers are `async def` with `AsyncSession = Depends(get_db)`. See `backend/app/api/routes/budgets.py:22`.
- Service methods that touch the DB are `async def`. See `BudgetService.create_budget` in `backend/app/services/budget_service.py:27`.
- Blocking work (image processing) is wrapped with `asyncio.to_thread`. Example: `backend/app/api/routes/receipts.py:104`.

## Import Organization

### Mobile

Prettier does not sort imports. Observed convention — three groups separated by a blank line:

1. External packages: `react`, `react-native`, `@tanstack/react-query`, `expo-*`, `zustand`.
2. Absolute internal imports via `@/`: `@/constants/theme`, `@/services/api`, `@/hooks/useAnalytics`.
3. Relative intra-feature imports: `../components/BudgetProgressCard`, `../types`.

Example (`mobile/src/features/receipt-capture/components/ReceiptHistoryItem.tsx:1-4`):
```typescript
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { strings } from '@/constants/strings';
import { borderRadius, colors, shadows, spacing, typography } from '@/constants/theme';
```

**Path aliases:** only `@/*` is configured. No barrel files (`index.ts`) outside of `types/` re-exports — import directly from the source file.

### Backend

Ruff's `I` (isort) rule auto-orders imports on save. Three groups:

1. Standard library — `import asyncio`, `import uuid`, `from datetime import date`.
2. Third-party — `from fastapi import ...`, `from sqlalchemy.ext.asyncio import AsyncSession`, `from pydantic import BaseModel`.
3. First-party (`app.*`) — `from app.core.dependencies import get_db`, `from app.models.database import User`, `from app.services.receipt_service import ReceiptService`.

Example (`backend/app/api/routes/receipts.py:1-35`):
```python
import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.security import get_current_user
# ...
```

**Forward references** use `from __future__ import annotations` plus `if TYPE_CHECKING:` import guards. Example: `backend/app/services/receipt_service.py:1,32`.

## Error Handling

### Mobile

**Network errors:** All API calls go through `apiClient` in `mobile/src/services/api.ts:21-34`. It throws a typed `ApiError(status, data)` on non-2xx responses. Callers catch or let TanStack Query's `mutation.onError` / `query.error` handle it.

**`ApiError` class** (`mobile/src/services/api.ts:12-19`):
```typescript
export class ApiError extends Error {
  constructor(public status: number, public data: unknown) {
    super(`API Error: ${status}`);
  }
}
```

**Queue failures** (offline sync): the sync loop in `useSyncQueue.ts:30-35` catches bare `catch {}` and transitions the item to `status: 'failed'` in the offline store rather than re-throwing — the item stays in the queue for the next connectivity event.

**User-facing errors:** use externalized strings from `mobile/src/constants/strings.ts` (e.g., `strings.common.error`, `strings.scan.qualityError`). Never display raw error messages or stack traces.

### Backend

**HTTP errors:** Route handlers convert `ValueError` from services into `HTTPException` with an appropriate status and `from e` / `from None` chaining. Canonical pattern in `backend/app/api/routes/budgets.py:29-32`:

```python
try:
    result = await service.create_budget(user.id, budget)
except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e)) from e
```

**Not-found handling:** service raises `ValueError("... not found")`; route matches on that string and returns 404. See `backend/app/api/routes/budgets.py:63-67`.

**Service layer:** raises `ValueError` for domain validation failures. See `BudgetService.create_budget` at `backend/app/services/budget_service.py:37` (`raise ValueError(f"Category {request.category_id} not found")`).

**Transactional DB sessions:** `get_db` commits on success and rolls back on any exception — see `backend/app/core/dependencies.py:40-47`.

**Event handlers:** errors inside `dispatcher.dispatch()` handlers are caught and logged without propagating (`backend/app/events/dispatcher.py:26-32`). Handlers must be fault-tolerant.

**No bare `except:`** — always catch specific exceptions or `Exception` with explicit logging.

**Authentication failures:** `get_current_user` raises `HTTPException(status_code=401, ..., headers={"WWW-Authenticate": "Bearer"})` — see `backend/app/core/security.py:24-28`.

## Logging

### Mobile

- No direct `console.log` — lint rule warns (`mobile/eslint.config.mjs:7`).
- Use `useAnalytics` hook: `const { emit } = useAnalytics(); emit('event_name', { ... })`. See `mobile/src/hooks/useAnalytics.ts`. In dev (`__DEV__`), it logs to console; production sends to a future analytics endpoint.

### Backend

- Stdlib `logging` module, one logger per module: `logger = logging.getLogger(__name__)`. Example: `backend/app/llm/provider.py:20`, `backend/app/events/dispatcher.py:6`.
- Use structured `extra={}` for machine-readable metadata. Example from `backend/app/llm/provider.py:76-84`:
  ```python
  logger.info(
      "LLM extraction completed",
      extra={
          "prompt_version": PROMPT_VERSION,
          "latency_seconds": round(latency, 2),
          "input_tokens": usage.prompt_tokens if usage else None,
          "output_tokens": usage.completion_tokens if usage else None,
      },
  )
  ```
- Use `logger.exception(...)` inside `except:` blocks to capture tracebacks (see `backend/app/events/dispatcher.py:27-32`).
- Never use `print()`.

## Comments

**When to comment:**
- Document *why* a choice was made, not *what* the code does. Example: `backend/app/api/routes/receipts.py:103` — `# Image quality check (JPEG/PNG only — Pillow doesn't support HEIC)`.
- Flag security/deployment concerns inline. Example: `backend/main.py:37` — `allow_origins=["*"],  # Tighten for production`; `mobile/src/services/api.ts:4` — `// MVP: static dev token matching seeded user. Replace with secure storage in production.`.
- Explain non-obvious numeric thresholds and their rationale.

**Python docstrings:**
- Use triple-quoted docstrings on public service methods and non-trivial helpers. Terse one-liners are acceptable for self-explanatory code.
- Example (`backend/app/services/budget_service.py:69-77`):
  ```python
  async def get_period_dates(
      self, user_id: uuid.UUID, period: str
  ) -> tuple[date, date]:
      """Resolve 'YYYY-MM' to (start_date, end_date) based on user's budget start day.

      If user has an overall budget, use its period_start day-of-month.
      Otherwise default to 1st of month.
      """
  ```
- Pydantic `@model_validator` methods include docstrings explaining the invariant. See `backend/app/llm/schemas.py:16-17`.

**TypeScript/JSDoc:** not used. Types carry the contract. Only add a JS-style comment when the intent is non-obvious.

## Function Design

**Size:** functions stay under ~50 lines. Large service methods (e.g., `ReceiptService.process_receipt`) decompose into private `_helper` methods on the same class.

**Parameters:**
- Python: prefer keyword arguments for optional/multi-parameter calls. Constructors accept dependencies via `__init__` (see `ReceiptService.__init__` in `backend/app/services/receipt_service.py:36-48`).
- TypeScript: destructure props on the parameter line. Example: `function BudgetProgressCard({ budget, spent, remaining, percent, daysLeft }: BudgetProgressCardProps)` in `mobile/src/features/budget/components/BudgetProgressCard.tsx:25-31`.

**Return types:**
- Python: always annotate return types on route handlers, service methods, and factory functions. Example: `async def create_budget(...) -> Budget:` (`backend/app/services/budget_service.py:27-29`).
- TypeScript: rely on inference inside component bodies; annotate exported utility functions and API client wrappers. Example: `export async function scanReceipt(imageUri: string, mimeType: string): Promise<ReceiptScanResponse>` (`mobile/src/features/receipt-capture/services/receiptApi.ts:11-14`).

**Purity / immutability:**
- Spread-based updates in Zustand. Example (`mobile/src/store/offlineStore.ts:37-42`):
  ```typescript
  updateStatus: (id, status) =>
    set((state) => ({
      pendingReceipts: state.pendingReceipts.map((r) =>
        r.id === id ? { ...r, status } : r,
      ),
    })),
  ```
- Event payloads are `@dataclass(frozen=True)`. See `backend/app/events/types.py:6-34`.

## Module Design

### Mobile feature modules

Features organize by domain under `mobile/src/features/<domain>/` with five standard subdirectories:

```
mobile/src/features/budget/
  ├── components/        # PascalCase.tsx React components
  ├── hooks/             # useXxx.ts TanStack Query hooks + local state hooks
  ├── services/          # xxxApi.ts — thin fetch wrappers over apiClient
  ├── types/index.ts     # shared TypeScript interfaces for the feature
  └── __tests__/         # colocated Component.test.tsx files
```

Real examples: `mobile/src/features/budget/`, `mobile/src/features/receipt-capture/`.

**Cross-feature imports** go through `@/*` path alias (e.g., `@/services/api`, `@/constants/theme`). Do not import from sibling features' internal paths — if shared, promote to `mobile/src/{hooks,services,store,constants}/`.

**Zustand stores** live in `mobile/src/store/`, one store per domain:
- `offlineStore.ts` — pending receipts awaiting sync, persisted via `AsyncStorage`.
- `receiptStore.ts` — ephemeral scan session state.
- `budgetStore.ts` / `notificationStore.ts`.

Persistence is opt-in via `persist` middleware with `createJSONStorage(() => AsyncStorage)` (`mobile/src/store/offlineStore.ts:20-53`).

**TanStack Query:**
- A single `QueryClient` is constructed in `mobile/app/_layout.tsx:7` and provided at the root.
- No raw `fetch` in components. API calls go through `apiClient` (`mobile/src/services/api.ts`) or `FormData` helper (`scanReceipt` in `receiptApi.ts`).
- Mutations invalidate queries by key. Example (`useBudgetCreate` in `mobile/src/features/budget/hooks/useBudget.ts:5-14`):
  ```typescript
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
  },
  ```
- `useQuery` sets `staleTime` explicitly when non-default. Example: `useReceipts` uses `staleTime: 30_000` (`mobile/src/features/receipt-capture/hooks/useReceipts.ts:14-18`).

**Styling:**
- Always `StyleSheet.create({ ... })` at the bottom of the component file. No inline style objects (use inline style arrays for dynamic values: `style={[styles.container, pressed && styles.pressed]}`).
- All colors/spacing/typography/shadows come from `mobile/src/constants/theme.ts` — never hardcode. The only exceptions observed are camera-overlay colors (`'#FFFFFF'`) and high-contrast badge text.
- Touch targets ≥ 44×44pt. The theme exports `touchTarget.minHeight = 44, minWidth = 44` (`mobile/src/constants/theme.ts:89-92`). `ReceiptHistoryItem` uses `minHeight: 72` (`mobile/src/features/receipt-capture/components/ReceiptHistoryItem.tsx:94`).

**i18n-externalized strings:**
- All user-visible strings live in `mobile/src/constants/strings.ts` under domain-grouped keys (`strings.dashboard.remaining`, `strings.scan.captureButton`, `strings.common.error`).
- Never hardcode a user-facing string in a component.

**Accessibility:**
- Every `Pressable` has `accessibilityRole="button"` and an `accessibilityLabel`. See `ReceiptHistoryItem.tsx:30-31`, `CaptureButton.tsx:40-41`.
- Non-interactive decorative elements use `accessibilityElementsHidden` (see `ReceiptHistoryItem.tsx:36, 65`).
- Aggregated widgets use `accessibilityRole="summary"` with `accessibilityValue={{ min, max, now }}`. Example: `BudgetProgressCard.tsx:40-43`.

### Backend layering

Strict three-layer pattern:

1. **Routes** (`backend/app/api/routes/`) — thin: validate input via Pydantic, inject dependencies via `Depends()`, call one service method, return a response schema. See `backend/app/api/routes/budgets.py` (69 lines total for 3 endpoints).
2. **Services** (`backend/app/services/`) — business logic. Instantiated per-request inside the route, taking `db: AsyncSession` and optional collaborators (extractor, analytics). See `BudgetService(db)` at `backend/app/api/routes/budgets.py:28` and `ReceiptService(db=db, extractor=..., category_assigner=..., analytics=...)` at `backend/app/api/routes/receipts.py:111-116`.
3. **Models** — split into SQLAlchemy ORM (`backend/app/models/database.py`) and Pydantic schemas (`backend/app/models/schemas.py`). Never return an ORM object from a route — always convert:
   - Via `.model_validate(orm_obj)` when the schema has `model_config = ConfigDict(from_attributes=True)`. Example: `BudgetResponse.model_validate(result)` (`backend/app/api/routes/budgets.py:39`).
   - Via a dedicated mapper function when the shape differs. Example: `_receipt_to_response` (`backend/app/api/routes/receipts.py:59-75`).

**Dependency injection (FastAPI `Depends`):**
- DB session: `db: AsyncSession = Depends(get_db)` — `backend/app/core/dependencies.py:40-47`.
- Current user: `user: User = Depends(get_current_user)` — `backend/app/core/security.py:12-29`.
- LLM providers: `extractor: ReceiptExtractor = Depends(get_receipt_extractor)` — `backend/app/llm/provider.py:224-232`. The factory returns `MockReceiptExtractor` in debug mode, `LiteLLMReceiptExtractor` otherwise.
- Services are NOT injected — they are constructed in the route body (cheap, stateless, holds the injected `db`).

**LLM abstraction:**
- All LLM calls go through `backend/app/llm/provider.py`. Routes and services depend on `Protocol` types (`ReceiptExtractor`, `CategoryAssigner`) — never on `litellm` directly.
- System prompts live in `backend/app/llm/prompts/*.py` as versioned Python modules exporting `PROMPT_VERSION` and `SYSTEM_PROMPT`. See `backend/app/llm/prompts/category_assignment.py`, `backend/app/llm/prompts/receipt_extraction.py`.
- Every LLM output is validated through Pydantic (`ReceiptExtractionResult.model_validate(parsed)` at `backend/app/llm/provider.py:87`).
- Temperature is `0.0` for all extraction tasks (`backend/app/core/config.py:23`).

**Pydantic schemas:**
- All request/response shapes are Pydantic v2 models in `backend/app/models/schemas.py`.
- Use `ConfigDict(from_attributes=True)` to map from SQLAlchemy ORM instances. Example: `LineItemResponse` at `backend/app/models/schemas.py:41-42`.
- Field validation uses `Field(gt=0)`, `Field(ge=0.0, le=1.0)`, `Field(min_length=1)`. Examples: `BudgetUpdateRequest` (`backend/app/models/schemas.py:120-121`), `ExtractedLineItem.confidence` (`backend/app/llm/schemas.py:13`).
- Cross-field invariants use `@model_validator(mode="after")`. Examples in `backend/app/llm/schemas.py:15-25` (price tolerance) and `37-47` (date not future).

**Configuration:**
- Pydantic `BaseSettings` in `backend/app/core/config.py`. All config is read from env with prefix `GG_` (e.g., `GG_LLM_API_KEY`, `GG_DATABASE_URL`).
- Access via `get_settings()` (LRU-cached) — never read `os.environ` directly in business logic.
- Never hardcode secrets. See `Settings.llm_api_key` (`backend/app/core/config.py:24`) — defaults to empty string; LiteLLM surfaces a clear failure if missing.

**Events (domain-driven):**
- Cross-service communication goes through `app/events/dispatcher.py`'s in-process `EventDispatcher`. Services publish `dataclass(frozen=True)` events (`ReceiptConfirmed`, `ItemCorrected`, `BudgetThresholdBreached` in `backend/app/events/types.py`); handlers register via `dispatcher.register(EventType, handler)`.
- Designed as a drop-in for a future Celery/Redis dispatcher. Do **not** call another service's methods directly — publish an event.

## TDD Workflow & Self-Validation

This project operates under a **mandatory TDD + self-validation** loop enforced by `CLAUDE.md` and the `.claude/commands/` slash commands.

**Process for every change:**
1. Write the failing test first for each acceptance criterion. Use `/implement <story-id>` to scaffold.
2. Implement to pass.
3. Run `/validate` (see `.claude/commands/validate.md`):
   - Backend: `ruff check .`, `ruff format --check .`, `pytest -x -q`.
   - Mobile: `npx tsc --noEmit`, `npx eslint .`, `npm test -- --watchAll=false`.
4. Run `/verify-acceptance <story-id>` to confirm every PRD criterion is both implemented and tested.
5. Run `/done` as the final gate (see `.claude/commands/done.md`) — repeats the lint/type/test gate plus architecture compliance (LLM calls through provider, Pydantic for all schemas, logic in services, `async def` for I/O).

**Self-correct rules (from `CLAUDE.md`):**
- If lint fails, fix the code — never disable the rule.
- If a test fails, read the failure, fix the root cause, re-run. Don't edit the test unless it is wrong.
- If an acceptance criterion isn't satisfied, implement it.
- If code from a later phase (V1.1+) snuck in, remove it.

**Hooks auto-run:**
- Editing `backend/**/*.py` runs `ruff check --quiet` (`.claude/settings.json:15-23`).
- Editing `mobile/**/*.(ts|tsx)` runs `tsc --noEmit` (`.claude/settings.json:24-32`).

## Phase Discipline

- Every feature is tagged with a phase (`[MVP]`, `[V1.1]`, ...). Current phase: **MVP (Budget Copilot)** per `CLAUDE.md` and `docs/prd/PHASE_SCOPE.md`.
- Do not introduce V1.1+ fields or features. The schema/API may *accommodate* future extensions, but must not implement them.
- `/done` step 4 explicitly checks for out-of-scope code and demands its removal.

---

*Convention analysis: 2026-04-19*
