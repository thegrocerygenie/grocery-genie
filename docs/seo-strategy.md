# Grocery Genie — SEO & Discoverability Strategy

Status: draft, 2026-11-14, reconciled with `origin/main` the same day (the site had been rebuilt in Astro and account deletion, the purge job and Apple revocation had already shipped). Scope: MVP launch (Budget Copilot), iOS-only.

## 1. Where we are

The marketing site (`marketing/`) is an Astro build (rebuilt from the Claude Design v5 handoff), served as Cloudflare Workers static assets. Already done on `origin/main`: positioning is receipt-to-budget (title "See what your grocery money actually buys"), the launch date reads Q4 2026 (marketing decision #6), the privacy FAQ matches the app, and there is canonical/OG/Twitter metadata, one `SoftwareApplication` JSON-LD block and a `robots.txt` that points at the sitemap.

Gaps that still matter:

| Gap | Why it matters |
|---|---|
| **One indexable URL.** `sitemap.xml` lists `/` only, with no `lastmod`. | A single page can't rank for more than a handful of queries. |
| **No public privacy policy URL.** The policy lives in the app (`mobile/src/features/settings/content/privacy.ts`); `docs/launch-open-items.md` §1 lists the public URL as open. No Terms document exists (deliberately dropped), and there is no support page. | App Store Connect requires a privacy URL and a support URL; they are also trust signals. |
| **Thin structured data.** `SoftwareApplication` only: no `Organization`, `WebSite` or `FAQPage`, although the page has a real FAQ. | FAQ rich results and entity clarity. |
| **No App Store presence in the plan.** See `docs/aso-metadata.md`. | For a mobile app, ASO is the main organic channel. |
| **No content or tools** (`/blog`, feature pages, free tools). | Long-tail queries and links. |

## 2. Strategy in one line

Win long-tail, high-intent "where does my grocery money go" searches with useful free content and tools, convert via the iOS App Store, and keep the App Store listing and the website saying the same thing.

Three channels, in priority order:

1. **ASO** (App Store Optimization), highest ROI at launch.
2. **Programmatic and editorial web content**, compounds over 6–12 months.
3. **Technical/entity SEO**, cheap, do once.

## 3. Positioning and keyword themes

Lead with the MVP promise: **"Scan a grocery receipt, see where your money went."** Pantry/meal/price themes become content seeds only when their phase ships (see section 8).

| Cluster | Example queries | Intent | Phase fit |
|---|---|---|---|
| Receipt scanning | "receipt scanner app", "scan grocery receipts", "receipt tracker iphone" | Transactional | MVP |
| Grocery budgeting | "grocery budget app", "track grocery spending", "how much should I spend on groceries" | Mixed | MVP |
| Item-level spending | "what did I buy at [store]", "grocery spending by category" | Informational | MVP |
| Alternatives | "Mint alternative", "YNAB vs receipt tracking", "Fetch rewards alternative without ads" | Comparison | MVP |
| Cash tracking | "track cash spending groceries" (bank feeds miss cash) | Informational | MVP |
| Price tracking | "grocery price tracker", "price history by store" | Mixed | V1.1 |
| Household | "shared grocery budget couples" | Mixed | V1.5 |
| Meal/pantry | "use up groceries", "reduce food waste app" | Informational | V2.0 |

Validate volumes and difficulty before committing (Ahrefs, Semrush, or the free Google Keyword Planner plus Search Console data after launch). The queries above are hypotheses, not measured volumes.

Differentiator to repeat everywhere: bank feeds show "$187 at Loblaws", we show what was in the basket. Bank-feed apps (Mint, YNAB, Copilot) can't do that. Rewards apps (Fetch, Receipt Hog) don't give you budget intelligence.

## 4. Channel 1 — App Store Optimization

- **Title (30 chars):** `Grocery Genie: Receipt Budget` (or similar; put the highest-value keyword in the title).
- **Subtitle (30 chars):** `Scan receipts, track spending`
- **Keyword field (100 chars):** comma-separated, no spaces, no repeats of title/subtitle words, e.g. `grocery,budget,receipt,scanner,expense,tracker,shopping,food,spending,money`. Never use competitor brand names (rejection risk).
- **Screenshots:** first 3 carry the message: scan → itemized review → budget dashboard. Caption each with a keyword-bearing benefit.
- **Description:** conversion copy, not ranking (Apple doesn't index it). Lead with the item-level hook.
- **Ratings:** prompt for a review after a user's 3rd confirmed receipt and after a "budget on track" moment. Never on first launch.
- **Custom Product Pages:** one per cluster (receipt scanner, grocery budget, cash tracking) so paid/social/web links land on matching screenshots.
- **Iterate:** change metadata every 4–6 weeks, one variable at a time; track keyword rank with App Store Connect + a tracker (AppFollow, Sensor Tower, or free tiers).
- **Localization:** the product handles multi-language receipts. Add Canadian English (CA), UK, and Australia metadata early, since spelling and store names differ ("groceries", "Loblaws", "Tesco", "Woolworths") and competition is lower than en-US.

## 5. Channel 2 — Website content

Move from one page to a small, indexable site. The site is already Astro with static output, which suits this: add `/blog` and `/tools` as Astro pages or content collections, and generate `sitemap.xml` from them.

### 5.1 Page set (MVP launch)

| URL | Purpose | Primary query |
|---|---|---|
| `/` | Homepage, rewritten around receipt → budget | brand + "grocery receipt budget app" |
| `/receipt-scanner` | Feature landing page | "receipt scanner app" |
| `/grocery-budget-app` | Feature landing page | "grocery budget app" |
| `/track-cash-spending` | Niche landing page | "track cash spending" |
| `/vs/mint-alternative`, `/vs/ynab` | Comparison pages, honest and specific | "[brand] alternative" |
| `/privacy`, `/terms`, `/support` | Required by App Store; also trust signals | — |
| `/blog/...` | See below | long-tail |

Note on `/privacy`: build it from `privacy.ts` (one source of truth) so the web page and the in-app text cannot drift, and keep the legal sign-off (`reviewed: false` today) as the gate. Terms: none exists today; decide whether the App Store listing needs one before drafting it.

### 5.2 Free tools (link magnets, no signup)

These earn links and capture high-intent traffic before anyone installs.

- **Grocery budget calculator** by household size, region, and diet (use published USDA, StatCan, or ONS figures; cite them and show the date).
- **Receipt-to-category demo:** paste receipt text, see categorization. Reuses the extraction pipeline; rate-limit it and don't store input.
- **Weekly grocery spend benchmark** page, updated quarterly.

### 5.3 Editorial cadence

Start with 2 posts/week for 8 weeks, then 1/week. Each post targets one query, includes an original angle, and links to one feature page.

Starter list:
1. How much should a family of four spend on groceries? (by country, current year)
2. Why bank apps can't tell you what you spent on groceries
3. How to track grocery spending without a spreadsheet
4. Receipt categories: what to count as "groceries" vs "household"
5. How to track cash grocery spending
6. Grocery budget by household size (calculator embed)
7. Mint alternatives after the shutdown, for people who want item-level detail
8. Is your grocery bill really up? How to check with your own receipts

**Original data (best long-term link bait):** once there are enough users, publish anonymized, aggregated insights ("average share of spend on produce vs snacks, by month"). Needs explicit consent language in the privacy policy and a k-anonymity threshold before publishing. Do not publish until legal has approved.

## 6. Channel 3 — Technical and entity SEO

Do these once, in this order. Status on `origin/main`: step 1 is done; step 2 has `SoftwareApplication` only; step 4 has a one-URL sitemap without `lastmod`.

1. Rewrite `<title>`, meta description, OG tags, H1 around the MVP promise; use a real status (Q4 2026 today; switch to "Now on the App Store" at launch).
2. Expand JSON-LD: `Organization`, `WebSite`, `MobileApplication` (category `FinanceApplication` or `LifestyleApplication`, `operatingSystem: iOS`, `offers` price 0), `FAQPage` on pages that have real FAQs, `BreadcrumbList` on subpages. Add `aggregateRating` only when real reviews exist; fake ratings are a manual-action risk.
3. Add the Apple **Smart App Banner** meta tag (`apple-itunes-app`) once the App Store ID exists.
4. Generate `sitemap.xml` from the page set with real `lastmod`; keep `robots.txt` pointing at it.
5. Universal Links: `apple-app-site-association` on the domain so shared links open the app. Defer deep-link landing pages (shared receipts, etc.) until a feature needs them.
6. Core Web Vitals: already strong; keep images sized, fonts `font-display: swap`, keep page weight small.
7. Search Console + Bing Webmaster verified on day one; submit sitemap; monitor coverage and queries.
8. Privacy-friendly analytics (Plausible, or Search Console only). Tie web → App Store conversions with App Store campaign links (`ct=` parameter per source).
9. One canonical host (`grocerygenie.app`, no `www`), HTTPS-only, 301s for variants. `api.grocerygenie.app` must return `X-Robots-Tag: noindex` or block via robots so API docs/errors don't get indexed.

## 7. Off-site and authority

- **Reddit / forums:** be useful in r/budgetfood, r/personalfinance, r/frugal, r/ios, with disclosure. Don't spam links.
- **Product Hunt / Hacker News / Indie Hackers launch** the week of the App Store release.
- **Directories:** AlternativeTo (list as an alternative to Mint/YNAB/Fetch), Product Hunt, iOS app roundup sites, finance and frugal-living blogs. Pitch with a specific angle ("itemized tracking from a photo"), not a generic press release.
- **Creators:** budgeting and frugal-living YouTubers/TikTokers get TestFlight codes; short-form demos of the scan moment convert well and feed branded search.
- **Digital PR:** the benchmark data in 5.2 pitched to local news around inflation stories.
- Avoid paid links, link exchanges, and AI-generated bulk content; they risk penalties and undermine trust in a finance-adjacent product.

## 8. Phase-gated expansion

Content follows shipped features, consistent with the project's phase rules.

| Phase | Unlock |
|---|---|
| MVP | Everything above |
| V1.1 | Price tracker pages, "price history for [item]" programmatic pages (only with real, aggregated, licensed-to-publish data), `/price-tracker` landing page |
| V1.5 | Household budget content, couples/roommates guides |
| V2.0 | Pantry/meal/food-waste cluster, recipe-from-your-receipt content |
| V2.5+ | Basket comparison, personal inflation reports |

Don't publish landing pages for unshipped features as if they exist. A "coming soon" waitlist is fine; ranking for a promise the app can't keep drives bad reviews, and reviews drive ASO.

## 9. Measurement

| Metric | Source | Early target (first 90 days post-launch) |
|---|---|---|
| App Store impressions → product page views → installs | App Store Connect | Baseline, then +20% from metadata iteration |
| Keyword rank for 10 priority terms | ASO tool | Top 50 for 5, top 10 for 2 |
| Organic web sessions, non-brand | Search Console | Baseline in month 1, grow monthly |
| Indexed pages / coverage errors | Search Console | 100% of sitemap indexed, zero errors |
| Web → App Store click-through | Campaign links | Track by landing page |
| Rating and review count | App Store Connect | ≥4.5 average, first 50 reviews |
| Referring domains | Ahrefs/Search Console links | 20+ quality domains |

Review monthly; kill content that gets no impressions after 90 days or merge it into a stronger page.

## 10. 90-day plan

**Weeks 1–2 (foundation):** fix homepage messaging and dates; Search Console/Bing; sitemap + schema; privacy/terms/support pages; ASO keyword research and first metadata draft; screenshots.
**Weeks 3–6 (launch window):** App Store listing live; Custom Product Pages; two feature landing pages; 8 blog posts; budget calculator v1; Product Hunt/AlternativeTo listings; creator TestFlight outreach.
**Weeks 7–12 (compound):** comparison pages; receipt demo tool; review-prompt tuning; first ASO iteration based on data; digital PR pitch with benchmark data; second round of content from Search Console queries.

## 11. Decisions

| # | Question | Decision (2026-11-14) |
|---|---|---|
| 1 | Positioning | Lead with receipts + budget for MVP. Done on `origin/main` (Astro rebuild). |
| 2 | Launch status wording | Waitlist, no date. **Superseded:** marketing decision #6 (`docs/marketing/decisions.md`) states Q4 2026 on iPhone; follow that. |
| 3 | Markets | US + CA. Use en-US and en-CA metadata; CA content uses CAD figures and Canadian store names. |
| 4 | Content capacity | AI-drafted from briefs, human fact-check and edit before publishing. Pace: 1–2 posts/week. |
| 5 | Publishing anonymized aggregate data | No, not at launch. Parked in `docs/ideas/aggregate-spending-insights.md`. Revisit post-launch with legal input (PIPEDA/GDPR). Drop the "original data" link-bait in section 5.2 for now; use the free tools and editorial content instead. |

Keyword volumes are still unvalidated: web search could not return exact-phrase monthly volumes. Export Google Keyword Planner (or Ahrefs/Semrush) data for the section 3 clusters and add it here.

## 12. Status of follow-ups (2026-11-14, after reconciling with `origin/main`)

| Item | Status |
|---|---|
| Keyword volumes | Blocked: needs a Keyword Planner / Ahrefs / Semrush export. Web search cannot return exact-phrase volumes. |
| Privacy FAQ claim ("delete account from Settings") | Now true: in-app account deletion exists on `origin/main` (`DELETE /api/users/me`, `account_service.py`, which also revokes the Sign in with Apple grant by re-authenticating). Not re-verified in this pass. |
| Soft-delete purge and Celery registration | Already on `origin/main` (`purge_tasks.py`, task modules in `include=`). Not re-verified here. An earlier local version of this work was dropped as redundant. |
| Waitlist form | Origin has its own Worker-based waitlist. A bug in the old `app.js` (messages never shown) no longer applies. A real end-to-end signup against Resend was never tested by me. |
| en-CA metadata | Drafted in `docs/aso-metadata.md`. |
| Public privacy, support (and Terms) pages | **Open.** Not on `origin/main`. Earlier AI-drafted HTML pages were not ported: they were written against an older site and could contradict `privacy.ts` and the pending legal review. |
| Contact addresses | Origin uses `privacy@grocerygenie.app` (`mobile/src/constants/links.ts`). Section 13 proposes `support@` and `hello@`. Decide and make them consistent. |

## 13. Domain layout (decided 2026-11-14)

Everything lives on the root domain, `grocerygenie.app`:

- Marketing site (Cloudflare, per marketing decision #21), legal pages and support.
- Blog at `grocerygenie.app/blog`. Chosen over a subdomain so blog links and rankings strengthen the same domain as the feature pages (Google can treat a subdomain as a partly separate site).
- Email: user-facing address is `support@grocerygenie.app` (support, privacy and deletion requests, and the footer Contact link). `hello@grocerygenie.app` is the sender for waitlist and launch emails.

Follow-ups:
- Reconcile with the app: it already points privacy requests at `privacy@grocerygenie.app`. Either add `support@` alongside it or use one address.
- Confirm the `support@` and `hello@` mailboxes exist and are monitored before the privacy policy goes live; the policy promises a response to deletion requests within 30 days.
- Set SPF, DKIM and DMARC for `grocerygenie.app` and verify the domain in Resend before setting `WAITLIST_FROM`.
- Verify a Search Console **Domain property** for `grocerygenie.app`.
- Optional, later: if bulk email volume grows, move newsletters to a sending subdomain (for example `updates.`) so marketing reputation stays separate from operational mail. Users never need to see it.
- The blog should be built as static pages under `/blog` using the same build and `sitemap.xml`.
