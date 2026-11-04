# V1.1 feature scope: what Grocery Genie ships at 1.1.0

Written 2026-11-04 from `main` at `d5e1c04`, for the V1.1 landing page.

This describes the whole app as of V1.1: everything from the MVP plus what V1.1 adds (price intelligence and Premium). It comes from the code: three read-only inventories of the mobile app, the backend and the status docs, with the hero and feature rows rechecked by hand. The PRD is used only to name user stories. The MVP scope this builds on is [../mvp/feature-scope.md](../mvp/feature-scope.md). Section 5 lists what the site must not claim.

How to read the status column:
- **Built**: in the code on `main`, with a test that would fail if it broke.
- **Built, device check pending**: built and tested, but not yet checked on a real iPhone. It can appear on the site; recheck before launch.
- **Built, unverified**: built, but untested or not measured. Hold it off the site.
- **Hold**: built, but switched off or unconfigured in production. Keep it off the site.

The "Since" column says which stage introduced the feature.

---

## 1. Positioning

- **One-line pitch:** "Snap a receipt, watch your grocery budget take shape." This is still the app's onboarding tagline. V1.1 adds the price layer: one scan now feeds the budget and every item's price history.
- **The promise:** scan the receipt, and the budget updates on its own. You also see what each item costs over time, and where it's cheapest.
- **Who it's for:**
  - the household budget manager (Sarah, `docs/prd/00-overview.md`);
  - now also the price-conscious comparison shopper (Linda), who asks "am I getting ripped off?"
- **Why it's different:**
  - bank apps see one total;
  - flyer and coupon apps see list prices;
  - Grocery Genie reads every line of your own receipts, so it knows what you actually paid, item by item and store by store.
- **Platform:** iPhone only.
- **Price:**
  - **Free:** scanning, budgets, alerts, and all price intelligence (price history, price alerts, store comparison). Up to 20 receipts a month.
  - **Premium, $5.99/month** (RevenueCat; the price shown comes from the App Store): unlimited receipts, custom categories, a 12-month trend, budget rollover and data export.
  - The App Store product and RevenueCat production keys aren't set up yet (see section 4).
  - **Changing (decided 2026-11-04, not built yet):** Premium becomes $4.99/month or $39.99/year with a 7-day free trial (decision D7, [#18](../decisions.md)), and store comparison and alert mutes move to Premium (D8, #19); price history, matching and price alerts stay free. Priority OCR joins Premium (D9, #20). The lines above describe the code as it is; the site follows #18–#20 (section 3).

## 2. Feature list

Two value layers, newest first: **Prices** (V1.1) and **Budget** (MVP). Then the Premium extras, and trust.

### Layer: Prices (V1.1)

| Feature | Benefit line | What it actually does | Story | Since | Status |
|---|---|---|---|---|---|
| Price history | Every item gets a price history, automatically. | Confirming a receipt adds every item to Prices (dashboard → "Price history"). Item detail shows the latest price, "+X% since <date>", a chart once there are 2 prices, and every price with its date and store. | PI-01 | V1.1 | Built (Simulator-checked 2026-11-03) |
| Item matching | It knows "ORG BANANAS" and "Organic Bananas" are the same thing. | Matches receipt names to the user's items by exact name, then fuzzy (≥0.85), then semantic similarity (≥0.80, run on our server). Names that differ by a number or a qualifier (organic, size, fat level, flavour, store brand) never auto-link; they become "Same item?" suggestions instead. A nightly job matches leftovers. | PI-02 | V1.1 | Built |
| Review matches, combine, split | You decide what counts as the same product. | "N possible matches to review" → "Same Item" / "Different". Combine two items ("Its prices and names move to that item"), split a name off, rename an item. | PI-02 | V1.1 | Built (Simulator-checked) |
| Price-change alerts | Know when a regular buy gets pricier, or cheaper. | Push alert when an item's new price is 10% or more (setting: 5–50%) above or below its 30-day average. Needs 2 earlier prices; at most one alert per item every 7 days. Example: "Milk: $4.29 at Corner Market, up 12% from your 30-day average of $3.83." Tapping it opens the item. | PI-03 | V1.1 | Built, device check pending (no real push sent yet) |
| Mute price alerts | Only the alerts you want. | Switch all price alerts off, mute one item, or mute one store. Settings lists what's muted, with Unmute. | PI-03 | V1.1 | Built (Simulator-checked) |
| Store comparison | See which store charges you less. | "Compare stores" on item detail: each store's average and latest price, cheapest first, labelled "Cheapest". It uses your own receipts only, like-for-like units and currency. A store needs 2 prices of the item. | PI-04 | V1.1 | Built (Simulator-checked) |

### Layer: Budget (MVP, unchanged unless noted)

Every MVP feature in [../mvp/feature-scope.md](../mvp/feature-scope.md) §2 is still in the app, with the same behaviour and copy. Summary:

| Pillar | Features | Since | Status |
|---|---|---|---|
| Scan any receipt | Apple's document scanner (first page kept) and photo quality check; import JPEG, PNG, HEIC and one-page PDF; manual entry; offline scanning with Pending; receipts in six languages | MVP | Scanner: Built, device check pending. Languages: Built, unverified. Rest: Built |
| AI reads it, you approve it | Extraction of every line; confidence flags; tap-to-edit; nothing saves until you confirm; big-ticket check ($100 item, $500 receipt); duplicate warning; learns corrections; original photo kept | MVP | Built |
| Spending sorts itself | 8 built-in categories; one-tap recategorize that also updates past receipts. **Changed in V1.1:** the picker includes custom categories (Premium) | MVP | Built |
| Budgets that keep up | Monthly and per-category budgets; start day 1–28; edit any time; spending pace; 11 currencies (other currencies kept but not counted) | MVP | Built |
| Alerts before you overspend | Budget alerts at 50/80/100% (by default 80% and 100% are on); per-category mute; weekly summary at 9 AM local time on a chosen day | MVP | Built, device check pending (push) |
| See where it all went | Dashboard (ring, pace, category bars, over-budget banner); month over month; 3-month trend (free); top 10 items; history with store search and date filters; receipt detail (**changed:** each line now opens its price history); edit; delete and restore within 30 days | MVP | Built |

### Premium (V1.1)

| Feature | Benefit line | What it actually does | Story | Since | Status |
|---|---|---|---|---|---|
| Unlimited receipts | Scan every trip. | The free plan allows 20 receipts a month; Premium has no cap. At the cap, a free user sees "You've used this month's free scans", with See Premium or Enter manually. | V11-P4 | V1.1 | Built (Simulator check of the prompt pending) |
| 12-month trend | See your whole grocery year. | Trend toggles between 3 Months (free) and 12 Months (Premium): "12-month average", "vs prior 12 months". | BC-04 | V1.1 | Built |
| Custom categories | Categories named your way. | Up to 10 of your own (names up to 40 characters), for budgets and corrections. If Premium lapses, they stay and keep their spending. | BC-05 AC 3 | V1.1 | Built |
| Budget rollover | Unspent budget carries over. | Per-budget switch. What you don't spend carries into next month; overspending doesn't. The dashboard shows "Includes $40 rolled over". | BC-FR | V1.1 | Built |
| Data export | Take your data with you. | Receipts, line items, budgets and price history as JSON, or CSV in a zip. Deleted items are left out. | NFR | V1.1 | Built (share sheet on a device pending) |
| Subscribe and restore | — | Paywall: "Grocery Genie Premium — More from every receipt you scan." Five benefits, then "Price history, price alerts and store comparison stay free." Subscribe, Restore Purchases, Manage Subscription. The price comes from the App Store. | V11-P0 | V1.1 | **Hold**: no App Store product or RevenueCat production keys yet; sandbox purchase and restore not tested |

### Trust, privacy and accessibility

| Feature | What it actually does | Status |
|---|---|---|
| Sign in | Email, Sign in with Apple. Google appears only when its client ID is configured. | Built; Google on Hold |
| AI consent | A one-time consent screen before the first scan; withdraw in Settings. | Built |
| Your data stays yours | Price intelligence uses only your own receipts. Item-name matching runs on our server. | Built |
| Delete account | Erases everything from inside the app. A note says it doesn't cancel a Premium subscription (manage that in iOS Settings). | Built, device check pending |
| Accessibility | VoiceOver, Dynamic Type (AX5 fixes in V1.1), Reduce Motion, Increase Contrast. | Built, device check pending (a real VoiceOver pass) |

## 3. What changed since the MVP scope

- **New:**
  - price history, item matching with review, combine and split;
  - price-change alerts with mutes, and store comparison;
  - Premium: unlimited receipts, 12-month trend, custom categories, budget rollover, data export, and the paywall.
- **Changed:**
  - receipt detail lines open price history;
  - the category picker includes custom categories;
  - account deletion has a subscription note;
  - a free user hitting the 20-receipt cap now gets an upgrade prompt;
  - AX5 layout fixes.
- **Removed:** nothing.
- **Decided for the V1.1 design alignment, not built yet (DA-1 to DA-10, decisions D6–D10, `docs/prd/PHASE_SCOPE.md`):**
  - the new price and plans, and Premium store comparison and mutes (#18, #19): until DA-1 ships, the site shows no price and doesn't say which of the two is free;
  - Priority OCR (#20);
  - item detail range control, the in-app Price alerts list and cooldown setting, the "Same item?" prompt after scanning, split by line and the Link items sheet, timed mutes, export by date range with a PDF report and receipt images, category colours and icons, and the new Compare stores and Trend layouts. Keep them off the site until each is built; rerun this scope then.
- **Planned for V1.1 but not built (keep off the site):**
  - **V11-05:** store name clean-up and store merge. "Loblaws" and "Loblaws #1234" are still separate stores in comparison.
  - **V11-P5:** the waitlist free-year matching and the Settings claim step.

## 4. Decisions

Settled (see [decisions](../decisions.md)):
1. **#14:** version 1.1.0.
2. **#15:** two states: waitlist now, App Store downloads at launch.
3. **#16:** a Free vs Premium table in State B only, at $5.99/month, once the App Store product is live.
4. **#17:** no item-matching figures.
   - **#18–#20:** Premium at $4.99/month or $39.99/year with a 7-day trial; store comparison and mutes are Premium, never "price intelligence is free"; Priority OCR named only once built, with no accuracy claim.
5. **Still in force from the MVP:** #2–#13, including the free Premium year, "Free" in the hero, no on-device claims, no speed or accuracy figures, and Q4 2026.

Still open:
6. **The free-tier count.** The backend counts manual entries and receipts in Recently deleted toward the 20 a month (`receipt_service.py` `count_receipts_in_month`, UTC calendar month). The site and paywall say the free plan "stops at 20 receipts a month", and the FAQ says you can "scan up to 20 receipts a month … and add as many as you like by hand". Adding 5 by hand leaves 15 scans. Either fix the count (scans only, not deleted) or reword. Until then, the brief says "20 receipts a month" without "scan up to".
7. **The free-year claim step.** The FAQ's "claim it in Settings" depends on V11-P5. It must ship before Premium launches.
8. **Privacy text for Premium.** `privacy.ts` doesn't mention RevenueCat or subscription data, or data export. It needs a line before Premium goes live (and for the App Store privacy label).

## 5. Don't put these on the page

| Claim (current site or a likely draft) | Reality | Stage / reason |
|---|---|---|
| "Price tracking across stores" listed under "Coming later" | Built now. Move it into the features. | V1.1 shipped |
| "See 3-month trend" as the only trend | 3 months free, 12 months Premium | Changed |
| Store names cleaned up, chains grouped, "Loblaws everywhere" | Not built: stores compare by exact name | V11-05 |
| "Claim your free year in Settings" as working today | Not built yet | V11-P5 |
| Match accuracy, precision or recall figures | Development test only (31/31, 31/33) | Decision #17 |
| Extraction accuracy or speed figures | Not measured | Decision #5 |
| Savings figures ("save $X a month") | Not measured | No data |
| Flyer or advertised prices, deals, coupons | Only your own receipts | Not planned |
| Community or crowd-sourced prices | Not built | V2.5 |
| Basket comparison, "cheapest store for your whole shop" | Item by item only | V2.5 |
| Personal inflation rate | Not built | V2.5 |
| Household sharing | Not built | V1.5 |
| Pantry, recipes, shopping lists, meal plans | Not built | V2.0 |
| Family plan, $8.99/month | Not built | Later |
| Premium price before the App Store product is live | Hold | Decision #16 |
| Premium at $5.99/month | Now $4.99/month or $39.99/year, 7-day trial | Decision #18 |
| "All price intelligence is free", "store comparison stays free" | Comparison and mutes become Premium | Decision #19 |
| "Priority OCR", "more accurate scans" for Premium | Not built; no accuracy figures | Decision #20, #5 |
| "Unlimited" for the free plan | 20 a month | Decision #3 |
| "Early sign-ups get TestFlight access first" (current FAQ) | No TestFlight build or invite process exists in the repo | Unconfirmed: confirm or remove |
| "Continue with Google" | Hold until configured | — |
| On-device processing, "never shared" | False | Decision #4 |
| Android | No plans | — |

## 6. Sources checked

- **Inventories** (2026-11-04, `main` at `d5e1c04`):
  - mobile routes and strings;
  - backend routes, `config.py`, services and tasks;
  - status in the V1.1 plan, `.planning/DEVICE-CHECK-2026-11-03.md`, `docs/launch-open-items.md`, `docs/device-checklist.md` (0 of its boxes ticked) and the DoD audit.
- **Rechecked by hand:**
  - the price alert template (`backend/app/services/price_alert_service.py:294-298`);
  - the thresholds (`config.py:93-99`);
  - the comparison minimum (`price_service.py:31`);
  - the paywall copy (`mobile/src/features/premium/content/premium.ts:13,37,46`).
- **Privacy wording:** `privacy.ts` (`reviewed: false`, updated November 4, 2026). The Anthropic terms stand as checked on 2026-11-03 (decision #8).
- **Device checks still open:**
  - real APNs push (budget and price alerts, weekly summary);
  - document scanner;
  - account deletion;
  - real VoiceOver;
  - sandbox purchase and restore;
  - the export share sheet.
