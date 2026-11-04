# The waitlist's free year of Premium

The marketing site promised waitlist sign-ups a free year of Premium (V1.1 story V11-P5, decisions #2, #7, #9–#13 in `docs/marketing/decisions.md`). An account whose verified email, trimmed and lowercased, equals a waitlist contact's (the site's Resend audience, copied into `waitlist_entries`) created before the cut-off gets a 12-month RevenueCat promotional grant of Premium while the 90-day claim window is open: on `verify-email`, Apple or Google sign-in, a confirmed email change, or the launch backfill. An account whose email differs (Hide My Email) claims it in Settings: it enters the waitlist email, and the server sends a link to that inbox. One free year per waitlist email, ever, and per account; a RevenueCat failure leaves the match pending and a retry grants it; deleting the account keeps only an unlinked salted hash.

## Sub-features

- `waitlist-import` the ops path loads a Resend CSV export into `waitlist_entries` (`python -m app.tasks.waitlist_tasks import-csv`), emails trimmed and lowercased; a re-import replaces the copy.
- `waitlist-verify-email` an unverified account on the waitlist gets nothing (`redemption` null, `claim_available` true); `POST /api/auth/verify-email` answers `200` as before, and then the offer shows `granted` with `expires_at` 12 months out, `/api/users/me` shows `is_premium` true, one `waitlist_redemptions` row (`granted`, source `verify_email`, a 64-character hash, never the email), and RevenueCat got one promotional grant with `end_time_ms` and no `duration`.
- `waitlist-unsubscribed` a contact with `unsubscribed` true still gets the free year (decision #10).
- `waitlist-cutoff` a contact created after the cut-off gets nothing on verify; the account can still claim with another email.
- `waitlist-claim` a signed-in account whose email is not on the waitlist claims a waitlist email (any case, spaces around it): `202 {"status":"sent"}` at once; the Celery worker runs `send_waitlist_claim` and logs one claim link in `worker.log` (never `server.log`: the request does no lookup and sends nothing); the confirm answers `200 {"status":"granted",...}`, Premium is on, and the link works once (`400 invalid_token`).
- `waitlist-claim-not-listed` a claim for an email not on the waitlist answers the same `202 {"status":"sent"}`; the worker runs the task too and logs `waitlist claim for an email that does not qualify`, with no link; a malformed email is `422 invalid_email`.
- `waitlist-claim-limits` an account's sixth claim within the hour is `429`; the fourth claim in a day for one waitlist email answers the same `202` but enqueues no task (`server.log`: `over the per-email daily limit`).
- `waitlist-backfill` an account verified before its email reached the waitlist copy is matched by the backfill (`python -m app.tasks.waitlist_tasks backfill`), source `backfill`.
- `waitlist-pending-retry` with RevenueCat refusing (`503`), verify still answers `200`; the offer shows `pending` (`last_error` `revenuecat_unavailable`, `is_premium` false); once RevenueCat is back, the retry grants with the same end date (`attempts` 2).
- `waitlist-claim-refused-redeemed` an account that has its free year gets `409 waitlist_offer_redeemed` on a claim.
- `waitlist-delete` deleting the account leaves its redemption as only `status` and the hash, with `user_id`, `source`, `matched_at` and `grant_expires_at` null.
- `waitlist-analytics` `analytics_events` has `waitlist_offer_matched` (source), `waitlist_offer_granted` (source, attempts) and `waitlist_claim_requested`.

## How to get to it (user POV)

- Automatic: a waitlist member signs up with the email they joined with and taps the verification link, or signs in with Apple or Google, and Settings says Premium. Nothing to tap for the offer itself.
- Settings → PREMIUM → "Claim your waitlist offer" (shown only while the server says `claim_available`): enter the waitlist email, Send link, then tap the link in that inbox on the iPhone (`grocerygenie://onboarding/confirm-waitlist-claim?token=…`), which says "Your free year is on". The screens are UI and need a Simulator check; this journey drives the API they call.

## Driving it with gg-verify

Preconditions:

- `$G launch --stub-revenuecat` (debug mode; launch also starts a Celery worker, its log `worker.log`, which sends the claim links): Premium launched a day ago (`GG_PREMIUM_LAUNCHED_AT`), the cut-off is the launch time, a random hash salt, and the REST API pointed at the local RevenueCat stand-in (`scripts/revenuecat-stub.py`, its grants in `revenuecat-stub.jsonl` in the evidence). `$G doctor` shows no `FAIL`.
- The waitlist is loaded the way an operator loads it, with `$G waitlist import CSV`; never insert `waitlist_entries` through `sql`. Emails come from `$G signup`, so the CSV grows as the journey goes:

```bash
run=$($G last); csv="$run/waitlist.csv"; echo "email,created_at,unsubscribed" > "$csv"
add() { echo "$1,${2:-2026-10-01T12:00:00Z},${3:-false}" >> "$csv"; $G waitlist import "$csv"; }
vtoken() { grep "\[email:dev:body\].*$1" "$run/server.log" | grep -o 'verify-email?token=[A-Za-z0-9_-]*' | tail -1 | sed 's/.*token=//'; }
offer() { $G api GET /api/users/me/waitlist-offer | jq -c '{window_open,claim_available,redemption}'; }
```

- **Verify-email (`waitlist-import`, `waitlist-verify-email`).** `m=$($G signup member); add "$m"` prints `waitlist import: SyncResult(added=1, ...)`. `offer` is `{"window_open":true,"claim_available":true,"redemption":null}` and `is_premium` false. `$G api POST /api/auth/verify-email "$(jq -nc --arg t "$(vtoken "$m")" '{token:$t}')"` is `-> 200`. Now `offer` shows `"redemption":{"status":"granted","expires_at":"<a year from today>"}`, `claim_available` false, and `/api/users/me` has `is_premium` true. `$G sql "SELECT status, source, length(email_hash), attempts FROM waitlist_redemptions r JOIN users u ON u.id = r.user_id WHERE u.email = '$m'"` is `granted|verify_email|64|1`. `$G rcstub grants` shows one line for the user with `"body": {"end_time_ms": ...}`, `"answered": 201`.
- **Unsubscribed (`waitlist-unsubscribed`).** `q=$($G signup quiet); add "$q" 2026-10-02T00:00:00Z true`, verify as above: `offer` is `granted`.
- **Cut-off (`waitlist-cutoff`).** `l=$($G signup late); add "$l" 2099-01-01T00:00:00Z`, verify: `offer` stays `"claim_available":true,"redemption":null`, `is_premium` false.
- **Claim (`waitlist-claim`).** `w="waitlist-only-$(basename "$run")@example.com"; add "$w"`, then `$G signup relay`. `$G api POST /api/users/me/waitlist-offer/claim "{\"email\":\"  ${w^^} \"}"` is `-> 202 {"status":"sent"}`. Within a second `worker.log` shows `Task app.tasks.waitlist_tasks.send_waitlist_claim[...] succeeded` and one `confirm-waitlist-claim?token=` link (`ct=$(grep -o 'confirm-waitlist-claim?token=[A-Za-z0-9_-]*' "$run/worker.log" | tail -1 | sed 's/.*token=//')`); `server.log` has none. `$G api POST /api/users/me/waitlist-offer/confirm "{\"token\":\"$ct\"}"` is `-> 200 {"status":"granted",...}`; `offer` is `granted` and `is_premium` true. The same confirm again is `-> 400` `invalid_token`.
- **Not listed (`waitlist-claim-not-listed`).** Before the confirm, a claim for `stranger@example.com` from the same account is `-> 202 {"status":"sent"}`, byte for byte the listed answer; `worker.log` runs the task and logs `waitlist claim for an email that does not qualify`, and gains no link.
- **Limits (`waitlist-claim-limits`).** `$G signup relay2`. Four claims for `flood@example.com` are each `-> 202`, but `grep -c 'send_waitlist_claim.*received' "$run/worker.log"` grows by three, and `server.log` has `over the per-email daily limit` once. `{"email":"not-an-email"}` is `-> 422` `invalid_email`; the account's sixth claim is `-> 429`.
- **Backfill (`waitlist-backfill`).** `e=$($G signup early)`, verify it first: `offer` has no redemption. `add "$e"`: still none (an import matches nothing). `$G waitlist backfill` prints `matched=1`; `offer` is `granted`, and the row's `source` is `backfill`.
- **Pending, then retry (`waitlist-pending-retry`).** `$G rcstub fail`; `f=$($G signup flaky); add "$f"`; verify is `-> 200`, `offer` shows `"status":"pending"`, `is_premium` false, and the row is `pending|1|revenuecat_unavailable` (`status, attempts, last_error`). `$G rcstub ok`; `$G waitlist retry` prints `granted=1`; `offer` is `granted` with the same `expires_at`, `is_premium` true, the row `granted|2|`. `$G rcstub grants` shows the 503 line and the 201 line with the same `end_time_ms`.
- **Refused for a redeemed account (`waitlist-claim-refused-redeemed`).** Same user: a claim for `$w` is `-> 409` `waitlist_offer_redeemed`.
- **Delete (`waitlist-delete`).** Same user: `$G api DELETE /api/users/me` is `-> 204`. `$G sql "SELECT status, source, matched_at, grant_expires_at, length(email_hash) FROM waitlist_redemptions WHERE user_id IS NULL"` is one row, `granted||||64`; `attempts` and `created_at` are null too.
- **Analytics (`waitlist-analytics`).** `$G sql "SELECT event_name, properties::text FROM analytics_events WHERE event_name LIKE 'waitlist%' ORDER BY created_at"` lists `waitlist_offer_matched` / `waitlist_offer_granted` pairs with sources `verify_email` (twice), `claim` and `backfill`, and `waitlist_claim_requested` once per claim the route accepted (not the `409`, `422` or `429` ones). The deleted user's events are gone with the account.

## Gotchas

- Launch without `--stub-revenuecat` (as `premium.md` needs, for its `503` refresh) has no RevenueCat API key: every match stays `pending` with `last_error` `revenuecat_not_configured`. That is the designed behavior, not a failure.
- `$G signup` keeps no password, so the confirmed email change (it needs the current password) and Apple or Google sign-in (they need real identity tokens) are not driven here; pytest covers them (`backend/tests/api/test_waitlist_offer.py`), with RevenueCat faked.
- The window cannot be closed on a running instance (the launch date is set at launch): grants after the window, the claim link tapped after it, the purge when it closes, and a new account with a deleted account's email are pytest's (`backend/tests/services/test_waitlist_service.py`, `backend/tests/tasks/test_waitlist_tasks.py`, `backend/tests/api/test_account_deletion.py`).
- The Resend audience API (`GG_RESEND_WAITLIST_AUDIENCE_ID`) is never called from here: the CSV export is the other supported source, and the API client is covered by `backend/tests/services/test_waitlist_source.py` with Resend mocked.
- Verification links come from the dev email log in `server.log`, claim links from `worker.log`; quote the token lines, not the file.
- The purge when the window closes, including the Resend audience's contacts, the retry cap, a RevenueCat 4xx (`failed`), the short RevenueCat timeout in sign-in and verify-email, and two accounts racing for one email are pytest's (`backend/tests/tasks/test_waitlist_tasks.py`, `backend/tests/services/test_waitlist_service.py`, `backend/tests/services/test_waitlist_concurrency.py` on Postgres, `backend/tests/api/test_waitlist_offer.py`): the stub answers only 201 or 503, and the window can't close on a running instance.
