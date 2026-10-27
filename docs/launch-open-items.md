# Launch open items

Curated on 2026-10-27, after PRs 9–29 merged (main at `1f0b3e4`). Every session that worked on these is archived, so this file is the list to work from. Tick an item off here when it lands.

Sources:
- [privacy review](legal/privacy-review-2026-10-27.md)
- the Simulator pass report (on origin/main `39b9cf8`; H = high, M = medium, L = low). It lives in the app's side-session notes and isn't in the repo. Each finding below carries enough detail to act on without it.
- the device checklists in [13-validation-strategy.md](prd/13-validation-strategy.md)

## 1. App Store blockers

- [ ] **AI consent before the first scan** (Apple 5.1.2(i), review blocker 3). The app asks nobody before it sends receipt photos and item names to Anthropic. Card: "Ask permission before sending receipts to AI". When it ships, add the consent wording to `privacy.ts` (a test currently forbids it).
- [ ] **Public privacy policy URL** for App Store Connect (5.1.1(i)), for example on the `marketing/` site. It must match the in-app text.
- [ ] **Marketing FAQ makes a false privacy claim.** `marketing/index.html` (the "Will my receipts be private?" answer) says receipts are "processed on-device for OCR" and that "we never sell or share your data". Receipts are uploaded to our servers, and Anthropic reads them. The same answer promises an opt-in community-pricing feature, which is a later-phase feature. Rewrite it to match `privacy.ts` before the site goes public.
- [ ] **App Store privacy label** filled in from the table in the privacy review.
- [ ] **Sign-up "Privacy Policy" and "Terms" links work.** Today they are plain text (`mobile/app/onboarding/sign-up.tsx`), and no Terms document exists. Card: "Privacy minimization and sign-up policy link".
- [ ] **Legal sign-off** on `privacy.ts`, then set `reviewed: true` to remove the draft banner. Replace the placeholder company name ("The Grocery Genie Inc.").
- [x] **A native build opens on iOS 27.** Expo Go hid three native problems with Xcode 27 and the iOS 27 SDK. Committed config now fixes all three, so `npx expo prebuild --clean` makes a working `ios/` with no hand edits:
  - `pod install` failed: Google Sign-In's `AppCheckCore` needs modular headers for `GoogleUtilities` and `RecaptchaInterop`. Fix: `extraPods` in the `expo-build-properties` entry in `mobile/app.json`.
  - Xcode 27 rejects pod targets below iOS 15.0. Fix: `mobile/plugins/withPodsMinDeploymentTarget.js` raises them to the app's target (15.1).
  - The app stopped at launch on iOS 27 (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`), because the Expo template has no UIScene lifecycle. An Expo upgrade does not help: the SDK 55, 56, and 57 templates have the same AppDelegate. A Release build stops the same way (checked on the iOS 27 Simulator), so this blocks any App Store build made with the iOS 27 SDK. Fix: `mobile/plugins/ios-scene-lifecycle/` adds a scene manifest and a `SceneDelegate`. The delegate forwards links to `AppDelegate`, so deep links work from a cold start and while the app runs. Remove the plugin when the Expo template adopts UIScene; it fails prebuild if the template's AppDelegate changes.
- [ ] **Native build setup still to do:**
  - There is no `eas.json` yet, so no store build profile.
  - `npx expo run:ios` treats Xcode 27 Simulators as physical devices ("No code signing certificates"). For now, build with `xcodebuild -sdk iphonesimulator`, then use `xcrun simctl install`.
  - Google Sign-In has no config plugin in `app.json`, so the Info.plist has no reversed-client-ID URL scheme. Expo Go hides the button, but a native build shows it. Check that "Continue with Google" works on a native build before launch.

## 2. Claims the privacy text makes that code doesn't enforce yet

- [ ] **Sign-in security records kept up to 12 months:** `auth_events` has no purge. This is in the minimization card.
- [ ] **Server logs kept up to 30 days:** set Docker log rotation or the host's retention (`docker/docker-compose.yml` has no `logging:`), or change the text.
- [ ] **The other minimization fixes** (same card):
  - stop requesting the unused Apple full name;
  - drop raw receipt values from the analytics logs;
  - block the email-logging fallback in production.
- [ ] **Check Anthropic's current commercial terms** for the "does not train on it" claim, and for how long it keeps API inputs.

## 3. Checks that need a real phone

From `docs/prd/13-validation-strategy.md`. Run them on a development build from main.

- [ ] **Account deletion:**
  - full Sign in with Apple deletion with the production Apple keys, then confirm Grocery Genie is gone from iOS Settings → Apple ID → Sign-In with Apple;
  - choosing a different Apple ID at the sheet;
  - Apple unreachable;
  - push after deletion;
  - connection lost mid-delete;
  - VoiceOver.
- [ ] **Scan errors and the queue:**
  - the Retry Now tap;
  - the quota message on the camera screen;
  - airplane mode off with a receipt waiting;
  - an offline receipt that hits the quota on upload.
- [ ] **Blur calibration:** scan 20–30 receipts in Expo Go (half sharp, half blurry, in mixed light), and paste the labeled `[FrameQuality]` lines from the Metro log. Then set `DEVICE_BLUR_THRESHOLD` (still 900, unchecked) and update its test. The scripts are on main (PR 26).
- [ ] **Not covered by the Simulator:**
  - blur hints with a real camera;
  - real airplane mode;
  - push delivery (Expo Go has no remote push);
  - onboarding "Set budget → Continue";
  - Apple sign-in;
  - the first-run camera permission prompt;
  - the "uploading" banner;
  - VoiceOver across the app.

## 4. Simulator-pass findings still open

Fixed already: H1 and H2 (#20), H4 and M8 (#22, #29), H5, M1 and M2 (#21), and the L4 privacy-copy mismatch (#27).

**High**
- [ ] **H3:** the app stops responding to touches after an edge-swipe back.

**Medium**
- [ ] **M3:** the duplicate-receipt warning never appears.
- [ ] **M4:** `receipt_abandoned {stage: capture}` fires on every Scan screen re-render, which inflates analytics.
- [ ] **M5:** budget alerts fire for past periods, including months before the budget existed. Check this against PR 11 and PR 16 first; they may have changed it.
- [ ] **M6:** the Language setting does nothing, and its default looks wrong.
- [x] **M7:** the onboarding camera screen and the Scan permission prompt said "Photos are processed on-device". Fixed in PR 31; a guard test now fails on any on-device claim in the app.
- [ ] **M9:** the Budget dashboard's pull-to-refresh spinner sticks after a background refetch.

**Low**
- [ ] **L1:** the Scan pill always says "Receipt detected", even while idle.
- [ ] **L2:** an edited item moves to the bottom (`Receipt.line_items` has no `order_by`).
- [ ] **L3:** the dashboard doesn't sort categories, but Trend does.
- [ ] **L4:** copy issues:
  - "1 items";
  - the Edit sheet is titled "Review";
  - the Settings row says "Notifications", but its screen says "Alerts";
  - a file import is labeled "Scanned receipt".
- [ ] **L5:** the over-cap banner says "Adjust limits or pause alerts", but can't be tapped.
- [ ] **L6:** delete works only by long-pressing a History row; there's no swipe and no Delete on the receipt detail screen.
- [ ] **L7:** after you confirm a receipt dated in an earlier month, Budget still says "Scan your first receipt".
- [ ] **L8:** "Skip" and "Done" look cramped in the round header buttons.
- [ ] **L9:** changing an item's quantity keeps the line total and silently changes the unit price.

## 5. Known gaps, accepted for now

- **Rate limits count per token, not per user** (noted in PR 24), so signing in again resets the count.
- **Dev loop:** `LogOnlyEmailClient` logs at INFO, but the backend sets no logging config, so verify and reset links never appear locally.
- **Your shell:** a stale `GITHUB_TOKEN` in your profile breaks `gh` until it's removed. `.claude/launch.json` is untracked.
