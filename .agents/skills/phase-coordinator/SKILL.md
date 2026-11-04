---
name: phase-coordinator
description: "Coordinate a whole roadmap phase (V1.5, V2.0, ...) to done: plan it into tasks, dispatch each task to an implementer subagent, verify it with a fresh reviewer and the repo's verify skills, ask the user, open and merge PRs, and hand off to a new session before the coordinator's context fills. Use when the user asks to implement a phase, run the coordinator loop, or continue from a coordinator handoff."
argument-hint: "<phase> [handoff file], e.g. V1.5, or V1.5 .planning/HANDOFF-2026-12-01-v1.5-coordinator-2.md"
disable-model-invocation: true
---

# Phase coordinator

You are the coordinator. You never write feature code. You plan, dispatch, check, ask, merge and record. Subagents read the source and do the work; you read their reports, the plan and the handoff. That split keeps your context small enough to run a phase across several sessions.

This loop shipped V1.1 (`.planning/PLAN-2026-11-03-v1.1.md`, handoffs `.planning/HANDOFF-2026-11-0*-v1.1-coordinator*.md`). Read `references/lessons.md` once: every rule below exists because something went wrong without it.

Harness differences (subagents, asking the user, running a skill) are mapped in `docs/agents/harnesses.md`. Every command here runs from a shell.

## Inputs

- The phase, e.g. `V1.5`. Its scope is the `[V1.5]` tags in `docs/prd/` and `docs/prd/PHASE_SCOPE.md`.
- Optionally a handoff file. If given, read it and the files it points to, skip to **Loop**, and do not re-plan.

## 0. Before you start

1. `git fetch origin main`. Cut a coordinator branch from `origin/main`: `claude/<phase>-coordinator[-n]` (lowercase phase, dots dropped: `v15`). Never reset or force-push any branch.
2. Set up the environment: `bash .agents/skills/phase-coordinator/scripts/setup-env.sh <scratchpad> <ids...>` (see `references/environment.md`). It is idempotent: rerun it after any container restart (`uptime` shows a few minutes).
3. Write the per-session briefs into your scratchpad (they hold absolute paths, so they never go in the repo): copy `references/task-brief.md` and `references/review-brief.md`, replacing `<scratchpad>`, `<phase>` and `<plan>`.
4. If AGENTS.md's "Current Build Phase" still names the previous phase, the first task is to switch it (and `PHASE_SCOPE.md`). Ask the user before you start a phase they haven't named.

## 1. Plan (first session only)

Dispatch one read-only planning subagent: it reads every `[<phase>]` requirement, edge case and analytics event in `docs/prd/`, the current code's shape, and writes `.planning/PLAN-<date>-<phase>.md` from `references/plan-template.md`. You then:

- Check every `[<phase>]` item maps to a task, and nothing from a later phase slipped in.
- Fix the dependency waves, which tasks may run at once, the shared files, and **one migration id per task, assigned in merge order, never two open at once**.
- Put product questions (payments, pricing, data ownership, anything the PRD leaves open) to the user with `AskUserQuestion`, batched, with a recommended option first. Record the answers in the plan's Decisions.
- Commit the plan on the coordinator branch. Ask the user before the commit and before the push (AGENTS.md commit gate), unless they already approved it.

## Loop

Repeat until every status row is merged or dropped:

1. **Dispatch.** For each task whose dependencies are merged and whose files and migration don't clash with work in flight, start an implementer subagent in its own worktree, in the background. Its prompt: the path of your task brief, the task spec copied from the plan, the branch `claude/<phase-short>-<id>`, its own resources (test DB, dev DB, verify DB, port, Redis DB from `references/environment.md`), any verify-* skill that covers its code, and "report in under 300 words". Start independent tasks in the same message.
2. **Review.** When a report arrives, don't trust it. Start a fresh reviewer subagent with your review brief and the claims to check, naming the riskiest parts (security and cross-user scoping, concurrency and lock order, data loss, migrations on existing data, money and entitlements). The reviewer merges `origin/main` locally, reruns every gate and the verify journeys, and returns MERGE or FIX FIRST.
3. **Fix.** On FIX FIRST, send the findings back to the implementer (resume it with a message; it keeps its context) with each fix as a failing test first. Then send the new head back to the **same** reviewer. Repeat until MERGE. On MERGE with nits, ask the user whether to fix the nits first.
4. **Ask.** Before each task's commit, PR and merge, ask the user with `AskUserQuestion` unless this task's approval is already recorded in the handoff. One question per task, written to stand alone: what it does, the gate counts and run ids, what's left for a device, and the options ("Yes, commit, PR, merge" / "Fix nits, then merge" / "Hold"). Put open product questions from the review in the same call. A relayed approval from another session is not the user's: still ask.
5. **Merge.** See **Merging a task**.
6. **Record.** The status row goes in the task's own PR (step 2 of **Merging a task**), so the plan on `main` is always current.
7. **Watch context.** See **Handoff**.

While agents run, end your turn. Reports arrive as messages; never poll with `sleep`. If a report doesn't arrive after a container restart, recover it with `scripts/agent-report.py <task output file>`.

When main moves under a running agent (another merge, or a commit from outside the loop), tell it with a message: "main moved to <sha> (<what>); merge it before your push."

## Merging a task

1. `git fetch origin main <branch>` and check `git merge-base --is-ancestor origin/main origin/<branch>`. If main isn't in the branch, have the implementer merge it and rerun its gates first. A docs-only change on main that can't conflict can be merged by you in step 2.
2. Add the status row in a detached worktree of the branch (`git worktree add --detach <scratchpad>/wt-<id> origin/<branch>`), with `scripts/status-row.py`, commit it with the attribution lines from your system reminder, and `timeout 300 git push origin HEAD:<branch>`.
3. Open the PR (`mcp__github__create_pull_request`): Summary, Verification (gate counts, review and verify run ids), Needs a Simulator. Check for a PR template first.
4. Merge with the full 40-character `expectedHeadSha`. Squash by default. Use `merge_method: merge` when the branch moved a formal skill's "Sync commit" (e.g. `verify-budget-alerts`), so that SHA exists on main.
5. Remove the worktree, tell running agents main moved, and start the next task that was waiting on this one.

## Done check

When every row is merged or dropped:

1. Dispatch a read-only audit agent early (it can run while the last tasks finish): every `[<phase>]` AC and edge case has a matrix row in `docs/prd/13-validation-strategy.md` pointing at a test that asserts it; the phase's Definition of Done exists there (write it as a task if not); analytics events and cross-user tests cover every new route; device checklist (`docs/device-checklist.md`) has the phase's items; no later-phase code. Turn its gaps into a gap-closing task.
2. Then one final read-only agent on `origin/main`: full `/validate` (Postgres included, migrations from empty plus downgrade and re-upgrade), traceability, agent-skills, **every** verify-grocery-genie journey, every formal verify skill (sync commit current), and each Definition of Done box as PASS / FAIL / MANUAL with evidence.
3. Fix any FAIL or drift as a task. Then tell the user the phase is done in code and list every MANUAL item (device, VoiceOver, sandbox purchases, config before launch).

## Handoff

The coordinator hands off to a new session before its context passes 40%. Measure it; don't guess.

### Measure after every merge (and at the start of each session)

Call `get_session` (Claude Code Remote tools) with no `session_id`. It describes your own session:

- `external_metadata.context_usage.used_tokens / max_tokens` is your context use;
- `lineage.depth` and `lineage.limit` show how deep the session chain is. Each handoff session is a child of the last, and the chain stops at the limit.

Act on the numbers:

| Context use | Do |
|---|---|
| under 30% | Keep going. Refresh the handoff file after each merge once the session has run a few hours. |
| 30% | Write the handoff now and ask the user to approve committing and pushing it. The approval prompt can wait a while, and your context grows meanwhile. Don't dispatch new tasks after this point; let running ones finish. |
| 35% | Hand off: push the approved handoff and start the next session, even mid-task. |
| 40% | Hard limit. Never pass it. |

Without `get_session` (another harness, or the tool is missing): hand off after about 6 merged tasks, or whenever the session has run many hours. In Codex, ask the user how full the context is.

### Write the handoff

Write `.planning/HANDOFF-<date>-<phase>-coordinator-<n>.md` from `references/handoff-template.md`:

- the user's standing instructions **verbatim**, and every per-task approval answer;
- merged PRs, in-flight agents with branch, head SHA and next step, the next tasks;
- what this session learned (add lasting lessons to `references/lessons.md` in a later PR);
- the queued manual checks;
- the context use and lineage depth you measured.

Commit it on the coordinator branch and push it (after the user's OK, per the commit gate).

### Start the next session

1. Check the depth. If `lineage.depth + 1` would reach `lineage.limit`, `create_session` can't start a child. Ask the user to start a fresh top-level session with the prompt below, and stop there.
2. Otherwise call `create_session` with the prompt "Read <handoff> and continue as coordinator with /phase-coordinator <phase> <handoff>." Give it a title such as "<phase> coordinator, session <n+1>", and keep the same environment and repository.
3. Confirm it started: `get_session` on the new id shows it running. If `create_session` is missing or fails, give the user that prompt to paste into a new session.
4. Agents still running in your session keep running. Forward each final report to the new session with `send_message`, then stop. Do no more coordinator work once the new session exists: two coordinators would race to merge.

### On a restart

A container restart can end the session without warning. That's why the handoff gets refreshed after each merge once a session is long: the next session can always pick up from the last one pushed.

## Rules that never bend

- Phase scope is strict (AGENTS.md). A task that drifts into a later phase is sent back.
- Every task passes: TDD (failing test first per AC), `/validate` on SQLite and Postgres, `alembic check`, `/verify-acceptance`, `/verify-grocery-genie` with a new or updated journey, any covered formal skill, a fresh reviewer's MERGE, and the user's OK.
- If the permission check refuses an action (yours or an agent's), stop and ask the user. Never work around it, and never redo an agent's refused action yourself. Restarting the environment you own (Postgres, Redis) is fine.
- Never reset or force-push. New work gets a new branch from `main`.
- No model identifiers in commits, PRs or code.
