# Conversion playbook

These are the principles behind every brief. They came out of the MVP review in [`docs/marketing/mvp/design-brief.md`](../../../../docs/marketing/mvp/design-brief.md). Apply all of them; the stage playbook says which to stress.

## 1. One goal, one call to action

- The page asks for one thing. Pick it from the goals the user gave: waitlist sign-ups, App Store downloads, Premium upgrades, household invites.
- Repeat one call-to-action label in three places: the hero, after the features and at the end.
- When the goal will change soon, design both states in one layout, so the switch is a swap. Put a state table at the top of the brief: the goal, the control, the line under the button, the after-action message and the top-of-page pill for each state.
- Name the benefit in the label: "Get early access" beats "Join waitlist". For downloads, use Apple's unaltered "Download on the App Store" badge, add Apple's Smart App Banner on mobile, and a QR code for desktop.
- The line under the button covers three things in about eight words: platform, price, incentive. For example: "iPhone · Free · A free year of Premium for early sign-ups".

## 2. Lead with the product's key moment, not the features

- The hero visual shows the moment the product pays off. At MVP, a crumpled receipt turns into categorized items and a budget that updates. Each stage adds a new moment (see the stage playbook), but scanning a receipt stays the way in.
- The headline sells the outcome. The subhead names the mechanism in one sentence and ends with the platform and price.
- Write three headline options for an A/B test, each from a different angle: curiosity, contrast, prevention or gain. Every option must be true today. Keep the current headline as the control.

## 3. Put the differentiator up front as a contrast

Grocery Genie's lasting advantage is that it reads every line of the receipt, and one scan feeds several features. Put this right under the hero as a side-by-side contrast, using realistic numbers that add up:
- "Your bank: Grocery store · $187.43", next to the same total split into categories.
- At later stages, the contrast grows: one scan updates the budget, the price history, the pantry.

## 4. Order sections by habit, not by build order

The PRD's core bet is that an immediate payoff builds a scanning habit. The feature that brings people back belongs in the first two feature sections:
- MVP: budget alerts and the weekly summary.
- V1.1: price-change alerts.
- V2.0: expiry nudges and "cook tonight".

The site describes the whole app as built so far, not just the latest stage, so the structure grows with the product:
- **One feature section per value layer the app has shipped,** up to five: budget (MVP), prices (V1.1), household (V1.5), pantry and meals (V2.0), insights (V2.5–V3.0). Each section gets one phone visual, a headline of five to eight words, and two or three bullets.
- **The layer that best builds the habit leads.** It's usually the newest one, marked "New". Earlier layers stay as full sections, not footnotes; they're the reason the product compounds.
- **When there are several layers, the hero tells the one-scan story:** a single receipt feeds the budget, the price history and the pantry. That compounding is the product's main differentiator.
- **Everything else from every stage goes in the "Everything included" grid** of short labels, grouped by layer, so the page lists the full app without a wall of text.

## 5. Answer the four objections with true statements

Every brief answers these four, in the trust block or the FAQ:

| Objection | What the answer is made of |
|---|---|
| "What does it cost?" | The real price model, the limits stated plainly, any incentive |
| "What if it gets it wrong?" | You approve every receipt, anything uncertain is flagged, it learns from your fixes |
| "Is my data safe?" | The privacy wording, consent before AI reads anything, deleting from inside the app |
| "Is it a hassle?" | One photo, import what you already have, works offline |

Make the trust block a selling point, under a headline like "You stay in control.", not a list of disclaimers.

## 6. Copy rules

- **Benefit first, fact second.** "Fix it once. It remembers." beats "Learns your corrections."
- **No internal names.** Turn "pace line", "confidence flags", "big-ticket check" and story IDs into what the user gets.
- **Real numbers persuade:** "8 categories", "alerts at 50%, 80% and 100%", "restore within 30 days". Use only numbers the code confirms.
- **Detail goes in the FAQ.** Currency rules, file formats and limits belong in the FAQ or the grid, not the hero.
- **Match the persona's tone.** The MVP is about money, so its tone is calm and clear. Don't use kitchen or cooking language until the meal planner ships.
- **Short and plain.** Headlines up to 8 words, bullets up to 12, no exclamation marks, no "revolutionary".

## 7. Social proof that holds up

- Only use proof with a source you can name: a live waitlist count, TestFlight or App Store reviews you have permission to quote, press, the App Store rating.
- Before real proof exists, use a founder note (why we built this) and a concrete product example.
- Remove any stat or testimonial that refers to a feature that isn't built, even if it's real.

## 8. Growth loops

Pick a loop that suits the stage, and say where its code lives. Mark it optional if the code doesn't exist yet.

| Loop | When | Needs |
|---|---|---|
| Referral queue ("invite friends, get in sooner") | Before launch, waitlist | Referral tracking in `marketing/api/` |
| "Coming later" vote (sign-ups pick the next feature) | Any stage with a waitlist or email list | One extra field on the form |
| Household invite (each invite brings a new user) | V1.5 onward | In-app invites (HH-01) and a landing page for invite links |
| Shareable weekly or price card | When the app has a share action | An in-app share feature; don't promise it before it ships |
| Personal inflation or savings story | V2.5 onward | Real aggregate data; never invent figures |

## 9. Measurement

Every brief names:
- the events: call-to-action click, conversion completed (waitlist sign-up, App Store badge click, upgrade click), FAQ expand;
- UTM handling, so campaigns can be compared;
- the headline A/B split, with the control.

## 10. Same message everywhere

The landing page, the App Store screenshots and the app's first onboarding screen use the same headline and hero visual. For an iOS app, most people decide on the App Store page, so remind the user that the brief feeds the screenshots as well.

## 11. The roadmap section

A "What's next" section below the final call to action is good for conversion, because it shows the product will grow. Give no dates unless the user confirms them, no prices, and no screenshots that look finished. Label the section clearly, and never mix later-stage features into the hero or feature sections.
