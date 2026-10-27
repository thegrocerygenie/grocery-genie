---
name: verify-budget-alerts
description: "Model-check Grocery Genie's budget alert and push delivery pipeline with TLA+: one alert per threshold, no missed alert, each push sent at most once, every push settles. Use when a change touches confirm_receipt, create_manual_receipt, check_thresholds, claim_alert, budget_alerts_sent, create_notification, deliver_pending_pushes, ExpoPushClient.send, expo_rejected, or the request transaction in get_db."
---

# Verify budget alerts

Tests check the orders of events someone thought to write. This skill checks every order of steps in a small model of the alert and push pipeline. That covers two receipts confirmed at the same moment, a worker dying mid-send, and Expo timing out after it delivered. The models are TLA+ specs in `formal/budget_alerts/`, checked by TLC. Each step in a model points to one step in the code, and the code map at the top of each `.tla` file names it.

## Properties

| Property | Model | Plain sentence | Harm if broken |
| --- | --- | --- | --- |
| `OneAlertPerThreshold` | `ConfirmAlerts.tla` | Each threshold makes at most one notification per budget period. | The user gets the same "Budget 80% Reached" alert twice. |
| `NoMissedAlert` | `ConfirmAlerts.tla` | Once every confirm has committed, each threshold the committed spend has reached has an alert. | The user overspends and never hears about it. |
| `PushAtMostOnce` | `PushDelivery.tla` | Expo delivers each notification at most once (the promise in `push_tasks.py`'s docstring). | The user's phone shows the same alert twice. |
| `EveryPushSettles` | `PushDelivery.tla` | Every notification eventually settles: `sent`, `failed`, or `expired`. | A row stays pending or `sending` forever, and nobody learns its outcome. |

## Run

```bash
formal/budget_alerts/run.sh            # every config; ~10 s
formal/budget_alerts/run.sh NAME.cfg   # one config, with TLC's full output and trace
```

`run.sh` pins TLC (tla2tools v1.7.4, sha256 checked), downloads it to `~/.cache/tla/` on first use, and finds a JDK (`JAVA`, `JAVA_HOME`, or Homebrew's `openjdk@21`). It first warns when covered code changed since the sync commit below. It then runs each `*.cfg` and compares the result with the config's `\* EXPECT:` line, printing one row per config. **Exit 0 means every result matched its EXPECT line**, findings included. TLC logs go to `.verification/formal/<run-id>/`.

Expected rows as of the sync commit:

| Config | Expected | What it is |
| --- | --- | --- |
| `confirm` | pass | The code: 3 receipts, thresholds 50/80/100, any interleaving, 1 rollback |
| `confirm-missed` | pass | **Finding H1**, fixed: the H1 trace's setup, with the budget row lock |
| `confirm-fix-rowlock` | pass | The H1 fix with 3 receipts, both confirm properties |
| `push` | pass | The code: 3 notifications, 2 workers, Expo may reject, no faults |
| `push-crash` | pass | **Finding H2, fixed**: the code with one fault |
| `push-chunks` | pass | **Finding H2b, fixed**: the code with two Expo requests per batch |
| `break-confirm-no-rowlock` | violation NoMissedAlert | Broken variant: the code before the H1 fix |
| `break-confirm-no-unique` | violation OneAlertPerThreshold | Broken variant: proves the property can fail |
| `break-push-no-lock` | violation PushAtMostOnce | Broken variant: proves the property can fail |
| `break-push-no-expiry` | violation EveryPushSettles | Broken variant: proves the property can fail |
| `break-push-retry-unknown` | violation PushAtMostOnce | Broken variant: H2 comes back if an unknown outcome is retried |
| `break-push-drop-chunks` | violation PushAtMostOnce | Broken variant: H2b comes back if a rejected request retries the whole batch |

In Codex, the first run needs network access to download the jar. Run it outside the sandbox once, or copy the jar to `~/.cache/tla/tla2tools-1.7.4.jar`.

## Does my change touch this?

Run `run.sh`. Its first line lists commits since the sync commit, and uncommitted edits, in the covered files below. Then read the diff of each covered function against the step it maps to in the `.tla` code map. A change touches the verification when it:
- splits a step that the model treats as one,
- adds or removes a branch, a lock, a retry, or a commit,
- moves the spend read relative to the status write or the claim,
- adds a new path that writes `budget_alerts_sent`, `notifications`, or `push_status`,
- changes what is sent to Expo, or how its errors are handled.

A change that only edits formatting, logging, analytics, or message text does not touch it. Judge that against the model, not against the commit message.

## Reading a result

- **All rows `ok`:** the model still holds as before. If covered code changed, confirm that the model still describes it (next section) before you move the sync commit.
- **`MISMATCH` where `pass` was expected:** run `run.sh NAME.cfg` and read the trace. TLC prints `State N: <Action ...>` lines. Tell each step in the code's words, using the module's code map. For example, `Read` is `check_thresholds` reading spend, and `SendChunk` is one `ExpoPushClient.send` POST. Then replay every step against the real code:
  - A step that cannot happen in the code is a **modeling error**. Fix the model and say what was wrong.
  - If every step can happen, it is a **bug**. Report the trace as numbered steps in the code's words, plus the harm. Do not weaken a property or the model to make it pass, and do not change product code unless the user asks.
- **`MISMATCH` where a violation was expected:** the code may have fixed a finding, or the model may have lost the step that breaks it. Confirm which from the code, then follow the next section.
- **`error`:** TLC failed to parse or run. Read the log; it is a modeling error, never a result.

## Updating the verification

1. Change the model from the code first, before you rerun, never from the result. Each step in the model keeps pointing to a step a reviewer can open, and each step indivisible in the code stays one step in the model. Model a new design choice as a constant, the way `RowLock`, `Expiry`, `UnknownOutcome`, `KeepChunks`, `UniqueLedger`, and `BudgetRowLock` are. Set it in the configs that describe the code as it is (`confirm*`, `push*`, but not `break-*`).
2. Change a property only for a promise that changed on purpose, with evidence: a docstring, a test, the PRD, or the commit message. Write down the old wording, the new wording, and the evidence.
3. Keep the bounds. If you must lower one, say so in your report.
4. Rerun. On a pass, prove the check can still fail: break the new code's guard in the model (a removed lock, a reordered step) and see the property fail, then put it back. On a violation, replay the trace as described above.
5. When a fix lands for a finding, change that config's `EXPECT` to `pass` only after the rerun passes, and update its comment. Keep the reproduction script as a regression check.
6. Update the coverage record and move the sync commit to the commit you checked, but only once the models describe the code at that commit.

## Findings

All three were found and reproduced against the real code on 2026-10-26, using the scripts in `formal/budget_alerts/repro/`. All three are fixed. Both scripts need a running `verify-grocery-genie` instance (`.agents/skills/verify-grocery-genie/scripts/gg-verify launch`).

**H1: concurrent confirms miss alerts** (`confirm-missed`). **Fixed 2026-10-26.** Two receipts confirmed at the same moment could push spend past a threshold with no alert. The shortest trace, before the fix, with a budget of 2 units and thresholds 50/100:
1. Request B runs `confirm_receipt`, which sets its receipt to `confirmed` and flushes.
2. B's `check_thresholds` reads spend: its own receipt only, 50%.
3. B's `claim_alert` inserts the 50% ledger row, and `create_notification` adds the alert (uncommitted).
4. Request A sets and flushes its own receipt.
5. A's `check_thresholds` reads spend. B has not committed, so A sees 50%.
6. B commits.
7. A's `claim_alert` for 50% hits B's row, so `ON CONFLICT DO NOTHING` skips it. A commits.
8. Spend is 100%, and no 100% alert is ever sent.

Reproduction: `backend/.venv/bin/python formal/budget_alerts/repro/h1_concurrent_confirm.py 20`. Before the fix, 20 of 20 trials (and 18 of 20 on a rerun) had two concurrent confirms reach 100% of a 29.54 budget with no alert at all. The control run with `--serial` missed 0 of 5.

The fix: `check_thresholds` selects all of the user's live budgets `ORDER BY id FOR UPDATE` before the spend read, and holds the locks until the request commits. A second confirm for the same user waits there, and its spend read, a new statement at READ COMMITTED, sees the first receipt. It locks every budget because any receipt can move overall and category spend, and it locks in id order so that two requests never deadlock. After the fix, the script missed 0 of 20. Keep it as the regression check: pytest runs on SQLite, which drops `FOR UPDATE`, so `test_check_thresholds_locks_budgets_before_reading_spend` checks only the SQL. `break-confirm-no-rowlock` keeps the trace.

**H2: a fault after the Expo send pushed again** (`push-crash`). Fixed on 2026-10-26. The trace on the old code:
1. `deliver_pending_pushes` locks n1 and n2 with `FOR UPDATE SKIP LOCKED`.
2. `ExpoPushClient.send` posts them, and Expo delivers both.
3. The response is lost: `httpx` times out, raising `httpx.HTTPError`. The `except` branch commits only the expire updates, so both rows stay `push_status IS NULL`.
4. The next run selects n1 and n2 and sends them again.

A worker that dies, or a `db.commit()` that fails, after step 2 gives the same result.

**H2b: a multi-chunk batch resent its first chunk, with no fault** (`push-chunks`). Fixed on 2026-10-26. A run with more than 100 messages needs two Expo requests. For example, 60 notifications to users with 2 devices each make 120 messages.
1. Chunk 1 is delivered.
2. Chunk 2 gets a 5xx or 429 response, so `send` raises and the tickets for chunk 1 are lost.
3. The whole batch stays pending.
4. The next run sends chunk 1 again.

**The fix keeps at most once.** The user chose at most once over at least once with deduplication, so `PushAtMostOnce` is unchanged. Each step below is in `push_tasks.py`:
- The claim: the run commits its batch as `sending` before the first POST. Only `NULL` rows are selected, so a claimed row is never sent again.
- The task sends one Expo request per chunk and commits `sent` for its ok tickets before the next request.
- On an `httpx.HTTPError`, `expo_rejected()` decides. A 4xx/5xx or a connect or pool error means Expo took nothing, so the chunk and the rest go back to `NULL`. Any other error leaves the outcome unknown: the chunk ends `failed`, and only the rest goes back.
- A run that dies leaves rows `sending`. A later run's expire step sets them `failed` once they are older than `push_max_age`.

The cost: an alert whose outcome is unknown is never retried, so the user may miss it.

Before the fix, `repro/h2_push_resend.py` pushed messages twice in every scenario: lost response 2 of 2, chunks 100 of 120, failed commit 2 of 2. After the fix, it pushes none twice: lost ends `failed`, chunks ends all `sent`, and crash leaves `sending` until the expire step. The same script still finds 3 of 3 on the old code (`a7a60f8`). Run it as `backend/.venv/bin/python formal/budget_alerts/repro/h2_push_resend.py`, against Postgres, with Expo stubbed by `httpx.MockTransport`. The unit tests in `backend/tests/tasks/test_push_tasks.py` cover the same faults on SQLite.

## Scope and assumptions

Verified, within the bounds in each config:
- **Confirm side:** one user, one overall budget, one period. Each receipt adds one unit of spend; up to 3 receipts, thresholds 50/80/100, 1 injected rollback. Postgres runs at READ COMMITTED, the default, since no isolation level is set.
- **Push side:** up to 3 notifications, 2 workers, `BATCH_SIZE` and the chunk size as set in each config. Expo may reject any request, any number of times. Up to 1 crash, failed commit, or lost response.

Left out:
- category budgets (same steps, another budget row). A category correction recategorizes same-named items on the user's other receipts (`_retroactive_category_update`), which moves category spend in their periods. `update_receipt` passes every such date, with the receipt's own, to one `check_thresholds` call: it locks the budgets once, then reads and claims per period. Per period that is the same `Flush`, `Read`, `Claim`. One call keeps one lock pass: a second pass in the same transaction could lock a budget created in between after a concurrent confirm took it, and deadlock;
- an edit that lowers a confirmed receipt's spend, or moves its date to another period: spend in the model only grows. Neither can break a property: the old period reaches fewer thresholds, and an edit to a confirmed receipt runs the alert check for its new date (`update_receipt` → `_alert_on_thresholds`);
- editing a budget during a period (`save_budget` updates the active budget in place, `update_budget` can move `period_start`). The model holds one budget at a fixed amount. An in-place save waits on the confirm's budget row lock (`check_thresholds` locks the user's active budgets), so it cannot interleave with `Read` and `Claim`. Creating or reviving a budget takes no such wait, and a confirm already in flight checks only the budgets it locked. Thresholds already in `budget_alerts_sent` for the period stay claimed after a raise, so they do not alert again at the new amount;
- two requests confirming the same receipt;
- the `no_device` path and `DeviceNotRegistered` token deletion;
- a notification sent to several devices, whose messages can fall in different chunks. The model gives each user one device. `test_failed_chunk_keeps_earlier_chunks_and_retries_only_the_rest` covers two devices;
- Expo push receipts (the second-phase delivery report);
- creating the notification in the same transaction as the alert. The model merges `claim_alert` and `create_notification` into one step, which is sound because nothing sees either write before commit;
- weekly summaries;
- the daily purge (`purge_tasks.py`), which erases a budget soft-deleted longer than the restore window, its `budget_alerts_sent` rows (ON DELETE CASCADE), and the `budget_threshold` notifications that name it. `check_thresholds` neither locks nor reads a deleted budget, so a confirm never claims on it. The purge holds the budget row lock and rechecks `deleted_at` in its delete, so a revive in `create_budget` cannot keep the row and lose its ledger. Those notifications are far older than `push_max_age`, so the push beat has already settled them;
- anything outside these files.

The model's `Select` may take any subset of the right size, while the code takes the oldest rows (`ORDER BY created_at`). That over-approximates the code. When you replay a trace, check that the result does not depend on which rows were picked.

A pass covers the model within its bounds, not the whole system.

## Coverage record

Sync commit: `b49ea22`

The verification was last confirmed to describe these files and functions at the sync commit. `run.sh` reads this table and the sync commit.

| File | Functions | Model steps |
| --- | --- | --- |
| `backend/app/core/dependencies.py` | `get_db`, `engine` (no isolation level) | `ConfirmAlerts`: `Commit`, `Abort` |
| `backend/app/services/receipt_service.py` | `confirm_receipt`, `update_receipt` (date and status branches: the date is set before the status branch, in the same transaction; an already confirmed receipt is not confirmed again and cannot leave `confirmed` (422), an edit to one flushes, then runs `_alert_on_thresholds`, and every edit alerts in the periods `_retroactive_category_update` changed), `create_manual_receipt`, `_after_confirm` and `_alert_on_thresholds` (every alert path shares them) | `ConfirmAlerts`: `Flush` |
| `backend/app/services/budget_service.py` | `check_thresholds` (budget row lock, taken once for every period it checks), `get_spending_by_category`, `_active_thresholds`, `claim_alert`; watched, not modeled: `get_period_containing` (picks the period whose spend `Read` sums; the model holds one period), `save_budget`, `update_budget`, `restore_budget` (they write budget rows the `Read` step locks) | `ConfirmAlerts`: `Read`, `Claim` |
| `backend/app/services/notification_service.py` | `create_notification` | `ConfirmAlerts`: `Claim` |
| `backend/app/models/database.py` | `BudgetAlertSent` unique key, `Notification.push_status`, `ix_notifications_push_pending`, `ix_notifications_push_sending` | `UniqueLedger`, `PushDelivery` statuses |
| `backend/app/tasks/push_tasks.py` | `deliver_pending_pushes`, `BATCH_SIZE` | `PushDelivery`: `Expire`, `Select`, `Claim`, `Record`, `Finish`, `Crash` |
| `backend/app/services/push_service.py` | `ExpoPushClient.send`, `expo_rejected`, `EXPO_MAX_BATCH` | `PushDelivery`: `SendChunk` |
| `backend/app/tasks/celery_app.py` | `deliver-pending-pushes` beat schedule | `PushDelivery`: workers and fairness |

`create_manual_receipt` inserts the receipt as `confirmed`, flushes, then runs `_after_confirm`, the same lock, read, and claim steps as `confirm_receipt`, in the same transaction (fix `4d81efa`). In the model it is one more `Flush` request, so a manual entry needs no model change.

To bring the verification back in line after changes that skipped this skill, use `gg-maintain-formal-verification-skill`.
