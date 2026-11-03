# Budget rollover

Budget rollover (V1.1, Premium per decision D2; BC-FR Budget Management) lets a budget's unspent amount carry into the next period. A Premium user turns it on per budget with `PUT /api/budgets/{id}/rollover`; a free user gets `403 premium_required`. Turning it on carries last period's unspent amount into this period when the budget existed then, and from then on each period's unspent amount, including what rolled into it, carries into the next. Overspend carries nothing. The period's limit (`budget` in `/api/budgets/summary` and `/api/dashboard/spending`, with the carry in `rolled_over`) is what progress and threshold alerts use. The rules are in `docs/prd/07-data-model.md`, "Budget rollover".

## Sub-features

- `rollover-free` a free user's `PUT /api/budgets/{id}/rollover` gets `403` with `detail.code` `premium_required` and `detail.feature` `budget_rollover`; the budget row keeps `rollover_enabled` false.
- `rollover-on` a Premium user turns it on: `200` with `rollover_enabled` true; the row has `rollover_start` in last period and `rollover_opening` 0.
- `rollover-carry` this period's summary shows `budget` = amount + last period's unspent amount, and `rolled_over` that amount.
- `rollover-alert` a threshold alert fires on the limit with the carry, not on the amount: the 80% alert, with no "Budget Exceeded" though spend is past the amount.
- `rollover-late-receipt` a late receipt dated last period shrinks this period's carry, and the threshold this period's spend now reaches alerts at once.
- `rollover-next` the next period's summary includes this period's unspent amount; overspend carries nothing.
- `rollover-mid-month` a budget created this period carries nothing into this period; its first carry is next period's.
- `rollover-amount-change` a new amount applies to this period at once and restarts the run there, carrying what it had reached.
- `rollover-lapse` when Premium ends, the limit is the amount again (`rolled_over` 0), `GET /api/budgets` keeps `rollover_enabled` true, and the toggle answers `403`.
- `rollover-delete` deleting the account deletes the budgets that hold the run.

## How to get to it (user POV)

- Budget tab, gear, Budget settings: a ROLLOVER section has a switch per budget with a limit ("Monthly budget", then each category). Save sends `PUT /api/budgets/{id}/rollover` for each switch that changed, after the limits are saved. A free user sees an upgrade prompt in place of the switches, and "See Premium" opens the paywall. On the Budget tab, the hero card says "Includes $X rolled over" under the spend line. The switches, the prompt and that line are UI: they need a Simulator check. The paywall lists "Budget rollover".

## Driving it with gg-verify

Preconditions: a debug-mode instance; `$G doctor` shows no `FAIL`. Premium comes from a RevenueCat webhook, as in [`premium.md`](premium.md) (its `ev` builder). The steps use manual receipts (`POST /api/receipts`, saved as confirmed) so each lands on a chosen date. `LAST` is a day in last month, `TODAY` is today (`date +%F`), and `THIS` and `NEXT` are this and next month as `YYYY-MM`. The budget starts on the 1st of last month (`START`), so it existed then.

```bash
$G signup rollover
uid=$($G api GET /api/users/me | jq -r .id)
bid=$($G api POST /api/budgets "{\"category_id\":null,\"amount\":30,\"period_type\":\"monthly\",\"period_start\":\"$START\"}" | jq -r .id)
manual() {  # manual DATE AMOUNT
  $G api POST /api/receipts "{\"store_name\":\"Corner Shop\",\"date\":\"$1\",\"total\":$2,\"items\":[{\"name\":\"Groceries\",\"quantity\":1,\"unit_price\":$2,\"total_price\":$2}]}"
}
```

- **Free (`rollover-free`).** `$G api PUT /api/budgets/$bid/rollover '{"enabled":true}' || true` prints `-> 403` and `{"detail":{"code":"premium_required","feature":"budget_rollover",...}}`. `$G sql "SELECT rollover_enabled, rollover_start FROM budgets WHERE id = '$bid'"` is `f|`.
- **On (`rollover-on`).** Grant Premium: `$G revenuecat "$(ev "g-$uid" INITIAL_PURCHASE $now $((now+30*day)))"` is `applied`. Spend 10 last month: `manual $LAST 10`. Then `$G api PUT /api/budgets/$bid/rollover '{"enabled":true}'` is `200` with `rollover_enabled` true, and the row is `t|<START>|0.00` (`rollover_enabled, rollover_start, rollover_opening`).
- **Carry (`rollover-carry`).** `$G api GET "/api/budgets/summary?period=$THIS" | jq -c .overall` is `{"budget":50.0,"spent":0.0,"remaining":50.0,"percent":0.0,"rolled_over":20.0}`.
- **Alert on the limit (`rollover-alert`).** `manual $TODAY 41`: 82% of 50, 137% of 30. `GET /api/notifications?per_page=100` has one `budget_threshold`: "Budget 80% Reached", "$9.00 remaining with N days left in this period.". `$G sql "SELECT threshold_percent FROM budget_alerts_sent WHERE budget_id = '$bid'"` is `80` only.
- **Late receipt (`rollover-late-receipt`).** `manual $LAST 15` (a late scan from last month): last month's unspent is 5, so `GET /api/dashboard/spending?period=$THIS` has `overall` `{"budget":35.0,"spent":41.0,"remaining":-6.0,"percent":117.1,"rolled_over":5.0}`, notifications add "Budget Exceeded" ("You've exceeded your budget by $6.00."), and `budget_alerts_sent` is `80`, `100` for this period's start.
- **Next period, overspent (`rollover-next`).** `$G api GET "/api/budgets/summary?period=$NEXT" | jq .overall.rolled_over` is `0.0`: this period is over its limit, and overspend does not carry.
- **Lapse (`rollover-lapse`).** `$G revenuecat "$(ev "e-$uid" EXPIRATION $((now+1000)) $now)"` is `applied`. This period's summary is `{"budget":30.0,"spent":41.0,"remaining":-11.0,"percent":136.7,"rolled_over":0.0}`; `GET /api/budgets` still has `rollover_enabled` true; `PUT /api/budgets/$bid/rollover '{"enabled":false}' || true` prints `-> 403`.
- **Next period with a carry, a budget created this month (`rollover-next`, `rollover-mid-month`).** `$G signup rollover-next`, grant Premium for the new `uid` as above, then create a 30 budget with `period_start` the 1st of this month, `PUT .../rollover '{"enabled":true}'` (`200`) and `manual $TODAY 5`. This period's summary has `budget` 30.0 and `rolled_over` 0.0 (nothing before the budget carries); `period=$NEXT` has `{"budget":55.0,...,"rolled_over":25.0}`.
- **Amount change (`rollover-amount-change`).** `$G api PATCH /api/budgets/$bid '{"amount":60}'` is `200`; `period=$NEXT` is now `{"budget":115.0,...,"rolled_over":55.0}`: this period's limit is 60 at once, and 55 of it is left.
- **Delete (`rollover-delete`).** `$G api DELETE /api/users/me` prints `-> 204`; `$G sql "SELECT id FROM budgets WHERE user_id = '$uid'"` prints nothing. Rollover adds columns to `budgets` and no table.

## Gotchas

- Use a fresh user per run: the 80% and 100% alerts fire once per budget per period (`budget_alerts_sent`), and `ev` ids must be new.
- A new user has the 50% alert off (the column default), so the first alert seen is 80%.
- Alerts fire only in the period that holds today (M5). A receipt dated last month alerts in this period only through the rollover carry, which is what `rollover-late-receipt` proves.
- Carries across several periods, start-day and currency changes, restores after a deletion, and category budgets are covered by `backend/tests/api/test_budget_rollover.py` with the clock pinned: this instance runs on today's date and cannot move it.
