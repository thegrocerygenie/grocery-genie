# Handoff: Grocery Genie marketing site (v5)

## Overview
A single-page marketing site for Grocery Genie, an iPhone app that turns grocery receipts into itemized, categorized spending and keeps a grocery budget up to date. The page has **one goal and one call to action (CTA)**, repeated in three places (hero, mid-page, final). It ships in two states that share one layout:

| | State A: pre-launch (now) | State B: public launch |
|---|---|---|
| Goal | Waitlist sign-ups | App Store downloads |
| CTA control | Email field + **Get early access** button | Apple's official "Download on the App Store" badge, used unaltered |
| Line under the CTA | `iPhone · Free · A free year of Premium when it launches` | `Free on iPhone` |
| After sign-up | `You're in. We'll email you once, at launch.` | n/a |
| Pill (hero) | `Early access · iPhone` | `New · Now on the App Store` |
| Nav button | `Get early access` → scrolls to `#join` | `Download` → App Store URL |
| Extras | "What's next" voting, Premium sentence in FAQ | Smart App Banner meta tag, QR code next to the badge on desktop (≥961px) |

Switching to launch should be a config flag (e.g. `LAUNCH_STATE=a|b`), not a redesign.

## About the design files
The files in this bundle are **design references built in HTML**: prototypes that show the intended look, copy and behavior. They are not production code. Rebuild them in the target codebase using its own framework and patterns. If there is no codebase yet, a static-first framework fits well, e.g. **Astro or Next.js (static export)**, because the page is mostly static with a few interactive islands (waitlist form, hero animation, FAQ accordion, voting).

The React/Babel setup in the HTML (in-browser Babel, `Portal` mounting, the Tweaks panel) exists only for prototyping. **Don't port the Tweaks panel.** It's a design-review tool for flipping launch state, headline, green usage and accent color.

## Fidelity
**High fidelity.** Colors, type, spacing, copy and interactions are final. Recreate them pixel-accurately. **All copy is approved and must be used word for word.** Several lines are legally or factually constrained (see *Copy rules*).

---

## Page structure (top to bottom)

The page container is `max-width: 1200px; margin: 0 auto; padding: 0 56px` (`0 20px` at ≤960px).

### 1. Nav (sticky)
- `position: sticky; top: 0; z-index: 50`. Background `color-mix(in oklab, #F0EEE9 88%, transparent)` with `backdrop-filter: blur(12px)`. Once the page scrolls past 8px, a bottom border of `0.5px solid rgba(21,20,15,0.12)` fades in (`transition: border-color .2s`).
- Inner: `padding: 16px 56px`, flex row, `space-between`, `gap: 24px`.
- **Wordmark** (left): Leaf Drop mark (inline SVG, 26×26, `viewBox="9 9 82 82"`, nudged `top: 2px`) + `grocery` in ink + `genie` in `#1F7A4A`. Gap 7px. Font **Bricolage Grotesque 800**, 24px, letter-spacing −0.04em. The SVG paths are in the HTML and in `reference/logo-marks-v2.jsx` → `MarkLeafG`.
- **Links** (centre, hidden ≤960px): How it works · Features · Privacy · FAQ. 14px, `#4F4B41`, gap 28px. These are anchor links; `scroll-padding-top: 84px` on `html`.
- **CTA button** (right): `padding: 10px 16px; border-radius: 4px; 14px/500`. With the default "green CTAs" treatment: background `#1F7A4A`, white text, hover `#195F3A`.

### 2. Hero
- Two-column grid `minmax(0,1.1fr) minmax(0,1fr)`, gap 56px, vertically centred, `padding: 56px 0 96px`. Single column at ≤960px (`padding: 28px 0 64px`).
- **Pill:** `padding: 6px 12px; radius 999px; bg #E6E2D8; 12px uppercase; letter-spacing .08em; color #4F4B41`, with a 6px `#1F7A4A` dot. Copy depends on state.
- **H1:** Instrument Serif 400, **80px** / line-height 1, letter-spacing −0.02em, `text-wrap: balance`. 50px at ≤960px, 42px at ≤480px. `<em>` renders italic in `#4F4B41`.
  - **A (control):** See what your grocery money actually buys.
  - **B:** Your bank sees one total. We see every item.
  - **C:** Know you're over budget *before* the month is over. (*before* is `<em>`)
- **Subhead:** 19px / 1.55, `#4F4B41`, max-width 520px: *Scan a grocery receipt, and Grocery Genie sorts every item, updates your budget, and warns you before you overspend. Free on iPhone.*
- **CTA slot** (`id="join"`, max-width 480px), see *CTA slot*.
- **Hero visual (right):** an animated phone, `HeroMoment` in `marketing/hero-moment.jsx`, see *Hero animation*. On desktop it's scaled to 1.15 (`transform-origin: top center`, plus `margin-bottom: 78px` to make room for the scale). No scale on mobile.

### 3. Contrast strip (directly below the hero)
- A grid of `minmax(0,1fr) minmax(0,1.4fr)` with a 16px gap, then a caption, and `padding-bottom: 96px`.
- **Card style:** `bg #F8F6F1; border 0.5px solid rgba(21,20,15,0.12); radius 8px; padding 24px 26px; flex column gap 14px`. Card label: 12px uppercase, letter-spacing .12em, `#6E695D`.
- **Left card (label "Your bank"):** one row, `Grocery store` / `$187.43`, 18px, `#4F4B41`, tabular numbers, with top and bottom hairlines. Footer line in 14px `#6E695D`: *One line. No idea what's in it.*
- **Right card (label "Grocery Genie"):** a 2-column grid of categories. Each category has a 16px/600 header row and 13px `#4F4B41` line items underneath.
  - Groceries **$121**: Chicken thighs $11.48 · Strawberries $4.99 · Whole milk $3.79 · 24 more
  - Household **$38**: Paper towels $8.99 · Laundry pods $17.99 · 3 more
  - Snacks & Treats **$18**: Tortilla chips $4.29 · Dark chocolate $3.49 · 3 more
  - Pet **$10**: Cat food, 12 cans $9.99
  - The total row (16px/600, top border `1px rgba(21,20,15,0.28)`) reads `Total $187.43`.
- **Caption:** Instrument Serif 30px (24px on mobile): *Item by item, even when you pay cash.* The words "even when you pay cash." are italic `#1F7A4A`.

### 4. How it works (`#how`)
- Top border `1px rgba(21,20,15,0.28)`. Section head: label `HOW IT WORKS` (12px uppercase, .14em, `#6E695D`) and H2 *Three steps. No typing.* (No typing. in italics).
- **H2 style (used everywhere):** Instrument Serif 56px / 1.05, letter-spacing −0.015em (40px on mobile).
- Three columns separated by 0.5px vertical rules; stacked on mobile. Each step has a number (Instrument Serif 56px, `#1F7A4A`: 01/02/03), an H3 (19px/600) and body text (15px/1.55 `#4F4B41`).
  1. **Snap.** Scan the receipt, or import a photo or PDF you already have.
  2. **Check.** AI reads every line. You fix anything in a tap and confirm.
  3. **Stay on budget.** Your budget updates right away, and alerts reach you before you overspend.

### 5. Features (`#features`)
Three rows. Each is a 2-column grid (gap 80px, `padding: 80px 0`, top hairline), and the middle row flips sides. Each row has:
- an eyebrow (12px uppercase, .14em, `#1F7A4A`, 600)
- an H3 (Instrument Serif 46px / 1.05, 36px on mobile)
- a bullet list where each item is 16px/1.5 with an `→` arrow in `#1F7A4A`, and hairlines above each item and below the last

The phone visual sits in a container `min-height: 560px`, centred.

| Eyebrow | Headline | Bullets | Visual |
|---|---|---|---|
| Scan any receipt | One photo. *No typing.* | Finds the receipt's edges, crops it, and checks it's sharp · Import from Photos or Files · No signal? Scan anyway. It uploads when you're back online. | `MockScan` (camera view of a receipt with green scan corners) |
| Alerts before you overspend | A heads-up before the overspend, *not after.* | Alerts at 50%, 80% and 100% of your budget, with what's left and how many days remain · A weekly summary on the day you choose · Mute any category you don't care about | `MockLockAlert` (lock screen) |
| See where it all went | Your month *at a glance.* | Your budget, category by category, with a pace line that tells you mid-month whether you're on track · This month vs. last month, a 3-month trend, and your top 10 items · Every receipt, searchable, with the original photo | `MockDashboard` |

**Lock-screen notification copy (exact):** *Budget 80% reached. $42 remaining with 9 days left in this period.* A second, dimmed notification reads "Weekly summary · 9:00 AM": *$96 on groceries this week, $12 less than last week.*

### 6. Mid-page CTA
- A card (`bg #F8F6F1`, 0.5px hairline border, radius 8px, `padding: 40px 44px`) with a grid of `minmax(0,1fr) minmax(0,480px)`.
- Left: Instrument Serif 36px, *Try it on your next grocery run.* Right: the CTA slot (`loc="mid"`; in State B the QR code is omitted here).

### 7. Trust (`#privacy`)
- Hairlines `1px rgba(21,20,15,0.28)` above and below, `padding: 64px 0`, `margin-top: 96px`. Grid of `1fr 2fr`.
- **H2** (48px): *You stay in control.*
- A 2×2 grid (gap 28px 40px; one column on mobile). Each item has an H4 (17px/600) and body text (15px `#4F4B41`):
  - **You approve every receipt.** Nothing counts until you confirm it.
  - **You choose before AI reads anything.** The app asks before your first scan, and you can change your mind any time.
  - **Fix it once, it remembers.** Your corrections carry over to future receipts.
  - **Delete anything.** A deleted receipt can be restored for 30 days. You can delete your whole account from inside the app.
- **Privacy line** (18px/1.55, ink, top hairline, `padding-top: 28px`). Use these exact words:
  > Receipt photos are sent securely to Anthropic's Claude to read them. Anthropic doesn't use them to train its models. We keep the photo with your receipt until you delete it.

### 8. Also included
- Label `ALSO INCLUDED`, then a grid with 4 columns (2 at ≤960px, 1 at ≤480px) and 0.5px hairline cell borders.
- Each cell: `padding: 22px 20px`, a 22px icon in `#1F7A4A` and a 15px label. Icons are from **Lucide** (`lucide-static@0.460.0` in the prototype; use `lucide-react` or the equivalent package in production).

| Icon | Label |
|---|---|
| file-image | Import photos and PDFs |
| wifi-off | Works offline |
| pencil-line | Manual entry |
| copy | Duplicate-receipt warning |
| circle-alert | Catches big-ticket typos |
| tags | 8 automatic categories |
| chart-pie | Per-category budgets |
| calendar-days | Budget month starts on your payday |
| coins | 11 currencies |
| rotate-ccw | Restore deleted receipts for 30 days |
| apple | Sign in with Apple |
| accessibility | VoiceOver and Dynamic Type |

### 9. FAQ (`#faq`)
- H2: *Straight answers.* Native `<details>`/`<summary>` accordion.
- Each row: `padding: 24px 0`, top hairline (plus a bottom hairline on the last row). The summary is 19px/500 with a `+` in Instrument Serif 28px `#6E695D` that rotates 45° when open (`.2s`). The answer is 16px/1.6 `#4F4B41`, max-width 720px.
  - **Is it free?** Yes. Grocery Genie is free on iPhone. You can scan up to 20 receipts a month (about five a week) and add as many as you like by hand. *State A only, appended:* Join the waitlist and get a free year of Premium, our upcoming paid plan, when it launches.
  - **What if it reads my receipt wrong?** You check every receipt before it's saved. Anything the AI isn't sure about is flagged, every field is editable, and it remembers your fixes.
  - **Is my data private?** [privacy line above] You decide before AI reads your first receipt, and you can delete your account and all its data from inside the app.
  - **Which receipts work?** Printed grocery receipts from any store, plus photos and PDFs you already have.
  - **Android?** iPhone first. We'll share Android plans later.
  - **When does it launch?** ⚠️ **Team to confirm the date.** Interim copy for State A: *Early sign-ups get TestFlight access first, ahead of the public launch on the App Store. We'll email you once, at launch.* For State B: *It's out now. Grocery Genie is free on the App Store.*

### 10. Final CTA
- Block: `margin-top: 96px; padding: 72px 56px; radius 8px`. Background `#195F3A` (deep green, the default) or `#15140F` (ink). Grid of `1.1fr 1fr`, gap 56px.
- H2 in `#F0EEE9`: *Start seeing where your grocery money goes.*
- CTA slot (`loc="final"`), restyled for the dark background:
  - input: `bg rgba(240,238,233,0.08)`, border `rgba(240,238,233,0.3)`, placeholder `#C9E2D3`
  - button: `bg #F0EEE9`, text in ink, hover `#fff`
  - line under the CTA: `#E3EFE7`
  - in State B, use the white App Store badge

### 11. What's next (below the final CTA)
- Header: Instrument Serif 36px *What's next.* plus an outlined tag `COMING LATER` (11px uppercase, 1px border `rgba(21,20,15,0.28)`, radius 999px).
- Three tiles in a 3-column grid (stacked on mobile): Price tracking across stores · Household sharing · Meal planning from what you bought.
- **Tile style:** `padding: 20px 22px; 1px dashed rgba(21,20,15,0.28); radius 6px; 16px text`. Don't add dates, prices or screenshots.
- **State A only:** tiles are single-select vote buttons, each with a right-aligned label `WANT THIS` (12px uppercase `#6E695D`). The selected tile gets a solid `#1F7A4A` border and `bg #F8F6F1`, and its label turns green. The hint below reads: *Tap the one you want most. It helps us decide what to build first.* In State B the tiles are static and the hint is hidden.

### 12. Footer
- `margin-top: 72px; padding: 40px 0`, top hairline. Left: wordmark, plus 14px `#4F4B41` text *Grocery budgets that start with a receipt. Built by a small team.* Right: links Features · Privacy · FAQ.
- A legal line below: `© 2026 Grocery Genie`, 12px uppercase, .08em, `#6E695D`.

---

## CTA slot (one component, three locations: `hero`, `mid`, `final`)
- **State A, default:** a flex row with an 8px gap. Below 480px the row stacks into a column.
  - Email input: `padding 15px 16px; 1px solid rgba(21,20,15,0.28); radius 4px; 16px; bg #F8F6F1`. Focus border is ink. Placeholder `you@email.com`, `aria-label="Email address"`, `type=email required`.
  - Button `Get early access`: `padding 0 22px; radius 4px; 15px/500; bg #1F7A4A; white`, hover `#195F3A`.
  - Line under the button (14px `#4F4B41`, margin-top 14px): `iPhone · Free · A free year of Premium when it launches`.
- **State A, after a successful sign-up:** **every** slot on the page is replaced with a box (`padding 16px 18px; bg #F8F6F1; 1px border; radius 6px; 16px`) reading **You're in.** (green, bold) *We'll email you once, at launch.* Persist this, e.g. in localStorage, so a reload doesn't show the form again.
- **State A, errors (not designed in the prototype; implement):**
  - Invalid email: rely on native validation, plus an inline 13px message below the field.
  - Network failure: an inline message *Something went wrong. Please try again.*, with the form kept as it was.
  - Disable the button while the request is in flight.
- **State B:**
  - the official App Store badge (54px tall; black on light backgrounds, white on the dark final block)
  - on desktop (≥961px) and in the hero and final slots only, a 72×72 QR code linking to the App Store URL, with the caption *Scan with your / iPhone camera* (13px)
  - the line below: `Free on iPhone`
- Use the **official Apple badge artwork**, downloaded from Apple Marketing Tools and served as a local asset. Don't recreate it or hotlink it. Generate the QR code at build time (e.g. with the `qrcode` package) rather than calling a third-party API.
- Add `<meta name="apple-itunes-app" content="app-id=APP_ID">` only in State B.

## Hero animation (`marketing/hero-moment.jsx`)
This is a phone mockup: 260×520 shell, outer radius 36px, screen radius 32px, bezel `#1C1C1E`. It loops through four phases with these durations:
- **Phase 0, camera (2.4s):** black screen showing a crumpled receipt (white, rotated −3°, jagged `clip-path` edges, faint crease lines), green scan corners, and a scan line sweeping vertically (1.6s ease-in-out, alternate). Caption: "Receipt found · hold steady". Shutter button at the bottom.
- **Phase 1, items (1.5s):** the camera layer fades out (0.5s). Seven line items fade and slide up 6px into place, 0.35s each, staggered by 0.12s. Each item shows a green category chip. The budget card fades in after 0.8s.
- **Phase 2, budget (1.8s):** the ring fills from 57% to 80% (1.2s, `cubic-bezier(.3,.7,.2,1)`). "Left" changes from **$90.00** to **$41.80**, and a `+$48.20` chip appears.
- **Phase 3, hold (3.2s),** then the loop restarts.
- **Data:** Trader Joe's · Nov 21 · 7 items · **$48.20**. Chicken thighs 11.48 (Groceries), Strawberries 4.99 (Groceries), Greek yogurt 5.49 (Groceries), Paper towels 8.99 (Household), Dish soap 3.79 (Household), Tortilla chips 4.29 (Snacks & Treats), Cat litter 9.17 (Pet). The November budget is $210, with 9 days to go.
- **`prefers-reduced-motion`:** render phase 3 statically and stop the scan-line animation.
- Pause the loop when the hero is off-screen (IntersectionObserver). The prototype doesn't do this, but it should.
- In production, consider rendering the frames as a lightweight Lottie or a CSS/JS component. Keep the same numbers, because the same visual is meant to appear on the App Store screenshots and the app's first onboarding screen.

## Phone mockups (`marketing/mocks*.jsx`)
All mockups use the shared `Mock` shell from `mocks.jsx` and iOS tokens from `tokens-v2.css`. Treat them as illustrations and match them visually. They can also be exported as static SVG or PNG if that's easier.
- **`MockScan`:** dark camera view, a white receipt with mono text, green corners (`--gg-tint`), shutter button.
- **`MockLockAlert`:** lock screen with background `#1E3A2C`, date *Sunday, November 22*, time *9:41* in SF Rounded 72px/600, and notification cards (`rgba(245,245,247,0.86)`, radius 16px) with the app icon (Leaf Drop on `#F8F6F1`).
- **`MockDashboard`:**
  - header: "November so far" **$168**, "$16 less than October", and a pace chip *On pace · 5% under*
  - a 3-month mini bar chart (Sep 196, Oct 184, Nov 168)
  - "By category" bars: Groceries 112/130, Household 24/30, Beverages 19/15 shown over budget in red
  - "Top 10 items · See all": Eggs, dozen $22.96 · Organic milk $17.96 · Sparkling water $11.96

## Analytics and experiments
- **Events** (pushed to `window.dataLayer` in the prototype; map them to your analytics tool). Every event carries `state`, `headline` (a|b|c) and any `utm_*` values.
  - `headline_view`: once per page view
  - `cta_click` `{loc: nav|hero|mid|final}`
  - `waitlist_signup` `{loc}`: only after the API returns success
  - `appstore_click` `{loc}`: State B
  - `faq_open` `{id}`
  - `next_vote` `{feature}`: State A
- **UTM handling:** on landing, read `utm_source/medium/campaign/term/content`, store them for the session, attach them to every event, and include them in the waitlist API payload.
- **Headline test:** split traffic evenly between A, B and C. Assign one variant at random on first visit and keep it in a first-party cookie or localStorage (`gg_hl_variant`). Allow a `?hl=a|b|c` override for QA. Ideally render the variant server-side or at the edge to avoid the headline flickering on load.

## Copy rules (must follow)
**Never claim:**
- on-device processing
- "never shared" or "0 kb shared"
- price history or price alerts
- store comparison or personal inflation
- pantry, recipes or shopping lists
- email receipt forwarding
- household sharing (except in "What's next")
- Premium prices or features
- "unlimited" scanning
- Android dates

**Hold until confirmed:**
- **Receipt languages:** don't list them; at most say "multiple languages".
- **Continue with Google:** omit.
- **Speed or accuracy figures:** none; "in seconds" at most.
- **Weekly summary:** push only, never email.

**Social proof:** no invented numbers or testimonials. Add a real waitlist count or real TestFlight quotes only once they exist.

**Tone:** calm, clear, a little warm. Talk about money. Don't use "cooks", "kitchen" or recipe language.

## State management
- `launchState`: `'a' | 'b'`, from build config or an environment variable.
- `headlineVariant`: `'a' | 'b' | 'c'`, persisted per visitor.
- `utm`: object, kept for the session.
- `waitlistJoined`: boolean, persisted; it swaps all CTA slots at once.
- `waitlistStatus`: `idle | submitting | error`.
- `vote`: the selected tile (State A). Send it with the sign-up payload, or as its own event.

## Data and integration TODOs
- **Waitlist API:** `POST { email, loc, headline, utm_*, vote? }`. The prototype stub is `submitWaitlist()`.
- **App Store:** `APP_ID` and `APP_STORE_URL`. The prototype uses the placeholder `0000000000`.
- **Launch date:** goes into the FAQ.
- **Assets to add:**
  - official App Store badges (black and white)
  - favicon / app icon PNGs generated from the Leaf Drop mark
  - an Open Graph image (1200×630)
- **The app itself (separate repo):** the camera screens `onboarding/camera.tsx` and `scan.tsx` still say "Photos are processed on-device". This contradicts the privacy copy and must be changed.
- **Optional, State A only:** a referral module, *"Move up the line: share your link, and get TestFlight access sooner."* Build it only if the waitlist API supports referral tracking.

## Responsive behavior
- **≤960px:**
  - all two-column grids stack (hero, features, trust, CTA blocks, contrast strip, mid CTA)
  - nav links hide
  - type steps down (H1 50, H2 40, feature H3 36)
  - the hero phone isn't scaled
  - the QR code hides
  - the "Also included" grid goes to 2 columns
  - feature rows always put text before the visual (the flip is undone)
- **≤480px:** the email form stacks with a full-width button, H1 drops to 42px, the contrast categories go to 1 column, and "Also included" goes to 1 column.
- **Minimum tap target:** 44px. The FAQ summaries and vote tiles already meet it.

## Design tokens

**Marketing palette**

| Token | Value | Use |
|---|---|---|
| ink | `#15140F` | text, dark block |
| ink-2 | `#4F4B41` | secondary text |
| ink-3 | `#6E695D` | labels, captions (≥4.5:1 on paper) |
| paper | `#F0EEE9` | page background |
| paper-2 | `#E6E2D8` | pill background |
| paper-3 | `#F8F6F1` | cards, inputs |
| rule | `rgba(21,20,15,0.12)` | hairlines |
| rule-strong | `rgba(21,20,15,0.28)` | section rules, input borders |
| accent | `#1F7A4A` | CTAs, eyebrows, icons (= the app's `--gg-tint`) |
| accent-pressed | `#195F3A` | hover, final CTA block (= `--gg-tint-pressed`) |
| leaf | `#34D17A` | logo leaf only (= the app's dark-mode tint) |
| on-dark text | `#F0EEE9`, `#E3EFE7`, `#C9E2D3` | final CTA block |

**iOS tokens used by the mockups** (`tokens-v2.css`)

| Token | Value |
|---|---|
| `--ios-bg` | `#F2F2F7` |
| `--ios-bg-2` | `#FFFFFF` |
| `--ios-label` | `#000` |
| `--ios-label-2` | `rgba(60,60,67,.60)` |
| `--ios-label-3` | `rgba(60,60,67,.30)` |
| `--ios-separator` | `rgba(60,60,67,.29)` |
| `--gg-tint-bg` | `rgba(31,122,74,.12)` |
| `--sys-red` | `#FF3B30` |
| `--sys-orange` | `#FF9500` |
| Fonts | `--font-sf`, `--font-sf-rounded`, `--font-mono` (SF stacks) |

**Typography**

| Role | Font | Size / line-height |
|---|---|---|
| Display (H1, H2, feature H3, step numbers, CTA headings) | Instrument Serif 400 (Google Fonts) | H1 80/1.0 · H2 56/1.05 · Feature H3 46/1.05 · CTA-mid 36 · Trust H2 48 |
| Wordmark only | Bricolage Grotesque 800 (Google Fonts) | 24px, −0.04em |
| UI / body | system stack `-apple-system, BlinkMacSystemFont, system-ui, sans-serif` | lede 19/1.55 · sub 18/1.55 · body 15–17 · labels 12 uppercase .14em |

**Spacing:** section rhythm 96px (64px on mobile) · feature rows 80px · card padding 24–44px · grid gaps 16 / 40 / 56 / 80px.

**Radius:** 4px (buttons, inputs) · 6px (tiles, success box) · 8px (cards, CTA blocks) · 999px (pills, chips) · phone 36/32px.

**Shadows:** phone `0 30px 60px -20px rgba(21,20,15,0.35)`. Otherwise the design is flat and uses hairlines instead.

**Green treatments (prototype tweak):** `block` (default; final CTA in deep green) · `cta` (green buttons, ink final block) · `ink` (all-black buttons). Ship `block`.

## Assets
- **Logo:** Leaf Drop. Paths are inline in the HTML and in `reference/logo-marks-v2.jsx` (`MarkLeafG`). Colors `#1F7A4A` (G) and `#34D17A` (leaf). On dark backgrounds the G is `#F5EFE2` and the leaf stays `#34D17A`. The mark is concept-level, so have a designer produce final vectors before making app-icon exports.
- **Icons:** Lucide (ISC license).
- **Fonts:** Instrument Serif, Bricolage Grotesque (both Google Fonts, OFL).
- **App Store badge:** Apple Marketing Tools, used under Apple's badge guidelines. Don't modify it.
- **Phone mockups:** drawn in code; there are no image files.

## Files in this bundle
- `Grocery Genie Marketing Site v5.html`: the full page prototype (open it in a browser; it needs an internet connection for React, Babel and fonts).
- `marketing/mocks.jsx`: the `Mock` phone shell and `MockScan` (plus legacy mockups that aren't used on this page).
- `marketing/mocks-budget.jsx`: `MockDashboard`, plus `MockReview` and `MockBudget`, which aren't used in v5.
- `marketing/hero-moment.jsx`: `HeroMoment` (the hero animation) and `MockLockAlert`.
- `tokens-v2.css`: the app's iOS and brand tokens, used by the mockups.
- `tweaks-panel.jsx`: prototype-only review controls. **Don't port.**
- `reference/logo-marks-v2.jsx`: logo exploration source; only `MarkLeafG` is relevant.

## Screenshots
Captured from the prototype in `screenshots/`, for visual reference only. The README values are the source of truth. The hero animation is captured mid-loop. In State B, the App Store badge and QR code show dashed placeholders, because the official artwork isn't bundled yet.
- `01-hero-state-a.png`
- `02-contrast-strip.png`
- `03-how-it-works.png`
- `04-feature-scan.png`
- `05-feature-alerts.png`
- `06-feature-dashboard.png`
- `07-mid-cta.png`
- `08-also-included.png`
- `09-faq.png`
- `10-final-cta-state-a.png`
- `11-hero-state-b.png`
- `12-final-cta-state-b.png`
