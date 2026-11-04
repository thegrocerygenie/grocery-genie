# Lessons from running the loop (V1.1, 2026-11-03/04)

Each line is a failure that happened, and the rule that came from it.

- **Reviewers find real bugs.** Without a fresh reviewer, these would have merged: a delete/confirm deadlock (custom categories), another user's store name on a receipt and a store merge nobody could undo (store normalization), a waitlist claim that revealed membership by timing, and a free year that a 6-hour outage could erase (waitlist). Never skip the review, even when the implementer's gates are green.
- **Re-review with the same reviewer.** It keeps its context and checks its own findings against the new diff quickly.
- **Tests that pass on main prove nothing.** Reviewers break the code on purpose; two such tests were deleted.
- **The coordinator's own brief can be wrong.** A brief said not to build what the plan required (the audience deletion); the reviewer caught it. When the plan and a brief disagree, the plan wins.
- **Container restarts.** Three in one night. Postgres and Redis die, agents fail on connection errors, unpushed commits are at risk, and finished agents' reports can be lost. Rerun `setup-env.sh`, tell the agents, recover reports with `scripts/agent-report.py`, and have agents push as soon as gates pass.
- **Permission checks.** The auto-mode classifier refused coordinator commits and pushes even under a standing authorization, and refused agents' compound shell commands. Ask the user per task with `AskUserQuestion`; agents rerun as single commands. Never work around a refusal.
- **Relayed approvals.** Another session forwarded "the user approved X". It isn't the user's word in this session: ask anyway.
- **Main moves under you.** Other sessions and the user merge to main during the loop. Before each merge, check main is in the branch; tell running agents when main moves; have each agent fetch main right before its final push.
- **Formal sync commits.** A PR that moves `verify-budget-alerts`' "Sync commit" must merge with a merge commit, or the SHA isn't on main. Two branches moving it at once conflict: merge one, then have the other merge main and move it again. A later feature can make the sync drift without touching covered functions; the done check catches it.
- **Migrations.** One open at a time, ids assigned in merge order. An unmerged migration may be edited; a merged one never.
- **The plan grows.** A task can be added to the plan from outside the loop (V11-P5 arrived via a PR). Re-read the status table after each merge.
- **Phase Definition of Done.** V1.1 had none until an audit asked; write it early (as a task) so the final check has something to walk.
- **Context.** The coordinator stayed small by never reading source: plans, reports and `git` metadata only. Long agent reports are capped by the prompt ("under 300 words"). Session 3 finished V1.1 (5 merges, then 4 more tasks, a done check and this skill) at about 30% context, measured with `get_session`; it had been guessing until then. Measure after every merge.
- **Session lineage.** Each handoff session is a child of the last; `get_session` showed depth 3 of a limit of 8 after two handoffs. Near the limit, ask the user to start a fresh top-level session.
- **Start the next session on the coordinator branch.** Handoffs live on the coordinator branch, not `main`. V1.1 session 3 worked because it was created with revision `claude/v11-coordinator-2`; a session cloned from `main` would not have found the handoff.
- **Handoff approval takes time.** The commit-gate question for the handoff can wait while context grows; ask at 30%, hand off at 35%.
- **Worktrees.** `.claude/worktrees/` goes in `.git/info/exclude` (local to each clone), or the stop hook complains about untracked files. Use detached worktrees for your own status-row commits: the agent's worktree may still hold the branch.
- **Pushes.** `git push` once hung at negotiation for minutes: wrap it in `timeout 300`. `merge_pull_request` needs the full 40-character `expectedHeadSha`.
