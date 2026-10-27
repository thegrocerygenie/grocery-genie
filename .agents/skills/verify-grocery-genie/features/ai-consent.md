# AI receipt reading consent

A scan sends the receipt photo and its item names to Anthropic's Claude (App Store 5.1.2(i)). The user must allow this first; the server keeps the consent time and policy version on the account and refuses a scan without consent for the current version. The user can withdraw it in Settings. Manual receipts never call the AI and work without consent.

## Sub-features

- AC-1: a user without consent gets `403` with `detail.code` `ai_consent_required` from `POST /api/receipts/scan`, and no receipt row is written.
- AC-2: `PUT /api/users/me/ai-consent` with the current `policy_version` records `users.ai_consent_at` and `users.ai_consent_version`; `GET /api/users/me` shows `ai_consent.granted: true`. A repeat keeps the first `granted_at`.
- AC-3: an old `policy_version` gets `409` `ai_consent_version_mismatch` and records nothing.
- AC-4: `DELETE /api/users/me/ai-consent` clears both columns; the next scan gets `403` again. A repeat is a no-op.
- AC-5: a manual receipt (`POST /api/receipts`) returns `201` without consent.

## How to get to it (user POV)

- Scan tab: the consent screen shows in place of the camera until the user taps Allow.
- History → add → Choose from Library or Choose Files: the consent sheet opens before the picker.
- Settings → Read receipts with AI: the switch withdraws consent (after a confirm alert) or opens the sheet.

## Driving it with gg-verify

```bash
$G signup ai-consent --no-consent
$G api GET /api/users/me | jq .ai_consent                       # granted: false
$G scan                                                          # 403 ai_consent_required
$G sql "SELECT count(*) FROM receipts r JOIN users u ON u.id = r.user_id WHERE u.email = '$(cat .verification/state/email)'"   # 0
$G api POST /api/receipts '{"store_name":"Corner Shop","date":"2026-10-20","total":4.5,"items":[{"name":"Milk","unit_price":4.5,"total_price":4.5}]}'   # 201
$G api PUT /api/users/me/ai-consent '{"policy_version":"2000-01-01"}'   # 409
v=$($G api GET /api/users/me | jq -r .ai_consent.current_policy_version)
$G api PUT /api/users/me/ai-consent "{\"policy_version\":\"$v\"}" | jq .ai_consent
$G sql "SELECT ai_consent_at IS NOT NULL, ai_consent_version FROM users WHERE email = '$(cat .verification/state/email)'"
rid=$($G scan | jq -r .receipt_id); $G api PATCH /api/receipts/$rid '{"status":"confirmed"}'
$G api DELETE /api/users/me/ai-consent | jq .ai_consent
$G scan                                                          # 403 again
```

## Gotchas

- `$G signup` without `--no-consent` allows AI reading, so every other journey can scan. Use `--no-consent` only to test the gate.
- `granted` is true only for consent to the current version (`AI_CONSENT_POLICY_VERSION` in `backend/app/services/ai_consent.py`). Consent to an older version shows `granted: false` with the old `policy_version`.
- The 403 comes before the file is read, so it wins over the quota (429) and the quality checks (422).
