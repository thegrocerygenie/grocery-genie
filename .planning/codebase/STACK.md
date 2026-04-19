# Technology Stack

**Analysis Date:** 2026-04-19

## Languages

**Primary:**
- Python 3.12+ — Backend API and async task workers (`backend/`)
- TypeScript 5.9 (strict mode) — React Native mobile client (`mobile/`)

**Secondary:**
- SQL (PostgreSQL dialect) — Declared implicitly via SQLAlchemy models in `backend/app/models/database.py` and migrations in `backend/migrations/versions/` (versions directory currently empty)
- TSX/JSX — React Native UI in `mobile/app/` and `mobile/src/`
- Mako templates — Alembic migration template at `backend/migrations/script.py.mako`

## Runtime

**Environment:**
- **Backend:** Python 3.12+ (`requires-python = ">=3.12"` in `backend/pyproject.toml`). ASGI server is `uvicorn[standard]` for dev; production uses Gunicorn with Uvicorn workers (per `docs/DEPLOYMENT.md`).
- **Mobile:** React Native 0.83.2 on React 19.2.0, Expo SDK 55 (managed workflow). Runtime target: iOS 16+ only (`platforms: ["ios"]` in `mobile/app.json`, `supportsTablet: false`).

**Package Manager:**
- **Backend:** `pip` / `setuptools` via PEP 621 project table. Packaging declared in `backend/pyproject.toml` with `setuptools>=75.0`. Lockfile: none (no `requirements.txt`, `poetry.lock`, or `uv.lock` committed).
- **Mobile:** `npm`. Lockfile present: `mobile/package-lock.json` (~546k).

## Frameworks

**Core:**
- **FastAPI ≥0.115** — HTTP framework, mounted in `backend/main.py` with CORS middleware and in-memory `RateLimitMiddleware` (`backend/app/core/rate_limit.py`).
- **SQLAlchemy 2.0.35+** with `[asyncio]` extra — ORM and connection pooling; async engine created in `backend/app/core/dependencies.py` using `create_async_engine`. Declarative models in `backend/app/models/database.py` via `DeclarativeBase` / `Mapped` / `mapped_column`.
- **asyncpg ≥0.30** — PostgreSQL async driver (used in `postgresql+asyncpg://` DSN in `backend/app/core/config.py`).
- **Alembic ≥1.13** — DB migrations. Async-aware env at `backend/migrations/env.py` (uses `async_engine_from_config`). Config at `backend/alembic.ini`. Sync URL conversion helper in `backend/app/core/dependencies.py` (`_get_sync_database_url`) strips `+asyncpg`/`+aiosqlite` for sync Celery tasks.
- **Pydantic v2 ≥2.9** — Request/response schemas (`backend/app/models/schemas.py`) and LLM output validation (`backend/app/llm/schemas.py`).
- **pydantic-settings ≥2.5** — Env-based configuration in `backend/app/core/config.py` (env prefix `GG_`, reads `.env`).
- **Celery 5.4+** with `[redis]` extra — Async task queue, app at `backend/app/tasks/celery_app.py`. Beat schedule runs `generate_weekly_summaries` Sundays 09:00 UTC.
- **LiteLLM ≥1.50** — Provider-agnostic LLM interface, used in `backend/app/llm/provider.py` via `litellm.acompletion`. Default provider/model: `anthropic/claude-sonnet-4-20250514`, temperature `0.0`.
- **Expo SDK ~55.0** + **expo-router ~55.0** — Managed React Native workflow and file-based routing. Entry: `expo-router/entry` (`mobile/package.json` `"main"`).
- **React Native 0.83.2** with **React 19.2.0**.
- **TanStack Query ^5.62** — Server state, provider wired in `mobile/app/_layout.tsx` (`QueryClientProvider`).
- **Zustand ^5.0** — Client state; stores in `mobile/src/store/` (one per domain: `budgetStore.ts`, `notificationStore.ts`, `offlineStore.ts`, `receiptStore.ts`). `offlineStore` uses `zustand/middleware`'s `persist` + `createJSONStorage` backed by AsyncStorage.

**Testing:**
- **pytest ≥8.3** + **pytest-asyncio ≥0.24** (`asyncio_mode = "auto"` in `backend/pyproject.toml`) — Backend tests in `backend/tests/`.
- **httpx ≥0.27** — Async HTTP client, used both as production HTTP dependency and as the test client via `httpx.ASGITransport` (see `backend/tests/conftest.py`).
- **aiosqlite ≥0.20** (dev only) — In-memory SQLite for tests (`TEST_DATABASE_URL = "sqlite+aiosqlite://"`).
- **Jest ^29.7** + **jest-expo ~55.0** — Mobile unit/component tests; config at `mobile/jest.config.js`.
- **@testing-library/react-native ^12.9** — Component testing.

**Build/Dev:**
- **uvicorn[standard] ≥0.30** — Dev server for FastAPI (`uvicorn main:app --reload`).
- **Ruff ≥0.7** (dev only) — Linter + formatter for Python. Config in `backend/pyproject.toml` (`target-version = "py312"`, `line-length = 88`, select `E, F, I, UP, B, SIM`, per-file `B008` ignore for `Depends()` defaults).
- **ESLint ^9.0** flat config at `mobile/eslint.config.mjs` extending `eslint-config-expo/flat.js` with `no-console: warn`.
- **Prettier ^3.4** — Config at `mobile/.prettierrc` (semi, singleQuote, trailingComma all, tabWidth 2, printWidth 100).
- **TypeScript ~5.9** — `strict: true` in `mobile/tsconfig.json`, path alias `@/* -> ./src/*`, extends `expo/tsconfig.base`.

## Key Dependencies

**Critical:**
- **Pillow ≥10.4** (`PIL`) — Receipt image dimensioning and thumbnail generation (`backend/app/image/storage.py`, `backend/app/image/preprocessor.py`).
- **opencv-python-headless ≥4.10** (`cv2`) — Blur detection (Laplacian variance) and brightness scoring in `backend/app/image/preprocessor.py`.
- **numpy** (transitive via OpenCV) — Image arrays in `preprocessor.py`.
- **python-multipart ≥0.0.12** — FastAPI `UploadFile` support for receipt scan endpoint (`backend/app/api/routes/receipts.py`).
- **redis ≥5.1** — Celery broker and planned cache layer (`redis://localhost:6379/0` default DSN).
- **starlette** (transitive via FastAPI) — Used directly for `BaseHTTPMiddleware` / `Request` / `JSONResponse` in `backend/app/core/rate_limit.py`.
- **@react-native-async-storage/async-storage ^2.2.0** — Persistent client storage for Zustand offline queue.
- **@react-native-community/netinfo 11.5.2** — Online/offline detection in `mobile/src/hooks/useNetworkStatus.ts`.
- **expo-camera ~55.0.4** — Receipt image capture.
- **expo-image-manipulator ~55.0.4** — Client-side image preprocessing before upload.
- **expo-image-picker ~55.0.13** — Import receipt from photo library.
- **expo-haptics ~55.0.9** — Tactile feedback.
- **react-native-reanimated ^4.2.1** + **react-native-worklets ^0.8.1** — Animation and worklet runtime.
- **react-native-safe-area-context ~5.3.0**, **react-native-screens ~4.11.1** — Navigation primitives required by expo-router.

**Infrastructure:**
- **Supabase-managed PostgreSQL with pgvector** — Target production database (per `docs/DEPLOYMENT.md`). DSN form: `postgresql+asyncpg://postgres.[ref]:[pw]@...pooler.supabase.com:5432/postgres`.
- **Redis 7 (Alpine)** — Containerized broker on the VPS (`docs/DEPLOYMENT.md`).
- **Caddy 2 (Alpine)** — Reverse proxy + automatic Let's Encrypt TLS (`docs/DEPLOYMENT.md`).
- **Docker Compose** — Orchestration for `api`, `worker`, `beat`, `redis`, `caddy` services (`docs/DEPLOYMENT.md`; `docker/` directory is referenced but not yet committed to the repo).

## Configuration

**Environment:**
- Backend settings loaded via `Settings(BaseSettings)` with `env_prefix="GG_"` and `env_file=".env"` (`backend/app/core/config.py`). All settings accessed through the cached `get_settings()` helper.
- Keys (env-var form with `GG_` prefix): `GG_APP_NAME`, `GG_DEBUG`, `GG_DATABASE_URL`, `GG_DATABASE_ECHO`, `GG_REDIS_URL`, `GG_LLM_PROVIDER`, `GG_LLM_MODEL`, `GG_LLM_TEMPERATURE`, `GG_LLM_API_KEY`, `GG_EXTRACTION_CONFIDENCE_THRESHOLD`, `GG_CATEGORY_CONFIDENCE_THRESHOLD`, `GG_STORAGE_PATH`, `GG_THUMBNAIL_WIDTH`, `GG_MAX_RECEIPT_SUBMISSIONS_PER_HOUR`, `GG_MAX_READS_PER_MINUTE`.
- Defaults (development): DB `postgresql+asyncpg://localhost:5432/grocery_genie`, Redis `redis://localhost:6379/0`, storage `./uploads`, write rate 50/hr, read rate 300/min.
- LiteLLM's Anthropic path also reads `ANTHROPIC_API_KEY` directly from env — `LiteLLMReceiptExtractor.__init__` copies `settings.llm_api_key` into `os.environ["ANTHROPIC_API_KEY"]` when `llm_provider == "anthropic"`.
- Mobile reads `EXPO_PUBLIC_API_URL` (fallback `http://localhost:8000`) in `mobile/src/services/api.ts` and `mobile/src/features/receipt-capture/services/receiptApi.ts`.
- No `.env*` files are committed. `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`.

**Build:**
- Backend packaging: `backend/pyproject.toml` (`[build-system] requires = ["setuptools>=75.0"]`, `[tool.setuptools.packages.find] include = ["app*"]`).
- Mobile build config: `mobile/app.json` (Expo) — bundle id `com.grocerygenie.app`, platforms `["ios"]`, required plugins: `expo-router`, `expo-camera`, `expo-image-manipulator`, `expo-image-picker`, `expo-haptics`, `react-native-reanimated`. iOS `infoPlist` declares `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription`.
- Production iOS builds via Expo EAS (referenced in `docs/DEPLOYMENT.md`).
- Ruff tool config in `backend/pyproject.toml`. Pytest config also in `backend/pyproject.toml` (`testpaths = ["tests"]`).

## Platform Requirements

**Development:**
- Python 3.12+ with a virtualenv (existing `backend/.venv/`).
- Node.js (version pinned implicitly via Expo SDK 55; no `.nvmrc` committed).
- PostgreSQL locally (or remote) and Redis locally for the Celery path. Dev tests bypass Postgres using in-memory SQLite via aiosqlite.
- Xcode + iOS Simulator for mobile development (`npx expo start --ios`).
- OpenCV system libs (`libgl1`, `libglib2.0-0`) required when running outside of the production Dockerfile — the headless wheel is used.

**Production:**
- Hetzner VPS (Ubuntu 22.04+, ≥2 vCPU / 4 GB RAM) running Docker Compose (`api`, `worker`, `beat`, `redis`, `caddy`).
- Supabase-managed Postgres with `pgvector` extension (MVP uses Postgres only; pgvector reserved for V1.1 embeddings).
- Anthropic Claude API access for LLM calls.
- Apple Developer Program account for App Store / TestFlight distribution.

---

*Stack analysis: 2026-04-19*
