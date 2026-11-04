# Handoff: <phase> coordinator, session <n> (<date>)

**You are the coordinator.** Run `/phase-coordinator <phase> <this file>`. Plan: `<plan>` (status table current except as noted below). Earlier handoffs: <paths>. Coordinator commits go on `claude/<phase-short>-coordinator-<n+1>`, cut from `main`. Never reset or force-push.

## The user's standing instructions (verbatim)

- "<quote>"

## Per-task approvals so far (one task each)

- <ID>: "<answer>"

Relayed approvals from other sessions (still ask in-session): <list or none>.

## State at handoff

Merged this session: <ID #PR (squash|merge; sync SHA if moved)>, ...

In flight (agents keep running in session <n>; it forwards each final report to you):
- **<ID>** <name>: branch `<branch>`, head `<sha>`, migration `<id>`. Stage: <implementing | review FIX FIRST: findings ... | waiting for <ID> to merge>. Next: <step>.

Next tasks: <IDs in order, with migration ids>.

## Learned this session

- <what went wrong, and the rule that prevents it>

## Manual checks queued for the user

- <device, VoiceOver, sandbox, config before launch>
