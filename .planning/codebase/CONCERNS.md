# Codebase Concerns

**Analysis Date:** 2026-04-19
**Build Phase:** MVP (Budget Copilot)
**Scope Reminder:** iOS-only; no V1.1+ features.

Actionable tech-debt register. Severity: CRITICAL = blocks launch / security / data loss; HIGH = bug or significant quality gap; MEDIUM = maintainability / correctness gap; LOW = polish.

---

## Tech Debt

### [HIGH · maintainability · LLM-robustness] Silent exception swallowing in category assignment fallback
- Files: `backend/app/services/receipt_service.py:168-184`
- Issue: `try / except Exception: pass` swallows every error from `self.category_assigner.assign(...)` with no logging. On any LLM provider failure (timeout, auth error, malformed JSON), items are silently left uncategorized; no metric, no log, no alert. Directly undermines the "fallback to rule-based processing if LLM unavailable" requirement in CLAUDE.md.
- Fix: Catch specifically (LiteLLM exceptions, `json.JSONDecodeError`, `ValidationError`); `logger.exception(...)`; emit `category_assignment_failed` analytics event; implement rule-based fallback (keyword → category map) rather than leaving items `None`.

### [HIGH · LLM-robustness] No structured-output validation on category-assignment LLM response
- Files: `backend/app/llm/provider.py:179-211`
- Issue: `LiteLLMCategoryAssigner.assign(...)` returns `json.loads(raw_content)` with no Pydantic validation. CLAUDE.md mandates: "Pydantic models validate all LLM structured outputs before persistence." The receipt extractor validates via `ReceiptExtractionResult.model_validate`; the category assigner does not. A malformed response (object instead of array, missing fields, extra keys) will crash or write garbage into `LineItem.category_id` / `category_confidence`.
- Fix: Define `CategoryAssignment(BaseModel)` and `CategoryAssignmentList(RootModel[list[CategoryAssignment]])`. Validate and raise. Enforce `category` is in the allowed enum.

### [HIGH · LLM-robustness] Pydantic validators are no-ops (price/subtotal/date drift)
- Files: `backend/app/llm/schemas.py:15-24`, `backend/app/llm/schemas.py:37-47`, `backend/app/llm/schemas.py:49-59`
- Issue: `check_price_tolerance`, `check_date_not_future`, `check_subtotal_tolerance` all detect drift then `pass`. Comments say "Don't reject — just flag via lower confidence in practice" but nothing is flagged anywhere. The validation layer is dead code; extraction defects ship straight to the DB.
- Fix: Either downgrade `confidence` in-place when drift detected, or attach a `warnings: list[str]` field. Add tests verifying each validator produces an observable effect.

### [HIGH · LLM-robustness · i18n] Future-dated receipts silently accepted
- Files: `backend/app/llm/schemas.py:37-47`, `backend/app/services/receipt_service.py:76`
- Issue: `date.fromisoformat(extraction.date)` called unconditionally in `process_receipt`. Schema comment acknowledges future dates but validator does nothing. Combined with international date formats (DD/MM/YYYY vs MM/DD/YYYY), transposed day/month can produce dates a year out — budget queries then miss the receipt.
- Fix: Clamp to `date.today()` and emit correction-needed warning, OR reject with 422 if date >1 day in future. Add `en_gb`, `fr_fr`, `de_de` ground-truth fixtures with DD/MM/YYYY.

### [MEDIUM · LLM-robustness] `temperature=0` is configurable, not enforced
- Files: `backend/app/core/config.py:23`, `backend/app/llm/provider.py:32-39`, `backend/app/llm/provider.py:171-177`
- Issue: `llm_temperature` defaults to 0.0 but env-var override (`GG_LLM_TEMPERATURE=0.7`) silently loosens determinism. CLAUDE.md: "Temperature = 0 for all extraction tasks." No assertion or check.
- Fix: Hard-code `temperature=0` in provider classes (drop from `Settings`), or add startup assertion that `llm_temperature == 0.0`.

### [MEDIUM · LLM-robustness] Process-environment mutation for LLM API key
- Files: `backend/app/core/config.py:21-24`, `backend/app/llm/provider.py:37-39`, `backend/app/llm/provider.py:176-177`
- Issue: `os.environ["ANTHROPIC_API_KEY"] = self.api_key` is set unconditionally when `llm_provider == "anthropic"`. Provider abstraction (the point of LiteLLM) is undermined; key still clobbers `ANTHROPIC_API_KEY`. `{provider}/{model}` never validated against LiteLLM's supported set.
- Fix: Use LiteLLM's per-call `api_key` parameter (already passed — the `os.environ` writes are redundant and unsafe). Delete the environment mutation. Validate `{provider}/{model}` at startup.

### [MEDIUM · LLM-robustness] No prompt-injection defense
- Files: `backend/app/llm/prompts/receipt_extraction.py:3-123`, `backend/app/llm/prompts/category_assignment.py:3-42`
- Issue: Receipt image content is attacker-controlled. An adversarial receipt could contain printed text designed to override the system prompt (e.g., text instructing the model to zero out the total). No output-validation step re-asserts invariants against the input; the extractor trusts whatever JSON comes back.
- Fix: Add sanity-check pass — sum of line items ≈ subtotal within tolerance (already defined but not enforced). Reject extractions where `subtotal < 0`, `total < 0`, `items` is empty. Consider a second LLM call with "is this a plausible receipt?" validation.

### [MEDIUM · maintainability] `confirm_receipt` calls services synchronously instead of via events
- Files: `backend/app/services/receipt_service.py:206-279`
- Issue: CLAUDE.md: "Event-driven architecture: downstream features react to domain events, not synchronous calls." But `confirm_receipt` dispatches `ReceiptConfirmed` AND instantiates `BudgetService` / `NotificationService` directly (lines 246-269). The event is fire-and-forget with zero registered handlers — the real work is synchronous. This is exactly the coupling the architecture is meant to avoid.
- Fix: Register a `ReceiptConfirmed` handler in `backend/app/events/wiring.py`, imported at app startup. Move budget-threshold check + notification creation into the handler.

### [MEDIUM · maintainability] `EventDispatcher` has no registered handlers — no-op
- Files: `backend/app/events/dispatcher.py:9-35`, `backend/app/services/receipt_service.py:224-243`, `backend/app/services/receipt_service.py:302-310`, `backend/app/services/receipt_service.py:328-340`, `backend/app/services/receipt_service.py:279`
- Issue: `dispatcher.register(...)` called nowhere. Every `dispatcher.dispatch(...)` walks an empty handler list. Dead architecture, misleading to future contributors.
- Fix: Either delete the dispatcher (if in-process sync is fine for MVP), or wire at least one handler (e.g. analytics emission for `ItemCorrected`).

### [MEDIUM · maintainability] Empty Celery stub: `process_receipt_async` has no body
- Files: `backend/app/tasks/receipt_tasks.py:1-10`
- Issue: Function has a docstring but empty body. PRD calls for async 202-Accepted path; stub is a placeholder. `scan_receipt` route never dispatches to it — everything runs synchronously.
- Fix: Implement, or delete until the async path is actually needed.

### [MEDIUM · security] CORS wide-open placeholder
- Files: `backend/main.py:34-40`
- Issue: `allow_origins=["*"]` with `allow_credentials=True` — browsers refuse this combination; in production it's a CSRF-adjacent footgun. Comment says "Tighten for production" but no ticket tracks it.
- Fix: Drive from `Settings.cors_origins: list[str]`. Default `[]` and fail fast in non-debug mode.

### [MEDIUM · security · performance] Rate limiter in-memory and per-process
- Files: `backend/app/core/rate_limit.py:11-80`
- Issue: Docstring acknowledges "MVP uses in-memory storage; production should use Redis." With multiple uvicorn workers, limits become `N_workers × configured_limit`. Tokens (raw Bearer strings) stored in a dict indefinitely — unbounded memory growth.
- Fix: Swap to Redis-backed sliding window using existing `redis_url`.

### [MEDIUM · maintainability] `main.py` lifespan doesn't seed default categories
- Files: `backend/main.py:19-25`, `backend/app/core/seed.py:18-33`
- Issue: `seed_default_categories` exists and tests call it, but `lifespan` startup block is empty. First-time prod boot has no categories, breaking every LLM extraction that maps `extracted_item.category` → `category_lookup` (`receipt_service.py:121`).
- Fix: In `lifespan` startup, open a session and call `seed_default_categories`.

### [MEDIUM · security] No Alembic migration committed
- Files: `backend/migrations/versions/` (only `.gitkeep`), `backend/migrations/env.py:1-64`, `backend/app/models/database.py:1-196`
- Issue: Schema exists only in SQLAlchemy models. Tests use `Base.metadata.create_all`; prod has no version-controlled DDL. PRD mandates Alembic.
- Fix: Generate baseline migration (`alembic revision --autogenerate -m "initial schema"`), commit. Add CI check that `alembic check` is clean.

### [MEDIUM · maintainability] Runtime `assert` for invariant enforcement
- Files: `backend/app/services/receipt_service.py:57`
- Issue: `assert self.extractor is not None, ...` is compiled out under `python -O`. In hardened deploy, becomes a silent `AttributeError` instead of clear startup failure.
- Fix: Replace with `if self.extractor is None: raise RuntimeError(...)`.

### [MEDIUM · maintainability] String-matching error handling (`"not found" in str(e).lower()`)
- Files: `backend/app/api/routes/budgets.py:64-67`, `backend/app/api/routes/receipts.py:171-173`, `backend/app/api/routes/receipts.py:189-191`
- Issue: Routes inspect text of `ValueError` to decide 404 vs 400. Reworded message breaks status code. Ties HTTP concerns into service-layer message strings.
- Fix: Introduce `ReceiptNotFoundError`, `BudgetNotFoundError`. Routes map exception class → status code.

### [MEDIUM · maintainability] Category names duplicated in four places with mismatched shapes
- Files: `backend/app/core/seed.py:6-15`, `backend/app/llm/prompts/receipt_extraction.py:63-73`, `backend/app/llm/prompts/category_assignment.py:9-16`, `mobile/src/constants/categories.ts:1-11`
- Issue: The 8-category MVP enum lives in four places that must stay in sync. Mobile uses string slugs (`'groceries'`); backend uses UUIDs — see next item.
- Fix: Single source of truth (`backend/app/core/categories.py` enum) used by prompts + seed. Mobile should fetch real UUIDs via `GET /api/categories` (it already does via `useCategories`) and delete `DEFAULT_CATEGORIES`.

### [HIGH · maintainability · bug] Mobile `DEFAULT_CATEGORIES` uses string IDs that never match backend UUIDs
- Files: `mobile/src/constants/categories.ts:1-11`, `mobile/src/features/receipt-capture/components/CategoryPicker.tsx:29`, `mobile/src/features/receipt-capture/components/LineItemCard.tsx:23-25`
- Issue: `CategoryPicker` and `LineItemCard` fall back to `DEFAULT_CATEGORIES` (slugs) when a real `categories` prop isn't passed. The resulting `categoryId` never matches the backend's UUID. Tapping a category in `LineItemCard` fires `onUpdate('categoryId', 'groceries')`; saving produces a PATCH body with `category_id: 'groceries'` that Pydantic rejects (expects UUID). `CategoryPicker` in `review.tsx` is invoked without a `categories` prop (`LineItemCard.tsx:89-94`) so the slug path is the default.
- Fix: Pass `useCategories()` data into `LineItemCard`/`CategoryPicker`. Delete the constant. E2E test the correction flow.

### [LOW · maintainability] `useMemo` used as side-effect (setState inside) in review screen
- Files: `mobile/app/review.tsx:89-95`
- Issue: `useMemo(() => { if (...) { setStoreName(...); setReceiptDate(...); setItems(...); } }, [...])`. Calling `setState` inside `useMemo` violates purity and causes warnings/extra renders.
- Fix: Convert to `useEffect`.

### [LOW · maintainability] ESLint disable directives mask dependency bugs
- Files: `mobile/app/review.tsx:45`, `mobile/src/hooks/useSyncQueue.ts:43`
- Issue: Two `// eslint-disable-line react-hooks/exhaustive-deps` directives silence the linter rather than resolving missing deps. Hides real bugs: if `pendingReceipts` changes while online, sync won't re-fire.
- Fix: Add the dep array correctly; guard with a ref to avoid loops.

### [LOW · maintainability] `ReceiptScanResponse` mobile type missing `duplicate_warning`
- Files: `mobile/src/features/receipt-capture/types/index.ts:25-29`, `backend/app/models/schemas.py:31-35`
- Issue: Backend returns `duplicate_warning: bool`; mobile type doesn't declare it. Duplicate-detection UI can't be built without widening to `any`.
- Fix: Add `duplicate_warning: boolean;` and surface in scan flow.

### [LOW · maintainability] Console-only analytics; ESLint `no-console` warns
- Files: `mobile/src/hooks/useAnalytics.ts:7`, `backend/app/services/analytics_service.py:11-24`, `mobile/eslint.config.mjs:7`
- Issue: Mobile uses `console.log` inside `__DEV__`; ESLint rule `no-console: 'warn'` flags it indefinitely.
- Fix: Route through a logger module where `no-console` is disabled by file.

### [LOW · maintainability] Mobile `fetch` in two places — one bypasses shared client
- Files: `mobile/src/services/api.ts:21-34`, `mobile/src/features/receipt-capture/services/receiptApi.ts:11-36`
- Issue: `scanReceipt` uses raw `fetch` for FormData. Error handling duplicates `apiClient`'s logic. No retry, no timeout.
- Fix: Extend `apiClient` to accept FormData; add `AbortSignal.timeout(30_000)`.

---

## Known Bugs

### [HIGH · bug] Local file storage URL `/uploads/{path}` is never mounted in FastAPI
- Files: `backend/app/image/storage.py:31-32`, `backend/main.py:27-47`
- Symptoms: After a successful scan, `ReceiptResponse.image_url` points at `/uploads/receipts/{uuid}.jpg`, but FastAPI has no `StaticFiles` mount for `/uploads`. Mobile `Image source={{ uri: imageUri }}` (`mobile/app/review.tsx:180`) will 404. Appears to work locally only if another layer serves `./uploads`.
- Trigger: Any confirmed receipt, re-opened from History.
- Fix: `app.mount("/uploads", StaticFiles(directory=settings.storage_path), name="uploads")`, gated by `debug=True`. Production should use S3/signed URLs.

### [HIGH · bug · i18n] Receipt date parsing assumes ISO format, no locale handling
- Files: `backend/app/services/receipt_service.py:76`, `backend/app/services/receipt_service.py:413`, `backend/app/services/receipt_service.py:425`, `backend/app/llm/schemas.py:40-46`
- Symptoms: `date.fromisoformat(extraction.date)` raises `ValueError` on any non-ISO format. LLM prompt asks for `YYYY-MM-DD` but compliance isn't guaranteed, especially for non-English receipts. Failure bubbles up as 500.
- Trigger: LLM output `"15/03/2026"`, `"March 15, 2026"`.
- Fix: Wrap with try/except → 422 with clear message, or fall back to `dateutil.parser.parse(...).date()`.

### [HIGH · bug · i18n] Receipt parsing monetary-locale-brittle downstream of LLM
- Files: `backend/app/llm/prompts/receipt_extraction.py:13-16`, `backend/app/llm/schemas.py:6-24`, `backend/app/services/receipt_service.py:126-135`
- Symptoms: Prompt instructs the LLM to normalize decimal separators to `.`. If it fails (Serbian or German receipt), Pydantic raises validation error on `float` fields with no user-facing message. No test covers non-US decimals.
- Fix: Pre-normalize numeric strings with a locale-aware helper. Add `de_de_01.json`, `fr_fr_01.json`, `sr_rs_01.json` fixtures.

### [MEDIUM · bug] `list_receipts` count query ignores filters when only `to_date` supplied
- Files: `backend/app/services/receipt_service.py:377-437`
- Symptoms: `count_query` is rebuilt when `store` or `from_date` is supplied, but NOT when only `to_date` is supplied (line 424-426 patches only primary `query`). `total` is wrong for `GET /api/receipts?to_date=...`.
- Fix: Build `count_query` from shared WHERE clauses, or use `select(func.count()).select_from(query.subquery())` after all filters applied.

### [MEDIUM · bug] Retroactive category update doesn't filter by status
- Files: `backend/app/services/receipt_service.py:495-518`
- Symptoms: Updates category on historical line items but doesn't filter `Receipt.status == 'confirmed'`. Pending/draft receipts have categories overwritten — undocumented policy.
- Fix: Decide policy (confirmed-only vs all) and enforce with explicit `Receipt.status` filter + test.

### [MEDIUM · bug] Duplicate detection uses 24-hour created_at window, not receipt date
- Files: `backend/app/services/receipt_service.py:520-554`
- Symptoms: Same receipt scanned 25h later isn't flagged (common: forgot to confirm). Two legitimate same-day trips wrongly flagged.
- Fix: Use `receipt.date` + `store_id` + `total` without 24-hour window. Add items-hash to distinguish two real trips with the same total.

### [LOW · bug] `get_period_dates` — no validator on `period_start`
- Files: `mobile/app/budget-settings.tsx:41`, `backend/app/services/budget_service.py:69-107`
- Symptoms: Mobile clamps `start_day` to 28; server-side clamps correctly. But if a client POSTs `period_start = "2026-02-30"`, `date.fromisoformat` raises without a 422 guard.
- Fix: Pydantic `@field_validator` on `BudgetCreateRequest.period_start`.

### [LOW · bug] `notification-settings` mobile screen doesn't persist to backend
- Files: `mobile/app/notification-settings.tsx:1-169`, `mobile/src/store/notificationStore.ts:1-52`, `backend/app/services/budget_service.py:20`
- Symptoms: Toggles modify local Zustand store (persisted via AsyncStorage) but never POST to backend. Backend `DEFAULT_THRESHOLDS = [80, 100]` is hardcoded. User toggles have no effect on real alerts.
- Fix: (a) Implement user threshold preferences (add `User.alert_thresholds: list[int]`, read in `check_thresholds`), or (b) filter notifications client-side by threshold before display and relabel the UI.

---

## Security Considerations

### [CRITICAL · security] Mobile ships with hardcoded auth token
- Files: `mobile/src/services/api.ts:3-10`
- Risk: `const DEV_AUTH_TOKEN = 'dev-token-00000000';` is the sole credential for every request. No login, no secure storage (Keychain), no refresh. Anyone inspecting the IPA gets API access.
- Mitigation: Comment says "Replace with secure storage in production."
- Recommendation: Block launch. Implement email+OTP login before TestFlight. Minimum bar: server-issued device-scoped tokens stored in `expo-secure-store`, rotatable.

### [HIGH · security] Bearer tokens stored as plaintext in DB
- Files: `backend/app/models/database.py:30`, `backend/app/core/security.py:12-29`
- Risk: `User.api_token` is plain `String(64)`, indexed, unique. `get_current_user` queries by raw token. DB leak exposes all live sessions.
- Recommendation: Store `sha256(token)` at rest. Never log the raw token. Add expiration column and rotation endpoint.

### [MEDIUM · security] LLM provider key written into process environment per request
- Files: `backend/app/llm/provider.py:38-39`, `backend/app/llm/provider.py:176-177`
- Risk: `os.environ["ANTHROPIC_API_KEY"] = self.api_key` mutates global process state cross-request. In a multi-tenant future, one request can poison another. Bad hygiene even single-tenant.
- Recommendation: LiteLLM already accepts `api_key=...` per call — delete the environment writes.

### [MEDIUM · security] No request body size cap on `/api/receipts/scan`
- Files: `backend/app/api/routes/receipts.py:78-96`
- Risk: `await file.read()` without a size ceiling. A 500MB PDF can OOM a worker.
- Recommendation: ASGI body-size middleware or check `Content-Length` before reading. Reject > 10MB with 413.

### [MEDIUM · security] Rate limiter identifies clients by Bearer-token string
- Files: `backend/app/core/rate_limit.py:29-33`, `backend/app/core/rate_limit.py:45-50`
- Risk: Unauthenticated requests skip rate limiting entirely — leaving the auth surface uncapped. Invalid tokens still hit the DB (`security.py:21`) without being rate-limited.
- Recommendation: Rate-limit by client IP for unauthenticated requests. Cache invalid-token lookups briefly.

### [LOW · security] Receipt images stored on local disk with UUIDs — no ACL
- Files: `backend/app/image/storage.py:17-32`, `backend/app/api/routes/receipts.py:130-156`
- Risk: Once `/uploads` is mounted, any authenticated user who guesses a receipt UUID can fetch another user's image. No ownership check on the static path.
- Recommendation: Serve via authenticated route (`GET /api/receipts/{id}/image`) validating ownership. Or signed URLs (S3 presigned) in prod.

### [LOW · security] `DB_ECHO` env-driven but no redaction
- Files: `backend/app/core/config.py:15`, `backend/app/core/dependencies.py:17`
- Risk: `GG_DATABASE_ECHO=true` in prod logs every query including user tokens passed as parameters in auth lookups. Combined with plaintext `api_token`, this dumps live credentials to logs.
- Recommendation: Refuse to enable `database_echo` when `debug=False`.

---

## Performance Bottlenecks

### [HIGH · performance] N+1 on duplicate-detection item count
- Files: `backend/app/services/receipt_service.py:544-554`
- Problem: For each candidate receipt, a separate `SELECT count(*) FROM line_items` is issued.
- Fix: Single query joining `Receipt ↔ LineItem`, GROUP BY `receipt_id`, returning `(receipt_id, item_count)`.

### [MEDIUM · performance] `get_dashboard_data` issues 3+N queries per trend month
- Files: `backend/app/services/budget_service.py:261-299`, `backend/app/services/budget_service.py:301-320`
- Problem: `get_spending_trend` loops for `months=3`. Inside each iteration: `get_period_dates` queries `Budget`, `get_total_spending` aggregates `LineItem`, plus another `Budget` query. 6 queries just for trend, plus summary + top_items.
- Fix: Single aggregate with `date_trunc('month', Receipt.date)` GROUP BY. Fetch budgets once outside the loop.

### [MEDIUM · performance] `list_receipts` count query unnecessarily wraps a subquery
- Files: `backend/app/services/receipt_service.py:396-410`
- Problem: `select(func.count()).select_from(select(Receipt.id).where(...).subquery())` prevents the planner from using `ix_receipts_user_date` index optimally.
- Fix: `select(func.count(Receipt.id)).where(...)` directly.

### [LOW · performance] Thumbnail always JPEG regardless of source
- Files: `backend/app/image/storage.py:45-54`, `backend/app/api/routes/receipts.py:140-148`
- Problem: PNG source → JPEG thumbnail (lossy). HEIC source bypasses thumbnail entirely (`thumbnail_url = image_url`, line 148) — History shows full HEIC in list views.
- Fix: Add HEIC support via `pillow-heif` or reject HEIC in MVP.

---

## Fragile Areas

### [HIGH · fragile · LLM-robustness] LLM system prompts ship untested
- Files: `backend/app/llm/prompts/receipt_extraction.py:1-123`, `backend/app/llm/prompts/category_assignment.py:1-42`, `backend/tests/llm_validation/receipts/` (empty)
- Why fragile: Prompts are the competitive moat per CLAUDE.md. The harness (`backend/tests/llm_validation/test_extraction_accuracy.py:101-185`) will skip every test: `receipts/` directory is empty and `GG_LLM_API_KEY` isn't set in CI. Only `ground_truth/en_us_01.json` exists without a paired image.
- Test coverage: Effectively zero for the core IP.
- Fix: (1) Add ≥10 receipt images + ground-truth pairs covering US/UK/DE/FR/SR. (2) Run accuracy tests in CI with a masked `GG_LLM_API_KEY`. (3) Add an adversarial-prompt test: a receipt image containing printed text targeted at overriding the system prompt, verifying the extractor rejects or neutralizes it.

### [MEDIUM · fragile] `_layout.tsx` `SyncQueueProvider` runs without gating
- Files: `mobile/app/_layout.tsx:9-17`, `mobile/src/hooks/useSyncQueue.ts:1-44`
- Why fragile: `useSyncQueue` depends only on `isConnected`; `queryClient`/`pendingReceipts` captured at render and never refreshed. Fast airplane-mode toggles race an in-flight `syncPending` loop. No idempotency on `scanReceipt`.
- Fix: `isSyncing` ref; idempotent `syncPending`; include `pendingReceipts.length` in deps.

### [MEDIUM · fragile] Multi-tenant schema never exercised (`household_id` columns unused)
- Files: `backend/app/models/database.py:83`, `backend/app/models/database.py:140`, `backend/app/events/types.py:11`
- Why fragile: CLAUDE.md says schema supports households from day 1, but no path sets/reads `household_id`. Will drift silently before V1.5.
- Fix: Wire minimal "default household per user" now, or add `CHECK (household_id IS NULL)` to document dormancy.

### [MEDIUM · fragile] Dark-mode colors defined, no component consumes them
- Files: `mobile/src/constants/theme.ts:18-33`, `mobile/src/hooks/useTheme.ts:1-8`
- Why fragile: 154 occurrences of `colors.light.*` across 19 files. `colors.dark.*` referenced only in `theme.test.ts`. `useTheme()` not imported by any component. With `userInterfaceStyle: "automatic"` in `app.json`, dark mode will render broken.
- Fix: (a) Force `userInterfaceStyle: "light"` for MVP and delete dark palette, or (b) migrate components to `useTheme()`.

### [LOW · fragile] Haptics fire without fallback
- Files: `mobile/src/features/receipt-capture/components/CaptureButton.tsx:29`, `mobile/src/features/receipt-capture/components/ConfirmButton.tsx:1`
- Why fragile: `Haptics.impactAsync` rejects on simulators / devices without Taptic Engine. `await` before `onPress()` blocks handler on hang.
- Fix: `Haptics.impactAsync(...).catch(() => {})` fire-and-forget; don't await.

---

## Scaling Limits

### [MEDIUM · performance] In-memory rate limiter scales to 1 worker
- Files: `backend/app/core/rate_limit.py:11-80`
- Scaling path: Redis-backed sliding window using existing `redis_url`.

### [MEDIUM · performance] Local file storage scales to 1 API host
- Files: `backend/app/image/storage.py:17-32`
- Scaling path: Implement `S3FileStorage` satisfying the `FileStorage` protocol.

### [LOW · performance] EventDispatcher is in-process only
- Files: `backend/app/events/dispatcher.py:9-35`
- Scaling path: Docstring already plans Celery/Redis swap; wire when V1.1 cross-service handlers arrive.

---

## Dependencies at Risk

### [LOW · maintainability] `react-native` 0.83.2 + `react` 19.2.0 is bleeding-edge
- Files: `mobile/package.json:24-25`
- Risk: Many RN libs lag React 19 support. Friction adding libraries.
- Plan: Keep pinned; revisit if ecosystem stalls.

### [LOW · maintainability] Test suite runs on aiosqlite; prod on asyncpg
- Files: `backend/tests/conftest.py:18`, `backend/app/models/database.py:79`
- Risk: SQLite doesn't support pgvector, collations, several Postgres casts. V1.1 pgvector work requires migration.
- Plan: `testcontainers-python` with real Postgres for integration tests.

---

## Missing Critical Features

### [CRITICAL · phase-scope] No login / session flow
- Files: `mobile/src/services/api.ts:3-10`, `backend/app/core/security.py:1-29`
- Blocks: TestFlight and any real user. See CRITICAL security item.

### [HIGH · phase-scope] No LLM-fallback-to-rule-based path
- Files: `backend/app/services/receipt_service.py:152-184`, `backend/app/llm/provider.py` (no rule-based class)
- Blocks: Receipt-scan availability when Anthropic is down. CLAUDE.md mandates the fallback.

### [HIGH · phase-scope] No image-served-to-client path
- Files: `backend/app/image/storage.py:31-32`, `backend/main.py`
- See HIGH bug above. Receipts save but images can't be retrieved.

### [MEDIUM · phase-scope] Notification delivery in-app only; no APNs wiring
- Files: `backend/app/services/notification_service.py:1-78`, `backend/app/tasks/summary_tasks.py:79-92`, `mobile/package.json` (no `expo-notifications`)
- CLAUDE.md lists `expo-notifications`; not in package.json. Confirm against `docs/prd/PHASE_SCOPE.md` whether in-app-only is acceptable for MVP.

---

## Test Coverage Gaps

### [CRITICAL · LLM-robustness] LLM validation harness has no test data
- Files: `backend/tests/llm_validation/receipts/` (empty), `backend/tests/llm_validation/ground_truth/en_us_01.json` (1 file, image missing)
- All three test classes (`test_field_level_accuracy`, `test_zero_hallucination_rate`, `test_item_recall`, `test_extraction_consistency`, `test_prompt_regression`) `pytest.skip("No receipt test images available")` on every run. Core differentiator: zero automated coverage.

### [HIGH · phase-scope] No test for prompt-injection resistance
- Files: `backend/tests/llm_validation/`
- Missing: A receipt image containing adversarial printed text targeted at overriding the system prompt, asserting the extractor detects and rejects the manipulation.

### [HIGH · i18n] No non-US-locale receipt fixtures
- Files: `backend/tests/llm_validation/ground_truth/` (only `en_us_01.json`)
- Missing: comma-decimal (DE/FR), DD/MM/YYYY (UK/FR), Cyrillic (SR), non-Latin (ZH). CLAUDE.md lists Serbian/Cyrillic, Mandarin.

### [MEDIUM · maintainability] No test for retroactive category update policy
- Files: `backend/app/services/receipt_service.py:495-518`, `backend/tests/services/`
- Missing: whether correction propagates to confirmed only or all; scoping to user.

### [MEDIUM · maintainability] No test for `list_receipts` total-count with only `to_date`
- Files: `backend/app/services/receipt_service.py:377-437`, `backend/tests/api/test_receipts.py`
- Current code returns a wrong total. See MEDIUM bug.

### [MEDIUM · phase-scope] No test that default categories seed on app startup
- Files: `backend/main.py:19-25`, `backend/app/core/seed.py`
- Fresh DB after `lifespan` startup has no categories.

### [LOW · accessibility] No test verifies every interactive element has `accessibilityLabel`
- Files: `mobile/src/**/*.tsx`
- 53 `Pressable` occurrences across 13 files. Manual grep shows most set it; no test gate.

### [LOW · phase-scope] No E2E tests
- No Detox or Playwright harness configured, despite CLAUDE.md listing Detox.

---

## Phase-Scope Compliance Notes

Grep of `backend/app/`, `mobile/src/`, `mobile/app/` found **no** V1.1+ references:
- No `PriceChangeDetected`, `IngredientExpiring`, recipe, pantry, pgvector, rapidfuzz, sentence-transformers, FAISS.
- No `subscription`, `paywall`, `stripe`, `premium`, `checkout`.
- No `expo-notifications` or payment SDKs.
- No Android-targeted source code. `Platform.OS` used once (`mobile/app/budget-settings.tsx:78`). `app.json:9` declares `"platforms": ["ios"]`.

Scope-adjacent items to re-verify against `docs/prd/PHASE_SCOPE.md`:
- `mobile/src/store/offlineStore.ts` + `useSyncQueue` implement an offline queue.
- `mobile/app/notification-settings.tsx` ships a threshold UI whose backend counterpart is hardcoded (see MEDIUM bug).

---

*Concerns audit: 2026-04-19*
