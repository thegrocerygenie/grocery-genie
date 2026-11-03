# Marketing site decisions

Standing decisions for the marketing site. The `marketing-site-brief` skill reads this file before writing a brief, and adds every new decision with its date and stage. A decision stands until a later entry replaces it. Mark a replaced entry "Replaced by #N"; don't delete it.

| # | Date | Stage | Decision | Status |
|---|---|---|---|---|
| 1 | 2026-11-03 | MVP | **Conversion goal:** waitlist sign-ups now; App Store downloads once the app is public. The page is designed in two states so the switch is a swap. | Active |
| 2 | 2026-11-03 | MVP | **Waitlist incentive:** "a free year of Premium" for waitlist sign-ups. Premium doesn't exist until V1.1, so the site says "when it launches" and names no Premium features or price. | Active; must be honoured at V1.1 |
| 3 | 2026-11-03 | MVP | **Free-tier wording:** "Free" in the hero; the 20-scan monthly limit stated in the FAQ ("about five a week"); manual entry has no limit; never say "unlimited". Recommended default; the user didn't choose explicitly. | Active, revisit |
| 4 | 2026-11-02 | MVP | **No on-device or "never shared" claims.** Receipt photos go to our servers and to Anthropic. The app enforces this with `cameraPrivacyCopy.test.tsx`; the site follows the same rule. | Active |
| 5 | 2026-11-02 | MVP | **No speed or accuracy figures** until they're measured on the receipt test set. | Active |
| 6 | 2026-11-03 | MVP | **Launch date: Q4 2026**, on iPhone. Replaces the old site's "Q3 2026". | Active |
| 7 | 2026-11-03 | MVP | **Matching waitlist sign-ups to app accounts for the free Premium year (#2) is automatic:** the waitlist email (the Resend audience) against the account's email. The to-do list is in `docs/launch-open-items.md` §6. | Active; build by V1.1 |
| 8 | 2026-11-03 | MVP | **The privacy line rests on Anthropic's standard Commercial Terms.** We use the regular Anthropic API, so no separate agreement or review with Anthropic is needed. The terms say "Anthropic may not train models on Customer Content from Services". Rerun the check if the provider or the agreement changes. | Active |

## Open

- **Legal sign-off on our own privacy text** (`privacy.ts` still has `reviewed: false` and a placeholder company name). This is our lawyer's review of our policy, not a review with Anthropic. The site's privacy wording must match the signed-off text.
- **Referral queue.** Optional; it needs referral tracking in `marketing/api/`.
