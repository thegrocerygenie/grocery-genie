---------------------------- MODULE PushDelivery -----------------------------
(***************************************************************************)
(* Push delivery of pending notifications (backend/app/tasks/push_tasks.py *)
(* deliver_pending_pushes, run by Celery beat every 60 s). Its docstring   *)
(* promises: "Each Notification is pushed at most once: push_status moves  *)
(* from NULL (pending) to sending, then to sent | failed, or straight to   *)
(* no_device | expired."                                                   *)
(*                                                                         *)
(* Each user has one device token, so one notification is one Expo        *)
(* message. A run is one sync SQLAlchemy session that commits several      *)
(* times: once for the claim, once per Expo request, once at the end.      *)
(*                                                                         *)
(* Code map (deliver_pending_pushes unless noted):                         *)
(*   Expire   UPDATE ... SET push_status='expired' WHERE push_status IS    *)
(*            NULL AND created_at < cutoff; then UPDATE ... SET            *)
(*            push_status='failed' WHERE push_status='sending' AND         *)
(*            created_at < cutoff. They wait on rows another run holds,    *)
(*            then re-check them.                                          *)
(*   Select   SELECT ... WHERE push_status IS NULL AND created_at >=       *)
(*            cutoff ORDER BY created_at LIMIT BATCH_SIZE                  *)
(*            FOR UPDATE SKIP LOCKED                                       *)
(*   Claim    n.push_status = "sending" for the batch; db.commit() (the    *)
(*            claim: before the first POST). Releases the row locks.       *)
(*   SendChunk  one client.send(chunk) of up to EXPO_MAX_BATCH (100)       *)
(*            messages: services/push_service.py ExpoPushClient.send, one  *)
(*            POST. On httpx.HTTPError the loop stops: expo_rejected()     *)
(*            sends the chunk and the rest back to retry; otherwise the    *)
(*            chunk's outcome is unknown and only the rest is retried.     *)
(*   Record   n.push_status = "sent" for the chunk's ok tickets;           *)
(*            db.commit() before the next chunk                            *)
(*   Finish   the final loop over claimed rows: retried and not unknown    *)
(*            -> NULL, any other row not sent -> "failed"; db.commit()     *)
(*   Crash    the worker dies or a commit fails: the open transaction      *)
(*            rolls back and its row locks are released                    *)
(*   Age      time passes: a notification gets older than push_max_age     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Notifs,         \* notification rows, all created pending
    Workers,        \* Celery worker processes that can run the task at once
    BatchSize,      \* BATCH_SIZE (code: 100)
    ChunkSize,      \* EXPO_MAX_BATCH (code: 100); below BatchSize explores multi-chunk sends
    RowLock,        \* "skip_locked" = code; "none" = broken variant without FOR UPDATE
    Expiry,         \* TRUE = code expires stale pending rows and fails stale sending rows
    UnknownOutcome, \* "failed" = code; "retry" = broken variant that resends a chunk whose outcome is unknown
    KeepChunks,     \* TRUE = code records each chunk; FALSE = broken variant: a rejected chunk retries the whole batch
    MaxFaults       \* crashes plus "Expo delivered but the response was lost"

VARIABLES
    status,     \* committed push_status per notification
    stale,      \* older than push_max_age
    sent,       \* pushes Expo delivered to the device, per notification
    wpc,        \* per worker: program counter, see TypeOK
    lockedBy,   \* per notification: worker holding its row lock, or NoOne
    wExpired,   \* per worker: uncommitted pending -> expired updates
    wSwept,     \* per worker: uncommitted sending -> failed updates
    wBatch,     \* per worker: rows claimed in this run
    wToSend,    \* per worker: claimed rows not yet sent
    wOk,        \* per worker: rows with an ok Expo ticket in this run
    wNew,       \* per worker: ok rows not yet recorded
    wErr,       \* per worker: rows with an error ticket
    wUnknown,   \* per worker: rows Expo may have delivered (lost response)
    wRetry,     \* per worker: rows Expo surely did not take
    faults

vars == <<status, stale, sent, wpc, lockedBy, wExpired, wSwept, wBatch, wToSend,
          wOk, wNew, wErr, wUnknown, wRetry, faults>>
workerVars == <<wExpired, wSwept, wBatch, wToSend, wOk, wNew, wErr, wUnknown, wRetry>>

NoOne == "NoOne"
Statuses == {"pending", "sending", "sent", "failed", "expired"}
Final == {"sent", "failed", "expired"}

TypeOK ==
    /\ status \in [Notifs -> Statuses]
    /\ stale \in [Notifs -> BOOLEAN]
    /\ sent \in [Notifs -> Nat]
    /\ wpc \in [Workers -> {"idle", "expired", "selected", "sending", "recording", "finishing"}]
    /\ lockedBy \in [Notifs -> Workers \cup {NoOne}]
    /\ faults \in Nat

Init ==
    /\ status = [n \in Notifs |-> "pending"]
    /\ stale = [n \in Notifs |-> FALSE]
    /\ sent = [n \in Notifs |-> 0]
    /\ wpc = [w \in Workers |-> "idle"]
    /\ lockedBy = [n \in Notifs |-> NoOne]
    /\ wExpired = [w \in Workers |-> {}]
    /\ wSwept = [w \in Workers |-> {}]
    /\ wBatch = [w \in Workers |-> {}]
    /\ wToSend = [w \in Workers |-> {}]
    /\ wOk = [w \in Workers |-> {}]
    /\ wNew = [w \in Workers |-> {}]
    /\ wErr = [w \in Workers |-> {}]
    /\ wUnknown = [w \in Workers |-> {}]
    /\ wRetry = [w \in Workers |-> {}]
    /\ faults = 0

Release(w) == [n \in Notifs |-> IF lockedBy[n] = w THEN NoOne ELSE lockedBy[n]]
\* An UPDATE waits while another run holds a lock on a row it writes.
Free(w, rows) == \A n \in rows : lockedBy[n] \in {NoOne, w}

\* The run ends: forget its per-run state.
Reset(w) ==
    /\ wExpired' = [wExpired EXCEPT ![w] = {}]
    /\ wSwept' = [wSwept EXCEPT ![w] = {}]
    /\ wBatch' = [wBatch EXCEPT ![w] = {}]
    /\ wToSend' = [wToSend EXCEPT ![w] = {}]
    /\ wOk' = [wOk EXCEPT ![w] = {}]
    /\ wNew' = [wNew EXCEPT ![w] = {}]
    /\ wErr' = [wErr EXCEPT ![w] = {}]
    /\ wUnknown' = [wUnknown EXCEPT ![w] = {}]
    /\ wRetry' = [wRetry EXCEPT ![w] = {}]

Age(n) ==
    /\ ~stale[n]
    /\ stale' = [stale EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<status, sent, wpc, lockedBy, workerVars, faults>>

\* The expire UPDATE and the stale-sending UPDATE, uncommitted.
Expire(w) ==
    /\ wpc[w] = "idle"
    /\ LET due == IF Expiry THEN {n \in Notifs : status[n] = "pending" /\ stale[n]} ELSE {}
           swept == IF Expiry THEN {n \in Notifs : status[n] = "sending" /\ stale[n]} ELSE {}
       IN /\ Free(w, due \cup swept)
          /\ wExpired' = [wExpired EXCEPT ![w] = due]
          /\ wSwept' = [wSwept EXCEPT ![w] = swept]
          /\ lockedBy' = [n \in Notifs |-> IF n \in due \cup swept THEN w ELSE lockedBy[n]]
    /\ wpc' = [wpc EXCEPT ![w] = "expired"]
    /\ UNCHANGED <<status, stale, sent, wBatch, wToSend, wOk, wNew, wErr, wUnknown, wRetry, faults>>

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
            /\ lockedBy' = IF RowLock = "skip_locked"
                             THEN [n \in Notifs |-> IF n \in b THEN w ELSE lockedBy[n]]
                             ELSE lockedBy
    /\ wpc' = [wpc EXCEPT ![w] = "selected"]
    /\ UNCHANGED <<status, stale, sent, wExpired, wSwept, wToSend, wOk, wNew, wErr, wUnknown, wRetry, faults>>

\* Mark the batch sending and commit, together with the expire updates.
Claim(w) ==
    /\ wpc[w] = "selected"
    /\ status' = [n \in Notifs |->
                    IF n \in wExpired[w] THEN "expired"
                    ELSE IF n \in wSwept[w] THEN "failed"
                    ELSE IF n \in wBatch[w] THEN "sending"
                    ELSE status[n]]
    /\ lockedBy' = Release(w)
    /\ wToSend' = [wToSend EXCEPT ![w] = wBatch[w]]
    /\ wExpired' = [wExpired EXCEPT ![w] = {}]
    /\ wSwept' = [wSwept EXCEPT ![w] = {}]
    /\ wpc' = [wpc EXCEPT ![w] = "sending"]
    /\ UNCHANGED <<stale, sent, wBatch, wOk, wNew, wErr, wUnknown, wRetry, faults>>

\* One POST of up to ChunkSize messages. Outcomes:
\*   "ok"       Expo answers; each ticket is ok (delivered) or an error (not delivered)
\*   "rejected" a 4xx/5xx or a connect error: nothing delivered; this chunk and the rest are retried
\*   "lost"     Expo delivered the chunk, then the response was lost (read timeout)
SendChunk(w) ==
    /\ wpc[w] = "sending"
    /\ wToSend[w] # {}
    /\ \E c \in SUBSET wToSend[w] :
        /\ Cardinality(c) = IF Cardinality(wToSend[w]) < ChunkSize THEN Cardinality(wToSend[w]) ELSE ChunkSize
        /\ \/ /\ \E ok \in SUBSET c :
                    /\ sent' = [n \in Notifs |-> sent[n] + (IF n \in ok THEN 1 ELSE 0)]
                    /\ wOk' = [wOk EXCEPT ![w] = @ \cup ok]
                    /\ wNew' = [wNew EXCEPT ![w] = IF KeepChunks THEN ok ELSE {}]
                    /\ wErr' = [wErr EXCEPT ![w] = @ \cup (c \ ok)]
              /\ wToSend' = [wToSend EXCEPT ![w] = @ \ c]
              /\ wpc' = [wpc EXCEPT ![w] = IF KeepChunks THEN "recording" ELSE "sending"]
              /\ UNCHANGED <<wUnknown, wRetry, faults>>
           \/ /\ sent' = sent
              /\ wRetry' = [wRetry EXCEPT ![w] = wToSend[w]]
              /\ wToSend' = [wToSend EXCEPT ![w] = {}]
              /\ wpc' = [wpc EXCEPT ![w] = "finishing"]
              /\ UNCHANGED <<wOk, wNew, wErr, wUnknown, faults>>
           \/ /\ faults < MaxFaults
              /\ faults' = faults + 1
              /\ sent' = [n \in Notifs |-> sent[n] + (IF n \in c THEN 1 ELSE 0)]
              /\ wUnknown' = [wUnknown EXCEPT ![w] = c]
              /\ wRetry' = [wRetry EXCEPT ![w] = wToSend[w] \ c]
              /\ wToSend' = [wToSend EXCEPT ![w] = {}]
              /\ wpc' = [wpc EXCEPT ![w] = "finishing"]
              /\ UNCHANGED <<wOk, wNew, wErr>>
    /\ UNCHANGED <<status, stale, lockedBy, wExpired, wSwept, wBatch>>

\* Commit sent for the chunk's ok tickets before the next chunk.
Record(w) ==
    /\ wpc[w] = "recording"
    /\ Free(w, wNew[w])
    /\ status' = [n \in Notifs |-> IF n \in wNew[w] THEN "sent" ELSE status[n]]
    /\ wNew' = [wNew EXCEPT ![w] = {}]
    /\ wpc' = [wpc EXCEPT ![w] = "sending"]
    /\ UNCHANGED <<stale, sent, lockedBy, wExpired, wSwept, wBatch, wToSend, wOk, wErr, wUnknown, wRetry, faults>>

\* Settle every claimed row not yet sent, and commit.
FinalStatus(w, n) ==
    IF ~KeepChunks /\ wRetry[w] # {} THEN "pending"   \* broken variant: the whole batch stays pending
    ELSE IF n \in wOk[w] THEN "sent"
    ELSE IF n \in wRetry[w] /\ n \notin wUnknown[w] THEN "pending"
    ELSE IF n \in wUnknown[w] /\ UnknownOutcome = "retry" THEN "pending"
    ELSE "failed"

Finish(w) ==
    /\ \/ wpc[w] = "finishing"
       \/ wpc[w] = "sending" /\ wToSend[w] = {}
    /\ LET written == IF KeepChunks THEN wBatch[w] \ wOk[w] ELSE wBatch[w] IN
        /\ Free(w, written)
        /\ status' = [n \in Notifs |-> IF n \in written THEN FinalStatus(w, n) ELSE status[n]]
    /\ wpc' = [wpc EXCEPT ![w] = "idle"]
    /\ Reset(w)
    /\ UNCHANGED <<stale, sent, lockedBy, faults>>

\* The worker dies, or a commit fails: the open transaction rolls back, its
\* locks are released, and Expo deliveries stay delivered. Rows already
\* claimed stay sending.
Crash(w) ==
    /\ wpc[w] # "idle"
    /\ faults < MaxFaults
    /\ faults' = faults + 1
    /\ lockedBy' = Release(w)
    /\ wpc' = [wpc EXCEPT ![w] = "idle"]
    /\ Reset(w)
    /\ UNCHANGED <<status, stale, sent>>

Run(w) == Expire(w) \/ Select(w) \/ Claim(w) \/ SendChunk(w) \/ Record(w) \/ Finish(w)

Settled == \A n \in Notifs : status[n] \in Final
\* Nothing left to do: stop without TLC calling it a deadlock.
Idle == /\ Settled /\ \A w \in Workers : wpc[w] = "idle" /\ UNCHANGED vars

Next ==
    \/ \E w \in Workers : Run(w) \/ Crash(w)
    \/ \E n \in Notifs : Age(n)
    \/ Idle

\* Beat keeps running the task and time keeps passing. Expo may reject forever.
Fairness ==
    /\ \A w \in Workers : /\ WF_vars(Expire(w)) /\ WF_vars(Select(w)) /\ WF_vars(Claim(w))
                          /\ WF_vars(SendChunk(w)) /\ WF_vars(Record(w)) /\ WF_vars(Finish(w))
    /\ \A n \in Notifs : WF_vars(Age(n))

Spec == Init /\ [][Next]_vars /\ Fairness

(***************************************************************************)
(* Properties                                                              *)
(***************************************************************************)

\* Expo delivers each notification at most once.
PushAtMostOnce == \A n \in Notifs : sent[n] <= 1

\* Every notification eventually settles: sent, failed, or expired.
EveryPushSettles == \A n \in Notifs : <>(status[n] \in Final)
=============================================================================
