# Stage playbook

Defaults for each roadmap stage. They come from the PRD (`docs/prd/00-overview.md`, `PHASE_SCOPE.md` and the epic files) and from [`docs/marketing/decisions.md`](../../../../docs/marketing/decisions.md). They're starting points: the code decides what is built, and the user decides the goals.

Every stage is cumulative. The "Layers on the page" column lists every section the site carries at that stage, not only the new one.

## At a glance

| Stage | Name | New layer | Layers on the page | Default goal | Habit driver to put first |
|---|---|---|---|---|---|
| MVP | Budget Copilot | Budget | Budget | Waitlist sign-ups, then App Store downloads at launch | Budget alerts, weekly summary |
| V1.1 | Price Intelligence | Prices | Budget, Prices | App Store downloads; Premium upgrades second | Price-change alerts |
| V1.5 | Household | Household | Budget, Prices, Household | Downloads and household invites | Shared budget alerts |
| V2.0 | Meal Planner | Pantry and meals | Budget, Prices, Household, Pantry and meals | Downloads; Family upgrades second | Expiry nudges, "cook tonight" |
| V2.5 | Intelligence | Insights | All of the above plus Insights | Downloads; sharing insights | Restock reminders, personal inflation |
| V3.0 | Advanced | Insights (deeper) | All of the above | Downloads; retention and upgrades | Taste-based weekly plan |

## MVP: Budget Copilot

- **Key moment:** a crumpled receipt turns into categorized items and a budget that updates.
- **Contrast:** "Your bank sees one total. We see every item."
- **Persona and tone:** the household budget manager (Sarah in `00-overview.md`). Talk about money; no cooking language.
- **Price:** free, with no paid tiers. Check the scan quota in `config.py` (`free_tier_receipts_per_month`): say "Free" in the hero and state the limit in the FAQ.
- **Growth loops:** referral queue (optional, `marketing/api/`), a vote on which "Coming later" feature comes next.
- **CTA states:** waitlist, then App Store. The waitlist incentive is in `decisions.md`.
- **Never claim:** anything from V1.1 onward.
- **Worked example:** [`docs/marketing/mvp/`](../../../../docs/marketing/mvp/).

## V1.1: Price Intelligence (Premium launches)

- **New in the code to check:** price history (PI-01), item matching (PI-02), price-change alerts (PI-03), cross-store comparison (PI-04), the Premium tier, custom categories, data export.
- **Key moment:** one scan updates both the budget and each item's price history. A visual like "Olive oil · up 12% since spring" must be marked as an example.
- **Contrast:** "Flyers show list prices. We track what you actually paid."
- **Persona:** add the comparison shopper (Linda) next to Sarah.
- **Section order:** Prices (new) → Budget → Scan and review.
- **Price:** the first pricing section. Check the tiers and prices in the build; the PRD says Premium is $5.99 a month, with limited free price history (`OPEN_QUESTIONS.md` #3). Show free next to Premium; anchor on what the free tier keeps.
- **Promises to honour:** the free year of Premium for waitlist sign-ups (see `decisions.md`). The match is automatic, by email (`decisions.md` #7, to-do list in `docs/launch-open-items.md` §6). Check that it's built and working before the site talks about the offer as available.
- **Growth loops:** a price-change alert you can share, but only if the app has a share action.
- **New objection:** "Is my price data shared?" Answer it from `privacy.ts` as it stands at V1.1.
- **Never claim:** household, pantry, recipes, community pricing.

## V1.5: Household

- **New in the code to check:** invites (HH-01), roles (HH-02), household vs. individual views (HH-03), member limits by tier.
- **Key moment:** two phones scanning into one shared budget.
- **Section order:** Household (new) → Budget → Prices → Scan and review.
- **Price:** check the member limits by tier (the PRD says Premium allows up to 5, Family unlimited).
- **Growth loop:** the household invite, which is a built-in viral loop. Design a landing state for people arriving from an invite link ("Sam invited you to the Rivera household").
- **New objection:** "Can my partner see everything?" Answer it from the role rules in the code.
- **Never claim:** pantry, recipes, community features.

## V2.0: Meal Planner

- **New in the code to check:** ingredient classification (MP-01), virtual pantry (MP-02), recipe suggestions (MP-03), expiry notifications (MP-04), smart shopping list (MP-05), the Family tier.
- **Key moment:** one scan fills the budget, the price history and the pantry, and tonight's dinner uses what's about to expire. This is the first stage where the one-scan, three-layer story is fully true; make it the hero.
- **Persona and tone:** add the meal planner (Marcus). Kitchen and cooking language is now allowed.
- **Section order:** Pantry and meals (new) → Budget → Prices → Household → Scan and review.
- **Numbers:** food-waste figures only with a cited source (for example, USDA), and never presented as our users' results unless we've measured them.
- **Never claim:** basket comparison, personal inflation, community pricing, LLM recipe variations, taste profiles.

## V2.5: Intelligence

- **New in the code to check:** basket comparison (AI-01), personal inflation index (AI-02), restock reminders (AI-05), community price sharing.
- **Key moment:** "Your groceries went up 4.1% this year, and your basket is cheapest at store X." Example figures must be labelled as examples.
- **Growth loops:** a personal-inflation card you can share, and community pricing, which gets more useful as more people take part. Say it's opt-in only if the code makes it opt-in.
- **New objection:** "Is my data pooled?" Use the exact opt-in and anonymisation wording from `privacy.ts`.
- **Never claim:** V3.0 features.

## V3.0: Advanced

- **New in the code to check:** LLM recipe variations (AI-03), food waste score (AI-04), semantic search (AI-06), taste profiles.
- **Key moment:** "The week plans itself", built from your own receipts.
- **Numbers:** waste-reduction claims only from measured data, with the method stated in the FAQ.
- **Roadmap section:** only what the team confirms is next.

## Carry-overs at every stage

- Re-check every earlier promise in `decisions.md`, such as incentives, prices and dates.
- Keep the privacy wording in step with `privacy.ts`. Each new layer usually adds a data use, so read the policy again at every stage.
- Update the App Store screenshots and the first onboarding screen to the new hero message.
