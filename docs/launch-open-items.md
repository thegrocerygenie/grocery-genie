# Launch open items

Curated on 2026-10-27, after PRs 9–29 merged (main at `59d8c7e`). Updated the same day after PRs 30–37 merged (main at `8af1942`), and on 2026-10-28 after PRs 38–47 merged (main at `a05a460`). Every session that worked on these is archived, so this file is the list to work from. Tick an item off here when it lands.

Sources:
- [privacy review](legal/privacy-review-2026-10-27.md)
- the Simulator pass report (on origin/main `105631b`; H = high, M = medium, L = low). It lives in the app's side-session notes and isn't in the repo. Each finding below carries enough detail to act on without it.
- the device checklists in [13-validation-strategy.md](prd/13-validation-strategy.md)

## 1. App Store blockers

- [x] **AI consent before the first scan** (Apple 5.1.2(i), review blocker 3). Shipped in PR 34: a one-time consent sheet, a Settings switch to withdraw it, server-side consent (a 403 without it), and the consent wording in `privacy.ts`.
- [ ] **Public privacy policy URL** for App Store Connect (5.1.1(i)), for example on the `marketing/` site. It must match the in-app text.
- [x] **Marketing FAQ makes a false privacy claim.** `marketing/index.html` (the "Will my receipts be private?" answer) says receipts are "processed on-device for OCR" and that "we never sell or share your data". Receipts are uploaded to our servers, and Anthropic reads them. The same answer promises an opt-in community-pricing feature, which is a later-phase feature. Rewrite it to match `privacy.ts` before the site goes public. Done 2026-11-02: the answer now says only what `privacy.ts` says (Anthropic reads receipts after consent, no selling or ad sharing, encrypted in transit, account deletion). It goes to legal review with the privacy text. The rest of the page still describes roadmap features (price tracking, household sharing, recipes, a Q3 2026 launch, Premium pricing); rework it before the site goes public. On 2026-11-03 the launch date became Q4 2026 (page, meta tags, social card), and the "When does it launch?" answer now lists only what launches. The redesign brief is [marketing/mvp/design-brief.md](marketing/mvp/design-brief.md). On 2026-11-03 the page was rebuilt from the Claude Design v5 handoff (Astro, `marketing/`); it covers only built MVP features and the brief's privacy wording.
- [ ] **App Store privacy label** filled in from the table in the privacy review.
- [x] **Sign-up "Privacy Policy" link works.** It opens the in-app policy at `onboarding/privacy`. "Terms" was dropped: no Terms document exists.
- [ ] **Legal sign-off** on `privacy.ts`, then set `reviewed: true` to remove the draft banner. Replace the placeholder company name ("The Grocery Genie Inc.").
- [x] **A native build opens on iOS 27.** Expo Go hid three native problems with Xcode 27 and the iOS 27 SDK. Committed config now fixes all three, so `npx expo prebuild --clean` makes a working `ios/` with no hand edits:
  - `pod install` failed: Google Sign-In's `AppCheckCore` needs modular headers for `GoogleUtilities` and `RecaptchaInterop`. Fix: `extraPods` in the `expo-build-properties` entry in `mobile/app.json`.
  - Xcode 27 rejects pod targets below iOS 15.0. Fix: `mobile/plugins/withPodsMinDeploymentTarget.js` raises them to the app's target (15.1).
  - The app stopped at launch on iOS 27 (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`), because the Expo template has no UIScene lifecycle. An Expo upgrade does not help: the SDK 55, 56, and 57 templates have the same AppDelegate. A Release build stops the same way (checked on the iOS 27 Simulator), so this blocks any App Store build made with the iOS 27 SDK. Fix: `mobile/plugins/ios-scene-lifecycle/` adds a scene manifest and a `SceneDelegate`. The delegate forwards links to `AppDelegate`, so deep links work from a cold start and while the app runs. Remove the plugin when the Expo template adopts UIScene; it fails prebuild if the template's AppDelegate changes.
- [ ] **Native build setup.** Done in code: `mobile/eas.json` has development (a Debug Simulator build that loads from Metro), development-device, preview and production profiles; the Expo packages match SDK 54 (`expo-secure-store` is back on 15.x: sign-in persists across a relaunch on a Simulator native build); and `app.config.ts` adds the Google Sign-In plugin. There's no `expo-dev-client`: SDK 54's dev launcher needs the window in `didFinishLaunching`, but iOS 27 needs the UIScene lifecycle (`plugins/ios-scene-lifecycle`), so the launcher crashes at startup. Revisit when the Expo template adopts UIScene. Still to do:
  - **Link the Expo project:** run `eas init` from `mobile/` with the team's Expo account. It writes `extra.eas.projectId` to the config.
  - **Set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`** and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (EAS environment variables, or `mobile/.env.local` from `mobile/.env.example` for local builds). Without it, the build has no Google URL scheme and the app hides "Continue with Google". With it, check that Google sign-in completes on a native build.
  - **Set the API URL per profile:** `EXPO_PUBLIC_API_URL` for preview and production.
  - `npx expo run:ios` treats Xcode 27 Simulators as physical devices ("No code signing certificates"). `make mobile-ios-native` builds with `xcodebuild` and installs on the booted Simulator instead.

## 1b. Before the next deploy

- [ ] **Run the database migrations `20261028_0010`, `20261030_0011`, `20261101_0012`, `20261102_0013` and `20261102_0014`** (`make backend-migrate`). `20261102_0014` adds `users.timezone` (default `UTC`), which the weekly summary reads; the beat now runs it hourly. `20261102_0013` turns any receipt currency that isn't an ISO code ("€", "usd") into one, so budgets count it correctly; it is safe to run twice. `20261101_0012` adds `analytics_events`, which every request with an analytics event writes; without it the events are dropped (logged as "Analytics events not saved"), and requests still succeed. `20261030_0011` adds `receipts.extraction_model` and `extraction_prompt_version`, which every scan now writes, so a scan fails against a database without them. `20261028_0010` (PR 42, L2) adds `line_items.position`, and the API orders receipt items by it, so the API fails against a database without the column. The migration fills existing rows from their current order.
- [ ] **Set `GG_RESEND_API_KEY` in production.** Since PR 32, the API refuses to start without it, so nothing can log email bodies. Only local dev opts out, with `GG_EMAIL_DELIVERY=off`.
- [x] **Run `npm install` in `mobile/` after pulling.** PR 35's H3 fix is a `patch-package` patch to react-native-screens 4.16. Without the install, `nativeBackButtonPatch.test.ts` fails (seen on 2026-10-27 in a stale checkout), and a native build ships without the fix. Done: mobile `make` targets now install when dependencies change. Direct `npx` or `npm` use still needs `npm install` by hand.

- [ ] **Rebuild the native app** (`make mobile-ios-native`, or an EAS build) after pulling the currency change: it adds `expo-localization`, a native module, to read the iPhone's currency at sign-up.

## 2. Claims the privacy text makes that code doesn't enforce yet

- [x] **Sign-in security records kept up to 12 months:** a daily beat task purges `auth_events` older than `GG_AUTH_EVENT_RETENTION_DAYS` (default 365).
- [x] **App activity events kept up to 13 months:** a daily beat task purges `analytics_events` older than `GG_ANALYTICS_EVENT_RETENTION_DAYS` (default 396). Deleting an account deletes its events.
- [x] **Server logs:** every service in `docker/docker-compose.yml` uses the `x-logging` anchor (json-file, 5 files of 10 MB, oldest deleted first). The privacy text now says this: about 50 MB per service, never archived, older log files deleted after 30 days. Still to do on the host: add the daily cron job in [DEPLOYMENT.md](DEPLOYMENT.md) 1.9 that deletes rotated log files older than 30 days.
- [x] **The other minimization fixes:**
  - stop requesting the unused Apple full name;
  - drop raw receipt values from the analytics logs;
  - block the email-logging fallback in production.
- [x] **Check Anthropic's current commercial terms** for the "does not train on it" claim, and for how long it keeps API inputs. Checked 2026-11-03. We use the regular Anthropic API, so the standard [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) apply, and no separate review with Anthropic is needed. They say "Anthropic may not train models on Customer Content from Services", which supports the claim. Retention: Anthropic's [Privacy Center](https://privacy.claude.com/en/articles/7996866) says API inputs and outputs are deleted within 30 days, unless they're needed longer to enforce its Usage Policy or by law. `privacy.ts` makes no retention claim for Anthropic. The legal sign-off on `privacy.ts` (§1) is our own review, and stays open.

## 3. Checks that need a real phone

All of them are in [device-checklist.md](device-checklist.md), with the setup a device session needs. Tick them there. Its groups: build and sign-in, camera and capture (with blur calibration), push, offline and quota, account deletion, navigation and refresh (H3, M9), and VoiceOver.

## 4. Simulator-pass findings still open

Fixed already: H1 and H2 (#20), H4 and M8 (#22, #29), H5, M1 and M2 (#21), and the L4 privacy-copy mismatch (#27).

**High**
- [ ] **H3:** the app stops responding to touches after an edge-swipe back. Fixed in code by PR 35: a patch for react-native-screens 4.16's back-button bug (upstream #3294), plus a guard test. Expo Go can't load native patches, so it is still unproven at runtime. Prove it on a native build with section 6 of [device-checklist.md](device-checklist.md), then tick this.

**Medium**
- [x] **M3:** the duplicate-receipt warning never appears. Fixed: Review shows a "Possible duplicate" banner from the scan's `duplicate_warning`, and a receipt in Recently Deleted no longer counts as a duplicate. A receipt queued offline and opened from History shows no warning, because the warning comes only with the scan response.
- [x] **M4:** `receipt_abandoned {stage: capture}` fires on every Scan screen re-render, which inflates analytics. Fixed: `useAnalytics` now returns a stable object. This also fixed the same over-count for `{stage: review}`.
- [x] **M5:** budget alerts fire for past periods, including months before the budget existed. Fixed: only the current period alerts (the periods that hold yesterday, today, and tomorrow in UTC, so a user's local date still counts). A receipt dated in a later period does not alert when that period begins.
- [x] **M6:** the Language setting does nothing, and its default looks wrong. Fixed: the extractor always reads all six RC-05 languages, so "Receipt Languages" is now a read-only list with no switches.
- [x] **M7:** the onboarding camera screen and the Scan permission prompt said "Photos are processed on-device". Fixed in PR 31; a guard test now fails on any on-device claim in the app.
- [x] **M9:** the Budget dashboard's pull-to-refresh spinner sticks after a background refetch. Fixed: the spinner shows only for a refresh that the user pulled, on Budget and History (`useUserRefresh`). Not yet checked on a device.

**Low**
- [x] **L1:** the Scan pill always says "Receipt detected", even while idle. Fixed: nothing detects a receipt, so it says "Fit the receipt in the frame" until the first frame check, then "Looks clear — tap to capture".
- [x] **L2:** an edited item moves to the bottom (`Receipt.line_items` has no `order_by`). Fixed: `line_items.position` (migration `20261028_0010`), and reads order by it. Existing rows keep the order the app already showed; an item that had moved before this fix stays where it is.
- [x] **L3:** the dashboard doesn't sort categories, but Trend does. Fixed: largest spend first, as on Trend.
- [x] **L4:** copy issues. Fixed:
  - "1 item" / "3 items";
  - the sheet that edits a saved receipt is titled "Edit Receipt"; a new scan stays "Review";
  - the Settings row is "Alerts", like its screen and the privacy text, and Help says Settings → Alerts;
  - a queued import says "Imported photo" or "Imported PDF".
- [x] **L5:** the over-cap banner says "Adjust limits or pause alerts", but can't be tapped. Fixed: it says "Adjust limits." and opens Budgets.
- [x] **L6:** delete works only by long-pressing a History row; there's no swipe and no Delete on the receipt detail screen. Fixed: swipe left on a row (adds `react-native-gesture-handler`), a VoiceOver Delete action, and Delete Receipt on the detail screen. Long-press stays.
- [x] **L7:** after you confirm a receipt dated in an earlier month, Budget still says "Scan your first receipt". Fixed: the dashboard returns `has_receipts`, and the first-scan state shows only without any receipt.
- [x] **L8:** "Skip" and "Done" look cramped in the round header buttons. Fixed: every text header button has side padding, so iOS draws a capsule. Checked on Settings' Done; onboarding's Skip wasn't reached on the Simulator.
- [x] **L9:** changing an item's quantity keeps the line total and silently changes the unit price. Fixed: the total stays what was paid, and the row shows the unit price ("Qty 2 · $0.65 each").

## 4b. MVP design alignment, round 2

A comparison of the design (removed in `041f38f`, still in git) with `main` on 2026-10-28. It found:
- 11 accessibility gaps (VoiceOver values, Reduce Motion, Increase Contrast, Reduce Transparency, Dynamic Type);
- 4 behavior and copy gaps;
- 8 visual details.

[.planning/HANDOFF-2026-10-28-design-alignment.md](../.planning/HANDOFF-2026-10-28-design-alignment.md) has every item, with file and line, size and order. Its two decisions were made on 2026-10-28:
- [x] **Review's Category row** has a chevron but does nothing. Decided: it opens `CategoryPickerSheet` and sets the category on every item (PR 2 of the handoff).
- [ ] **Edge detection on the camera (RC-01 AC 1, MVP).** Built in code: on a device, Scan opens Apple's document scanner (`VNDocumentCameraViewController`) through `@dariyd/react-native-document-scanner`. Expo Go and the Simulator keep the expo-camera screen. The plan and its decisions are in [.planning/PLAN-2026-11-01-document-scanner.md](../.planning/PLAN-2026-11-01-document-scanner.md). Still unproven: nobody has built the module with Xcode 27. Run the "Document scanner" checks in [device-checklist.md](device-checklist.md) §2 on a native build, then tick this.

## 5. Known gaps, accepted for now

- ~~**Rate limits count per token, not per user** (noted in PR 24), so signing in again resets the count.~~ Fixed: the limits count per user, and the 50/hr cap applies only to receipt submissions.
- **Dev loop:** `LogOnlyEmailClient` logs at INFO, but the backend sets no logging config, so verify and reset links never appear locally.
- ~~**Backend dependencies aren't locked.**~~ Fixed: `backend/uv.lock`, and `backend/requirements.lock.txt` (hashed) for the Docker image. `make backend-lock` re-locks; `scripts/check-backend-lock.sh` fails when they drift.
- **`make hooks` says "Git hooks on" on every run in Claude worktrees** (PR 47). Their git config holds the hooks path as a full path, so the check never matches `.githooks`. It does no harm.
- **Your shell:** a stale `GITHUB_TOKEN` in your profile breaks `gh` until it's removed. `.claude/launch.json` is untracked.

## 6. Waitlist: the free year of Premium (build by V1.1)

The site promises waitlist sign-ups "a free year of Premium" when Premium launches in V1.1 ([decisions](marketing/decisions.md) #2). The match is automatic: the waitlist email against the account's email (#7). Waitlist emails are contacts in the Resend audience (`RESEND_AUDIENCE_ID`), stored trimmed and lowercased by `marketing/api/_handler.js`.

- [x] **Now: say it in the privacy text.** Before the waitlist grows, the waitlist sign-up and `privacy.ts` must say the waitlist email will be used to find the person's account and apply the offer.
  - [x] `privacy.ts` ("What we collect" → "Our waitlist", and Resend "keeps our waitlist"), updated November 3, 2026. Still a draft until legal sign-off.
  - [x] The waitlist sign-up on the marketing site, done November 3, 2026:
    - a note under each waitlist form (`marketing/src/components/CtaSlot.astro`): "We'll email you once, at launch. Sign up in the app with this same email and we'll match it to your account for the free Premium year.";
    - the same line in the default welcome email (`marketing/api/_handler.js`).

    `marketing/tests/page.mjs` and `tests/smoke.mjs` check both. A custom `WAITLIST_WELCOME_TEXT` must keep that line.
- [x] **Now: decide the cut-off.** Decided 2026-11-04 ([decisions](marketing/decisions.md) #9):
  - **Who counts:** waitlist contacts created before the site switches to the App Store. Resend keeps each contact's `created_at`.
  - **Claim window:** 90 days after Premium launches.
  - **Length:** each free year runs 12 months from the day the account is matched.
- [ ] **Record the switch date.** When the site moves to App Store downloads (`PUBLIC_LAUNCH_STATE=b`), write the date into decisions #9; it's the cut-off. The site hasn't switched yet (2026-11-04). The step is in `marketing/README.md` → "Before switching to State B", so it happens with the switch.
- [ ] **Tell members the terms.**
  - [x] Published 2026-11-04: a State A FAQ entry on the site ("How does the free year of Premium work?"), and the 90-day window and 12 months in the welcome email. Both are checked by `marketing/tests/`.
  - [x] The launch email repeats the 90-day claim window. Drafted 2026-11-04 in [marketing/launch-email.md](marketing/launch-email.md); check its "Before sending" list on send day.
- [x] **Now: decide on unsubscribes.** Decided 2026-11-04 ([decisions](marketing/decisions.md) #10): unsubscribed contacts still qualify, and only a deletion request gives up the offer.
  - The welcome email (`marketing/api/_handler.js`) now says: reply "unsubscribe" to stop emails, or "delete" to remove the email and give up the free year.
  - **Matching must include contacts with Resend's `unsubscribed` flag.**
  - Whoever handles replies: "unsubscribe" means set the flag, not delete the contact.
- [x] **Now: decide retention.** Decided 2026-11-04 ([decisions](marketing/decisions.md) #11): the waitlist is deleted 90 days after Premium launches, when the claim window closes. `privacy.ts` says so, along with the unsubscribe rule (#10). It's still a draft until legal sign-off.
- [ ] **Delete the waitlist when the claim window closes.**
  - Schedule deleting the Resend audience for 90 days after Premium launches.
  - Keep each free-year grant on its account, so "one year per waitlist email" still holds afterwards. Store a salted hash of the matched waitlist email with the grant. It outlives account deletion, unlinked, until the window closes ([decisions](marketing/decisions.md) #13).
The build items below are V1.1 story **V11-P5** (`.planning/PLAN-2026-11-03-v1.1.md`). The grant is a RevenueCat promotional entitlement ([decisions](marketing/decisions.md) #12, plan D5).

- [ ] **Matching rule.** An account qualifies when its email, trimmed and lowercased like the waitlist's, equals a waitlist contact's.
  - Match only verified emails: email-and-password accounts after `verify-email`; Apple and Google sign-ins carry an email their provider verified.
  - One free year per waitlist email, even if several accounts use that email over time.
- [ ] **When it runs:**
  - once at V1.1 launch, over every existing account;
  - then on every sign-up, email verification and confirmed email change (`confirm_email_change`).

  The backend reads the audience through the Resend API, or from a one-off export taken at the cut-off.
- [ ] **When nothing matches.** Sign in with Apple's Hide My Email gives an `@privaterelay.appleid.com` address, and some people sign up with a different email. Add "Claim your waitlist offer" in Settings: the user enters their waitlist email and taps a confirmation link sent to it (the same pattern as the email-change confirmation).
- [x] **Launch email.** Ask waitlist members to sign up with the email they joined with, or to use the claim flow. Drafted in [marketing/launch-email.md](marketing/launch-email.md); send it at the switch.
