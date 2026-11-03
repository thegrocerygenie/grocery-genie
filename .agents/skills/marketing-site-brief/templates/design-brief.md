# Grocery Genie landing page: {stage} brief ({version})

<!-- Written for Claude Design. Every claim maps to a Built row in feature-scope.md. Delete these comments before pasting. -->

## 0. Goal and call to action

The page has a single goal and one call to action, repeated after the hero, after the features, and at the bottom.

<!-- If the goal will change soon, use the two-state table. Otherwise use a single column. -->

| | State A: {now} | State B: {next} |
|---|---|---|
| Goal | | |
| Main control | | |
| Line under the button | {platform · price · incentive} | |
| After the action | | |
| Pill at the top of the page | | |

{Notes on swapping states, incentive wording, and any badge or banner rules.}

## 1. Audience and tone

- **Who:** {personas, primary first}
- **What they want to know:** {their question}
- **Tone:** {per the stage playbook; say which language is allowed and which isn't}

## 2. Hero

- **Headline (A/B test these; all are true):**
  - A (control): {current or best}
  - B: {different angle}
  - C: {different angle}
- **Subhead:** {mechanism in one sentence, ending with the platform and price}
- **Call to action:** see section 0.
- **Visual:** {the stage's key moment, in one sentence}

## 3. Contrast strip

{Side-by-side cards with realistic numbers that add up, and a one-line caption.}

## 4. How it works (3 steps)

1. **{Verb}.** {one line}
2. **{Verb}.** {one line}
3. **{Verb}.** {one line; end on the outcome}

## 5. Feature sections (one per value layer, newest and habit-forming first)

### {Layer} {"New" if this stage added it}
Headline: **{5–8 words}**
- {benefit bullet, up to 12 words}
- {benefit bullet}
- {benefit bullet}
- Visual: {one phone screen; any example data labelled as an example}

{Repeat for every built layer, up to five.}

## 6. Trust block

Headline: **You stay in control.**
- {approval and accuracy}
- {consent and data use}
- {corrections it remembers}
- {delete and restore}

Privacy line (use exactly this):
> {wording from privacy.ts and the provider-terms check}

## 7. Everything included (short labels, grouped by layer)

- **{Layer}:** {label} · {label} · {label}

## 8. FAQ

- **{Price question}** {answer with the real limits and incentive}
- **What if it gets it wrong?** {answer}
- **Is my data private?** {privacy line plus control}
- **{Effort or compatibility question}** {answer}
- **Android?** {current, true answer}
- **When does it launch?** {confirmed date, or a placeholder for the team}

## 9. Final call to action

Headline: **{outcome-led line}**
Same control as section 0.

## 10. What's next (below the final call to action, clearly labelled)

{Later-stage features as short labels. No dates unless confirmed, no prices, no screenshots that look finished.}

## 11. Growth loop

{The loop that suits this stage, from the conversion playbook. Mark it optional if it needs code that doesn't exist yet, and say where that code lives.}

## 12. Social share card (`og-image.svg` → `og-image.png`, 1200×630)

- {hero headline and the stage's key moment, with the headline kept clear of any phone mock-up}
- {the pill for each call-to-action state}
- Update `<meta name="description">` and `og:description` to the subhead.

## Rules

- **Never claim:** {from feature-scope.md section 5}
- **Hold until confirmed:** {unverified and hold rows; numbers not yet measured}
- **Social proof:** only from a source you can name. No invented numbers, quotes or users.
- **Measurement:** track the call-to-action click, the conversion event for each state, and FAQ expands. Add UTM handling. Split traffic evenly across the hero headlines.
- **Consistency:** use the same headline and hero visual on the App Store screenshots and the app's first onboarding screen.
- **Design tokens:** keep `marketing/src/styles/tokens-v2.css` and the page palette in `marketing/src/styles/site.css` unless the user asks for a new visual direction.
