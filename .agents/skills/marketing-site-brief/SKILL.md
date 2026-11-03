---
name: marketing-site-brief
description: "Write a conversion-focused landing-page brief for Claude Design at a given roadmap stage (MVP, V1.1, V1.5, V2.0, V2.5, V3.0). Builds a feature inventory from the code, checks every claim against it, audits the live marketing site, and writes a paste-ready brief. Use when the user asks for a marketing site, landing page or Claude Design brief, or when a roadmap stage ships and the site needs to catch up."
argument-hint: "<stage> <version> <goals>, e.g. V1.1 1.1.0 \"App Store downloads, Premium upgrades\""
---

# Marketing site brief

This skill writes the brief that Claude Design uses to redesign the marketing site (`marketing/`) for one roadmap stage. A brief has two jobs:

1. **Be true.** Every claim matches what the shipped app does at that stage. The code decides that, not the PRD or the current site.
2. **Convert.** One goal, one call to action, the product's key moment first, objections answered, and a growth loop that suits the stage.

**Briefs are cumulative.** The brief for a stage describes the whole app as it stands at that stage: everything built in every earlier stage, plus what this stage adds. A V2.0 brief still sells scanning, budgets, alerts, price history and household sharing. The new stage leads the page; the earlier stages stay on it, as full sections.

The output is two files in `docs/marketing/<stage>/` (the stage in lower case: `mvp`, `v1.1`, `v1.5`, `v2.0`, `v2.5`, `v3.0`) plus the brief in chat, ready to paste. A second brief for the same stage, for example at launch, replaces the files; git keeps the history.
- `feature-scope.md`: the full, sourced inventory (from [templates/feature-scope.md](templates/feature-scope.md)).
- `design-brief.md`: the Claude Design brief (from [templates/design-brief.md](templates/design-brief.md)).

The MVP files in [`docs/marketing/mvp/`](../../../docs/marketing/mvp/) are the worked example. Match their depth and tone. Don't copy their facts; check them again.

Read [`docs/agents/harnesses.md`](../../../docs/agents/harnesses.md) once. It maps "launch a subagent" and "ask the user" to your harness.

## 0. Inputs

Take three inputs from the arguments or the request:

| Input | Example | If missing |
|---|---|---|
| Stage | `MVP`, `V1.1`, `V1.5`, `V2.0`, `V2.5`, `V3.0` | Ask. Don't guess from the PRD's "current phase". |
| Version | `1.0.0`, `1.1.0` | Read `version` in `mobile/app.json`, and confirm it with the user. |
| Goals | "waitlist sign-ups", "App Store downloads", "Premium upgrades", "household invites" | Suggest the stage default from [references/stage-playbook.md](references/stage-playbook.md), and ask. |

Then read [`docs/marketing/decisions.md`](../../../docs/marketing/decisions.md). The decisions there stand unless the user changes them. One example is the free year of Premium promised to waitlist sign-ups, which a later stage must honour.

## 1. Build the feature inventory from the code

The PRD says what was planned. The code says what ships. Build the inventory from the code, and use the PRD only to name the user story each feature serves.

The inventory covers the whole app: every stage from MVP up to the target. Start from the previous stage's `docs/marketing/<stage>/feature-scope.md` if there is one, but check every row again in the code. Earlier features change as later stages are built (copy, limits, what's free and what's Premium), and some are removed. Tag each row with the stage that introduced it, so the brief can show what's new.

Launch three read-only subagents at once. Each brief says "do not edit files" and asks for one row per user-facing feature: the feature, what it does in plain words, the file:line that proves it, and the user story it serves. [references/truth-sources.md](references/truth-sources.md) lists where each kind of fact lives.

1. **Mobile:** every route in `mobile/app/`, its user-facing strings, and `mobile/src/features/*`. Include the Help answers (`settings/content/help.ts`), which describe behaviour in plain words.
2. **Backend:** routes in `backend/app/api/routes/`, limits and defaults in `backend/app/core/config.py`, notification text in `backend/app/services/` and `backend/app/tasks/`.
3. **Status:** `docs/prd/PHASE_SCOPE.md`, the epic files for every stage up to and including the target, `docs/launch-open-items.md`, `docs/device-checklist.md`, the newest `.planning/DOD-AUDIT-*.md`, and `git log` since the previous brief's commit.

Give every feature one status:
- **Built:** in the code on the default branch, with a test that would fail if it broke.
- **Built, device check pending:** built, but a check on a real iPhone is still open in `docs/device-checklist.md` or `docs/launch-open-items.md`.
- **Built, unverified:** built, but untested, or its quality hasn't been measured (for example, extraction accuracy for a receipt language).
- **Hold:** built, but switched off or unconfigured in production (for example, a sign-in provider without its client ID).
- **Not built:** planned for this stage but missing from the code. Don't put it on the site, and tell the user.

Check the rows the subagents report for the hero and the three feature sections yourself, in the code. These carry the page, so a wrong row there is the most costly.

## 2. Check the claims that carry risk

Some claims need more than a code read. Run each check, and write down what you checked and when.

- **Privacy.** Take the wording from `mobile/src/features/settings/content/privacy.ts` and `mobile/src/features/ai-consent/constants.ts`. The site must not claim more than they do. If a claim depends on an AI provider's terms (training, retention), search the provider's current public terms and cite them. `docs/marketing/decisions.md` records which agreement applies; for the regular Anthropic API it's the standard Commercial Terms, so no separate review with the provider is needed. Flag a claim only when it goes beyond what the cited terms say, or when the provider or agreement has changed. Never write "on-device", "never shared" or "used only for…" unless the code and the provider's terms both support it.
- **Price.** Take it from `backend/app/core/config.py` (quotas), the monetization section of `docs/prd/00-overview.md`, and `docs/marketing/decisions.md`. Show only tiers that exist in the build.
- **Numbers.** Show a speed, accuracy or savings figure only when the project has measured it, for example in an `llm_validation` run or a dated audit. If it hasn't, say "in seconds" or nothing.
- **Dates.** Every launch date or "coming in" date on the site must be in the future, and the user must have confirmed it.

## 3. Audit the current site

Read `marketing/src/pages/index.astro` and `marketing/src/config.ts` and list every claim: features, privacy, prices, stats, testimonials, dates and platforms. Mark each one **keep**, **rewrite** or **remove**, with the reason ("later stage: V2.0", "false: receipts are uploaded", "date has passed", "stat with no source"). This table goes in section 5 of `feature-scope.md`.

## 4. Settle the decisions only the user can make

Before you write the brief, ask everything at once, in at most four questions. Offer the stage default from the stage playbook as the recommended option. Typical questions:
- Conversion goal, and whether a second state is needed soon (for example, waitlist now, App Store at launch)
- The incentive, and whether an existing promise still holds
- How to word the price (a hero "Free" against a limit stated in the FAQ)
- The launch date, or "say no date"

Record each answer in `docs/marketing/decisions.md` with today's date and the stage. A question the user skips gets the recommended default; say so in your report.

## 5. Write `feature-scope.md`

Fill in [templates/feature-scope.md](templates/feature-scope.md). Group the features into value layers (budget, prices, household, pantry and meals, insights), and within each layer into pillars in the order a user meets them. Each row gets a benefit line, the facts, the user story, the stage that introduced it and the status. The scope lists every feature in the app, not only this stage's. List separately what's new since the previous stage's scope, and what changed or was removed. Keep section 5 (don't claim) complete, even when it's long; it stops old copy coming back.

## 6. Write `design-brief.md`

Fill in [templates/design-brief.md](templates/design-brief.md) and apply [references/conversion-playbook.md](references/conversion-playbook.md) and the stage's row in [references/stage-playbook.md](references/stage-playbook.md). The brief is for Claude Design. It describes structure, copy and rules; it doesn't contain HTML.

Hard rules:
- Every claim in the brief maps to an inventory row marked **Built** or **Built, device check pending**. Rows marked unverified or hold go only in the brief's "Hold until confirmed" list.
- Every headline option is true today.
- Social proof comes only from a source you can name. Never invent a number, a quote or a user.
- Use the privacy wording from step 2 exactly, in one place, and refer back to it elsewhere.

## 7. Check the brief before you present it

Go through every item and fix any that fail:

- [ ] The brief describes the whole app: every built layer from MVP to this stage has a feature section, and every other built feature is in the "Everything included" grid
- [ ] This stage's new features lead and are marked "New"; nothing from an earlier stage dropped off without a reason in the scope's "changed or removed" list
- [ ] One conversion goal, and one call-to-action label repeated in the hero, after the features and at the end
- [ ] A state table if the call to action changes soon, such as waitlist to App Store, or download to upgrade
- [ ] The hero shows the product's key moment, in a visual you can describe in one sentence
- [ ] The main differentiator is stated as a contrast near the top
- [ ] The habit or retention driver for the stage is one of the first two feature sections
- [ ] Each of the four common objections (price, accuracy, privacy, effort) has a true answer in the trust block or the FAQ
- [ ] No internal names ("pace line", "confidence flags", story IDs) in copy meant for visitors
- [ ] The never-claim list covers every later-stage feature, false claim and unconfirmed number
- [ ] The growth loop suits the stage, and anything that needs new code is marked optional, with where the work lives
- [ ] Measurement events and UTM handling are named, and each headline A/B test has a control
- [ ] The App Store screenshots and the first onboarding screen use the same message
- [ ] Every date is in the future and confirmed, or left as a marked placeholder

## 8. Report

In chat, give:
1. The brief, in one fenced `markdown` block, ready to paste into Claude Design.
2. What you changed from the template defaults, and why.
3. The decisions you assumed, the holds, and anything that needs legal or device checks.
4. Features planned for this stage that aren't built.

Then follow the commit gate in `AGENTS.md`: ask before committing the two files and `decisions.md`, and again before pushing.
