# Grocery Genie

Mobile app that transforms grocery receipts into budget tracking, price intelligence, and meal planning from a single scan.

**Current phase:** MVP (Budget Copilot) — receipt scanning + budget tracking.

## How It Works

1. **Scan** — Photograph a receipt or upload from your library
2. **Extract** — Vision model (Claude Sonnet via LiteLLM) extracts store, date, items, prices, and totals
3. **Review** — Low-confidence fields are flagged; edit inline before confirming
4. **Track** — Spending auto-categorized into 8 categories with budget alerts at configurable thresholds
5. **Learn** — Corrections feed a per-user mapping so the same item is categorized correctly next time

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo), TypeScript strict, iOS-only |
| Navigation | Expo Router (file-based) |
| State | Zustand (client) + TanStack Query (server) |
| Backend | Python 3.12+, FastAPI, async everywhere |
| Database | PostgreSQL, SQLAlchemy 2.0+ (async), Alembic |
| LLM | LiteLLM (provider-agnostic) → Anthropic Claude Sonnet |
| Task Queue | Celery + Redis |
| Image Processing | Pillow + OpenCV |
| Testing | pytest + httpx (backend), Jest + RNTL (mobile) |

## Project Structure

```
grocery-genie/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI route handlers
│   │   ├── core/             # Config, auth, rate limiting
│   │   ├── events/           # Domain event dispatcher
│   │   ├── image/            # Receipt image preprocessing
│   │   ├── llm/              # LLM provider abstraction + prompts
│   │   ├── models/           # SQLAlchemy models + Pydantic schemas
│   │   ├── services/         # Business logic layer
│   │   └── tasks/            # Celery async tasks
│   ├── tests/
│   └── main.py
├── mobile/
│   ├── app/                  # Expo Router screens
│   └── src/
│       ├── components/       # Shared UI components
│       ├── constants/        # Theme, strings, categories
│       ├── features/         # Feature modules (receipt-capture, budget)
│       ├── hooks/            # Custom hooks (analytics, network, sync)
│       └── store/            # Zustand stores
└── docs/prd/                 # Product requirements
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL (or SQLite for development)
- Redis (for Celery task queue)
- iOS Simulator (Xcode) or physical iOS device

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Set environment variables
export GG_DATABASE_URL="postgresql+asyncpg://localhost:5432/grocery_genie"
export GG_LLM_API_KEY="your-anthropic-api-key"

# Run migrations
alembic upgrade head

# Start dev server
uvicorn main:app --reload

# Run tests
pytest
```

### Mobile

```bash
cd mobile
npm install

# Start Expo dev server
npx expo start --ios

# Run tests
npm test

# Type check
npx tsc --noEmit
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/receipts/scan` | Upload receipt image for extraction |
| `GET` | `/api/receipts` | List receipts (paginated, filterable) |
| `GET` | `/api/receipts/{id}` | Get receipt with line items |
| `PATCH` | `/api/receipts/{id}` | Submit corrections, confirm receipt |
| `POST` | `/api/budgets` | Create overall or category budget |
| `GET` | `/api/budgets/summary` | Budget vs. actual for a period |
| `PATCH` | `/api/budgets/{id}` | Update budget amount |
| `GET` | `/api/dashboard/spending` | Full dashboard data |
| `GET` | `/api/categories` | List spending categories |
| `GET` | `/api/notifications` | List notifications (unread first) |
| `PATCH` | `/api/notifications/{id}/read` | Mark notification as read |
| `GET` | `/health` | Health check |

## Key Design Decisions

- **LLM provider-agnostic**: All LLM calls go through LiteLLM. Switch providers by changing config, not code.
- **Event-driven**: Domain events (`ReceiptConfirmed`, `BudgetThresholdBreached`) decouple services. Budget checks happen in response to events, not inline.
- **Offline-first capture**: Receipts captured offline are queued locally and auto-synced when connectivity returns.
- **Correction learning**: User corrections persist as `UserItemMapping` entries. On subsequent scans, the mapping dictionary overrides LLM category assignment with confidence 1.0.
- **Receipt date, not scan date**: Budget aggregation uses the date printed on the receipt, not when it was scanned. A Jan 31 receipt scanned on Feb 2 counts toward January.

## Testing

```bash
# Backend: 76 tests (5 skipped — LLM harness requires API key)
cd backend && pytest -q

# Mobile: 46 tests
cd mobile && npm test

# Backend lint + format
ruff check . && ruff format --check .

# Mobile type check + lint
npx tsc --noEmit && npx eslint .
```

## Phase Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **MVP** | Receipt scanning + budget tracking | In progress |
| V1.1 | Price intelligence, item normalization | Planned |
| V1.5 | Household sharing | Planned |
| V2.0 | Meal planning, pantry tracking | Planned |
| V2.5 | Community, basket comparison | Planned |
| V3.0 | LLM recipes, semantic search | Planned |

## License

Proprietary. All rights reserved.
