---
description: Run before presenting any task as complete. This is the self-verification gate. Do not skip this.
---

# Task Completion Verification

Before reporting a task as done, run through this checklist. Fix any failures and re-run until everything passes.

## 1. Code Quality Gate

**Backend:**
- Run `cd backend && ruff check .` — zero violations.
- Run `cd backend && ruff format --check .` — zero formatting issues.
- Run `cd backend && pytest -x -q` — all tests pass.

**Mobile:**
- Run `cd mobile && npx tsc --noEmit` — zero type errors.
- Run `cd mobile && npx eslint .` — zero violations.
- Run `cd mobile && npm test -- --watchAll=false` — all tests pass.

If any check fails: fix the issue, then re-run from the top of this section.

## 2. Test Coverage Check

For every piece of logic you wrote or modified in this task:
- Does it have a test? If not, write one.
- Does the test cover the happy path AND at least one error path?
- For API endpoints: is there an integration test using httpx.AsyncClient?
- For components: is there a rendering test using RNTL?

## 3. Acceptance Criteria Check

If this task implements a specific user story:
- Read the acceptance criteria from the relevant docs/prd/ file.
- Verify each criterion is satisfied in code (not just tested).
- If any criterion is missing, implement it before reporting done.

## 4. Phase Boundary Check

Review the code you wrote:
- Does any of it implement functionality from a later phase (V1.1+)?
- Does any model include fields that should only exist in later phases?
- If yes, remove the out-of-scope code. Design the interface to accommodate it, but don't build it.

## 5. Architecture Compliance Check

- Are all LLM calls going through `app/llm/provider.py`? No direct SDK calls?
- Are Pydantic models used for all request/response schemas and LLM outputs?
- Is business logic in `app/services/`, not in route handlers?
- Are domain events published where the PRD specifies them?
- Is the code using `async def` for I/O-bound operations?

## 6. Report

After all checks pass, report:
- What was built (brief summary)
- Tests: X passed, Y written in this session
- Any issues found and fixed during self-validation
- Any PRD acceptance criteria that are now covered vs. still pending
