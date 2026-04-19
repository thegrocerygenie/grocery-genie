# Architecture

**Analysis Date:** 2026-04-19

## Pattern Overview

**Overall:** Monorepo with two cooperating apps — a React Native (Expo) mobile client and a Python FastAPI backend — connected via a versioned REST API over HTTPS. The backend follows a layered, async, service-oriented architecture with an in-process domain-event dispatcher and a Celery task queue for scheduled/async work. The mobile client follows a feature-first architecture with file-based routing, TanStack Query for server state, and Zustand for client state.

**Key Characteristics:**
- **Layered backend (FastAPI):** thin route handlers → service layer → ORM / Pydantic models; LLM, image, events, and tasks are first-class sibling concerns under `backend/app/`.
- **Provider-agnostic LLM boundary:** all model calls go through `Protocol` interfaces in `backend/app/llm/provider.py` (LiteLLM implementation + Mock variants selected by `settings.debug`).
- **Event-driven post-processing:** `ReceiptConfirmed`, `ItemCorrected`, and `BudgetThresholdBreached` are dispatched via an in-process `EventDispatcher` (`backend/app/events/dispatcher.py`) designed for drop-in Celery/Redis replacement later.
- **Async-by-default backend:** `async def` routes/services, SQLAlchemy 2.0 async sessions via `asyncpg`, `httpx.AsyncClient` in tests.
- **Feature-first mobile client:** each domain (`receipt-capture`, `budget`) owns its `components/`, `hooks/`, `services/`, `types/`, and `__tests__/` under `mobile/src/features/`.
- **5-stage receipt pipeline:** Capture (mobile camera) → Extract (LLM vision) → Structure (Pydantic validators + DB persistence) → Enrich (category assignment, store lookup, duplicate check) → Act (budget threshold check, notification create, event dispatch).
- **Offline-first mobile:** pending receipts persisted via Zustand + AsyncStorage; `useSyncQueue` replays on reconnect.

## Layers

**Mobile — Route (Expo Router):**
- Purpose: File-based routing; each file under `mobile/app/` is a screen. Root stack wraps tab navigator and modal screens.
- Location: `mobile/app/`
- Contains: Root layout (`_layout.tsx`), tab layout (`(tabs)/_layout.tsx`), tab screens (`index.tsx`, `scan.tsx`, `history.tsx`), modal screens (`review.tsx`, `budget-settings.tsx`, `notification-settings.tsx`).
- Depends on: Feature components and hooks from `mobile/src/features/`, Zustand stores from `mobile/src/store/`, `QueryClientProvider` + `useSyncQueue` from root layout.
- Used by: Expo Router runtime entry `expo-router/entry` (set in `mobile/package.json` → `"main"`).

**Mobile — Feature modules:**
- Purpose: Encapsulate one domain (receipt-capture, budget). Each feature exposes components, domain hooks, API services, and TS types.
- Location: `mobile/src/features/{receipt-capture,budget}/`
- Contains: `components/*.tsx` (domain UI), `hooks/*.ts` (TanStack Query wrappers + domain logic), `services/*.ts` (typed API client functions), `types/index.ts` (shared TS types mirroring backend Pydantic schemas).
- Depends on: `@/services/api` (fetch + auth), `@/constants/theme`, `@/constants/strings`, Zustand stores, TanStack Query.
- Used by: Screen files in `mobile/app/` and `mobile/app/(tabs)/`.

**Mobile — Shared state (Zustand):**
- Purpose: Client-side state — scan session, selected period, offline queue, notification preferences.
- Location: `mobile/src/store/`
- Contains: `receiptStore.ts` (scan session), `budgetStore.ts` (selected period, thresholds), `offlineStore.ts` (pending receipts, persisted via AsyncStorage), `notificationStore.ts` (threshold prefs, persisted).
- Depends on: `zustand`, `zustand/middleware`, `@react-native-async-storage/async-storage`.
- Used by: Feature hooks and screens.

**Mobile — Shared services & hooks:**
- Purpose: Cross-feature utilities.
- Location: `mobile/src/services/`, `mobile/src/hooks/`
- Contains: `services/api.ts` (`apiClient`, `ApiError`, `getAuthHeaders`), `hooks/useSyncQueue.ts`, `hooks/useNetworkStatus.ts`, `hooks/useAnalytics.ts`, `hooks/useTheme.ts`.
- Depends on: `@tanstack/react-query`, `@react-native-community/netinfo`.

**Backend — API route layer:**
- Purpose: Thin HTTP handlers — validate input, delegate to services, convert ORM objects to Pydantic responses.
- Location: `backend/app/api/routes/`
- Contains: `receipts.py`, `budgets.py`, `dashboard.py`, `categories.py`, `notifications.py`, `health.py`.
- Depends on: `app.core.dependencies.get_db`, `app.core.security.get_current_user`, `app.llm.provider` factories, `app.services.*`.
- Used by: FastAPI app in `backend/main.py` via `app.include_router(...)`.

**Backend — Service layer:**
- Purpose: Business logic — orchestrates DB operations, LLM calls, event dispatch, and Pydantic assembly. Stateless classes constructed per-request with an injected `AsyncSession`.
- Location: `backend/app/services/`
- Contains: `receipt_service.py` (orchestrates the full 5-stage pipeline), `budget_service.py` (period math, summaries, threshold checks), `notification_service.py`, `store_service.py` (find-or-create by normalized name), `analytics_service.py` (Protocol-based backend, MVP logs to console).
- Depends on: `app.models.database` (SQLAlchemy ORM), `app.models.schemas` (Pydantic), `app.events.dispatcher`, `app.llm.provider`.
- Used by: Route handlers in `backend/app/api/routes/` and Celery tasks in `backend/app/tasks/`.

**Backend — Domain models:**
- Purpose: Two parallel model hierarchies kept intentionally separate.
- Location: `backend/app/models/`
- Contains:
  - `database.py` — SQLAlchemy 2.0 ORM (`Base`, `User`, `Store`, `Category`, `Receipt`, `LineItem`, `Budget`, `Notification`, `UserItemMapping`) with typed `Mapped[...]` columns, UUID primary keys, and `__table_args__` for indexes/uniqueness.
  - `schemas.py` — Pydantic v2 request/response models (`ReceiptScanResponse`, `ReceiptResponse`, `BudgetSummaryResponse`, `DashboardSpendingResponse`, `CategoryResponse`, etc.), use `ConfigDict(from_attributes=True)` for ORM → schema conversion.
- Depends on: SQLAlchemy, Pydantic v2.
- Used by: Every service, route, and task.

**Backend — LLM boundary:**
- Purpose: Provider-agnostic vision + categorization via LiteLLM; versioned system prompts; Pydantic-validated structured output; deterministic mocks for tests.
- Location: `backend/app/llm/`
- Contains:
  - `provider.py` — `ReceiptExtractor` / `CategoryAssigner` Protocols, `LiteLLMReceiptExtractor`, `LiteLLMCategoryAssigner`, `MockReceiptExtractor`, `LowConfidenceMockExtractor`, `MockCategoryAssigner`, factory functions `get_receipt_extractor` / `get_category_assigner` used as FastAPI `Depends()`.
  - `prompts/receipt_extraction.py`, `prompts/category_assignment.py` — `SYSTEM_PROMPT` + `PROMPT_VERSION` constants; versioned in git.
  - `schemas.py` — `ReceiptExtractionResult`, `ExtractedLineItem` Pydantic models with `@model_validator` tolerance checks.
- Depends on: `litellm`, `app.core.config.Settings`.
- Used by: `ReceiptService.process_receipt` (via DI), `tests/llm_validation/` harness.

**Backend — Image pipeline:**
- Purpose: Pre-LLM image quality assessment and post-scan storage (thumbnails + receipt images).
- Location: `backend/app/image/`
- Contains:
  - `preprocessor.py` — `assess_image_quality(bytes) -> ImageQualityResult` using Pillow (dimensions) + OpenCV (Laplacian blur, histogram brightness).
  - `storage.py` — `FileStorage` Protocol, `LocalFileStorage` (MVP), `generate_receipt_path` / `generate_thumbnail_path`, `create_thumbnail` (JPEG, width 200 default).
- Depends on: `Pillow`, `opencv-python-headless`.
- Used by: `receipts.scan_receipt` route (quality gate before LLM call + storage after).

**Backend — Events:**
- Purpose: In-process pub/sub for post-commit side effects; drop-in replaceable with Celery/Redis.
- Location: `backend/app/events/`
- Contains:
  - `dispatcher.py` — `EventDispatcher.register(type, handler)` / `dispatch(event)`; swallows handler exceptions with `logger.exception`; module-level singleton `dispatcher`.
  - `types.py` — frozen dataclass events: `ReceiptConfirmed`, `ItemCorrected`, `BudgetThresholdBreached`.
- Used by: `ReceiptService.confirm_receipt` (dispatches `ReceiptConfirmed` + per-breach `BudgetThresholdBreached`), `ReceiptService.update_receipt` (dispatches `ItemCorrected` on name/category edits).

**Backend — Task queue:**
- Purpose: Scheduled/async work out of the request path.
- Location: `backend/app/tasks/`
- Contains:
  - `celery_app.py` — `celery_app = Celery("grocery_genie", broker=settings.redis_url)`; beat schedule for `generate_weekly_summaries` every Sunday 09:00 UTC.
  - `summary_tasks.py` — `generate_weekly_summaries` uses `get_sync_session_factory()` to build Notification rows per active user.
  - `receipt_tasks.py` — `process_receipt_async` stub for the 202-Accepted async path.
- Depends on: `celery[redis]`, `redis`, `app.core.dependencies.get_sync_session_factory`.
- Used by: Celery worker process (`celery -A app.tasks worker`).

**Backend — Core:**
- Purpose: Cross-cutting: config, DI, auth, rate limiting, seed data.
- Location: `backend/app/core/`
- Contains:
  - `config.py` — `Settings` via `pydantic-settings`, reads `.env` with `env_prefix="GG_"`, `@lru_cache` `get_settings()`.
  - `dependencies.py` — async `engine`, `async_session_factory`, `get_db()` dependency with commit/rollback semantics; sync session factory for Celery.
  - `security.py` — `get_current_user` via HTTP Bearer, looks up `User.api_token`.
  - `rate_limit.py` — `RateLimitMiddleware` (in-memory sliding window, 2 tiers: write per hour / read per minute, keyed by bearer token).
  - `seed.py` — `seed_default_categories` for the 8 default categories.

## Data Flow

**Flow: Receipt scan → confirm (5-stage pipeline):**

1. **Capture (mobile):** `mobile/app/(tabs)/scan.tsx` renders `CameraViewComponent`; on capture calls `useReceiptScan` mutation which POSTs multipart to `POST /api/receipts/scan` via `mobile/src/features/receipt-capture/services/receiptApi.ts#scanReceipt`.
2. **Quality gate (backend):** `backend/app/api/routes/receipts.py#scan_receipt` validates content type (`ALLOWED_CONTENT_TYPES`), runs `assess_image_quality` on `asyncio.to_thread` for JPEG/PNG, rejects with 422 on failure.
3. **Extract (backend):** `ReceiptService.process_receipt` (`backend/app/services/receipt_service.py`) calls the injected `ReceiptExtractor.extract(bytes, content_type)`; `LiteLLMReceiptExtractor` base64-encodes the image, sends to `litellm.acompletion` with `SYSTEM_PROMPT` at temperature 0; response JSON validated via `ReceiptExtractionResult.model_validate`.
4. **Structure (backend):** Service resolves/creates `Store` (via `StoreService.find_or_create` on normalized name), parses ISO date, checks duplicate (same user/store/date/total/item-count within 24h), persists `Receipt` (`status="pending_review"`) and one `LineItem` per extracted item.
5. **Enrich (backend):**
   - User's `UserItemMapping` overrides category if present (confidence 1.0 — deterministic).
   - Extracted category name is resolved to `Category.id`; unmatched items are batched through `CategoryAssigner.assign(names)` (LLM text-only).
   - Receipt image + thumbnail written to `LocalFileStorage` under `backend/uploads/receipts/`; URLs written back to the receipt row.
6. **Review (mobile):** Route pushes `/review` modal (`mobile/app/review.tsx`); user edits line items; `useReceiptConfirm` → `PATCH /api/receipts/{id}` with `items` corrections and/or `status: "confirmed"`.
7. **Act (backend):** `ReceiptService.update_receipt` dispatches `ItemCorrected` per edited line item and calls `_retroactive_category_update` to apply the new category to all historical items with the same normalized `raw_name`. When `status=="confirmed"`, `confirm_receipt` sets status, dispatches `ReceiptConfirmed`, then:
   - `BudgetService.check_thresholds(user_id, date)` returns `BudgetThresholdBreached` events (thresholds `[80, 100]`).
   - Per breach, `NotificationService.create_notification(...)` persists a `Notification` row and `dispatcher.dispatch(breach)` fires.
   - `AnalyticsService.emit("budget_alert_triggered", ...)` logs a structured analytics event.

**Flow: Dashboard load:**
1. Tab screen `mobile/app/(tabs)/index.tsx` reads `selectedPeriod` from `useBudgetStore` and calls `useDashboardSpending(period)`.
2. `getDashboardSpending` → `GET /api/dashboard/spending?period=YYYY-MM`.
3. `backend/app/api/routes/dashboard.py#dashboard_spending` delegates to `BudgetService.get_dashboard_data` which composes `get_budget_summary` + `get_top_items` + `get_spending_trend`.
4. Response renders `BudgetProgressCard`, `CategoryBreakdown`, `TopItemsList`, `SpendingTrendChart`.

**Flow: Offline capture → reconnect:**
1. On capture while offline, `scan.tsx` mutation fails; offline caller can `useOfflineStore.addPendingReceipt` to persist image URI + mimeType to AsyncStorage.
2. `useSyncQueue` (mounted by `SyncQueueProvider` in `mobile/app/_layout.tsx`) watches `useNetworkStatus`; when reconnected, iterates pending receipts, calls `scanReceipt`, updates status, and invalidates `['receipts']` + `['dashboard']` TanStack Query caches.

**Flow: Weekly summary (Celery beat):**
1. `celery_app.conf.beat_schedule` fires `generate_weekly_summaries` Sundays at 09:00 UTC.
2. Task opens a sync session via `get_sync_session_factory`, finds users with confirmed receipts in the past 7 days, computes totals + top category + prior-week comparison, and inserts a `Notification` of `type="weekly_summary"`.

**State Management:**
- **Server state:** TanStack Query (`QueryClient` in `mobile/app/_layout.tsx`). Query keys: `['receipts', params]`, `['dashboard', 'spending', period]`, `['categories']`, `['budgets']`. Mutations invalidate relevant keys on success.
- **Client state:** Zustand stores, one per domain, small and focused; `offlineStore` and `notificationStore` use the `persist` middleware with AsyncStorage.
- **Backend state:** Stateless services; all persistence via `AsyncSession` committed in the `get_db()` dependency's `finally` block.

## Key Abstractions

**`ReceiptExtractor` / `CategoryAssigner` (Protocol):**
- Purpose: Provider-agnostic seam for LLM calls. Enables deterministic mocks in tests and swapping providers without touching services.
- Examples: `backend/app/llm/provider.py#ReceiptExtractor`, `LiteLLMReceiptExtractor`, `MockReceiptExtractor`, `LowConfidenceMockExtractor`.
- Pattern: `typing.Protocol` + factory functions `get_receipt_extractor(settings)` / `get_category_assigner(settings)` used as FastAPI `Depends()`; chooses mock when `settings.debug`.

**`EventDispatcher` (in-process pub/sub):**
- Purpose: Decouple side effects from the write path; designed for drop-in Celery/Redis replacement.
- Examples: `backend/app/events/dispatcher.py` module singleton `dispatcher`; events in `backend/app/events/types.py` are `@dataclass(frozen=True)`.
- Pattern: Services call `dispatcher.dispatch(event)`; handlers registered via `dispatcher.register(EventType, handler)` (no handlers wired in-tree yet — events are emitted so future subscribers can react).

**`FileStorage` (Protocol):**
- Purpose: Swappable object storage — MVP uses local filesystem; production target is S3-compatible.
- Examples: `backend/app/image/storage.py#FileStorage`, `LocalFileStorage`.
- Pattern: Async `save(data, path)` / `get_url(path)`; path generation helpers keep layout deterministic (`receipts/{uuid}.jpg`, `receipts/{uuid}_thumb.jpg`).

**`AnalyticsBackend` (Protocol):**
- Purpose: Swappable analytics sink; MVP logs to a structured logger.
- Examples: `backend/app/services/analytics_service.py#AnalyticsBackend`, `ConsoleAnalyticsBackend`, `AnalyticsService`.
- Pattern: `AnalyticsService.emit(event_name, properties, user_id)` injected via `get_analytics_service` dependency.

**Pydantic schemas as boundary contracts:**
- Purpose: Explicit request/response shapes and LLM output validation; never pass raw dicts between layers.
- Examples: `backend/app/models/schemas.py` (API I/O), `backend/app/llm/schemas.py` (LLM output with `@model_validator` tolerance checks).
- Pattern: ORM → Pydantic via `Schema.model_validate(orm_obj)` with `ConfigDict(from_attributes=True)`.

**Feature hooks (mobile):**
- Purpose: Co-locate TanStack Query calls with their domain.
- Examples: `mobile/src/features/budget/hooks/useDashboard.ts`, `useBudget.ts`, `useCategories.ts`; `mobile/src/features/receipt-capture/hooks/useReceiptScan.ts`, `useReceiptReview.ts`, `useReceipts.ts`.
- Pattern: `useQuery` wrappers with per-feature `staleTime`; `useMutation` wrappers that `queryClient.invalidateQueries` on success.

## Entry Points

**Backend HTTP server:**
- Location: `backend/main.py`
- Invocation: `uvicorn main:app --reload` (from `backend/`)
- Responsibilities: Constructs `FastAPI(title="Grocery Genie API", version="0.1.0", lifespan=...)`, adds `RateLimitMiddleware` + `CORSMiddleware`, includes routers (`health`, `receipts`, `budgets`, `dashboard`, `categories`, `notifications`). Lifespan disposes the async SQLAlchemy `engine` on shutdown.

**Backend Celery worker:**
- Location: `backend/app/tasks/celery_app.py`
- Invocation: `celery -A app.tasks worker --loglevel=info` and `celery -A app.tasks beat` (from `backend/`)
- Responsibilities: Runs async tasks (`process_receipt_async`) and scheduled beat jobs (`generate_weekly_summaries`). Uses Redis broker via `settings.redis_url`.

**Backend migrations:**
- Location: `backend/alembic.ini` + `backend/migrations/env.py`
- Invocation: `alembic upgrade head`, `alembic revision --autogenerate -m "..."` (from `backend/`)
- Responsibilities: `target_metadata = Base.metadata` from `app.models.database`; runs async via `async_engine_from_config`. Note: `migrations/versions/` is currently empty (only `.gitkeep`) — schema is created via SQLAlchemy metadata rather than versioned migrations so far.

**Mobile app:**
- Location: `mobile/package.json` → `"main": "expo-router/entry"`; `mobile/app/_layout.tsx`
- Invocation: `npx expo start --ios` (from `mobile/`)
- Responsibilities: Expo Router discovers screens under `mobile/app/`. `RootLayout` wraps the tree in `QueryClientProvider`, mounts `SyncQueueProvider` (invokes `useSyncQueue`), and declares stack screens (tabs + three modals). `(tabs)/_layout.tsx` declares the three bottom tabs: Dashboard, Scan, History.

## Error Handling

**Strategy:**
- **Backend:** Services raise `ValueError` for domain errors; route handlers translate to `HTTPException` (404 when "not found" in message, else 400). Pydantic `model_validate` raises `ValidationError` auto-mapped to 422. Image-quality failures raise 422 with issue list. Low-confidence extraction (<0.3) rejected with 422 `"This doesn't appear to be a receipt."`. Rate-limit returns 429 with `Retry-After`. Event dispatcher swallows handler exceptions (logs via `logger.exception`) so one handler cannot break another.
- **Mobile:** `ApiError` (status + data) thrown from `apiClient`; screens catch via TanStack Query `onError` and show `Alert.alert`. Offline captures degrade to queue + retry via `useSyncQueue`.

**Patterns:**
- `raise HTTPException(status_code=..., detail=str(e)) from e` to preserve chain.
- `try/except Exception: pass` is used narrowly in `process_receipt` post-extraction category assignment so LLM failure falls back to "uncategorized for user review" rather than failing the scan.
- Celery summary task wraps per-user work in `try/except` with `logger.exception` so one user's failure does not poison the batch.

## Cross-Cutting Concerns

**Logging:**
- Backend: `logging.getLogger(__name__)` per module; analytics events logged via the `analytics` logger (`ConsoleAnalyticsBackend`). LLM calls log `prompt_version`, `latency_seconds`, token counts.
- Mobile: `__DEV__`-gated `console.log` only inside `useAnalytics`; no `console.log` in production code.

**Validation:**
- Backend: Pydantic v2 for every request/response and every LLM output. `@model_validator(mode="after")` on `ExtractedLineItem` / `ReceiptExtractionResult` flags tolerance violations (total ≈ qty × unit_price within 2%; subtotal ≈ sum items within 1%; date not future).
- Mobile: TypeScript strict mode across all `.ts`/`.tsx`; types mirror backend schemas in `mobile/src/features/*/types/index.ts`.

**Authentication:**
- Backend: HTTP Bearer via `fastapi.security.HTTPBearer`; `get_current_user` looks up `User.api_token`. MVP uses a seeded dev token (`"dev-token-00000000"` in `mobile/src/services/api.ts`). Every route except `/health` requires `user: User = Depends(get_current_user)`.
- Rate limiting: keyed by bearer token in `RateLimitMiddleware` (in-memory sliding window — production target is Redis).

**Dependency injection:**
- Backend: FastAPI `Depends()` for `get_db`, `get_current_user`, `get_receipt_extractor`, `get_category_assigner`, `get_analytics_service`. No global state — services constructed per-request.
- Mobile: React Context via `QueryClientProvider`; hooks read stores directly.

**Multi-tenancy (household):**
- Schema supports `household_id` on `Receipt` and `Budget` from MVP even though MVP is single-user — enables V1.1+ sharing without migration.

---

*Architecture analysis: 2026-04-19*
