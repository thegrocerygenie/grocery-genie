# Device checklist

Every check that still needs a real iPhone, in one place. Work from this list in the first device session, and tick items here. Each item names where it came from.

Collected on 2026-10-28, with main at `2edc8d5` (after PR 40). Sources:
- the Manual Test Checklist in [13-validation-strategy.md](prd/13-validation-strategy.md) (unticked items);
- [launch-open-items.md](launch-open-items.md) §1, §3 and §4;
- PR 39 (the import picker after AI consent) and PR 40 (M3, M5, M9).

Items the Simulator already passed are not repeated here. The Simulator notes in `13-validation-strategy.md` say which ones those are.

## Before the session

The build:
- [ ] Run `make install-mobile`. It applies the patches (react-native-screens for H3, `@expo/cli` for Xcode 27). Without it, a native build ships without the H3 fix.
- [ ] Make a development build, not Expo Go. Expo Go can't load the react-native-screens patch, has no remote push, and hides the Google Sign-In button. Run `npx expo prebuild --clean`, then build with Xcode and code signing for the phone. There is no `eas.json` yet, so EAS can't make the build.
- [ ] Build from `dc3bb2c` or later, so the build has PR 39 (the picker after AI consent).

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

**Document scanner** (RC-01, `.planning/PLAN-2026-11-01-document-scanner.md`). Only a native build on a phone shows it; Expo Go and the Simulator show the fallback camera.
- [ ] **It opens.** Open Scan: Apple's document scanner appears, not the custom camera. Open Scan again from another tab: it appears again. If nothing appears, the module couldn't find the foreground scene; note the iOS version.
- [ ] **Edges.** On a busy table, the scanner outlines the receipt and follows it as you move the phone. (13 Camera, AC 1)
- [ ] **Capture and retake.** It captures automatically, or with its shutter. Retake inside the scanner works before you tap Save. (13 Camera, AC 3)
- [ ] **Cancel.** Cancel in the scanner returns to the previous tab, and nothing uploads.
- [ ] **A good page.** Save a clear receipt: Reading receipt…, then Review, with the cropped, straightened page.
- [ ] **A blurry page.** Scan a receipt while moving the phone, or with a finger over the lens, and Save. "Image looks blurry — hold steady" shows over the page, with Retake and Use Scan. Retake opens the scanner; Use Scan uploads.
- [ ] **A dark room.** Scan with the lights off and flash off. "Too dark — find more light" shows. Then scan with the scanner's flash on.
- [ ] **Two pages.** Scan two pages and Save. "Only the first page was kept…" shows, and Use Scan uploads page one.
- [ ] **Offline.** In airplane mode, scan and Save: "Saved · will upload automatically", and it uploads when you reconnect.
- [ ] **VoiceOver.** The scanner's own buttons are read (Apple's labels). Back in the app, the warning is announced, and Retake, Use Scan and Scan are read as buttons.
- [ ] **Release build.** Check the App Store build's warnings: no ITMS-90683 (location purpose string). `plugins/withDocumentScannerNoLocation.js` builds the scanner without CoreLocation.

**Fallback camera** (Expo Go and the Simulator). Check these on a phone in Expo Go:
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

**Blur calibration.** `DEVICE_BLUR_THRESHOLD` in `mobile/src/features/receipt-capture/utils/frameQuality.ts` is still 900, a guess. It now judges two kinds of image: the fallback camera's raw frames, and the scanner's cropped, flattened pages, which score sharper. Calibrate on scanned pages first, since that is the main path. If one number can't serve both, split the threshold.
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
- [ ] A threshold turned off in Settings → Alerts doesn't fire. (13 Push)

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
- [ ] Sheets: open the capture sheet (Scan), the category picker (Review, a category dot) and the day picker (Settings, Notifications). VoiceOver reaches each option on its own, and a two-finger scrub closes the sheet. Each sheet read as one element before the accessibility sweep fix. (13 Accessibility)
- [ ] Touch targets: on a small phone, tap Review's category dot, item name and price, and the Cancel, Done and Skip header buttons. Each responds on the first tap. `accessibilitySweep.test.ts` checks the 44pt rule in code; this checks it on glass. (14 Touch targets)
- [ ] Account deletion: VoiceOver reads the erased list in order, announces "Delete account, button", reads the alert's two choices, and announces the "not deleted" error. (13 Deletion)
- [ ] The largest Dynamic Type size doesn't break any layout. (13 Accessibility)

## 8. V1.1: Price Intelligence and Premium

Added 2026-11-04 for the V1.1 Definition of Done in [13-validation-strategy.md](prd/13-validation-strategy.md). The Simulator check of 2026-11-03 (`.planning/DEVICE-CHECK-2026-11-03.md`) passed the layouts below on an iPhone SE and a Pro Max, but not VoiceOver focus order, purchases, or real push.

**Simulator pass, 2026-11-06** ([.planning/DEVICE-CHECK-2026-11-06.md](../.planning/DEVICE-CHECK-2026-11-06.md), `main` at `eecff9d`, iPhone SE Simulator, not a phone). It walked the items below against the design in light, dark and AX5, and rechecked BUG-1, 2, 3, 5, 6, 8 and 9 (all pass; BUG-6 routed in 4 of 5 cold starts). Read the items below as "the layout, data and flow passed on the Simulator; what is left is what a phone adds". Those leftovers are collected in "Device-only remainder" at the end of this file. Tick an item here only after the phone run.

Setup for this section:
- [ ] A build with `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` set, and the App Store Connect products and a Sandbox Apple Account. Without the key the paywall shows the App Store notice and hides Subscribe and Restore.
- [ ] The backend has `GG_REVENUECAT_WEBHOOK_SECRET` and `GG_REVENUECAT_API_KEY`, and RevenueCat's webhook points at it.
- [ ] Test data: an item with prices at two stores (two each), a third price 10% or more from the average, and a "Bananas" line after "Organic Bananas".

**Premium (V11-P0, D1, D2):**
- [ ] **Sandbox purchase.** As a free user, open the paywall, tap Subscribe and buy with the Sandbox account. Settings → Premium then reads Premium, and the server's profile says `is_premium: true`. (PHASE_SCOPE D1; DEVICE-CHECK D6)
- [ ] **Restore.** Delete and reinstall the app, sign in, open the paywall and tap Restore purchase: Premium comes back. (DEVICE-CHECK D5)
- [ ] **Webhook test event.** In RevenueCat, Project settings → Integrations → Webhooks, tap "Send test event". The backend answers 200. (V11-P0)
- [ ] **Paywall.** Free user: the title, what Premium unlocks, the App Store price, Subscribe, Restore, and the Terms of Use and Privacy Policy links, each 44 pt. Premium user: "You're on Premium" with the renewal date and Manage Subscription. (DEVICE-CHECK D2, D4)
- [ ] **Settings → Premium.** Free: "Free plan · Upgrade" opens the paywall. Premium: the row reads Premium. (DEVICE-CHECK D1)
- [ ] **Free trial (after DA-1).** With a Sandbox account that has never subscribed, the paywall reads "Start 7-day free trial" for Yearly and for Monthly, with the price billed after it. Start the trial on one: Premium turns on, and the server's profile says `is_premium: true`. Cancel it in the Sandbox settings: Premium stays until the trial ends. A Sandbox account that has used its trial sees "Subscribe". (PREM-01 AC 2, 5; 11-edge-cases Premium 1)
- [ ] **Plan switch (after DA-1).** As a monthly subscriber, switch to Yearly in iOS Settings → Subscriptions (or back). Premium never drops, and `premium_product_id` on the server becomes the new product once it starts. (PREM-01 AC 5; 11-edge-cases Premium 2)

**Price alerts and comparison (PI-03, PI-04):**
- [ ] **Push tap, foreground.** With the app open, confirm the receipt that moves the price. The banner arrives; tapping it opens the item. (PI-03 AC 2; DEVICE-CHECK C4)
- [ ] **Push tap, background.** Same, with the app in the background. (PI-03 AC 2)
- [ ] **Push tap, cold start.** Force-quit the app, then tap the banner. The item opens, and Back returns to Budget. (PI-03 AC 2; BUG-6)
- [ ] **Price alerts list (DA-4).** Open it from the bell on the Budget dashboard (VoiceOver: "Price alerts") and from Settings → Alerts. Alerts run newest first under "This week" and "Earlier"; a rise has a red up arrow and "+N%", a fall a green down arrow, "−N%" and "stock-up worth it" under "<Store> · was $X avg, now $Y"; each row has its sparkline, and tapping one opens the item with Back reading "Price alerts". With no alerts it says "No price alerts yet" and the threshold. The Settings group at the end: pick a Cooldown (1, 3, 7, 14 or 30 days, the default marked) and a Threshold; each saves, and the footer reads "Cooldown: N days · alerts at ≥T% change" with the new values. (PI-03 AC 5–9)
- [ ] **Alerts screen (DA-7).** As Premium, item detail's Alerts row reads "On" and pushes the Alerts screen, whose Back names the item. Every switch on means alerts on: "Price alerts" under Item-level ("For <item> across all stores") and one per store under Per store, with "A store mute covers every item you buy there." and the footer "You'll still see price changes in the item detail — just no notifications." Turn the item switch off: the "Mute until" row appears under it; pick 1 week from its sheet (Forever, 1 week, 1 month, 3 months), and the Alerts row on item detail reads "Muted until <date>". Turn one store off: the "Mute until" sheet asks first; pick Forever. Relaunch: both switches stay off. A new price change at that store, on any item, sends no push. A free user turning a switch off gets the upgrade prompt and the switch stays on. (PI-03 AC 4, 10, 13; PREM-02 AC 5; DEVICE-CHECK C2)
- [ ] **Compare stores.** As a Premium user with an item bought at 2 or more stores at different prices, item detail's Compare stores starts with the "Save by switching" card: the gap as "$X / unit" (or "/ lb"), and "cheapest store vs. priciest store". Each row leads with its latest price on the right, "N purchases · avg $X" under the store name, the store's square, and a bar in the store's colour below; rows run from the cheapest latest price, and only the first has the CHEAPEST badge. Stores at the same latest price show no card. It still says how many stores need more prices. With VoiceOver each row reads as one element (store, cheapest, latest, average, purchases); at AX5 on the SE nothing is cut off and the price sits under the name. A free user sees the upgrade prompt instead. (PI-04 AC 4–8, EC-PI 10; DEVICE-CHECK C1)
- [ ] **Threshold picker.** Settings → Alerts: pick 25%, then "10% (default)". Each choice saves, and the line under it says what size of change sends an alert. (PI-03 AC 1; DEVICE-CHECK C3)
- [ ] **Unmute rows.** The muted item and store are listed in Settings → Alerts, the item with "Until <date>" and the store with "Forever". Turn on Airplane Mode and tap Unmute: the row stays and says "Couldn't unmute. Check your connection and try again." Turn it off and tap Unmute again: the row leaves the list, and the switch on the Alerts screen is on again. (PI-03 AC 4, 14; DEVICE-CHECK C3)
- [ ] **Item detail range and headline (DA-3).** On an item with prices over several months, the chips 1M, 3M, 6M, 1Y and All sit under the chart, 3M selected (or the smallest range that has 2 prices); each tap redraws the chart over its shaded area with month labels and a dot per purchase, and the price list still shows every price. A range with fewer than 2 prices says "Not enough prices in this range". The headline reads "Avg · 30d" with the unit and a red "+N%" or green "−N%", and "as of <date>" when the latest price is over 30 days old. Store rows lead with their coloured square. At AX5 on the SE the chips wrap or scroll and no price is cut off. (PI-01 AC 5–10)
- [ ] **"Same item?" prompt (DA-5).** Confirm a receipt with a line that half-matches an item: once the confirm succeeds, the full-screen "Same item?" opens with "From today's receipt" (line, store, date), the "N% match", and the "Existing item" card (purchases, stores, "Avg unit price"); with several it says "1 of 3". Try each button: Yes, merge (the prices join), Keep as separate item, Skip (the next one; this stays pending), Cancel (closes; the rest wait on Review Matches). It opens the same from Review Matches and from item detail's pending suggestion. In Airplane Mode, Yes, merge keeps the prompt open and says it couldn't save. (PI-02 AC 5–9; EC-PI 7)
- [ ] **Split (DA-6).** On an item whose unit price varies a lot, item detail shows "We grouped these as one item but the unit price varies a lot…"; tap Split. "Split into 2 items" lists the original ("N purchases · $X avg") and its lines (date, store, unit price). Move one line of several that share a receipt name, name the new item, tap "+ Add another split" ("Split into 3 items") and fill it too; Save stays off until each new item has a name and a line and the original keeps one. Save opens the first new item, with its moved price. An item with one purchase offers no Split. (PI-02 AC 10–13; EC-PI 6)
- [ ] **Link items sheet (DA-6).** From item detail, Link items opens the modal sheet: "Pick an existing item to merge "<name>" into.", a search field, "Suggested" then "All items", each row with a radio and "N purchases · $X avg", and never the item itself. Type to search (it waits for a pause); pick a row, tap Link, and the native "Merge … into …?" confirm (Cancel, Merge) merges them. Cancel closes the sheet and changes nothing. (PI-02 AC 15)

**Trend, categories, export, rollover, quota (BC-FR, BC-05 AC 3, NFR Privacy 2):**
- [ ] **Trend range chips.** The chips 1M, 3M, 6M, 1Y and All sit under the chart, 3M selected by default. The headline reads "N-month average" with its change ("YoY" on 1Y, none on All). Bars are grey with the current month in green, each labelled with its month's letter. Highlights lists Highest, Lowest (never a month with no spending or the current month; "No finished month with spending yet" when none is left) and Trend with the headline's percent (none when the headline has none; on All, later half against earlier half). A Premium user's 6M, 1Y and All show 6, 12 and every month since the first receipt (All scrolls sideways past 12). A free user's 1M and 3M work; 6M, 1Y and All show the upgrade prompt (no error, no Highlights), and its button opens the paywall. (BC-04 AC 6–9; DEVICE-CHECK A1–A3, D3)
- [ ] **Settings → Categories.** Premium: add, rename and delete a category; at 10 the add button is disabled and says why. Free: the upgrade prompt, not an add button. (BC-05 AC 3)
- [ ] **Category editor sheet.** Match the category editor sheet (name, colour, icon) to the design once it exists; the design export has none yet, and the user will design it. (BC-05 AC 5, DA-9)
- [ ] **Data export.** Settings → Export data, as Premium: the share sheet opens with the file, and saving it to Files works. As free: the upgrade prompt. (NFR Privacy 2)
- [ ] **Export options (DA-8).** Settings → Export data opens with the intro card and Range on Last 12 months; try All time, This year and Custom (From and To months): the button reads "Export N receipts" with the count for each, and a range with none disables it and says "No receipts in this range". Format: CSV, JSON and PDF report each export. Open the PDF report from the share sheet (Quick Look or Files): it shows monthly spend by category, the top items and the receipt list, and a section whose Includes switch is off is left out. Includes: the last switch on cannot be turned off. With Receipt images on, the file is a zip whose `images/` folder holds each scanned receipt's image (none for a manual receipt). (PREM-04 AC 1–5, 8)
- [ ] **Rollover.** Budget settings: turn rollover on for a budget and Save. The dashboard ring text says how much rolled over once a period has ended with money left. A free user sees the upgrade prompt instead of the switches. (BC-FR Rollover)
- [ ] **Receipt quota prompt.** As a free user at the monthly receipt limit, scan: the prompt offers Premium, and nothing uploads. As Premium, the scan goes through. (D2, unlimited receipts)

**Item matching and stores (PI-02, store normalization):**
- [ ] **Review Matches.** Confirm "Organic Bananas", then "Bananas". Review Matches lists the pair ("N% match"); neither links on its own. Its Review button opens the "Same item?" prompt: Keep as separate item keeps two items; Yes, merge merges their prices; Skip and Cancel leave it on the list. (PI-02 AC 2, 6, 7; BUG-4)
- [ ] **Settings → Stores.** Branch numbers ("Loblaws" and "Loblaws #1234") show as one store. Merge one name into another (for example "REAL CANADIAN SUPERSTORE" into "Loblaws"): an item bought at both now compares as one store. Unmerge splits them again. Only this account's prices regroup. (11-edge-cases Price Intelligence 1; V11-05, decision D3)

**Waitlist offer (PREM D5, V11-P5):**
- [ ] **Claim screen.** With an account whose email is not on the waitlist, Settings → "Claim your waitlist offer" ("A free year of Premium") opens the Waitlist offer screen: the intro, the "Waitlist email" field, "Claim it by <date>" and Send link. Send a waitlist email: "Check your inbox" says a link was sent if it is listed, the same for an unlisted email, and "Use a different email" goes back. A bad address says to enter the email you joined with. An account already granted sees "Your free year is on" with its end date instead. (PREM D5)
- [ ] **Claim link.** Tap the emailed link on the iPhone: the app opens "Claiming your free year…", then "Your free year is on" with Continue, and Settings → Premium reads Premium. Tap the link again, or one older than 24 hours: "Couldn't claim the offer" with the reason (already has its free year, or invalid or expired). (PREM D5)

**Priority OCR (PREM-03 AC 6, decision D9):**
- [ ] **Premium model accuracy, before it is switched on in production.** With `GG_LLM_API_KEY`, `GG_LLM_PREMIUM_EXTRACTION_MODEL` set to the chosen model, and the real receipt set's images in place, run `/validate-extraction` (from `backend/`: `.venv/bin/python -m tests.llm_validation.run extract`, then `... extract --premium`). The Premium run's field accuracy and item recall are no lower than the default run's, hallucination is 0%, and both reports' `tokens_per_scan` give the cost per scan (`docs/DEPLOYMENT.md` Part 3, Priority OCR model). Commit both reports; the product owner approves the model and cost before production sets the variable.

**Device-check bug rechecks (`.planning/DEVICE-CHECK-2026-11-03.md`):**
- [ ] **BUG-1.** At AX1 and AX5, Trend's bar amounts (1M, 3M) stay clear of the average headline above the chart, the chips wrap instead of clipping, and the Highlights rows wrap their month and amount instead of truncating.
- [ ] **BUG-2.** At AX5, the month-over-month change wraps under the total, on the SE.
- [ ] **BUG-3.** At AX5 on the SE, the Items list and item detail keep names and prices readable; "$4.79" stays on one line.
- [ ] **BUG-5.** The "Items" large title is drawn.
- [ ] **BUG-6.** A price alert tapped from a cold start opens the item with Back to Budget (also above).
- [ ] **BUG-8.** With VoiceOver on Trend's 1Y range, swiping reads the bars in month order, each as its month and total, then the chips (the selected one says so), then Highlights row by row.
- [ ] **BUG-9.** At AX5 on the SE, the 12 month letters on 1Y stay readable and apart; on All past 12 months the chart scrolls sideways with every letter readable.

**Accessibility on each new screen:**
- [ ] **VoiceOver** reads, in a logical order: Items, item detail (range chips with the selected one, "Avg · 30d" headline, chart summary, Alerts row, Compare stores), the Alerts screen (switches with their state, Mute until and its sheet), Review Matches, the "Same item?" prompt (Yes, merge / Keep as separate item / Skip / Cancel), Split (lines, name fields, Add another split), the Link items sheet (search, rows with their radio state, Link), the Price alerts list (rows, Threshold, Cooldown) and the Budget bell, Trend (bars, chips, Highlights), Settings → Alerts (threshold, muted rows with Until or Forever, Unmute), Settings → Categories, Export data (Range, Format, Includes switches, Export N receipts), Budget settings (rollover switches), the paywall, Settings → Premium, the Waitlist offer screen and the claim link screen, and Settings → Stores (merge, unmerge, the store picker). Every control reads as a button or switch with its label and state. (13 Accessibility)
- [ ] **Dark mode** on each of those screens, the design-alignment ones too (the Alerts screen and its Mute until sheet, the "Same item?" prompt, Split, the Link items sheet, the Price alerts list, the item detail range chips and headline, Trend, Compare stores, Export data's options, the Waitlist offer and claim link screens): text, charts, the red and green percents and the store squares keep their contrast, and nothing is drawn black on black. (13 Accessibility)

## Device-only remainder (after the 2026-11-06 Simulator pass)

What the Simulator could not prove, so a phone must. The Simulator already passed the layouts, data and flows of §8 and BUG-1, 2, 3, 5, 8, 9 (details in [.planning/DEVICE-CHECK-2026-11-06.md](../.planning/DEVICE-CHECK-2026-11-06.md)). Do these in the device session.

**Needs keys, products or a real service**
- [ ] **Sandbox purchase, Restore, Free trial, Plan switch** (§8 Premium). Needs `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, the App Store Connect products and a Sandbox Apple Account. Without the key the paywall has no plan cards, Subscribe or Restore, so the paywall's purchase layout (plan cards, "Start 7-day free trial", the trial and price wording) has not been seen at all. Compare it with the design when the key is set.
- [ ] **Webhook test event from the RevenueCat dashboard** against a deployed backend. The local backend already answers a signed `TEST` event with 200.
- [ ] **A real push through Expo's service** to a device token: budget and price-change alerts arriving, the banner, and the tap. Needs the EAS project ID (`registerForPush` returns early without it) and a Celery worker with beat. The tap routing is already proven with `simctl push` (foreground, background, cold start).
- [ ] **Waitlist claim from a delivered email.** Needs a waitlist entry and Resend delivery: tap the link on the phone and reach "Your free year is on", then tap it again. The invalid-link state and the "Check your inbox" state are proven.
- [ ] **Priority OCR accuracy run** (§8 Priority OCR): `/validate-extraction` with `GG_LLM_API_KEY` and the premium model. Not a phone check, but it needs someone with the keys.

**Needs the camera, the library or real time**
- [ ] **Receipt quota prompt** as a free user at the monthly limit, by scanning (camera or import), and the Premium scan going through.
- [ ] **Rollover's carried amount** on the dashboard ring, once a period has ended with money left. The switch saves; the carried text needs a month boundary.
- [ ] **PDF report** opened from the share sheet (Quick Look or Files): monthly spend by category, top items and the receipt list, with an Includes switch off leaving its section out. The Simulator showed the share sheet and a ZIP, not the PDF, and its Includes taps did not register. Also run "No receipts in this range" (a range with no receipts disables Export) and the rule that the last Includes switch cannot be turned off, and save a file to Files.
- [ ] **Free user's upgrade prompt on a mute switch** (turn a switch off on the Alerts screen), and the free Trend 6M, 1Y and All prompt with its button opening the paywall. The prompts for Compare stores, Categories and Export data were seen.
- [ ] **"Not enough prices in this range"** on item detail, "Add another split" (3 items), a one-purchase item offering no Split, Cancel on "Same item?", renaming a category, and the Price alerts "No price alerts yet" state. Not reached on the Simulator with its data; cheap to run with the test data of this section.

**Needs VoiceOver itself** (the Simulator checked the accessibility tree: every control has a label, and no control is unlabelled on any V1.1 screen)
- [ ] **Swipe order and announcements** on each V1.1 screen listed under "Accessibility on each new screen", including: Trend's bars reading December to November (BUG-8; the tree order is right), the range chips naming the selected one, the Alerts switches reading their state after a change, the "Same item?" buttons, Split's lines, and the Link items sheet's radio state.
- [ ] **Announcements after a change:** after Unmute, after "Yes, merge", after Save on Split, and the error messages ("Couldn't unmute…", "That didn't save…").
- [ ] **Decorative symbols:** O3 and O8 in DEVICE-CHECK-2026-11-03 (icon names read before the text) are still open; check by ear.

**Needs the phone's real hardware or OS**
- [ ] **Touch targets on glass:** tap Trend's range chips on an SE (the Simulator's tree reported some at 40 pt; that reading was taken with other screens stacked underneath and was not confirmed). Header text buttons (Cancel, Save, Link, Rename, Skip) report about 20 pt frames, but iOS draws and hits a larger capsule; confirm by tapping.
- [ ] **Dark mode contrast by eye** on a phone panel for the screens captured in dark on the Simulator (all passed on the Simulator). Black text on the brighter dark-mode green (the Review button and Yes, merge) is deliberate; check it reads.
- [ ] **Dynamic Type AX5 on a phone** for the AX5 findings F3 to F6 in DEVICE-CHECK-2026-11-06 (Price alerts name truncation, mid-word breaks, clipped "Manage Subscription", Budget and Settings headers). Re-run after they are fixed.
- [ ] **Airplane Mode** versions of the offline checks. The Simulator stood in with the backend stopped: unmute and merge fail cleanly, but only a phone shows the real network stack.
- [ ] **Release build** warnings: no new ITMS warnings from the RevenueCat and document-scanner modules.

## After the session

- Tick what passed here, with the date, device, iOS version, and build. Write down anything that failed as a new item in `launch-open-items.md`.
- Tick H3 in `launch-open-items.md` §4 once section 6 passes.
- Commit the new `DEVICE_BLUR_THRESHOLD` with its test.
