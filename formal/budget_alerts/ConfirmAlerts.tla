---------------------------- MODULE ConfirmAlerts ----------------------------
(***************************************************************************)
(* Budget threshold alerts when receipts are confirmed (BC-03).            *)
(*                                                                         *)
(* One user, one overall monthly budget, one period. Each receipt adds one *)
(* unit of spend. Each confirm request runs in its own Postgres            *)
(* transaction at READ COMMITTED (get_db in app/core/dependencies.py       *)
(* commits once at the end of the request; no isolation level is set).    *)
(*                                                                         *)
(* Code map (backend/app/...):                                             *)
(*   Flush   services/receipt_service.py confirm_receipt:                  *)
(*           receipt.status = "confirmed"; await self.db.flush()           *)
(*           Also update_receipt editing an already confirmed receipt:     *)
(*           the corrected prices or date, then await self.db.flush(),     *)
(*           then _alert_on_thresholds (Read, Claim) with no second        *)
(*           ReceiptConfirmed. An edit that raises spend is one more       *)
(*           Flush request here; one that lowers it is outside the model   *)
(*           and reaches fewer thresholds, so it can break neither         *)
(*           property. A category correction also recategorizes same-named *)
(*           items on other receipts (_retroactive_category_update),       *)
(*           moving category spend in their periods; update_receipt passes *)
(*           every changed date to one check_thresholds call. Per period   *)
(*           that is the same Flush, Read, Claim, and category budgets are *)
(*           outside the model. A confirmed receipt cannot leave confirmed *)
(*           (422), so it is never confirmed twice.                        *)
(*   Read    services/budget_service.py check_thresholds: SELECT the       *)
(*           user's budgets ORDER BY id FOR UPDATE (held until Commit or   *)
(*           Abort), then get_spending_by_category: one SELECT; sees       *)
(*           committed rows plus this transaction's own flushed write.     *)
(*           With several dates, the lock is taken once, then one spend    *)
(*           SELECT runs per period, all under that lock.                  *)
(*           Lock and spend read are one step: while one request holds     *)
(*           the lock no other confirm can commit, and the spend SELECT    *)
(*           is a new statement, so it sees every commit before the lock.  *)
(*   Claim   services/budget_service.py claim_alert: INSERT ... ON         *)
(*           CONFLICT DO NOTHING on budget_alerts_sent (budget_id,         *)
(*           period_start, threshold_percent), then                        *)
(*           notification_service.create_notification in the same         *)
(*           transaction. Both writes stay invisible to others until       *)
(*           commit, so they are one step here. A second inserter of the   *)
(*           same key waits for the first transaction to end.              *)
(*   Commit  core/dependencies.py get_db: await session.commit()           *)
(*   Abort   core/dependencies.py get_db: await session.rollback(); the    *)
(*           user can confirm again                                        *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Receipts,       \* pending receipts, each adds 1 unit of spend
    Budget,         \* budget amount in the same units
    Thresholds,     \* active thresholds in percent, claimed in ascending order
    UniqueLedger,   \* TRUE = code: unique key + ON CONFLICT DO NOTHING
    BudgetRowLock,  \* TRUE = code: check_thresholds locks the budget rows before Read (H1 fix)
    MaxAborts       \* how many request rollbacks the model may inject

VARIABLES
    confirmed,  \* receipts whose confirmed status is committed
    ledger,     \* committed budget_alerts_sent thresholds
    alerts,     \* committed budget_threshold notifications, count per threshold
    pc,         \* per receipt: "idle" | "flushed" | "claiming" | "done"
    todo,       \* per receipt: breached thresholds not yet claimed
    claimed,    \* per receipt: this transaction's uncommitted ledger inserts
    newAlerts,  \* per receipt: this transaction's uncommitted notifications
    lockHolder, \* receipt whose transaction holds the budget row lock, or NoOne
    aborts

vars == <<confirmed, ledger, alerts, pc, todo, claimed, newAlerts, lockHolder, aborts>>

NoOne == "NoOne"

Min(S) == CHOOSE x \in S : \A y \in S : x <= y

Breached(spend) == {t \in Thresholds : spend * 100 >= t * Budget}

TypeOK ==
    /\ confirmed \subseteq Receipts
    /\ ledger \subseteq Thresholds
    /\ alerts \in [Thresholds -> Nat]
    /\ pc \in [Receipts -> {"idle", "flushed", "claiming", "done"}]
    /\ todo \in [Receipts -> SUBSET Thresholds]
    /\ claimed \in [Receipts -> SUBSET Thresholds]
    /\ newAlerts \in [Receipts -> SUBSET Thresholds]
    /\ lockHolder \in Receipts \cup {NoOne}

Init ==
    /\ confirmed = {}
    /\ ledger = {}
    /\ alerts = [t \in Thresholds |-> 0]
    /\ pc = [r \in Receipts |-> "idle"]
    /\ todo = [r \in Receipts |-> {}]
    /\ claimed = [r \in Receipts |-> {}]
    /\ newAlerts = [r \in Receipts |-> {}]
    /\ lockHolder = NoOne
    /\ aborts = 0

\* PATCH /api/receipts/{id} {"status":"confirmed"} -> confirm_receipt sets and flushes the status.
Flush(r) ==
    /\ pc[r] = "idle"
    /\ pc' = [pc EXCEPT ![r] = "flushed"]
    /\ UNCHANGED <<confirmed, ledger, alerts, todo, claimed, newAlerts, lockHolder, aborts>>

\* check_thresholds reads spend in one statement: committed confirmed receipts plus its own.
Read(r) ==
    /\ pc[r] = "flushed"
    /\ BudgetRowLock => lockHolder = NoOne
    /\ lockHolder' = IF BudgetRowLock THEN r ELSE lockHolder
    /\ todo' = [todo EXCEPT ![r] = Breached(Cardinality(confirmed \cup {r}))]
    /\ pc' = [pc EXCEPT ![r] = "claiming"]
    /\ UNCHANGED <<confirmed, ledger, alerts, claimed, newAlerts, aborts>>

\* claim_alert + create_notification for the lowest unclaimed breached threshold.
Claim(r) ==
    /\ pc[r] = "claiming"
    /\ todo[r] # {}
    /\ LET t == Min(todo[r]) IN
        /\ UniqueLedger => \A q \in Receipts \ {r} : t \notin claimed[q]  \* else wait
        /\ todo' = [todo EXCEPT ![r] = @ \ {t}]
        /\ IF UniqueLedger /\ t \in ledger
             THEN UNCHANGED <<claimed, newAlerts>>                     \* DO NOTHING -> skip
             ELSE /\ claimed' = [claimed EXCEPT ![r] = @ \cup {t}]
                  /\ newAlerts' = [newAlerts EXCEPT ![r] = @ \cup {t}]
    /\ UNCHANGED <<confirmed, ledger, alerts, pc, lockHolder, aborts>>

Commit(r) ==
    /\ pc[r] = "claiming"
    /\ todo[r] = {}
    /\ confirmed' = confirmed \cup {r}
    /\ ledger' = ledger \cup claimed[r]
    /\ alerts' = [t \in Thresholds |-> alerts[t] + (IF t \in newAlerts[r] THEN 1 ELSE 0)]
    /\ pc' = [pc EXCEPT ![r] = "done"]
    /\ claimed' = [claimed EXCEPT ![r] = {}]
    /\ newAlerts' = [newAlerts EXCEPT ![r] = {}]
    /\ lockHolder' = IF lockHolder = r THEN NoOne ELSE lockHolder
    /\ UNCHANGED <<todo, aborts>>

\* Any exception inside the request: get_db rolls back; the receipt stays pending.
Abort(r) ==
    /\ pc[r] \in {"flushed", "claiming"}
    /\ aborts < MaxAborts
    /\ aborts' = aborts + 1
    /\ pc' = [pc EXCEPT ![r] = "idle"]
    /\ todo' = [todo EXCEPT ![r] = {}]
    /\ claimed' = [claimed EXCEPT ![r] = {}]
    /\ newAlerts' = [newAlerts EXCEPT ![r] = {}]
    /\ lockHolder' = IF lockHolder = r THEN NoOne ELSE lockHolder
    /\ UNCHANGED <<confirmed, ledger, alerts>>

\* Every receipt confirmed: stop without TLC calling it a deadlock.
Finished ==
    /\ \A r \in Receipts : pc[r] = "done"
    /\ UNCHANGED vars

Next ==
    \/ \E r \in Receipts : Flush(r) \/ Read(r) \/ Claim(r) \/ Commit(r) \/ Abort(r)
    \/ Finished

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* Properties                                                              *)
(***************************************************************************)

\* Each threshold makes at most one notification per budget period.
OneAlertPerThreshold == \A t \in Thresholds : alerts[t] <= 1

\* Once every confirm has committed, each threshold the committed spend has reached has an alert.
NoMissedAlert ==
    (\A r \in Receipts : pc[r] = "done") =>
        \A t \in Breached(Cardinality(confirmed)) : alerts[t] >= 1
=============================================================================
