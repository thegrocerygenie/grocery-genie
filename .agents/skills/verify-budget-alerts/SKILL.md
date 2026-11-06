---
name: verify-budget-alerts
description: "Model-check Grocery Genie's budget alert and push delivery pipeline with TLA+: one alert per threshold, no missed alert, each push sent at most once, every push settles. Use when a change touches confirm_receipt, create_manual_receipt, check_thresholds, claim_alert, budget_alerts_sent, create_notification, _alert_on_price_changes, price_alerts_sent, deliver_pending_pushes, ExpoPushClient.send, expo_rejected, or the request transaction in get_db."
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
| `confirm-rollover` | pass | The code with a rollover run (V11-P3): 3 receipts this period, 1 dated last period that shrinks this period's limit |
| `push` | pass | The code: 3 notifications, 2 workers, Expo may reject, no faults |
| `push-crash` | pass | **Finding H2, fixed**: the code with one fault |
| `push-chunks` | pass | **Finding H2b, fixed**: the code with two Expo requests per batch |
| `break-confirm-no-rowlock` | violation NoMissedAlert | Broken variant: the code before the H1 fix |
| `break-confirm-no-unique` | violation OneAlertPerThreshold | Broken variant: proves the property can fail |
| `break-confirm-rollover-prior-unchecked` | violation NoMissedAlert | Broken variant: under a rollover run, a last-period receipt does not check this period |
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

The fix: `check_thresholds` selects all of the user's live budgets `ORDER BY id FOR UPDATE` before the spend read, and holds the locks until the request commits. A second confirm for the same user waits there, and its spend read, a new statement at READ COMMITTED, sees the first receipt. It locks every budget because any receipt can move overall and category spend, and it locks in id order so that two requests never deadlock. After the fix, the script missed 0 of 20. Keep it as the regression check, and read the [repro notes](#h1-repro-notes) before you trust a miss: pytest runs on SQLite, which drops `FOR UPDATE`, so `test_check_thresholds_locks_budgets_before_reading_spend` checks only the SQL. `break-confirm-no-rowlock` keeps the trace.

<a id="h1-repro-notes"></a>H1 repro notes. A miss counts only when the `--serial` control misses 0. If the serial control misses too, the setup is wrong, not the lock.
- Only the period that holds today alerts (M5, `check_thresholds`). The mock scan is always dated `2026-03-15`, so the script sets the budget to this month and moves each receipt's date to today on review before the confirms. A receipt in a past period gets no alert at all, with or without the lock. On 2026-10-30 that gate made the script report 20 of 20 and serial 5 of 5 missed, with `alerts []`.
- Sign-up allows 30 auth requests per IP per minute, and the counts live in Redis DB 1, which outlives a launch. The script waits out a `429` on sign-up.
- The script is still red-capable. On 2026-10-30, with `.with_for_update()` removed from `check_thresholds`, it missed 19 of 20. With the lock it missed 0 of 20 twice, and serial 0 of 5.

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

Before the fix, `repro/h2_push_resend.py` pushed messages twice in every scenario: lost response 2 of 2, chunks 100 of 120, failed commit 2 of 2. After the fix, it pushes none twice: lost ends `failed`, chunks ends all `sent`, and crash leaves `sending` until the expire step. The same script still finds 3 of 3 on the old code (`7cfad8c`). Run it as `backend/.venv/bin/python formal/budget_alerts/repro/h2_push_resend.py`, against Postgres, with Expo stubbed by `httpx.MockTransport`. The unit tests in `backend/tests/tasks/test_push_tasks.py` cover the same faults on SQLite.

## Scope and assumptions

Verified, within the bounds in each config:
- **Confirm side:** one user, one overall budget, one period. Each receipt adds one unit of spend; up to 3 receipts, thresholds 50/80/100, 1 injected rollback. Postgres runs at READ COMMITTED, the default, since no isolation level is set.
- **Rollover (V11-P3):** with a Premium rollover run, the period's limit is the budget plus last period's unspent amount (never less than the budget), derived from spend in `rollover_carries` under the same budget lock as the spend read. A receipt dated last period then lowers this period's limit, so `check_thresholds` checks the current period for it (its `earliest_past` branch). `confirm-rollover` adds one such receipt to three this-period ones; the model's carry spans one period, with a zero opening.
- **Push side:** up to 3 notifications, 2 workers, `BATCH_SIZE` and the chunk size as set in each config. Expo may reject any request, any number of times. Up to 1 crash, failed commit, or lost response.

Left out:
- category budgets (same steps, another budget row). A category correction recategorizes same-named items on the user's other receipts (`_retroactive_category_update`), which moves category spend in their periods. `update_receipt` passes every such date, with the receipt's own, to one `check_thresholds` call: it locks the budgets once, then reads and claims per period. Per period that is the same `Flush`, `Read`, `Claim`. One call keeps one lock pass: a second pass in the same transaction could lock a budget created in between after a concurrent confirm took it, and deadlock;
- an edit that lowers a confirmed receipt's spend, or moves its date to another period: spend in the model only grows. Neither can break a property: the old period reaches fewer thresholds, and an edit to a confirmed receipt runs the alert check for its new date (`update_receipt` → `_alert_on_thresholds`);
- editing a budget during a period (`save_budget` updates the active budget in place, `update_budget` can move `period_start`). The model holds one budget at a fixed amount. An in-place save waits on the confirm's budget row lock (`check_thresholds` locks the user's active budgets), so it cannot interleave with `Read` and `Claim`. Creating or reviving a budget takes no such wait, and a confirm already in flight checks only the budgets it locked. Thresholds already in `budget_alerts_sent` for the period stay claimed after a raise, so they do not alert again at the new amount;
- receipts outside the periods that hold yesterday, today, and tomorrow (`clock.today()`, UTC; a day either side covers the user's local date). `check_thresholds` drops their periods before the lock, so they never lock, read, or claim, and send no alert in their own period (M5). The model's one period is the current one. A receipt dated in a later period does not alert when that period begins. The exception is an earlier-period receipt under a rollover run, modeled above: it checks the current period;
- rollover carries longer than one period, openings from a restarted run, and category runs: the carry is a sum over earlier periods' spend, all read under the one lock, and only grows the limit's sensitivity to earlier spend in the same direction (more spend, lower limit), so a longer chain is the same `Read` with a different `Limit`;
- changes to the limit that are not confirms: turning rollover on or off (`set_rollover`), restarting runs on an amount, start-day or currency change (`_restart_rollover`, `restart_rollovers` from `PATCH /api/users/me`), and Premium starting or lapsing (`is_premium`, written by RevenueCat). Like a budget edit, each changes the limit outside `Read`; one that lowers it (rollover off, a lapse) alerts at the next confirm, not at once. The pre-lock `_running_budgets` check can miss a run turned on concurrently, which only raises the limit, so it reaches no new threshold;
- two requests confirming the same receipt;
- the `no_device` path and `DeviceNotRegistered` token deletion;
- a notification sent to several devices, whose messages can fall in different chunks. The model gives each user one device. `test_failed_chunk_keeps_earlier_chunks_and_retries_only_the_rest` covers two devices;
- Expo push receipts (the second-phase delivery report);
- creating the notification in the same transaction as the alert. The model merges `claim_alert` and `create_notification` into one step, which is sound because nothing sees either write before commit;
- weekly summaries;
- account deletion (`DELETE /api/users/me`) during a push run. It removes the user's rows; after the claim, `deliver_pending_pushes` writes each status by id (`_set_push_status`), so a row that is gone matches nothing and the run goes on for other users. A removed row is never selected again, so it cannot break `PushAtMostOnce`, and it no longer exists to settle. `test_account_deleted_mid_run_does_not_stop_other_users_pushes` covers it;
- the steps `_after_confirm` runs besides the budget check, each in a savepoint that is logged and undone on failure, so neither can abort the confirm's transaction or write `budget_alerts_sent`; to the model they are steps that change none of its state:
  - before it, `_record_prices` (PI-01/02: item matching and price observations). It writes `line_items`, `canonical_items`, aliases and `price_observations`, never spend: `Read` sums `line_items.total_price`, which it leaves alone. It can wait on another confirm's alias insert, which delays the `Read` step and cannot reorder it. On a failure it reloads the receipt, its lines and store with a plain `SELECT` (`82d4f10`): the savepoint rollback expired them, and the next read used to raise `MissingGreenlet` and abort the confirm. The savepoint flushed the confirmed status on entry, so the rollback leaves it, and the confirm goes on to `Read`;
  - after it, `_alert_on_price_changes` (PI-03), a second writer of `notifications` (`type = 'price_change'`). It runs after `check_thresholds` has locked the budgets, and claims `price_alerts_sent` rows in item id order, so locks are always budgets first, then ledger rows in one order: no deadlock with a concurrent confirm. Its notifications enter the push pipeline like any other, which `PushDelivery` covers whatever the type. Its own promise, one price alert per item per cooldown, is not in these models: the claim is one upsert on the ledger's unique key (`PriceAlertService.claim`), checked by `backend/tests/services/test_price_alert_service.py::test_two_concurrent_claims_for_one_item_alert_once` on Postgres. Since DA-4 the cooldown is the user's (`users.price_alert_cooldown_days`, 1–30, null for `GG_PRICE_ALERT_COOLDOWN_DAYS`): `claim` reads it with a plain `db.get(User)` (no lock; the row is usually already in the session) before the same single upsert, so the claim stays one step and its lock order is unchanged. A cooldown changed between two confirms only moves the upsert's cutoff (EC-PI 9, `backend/tests/api/test_price_alert_list.py`). The alert's title, body and `data` changed (PI-03 AC 9, AC 5): message text and payload, which the models do not describe. Since DA-7 a mute can end (`muted_until`, PI-03 AC 11-12): `_alert_on_price_changes` reads `clock.now()` once before `detect` and passes it in, and `detect`'s mute reads (`_muted_items`, `_store_muted`, `_store_mutes`) keep only mutes live at that time. Those are plain reads with no lock and no write, the same skip branch as before, and the one `now` also feeds the claims as it did, so the claim and its lock order are unchanged. A mute `POST` is now an upsert that replaces the end (and, for a store, first deletes the user's other mute rows in the group): it writes only the user's mute rows, takes no budget or ledger lock and writes no `notifications`;
- an item merge (`ItemMatchingService.merge`, `_move_price_alerts`, DA-4), a third writer of `notifications`: it rewrites `data.canonical_item_id` of the user's `price_change` rows from the merged item to the surviving one (EC-PI 11). It runs after the merge's `DELETE` of the source item, which waits on the key-share lock of a confirm still writing an alert for the source (its `price_alerts_sent` insert), so the rewrite, a new READ COMMITTED snapshot, also catches that alert once it commits (`backend/tests/services/test_merge_price_alert_race.py`, Postgres). It writes only `data`, never `push_status`, and creates no row, so to `PushDelivery` it changes no state; a push still pending then carries the new item's url (`push_data` reads `data` at send time). Its `UPDATE` row-locks those notifications: a push run's `FOR UPDATE SKIP LOCKED` skips them until the merge commits, which delays `Select` and cannot reorder `Claim`; a merge waits on a row a push run holds. The merge holds no budget or ledger row lock a push run wants, so no lock cycle;
- a split by line (`ItemMatchingService.split_lines`, `_move_raised_suggestions`, DA-6). It locks the item (`_lock_items`, `FOR NO KEY UPDATE`) first, then moves `line_items.canonical_item_id` (never `total_price`, so spend is unchanged), their `price_observations`, aliases and pending `item_match_suggestions`, and copies the item's live `price_alert_item_mutes` row to the new items with its `muted_until` (DA-7). It writes no `notifications`, `budget_alerts_sent` or `price_alerts_sent` row and takes no budget or ledger lock, so it is never part of a lock cycle with a confirm; a confirm's foreign-key inserts take only key-share locks on the item, which `FOR NO KEY UPDATE` does not block. A copied mute only makes `detect` skip the new items as it skipped the original. Split racing merge or accept: `backend/tests/services/test_split_concurrency.py` (Postgres). A receipt edit racing a split is a known gap, queued separately;
- the user row lock that custom categories take (`CategoryService._lock_user`, V11-P1, `SELECT ... FOR NO KEY UPDATE` on `users`). A correction (`update_receipt` → `ensure_usable`), a manual receipt (`create_manual_receipt` → `ensure_usable`), a scan applying a mapping (`usable_custom`) and `save_budget` take it before anything else, and only when a custom category is involved; every path that also runs `check_thresholds` takes it first, so locks are always the user row, then budgets in id order, then ledger rows. Nothing that holds a budget lock waits for it: a confirm inserting its notification takes only the key-share lock on the user row, which `FOR NO KEY UPDATE` does not block. To the model it delays the `Flush` step and changes none of its state. Creating, renaming or restyling a category (`create`, `update`; DA-9 replaced `rename` with `update`, which also sets colour and icon) takes it, then writes only that category's row: no budget, ledger or notification. A category delete (`CategoryService.delete`) holds the user row, then locks the category's budgets `ORDER BY id FOR UPDATE` before it deletes them and their ledger rows, the order `check_thresholds` uses; before that fix its `DELETE` met them in table order and could deadlock with a confirm when the category had budgets in two periods. `backend/tests/api/test_custom_categories_concurrency.py` covers both against a category delete on Postgres;
- the item locks a receipt edit takes (`ItemMatchingService.lock_line_items`, DA-6, `FOR NO KEY UPDATE` on its lines' `canonical_items` in id order, so a split or merge cannot move a line before the price rebuild). `update_receipt` takes them after the custom-category user row and before any receipt, line or budget write, so locks are the user row, then items, then budgets, then ledger rows. Nothing that holds a budget or ledger lock waits for an item: `_record_prices`, the one item writer on an alert path, runs before `check_thresholds`. To the model it delays `Flush` and changes none of its state. `backend/tests/services/test_receipt_edit_concurrency.py` covers the order on Postgres;
- the user row locks that Premium takes (`PremiumService._locked_users`, V11-P0, one `SELECT ... ORDER BY id FOR UPDATE` on `users` for every user an event names) in the RevenueCat webhook, a transfer, and `POST /api/users/me/premium/refresh`. It writes only the `premium_*` columns and `revenuecat_events`, and takes no budget or ledger lock, so it is never part of a lock cycle with a confirm. `FOR UPDATE` does block the key-share lock that a confirm's `budget_alerts_sent` and `notifications` inserts take on the user row, and the custom-category `FOR NO KEY UPDATE`: to the model it delays `Flush` or `Claim` and changes none of its state. Whether a rollover carry applies (`is_premium`) is read in `Read`; a change to it is a limit change outside `Read`, covered above;
- the waitlist free year (V11-P5, `waitlist_service.py`, `waitlist_tasks.py`). It writes only `waitlist_entries`, `waitlist_redemptions`, `waitlist_audience_purges` and the `User.waitlist_claim_*` columns; its one row lock is `FOR UPDATE SKIP LOCKED` on a `waitlist_redemptions` row, and the purge's `UPDATE users` sets non-key columns only, which does not block a confirm's key-share lock. It takes no budget or ledger lock and writes no `notifications`. A granted year reaches the limit only through `PremiumService.refresh` (the Premium bullet above), a limit change outside `Read`. Its three beat entries (`waitlist-sync-and-match`, `waitlist-retry-grants`, `waitlist-purge-after-window`) run other tasks and leave `deliver-pending-pushes` as it was;
- receipts in a currency other than the user's (`in_budget_currency`): they add no spend, and spend in the model only grows;
- the daily purge (`purge_tasks.py`), which erases a budget soft-deleted longer than the restore window, its `budget_alerts_sent` rows (ON DELETE CASCADE), and the `budget_threshold` notifications that name it. `check_thresholds` neither locks nor reads a deleted budget, so a confirm never claims on it. The purge holds the budget row lock and rechecks `deleted_at` in its delete, so a revive in `create_budget` cannot keep the row and lose its ledger. Those notifications are far older than `push_max_age`, so the push beat has already settled them;
- anything outside these files.

The model's `Select` may take any subset of the right size, while the code takes the oldest rows (`ORDER BY created_at`). That over-approximates the code. When you replay a trace, check that the result does not depend on which rows were picked.

A pass covers the model within its bounds, not the whole system.

## Coverage record

Sync commit: `bf06aae`

The verification was last confirmed to describe these files and functions at the sync commit. `run.sh` reads this table and the sync commit.

| File | Functions | Model steps |
| --- | --- | --- |
| `backend/app/core/dependencies.py` | `get_db`, `engine` (no isolation level) | `ConfirmAlerts`: `Commit`, `Abort` |
| `backend/app/services/receipt_service.py` | `confirm_receipt`, `update_receipt` (date and status branches: the date is set before the status branch, in the same transaction; an already confirmed receipt is not confirmed again and cannot leave `confirmed` (422), an edit to one flushes, then runs `_alert_on_thresholds`, and every edit alerts in the periods `_retroactive_category_update` changed), `create_manual_receipt`, `_after_confirm` and `_alert_on_thresholds` (every alert path shares them; since V11-05 the store branch of `update_receipt` and `create_manual_receipt` also write `receipts.store_name`, a plain column in the same flush that spend never reads); watched, not modeled: `_record_prices` (before the budget check) and `_alert_on_price_changes` (after it; see Scope); not covered: `_extract` (DA-2, Priority OCR: the scan reads the user row with a plain `db.get` to pick its extraction model; its receipt stays `pending_review`, which `Read` never sums) | `ConfirmAlerts`: `Flush` |
| `backend/app/services/budget_service.py` | `check_thresholds` (budget row lock, taken once for every period it checks), `get_spending_by_category`, `_active_thresholds`, `claim_alert`; watched, not modeled: `get_period_containing` (picks the period whose spend `Read` sums; the model holds one period), `save_budget`, `update_budget`, `restore_budget` (they write budget rows the `Read` step locks); rollover (V11-P3): `rollover_carries`, `_carries`, `_spend_by_period` (the limit, read in `_period_breaches` under the lock) and the `earliest_past` branch of `check_thresholds` are modeled; `set_rollover`, `_restart_rollover`, `restart_rollovers`, `_running_budgets`, `_carry_now`, `_rollover_after_restore`, `_today` (the user's local date that picks the period a rollover change restarts in; a plain read, no lock) and the revive branch of `save_budget` (resets the run) are watched; not covered: `get_budget_summary`, `_get_category_looks` (DA-9: the summary reads each category's colour and icon, a read path outside `check_thresholds`) | `ConfirmAlerts`: `Read`, `Claim`, `Limit`, `Checks` |
| `backend/app/services/notification_service.py` | `create_notification` | `ConfirmAlerts`: `Claim` |
| `backend/app/services/category_service.py` | watched, not modeled: `_lock_user`, `ensure_usable`, `usable_custom` (the user row lock taken before the budget locks), `create`, `update` (DA-9: the user row lock, then only the category's name, colour and icon), `delete` (locks the category's budgets in id order, then deletes them and their `budget_alerts_sent` rows; see Scope) | none |
| `backend/app/services/price_alert_service.py` | watched, not modeled: `detect`, `claim` (the second `notifications` writer and its ledger lock order; see Scope). Since DA-4, `claim` reads the user's cooldown (`cooldown_days(user)`, a plain read) before its one upsert, and `_alert` builds the design's copy and the list row's `data`: no new branch, lock or write. Since DA-7, `detect` takes the confirm's `now` and keeps only mutes live at it (`live`, `_muted_items`, `_store_muted`, `_store_mutes`, which replaced `_muted_groups`): plain reads. Since V11-05, `detect`'s store mute check and store name (`_store_name`) read the user's store groups through `StoreService.groups` (with the names saved on the user's mutes and merges): plain reads, no lock, no write, the same branch as before | none |
| `backend/app/models/database.py` | `BudgetAlertSent` unique key, `Notification.push_status`, `ix_notifications_push_pending`, `ix_notifications_push_sending`; watched: `PriceAlertSent` unique key, `User.price_alert_cooldown_days` (DA-4), `PriceAlertItemMute.muted_until` and `PriceAlertStoreMute.muted_until` (DA-7, read by `detect`), `Budget.rollover_enabled`, `rollover_start`, `rollover_opening`, the `User.premium_*` columns; not covered: the V11-P5 waitlist tables and `User.waitlist_claim_*` columns (see Scope), `Category.color` and `Category.icon` (DA-9) | `UniqueLedger`, `PushDelivery` statuses, `Rollover` |
| `backend/app/services/item_matching_service.py` | watched, not modeled: `merge`, `_move_price_alerts` (DA-4: after deleting the source item, a merge rewrites the item id in its user's `price_change` notifications' `data`; see Scope); `split_lines`, `_move_raised_suggestions` (DA-6: item lock first, moves lines, prices, aliases and suggestions, copies item mutes with their end, DA-7; no notification, ledger or budget write; see Scope); `_move_price_alert_state` (merge keeps the later mute end, DA-7: writes only mute rows) | none |
| `backend/app/core/entitlements.py` | watched, not modeled: `is_premium` (whether a rollover carry applies to the limit); not covered: `require_premium` and its features (DA-1 adds comparison and mutes, which gate routes outside these files) | `Rollover` |
| `backend/app/tasks/push_tasks.py` | `deliver_pending_pushes`, `BATCH_SIZE`, `_set_push_status` (after the claim, each `sent`, `NULL`, and `failed` write is one `UPDATE ... WHERE id IN`); `push_data` builds each message's payload (a price alert carries its item's url), not modeled: the model is the same for any payload | `PushDelivery`: `Expire`, `Select`, `Claim`, `Record`, `Finish`, `Crash` |
| `backend/app/services/push_service.py` | `ExpoPushClient.send`, `expo_rejected`, `EXPO_MAX_BATCH` | `PushDelivery`: `SendChunk` |
| `backend/app/tasks/celery_app.py` | `deliver-pending-pushes` beat schedule; not covered: the V11-P5 `waitlist-*` entries (see Scope) | `PushDelivery`: workers and fairness |

`create_manual_receipt` inserts the receipt as `confirmed`, flushes, then runs `_after_confirm`, the same lock, read, and claim steps as `confirm_receipt`, in the same transaction (fix `c22be8f`). In the model it is one more `Flush` request, so a manual entry needs no model change.

To bring the verification back in line after changes that skipped this skill, use `gg-maintain-formal-verification-skill`.
