# V1.1 device check, 2026-11-03

Manual checks of the merged V1.1 screens on the iOS Simulator. No app code was changed.

## What was tested

- **Mobile code.** `main` at `a8fbe37` (#89). Another session switched this checkout to `claude/deleted-user-push-and-refresh` at 14:25 and committed `0fa980a` at 15:01. That commit changes only backend files (`auth.py`, `push_tasks.py`, tests, docs), so the JS that Metro served is main's mobile code at `a8fbe37`.
- **Backend.** Started at 14:58 from the same checkout, `GG_DEBUG=true` (mock extractor and categorizer, real local embeddings), dev database at migration `20261104_0016`. The other session's backend edits touch account deletion, refresh-token reuse and Celery push delivery. No check below uses those paths.
- **App binary.** The Debug build from 2026-11-02 (`mobile/ios/build`). No native dependency changed between that build and `a8fbe37`, so the build loads current JS from Metro.
- **Devices.** iPhone SE (3rd generation), iOS 27.0, 375x667 pt. It did not exist, so I created "GG iPhone SE (3rd gen)". iPhone 18 Pro Max, iOS 27.0, 440x956 pt.
- **Main moved during the check.** V11-P0 (#90, `643e857`) and later fixes (#91, #92, `c0f93a9`) merged while I worked. Origin/main is now `ef4cefe`. Checks A1, A2, A4, A5, B and C ran on `a8fbe37`. A3 and D ran on `ef4cefe` (see "Premium follow-up run"). #92 changes price chart spacing, so the item-detail chart may look different on current main.

### Premium follow-up run (A3, D)

After V11-P0 merged I ran A3 and D against `origin/main` at `ef4cefe`, in a separate worktree (`.claude/worktrees/device-check-p0`) so the shared checkout was left alone:

- A new native Debug build from that worktree, with `react-native-purchases` (RevenueCat) linked. Metro now serves this worktree, and both simulators run this build.
- A separate backend on port 8002 with its own database `gg_devicecheck`, migrated to `20261104_0017`, and Redis DB 2. It runs in debug mode with a random `GG_REVENUECAT_WEBHOOK_SECRET` kept in the worktree's gitignored `.verification/device/rc-webhook-secret`. No RevenueCat keys are set.
- A fresh user from `seed.sh`, plus one receipt a month from December 2025 to June 2026 (`tools/extra-months.sh`). Credentials are in `.verification/device/p0/test-user.env`.
- To make the user Premium, `tools/rc-event.sh` posts a signed `INITIAL_PURCHASE` webhook, as the `premium.md` journey does. The backend answered `{"status":"applied"}` and the profile became `is_premium: true` until 2026-12-03 (`p0/premium-grant.txt`).

### How VoiceOver was checked

The Simulator has no VoiceOver. A throwaway XCUITest runner attaches to the running app and prints its accessibility tree: element type, label, value and traits such as `Selected`. This is the data VoiceOver reads. The trees are saved as `*-ax.txt` next to the screenshots. Focus order, announcements after a change, and gestures still need a physical device.

### Test data

`tools/seed.sh` signs up a fresh user through the API and saves its credentials to `.verification/device/test-user.env` (gitignored, mode 600). It then creates 10 manual receipts from July to November 2026:

- Spend of $63.23 in September, $76.97 in October and $19.77 in November, plus July and August for the prior average.
- Large Eggs 12ct with 2 prices at Costco, 2 at Walmart and 1 at Target.
- Whole Milk 1 Gal at $4.00, $4.00, then $4.60. This fired the alert "Whole Milk 1 Gal price up 15%". Eggs also alerted, down 12%.
- Two pending matches: CHKN BRST vs Chicken Breast and Fage Yogurt 0% vs Greek Yogurt.

Later I added one probe receipt with five names to test matching, and created a second, empty user for empty states.

## Results

Screenshots and trees are in `.verification/device/`. File names start with `se-` or `pm-`.

| ID | Check | SE | Pro Max | Evidence | Notes |
|---|---|---|---|---|---|
| A1 | 3 / 12 toggle readable, 44 pt, 3 Months selected by default | Pass | Pass | `se-A1-trend-3m-default.png`, `pm-A1-trend-3m-default.png`, `se-A3-trend-3m-ax.txt` | Native segmented control, 343x44 pt on SE and 408x44 pt on Pro Max |
| A2 | 12 Months as a free user shows an inline prompt, summary and categories stay, no dead button | Pass | Pass | `se-A2-trend-12m-free-prompt.png`, `pm-A2-trend-12m-free-prompt.png` | "See your whole year". No upgrade button renders, because `onUpgrade` was not wired at `a8fbe37` |
| A3 | Premium 12-month chart: 12 bars and one-letter labels fit at SE width | Pass at default and XXXL, fail at AX5 | Pass | `se-A3-trend-12m-premium.png`, `se-A3-XXXL-trend-12m-premium.png`, `se-A3-AX5-trend-12m-premium.png`, `pm-A3-trend-12m-premium.png` | 12 bars, labels D to N, no overlap at default size. Each bar reads its full month and amount. BUG-8 (VoiceOver order) and BUG-9 (AX5 labels). Premium follow-up run |
| A4 | VoiceOver: toggle state, bar labels, prompt | Pass | Pass | `se-A2-trend-12m-ax.txt`, `se-A3-trend-3m-ax.txt`, `pm-A2-trend-12m-ax.txt` | Toggle reads `'3 Months', Selected`. Bars read "September: $63". The prompt reads its title, then the message. Accessibility tree only, see above |
| A5 | Dynamic Type at a large size, nothing clipped | Pass at XXXL, fail at AX1 and above | Fail at AX5 | `se-A7-XXXL-trend.png`, `se-A8-AX1-trend.png`, `se-A4-AX5-trend-top.png`, `se-A5-AX5-trend-chart.png`, `pm-A4-AX5-trend-top.png` | BUG-1 and BUG-2 |
| B1 | Prices list layout | Pass, one visual bug | Pass, one visual bug | `se-B1-prices-list.png`, `pm-B2-prices-list.png` | BUG-5: the "Prices" title is not drawn |
| B2 | Prices loading and empty states | Pass (empty) | Pass (loading) | `pm-B1-prices-loading.png`, `se-B18-prices-empty-state.png` | Spinner reads "In progress". Empty state reads "No prices yet" with a one-line hint |
| B3 | Item detail layout and 1-price empty states | Pass | Pass | `se-B6-item-chicken-top.png`, `se-B7-item-chicken-bottom.png`, `se-B8-item-fage-top.png`, `pm-C1-eggs-compare.png`, `pm-C2-eggs-alerts.png` | Long name "Sparkling Water 12pk" fits the SE header. At AX5 the SE layout breaks, see BUG-3 |
| B4 | Review Matches: layout, accept, reject, empty state, labels | Pass | Pass (layout) | `se-B2-review-matches.png`, `se-B3-review-after-accept.png`, `se-B4-review-empty.png`, `pm-B3-review-matches.png` | Buttons are 44 pt and labelled "CHKN BRST is the same as Chicken Breast". See O1 about undo |
| B5 | Combine: confirmation wording, merged price history, undo | Pass | Not run | `se-B9-combine-list.png`, `se-B11-combine-confirm.png`, `se-B12-after-combine.png`, `se-B13-split-confirm.png`, `se-B14-after-split.png` | The alert reads "Combine "Fage Yogurt 0%" into "Greek Yogurt"? Its prices and names move to that item." Greek Yogurt then had 2 prices. Split Off restored 1 + 1 |
| B6 | Merging two items combines price history | Pass | | `se-B5-prices-after-review-ax.txt`, `se-B6-item-chicken-ax.txt` | After "Same Item", Chicken Breast had 3 prices at 2 stores, including the CHKN BRST price |
| B7 | Wrong matches | Fail | | `match-probe.txt`, `se-B1-prices-list-ax.txt` | BUG-4: "Bananas" auto-linked to "Organic Bananas" |
| B8 | VoiceOver labels on every interactive element | Pass | Pass | all `*-ax.txt` | Every button, switch and row has a label. Nits in O3 and O4 |
| C1 | Store comparison: cheapest first, latest and average, 1-price store left out with a reason | Pass | Pass | `se-C1-eggs-compare.png`, `pm-C1-eggs-compare.png`, `se-C1-eggs-ax.txt` | Costco (Cheapest, avg $3.39, latest $3.29) then Walmart (avg $4.09, latest $4.19). Target is left out with "1 more store needs 2 prices of this item to compare." Matches `GET /compare` |
| C2 | Mute item and store: switches work, survive reload, VoiceOver reads them | Pass | Pass (layout) | `se-C3-eggs-muted.png`, `se-C3-eggs-muted-ax.txt`, `se-C4-eggs-after-reload-ax.txt` | Both POSTs returned 204 and the API listed both mutes. After a relaunch both switches still read value 0 |
| C3 | Settings, Alerts: threshold picker, muted list, unmute | Pass | Pass (layout) | `se-C5-notification-settings.png`, `se-C6-threshold-picker.png`, `se-C7-threshold-25.png`, `se-C8-after-unmute.png`, `pm-C3-notification-settings.png` | 25% saved as `threshold_percent: 25`, "10% (default)" saved 10. Unmute removed both mutes |
| C4 | Price alert push: tap opens `/items/<id>` | Pass in foreground and background, fail on cold start | Not run | `se-C9-push-banner.png`, `se-C14-push-tap-opened-milk.png`, `se-C15-push-tap-from-background.png`, `se-C17-push-tap-cold-start-2.png`, `se-C18-cold-trial-*`, `se-C19-cold-start-after-back-swipe.png` | BUG-6. Payload in `price-change.apns` |
| D1 | Settings, Premium row | Pass | | `se-D1-settings-premium-row.png`, `se-D5-settings-premium.png` | Free user: "Grocery Genie Premium, Free plan · Upgrade". Premium user: "Premium". A labelled button |
| D2 | Paywall renders (free user, no RevenueCat key) | Pass | | `se-D2-paywall.png`, `se-D2-paywall-ax.txt` | Title, two benefits, "stay free" line, terms, and 44 pt Terms of Use and Privacy Policy links. No price or Subscribe button. It shows "Purchases need the App Store version of Grocery Genie. Install it from the App Store or TestFlight to subscribe." See O8 |
| D3 | Trend "Learn About Premium" opens the paywall | Pass | | `se-D3-trend-12m-free-with-button.png`, `se-D4-trend-button-opens-paywall.png` | The button is 44 pt and labelled. This replaces the "no button" result in A2, which was correct for `a8fbe37` |
| D4 | Paywall for a Premium user | Pass | | `se-D6-paywall-premium-active.png` | "You're on Premium. Renews or ends on December 3, 2026." with Manage Subscription |
| D5 | Restore Purchases | Not checked | | | Hidden while purchases are unavailable (`paywall.tsx` shows the App Store notice instead), so it needs a build with the RevenueCat key |
| D6 | Sandbox purchase | Not checked | | | Needs the keys and products listed under "Not checked" |
| X1 | Currency on Trend bar labels (found while checking A) | Fail | | `se-A10-trend-eur-bar-dollar.png`, `se-A10-trend-eur-ax.txt` | BUG-7 |

## Fix verification, 2026-11-03 evening

All nine bugs were re-checked on `main` at `11a2863`, after #99 (BUG-6), #101 (V11-D1: BUG-1, 2, 3, 5, 6, 7, 8, 9) and #104 (V11-D2: BUG-4) merged. The same Debug build ran (no native change since `ef4cefe`), with Metro and the backend on `11a2863` and the check database migrated to `20261104_0018`. Before the device runs, the mobile suite passed (125 suites, 930 tests) and so did `tests/services/test_item_matching.py` (215 tests).

| Bug | Result | How it was checked | Evidence |
|---|---|---|---|
| BUG-1 | Fixed | SE at AX5, 3 months: the bar amounts sit below "+22% vs prior 3 months". The text ends at y 708 and the bar columns start at y 730 | `se-FIX-A-AX5-trend-3m-chart.png`, `se-FIX-A-AX5-trend-3m-ax.txt` |
| BUG-2 | Fixed | SE and Pro Max at AX5: "−74% vs Oct" wraps under the amount and ends at x 298 | `se-FIX-A-AX5-trend-3m.png`, `pm-FIX-A-AX5-trend-3m.png` |
| BUG-3 | Fixed | SE at AX5: Prices rows show the whole name with the price under it. On item detail "$4.79" is on one line and "Rename" is not clipped | `se-FIX-B3-AX5-prices.png`, `se-FIX-B3-AX5-item.png` |
| BUG-4 | Fixed | A fresh user, the same receipts as the first run. "Bananas" gets its own item and a Review Matches suggestion (0.857). ORG BANANAS links to Organic Bananas and GRK YGRT to Greek Yogurt. Organic Whole Milk, Chicken Thighs and Brown Eggs stay suggestions | `fixcheck/match-probe.txt` |
| BUG-5 | Fixed | The "Prices" large title is drawn | `se-FIX-B5-prices-title.png` |
| BUG-6 | Fixed | Cold-start link 2 of 2 and cold-start push tap 2 of 2 open the item with Back. Before #99 both were red, 3 of 3 | `se-loop-bug6-ax.txt`, `se-C18-cold-trial-main1.png`, `se-C18-cold-trial-main2.png` |
| BUG-7 | Fixed | An EUR user sees "€0" on the bars, as in the summary | `se-FIX-A10-trend-eur.png`, `se-FIX-A10-trend-eur-ax.txt` |
| BUG-8 | Fixed | The 12-month bars are in month order in the accessibility tree, December to November | `se-FIX-A-AX5-trend-12m-ax.txt` |
| BUG-9 | Fixed | SE at AX5, 12 months: the one-letter labels stay readable and the bars clear "12-month average $53" | `se-FIX-A-AX5-trend-12m.png` |

Still open from this report: O1 to O9, the observations below, and the items under "Not checked". The Back button on an item opened from a push or link reads "Prices" but leads to Budget (`items/[id].tsx` sets `headerBackTitle`).

## Bugs

Fix status (2026-11-04): BUG-1, 2, 3, 5, 6, 7, 8 and 9 are fixed in code by V11-D1 (BUG-6 also by #99); BUG-4 is fixed by V11-D2 (qualifier differences ask instead of auto-linking; PI-02 AC 2 amended). A Simulator recheck of BUG-1, 2, 3, 5, 6, 8 and 9 is still due (BUG-7 is covered by its test).

### BUG-1. Trend bar amounts overlap the summary at accessibility text sizes

Severity: medium. Code from May 2026 (`429e0a4f`), not from V11-06b.

Steps:
1. Settings, Accessibility, Larger Text, set any accessibility size (AX1 or larger).
2. Open Budget, then See 3-month trend.

Expected: the bar amounts sit above their bars, clear of the text above the chart.

Actual: at AX1 "$77" draws on top of "+233% vs prior 3 months". At AX5 "$63" and "$77" both cover that line, on the SE and on the Pro Max. XXXL, the largest standard size, is fine.

Evidence: `se-A8-AX1-trend.png`, `se-A5-AX5-trend-chart.png`, `pm-A4-AX5-trend-top.png`.

Likely cause: the chart has a fixed `height: 170` (`mobile/app/trend.tsx`, style `chart`). Bars scale to 130 pt, and the amount and month labels share the same column. With larger text the column outgrows 170 pt and grows upward into the summary.

### BUG-2. Trend month-over-month change runs off the screen at AX5

Severity: medium. Same screen and history as BUG-1.

Steps: as BUG-1, with AX5 (the largest size).

Expected: "−74% vs Oct" wraps under the amount or shrinks.

Actual: it starts at x 234 and is 266 pt wide, so it ends at x 500 on a 375 pt screen. Only "−74% v" shows. The Pro Max shows "−38% vs O". The 12-month view has the same row.

Evidence: `se-A4-AX5-trend-top.png`, `se-A4-AX5-trend-ax.txt`, `se-A6-AX5-trend-12m-prompt.png`, `pm-A4-AX5-trend-top.png`.

### BUG-3. Prices and item detail break at AX5 on the SE

Severity: low to medium. V11-00 screens.

Steps: SE, AX5, open Budget, then Price history, then any item.

Expected: names and prices stay readable.

Actual: in the Prices list, item names collapse to two letters ("Or...") while "1 price · 1 store" wraps one word per line next to the price. On item detail, "$4.79" splits across two lines as "$4.7" and "9", and the "Rename" header button text is clipped.

Evidence: `se-B-AX5-prices-list.png`, `se-B-AX5-item-detail-top.png`.

### BUG-4. "Bananas" auto-links to "Organic Bananas"

Severity: medium. This is the match you asked me to watch for.

Steps: confirm a receipt with "Organic Bananas", then one with "Bananas".

Expected: the app asks whether they are the same item, or keeps them apart.

Actual: the line links without asking. The `line_items` row has `match_method = semantic` and `match_confidence = 0.857`, and the semantic auto-link threshold is 0.80 (`item_match_semantic_threshold`). Organic Bananas now holds $1.29 (Walmart), $0.99 (FreshCo, plain bananas) and $1.39, so its history, alerts and store comparison mix two products. "ORG BANANAS" also auto-linked, at 0.833.

The probe receipt shows the rest of the matcher asks instead of linking. Organic Whole Milk vs Whole Milk 1 Gal (0.69), Chicken Thighs vs Chicken Breast (0.69) and Brown Eggs 12ct vs Large Eggs 12ct (0.72) all became suggestions. So did the true matches GRK YGRT (0.79) and Strawberries (0.79).

Evidence: `match-probe.txt`, `seed-log.txt`, `se-B1-prices-list-ax.txt`.

### BUG-5. The "Prices" large title is not drawn

Severity: low. Visual only. VoiceOver still reads the title.

Steps: open Budget, then Price history.

Expected: "Prices" in large type under the back button.

Actual: a blank band where the title should be. Seen 4 times out of 4 on the SE and on the Pro Max. The title is in the accessibility tree at y 77 to 120. Trend uses the same header options without `headerSearchBarOptions` and draws its title in most screenshots, but it was blank twice (`se-A6-AX5-trend-12m-prompt.png`, `se-A9-trend-empty-user.png`).

Evidence: `se-B1-prices-list.png`, `pm-B2-prices-list.png`, `se-B18-prices-empty-state.png`.

### BUG-6. A price alert tapped while the app is closed opens the item with no way back

Severity: high. V11-02.

Steps:
1. Force-quit the app.
2. Send `xcrun simctl push <udid> com.grocerygenie.app .verification/device/tools/price-change.apns`.
3. Tap the banner.

Expected: the app opens Whole Milk 1 Gal with a back button to Prices or Budget.

Actual: in 3 of 4 trials the app opened Whole Milk 1 Gal, but the screen had no back button and no tab bar, and the edge swipe did nothing. The only way out is to force-quit. In the other trial the app opened on Budget and did not route. Its log was not captured, so that one result is unexplained.

A deep link to `/items/<id>` on a fresh launch strands the user the same way. The back button is an empty circle that does nothing (`se-B15-long-name-header.png`, `se-B16-after-tapping-empty-back.png`).

Foreground and background taps work. Both opened the item with "< Prices" and sent `PATCH /api/notifications/{id}/read?source=push` (200).

Evidence: `se-C17-push-tap-cold-start-2.png`, `se-C18-cold-trial-3.png`, `se-C18-cold-trial-4.png`, `se-C19-cold-start-after-back-swipe.png` with their `-ax.txt` trees. The SpringBoard log for trial 2 shows `UNNotificationDefaultActionIdentifier` and `Launch application in foreground for notification response`.

Likely cause: `mobile/app` has no `unstable_settings.initialRouteName`. On a cold start, Expo Router builds the stack from the target route alone, so nothing sits under `/items/[id]`.

### BUG-7. Trend bar amounts always show "$"

Severity: low. Code predates V11-06b. #69 moved the rest of the app to the user's currency and missed this label.

Steps: set the budget currency to EUR, then open Trend.

Expected: bar labels read "€0".

Actual: the summary reads "€0" and VoiceOver reads "September: €0", but the bar labels read "$0". The label is `${m.total.toFixed(0)}` in `mobile/app/trend.tsx` instead of the `money()` helper.

Evidence: `se-A10-trend-eur-bar-dollar.png`, `se-A10-trend-eur-ax.txt`.

### BUG-8. VoiceOver reads the Trend bars in height order, not month order

Severity: medium. Found on the Premium 12-month chart (V11-06b and P0). The 3-month chart has the same cause but its order happened to come out right with my data.

Steps: as a Premium user, open Trend, choose 12 Months, swipe through the bars with VoiceOver.

Expected: December, January, ... November.

Actual: the accessibility tree orders the bars June, May, October, April, March, September, February, January, December, July, August, November, on both devices. That is tallest first, the order VoiceOver swipes in.

Evidence: `se-A3-trend-12m-premium-ax.txt`, `pm-A3-trend-12m-premium-ax.txt`.

Likely cause: the `chart` style sets `alignItems: 'flex-end'`, so each `chartCol` is only as tall as its bar and labels. iOS sorts sibling elements top to bottom, and a taller bar's column starts higher. Equal-height columns, or an explicit order, would fix it. Confirm with VoiceOver on a device.

### BUG-9. The 12-month labels clip and run together at AX5

Severity: low to medium. V11-06b compact chart.

Steps: SE, AX5, Premium user, Trend, 12 Months.

Expected: one letter under each bar, readable.

Actual: the labels run together as "DJFMAMJJASCN". M and O are cut so they read as half letters. The June bar touches the "12-month average $53" line above it. XXXL is fine.

Evidence: `se-A3-AX5-trend-12m-premium.png`, `se-A3-XXXL-trend-12m-premium.png`.

## Observations (not bugs)

- **O1.** In Review Matches, "Same Item" merges at once, with no confirmation or undo toast. The card disappears. The intro text says combining joins price histories, and Split Off on the item reverses it. Combine from item detail does ask first.
- **O2.** When no store has 2 prices, Compare Stores shows "Buy it 2 times at a store to compare that store's price." and also "1 more store needs 2 prices of this item to compare." The second line repeats the first, and "more" reads oddly. The line never names the store that was left out.
- **O3.** Decorative SF Symbols are exposed to VoiceOver with their default names, for example "sparkle" in the upgrade prompt and "tag" in the Prices empty state. This holds across the app: none of the 87 `SymbolView`s are hidden.
- **O4.** In the Combine list each row's VoiceOver label is only the item name. The visible "1 price · 1 store" is not read.
- **O5.** Push permission is never requested in this build. `registerForPush` returns early when no EAS project ID is set, and none is set in `app.json` or `eas.json`. To test C4 I called the native `requestPermissionsAsync` through Metro's debugger and tapped Allow. That changed Simulator state only. Pushes reach users only once the EAS project ID is configured.
- **O6.** Outside V1.1 scope, the Budget dashboard at AX5 on the SE breaks "November" mid-word.
- **O7.** On iOS 27 the Simulator ignores zero-length synthetic taps on switches and notification banners. Taps of 0.15 s or more work. My first "switch does nothing" and "push tap does nothing" results came from this, not from the app.

- **O8.** The paywall's benefit rows read their icon names first: "Bar chart with an X axis, 12-month spending trend, ..." and "Infinity symbol, Unlimited receipts, ...". Same root as O3.
- **O9.** The 12-month chart shows the December to June months as grey "Uncategorized". That is my test data: those receipts had no category and no Celery worker ran to assign one.

## Not checked

- **Restore Purchases and a real sandbox purchase.** The paywall hides both while purchases are unavailable. They need these, none of which are in the repo:
  - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, the RevenueCat Apple SDK key (`appl_...`). Without it Settings shows Premium as unavailable.
  - `GG_REVENUECAT_API_KEY` (`sk_...`) and `GG_REVENUECAT_WEBHOOK_SECRET` on the backend.
  - The subscription product in App Store Connect, attached to the `premium` entitlement (`GG_REVENUECAT_ENTITLEMENT_ID`) and an offering in RevenueCat.
  - A sandbox Apple ID on a device, or a StoreKit configuration file for the Simulator.
- **Real VoiceOver** on a device: focus order, announcements after merge or unmute, and the rotor.
- **A real APNs push** through Expo's service. It needs an EAS project ID and a device token.
- **C2, C3 and C4 interactions on the Pro Max.** I checked their layout there. The behaviour does not depend on screen size.

## Reproducing

Tools are in `.verification/device/tools/` (gitignored):

- `seed.sh` creates a fresh seeded user against `http://localhost:8001`.
- `shot.sh se|pm NAME` saves a screenshot.
- `ax.sh se|pm NAME` dumps the accessibility tree. Build the runner once first: `cd .verification/device/tools/axdump && xcodebuild build-for-testing -project AXDump.xcodeproj -scheme AXDump -destination id=<udid> -derivedDataPath dd`.
- `cdp-eval.js` evaluates an expression in the app through Metro.
- `cold-prep.sh` and `cold-check.sh` run one cold-start push trial.
- `price-change.apns` is the push payload.
- `extra-months.sh ENV_FILE BASE` adds December 2025 to June 2026 spend.
- `rc-event.sh ENV_FILE BASE SECRET_FILE INITIAL_PURCHASE [DAYS]` posts a signed RevenueCat webhook and prints the user's `is_premium`.
- The Premium run uses the `backend-p0` and `metro-p0` entries I added to `.claude/launch.json`.

Backend for these runs: `make db-up`, `GG_DATABASE_URL=postgresql+asyncpg://grocery_genie:grocery_genie_dev@localhost:54440/grocery_genie make backend-migrate`, then the `backend-dev` entry in `.claude/launch.json`. `make backend-migrate` alone points at port 5432 and fails.
