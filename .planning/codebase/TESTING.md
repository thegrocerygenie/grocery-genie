# Testing

**Analysis Date:** 2026-04-19

The `grocery-genie` monorepo has two independent test suites: **mobile** (Jest + React Native Testing Library) and **backend** (pytest + httpx `AsyncClient`). A separate **LLM validation harness** lives under `backend/tests/llm_validation/` and is gated by `GG_LLM_API_KEY`.

## Test Framework

**Mobile — Jest 29 + `jest-expo` preset:**
- Config: `mobile/jest.config.js`.
- `moduleNameMapper`: `^@/(.*)$` → `<rootDir>/src/$1`.
- `@react-native-async-storage/async-storage` mocked globally via the official mock (`setupFiles` + `moduleNameMapper`).
- `transformIgnorePatterns` whitelist covers `react-native`, `expo`, `@tanstack/*`, `zustand`.
- Assertion/rendering: `@testing-library/react-native` 12.x (`mobile/package.json:33`).
- E2E target: Detox (declared in `CLAUDE.md`, not yet wired).

**Backend — pytest 8 + `pytest-asyncio`:**
- Config: `backend/pyproject.toml:49-51`.
- `asyncio_mode = "auto"` — no `@pytest.mark.asyncio` decorator required (though some files use it).
- `testpaths = ["tests"]`.
- HTTP client: `httpx.AsyncClient(transport=ASGITransport(app=app))` — built in `backend/tests/conftest.py:94-115`.
- DB: SQLite in-memory via `aiosqlite`. URL `sqlite+aiosqlite://` at `backend/tests/conftest.py:18`. Schema created/dropped per test (`backend/tests/conftest.py:51-59`). Note in `backend/tests/api/test_performance.py:4-9` — production uses PostgreSQL.

**Run Commands:**

```bash
# Mobile (from mobile/)
npm test                              # watch mode
npm test -- --watchAll=false          # single run (used by /validate)
npx jest path/to/File.test.tsx        # single file

# Backend (from backend/)
pytest                                # all
pytest -x -q                          # fail-fast (used by /validate)
pytest tests/api/test_receipts.py
pytest -k test_create_budget
pytest tests/llm_validation/ -v       # requires GG_LLM_API_KEY
```

## Test File Organization

**Mobile — colocated `__tests__/` adjacent to source.** Real directories:
- `mobile/src/features/budget/__tests__/`
- `mobile/src/features/receipt-capture/__tests__/`
- `mobile/src/hooks/__tests__/`
- `mobile/src/store/__tests__/`
- `mobile/src/constants/__tests__/`

Naming: `<SourceFileName>.test.tsx` for components, `<sourceFileName>.test.ts` for hooks/stores.

**Backend — mirrored under `backend/tests/`:**

```
backend/app/                       →  backend/tests/
  api/routes/receipts.py           →    api/test_receipts.py
  api/routes/budgets.py            →    api/test_budgets.py
  services/budget_service.py       →    services/test_budget_service.py
  services/notification_service.py →    services/test_notification_service.py
  tasks/summary_tasks.py           →    tasks/test_summary_tasks.py
  image/preprocessor.py            →    services/test_image_preprocessing.py
```

Cross-cutting API suites:
- `backend/tests/api/test_security.py` — auth + user isolation.
- `backend/tests/api/test_edge_cases.py` — mirrors `docs/prd/11-edge-cases.md`.
- `backend/tests/api/test_performance.py` — MVP NFR benchmarks.

LLM harness under `backend/tests/llm_validation/`: `conftest.py`, `test_extraction_accuracy.py`, `test_extraction_consistency.py`, `test_prompt_regression.py`.

## Test Structure

**Mobile component test** (`mobile/src/features/budget/__tests__/BudgetProgressCard.test.tsx`):

```typescript
import { render, screen } from '@testing-library/react-native';
import { BudgetProgressCard } from '../components/BudgetProgressCard';

describe('BudgetProgressCard', () => {
  it('renders spent and budget amounts', () => {
    render(
      <BudgetProgressCard budget={500} spent={250} remaining={250} percent={50} daysLeft={15} />,
    );
    expect(screen.getByText('$250.00')).toBeTruthy();
    expect(screen.getByText('of $500.00')).toBeTruthy();
  });
});
```

**Preferred RNTL queries:**
- `getByText(/regex|string/)` — visible text.
- `getByLabelText('...')` — matches `accessibilityLabel`. See `mobile/src/features/receipt-capture/__tests__/CaptureButton.test.tsx:27`.
- `getByRole('button')` — matches `accessibilityRole`. See `CaptureButton.test.tsx:33`.
- `queryByText(...)` + `toBeNull()` for absence. See `ReceiptHistoryItem.test.tsx:50-51`.
- `UNSAFE_getByProps({ children: 'W' })` — only for elements intentionally hidden from a11y. See `ReceiptHistoryItem.test.tsx:27-29`.
- Interaction: `fireEvent.press(node)`.

**Mobile store test** — direct Zustand access with `beforeEach` reset. From `mobile/src/store/__tests__/offlineStore.test.ts:1-21`:

```typescript
import { useOfflineStore } from '../offlineStore';

beforeEach(() => {
  useOfflineStore.setState({ pendingReceipts: [] });
});

describe('offlineStore', () => {
  it('adds a pending receipt', () => {
    useOfflineStore.getState().addPendingReceipt({
      imageUri: 'file:///photo.jpg',
      mimeType: 'image/jpeg',
      capturedAt: '2026-03-22T10:00:00Z',
    });
    const { pendingReceipts } = useOfflineStore.getState();
    expect(pendingReceipts).toHaveLength(1);
    expect(pendingReceipts[0].status).toBe('pending');
  });
});
```

**Mobile hook test** — `renderHook` + `act`. From `mobile/src/hooks/__tests__/useAnalytics.test.ts:5-19`:

```typescript
const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
const { result } = renderHook(() => useAnalytics());
act(() => { result.current.emit('test_event', { key: 'value' }); });
expect(consoleSpy).toHaveBeenCalledWith('[Analytics] test_event', { key: 'value' });
consoleSpy.mockRestore();
```

**Backend API test** (`backend/tests/api/test_budgets.py:20-35`):

```python
@pytest.mark.asyncio
async def test_create_budget_success(client: AsyncClient, seeded_db):
    response = await client.post(
        "/api/budgets",
        json={"category_id": None, "amount": 500.0, "period_type": "monthly",
              "period_start": "2026-03-01"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["amount"] == 500.0
```

`@pytest.mark.asyncio` is redundant under `asyncio_mode = "auto"` but is used consistently in `test_budgets.py`, `test_security.py`, `test_edge_cases.py`, `test_performance.py`; omitted in `test_receipts.py` — both styles work.

**Backend service unit test** (`backend/tests/services/test_budget_service.py:69-78`):

```python
@pytest.mark.asyncio
async def test_create_budget_overall(service, user_id, db_session):
    request = BudgetCreateRequest(
        category_id=None, amount=500.0, period_type="monthly", period_start="2026-03-01",
    )
    budget = await service.create_budget(user_id, request)
    assert budget.amount == 500.0
    assert budget.category_id is None
    assert budget.user_id == user_id
```

## Mocking

**Mobile — manual `jest.mock()` at top of test file for native modules.** From `mobile/src/features/receipt-capture/__tests__/CaptureButton.test.tsx:5-23`:

```typescript
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: { createAnimatedComponent: (c: unknown) => c, View },
    useSharedValue: () => ({ value: 1 }),
    useAnimatedStyle: () => ({}),
    withSpring: (val: number) => val,
  };
});
```

**Mock:** `expo-haptics`, `expo-camera`, `expo-image-manipulator`, `expo-image-picker`, `react-native-reanimated` (no Jest worklet runtime), `fetch`/`scanReceipt`/`apiClient` when needed.

**Do NOT mock:** `@react-native-async-storage/async-storage` (handled globally), Zustand stores (reset via `setState`), `@testing-library/react-native`, component under test.

**Spies:** `jest.spyOn(console, 'log').mockImplementation()` + `mockRestore()`. See `useAnalytics.test.ts:6, 18`. Use `beforeEach(() => jest.clearAllMocks())` when a mock is reused across cases (`ReceiptHistoryItem.test.tsx:14-16`).

**Backend — FastAPI `app.dependency_overrides`.** Centralized helper in `backend/tests/conftest.py:72-91`:

```python
def _create_test_client(app, db_session, mock_extractor, user):
    async def override_get_current_user(): return user
    async def override_get_db(): yield db_session
    def override_get_extractor(): return mock_extractor

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_receipt_extractor] = override_get_extractor
    return app
```

Overrides are cleared in fixture teardown via `app.dependency_overrides.clear()`.

**LLM mocking via Protocol seam** — mocks live in production code (`backend/app/llm/provider.py`):
- `MockReceiptExtractor` (`provider.py:90-135`) — deterministic three-item receipt.
- `LowConfidenceMockExtractor` (`provider.py:138-161`) — drives the "not a receipt" rejection path. Swapped per-test in `backend/tests/api/test_receipts.py:54-58`.
- `MockCategoryAssigner` (`provider.py:214-221`) — every item as `Groceries` / `0.85`.

Never define inline LLM mocks in test files — always extend the `Protocol` in the provider module.

**Auth mocking:** default `client` fixture overrides `get_current_user`. Security tests use `raw_client` (`backend/tests/api/test_security.py:33-56`), which leaves `get_current_user` un-overridden and seeds two users with real bearer tokens.

**Mock:** LLM provider (always), any external side-effect dependency.
**Do NOT mock:** service layer (test directly with `db_session`), Pydantic validation, SQLAlchemy, `dispatcher` (register a handler instead).

## Fixtures and Factories

**Mobile — no shared fixtures.** Inline typed test data. Example from `mobile/src/features/budget/__tests__/CategoryBreakdown.test.tsx:5-30`:

```typescript
const mockCategories: BudgetCategorySummary[] = [
  { category_id: '1', name: 'Groceries', budget: 300, spent: 200, remaining: 100, percent: 66.7 },
  // ...
];
```

For multi-prop components, define `defaultProps` and spread-override (`ReceiptHistoryItem.test.tsx:6-13`).

**Backend — shared fixtures in `backend/tests/conftest.py`:**
- `mock_extractor` — `MockReceiptExtractor()` instance.
- `test_image_bytes` (lines 33-47) — deterministic 400×600 textured JPEG (`random.seed(42)`), textured to pass blur detection.
- `db_engine` (lines 51-59) — per-test async engine with `Base.metadata.create_all` / `drop_all`.
- `db_session` (lines 62-69) — `AsyncSession` within the engine.
- `client` (lines 95-115) — `AsyncClient` + auth override to `DEV_USER_ID` + mock extractor.
- `client_user_b` (lines 118-141) — second authenticated client for isolation tests.

**Module-scoped fixtures** at the top of each test file (not in `conftest.py`):
- `seeded_db` in `tests/api/test_budgets.py:12-18`.
- `category` in `tests/api/test_edge_cases.py:14-19`, `tests/api/test_performance.py:22-27`.
- `seeded_users`, `user_a_receipt`, `raw_client` in `tests/api/test_security.py`.
- `receipt_test_set`, `ground_truth_set`, `single_receipt` in `tests/llm_validation/conftest.py`.

**Seed helper:** `seed_default_categories(db_session)` in `backend/app/core/seed.py`.

**Test identities** (`backend/tests/conftest.py:20-24`):

```python
DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEV_USER_TOKEN = "test-token-user-a-00000000"
USER_B_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
USER_B_TOKEN = "test-token-user-b-00000000"
```

**Inline helpers:** `_create_receipt` (`tests/api/test_receipts.py:14-21`), `_create_confirmed_receipt` (`tests/services/test_budget_service.py:39-66`). Promote to `conftest.py` only when reused across modules.

## Coverage

**Target:** 80% minimum across unit + integration + E2E (global rule from `common/testing.md`; enforced through `/done`).

**Configuration status:** no coverage threshold is wired into `jest.config.js` or `pyproject.toml` today. Run manually:

```bash
cd backend && pytest --cov=app --cov-report=term-missing
cd mobile && npx jest --coverage
```

**Acceptance-criterion coverage:** every PRD acceptance criterion must have at least one automated test (`CLAUDE.md`). `/verify-acceptance <story-id>` produces a criterion → test-file table and adds missing tests.

## Test Types

- **Unit** — `backend/tests/services/`, `mobile/src/**/__tests__/` (single component/hook/store, no network).
- **Integration** — `backend/tests/api/` (full FastAPI → SQLAlchemy → SQLite stack via `AsyncClient`; only the LLM is mocked).
- **Security/isolation** — `backend/tests/api/test_security.py` (real auth via `raw_client`; `test_user_isolation_receipts` + `test_user_isolation_budgets` at lines 130-178).
- **Edge cases** — `backend/tests/api/test_edge_cases.py` (duplicates, cross-period receipts; mirrors `docs/prd/11-edge-cases.md`).
- **Performance** — `backend/tests/api/test_performance.py`; SQLite-backed smoke benchmarks for MVP NFRs.
- **LLM validation** — `backend/tests/llm_validation/`; real LLM calls against `ground_truth/*.json` + `receipts/<id>.(jpg|png|heic|pdf)`; skipped when `GG_LLM_API_KEY` is unset (`test_extraction_accuracy.py:5`, `test_prompt_regression.py:5`).
  - Targets (`test_extraction_accuracy.py:105-108`): field accuracy ≥ 90%, hallucination = 0%, item recall ≥ 95%.
  - Regression baselines (`test_prompt_regression.py:15-17`): `BASELINE_FIELD_ACCURACY = 0.90`, `BASELINE_ITEM_RECALL = 0.95`, `BASELINE_HALLUCINATION_RATE = 0.0`. Every change to `backend/app/llm/prompts/` must clear `/validate-extraction`.
- **E2E** — Detox planned, not wired.

## Common Patterns

**Async testing:**
- Mobile — `async` + `await fireEvent.press(...)` when handler is async (`CaptureButton.test.tsx:32-36`).
- Backend — `async def test_...`, `await client.post(...)`, `await service.method(...)`.

**Error testing (backend):**

```python
async def test_invalid_file_type(client: AsyncClient):
    response = await client.post(
        "/api/receipts/scan",
        files={"file": ("notes.txt", io.BytesIO(b"not an image"), "text/plain")},
    )
    assert response.status_code == 422
    assert "Unsupported file type" in response.json()["detail"]
```

See `backend/tests/api/test_receipts.py:42-49`. Use dependency swap to the failure path for deeper scenarios (`LowConfidenceMockExtractor` at `test_receipts.py:52-71`).

**User isolation:** create as User A, assert User B gets 404/400 or empty list (`test_security.py:130-178`).

**Duplicate detection:** call endpoint twice, assert `duplicate_warning` flips (`test_edge_cases.py:25-46`).

**State reset:**
- Mobile Zustand — `beforeEach(() => useXStore.setState({ ... }))` (`offlineStore.test.ts:4-6`).
- Backend DB — per-test schema recreate via `db_engine` fixture.
- Backend overrides — `app.dependency_overrides.clear()` in teardown.

**Deterministic time/data:** explicit dates like `2026-03-15`; `random.seed(42)` for fixture image generation. Avoid `datetime.now()` / `Date.now()` in test bodies.

## TDD Workflow Integration

`CLAUDE.md` mandates RED → GREEN → REFACTOR. Slash commands automate the gate:

- `/implement <story-id>` — scaffolds failing tests per acceptance criterion, implements, validates.
- `/validate` (`.claude/commands/validate.md`) — runs `ruff check`, `ruff format --check`, `pytest -x -q`, `tsc --noEmit`, `eslint .`, `npm test -- --watchAll=false`.
- `/verify-acceptance <story-id>` (`.claude/commands/verify-acceptance.md`) — maps PRD criteria → tests; adds missing coverage.
- `/validate-extraction` — runs LLM accuracy harness; required before merging prompt changes.
- `/done` (`.claude/commands/done.md`) — final gate: quality + acceptance + phase boundary + architecture compliance.

**Self-correction rules (`CLAUDE.md`):** test failure → fix root cause, re-run; lint failure → fix code, never disable rule; missing criterion → implement + test; out-of-scope code → remove.

---

*Testing analysis: 2026-04-19*
