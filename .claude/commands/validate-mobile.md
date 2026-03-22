---
description: Run mobile validation only. Type check, lint, tests.
---

# Mobile Validation

Run from mobile/ directory:

1. `npx tsc --noEmit` — fix any type errors.
2. `npx eslint .` — fix any lint violations.
3. `npm test -- --watchAll=false` — run tests. If any fail, fix and re-run until all pass.

After all pass, report: tests passed count, any issues found and fixed.
