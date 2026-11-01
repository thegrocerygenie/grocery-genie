# Plan: edge detection with Apple's document scanner (RC-01 AC 1, AC 3)

**Status: ready once the three product decisions in §2 are made.**
Written 2026-11-01 on `main` at `c9aa32f`. Decided on 2026-10-28 (design-alignment handoff, decision 1): use `VNDocumentCameraViewController` through a community Expo module, in a native build. This plan is the "plan first" that decision asked for. It covers every step the 2026-10-29 DoD audit listed.

## 1. What changes, in one paragraph

The Scan tab stops drawing its own camera. When the tab opens, the app presents Apple's document scanner: live edge detection, auto-capture, perspective-corrected crop, and its own retake and review. The page that comes back goes through the existing path: offline check, `scanReceipt` upload, the processing overlay, Review. Everything around the camera stays: the AI-consent gate, the permission and library fallback, the offline queue, analytics. Where the scanner can't run (Expo Go, the iOS Simulator, a device where `VNDocumentCameraViewController.isSupported` is false), today's `expo-camera` screen stays as the fallback, so the dev loop and the Jest suite keep working.

This closes RC-01 AC 1 (edge-detection overlay) and AC 3 (retake before submit). It changes how AC 2 (blur and light feedback) is met; see decision A.

## 2. Decisions needed first

**A. Blur and low-light feedback (RC-01 AC 2), the main one.** The scanner has no hook for pre-capture hints, so `useFrameQuality`'s pill can't run inside it. Options:
1. *(Recommended)* **Move AC 2 to after capture, and amend the PRD.** The scanner handles light itself (it exposes for the page, and has a flash control), and its auto-capture waits for a steady page (to confirm on a device). The backend already rejects a blurry or dark image with a 422 (`assess_image_quality` in `backend/app/image/preprocessor.py`, called from `POST /api/receipts/scan`), which the app shows as "hold steady" and a retake. Add a check on the device before upload, reusing the `frameQuality` scorer the live pill uses today, so the retake prompt comes in under a second and works offline. Reword AC 2 to "image quality feedback before submission".
2. Keep the custom screen's live pill and add our own edge detection to it (Vision `VNDetectRectanglesRequest` through a frame processor). Much more work, and it rebuilds what the scanner does.
3. Show the old camera screen first with hints, then hand off to the scanner. Two cameras in a row; poor UX.

**B. Multi-page output.** The scanner lets the user add pages; the backend links no pages (DoD box 9, "multi-page receipts: not met").
1. *(Recommended)* **Keep the first page.** `VNDocumentCameraViewController` has no page limit on iOS, so the app can't stop a second page. When a scan returns more than one, send the first and say "Only the first page was kept. Scan each page as its own receipt." Multi-page linking stays its own item.
2. Stitch pages into one tall image on the device. Long receipts are the case the scanner helps most, but a tall stitched image may hurt extraction, and the harness has no long-receipt ground truth to tell.

**C. Where the fallback camera lives.** The fallback keeps Expo Go and the Simulator usable, but it is a second capture path to maintain.
1. *(Recommended)* **Keep `expo-camera` as the fallback**, unchanged except for copy, behind one `isDocumentScannerAvailable()` check.
2. Drop it: Scan opens the library picker where the scanner can't run. Simpler, but the Simulator could no longer exercise capture, and every Simulator-based check (`verify-grocery-genie`, the iOS Simulator tool) loses the camera path.

## 3. The module

**Use `@dariyd/react-native-document-scanner` 2.2.0** (MIT, released 2026-10-27). Researched 2026-11-01 from each package's npm source; nothing was built, so step 1 must prove it on Xcode 27.

| Package | Latest | Why not / why |
|---|---|---|
| **`@dariyd/react-native-document-scanner`** | 2.2.0, 2026-10-27 | **Chosen.** Most active (3 open issues, the maintainer replies), smallest, TurboModule (RN ≥0.77.3). Handles a 0-page scan safely (`images: []`). `quality` and `maxWidth`/`maxHeight` control upload size. No Expo plugin needed: it autolinks, and `NSCameraUsageDescription` is already set for `expo-camera`. |
| `react-native-document-scanner-plugin` (websitebeaver) | 2.0.4, 2026-01-02 | 48 open issues with no replies, and an open crash: `0...scan.pageCount - 1` traps on a 0-page scan (`ios/DocScanner/DocScanner.swift:126`, issue #184). |
| `@preeternal/react-native-document-scanner-plugin` | 0.4.3, 2026-09-26 | **Fallback.** A fork that fixes that crash, but one maintainer, 11 stars, and more code to break on Xcode 27. |
| `expo-document-scanner` | 1.0.0, 2026-10-27 | First release; adds a Nitro dependency. |
| vision-camera + a document plugin | — | Frame processors, not Apple's scanner: no built-in crop, review or retake. |

What the choice means for the build:
- **Scenes are fine.** It presents with `RCTPresentedViewController()` (`ios/DocumentScanner.mm:192`), which in RN 0.81.5 walks `connectedScenes` for the foreground scene, so it works with `plugins/ios-scene-lifecycle`. It returns nil when no scene is in the foreground, so only present while the app is active (a focused Scan tab is).
- **Turn its location code off.** It compiles CoreLocation in by default, which brings App Store warning ITMS-90683. The podspec reads `ENV['RNDS_DISABLE_LOCATION'] == '1'` at `pod install`. Set it with a small config plugin that writes the line at the top of the generated Podfile, so EAS builds and `make mobile-ios-native` both get it, with a prebuild test, as `withPodsMinDeploymentTarget` has.
- **Always pass `quality` below 1** (0.8). At 1 it writes PNGs, which are large uploads. Cap `maxWidth`/`maxHeight` at about 2000 px, inside the backend's upload limit and above its 300 px minimum.
- **Its API is callback-based.** Wrap it in a promise in `documentScanner.ts`.
- **Risk:** one maintainer, an unexplained iOS build report on RN 0.79 (issue #8), and no confirmed Xcode 27 build. If step 1 fails, switch to the Preeternal fork; the `documentScanner.ts` wrapper keeps the rest of the plan the same.

## 4. Steps

Each step ends green on `make validate`. Steps 1–2 can merge before the screen changes.

### Step 1. Native module and build (S–M)
- `npx expo install @dariyd/react-native-document-scanner`. It has no config plugin; `NSCameraUsageDescription` is already set (check the wording still fits).
- Add `plugins/withDocumentScannerNoLocation.js` (see §3), with a test.
- `npx expo prebuild --clean` must still need no hand edits, with `plugins/ios-scene-lifecycle` and `withPodsMinDeploymentTarget` in place. Build with `make mobile-ios-native`.
- **Prove it on a device first:** present the scanner from a native build on iOS 27 before any screen work. The source reads as scene-safe (§3), but nobody has built it with Xcode 27.
- Add `src/features/receipt-capture/services/documentScanner.ts`: `isDocumentScannerAvailable()` (false in Expo Go via `ExecutionEnvironment.StoreClient`, as `socialSignIn.ts` does, and false when the native module is missing) and `scanDocument(): Promise<{ uri: string } | 'cancelled'>`, lazy-requiring the module so Expo Go never loads it.

### Step 2. On-device quality check (S, if decision A.1)
- Split `sampleFrame` (`services/frameSampler.ts`) into the photo-taking part and a `scoreImage(uri, width, height): Promise<FrameVerdict>` that crops, decodes and scores. The fallback's live pill keeps calling `sampleFrame`; the scanner path calls `scoreImage` on the scanned page and shows the existing `QUALITY_HINTS` copy with a Retake button before anything uploads (verdicts `blurry`, `dark`, `bright`). Calibrate against scanned (cropped, flattened) pages, which score sharper than raw photos; `DEVICE_BLUR_THRESHOLD` (900, a guess) needs its own number here.
- Tests: sharp, blurry and dark fixtures through the pure scorer.

### Step 3. The Scan screen (M)
Split `app/(tabs)/scan.tsx` (596 lines) so the scanner path and the fallback share everything but the camera:
- `useScanSubmission` hook: the offline check, `queuePhoto`, `scanMutation` with the consent and retry branches, `scanSubmitted`. Moved, not rewritten, from `onShutter`.
- `DocumentScannerCapture`: on focus (`useFocusEffect`), present the scanner. On a result: no pages is a cancel; more than one keeps the first (decision B); then the quality check, then submit, showing the existing `ProcessingOverlay`. On cancel: `router.back()` (the same exit as Cancel today) and no upload.
- `CameraCapture`: today's camera, brackets, pill and shutter, unchanged.
- Keep, in front of both: the AI-consent gate, the permission screen with Choose from Library, the hidden tab bar, the import overlay.
- Pill copy (L1): the scanner draws its own UI, so the pill shows only in the fallback; nothing changes there.

### Step 4. Analytics (S)
- `receipt_scan_started` is emitted by the server from `source`; send `source: 'camera'` from both paths, so dashboards don't split.
- `receipt_abandoned {stage: 'capture'}`: fire when the user cancels the scanner without a page, and keep today's unmount rule for the fallback. A test for each.

### Step 5. Tests (M)
- Mock the module in Jest (`jest.mock` of `documentScanner.ts`).
- Scanner path: page → processing → Review; cancel → back, `receipt_abandoned`, no upload; offline → queued; 422 blur → retake prompt; consent refusal → consent screen; scanner unavailable → fallback camera renders.
- Keep `scanStates`, `scanOfflineQueue`, `scanTabBar` and `cameraPrivacyCopy` passing for the fallback (they mock `expo-camera`), and point the shared ones at both paths where the behavior is shared.
- RC-01 AC 1 and AC 3 tests: the scanner is presented on Scan focus where available; a cancelled scan uploads nothing (retake lives inside the scanner).

### Step 6. Docs (S)
- `docs/prd/01-receipt-capture.md` RC-01: AC 1 met by the system scanner; AC 2 as decided in A; record the decision.
- `docs/device-checklist.md` §2: replace the edge-detection line with scanner checks (opens on Scan, edges track a receipt on a busy table, auto-capture, retake, Cancel returns, one page kept, torch in a dim room, VoiceOver reads the scanner's controls); move blur calibration to scanned pages.
- `docs/launch-open-items.md` §4b and the design-alignment handoff: tick when merged.

## 5. Risks

- **The module on Xcode 27.** It reads as scene-safe but is unbuilt there, with one maintainer; step 1 proves it first, and the wrapper makes a swap to the fallback package cheap.
- **No page limit on iOS.** Users can scan several pages; decision B handles it, but expect support questions until multi-page linking exists.
- **Expo Go and the Simulator can't show the scanner.** Only a device proves the main path; the device pass (launch §3) has to include it.
- **Extraction on scanned pages.** Cropped, flattened, contrast-boosted pages should read better, but nothing proves it yet. Once the receipt test set exists, add a few scanner-captured receipts to it.
- **Accessibility.** The scanner's own UI is Apple's; we can't label it, only check it with VoiceOver.

## 6. Size

About 3–4 days of code: step 1 half a day to a day (more if the module has to be swapped), steps 2 and 4 half a day together, step 3 a day, step 5 a day, step 6 an hour. Plus a device session.
