# Grocery Genie landing page: V1.1 brief (1.1.0)

Written 2026-11-04. The facts come from [feature-scope.md](feature-scope.md) and the decisions from [decisions.md](../decisions.md). It builds on the [MVP brief](../mvp/design-brief.md): same structure and tokens, with prices added as the lead layer. Paste everything below the line into Claude Design.

**Out of date on pricing (2026-11-04):** decisions [#18–#20](../decisions.md) replace this brief's $5.99/month and its "store comparison stays free" lines (sections 0, 8 and 9): Premium is $4.99/month or $39.99/year with a 7-day trial, and store comparison and mutes become Premium. Rerun `marketing-site-brief` for V1.1 once DA-1 ships, before State B goes live; State A is unaffected.

---

## 0. Goal and call to action (two states, one layout)

The page has a single goal and one call to action, repeated after the hero, after the features and at the bottom. Keep both states from the MVP page.

| | State A: pre-launch (now) | State B: public launch |
|---|---|---|
| Goal | Waitlist sign-ups | App Store downloads |
| Main control | Email field + **Get early access** | Apple's official "Download on the App Store" badge, unaltered; QR code for desktop |
| Line under the button | iPhone · Free · A free year of Premium when it launches | Free on iPhone · Premium $5.99/month |
| Note under the form | "We'll email you once, at launch. Sign up in the app with this same email and we'll match it to your account for the free Premium year." (the privacy disclosure; keep it word for word) | (none) |
| After the action | "You're in. We'll email you once, at launch." | (none) |
| Pill at the top of the page | Coming Q4 2026 · iPhone | New · Now on the App Store |

- **Premium:** upgrades happen in the app. The page sells the download.
- **Pricing table:** State B only, and only once the App Store product is live (section 8).

## 1. Audience and tone

- **Who:**
  - the person who does the household's grocery shopping;
  - now also the shopper who compares prices across stores.
- **What they want to know:** "Where is my grocery money going?" and "Am I paying too much for this?"
- **Tone:** calm, clear and a little warm. Talk about money and prices, not cooking.

## 2. Hero

- **Headline (A/B test these; all are true):**
  - A (control): See what your grocery money actually buys.
  - B: Your bank sees one total. We see every item.
  - C: Know when your groceries get pricier.
- **Subhead:** Scan a grocery receipt, and Grocery Genie sorts every item, updates your budget, and tracks what each item costs at every store you shop. Free on iPhone.
- **Call to action:** see section 0.
- **Visual:** one crumpled receipt splitting into two screens: the budget ring filling, and an item's price chart ticking up ("Milk · up 12%"). Label the numbers as an example. This is the product's key moment: one scan, two answers.

## 3. Contrast strip (directly below the hero)

Three side-by-side cards, with realistic numbers that add up:

- **Your bank:** "Grocery store · $187.43". Caption: "One line. No idea what's in it."
- **A flyer:** "Milk $3.49*". Caption: "*List price. Not what you paid."
- **Grocery Genie:** the same $187.43 split into categories, with one line expanded: "Milk $4.29 · up 12% from your 30-day average".
- **Caption under the strip:** "What you actually paid, item by item, store by store."

## 4. How it works (3 steps)

1. **Snap.** Scan the receipt, or import a photo or PDF you already have.
2. **Check.** AI reads every line. Fix anything in a tap and confirm.
3. **Know.** Your budget updates, every item's price history grows, and alerts reach you when a budget runs low or a price jumps.

## 5. Feature sections (one phone visual each, newest first)

### Prices: New
Headline: **Know what your groceries really cost.**
- Every item gets a price history from your own receipts
- See which store charges you less, cheapest first
- It knows "ORG BANANAS" and "Organic Bananas" are the same, and asks when it isn't sure
- Visual: item detail for "Milk": latest price, a line chart, and "Compare stores" with one store labelled "Cheapest". Example data, labelled.

### Alerts: New price alerts, plus your budget
Headline: **A heads-up when it matters.**
- An alert when a regular buy is 10% above or below its usual price; you pick the threshold
- Budget alerts at 50%, 80% and 100%, with what's left and the days remaining
- A weekly summary on the day you choose; mute any item, store or category
- Visual: two lock-screen notifications:
  - "Milk price up 12%: $4.29 at Corner Market, up 12% from your 30-day average of $3.83."
  - "Budget 80% Reached: $42 remaining with 9 days left in this period."

### Budget
Headline: **Your month at a glance.**
- Your budget by category, and a mid-month check on whether you're on track
- This month vs. last month, a 3-month trend, and your top 10 items
- Every receipt, searchable, with the original photo; tap any line to see its price history

### Scan any receipt
Headline: **One photo. No typing.**
- Finds the receipt's edges, crops it, and checks it's sharp
- Import from Photos or Files
- No signal? Scan anyway. It uploads when you're back online.

## 6. Trust block

Headline: **You stay in control.**
- **You approve every receipt.** Nothing counts until you confirm it.
- **You choose before AI reads anything.** The app asks before your first scan, and you can change your mind any time.
- **Your prices are yours.** Price history and comparisons come from your own receipts, not from anyone else's.
- **Fix it once, it remembers.** Corrections and item matches carry over to future receipts.
- **Delete anything.** A deleted receipt can be restored for 30 days. You can delete your whole account from inside the app.

Privacy line (use exactly this, here and in the FAQ):
> Receipt photos are sent securely to Anthropic's Claude to read them. Anthropic doesn't use them to train its models. We keep the photo with your receipt until you delete it.

## 7. Everything included (short labels, grouped)

- **Prices:** Price history · Store comparison · Price alerts · Mute items or stores · Merge or split items ("Same item?" Yes, merge / Keep as separate item / Skip)
- **Budget:** 8 automatic categories · Per-category budgets · Budget month starts on your payday · Spending pace · 11 currencies · Weekly summary
- **Scan:** Import photos and PDFs · Works offline · Manual entry · Duplicate-receipt warning · Catches big-ticket typos
- **Account:** Restore deleted receipts for 30 days · Sign in with Apple · VoiceOver and Dynamic Type

## 8. Free vs Premium (State B only, once the App Store product is live)

Headline: **Free does a lot. Premium does more.**

| Free | Premium: $5.99/month |
|---|---|
| Scan and review receipts: 20 a month | Unlimited receipts |
| Budgets, alerts and the weekly summary | Everything in Free |
| Price history, price alerts, store comparison | Your own categories (up to 10) |
| 3-month trend | 12-month trend |
| 8 categories | Budget rollover |
| | Export your data (JSON or CSV) |

- **Line under the table:** "Price history, price alerts and store comparison stay free." This matches the app's paywall.
- **Price:** take it from the App Store listing on launch day; the app shows the App Store's price.
- **State A:** no table. Keep the free-year line.

## 9. FAQ

- **Is it free?**
  - State A: Yes. Grocery Genie is free on iPhone, including price history and price alerts. The free plan includes 20 receipts a month. Join the waitlist and get a free year of Premium, our upcoming paid plan, when it launches.
  - State B: Yes. Grocery Genie is free on iPhone, including price history, price alerts and store comparison. The free plan includes 20 receipts a month. Premium ($5.99/month) adds unlimited receipts, your own categories, a 12-month trend, budget rollover and data export.
- **How does the free year of Premium work?** *(State A only.)* Keep the current answer word for word.
- **How does it know it's the same product?** Receipts write the same product differently. Grocery Genie matches the names for you, asks when it isn't sure, and you can combine or split items any time.
- **Which stores can I compare?** Any store you shop at. After you've bought an item twice at a store, that store shows up in the comparison.
- **What if it reads my receipt wrong?** You check every receipt before it's saved. Anything the AI isn't sure about is flagged, every field is editable, and it remembers your fixes.
- **Is my data private?** The privacy line, then: "You decide before AI reads your first receipt, and you can delete your account and all its data from inside the app."
- **Which receipts work?** Printed grocery receipts from any store, plus photos and PDFs you already have.
- **Android?** iPhone first. We'll share Android plans later.
- **When does it launch?**
  - State A: "Grocery Genie launches on iPhone in Q4 2026. We'll email you once, at launch." Drop the TestFlight sentence unless the team confirms early TestFlight access.
  - State B: "It's out now. Grocery Genie is free on the App Store."

## 10. Final call to action

Headline: **Start seeing what your groceries really cost.**
Same control as section 0.

## 11. What's next (below the final call to action, clearly labelled)

Headline: **What's next.**
Household sharing · Meal planning from what you bought · Your personal grocery inflation

- No dates, prices or screenshots that look finished.
- State A: keep the "tap the one you want most" vote.
- Remove "Price tracking across stores" from this list: it's built now.

## 12. Social share card (`og-image.svg` → `og-image.png`, 1200×630)

- **Content:** headline A and the one-scan, two-answers visual: a budget ring next to a price chart. Keep the headline clear of the phone.
- **Pill:**
  - State A: "Coming Q4 2026 · Join the waitlist".
  - State B: "Now on the App Store".
- **Meta tags:** update `description` and `og:description` to the subhead.
- **Render:** with Chromium, not ImageMagick.

## 13. Growth loop

- **State A:** keep the "What's next" vote. The referral queue is still optional (it needs referral tracking in `marketing/api/`).
- **State B:** a share card for price alerts ("Milk is up 12% at my store") would suit V1.1, but **the app has no share action.** It would need app work first (optional, `mobile/`). Don't show sharing on the page until it exists.

## Rules

- **Never claim:**
  - on-device processing, "never shared" / "0 kb shared";
  - store name clean-up, grouping chains, or merging stores (V11-05 not built);
  - flyer, deal or coupon prices;
  - community or crowd-sourced prices;
  - basket comparison ("cheapest store for your whole shop");
  - personal inflation;
  - household sharing (except under "What's next");
  - pantry, recipes, shopping lists or meal plans;
  - a Family plan;
  - savings figures;
  - "unlimited" for the free plan;
  - Android dates.
- **Hold until confirmed:**
  - The Premium price and pricing table: until the App Store product is live (decision #16).
  - "Claim it in Settings" as working: until V11-P5 ships.
  - Receipt languages by name: say "multiple languages" at most.
  - "Continue with Google".
  - Any accuracy, match-rate or speed figure (decisions #5, #17).
  - Early TestFlight access.
- **Free-plan wording:** say "20 receipts a month", not "scan up to 20". The count includes receipts added by hand (feature-scope §4.6).
- **Example data:** the milk and Corner Market numbers are illustrations, and the store is made up; don't use real retailers' names or logos. Label them as examples, and don't present them as a real user's data.
- **Social proof:** no invented numbers or testimonials. A real waitlist count, and real TestFlight or App Store quotes, once they exist.
- **Measurement:**
  - track `headline_view`, `cta_click`, `waitlist_signup` (State A) and `appstore_click` (State B);
  - track `faq_open`, including the new FAQ ids, and `next_vote`;
  - keep UTM handling;
  - split traffic evenly across the three hero headlines, with A as the control.
- **Consistency:** use the same headline and hero visual on the App Store screenshots and the app's first onboarding screen. The onboarding tagline is still budget-only ("Snap a receipt, watch your grocery budget take shape."); update it to match if headline B or C wins.
- **Design tokens:** keep `marketing/src/styles/tokens-v2.css` and the page palette in `marketing/src/styles/site.css`.
