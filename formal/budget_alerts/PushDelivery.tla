---------------------------- MODULE PushDelivery -----------------------------
(***************************************************************************)
(* Push delivery of pending notifications (backend/app/tasks/push_tasks.py *)
(* deliver_pending_pushes, run by Celery beat every 60 s). Its docstring   *)
(* promises: "Each Notification is pushed at most once: push_status moves  *)
(* from NULL (pending) to sent | no_device | failed | expired."            *)
(*                                                                         *)
(* Each user has one device token, so one notification is one Expo        *)
(* message. A run is one sync SQLAlchemy transaction that commits once.    *)
(*                                                                         *)
(* Code map (deliver_pending_pushes unless noted):                         *)
(*   Expire   UPDATE notifications SET push_status='expired' WHERE         *)
(*            push_status IS NULL AND created_at < cutoff. It waits on     *)
(*            rows another run holds, then re-checks them.                 *)
(*   Select   SELECT ... WHERE push_status IS NULL AND created_at >=       *)
(*            cutoff ORDER BY created_at LIMIT BATCH_SIZE                  *)
(*            FOR UPDATE SKIP LOCKED                                       *)
(*   Send     client.send(messages): services/push_service.py              *)
(*            ExpoPushClient.send posts chunks of EXPO_MAX_BATCH (100) and *)
(*            raises httpx.HTTPError on the first failed chunk             *)
(*   HttpErr  except httpx.HTTPError: db.commit() keeps only the expire    *)
(*            updates; the batch stays pending for the next run            *)
(*   Finish   n.push_status = "sent" if the ticket is ok else "failed";    *)
(*            db.commit()                                                  *)
(*   Crash    the worker dies or the commit fails before db.commit():      *)
(*            the transaction rolls back and its row locks are released    *)
(*   Age      time passes: a notification gets older than push_max_age     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Notifs,      \* notification rows, all created pending
    Workers,     \* Celery worker processes that can run the task at once
    BatchSize,   \* BATCH_SIZE (code: 100)
    ChunkSize,   \* EXPO_MAX_BATCH (code: 100); below BatchSize explores multi-chunk sends
    RowLock,     \* "skip_locked" = code; "none" = broken variant without FOR UPDATE
    Expiry,      \* TRUE = code expires pending rows older than push_max_age
    MaxFaults    \* crashes plus "Expo delivered but the response was lost"

VARIABLES
    status,     \* committed push_status per notification
    stale,      \* older than push_max_age
    sent,       \* pushes Expo delivered to the device, per notification
    wpc,        \* per worker: "idle" | "expired" | "sending"
    lockedBy,   \* per notification: worker holding its row lock, or NoOne
    wExpired,   \* per worker: uncommitted expire updates
    wBatch,     \* per worker: rows selected in this run
    wToSend,    \* per worker: selected rows not yet sent
    wOk,        \* per worker: rows with an ok Expo ticket
    faults

vars == <<status, stale, sent, wpc, lockedBy, wExpired, wBatch, wToSend, wOk, faults>>

NoOne == "NoOne"
Statuses == {"pending", "sent", "failed", "expired"}

TypeOK ==
    /\ status \in [Notifs -> Statuses]
    /\ stale \in [Notifs -> BOOLEAN]
    /\ sent \in [Notifs -> Nat]
    /\ wpc \in [Workers -> {"idle", "expired", "sending"}]
    /\ lockedBy \in [Notifs -> Workers \cup {NoOne}]
    /\ faults \in Nat

Init ==
    /\ status = [n \in Notifs |-> "pending"]
    /\ stale = [n \in Notifs |-> FALSE]
    /\ sent = [n \in Notifs |-> 0]
    /\ wpc = [w \in Workers |-> "idle"]
    /\ lockedBy = [n \in Notifs |-> NoOne]
    /\ wExpired = [w \in Workers |-> {}]
    /\ wBatch = [w \in Workers |-> {}]
    /\ wToSend = [w \in Workers |-> {}]
    /\ wOk = [w \in Workers |-> {}]
    /\ faults = 0

Release(w) == [n \in Notifs |-> IF lockedBy[n] = w THEN NoOne ELSE lockedBy[n]]

Age(n) ==
    /\ ~stale[n]
    /\ stale' = [stale EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<status, sent, wpc, lockedBy, wExpired, wBatch, wToSend, wOk, faults>>

\* The expire UPDATE. It waits while another run holds a matching row.
Expire(w) ==
    /\ wpc[w] = "idle"
    /\ LET due == IF Expiry THEN {n \in Notifs : status[n] = "pending" /\ stale[n]} ELSE {} IN
        /\ \A n \in due : lockedBy[n] \in {NoOne, w}
        /\ wExpired' = [wExpired EXCEPT ![w] = due]
        /\ lockedBy' = [n \in Notifs |-> IF n \in due THEN w ELSE lockedBy[n]]
    /\ wpc' = [wpc EXCEPT ![w] = "expired"]
    /\ UNCHANGED <<status, stale, sent, wBatch, wToSend, wOk, faults>>

\* SELECT ... FOR UPDATE SKIP LOCKED, oldest first, up to BatchSize rows.
Select(w) ==
    /\ wpc[w] = "expired"
    /\ LET avail == {n \in Notifs : /\ status[n] = "pending"
                                     /\ n \notin wExpired[w]
                                     /\ (Expiry => ~stale[n])
                                     /\ (RowLock = "skip_locked" => lockedBy[n] = NoOne)}
       IN \E b \in SUBSET avail :
            /\ Cardinality(b) = IF Cardinality(avail) < BatchSize THEN Cardinality(avail) ELSE BatchSize
            /\ wBatch' = [wBatch EXCEPT ![w] = b]
            /\ wToSend' = [wToSend EXCEPT ![w] = b]
            /\ lockedBy' = IF RowLock = "skip_locked"
                             THEN [n \in Notifs |-> IF n \in b THEN w ELSE lockedBy[n]]
                             ELSE lockedBy
    /\ wOk' = [wOk EXCEPT ![w] = {}]
    /\ wpc' = [wpc EXCEPT ![w] = "sending"]
    /\ UNCHANGED <<status, stale, sent, wExpired, faults>>

\* except httpx.HTTPError: db.commit() keeps the expire updates; the batch stays pending.
HttpErrorCommon(w) ==
    /\ status' = [n \in Notifs |-> IF n \in wExpired[w] THEN "expired" ELSE status[n]]
    /\ lockedBy' = Release(w)
    /\ wpc' = [wpc EXCEPT ![w] = "idle"]
    /\ wExpired' = [wExpired EXCEPT ![w] = {}]
    /\ wBatch' = [wBatch EXCEPT ![w] = {}]
    /\ wToSend' = [wToSend EXCEPT ![w] = {}]
    /\ wOk' = [wOk EXCEPT ![w] = {}]
HttpError(w) == HttpErrorCommon(w) /\ UNCHANGED faults
HttpErrorKeepFaults(w) == HttpErrorCommon(w)

\* One POST of up to ChunkSize messages. Outcomes:
\*   "ok"      Expo answers; each ticket is ok (delivered) or an error (not delivered)
\*   "refused" httpx.HTTPError before Expo accepted the chunk: nothing delivered
\*   "lost"    Expo accepted and delivered the chunk, then the response was lost (timeout)
SendChunk(w) ==
    /\ wpc[w] = "sending"
    /\ wToSend[w] # {}
    /\ \E c \in SUBSET wToSend[w] :
        /\ Cardinality(c) = IF Cardinality(wToSend[w]) < ChunkSize THEN Cardinality(wToSend[w]) ELSE ChunkSize
        /\ \/ /\ \E ok \in SUBSET c :
                    /\ sent' = [n \in Notifs |-> sent[n] + (IF n \in ok THEN 1 ELSE 0)]
                    /\ wOk' = [wOk EXCEPT ![w] = @ \cup ok]
              /\ wToSend' = [wToSend EXCEPT ![w] = @ \ c]
              /\ UNCHANGED <<status, wpc, lockedBy, wExpired, wBatch, faults>>
           \/ /\ sent' = sent
              /\ HttpError(w)
           \/ /\ faults < MaxFaults
              /\ faults' = faults + 1
              /\ sent' = [n \in Notifs |-> sent[n] + (IF n \in c THEN 1 ELSE 0)]
              /\ HttpErrorKeepFaults(w)
    /\ UNCHANGED stale

\* All chunks sent: set sent/failed per ticket and commit.
Finish(w) ==
    /\ wpc[w] = "sending"
    /\ wToSend[w] = {}
    /\ status' = [n \in Notifs |->
                    IF n \in wExpired[w] THEN "expired"
                    ELSE IF n \in wBatch[w] THEN (IF n \in wOk[w] THEN "sent" ELSE "failed")
                    ELSE status[n]]
    /\ lockedBy' = Release(w)
    /\ wpc' = [wpc EXCEPT ![w] = "idle"]
    /\ wExpired' = [wExpired EXCEPT ![w] = {}]
    /\ wBatch' = [wBatch EXCEPT ![w] = {}]
    /\ wOk' = [wOk EXCEPT ![w] = {}]
    /\ UNCHANGED <<stale, sent, wToSend, faults>>

\* The worker dies before db.commit(): rollback, locks released, Expo deliveries stay delivered.
Crash(w) ==
    /\ wpc[w] \in {"expired", "sending"}
    /\ faults < MaxFaults
    /\ faults' = faults + 1
    /\ lockedBy' = Release(w)
    /\ wpc' = [wpc EXCEPT ![w] = "idle"]
    /\ wExpired' = [wExpired EXCEPT ![w] = {}]
    /\ wBatch' = [wBatch EXCEPT ![w] = {}]
    /\ wToSend' = [wToSend EXCEPT ![w] = {}]
    /\ wOk' = [wOk EXCEPT ![w] = {}]
    /\ UNCHANGED <<status, stale, sent>>

Run(w) == Expire(w) \/ Select(w) \/ SendChunk(w) \/ Finish(w)

Settled == \A n \in Notifs : status[n] # "pending"
\* Nothing left to do: stop without TLC calling it a deadlock.
Idle == /\ Settled /\ \A w \in Workers : wpc[w] = "idle" /\ UNCHANGED vars

Next ==
    \/ \E w \in Workers : Run(w) \/ Crash(w)
    \/ \E n \in Notifs : Age(n)
    \/ Idle

\* Beat keeps running the task and time keeps passing. Expo may refuse forever.
Fairness ==
    /\ \A w \in Workers : WF_vars(Expire(w)) /\ WF_vars(Select(w)) /\ WF_vars(SendChunk(w)) /\ WF_vars(Finish(w))
    /\ \A n \in Notifs : WF_vars(Age(n))

Spec == Init /\ [][Next]_vars /\ Fairness

(***************************************************************************)
(* Properties                                                              *)
(***************************************************************************)

\* Expo delivers each notification at most once.
PushAtMostOnce == \A n \in Notifs : sent[n] <= 1

\* Every notification eventually leaves pending (sent, failed, or expired).
EveryPushSettles == \A n \in Notifs : <>(status[n] # "pending")
=============================================================================
