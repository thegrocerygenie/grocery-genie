---
description: Run full validation suite across backend and mobile. Use after completing any feature or before presenting work.
---

# Full Validation Suite

Run all validation checks and fix any failures before reporting results.

## Backend Validation (from backend/)

1. **Lint check**: Run `ruff check .` — fix any violations before proceeding.
2. **Format check**: Run `ruff format --check .` — fix any formatting issues.
3. **Type safety**: Verify all Pydantic models are valid by running `python -c "from app.models import *"`.
4. **Tests**: Run `pytest -x -q` — if any test fails, read the failure, fix the code, and re-run until all pass.
5. **Migration check**: Run `alembic check` to verify migrations are up to date with models (if DB is configured).

## Mobile Validation (from mobile/)

1. **Type check**: Run `npx tsc --noEmit` — fix any type errors before proceeding.
2. **Lint check**: Run `npx eslint .` — fix any violations.
3. **Tests**: Run `npm test -- --watchAll=false` — fix any failures and re-run until all pass.

## Validation Rules

- Do NOT report "done" if any check above fails.
- If a test fails, read the error, fix the root cause (not just the test), and re-run.
- If a lint rule fails, fix the code to comply, do not disable the rule.
- After all checks pass, report a summary: what was validated, what was fixed, what passed.
