# MVP feature scope: what Grocery Genie ships at launch

Written 2026-11-02 from `main` at `eb0ccf3`, for the landing-page redesign.

This list describes what the app does today. It comes from the code, not just the PRD. The MVP has grown past the original list in [PHASE_SCOPE.md](../../prd/PHASE_SCOPE.md), so section 3 lists the additions. Section 5 lists what the current marketing site claims but the MVP does not do. Those claims need to come off the new page. The Claude Design brief built from this list is [design-brief.md](design-brief.md). The `marketing-site-brief` skill writes both files for each roadmap stage.

The MVP is the first stage, so every feature here dates from the MVP, in one value layer: budget.

How to read the status column:
- **Built**: in the code on `main`, with a test that would fail if it broke. This is from reading the code and the 2026-10-29 audit; the suite wasn't rerun for this list.
- **Built, device check pending**: built and tested, but not yet checked on a real iPhone (see [device-checklist.md](../../device-checklist.md)). It can go on the site; recheck before launch.
- **Built, unverified**: built, but untested or not measured. Keep it off the site.
- **Hold**: built, but not set up for production. Keep it off the site.

---

## 1. Positioning

- **One-line pitch (the app's own tagline):** "Snap a receipt, watch your grocery budget take shape."
- **The promise:** you scan the receipt, and the budget updates on its own. You don't type anything in and you don't sort anything.
- **Who it's for:** someone who runs the household's grocery shopping and asks "where is my grocery money going?" A bank app shows "$187 at Loblaws". Grocery Genie shows what that $187 bought.
- **Why it's different:** bank-feed budgeting apps (Mint, YNAB, Copilot) see only the store total. Grocery Genie reads every line on the receipt, so it covers cash purchases too.
- **Platform:** iPhone only. No Android, iPad or web app at launch.
- **Price:** free. No paywall, subscription or in-app purchase. The one limit is 20 receipt scans a month; manual entry has no limit (see section 4).

## 2. Feature list

Grouped into six pillars, in the order a user meets them. Each feature has a short benefit line you can use as copy, the facts behind it, and the PRD story it comes from.

### Pillar A: Scan any receipt

| Feature | Benefit line | What it actually does | PRD | Status |
|---|---|---|---|---|
| Document scanner | Point, scan, done. | Scan opens Apple's document scanner. It finds the receipt's edges, crops the photo, and lets you retake before you use it. | RC-01 | Built, device check pending |
| Photo quality check | No blurry scans. | Before upload, the app checks the photo for blur and low light. A bad photo is held back with **Retake** or **Use Scan**. | RC-01 | Built |
| Import from Photos or Files | Got a receipt you snapped last week? Import it. | Choose from your photo library or Files: JPEG, PNG, HEIC, or a one-page PDF. Imports go through the same review as a scan. | RC-03 | Built |
| Manual entry | No receipt? Add it by hand. | Enter the store, date and items yourself. Manual entry is also offered when a scan can't be read. | added | Built |
| Offline scanning | Scan in the parking lot, even with no signal. | A receipt scanned or imported offline waits on the phone and uploads by itself when you're back online. You can see it under **Pending** in History. | MVP list | Built |
| Receipts in six languages | Works on receipts in six languages. | Reads receipts in English, French, Spanish, German, Serbian (Cyrillic) and Mandarin. It handles comma and period decimals ("4,99" and "4.99") and picks up the receipt's currency. | RC-05 | Built, unverified (no accuracy test yet) |

### Pillar B: AI reads it, you approve it

| Feature | Benefit line | What it actually does | PRD | Status |
|---|---|---|---|---|
| AI extraction | Every line, read for you. | AI reads the store, date, every item (name, quantity, unit price, line total), subtotal, tax and total. | RC-01 | Built |
| Confidence flags | It tells you what to double-check. | A field the AI isn't sure about is highlighted with "Low confidence, please verify". | RC-02 | Built |
| Tap-to-edit review | Fix anything in a tap. | Every field can be edited before saving. If you change a quantity, the line total stays what you paid and the row shows the new unit price ("Qty 2 · $0.65 each"). | RC-02 | Built |
| Nothing saves without you | You approve every receipt. | A receipt counts toward your budget only after you tap Confirm. | RC-02 | Built |
| Big-ticket check | A second look at big numbers. | An item over $100, or a receipt over $500, asks you to confirm before saving. | RC-02 | Built |
| Duplicate warning | Scanned the same receipt twice? We'll notice. | Review shows a "Possible duplicate" banner when the receipt matches one you already saved. | added | Built |
| Learns your corrections | Correct an item once and it stays corrected. | The app remembers your corrections. If you rename "GRN BNLS" to "Green Beans", the next scan uses your name. | RC-02 | Built |
| Original photo kept | The receipt is always there to check. | The receipt photo is saved with its data, and you can view it from History. | RC-02 | Built |

### Pillar C: Spending sorts itself

| Feature | Benefit line | What it actually does | PRD | Status |
|---|---|---|---|---|
| Auto-categorization | Where your money goes, sorted for you. | AI puts every item into one of 8 categories: Groceries, Household, Personal Care, Beverages, Snacks & Treats, Baby & Kids, Pet, Other. A category it isn't sure about is flagged for you to check. | BC-01 | Built |
| One-tap recategorize | Wrong category? One tap. | Tap an item's category dot and pick another. You can also set a category for the whole receipt at once. | BC-05 | Built |
| Corrections apply to past receipts | Fix it once, and past receipts update too. | A category change applies to that item on your past receipts and on every future scan. | BC-05 | Built |

### Pillar D: Budgets that keep up

| Feature | Benefit line | What it actually does | PRD | Status |
|---|---|---|---|---|
| Monthly budget | Set one number. We do the math. | One overall monthly grocery budget. Onboarding offers to set it, and you can skip that step. | BC-02 | Built |
| Per-category budgets | Cap snacks without capping groceries. | Give any of the 8 categories its own monthly limit. | BC-02 | Built |
| Custom start day | Your month, matched to your payday. | The budget month can start on any day from the 1st to the 28th. | BC-02 | Built |
| Edit anytime | Change a budget and it updates right away. | Changes apply to the current month as soon as you save them. | BC-02 | Built |
| Spending pace | Know if you're on track before the month ends. | The dashboard shows "On pace · 5% under" or "Ahead of pace · 12% over" by comparing what you've spent with how much of the month has gone. | added | Built |
| Multi-currency | Shop abroad without mixing currencies. | The budget currency comes from your iPhone's region, and you can change it in Settings (11 currencies). A receipt in another currency is kept and shown, marked "Not counted in your budget", so totals don't mix currencies. | RC-05 | Built |

### Pillar E: Alerts before you overspend

| Feature | Benefit line | What it actually does | PRD | Status |
|---|---|---|---|---|
| Budget alerts | A heads-up before the overspend, not after. | Push notifications at 50%, 80% and 100% of a budget. You choose which ones you get. Each alert is sent at most once a month. | BC-03 | Built, device check pending |
| Alerts with context | Every alert says what's left. | "$42 remaining with 9 days left in this period." At 100%: "You've exceeded your budget by $18." | BC-03 | Built |
| Per-category mute | Get only the alerts you care about. | Settings → Alerts can turn alerts off for any category. The overall budget still alerts. | BC-03 | Built |
| Weekly summary | Your week in one notification. | A push on the day you pick, at 9 AM your local time: "This week: $X. Top category: Y. You spent 12% more than last week. Budget: $A of $B used (N%)." Tapping it opens the dashboard. | BC-06 | Built, device check pending |

### Pillar F: See where it all went

| Feature | Benefit line | What it actually does | PRD | Status |
|---|---|---|---|---|
| Budget dashboard | Your month at a glance. | A ring showing spend against budget, the pace line, and a progress bar for each category, largest spend first. It refreshes when you open the app and after every receipt. | BC-04 | Built |
| Month over month | See how this month compares. | Total and per-category spend compared with last month. | BC-04 | Built |
| 3-month trend | Spot the pattern. | A 3-month spending trend chart. | BC-04 | Built |
| Top items | Find your biggest line items. | The 10 items you've spent the most on this month. | BC-04 | Built |
| Over-budget banner | A clear sign when you're over. | When you go over, the dashboard shows the overage and days left, plus an "Adjust limits" shortcut to your budgets. | BC-04 | Built |
| Receipt history | Every receipt, searchable. | Newest first, with store, date, total and item count. Search by store name, and filter by preset or custom date ranges. | RC-04 | Built |
| Receipt detail | Every receipt, line by line. | Opens the full receipt: items, categories, subtotal, tax, and the original photo. | RC-04 | Built |
| Edit after saving | Fix a saved receipt anytime. | Edit a confirmed receipt from its detail screen. Budgets update to match. | added | Built |
| Delete and restore | Deleted by mistake? Restore it. | Swipe to delete a receipt. Deleted receipts and budgets stay in **Recently deleted** for 30 days, and you can restore them from there. | added | Built |

### Trust, privacy and accessibility

You can use these on the site as trust points. The privacy wording has to match the in-app policy (`mobile/src/features/settings/content/privacy.ts`). That policy is still waiting for legal sign-off.

| Feature | What it actually does | Status |
|---|---|---|
| Sign in your way | Email and password, Sign in with Apple, or Continue with Google. Email verification, password reset and email change are built in. | Built; Google on Hold (needs build config, see launch items) |
| You choose before AI reads a receipt | Before the first scan, a one-time consent screen explains that receipts are read by an AI service (Anthropic). You can withdraw consent in Settings. | Built |
| Delete your account | Deletes everything from inside the app: receipts and photos, budgets, alerts, corrections and sign-in history. | Built, device check pending |
| Accessibility | Supports VoiceOver, Dynamic Type, Reduce Motion, Increase Contrast and Reduce Transparency. Touch targets are at least 44 pt. | Built, device check pending (full VoiceOver pass) |
| In-app help | Settings → Help & feedback answers common questions. | Built |

## 3. What's new since the original MVP scope

The original list in `PHASE_SCOPE.md` had 12 bullets. These features were added while building and are now part of the MVP:

1. Manual entry, both on its own and as the fallback for a scan that can't be read
2. Apple's document scanner (replaced the custom camera on real devices)
3. Duplicate-receipt warning
4. Big-ticket check (items over $100, receipts over $500)
5. Edit a receipt after saving it
6. Delete with a 30-day Recently deleted list and restore, for receipts and budgets
7. Spending pace line on the dashboard
8. Over-budget banner with an "Adjust limits" shortcut
9. Custom start day for the budget month
10. Per-category alert mute
11. Weekly summary at 9 AM local time, on a day you pick
12. Multi-currency budgets (receipts keep their own currency)
13. Sign in with Apple and Google, plus email change
14. AI-consent screen before the first scan
15. Delete your account from inside the app
16. 20-scan monthly limit on the free tier

## 4. Decisions

Settled (recorded in [decisions.md](../decisions.md)):
1. **Conversion goal:** waitlist sign-ups now, then App Store downloads at public launch. The brief designs both states.
2. **Waitlist incentive:** keep "a free year of Premium". Premium arrives in V1.1, and the promise has to be kept then.
3. **Free-tier wording:** "Free" in the hero, and the 20-scan monthly limit (`free_tier_receipts_per_month`) stated in the FAQ. Manual entry has no limit. Never say "unlimited". This is the recommended default; the user didn't choose explicitly.
4. **Launch date:** Q4 2026 (decision #6). The live site was updated on 2026-11-03.
5. **Free Premium year:** waitlist emails are matched to app accounts automatically (decision #7). The to-do list is in [launch-open-items.md](../../launch-open-items.md) §6.
6. **Privacy line:** rests on Anthropic's standard Commercial Terms, which apply to the regular API (decision #8). No review with Anthropic is needed. Our own `privacy.ts` still needs legal sign-off.

Still open:
7. **Speed and accuracy.** Neither has been measured on real receipts. Use "in seconds" and no percentages.
8. **Weekly summary by email.** Push only; email was deferred on 2026-11-02.

## 5. Don't put these on the new page

The current `marketing/index.html` advertises features from later phases and makes privacy claims the app doesn't meet. None of these are in the MVP:

| Current site claim | Reality | Phase |
|---|---|---|
| Price history per item, "↑ 43% in 12 months" | Not built | V1.1 |
| Cross-store price comparison | Not built | V1.1 |
| Price alerts | Not built (budget alerts are) | V1.1 |
| Brand and size matching across stores | Not built | V1.1 |
| Exports | Not built | V1.1+ |
| Custom categories | Not built (8 fixed categories) | V1.1 |
| Household sharing, "covers up to five household members" | Not built | V1.5 |
| Virtual pantry, expiry tracking, "nudge before things expire" | Not built | V2.0 |
| Recipes, expiry-aware recipe ranking, "Cook tonight" | Not built | V2.0 |
| Smart shopping list | Not built | V2.0 |
| Personal inflation rate, "+6.2% vs CPI" | Not built | V2.5 |
| Community pricing | Not built | V2.5 |
| Taste profile, weekly meal plan, LLM substitutions | Not built | V3.0 |
| Forwarding email receipts to a private inbox | Not built. Receipts come from the camera, Photos, Files (PDF) or manual entry. | none planned |
| "Receipts are processed on-device for OCR" | False. Receipts are uploaded to our servers and read by Anthropic's AI. | — |
| "0 kb receipt data shared with anyone" / "We never sell or share your data" | Receipt images go to Anthropic for extraction. Use the wording in `privacy.ts` instead. | — |
| Premium at $3.99/mo, Family at $6.99/mo | No paid tiers in the MVP. The PRD's later prices are $5.99 and $8.99. Leave pricing tiers off the page. | V1.1 |
| "V1 ships with price tracking and household sharing" | The MVP ships with scanning and budgets. | — |
| Android "after 10K weekly active" | No Android plans in the MVP. | — |

The headline ("From receipts to a kitchen that thinks ahead") and the four-step "How it works" (receipt → prices → pantry → taste) describe the whole roadmap, not this launch. A roadmap section is fine if it's clearly labelled "Coming later". The hero and feature sections should cover only sections 1 and 2 of this document.

The site's statistics (waitlist count, "6.2% average personal inflation our beta users see") and the beta testimonial (about olive-oil prices) refer to features the app doesn't have. Check where they came from before reusing them.

## 6. Sources checked

- Privacy wording: `mobile/src/features/settings/content/privacy.ts` and `mobile/src/features/ai-consent/constants.ts` at `eb0ccf3`. `privacy.ts` still has `reviewed: false`.
- Anthropic's terms, checked 2026-11-02:
  - [Commercial Terms](https://www.anthropic.com/legal/commercial-terms): "Anthropic may not train models on Customer Content from Services."
  - [Privacy Center, API retention](https://privacy.claude.com/en/articles/7996866): API inputs and outputs are deleted within 30 days, but may be kept longer to enforce the Usage Policy or when the law requires it.

  We use the regular API, so these standard terms apply, and no separate agreement or review with Anthropic is needed (decision #8). "Anthropic doesn't use them to train its models" is supported. "Used only to read your receipt" is still too strong: retention exceptions exist, and we keep the photo for History.
- The camera screens' privacy copy: fixed in PR 31. `mobile/src/__tests__/cameraPrivacyCopy.test.tsx` passed on 2026-11-02.
- Device checks still open: the document scanner, push alerts and the weekly summary, account deletion, and a full VoiceOver pass ([device-checklist.md](../../device-checklist.md)).
