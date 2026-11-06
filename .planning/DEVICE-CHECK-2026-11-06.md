# V1.1 Simulator pass, 2026-11-06

A walk through section 8 of [docs/device-checklist.md](../docs/device-checklist.md) against `main` at `eecff9d`, plus a recheck of BUG-1, 2, 3, 5, 6, 8 and 9 from [DEVICE-CHECK-2026-11-03.md](DEVICE-CHECK-2026-11-03.md). No app code was changed.

**This was not a physical-device run.** No iPhone was available. Everything ran on the iPhone SE (3rd generation) Simulator, iOS 27.0, 375x667 pt, the small-screen stress case. The Pro Max Simulator held a stale build and was left out. The Simulator has no VoiceOver, so "VoiceOver" below means the accessibility tree VoiceOver reads (element, label, value, traits, order). Focus order by swipe, announcements and the rotor still need a phone. What a phone must still prove is in the last section.

## Setup

- Backend: a throwaway database `gg_devicecheck_v11` (migrated to `20261104_0023`), debug mode (mock extractor), port 8001. The waitlist window was opened with `GG_PREMIUM_LAUNCHED_AT` for the claim screens. The dev database was not touched.
- App: the Debug build already on the Simulator, loading current `main` JS from Metro.
- User: one fresh seeded user (10 receipts, July to November 2026), plus receipts for December 2025 to June 2026 and June, August and October 2025 (18 months for the All range), and four Olive Oil receipts for the split. Premium was granted with a signed RevenueCat webhook (`INITIAL_PURCHASE`), and revoked with `EXPIRATION` for the free-user pass.
- Design: `design/claude-design/Grocery Genie V1 Screens.html`, sections `v11-core` and `v11-gaps`, rendered through a local server. Eleven screens have a design: item detail, Same item?, Price alerts, Compare stores, Link items, Split, Alerts, Categories, Export data, 12-month Trend, Paywall.
- Each screen was captured in light, dark and AX5 (`accessibility-extra-extra-extra-large`). Accessibility trees came from a fresh launch per screen, so the navigation stack was clean. Flows were driven by an XCUITest runner (tap by identifier or label).
- Evidence is in `.verification/device/` (gitignored): `v11/shots/` (screenshots), `v11/sheets/` (contact sheets), `se-v11-F-*-ax.txt` (clean trees), `tools/drive.sh`, `tools/cap-mode.sh`, `tools/ax-lint.py`.

## Bug rechecks (SE)

| Bug | Result | Evidence |
|---|---|---|
| BUG-1 | Pass. At AX5 the 3M and 1M bar amounts sit below the headline, the chips wrap to two rows instead of clipping. | `se-bug2-1m-ax5.png`, `v11/shots/se-A-trend.png` |
| BUG-2 | Pass. At AX5, 1M: "−74% vs prior month" wraps inside the card. | `se-bug2-1m-ax5.png` |
| BUG-3 | Pass. At AX5 the Items list puts the price under the name, and "$4.79" is on one line on item detail with Rename not clipped. | `se-bug3-items-ax5.png`, `se-bug3-item-ax5.png` |
| BUG-5 | Pass. The "Items" large title draws in light, dark and AX5. | `v11/shots/se-L-items-list.png` |
| BUG-6 | **Pass in 4 of 5 cold-start trials.** The item opened with Back to Budget in trials 2 to 5. Trial 1, the first after a fresh sign-in, opened Budget and did not route. Not reproduced. Foreground and background taps pass. | `se-bug6-cold*.png`, `se-J1-fg.png`, `se-J2-bg.png` |
| BUG-8 | Pass in the tree. The 12 bars run December to November, each reading "Month: $N", in equal-height columns. Swipe order on VoiceOver still needs a phone. | `se-bug9-1y-ax5-ax.txt` |
| BUG-9 | Pass. At AX5, 1Y: 12 letters stay readable and apart, and clear the headline. All (18 months) scrolls sideways and every letter is readable. | `se-bug9-1y-ax5.png`, `se-bug9-all-ax5.png` |

## Section 8 items

"Sim" = checked here. "Device" = still needs a phone (see the last section).

**Premium**
- Sandbox purchase, Restore, Free trial, Plan switch: **Device** (need the RevenueCat key, App Store Connect products and a Sandbox account; without the key the paywall hides Subscribe and Restore).
- Webhook test event: **Sim, partly.** The local backend answers a signed `TEST` event with 200 (`ignored`) and a wrong secret with 401. The RevenueCat dashboard's "Send test event" against a deployed URL is **Device/staging**.
- Paywall, free user: layout checked (no plan cards without the key, as designed for no-key builds). Premium user: "You're on Premium", renewal date, Manage Subscription. Dark and AX5 captured. See findings F1 and F8.
- Settings → Premium: pass for both states.

**Price alerts and comparison**
- Push tap foreground, background, cold start: **Sim** with `simctl push` (see BUG-6). A real APNs push through Expo is **Device**.
- Price alerts list (DA-4): pass against the design. Threshold (5 to 30%) and Cooldown (1, 3, 7, 14, 30 days) save, the default is marked, the footer follows. Empty state not run.
- Alerts screen (DA-7): pass. Item mute reveals "Mute until"; 1 week gives "Mute until: Nov 13, 2026" and the item's Alerts row reads "Muted until Nov 13, 2026"; a store muted Forever; both survive a relaunch and match `/api/items/price-alert-settings`. Free-user upgrade prompt on a mute switch: **not run** (the screen opened with the switch on).
- Compare stores: pass for Premium (card, rows, CHEAPEST on the first row only, "1 more store needs 2 prices"). The free user sees "Compare stores with Premium".
- Threshold picker: pass.
- Unmute rows: pass. With the backend stopped, Unmute keeps the row and shows "Couldn't unmute. Check your connection and try again." after about 6 s; with it back, the row leaves and the switch is on again.
- Item detail range and headline (DA-3): chips redraw the chart (1M: 3 prices, 6M and up: 5). "Not enough prices in this range" not seen with this data.
- "Same item?" (DA-5): pass for Skip (stays pending, count unchanged), Keep as separate item, Yes merge (Greek Yogurt then holds both prices), and offline merge (prompt stays, "That didn't save. Check your connection and try again."). Cancel not run.
- Split (DA-6): pass. A merged Olive Oil shows the "unit price varies a lot" hint, Split opens with the warning, two purchases moved to a new item, Save opened the new item with its price ($25.24 avg). "Add another split" and the one-purchase rule not run.
- Link items (DA-6): pass. Suggested and All items sections, radio, native "Merge … into …?" confirm; Cancel changes nothing; Merge merges.

**Trend, categories, export, rollover, quota**
- Trend range chips: pass at 1M, 3M, 1Y, All. 6M not opened. Free-user 6M/1Y/All prompt not opened (the free Trend screen was captured at 3M).
- Categories: Premium add, delete (with confirm) and the 10-of-10 limit (add button disabled) pass. Rename not run. Free: upgrade prompt.
- Category editor sheet: exists (name, colour, icon). The design has none yet, so nothing to compare.
- Data export: pass for the Period options (counts 21, 24, 20 receipts for Last 12 months, All time, This year), the format list and the share sheet (a ZIP, 9 KB, Save to Files offered). Free: the upgrade prompt. "No receipts in this range", the PDF content, and the last-switch-cannot-turn-off rule were **not run** (switch taps did not register through the test runner).
- Rollover: the switch shows for Premium and saves (`rollover_enabled: true` on the budget). The ring text for a carried amount was not seen: it needs a period that has ended, **Device/time**.
- Receipt quota prompt: **Device** (needs the camera or import at the monthly limit).

**Item matching and stores**
- Review Matches: pass (three pairs with "N% match"; neither links on its own).
- Settings → Stores: pass. Merge Target into Walmart gave Walmart 3 purchases on the Eggs comparison, Unmerge restored 2.

**Waitlist**
- Claim screen: pass. Intro, field, "Claim it by January 29, 2027", Send link. An unlisted email gets "Check your inbox / If nobody@example.com is on our waitlist…" with "Use a different email". A bogus claim link shows "Couldn't claim the offer / This link is invalid or has expired."
- A real claim link from an email, and "Your free year is on": **Device** (needs a waitlist entry and a delivered email).

**Priority OCR accuracy run:** **Device/ops** (needs `GG_LLM_API_KEY`, the premium model and the real receipt set). Not a phone check, but it still needs a person with the keys.

## Design comparison

Matches the design, with the differences below: item detail, Same item?, Price alerts, Compare stores, Link items, Split (including the warning banner), Export data, Trend with chips and Highlights.

Differences:
- **Alerts** switches draw in iOS system green. The design draws them brand green. The app also labels the item switch "Price alerts" and reads on as alerts on; the design's "Mute price alerts" reads on as muted. The checklist's wording (PI-03 AC) matches the app, so this one is deliberate.
- **Price alerts** and **Trend** open as cards over the stack when reached by link, so they show no tab bar. The design shows the tab bar. This is how a deep link presents. Not checked from the Budget bell.
- **Categories** lists eight built-in categories where the design lists five. That is data, not design.
- **Paywall:** see F1.

## Findings

None are blockers. Each is a candidate for [launch-open-items.md](../docs/launch-open-items.md) §4c.

- **F1 (low, V1.1).** The paywall shows a "Premium" navigation header above its own ✕ close button. The design has no header. `app/_layout.tsx` declares the route with `title: 'Premium'` and `presentation: 'modal'`; `app/paywall.tsx` then sets `headerShown: false` in the screen. Metro logs "Dynamically changing header's visibility in modals will result in remounting the screen and losing all local state." I did not tie that warning to one screen, but this is the likely source. Fix: set `headerShown: false` on the route in `_layout.tsx`.
- **F2 (low).** Settings → Categories footer reads "Custom categories require Premium." for a Premium user too. It shows under the custom list whatever the plan.
- **F3 (medium, AX5 on the SE).** The Price alerts list truncates the item name to "Wh ole…" next to the percent. Same family as BUG-3.
- **F4 (low, AX5).** Stores ("Cost co", "receip ts"), Categories ("Househol d") and the paywall title ("Premi um") break words mid-word.
- **F5 (low, AX5).** The paywall's "Manage Subscription" button label is clipped ("Subscriptio").
- **F6 (medium, AX5, MVP screens that V1.1 touches).** Budget settings: the header Cancel and Save collapse into a partial Cancel and a "…", and the Monthly limit value is clipped. Settings: the "Done" button overlaps the "Settings" title.
- **F7 (low).** The Alerts switches use `colors.green` (system green), not the brand green the design shows (`PriceAlertControls.tsx`, `notification-settings.tsx`, `budget-settings.tsx`, `export-data.tsx`). Needs a design decision.
- **F8 (note).** After a failed unmute with the backend down, the error takes about 6 s to appear. The row stays meanwhile. Not a bug, but a user may tap again.
- **Not a finding:** two things looked like defects and were test artifacts. The Simulator types text slowly, so saving right after typing saved "G" for "Garden". The Split name field starts prefilled, so typing appended to it.

## Left for a physical device

The consolidated list is in [docs/device-checklist.md](../docs/device-checklist.md), under "Device-only remainder (after the 2026-11-06 Simulator pass)".
