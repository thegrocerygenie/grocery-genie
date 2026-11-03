# Marketing site decisions

Standing decisions for the marketing site. The `marketing-site-brief` skill reads this file before writing a brief, and adds every new decision with its date and stage. A decision stands until a later entry replaces it. Mark a replaced entry "Replaced by #N"; don't delete it.

| # | Date | Stage | Decision | Status |
|---|---|---|---|---|
| 1 | 2026-11-03 | MVP | **Conversion goal:** waitlist sign-ups now; App Store downloads once the app is public. The page is designed in two states so the switch is a swap. | Active |
| 2 | 2026-11-03 | MVP | **Waitlist incentive:** "a free year of Premium" for waitlist sign-ups. Premium doesn't exist until V1.1, so the site says "when it launches" and names no Premium features or price. | Active; must be honoured at V1.1 |
| 3 | 2026-11-03 | MVP | **Free-tier wording:** "Free" in the hero; the 20-scan monthly limit stated in the FAQ ("about five a week"); manual entry has no limit; never say "unlimited". Recommended default; the user didn't choose explicitly. | Active, revisit |
| 4 | 2026-11-02 | MVP | **No on-device or "never shared" claims.** Receipt photos go to our servers and to Anthropic. The app enforces this with `cameraPrivacyCopy.test.tsx`; the site follows the same rule. | Active |
| 5 | 2026-11-02 | MVP | **No speed or accuracy figures** until they're measured on the receipt test set. | Active |

## Open

- **Launch date.** "Q3 2026" on the old site has passed. Needs a confirmed date or "no date".
- **Privacy line.** Legal review against the agreement with Anthropic (`docs/launch-open-items.md` §2).
- **Matching waitlist emails to app accounts** so the free Premium year (#2) can be granted in V1.1. Sign in with Apple can hide the real email, so plan the match before the waitlist grows.
- **Referral queue.** Optional; it needs referral tracking in `marketing/api/`.
