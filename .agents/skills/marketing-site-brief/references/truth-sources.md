# Truth sources

Where to confirm each kind of claim. The paths are as of the MVP; later stages add files, so search when a path no longer exists. Cite a file:line for every inventory row.

## Product behaviour

| Claim | Source |
|---|---|
| Screens and flows | `mobile/app/` (Expo Router: one file per route) |
| User-facing copy | String literals in `mobile/app/**` and `mobile/src/features/**` |
| How a feature works, in plain words | `mobile/src/features/settings/content/help.ts` (Help answers describe what the app does today) |
| API surface | `backend/app/api/routes/*.py` (`@router.get/post/patch/delete`) |
| Limits and defaults (quota, alert thresholds, high-value review) | `backend/app/core/config.py` |
| Alert and summary wording | `backend/app/services/receipt_service.py` (`_alert_on_thresholds`), `backend/app/tasks/summary_tasks.py` |
| Where a notification tap goes | `backend/app/tasks/push_tasks.py`, `mobile/src/features/notifications/notificationTap.ts` |
| Categories | `mobile/src/constants/categories.ts` |
| Currencies | `mobile/src/constants/currencies.ts` |
| Receipt languages | `mobile/src/constants/receiptLanguages.ts`, `backend/app/llm/prompts/receipt_extraction.py` |
| Scan and import | `mobile/app/(tabs)/scan.tsx`, `mobile/src/features/receipt-capture/` |

## Status

| Question | Source |
|---|---|
| What's in this stage | `docs/prd/PHASE_SCOPE.md`, then `docs/prd/0[1-6]-*.md` for the stage tags |
| Is it proven on a device? | `docs/device-checklist.md`, `docs/launch-open-items.md` |
| Does each acceptance criterion have a test? | The newest `.planning/DOD-AUDIT-*.md`, then `git log` since that audit |
| What changed recently | `git log --oneline <previous brief's commit>..HEAD` |
| Is a feature switched off or unconfigured? | `mobile/app.config.ts`, `mobile/.env.example`, the launch items |
| Has accuracy or speed been measured? | `backend/tests/llm_validation/` results and the DoD audit (boxes 4–12) |

## Privacy and legal

| Claim | Source |
|---|---|
| What data goes where, and how long it's kept | `mobile/src/features/settings/content/privacy.ts` (the source of truth; check its `reviewed` flag) |
| What users agree to before AI reads a receipt | `mobile/src/features/ai-consent/constants.ts` |
| AI provider's training and retention terms | The provider's current commercial terms and privacy centre, searched afresh each time. Cite the URLs, and flag the claim for legal review. |
| Banned on-device claims | `mobile/src/__tests__/cameraPrivacyCopy.test.tsx` (the app's guard; the site follows the same rule) |
| Open privacy and legal items | `docs/launch-open-items.md` §1 and §2, `docs/legal/` |

## Money

| Claim | Source |
|---|---|
| Tiers and prices | The code first (paywall or subscription code, when it exists), then `docs/prd/00-overview.md` → Monetization |
| Free limits | `backend/app/core/config.py` (for example `free_tier_receipts_per_month`) |
| Promises made to users | `docs/marketing/decisions.md` |

## The current site

| What | Source |
|---|---|
| Live copy and claims | `marketing/index.html` (search for `<h1`, `<h2`, `<h3`, `faq`, `stat`) |
| Waitlist form and API | `marketing/app.js`, `marketing/api/_handler.js` |
| Design tokens Claude Design should keep | `marketing/tokens.css` |
