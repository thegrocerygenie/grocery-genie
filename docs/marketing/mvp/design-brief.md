# Grocery Genie landing page: MVP brief (app version 0.1.0)

Written 2026-11-03. The facts come from [feature-scope.md](feature-scope.md) and the decisions from [decisions.md](../decisions.md). Paste everything below the line into Claude Design.

---

## 0. Goal and call to action (two states, one layout)
The page has a single goal and one call to action, repeated after the hero, after the features, and at the bottom. Design both states now so launch day is a swap, not a redesign.

| | State A: pre-launch (now) | State B: public launch (soon) |
|---|---|---|
| Goal | Waitlist sign-ups | App Store downloads |
| Main control | Email field + **Get early access** button | Apple's official "Download on the App Store" badge, used unaltered |
| Line under the button | iPhone · Free · A free year of Premium for early sign-ups | Free on iPhone |
| Note under the form | "We'll email you once, at launch. Sign up in the app with this same email and we'll match it to your account for the free Premium year." (the privacy disclosure for waitlist matching; keep it) | (none) |
| After sign-up | "You're in. We'll email you once, at launch." | (none) |
| Pill at the top of the page | Coming Q4 2026 · iPhone | New · Now on the App Store |

- The control sits in one slot, so State B swaps the form for the badge.
- In State B, also add Apple's Smart App Banner on mobile, plus a QR code for desktop visitors.
- **Premium wording:** Premium is an upcoming paid plan; it doesn't exist yet. Say "a free year of Premium when it launches". Don't list Premium features or a price.

## 1. Audience and tone
- **Who:** the person who does the household's grocery shopping, aged 28–45, who has given up on spreadsheets and bank-app totals.
- **What they want to know:** "Where is my grocery money going?"
- **Tone:** calm, clear and a little warm. Talk about money, not cooking. Don't use "cooks", "kitchen" or recipe language.

## 2. Hero
- **Headline (A/B test these; all are true):**
  - A (control): See what your grocery money actually buys.
  - B: Your bank sees one total. We see every item.
  - C: Know you're over budget *before* the month is over.
- **Subhead:** Scan a grocery receipt, and Grocery Genie sorts every item, updates your budget, and warns you before you overspend. Free on iPhone.
- **Call to action:** see section 0.
- **Visual:** an iPhone showing a crumpled grocery receipt turning into categorized line items and a budget ring that fills a little. This is the product's key moment, so make it the hero.

## 3. Contrast strip (directly below the hero)
Two side-by-side cards:
- **Your bank:** "Grocery store · $187.43"
- **Grocery Genie:** the same $187.43 split into categories (Groceries $121 · Household $38 · Snacks & Treats $18 · Pet $10), with a few real-looking line items.
- **Caption:** Item by item, even when you pay cash.

## 4. How it works (3 steps)
1. **Snap.** Scan the receipt, or import a photo or PDF you already have.
2. **Check.** AI reads every line. You fix anything in a tap and confirm.
3. **Stay on budget.** Your budget updates right away, and alerts reach you before you overspend.

## 5. Three feature sections (one phone visual each)

### Scan any receipt
Headline: **One photo. No typing.**
- Finds the receipt's edges, crops it, and checks it's sharp
- Import from Photos or Files
- No signal? Scan anyway. It uploads when you're back online.

### Alerts before you overspend
Headline: **A heads-up before the overspend, not after.**
- Alerts at 50%, 80% and 100% of your budget, with what's left and how many days remain
- A weekly summary on the day you choose
- Mute any category you don't care about
- Visual: a lock-screen notification reading "Budget 80% reached. $42 remaining with 9 days left in this period."

### See where it all went
Headline: **Your month at a glance.**
- Your budget, category by category, with a pace line that tells you mid-month whether you're on track
- This month vs. last month, a 3-month trend, and your top 10 items
- Every receipt, searchable, with the original photo

## 6. Trust block
Headline: **You stay in control.**
- **You approve every receipt.** Nothing counts until you confirm it.
- **You choose before AI reads anything.** The app asks before your first scan, and you can change your mind any time.
- **Fix it once, it remembers.** Your corrections carry over to future receipts.
- **Delete anything.** A deleted receipt can be restored for 30 days. You can delete your whole account from inside the app.

Privacy line (use exactly this):
> Receipt photos are sent securely to Anthropic's Claude to read them. Anthropic doesn't use them to train its models. We keep the photo with your receipt until you delete it.

## 7. "Also included" grid (short labels, icons, no paragraphs)
Import photos and PDFs · Works offline · Manual entry · Duplicate-receipt warning · Catches big-ticket typos · 8 automatic categories · Per-category budgets · Budget month starts on your payday · 11 currencies · Restore deleted receipts for 30 days · Sign in with Apple · VoiceOver and Dynamic Type

## 8. FAQ
- **Is it free?** Yes. Grocery Genie is free on iPhone. You can scan up to 20 receipts a month (about five a week) and add as many as you like by hand. *(State A only: Join the waitlist and get a free year of Premium, our upcoming paid plan, when it launches.)*
- **What if it reads my receipt wrong?** You check every receipt before it's saved. Anything the AI isn't sure about is flagged, every field is editable, and it remembers your fixes.
- **Is my data private?** Use the privacy line from section 6, then add: "You decide before AI reads your first receipt, and you can delete your account and all its data from inside the app."
- **Which receipts work?** Printed grocery receipts from any store, plus photos and PDFs you already have.
- **Android?** iPhone first. We'll share Android plans later.
- **When does it launch?** Q4 2026, on iPhone. *(State B: "It's out now on the App Store.")*

## 9. Final call to action
Headline: **Start seeing where your grocery money goes.**
Same control as section 0.

## 10. Coming later (below the final call to action, clearly labelled)
Headline: **What's next.**
Price tracking across stores · Household sharing · Meal planning from what you bought
- No dates, prices or screenshots that look finished.
- Optional: let State A sign-ups pick the one they want most.

## 11. Optional referral module (State A only)
"Move up the line: share your link, and get TestFlight access sooner."
Design it only if the team builds referral tracking into the waitlist API.

## 12. Social share card (`og-image.svg` → `og-image.png`, 1200×630)
This image is what people see when the link is shared in Messages, Slack or social apps, so it does a lot of the sharing work.
- Use the hero headline (the winning A/B variant) and the receipt-to-budget visual. The current card advertises price tracking and the pantry; replace it.
- Keep the headline clear of the phone mock-up, so the text doesn't overflow at 1200×630.
- State A: "Coming Q4 2026 · Join the waitlist". State B: "Now on the App Store".
- Also update the page's `<meta name="description">` and `og:description` to the new subhead.

## Rules
- **Never claim:**
  - on-device processing
  - "never shared" / "0 kb shared"
  - price history or price alerts
  - store comparison or personal inflation
  - pantry, recipes or shopping lists
  - email receipt forwarding
  - household sharing (except under "Coming later")
  - Premium prices or features
  - "unlimited" scanning
  - Android dates
- **Hold until confirmed:**
  - Listing specific receipt languages: say "multiple languages" or leave it out.
  - "Continue with Google": leave it out.
  - Any speed or accuracy figure: say "in seconds" at most.
  - Weekly summary by email: push only.
- **Social proof:** no invented numbers or testimonials. A real waitlist count and real TestFlight quotes are fine once they exist.
- **Measurement:** track these events:
  - call-to-action clicks
  - successful waitlist sign-ups (State A)
  - App Store badge clicks (State B)

  Also add UTM handling, and split traffic evenly across the three hero headlines.
- **Consistency:** use the same headline and hero visual on the App Store screenshots and the app's first onboarding screen.
- **Design tokens:** keep `marketing/tokens.css` unless the team asks for a new visual direction.
