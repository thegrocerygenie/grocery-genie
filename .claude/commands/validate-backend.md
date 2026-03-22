---
description: Run backend validation only. Lint, format, tests, migration check.
---

# Backend Validation

Run from backend/ directory:

1. `ruff check .` — fix any lint violations.
2. `ruff format --check .` — fix any formatting issues.
3. `pytest -x -q` — run tests. If any fail, fix the code and re-run until all pass.
4. `alembic check` — verify migrations match models (skip if DB not configured yet).

After all pass, report: tests passed count, any issues found and fixed.
