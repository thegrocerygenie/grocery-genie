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
| 9 | 2026-11-04 | V1.1 | **Free Premium year: who counts and when.** (a) Waitlist contacts created before the site switches to the App Store (`PUBLIC_LAUNCH_STATE=b`) qualify; record that date here when it happens. (b) They can claim it for 90 days after Premium launches, by creating or matching an account with the waitlist email, or through the claim step. (c) Each free year runs 12 months from the day that person's account is matched. | Active |
| 10 | 2026-11-04 | V1.1 | **Unsubscribes keep the free year.** Unsubscribing (Resend's link, or replying "unsubscribe") stops waitlist emails only; the contact stays, flagged, so the account can still be matched. A request to delete the email removes the contact and gives up the offer. The welcome email says both. | Active |
| 11 | 2026-11-04 | V1.1 | **Waitlist retention:** delete the whole waitlist (the Resend audience) 90 days after Premium launches, when the claim window (#9) closes, or a contact sooner if they ask. The record of who got the free year lives with their account. `privacy.ts` says this under "How long we keep it". | Active |
| 12 | 2026-11-04 | V1.1 | **The free year is a RevenueCat promotional entitlement:** a 1-year grant of the Premium entitlement through RevenueCat's REST API, so RevenueCat stays the only source of Premium (V1.1 plan D1). Built as V1.1 story V11-P5. | Active |
| 13 | 2026-11-04 | V1.1 | **A redeemed free year outlives account deletion as a salted, one-way hash of the waitlist email,** with no link to the account, until the claim window closes (90 days after Premium launches), then it's deleted with the waitlist. This stops a second free year from a new account. `privacy.ts` says so under "Deleting your account". | Active |
| 14 | 2026-11-04 | V1.1 | **V1.1 brief version: 1.1.0.** `mobile/app.json` still says 0.1.0; bump it when V1.1 ships. | Active |
| 15 | 2026-11-04 | V1.1 | **Conversion goal stays two-state:** waitlist now, App Store downloads at launch (#1). Downloads stay the one call to action in State B; Premium upgrades happen in the app. | Active |
| 16 | 2026-11-04 | V1.1 | **Pricing section: a Free vs Premium table, in State B only,** with Premium at $5.99/month. State A keeps "a free year of Premium when it launches" (#2). Show it only once the App Store product is live. | Active |
| 17 | 2026-11-04 | V1.1 | **No item-matching figures on the site.** The 31/31 precision and 31/33 recall come from a small development test, not a user-facing accuracy claim. This extends #5. | Active |

## Open

- **Legal sign-off on our own privacy text** (`privacy.ts` still has `reviewed: false` and a placeholder company name). This is our lawyer's review of our policy, not a review with Anthropic. The site's privacy wording must match the signed-off text.
- **Referral queue.** Optional; it needs referral tracking in `marketing/api/`.
