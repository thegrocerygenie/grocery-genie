# Device checklist

Every check that still needs a real iPhone, in one place. Work from this list in the first device session, and tick items here. Each item names where it came from.

Collected on 2026-10-28, with main at `2048975` (after PR 40). Sources:
- the Manual Test Checklist in [13-validation-strategy.md](prd/13-validation-strategy.md) (unticked items);
- [launch-open-items.md](launch-open-items.md) §1, §3 and §4;
- PR 39 (the import picker after AI consent) and PR 40 (M3, M5, M9).

Items the Simulator already passed are not repeated here. The Simulator notes in `13-validation-strategy.md` say which ones those are.

## Before the session

The build:
- [ ] Run `make install-mobile`. It applies the patches (react-native-screens for H3, `@expo/cli` for Xcode 27). Without it, a native build ships without the H3 fix.
- [ ] Make a development build, not Expo Go. Expo Go can't load the react-native-screens patch, has no remote push, and hides the Google Sign-In button. Run `npx expo prebuild --clean`, then build with Xcode and code signing for the phone. There is no `eas.json` yet, so EAS can't make the build.
- [ ] Build from `2b506b3` or later, so the build has PR 39 (the picker after AI consent).

The backend the phone talks to:
- [ ] Set `EXPO_PUBLIC_API_URL` to an address the phone can reach: the Mac's LAN IP with `--host 0.0.0.0`, or a deployed staging API.
- [ ] Apple Sign In needs real keys: `GG_APPLE_TEAM_ID`, `GG_APPLE_KEY_ID`, `GG_APPLE_CLIENT_ID`, `GG_APPLE_PRIVATE_KEY`.
- [ ] Push needs a Celery worker and beat running (`deliver-pending-pushes`), and `GG_EXPO_PUSH_ACCESS_TOKEN` if the Expo project has enhanced push security on.
- [ ] Decide on the extractor. `GG_DEBUG=true` uses the mock extractor, which returns the same receipt for every photo. That's enough for the flow checks, but not for blur calibration or reading real receipts.

The phone:
- [ ] Signed in to an Apple Account. The "other Apple ID" check needs a second Apple Account on the device.
- [ ] Network Link Conditioner installed (Settings → Developer) for the "Apple unreachable" check.
- [ ] 20–30 paper receipts for blur calibration.

## 1. Build and sign-in

- [ ] **The native build opens on the phone.** The iOS 27 scene-lifecycle plugin was checked only on the Simulator. Cold-start a deep link and a link while the app runs; both must route. (launch-open-items §1)
- [ ] **Continue with Google works.** `app.json` has no Google Sign-In config plugin, so the Info.plist has no reversed-client-ID URL scheme, and the native button may fail. Expo Go hid the button. (launch-open-items §1)
- [ ] **Sign up with Apple** on a fresh install, then sign out and sign in with Apple again. (launch-open-items §3)
- [ ] **Onboarding: Set budget → Continue** reaches the camera step and saves the budget. (launch-open-items §3)
- [ ] **Onboarding's Skip button** is a capsule with room around the text, not a cramped circle. The Simulator never reached this screen after the fix. (L8, PR 42)
- [ ] **The first-run camera permission prompt** appears once, with the app's usage text. Allow it and the camera opens. On another fresh install, deny it: the Scan screen explains why it needs the camera and offers Choose from Library. (launch-open-items §3; NFR 10 compatibility 4)

## 2. Camera and capture

- [ ] The camera opens with the edge-detection overlay on a receipt. (13 Camera)
- [ ] A blur warning appears when the receipt is out of focus. (13 Camera, RC-01)
- [ ] A low-light warning appears in a dim room. (13 Camera, RC-01)
- [ ] Retake works before you submit. (13 Camera)
- [ ] The "uploading" banner shows while a scan uploads. (launch-open-items §3)
- [ ] **Import after AI consent.** Before PR 39, the picker opened while the consent sheet was still closing. iOS dropped it, and every later import did nothing until a relaunch. The fix waits 650 ms (`SHEET_DISMISS_MS` in `mobile/app/ai-consent.tsx`) before the picker opens. Only a phone shows whether that is long enough. (PR 39)
  - [ ] **Library.** Turn off Settings → Read receipts with AI, or use a new account. In History, tap + → Choose from Library → Allow. The photo picker opens on the first try, and the import reaches Review.
  - [ ] **Files.** Turn the setting off again. In History, tap + → Choose Files → Allow. The Files picker opens on the first try.
  - [ ] **Next import.** After either check, start another import. The picker opens again.
  - [ ] **Reduce Motion.** Turn on Settings → Accessibility → Motion → Reduce Motion, then repeat the Library check. The sheet closes differently there.
  - If the picker opens only on the second tap, 650 ms is too short for this phone. Write down the device and iOS version, and raise `SHEET_DISMISS_MS`.
- [ ] The photo library picker accepts JPEG, PNG and HEIC. (13 Camera, RC-03)
- [ ] A PDF from the Files app is accepted. (13 Camera, RC-03)
- [ ] **Duplicate warning.** Scan the same receipt twice within 24 hours. The second Review shows "Possible duplicate". Delete both, then scan again: no banner. A receipt queued offline and opened from History shows no banner; that's known. (M3, PR 40)

**Blur calibration.** `DEVICE_BLUR_THRESHOLD` in `mobile/src/features/receipt-capture/utils/frameQuality.ts` is still 900, a guess.
- [ ] Take 20–30 receipt photos with the phone: half sharp, half blurry, in mixed light. Put them in `sharp/` and `blurry/` folders outside the repo (receipts carry personal data).
- [ ] Run `backend/.venv/bin/python -I scripts/calibrate-device-blur.py --photos DIR`. (Another way: scan the receipts in the app and keep the labeled `[FrameQuality]` lines from the Metro log.) Set `DEVICE_BLUR_THRESHOLD` from its report, and update its test. (launch-open-items §3)
- [ ] With the new threshold, check the blur warning again on a sharp and a blurry receipt.

## 3. Push notifications

Push needs the development build. Expo Go has no remote push.
- [ ] A budget 80% alert arrives within 5 minutes of the confirm that crosses it. (13 Push, BC-03)
- [ ] A 100% alert arrives with the right overage amount. (13 Push, BC-03)
- [ ] **Only the current period alerts.** Confirm a receipt dated last month that takes last month past 100%. No push arrives. A receipt dated today that crosses a threshold does push. Near midnight, a receipt dated your local today still alerts. (M5, PR 40)
- [ ] The weekly summary arrives on the configured day and time. (13 Push)
- [ ] Tapping a notification opens the right screen. (13 Push)
- [ ] A threshold turned off in Settings → Notifications doesn't fire. (13 Push)

## 4. Offline, server errors and quota

Real airplane mode is the reason these need a phone. The Simulator can't toggle it.
- [ ] Capture a receipt in airplane mode. It shows under Pending. (13 Offline)
- [ ] Turn airplane mode off. The queued receipt uploads without reopening the app. (13 Offline)
- [ ] The budget updates after the sync. (13 Offline)
- [ ] Several offline receipts sync in order. (13 Offline)
- [ ] **Retry Now.** With the server down, a queued receipt shows "waiting to upload" with Retry Now. Start the server and tap Retry Now: it uploads at once. (13 Server errors; not run anywhere yet)
- [ ] **Camera scan at the quota** shows "Monthly scan limit reached", and nothing appears under Pending. (13 Server errors; not run anywhere yet)
- [ ] **An offline receipt that hits the quota on sync.** Its Pending row says "Monthly scan limit reached", and tapping it offers Enter manually or Discard. It doesn't retry. (13 Server errors; not run anywhere yet)

To reach the quota, the account needs `free_tier_receipts_per_month` receipts (default 20) created this calendar month. Manual entries count.

## 5. Account deletion (App Store 5.1.1(v))

- [ ] **Sign in with Apple, full path.** Sign up with Apple, then Delete and confirm. The Apple sheet asks for Face ID, and the account is deleted. iOS Settings → [your name] → Sign in with Apple no longer lists Grocery Genie. A server log line `apple revoke failed` means the revoke didn't happen. (13 Deletion)
- [ ] **Other Apple ID.** At the Apple sheet, choose the Apple Account that isn't linked. Expected: "That's a different Apple ID from the one this account uses." The account stays. (13 Deletion)
- [ ] **Apple unreachable.** Set Network Link Conditioner to 100% loss, then confirm with Apple. Expected: "We couldn't reach Apple. Try again in a moment." The account stays. (13 Deletion)
- [ ] **Push after deletion.** Turn on alerts, then delete the account. No later push arrives for it. Sign up again on the same phone, and a budget alert arrives for the new account. (13 Deletion)
- [ ] **Connection lost during the delete.** Turn on airplane mode right after tapping Delete account in the alert. If the server finished the delete, the next launch opens Welcome. If it didn't, the account still works. (13 Deletion)
- [ ] **A receipt in Pending when the account is deleted** leaves the queue with its photo. Another account's Pending receipt on the same phone stays. (13 Deletion; not run anywhere yet)

## 6. Navigation and refresh

- [ ] **Back button after a push over the tabs (H3).** Budget → See 3-month trend → Back → See 3-month trend → Back: both return to Budget. Repeat with Top items, and with History → a receipt. Edge-swipe back, and release an edge swipe halfway, then tap Back. Afterwards the tab bar and the History rows still respond. These passed on a Simulator debug build; the phone is the proof launch-open-items asks for. (H3, 13 Native Back button)
- [ ] **Swipe to delete (L6).** On a native build, swipe a History row left: Delete shows and the row slides back when released early. Tap Delete, confirm, and the receipt moves to Recently Deleted. This is the first native build with `react-native-gesture-handler`; the Simulator check ran in Expo Go. (L6, PR 42)
- [ ] **Pull-to-refresh (M9).** Confirm a receipt, then go back to Budget: no spinner sticks. Pull down on Budget, and on History: the spinner shows, then stops. Pull with the server down: the spinner stops, and the screen keeps the data it had. (M9, PR 40; the stuck spinner was never reproduced, so this is the only proof)

## 7. Accessibility

The Simulator has no VoiceOver, and Accessibility Inspector doesn't count.
- [ ] VoiceOver reads every screen in a logical order. (13 Accessibility)
- [ ] On Review, VoiceOver reads each field's label and value, and the low-confidence "verify" tags. (13 Accessibility, RC-02)
- [ ] The dashboard charts give their summary to VoiceOver. (13 Accessibility)
- [ ] Every button has a clear label. (13 Accessibility)
- [ ] Account deletion: VoiceOver reads the erased list in order, announces "Delete account, button", reads the alert's two choices, and announces the "not deleted" error. (13 Deletion)
- [ ] The largest Dynamic Type size doesn't break any layout. (13 Accessibility)

## After the session

- Tick what passed here, with the date, device, iOS version, and build. Write down anything that failed as a new item in `launch-open-items.md`.
- Tick H3 in `launch-open-items.md` §4 once section 6 passes.
- Commit the new `DEVICE_BLUR_THRESHOLD` with its test.
