# Handoff: MVP design alignment, round 2 (2026-10-28)

**Status: open.** Steps 1 and 2 are done: accessibility merged as #50 (plus #51, onboarding at AX5), and behavior and copy is PR 2. Step 3 (visual fidelity) and the document scanner are open. The MVP Definition of Done audit of 2026-10-29 (`.planning/DOD-AUDIT-2026-10-29.md`) ranks what's left.

Goal: close the gaps between the MVP design and the app, so the MVP screens match the design's look, behavior and accessibility rules. Every item has a test where a test can see it, and a Simulator check where only a screen can.

## Where the design lives

The design handoff was removed in `041f38f`. Read it from git:

```bash
git show 041f38f^:design_handoff_grocery_genie/README.md
git show 041f38f^:design_handoff_grocery_genie/reference/components-v2/mvp-screens.jsx   # visual source of truth
git show 041f38f^:design_handoff_grocery_genie/reference/components-v2/motion.jsx        # motion + accessibility rules
git show 041f38f^:design_handoff_grocery_genie/expo-sample/<Screen>.tsx                  # drop-in versions
```

When `mvp-screens.jsx` and `expo-sample/` disagree, the reference (`mvp-screens.jsx`) wins.

## How this list was made

Three read-only reviews on 2026-10-28 compared each MVP screen with the design. The groups were onboarding, tabs and tokens; Budget, Budget Settings and Alerts; and Scan, History and Review. Items marked **checked** were confirmed in the code on `a2d15d9`. Items marked **from the design** came from reading the design files: compare them on the Simulator before changing anything.

Round 1 (PR 9, the Simulator pass, M1–M9 and L1–L9 in `docs/launch-open-items.md`) is done. Don't redo it.

## Decisions (made 2026-10-28)

1. **Edge detection: (a) the document scanner.** Use `VNDocumentCameraViewController` through a community Expo module. This needs a native dev build, because Expo Go can't load it. It replaces the custom capture screen and its pre-capture blur hints. It is its own piece of work: it is not in PR 1–3, and it needs a plan first (pick the module, check the dev build, decide what happens to the L1 pill copy and the blur hints, and update `docs/device-checklist.md` §2).
2. **Review Category row: open `CategoryPickerSheet`, and set the chosen category on every line item.** This goes in PR 2.

The original options follow, for the record.

## Options considered

1. **Edge detection on the camera (RC-01 AC 1, MVP).** `docs/prd/01-receipt-capture.md:11` asks for "real-time edge detection overlay highlighting receipt boundaries", and `PHASE_SCOPE.md:20` lists it for MVP. Today Scan shows fixed corner brackets, and nothing detects the receipt (L1). The design recommends Apple's document scanner (`VNDocumentCameraViewController`, through a community `expo-document-scanner` module), which replaces the custom camera. The choices:
   - **(a)** Use the document scanner. It needs a native build, because Expo Go can't load it. You get Apple's edge detection, auto-crop and multi-page for free, but you lose the custom capture screen and the pre-capture blur hints.
   - **(b)** Use a `react-native-vision-camera` frame processor. That keeps the custom screen, but it needs a native build and more work.
   - **(c)** Amend RC-01 AC 1 to drop the overlay for MVP.

   Also note `docs/device-checklist.md` §2, "edge-detection overlay": it will fail until this is decided.
2. **Review's Category row** shows a chevron but does nothing when tapped (`mobile/app/review.tsx:352`). The options are to open `CategoryPickerSheet` and set every item's category, or to drop the chevron. **checked**

## Steps

Do them in this order: accessibility first (one PR), then behavior and copy (one PR), then visual fidelity (one PR). For each step: TDD where a test can see it, then `make validate`, then a Simulator check, and ask before each commit and push.

### 1. Accessibility (PR 1): done in #50 and #51

All items are **checked** and size S unless marked otherwise.
- [x] **Budget ring.** VoiceOver reads "$157", then "left · 11d". Make the wrapper `accessible`, with `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: 100, now, text }}`, and a label like "$157 left of $400, 61 percent, 11 days left". `mobile/src/components/BudgetRing.tsx:34`; design `motion.jsx:64`.
- [x] **Dashboard category rows.** They aren't grouped or labelled, and red is the only sign a category is over its cap. Add `accessible` and a composed label ("Groceries, $142, 82 percent of $175 budget", plus "over budget" when it applies). Over the cap, also show a glyph (`exclamationmark.circle.fill`) or "$58 / $40". `mobile/app/(tabs)/(budget)/index.tsx` (`CategoryRow`, about line 387).
- [x] **Reduce Motion.** Nothing in `mobile/` reads it. The ring should fade in, not spring: use reanimated's `useReducedMotion()`, and `withTiming` or a fade when it's on. `BudgetRing.tsx:21-24`; design `motion.jsx:62`.
- [x] **Increase Contrast.** The tint should shift to `#195F3A`. Add `highContrastLight` and `highContrastDark` to the tint's `DynamicColorIOS` pair. `mobile/src/constants/theme.ts:24,42`; design `motion.jsx:63`.
- [x] **Reduce Transparency.** The tab bar should drop its blur for an opaque `iosBg2`. Check `AccessibilityInfo.isReduceTransparencyEnabled()` and listen for changes. `mobile/app/(tabs)/_layout.tsx:45`; design `motion.jsx:65`.
- [x] **Tab roles.** Tab items use `accessibilityRole="button"`. Give the bar `tablist` and each item `tab`. `(tabs)/_layout.tsx:62`.
- [x] **Dynamic Type (size M).** CTAs have a fixed `height: 50` in 13 places across `mobile/app/onboarding/*.tsx` (index, budget, camera, sign-in, sign-up, verify-email, reset-password, forgot-password, confirm-email-change), so labels clip at AX sizes. Use `minHeight: 50` with vertical padding. Cap the tab-pill labels with `maxFontSizeMultiplier`. Design `motion.jsx:61` ("test up to AX5").
- [x] **Review prices.** VoiceOver never reads the amount or the "verify" tag: the "Price of X" label replaces them. Add `accessibilityValue={{ text: '$x.xx' + (low ? ', low confidence' : '') }}`. `mobile/app/review.tsx` (price Pressable, about line 698).
- [x] **Review Cancel/Done** has no `accessibilityRole="button"`; Save has one. `review.tsx:250`.
- [x] **Scan error pill** has no live region, so VoiceOver isn't told a capture failed. Add `accessibilityLiveRegion="polite"` and `accessibilityRole="alert"`, as the pre-capture pill has. `mobile/app/(tabs)/scan.tsx:425-431`.
- [x] **"Set a budget" links** on the dashboard (the no-budget hero and the empty state) have no button role or label. `(budget)/index.tsx` (about lines 245 and 288).

### 2. Behavior and copy (PR 2): done

- [x] **"On pace" is unconditional.** Under the cap it always says "On pace · Nd left", even when spend runs ahead of the month. Compare `spent / cap` with the share of the month gone, and show "On pace · N% under" or "Ahead of pace · N% over". Write the rule as a pure helper with tests. `(budget)/index.tsx:313`; design `mvp-screens.jsx:89`. **checked**, S
- [x] **Budget Settings, start day** reads "1 1st": the raw input sits next to an ordinal suffix. The Monthly limit shows "400", not "$400.00". Show the formatted value until the field is focused, and keep inline editing. `mobile/app/budget-settings.tsx:218-228`; design `mvp-screens.jsx:286-287`. **checked**, S
- [x] **History "Needs review" rows** drop the date. The design keeps it ("Apr 21 · Pending sync"). Show `${date} · Needs review` in orange. `mobile/app/(tabs)/history/index.tsx:103`; design `mvp-screens.jsx:243`. **checked**, S
- [x] **No success haptic on confirm.** The design pairs "Receipt saved · ring fills" with a Success haptic. Review fires none; only scan, manual entry and import do. Fire `notificationAsync(Success)` just before leaving Review after a confirm. `review.tsx`; design `motion.jsx:38,52`. **checked**, S
- [x] **Review Category row:** a tap opens `CategoryPickerSheet`, and the chosen category is set on every line item (decision 2). `review.tsx:352`.

### 3. Visual fidelity (PR 3)

All items are **from the design** unless marked. Compare each on the Simulator first.
- [ ] **Money font.** `fontFamily: 'SF Pro Rounded'` (`theme.ts:124`) may not resolve on iOS, which would leave money text in plain SF. Try `'ui-rounded'`, and compare on the Simulator. **checked** that the name is used; not checked how it renders.
- [ ] **Welcome icon glyph** is hard-coded white (`mobile/app/onboarding/index.tsx:17`). In dark mode the tint is bright `#34D17A`, and on-tint content is black elsewhere (`theme.ts:60`). Use `colors.onTint`. **checked**, S
- [ ] **Ring spring** has almost no overshoot. Damping 18 and stiffness 90 work out to ζ ≈ 0.95; the reference spring (response 0.6, damping 0.7) overshoots slightly. Try about damping 14.7 and stiffness 110. `theme.ts:145`; design `motion.jsx:17`.
- [ ] **Ring center label.** When on track, the reference uses label color at 22pt with a 13pt sub; the app uses tint at 18pt with a 12pt sub. When over, the reference sub is 11pt. `BudgetRing.tsx:57-58`; design `patterns.jsx:16-17`. PR 1 capped this text at 1.2× (`CENTER_MAX_FONT_SCALE`) so it fits the 108pt ring at AX5. Recheck that fit at AX5 after any size change.
- [ ] **Welcome and Camera type and spacing.** The tagline is 15pt, 6pt under the wordmark, with a 20pt gap below the icon. "Not now" is weight 400. The icon shadow opacity is 0.25. `onboarding/index.tsx`, `camera.tsx`; design `mvp-screens.jsx:10-16,48-55`.
- [ ] **Onboarding budget amount:** 48pt "$400" with ".00" in label-3 and letterSpacing −1. The app shows 56pt with no cents. `onboarding/budget.tsx:124-136`; design `mvp-screens.jsx:34`.
- [ ] **Scan sizes.** The shutter is 70pt; the reference uses 64. The error pill is a full capsule; the reference uses radius 12 with 8pt padding. `scan.tsx:472-478,526-533`; design `mvp-screens.jsx:143,172`.
- [ ] **Scan, permission denied:** the icon tile should be red-tinted (`rgba(255,59,48,0.12)`, 60pt, radius 14), not grey. `scan.tsx:548-556`; design `mvp-screens.jsx:320`.

## Deliberate divergences: leave these alone

Later decisions changed these on purpose, each with a commit or PRD line behind it:
- AI consent before the first scan (PR 34).
- The privacy copy says "sent securely", not "processed on-device" (M7).
- Welcome goes to sign-up and sign-in (auth exists).
- The Instrument Serif wordmark.
- iOS semantic colors, with black on tint in dark mode.
- The system decimal pad, not the design's numpad.
- Scan:
  - the pill copy (L1);
  - the "Capturing…", "Saved · will upload automatically" and processing copy;
  - error hints that name the reason;
  - Choose from Library on the permission screen.
- History:
  - queued receipts in their own Pending group;
  - "Needs review" rows;
  - swipe to delete (L6);
  - the header "+" button and the stacked search;
  - a saved receipt opens `receipt/[id]`.
- Review:
  - the low-confidence threshold is 0.7 (RC-02);
  - verify tags on store, date and total;
  - inline edits and the native date picker;
  - the unit price on a quantity edit (L9);
  - the photo, the duplicate and high-value banners, and subtotal/tax.
- Budget:
  - categories sorted by spend (L3);
  - the banner says "Adjust limits." and opens Budgets (L5), and shows for a category cap;
  - the first-scan state only without receipts (L7);
  - Top items and the 3-month trend (BC-04);
  - the Settings hub and the "Alerts" name (L4);
  - the no-budget hero state.
- The tab bar hides on Scan, with `backBehavior="history"`.

## Out of scope

- Home and Lock Screen widgets, the scan Live Activity and Dynamic Island, the App Group, and a watch app. These are design-only; the PRD never mentions them.
- Android styling. `docs/prd/10-nfr.md:51` says "Android target deferred — do not build".

## Gotchas

- Run `make validate`. It installs dependencies when they changed, and backend targets use `backend/.venv`.
- To get the Simulator: run `preview_start` for `backend-dev` and `mobile-ios` (`.claude/launch.json`), then open `exp://127.0.0.1:8081`. Metro runs with `CI=1` and doesn't watch files, so restart it to see code changes.
- In the iOS 27 Simulator, header-button taps are sometimes ignored, so take a screenshot after each tap. Deep links (`exp://127.0.0.1:8081/--/settings`) are more reliable.
- Expo Go can't show native-only behavior: Reduce Motion and Increase Contrast do work in the Simulator (Settings → Accessibility), but a document scanner needs a native build.
- `react-native-gesture-handler`'s swipe container is a Reanimated view. Never pass an adaptive (`DynamicColorIOS`) color to its `containerStyle`; a test in `historyRowActions.test.tsx` guards this.
- Stage files by explicit path. `.claude/launch.json` is untracked on purpose.
