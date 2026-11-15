# Parked idea: published aggregate spending insights

**Status:** Parked. Not in MVP. Decided 2026-11-14 not to pursue at launch.
**Revisit when:** a meaningful user base exists (see "Entry criteria"), after legal review, and after a consent mechanism ships.
**Phase fit:** V1.1 or later. Do not build any collection, consent UI, or publishing pipeline in MVP (see `docs/prd/PHASE_SCOPE.md`).

## The idea

Publish anonymized, aggregated insights drawn from users' receipts as original-data content, for example:

- "Average share of grocery spend on produce, by month"
- "How much households spend on groceries, by household size and region"
- Quarterly grocery spend benchmarks, a "personal inflation" style report

## Why it is attractive (SEO and brand)

- Original data is the strongest link-earning content for a small brand. Journalists, bloggers and finance sites cite and link to first-party numbers.
- It supports digital PR: pitch local and national outlets around inflation and cost-of-living stories.
- It matches our moat. Item-level receipt data is something bank-feed apps (Mint, YNAB, Copilot) cannot produce.
- It feeds a recurring content series (quarterly benchmark), which compounds links and branded search.
- Fits the strategy in `docs/seo-strategy.md` section 5.2 as a link magnet, which was removed from the launch plan.

## Why it is parked

- The homepage and privacy FAQ currently promise we don't sell or share user data. Publishing derived insights needs to be consistent with that promise and with the privacy policy.
- Legal exposure: the target markets are US and Canada (PIPEDA applies in Canada, and GDPR/UK rules if UK or EU users join). Needs legal review and a lawful basis for the secondary use.
- No consent mechanism exists in the MVP, and none may be built there.
- Too few users early on. Small samples are statistically weak and can re-identify individuals.

## Entry criteria (all must be true)

1. **Legal sign-off** on the privacy policy and terms language, covering aggregate use and each market where we have users.
2. **Consent model decided and shipped.** Options considered, in order of privacy strength:
   - Opt-in in Settings (recommended default; smaller dataset, strongest trust).
   - Default-on with a clear opt-out (larger dataset, more legal risk, especially in Canada and the EU).
3. **Minimum sample size.** Do not publish any figure unless a statistically meaningful number of distinct households contributes (set the threshold with an analyst; a rule of thumb is at least 100 households per published cell, and higher where the cell is a small region).
4. **k-anonymity and suppression.** No published cell may be small enough to identify a household, store visit or individual. Suppress or merge small cells. Never publish raw receipts, line-item text, exact timestamps, or precise locations.
5. **Opted-out and deleted users excluded**, including users who delete their account after contributing (soft delete is already in the product).
6. **Data quality gate.** Extraction accuracy and category assignment must be good enough that published numbers are defensible (PRD target: at least 90% extraction accuracy, under 15% correction rate).

## Design notes for later

- Derive insights from a separate, already-aggregated analytics table or job. Do not query raw receipt tables from a publishing script.
- Keep category definitions identical to the in-app eight default categories so the numbers are explainable.
- Publish methodology on the page: sample size, date range, how cells are suppressed, and the caveat that users are not a representative sample of all households.
- Version and date each release. Keep the previous editions so links keep working.
- Related domain events: aggregates would consume `ReceiptConfirmed` and `ItemCorrected` (see `docs/prd/09-architecture.md`).

## Open questions

- Opt-in or opt-out? (Depends on legal advice and the markets we are in by then.)
- Which regions and household-size cuts are meaningful at our scale?
- Do we want the data free to cite, or gated behind a media kit?
- Should insights also appear in the app (V2.5 community and personal-inflation features), and if so does the same consent cover both?

## Related

- `docs/seo-strategy.md` sections 5.2, 7 and 11 (decision 5)
- `docs/prd/OPEN_QUESTIONS.md` (decision log)
- `docs/prd/PHASE_SCOPE.md` (phase boundaries)
