# External Integrations

**Analysis Date:** 2026-04-19

## APIs & External Services

**LLM / AI:**
- **Anthropic Claude (via LiteLLM)** — Used for both receipt vision extraction and text-based category assignment.
  - SDK/Client: `litellm>=1.50.0` (sole entry point — see `backend/app/llm/provider.py`). Direct SDK calls go through `litellm.acompletion`.
  - Default model: `anthropic/claude-sonnet-4-20250514` (settings `llm_provider="anthropic"`, `llm_model="claude-sonnet-4-20250514"`, `llm_temperature=0.0` in `backend/app/core/config.py`).
  - Auth env vars: `GG_LLM_API_KEY` (app-level) and `ANTHROPIC_API_KEY` (read natively by LiteLLM). `LiteLLMReceiptExtractor.__init__` in `backend/app/llm/provider.py` copies `GG_LLM_API_KEY` into `ANTHROPIC_API_KEY` when the provider is Anthropic.
  - Provider abstraction: `ReceiptExtractor` and `CategoryAssigner` `Protocol`s in `backend/app/llm/provider.py` with `LiteLLM*` production implementations and `Mock*` / `LowConfidenceMockExtractor` test implementations; selected in `get_receipt_extractor()` / `get_category_assigner()` factories based on `settings.debug`.
  - Versioned prompts as Python modules: `backend/app/llm/prompts/receipt_extraction.py` and `backend/app/llm/prompts/category_assignment.py` (exporting `SYSTEM_PROMPT` and `PROMPT_VERSION`).
  - Output validated with Pydantic (`backend/app/llm/schemas.py` — `ReceiptExtractionResult.model_validate` after `json.loads`).

**Mobile Platform SDKs (Expo):**
- **expo-camera** — Receipt capture (`NSCameraUsageDescription` declared in `mobile/app.json`).
- **expo-image-manipulator** — Client-side image preprocessing.
- **expo-image-picker** — Import from photo library (`NSPhotoLibraryUsageDescription`).
- **expo-haptics** — Tactile feedback.
- **expo-router** — File-based routing.
- All plugins declared in `mobile/app.json` `"plugins"` array.

**Analytics:**
- **Backend:** Structured logging only (MVP). `AnalyticsService` + `ConsoleAnalyticsBackend` in `backend/app/services/analytics_service.py` emit events to `logging.getLogger("analytics")`. Interface is a `Protocol` designed for later swap to a real backend.
- **Mobile:** Stub — `mobile/src/hooks/useAnalytics.ts` logs with `console.log` when `__DEV__` is true; marked for future `POST /api/analytics/events`.

## Data Storage

**Databases:**
- **PostgreSQL (async)** — Primary relational store for users, receipts, line items, categories, stores, budgets, notifications, and user item mappings.
  - Connection: env `GG_DATABASE_URL` (default `postgresql+asyncpg://localhost:5432/grocery_genie`), configured in `backend/app/core/config.py`.
  - Client: SQLAlchemy 2.x async via `create_async_engine` in `backend/app/core/dependencies.py`. Session factory `async_sessionmaker(..., expire_on_commit=False)`; request-scoped session via FastAPI `Depends(get_db)` which commits on success and rolls back on exceptions.
  - Sync session factory (`get_sync_session_factory`) is lazily created for Celery tasks (see `backend/app/tasks/summary_tasks.py`) by rewriting the DSN (`_get_sync_database_url`).
  - Migrations: Alembic async-enabled at `backend/migrations/env.py` using `async_engine_from_config`. Versions directory `backend/migrations/versions/` is currently empty (no migrations committed; schema currently created from `Base.metadata` in dev/tests).
  - Production target: Supabase-managed Postgres with `pgvector` extension (extension reserved for V1.1 embeddings; not used in MVP code). Connection uses Supabase "Session pooler" URI per `docs/DEPLOYMENT.md`.
- **SQLite (test only)** — In-memory `sqlite+aiosqlite://` used by pytest fixtures in `backend/tests/conftest.py`. Schema created via `Base.metadata.create_all`.

**File Storage:**
- **Local filesystem** — `LocalFileStorage` in `backend/app/image/storage.py` saves receipt images and JPEG thumbnails under `settings.storage_path` (default `./uploads`). The class is declared as "designed for S3-compatible swap later" via the `FileStorage` `Protocol`.
- Paths: `receipts/{receipt_id}{ext}` and `receipts/{receipt_id}_thumb.jpg` (helpers `generate_receipt_path`, `generate_thumbnail_path`).
- Thumbnail pipeline uses Pillow (`create_thumbnail` — JPEG quality 75, configurable width via `GG_THUMBNAIL_WIDTH`, default 200 px).
- Production: volume-mounted `receipt_images` Docker volume (per `docs/DEPLOYMENT.md`). No object storage yet.

**Caching:**
- None implemented in MVP. Redis is deployed for Celery but not used as an app-level cache. `RateLimitMiddleware` (`backend/app/core/rate_limit.py`) uses in-memory `defaultdict` storage with a TODO comment to move to Redis for production.

## Authentication & Identity

**Auth Provider:**
- **Custom bearer-token auth (MVP placeholder).** `backend/app/core/security.py` defines `get_current_user` as a FastAPI dependency that looks up the `User` row by `api_token` using `HTTPBearer()`; returns 401 on miss.
  - Token is stored on `User.api_token` (`backend/app/models/database.py`, unique indexed `String(64)`).
  - Mobile hardcodes the dev token in `mobile/src/services/api.ts` (`DEV_AUTH_TOKEN = 'dev-token-00000000'`) and sends `Authorization: Bearer <token>` on every request. Comment explicitly notes this must be replaced with secure storage in production.
- No OAuth, no Supabase Auth, no Apple Sign-In, no Firebase Auth wired today.

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, Datadog, or similar SDK is imported anywhere in `backend/` or `mobile/`.

**Logs:**
- Backend uses stdlib `logging` with named loggers (`app.llm.provider`, `app.tasks.summary_tasks`, `app.image.storage`, `analytics`, `app.events.dispatcher`). Structured `extra={...}` fields are attached on LLM calls (prompt version, latency, token counts).
- Mobile logs via `console.log` guarded by `__DEV__` (e.g., `mobile/src/hooks/useAnalytics.ts`).
- Alembic loggers configured in `backend/alembic.ini` (`root` WARN, `sqlalchemy.engine` WARN, `alembic` INFO).

## CI/CD & Deployment

**Hosting:**
- **Backend:** Hetzner VPS via Docker Compose, fronted by Caddy with automatic Let's Encrypt TLS. Gunicorn runs FastAPI with Uvicorn workers. Celery worker and Celery beat are separate Compose services sharing the same image. Redis 7 (Alpine) runs as a co-located container. (See `docs/DEPLOYMENT.md`.)
- **Database:** Supabase-managed Postgres (external).
- **Mobile:** Apple App Store / TestFlight for distribution; Expo EAS for iOS builds.

**CI Pipeline:**
- None committed. No `.github/workflows/`, `.gitlab-ci.yml`, or `.circleci/` detected.
- Local-only verification via Claude Code slash commands declared in `CLAUDE.md`: `/verify-backend`, `/verify-mobile`, `/verify-all`, `/validate`, `/validate-extraction`.

## Environment Configuration

**Required env vars:**
- Backend (all prefixed `GG_`, loaded from process env or `backend/.env`):
  - `GG_DATABASE_URL` — SQLAlchemy async DSN (required in prod; default local dev DSN in code).
  - `GG_REDIS_URL` — Celery broker DSN.
  - `GG_LLM_API_KEY` / `ANTHROPIC_API_KEY` — Anthropic credentials (the first is copied to the second at LiteLLM init when provider is Anthropic).
  - `GG_LLM_PROVIDER`, `GG_LLM_MODEL`, `GG_LLM_TEMPERATURE` — LLM routing knobs.
  - `GG_STORAGE_PATH`, `GG_THUMBNAIL_WIDTH` — Local image storage config.
  - `GG_EXTRACTION_CONFIDENCE_THRESHOLD`, `GG_CATEGORY_CONFIDENCE_THRESHOLD` — Business-rule thresholds.
  - `GG_MAX_RECEIPT_SUBMISSIONS_PER_HOUR`, `GG_MAX_READS_PER_MINUTE` — Rate-limit bounds.
  - `GG_APP_NAME`, `GG_DEBUG`, `GG_DATABASE_ECHO` — App toggles; `DEBUG=true` swaps LLM factories to mock extractors.
- Deployment-only (per `docs/DEPLOYMENT.md`): `SECRET_KEY`, `ALLOWED_ORIGINS`, `ENVIRONMENT`, `STORAGE_BASE_URL`, and future `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_AUTH_KEY_PATH`.
- Mobile: `EXPO_PUBLIC_API_URL` — Base URL for the backend (read in `mobile/src/services/api.ts` and `mobile/src/features/receipt-capture/services/receiptApi.ts`).

**Secrets location:**
- No `.env*` files committed. `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`.
- Deployment guide specifies `docker/.env.production` for production env vars (explicitly "DO NOT commit"). No secret manager (AWS SM, Vault, Doppler, 1Password CLI) integrated.

## Webhooks & Callbacks

**Incoming:**
- None. No webhook routes are registered in `backend/main.py` (only `health`, `receipts`, `budgets`, `dashboard`, `categories`, `notifications`).

**Outgoing:**
- None currently dispatched. Push notifications are planned (APNs env vars stubbed in deployment doc, `expo-notifications` not yet declared) but no outbound HTTP delivery is implemented.

## Internal Cross-Service Communication

- **Domain events (in-process):** `EventDispatcher` in `backend/app/events/dispatcher.py` is a synchronous in-process bus (`defaultdict`-backed handler registry, `dispatcher.dispatch(event)`). Event types in `backend/app/events/types.py` (e.g., `ReceiptConfirmed`, `ItemCorrected`). Comment in `dispatcher.py` notes it is "designed for drop-in replacement with Celery/Redis-backed dispatch later."
- **CORS:** Wide-open in MVP — `allow_origins=["*"]` in `backend/main.py`, flagged `# Tighten for production`.
- **Rate limiting:** In-app `RateLimitMiddleware` keyed by bearer token. Tiered windows: `max_receipt_submissions_per_hour` for `POST/PUT/PATCH/DELETE`, `max_reads_per_minute` for `GET`. Skips `/health` and unauthenticated requests.

---

*Integration audit: 2026-04-19*
