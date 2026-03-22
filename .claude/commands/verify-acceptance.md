---
description: Verify current implementation against PRD acceptance criteria for a specific story or epic. Use after completing a feature to check coverage.
---

# Acceptance Criteria Verification

When given a story ID (e.g., RC-01, BC-03) or epic name (e.g., "receipt capture"):

1. Read the relevant PRD doc from docs/prd/ to get the acceptance criteria.
2. For each numbered acceptance criterion, determine:
   - Is there an automated test that validates this criterion? Where is it?
   - Does the implementation actually satisfy the criterion? Read the code to verify.
   - If no test exists, write one.
   - If the implementation doesn't satisfy the criterion, fix the implementation.
3. Report a table:

   | Criterion | Satisfied | Test Exists | Test Location | Action Taken |
   |-----------|-----------|-------------|---------------|--------------|
   | 1         | Yes/No    | Yes/No      | path          | None/Fixed/Test added |

4. If any criterion is not satisfied, fix the implementation AND add a test, then re-run /validate.

## Rules

- Read the PRD doc first. Do not work from memory of what the criteria might be.
- "Satisfied" means the code handles the criterion, not just that a test exists.
- If a criterion involves UI behavior (e.g., "visually flagged"), verify the component renders the expected state.
- If a criterion involves a threshold (e.g., "confidence < 0.7"), verify the threshold is configurable and the default matches the spec.
