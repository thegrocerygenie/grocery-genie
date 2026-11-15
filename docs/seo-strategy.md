# Grocery Genie — SEO & Discoverability Strategy

Status: draft, 2026-11-14, reconciled with `origin/main` the same day (the site had been rebuilt in Astro and account deletion, the purge job and Apple revocation had already shipped). Scope: MVP launch (Budget Copilot), iOS-only.

## 1. Where we are

The marketing site (`marketing/`) is an Astro build (rebuilt from the Claude Design v5 handoff), served as Cloudflare Workers static assets. Already done on `origin/main`: positioning is receipt-to-budget (title "See what your grocery money actually buys"), the launch date reads Q4 2026 (marketing decision #6), the privacy FAQ matches the app, and there is canonical/OG/Twitter metadata, one `SoftwareApplication` JSON-LD block and a `robots.txt` that points at the sitemap.

Gaps that still matter:

| Gap | Why it matters |
|---|---|
| **Three indexable URLs.** `sitemap.xml` lists `/`, `/privacy` and `/support` with `lastmod`, but only `/` targets search queries. | One marketing page can't rank for more than a handful of queries. |
| **Privacy policy still a draft.** `/privacy` and `/support` are live (PR #154, 2026-11-14). `/privacy` is built from the app's `privacy.ts` and shows "Draft · pending legal review" until counsel signs off (`docs/launch-open-items.md` §1). No Terms document exists (deliberately dropped). | App Store Connect requires a privacy URL and a support URL; they are also trust signals. |
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

| Cluster | Measured queries (US / CA monthly Google searches) | Intent | Phase fit | Verdict |
|---|---|---|---|---|
| Receipt scanning | "receipt scanner app", "receipt scanner", "receipt app" (1K–10K / 100–1K each) | Transactional | MVP | Biggest demand. Put "Receipt Scanner" in the App Store name. Much of it is rewards ("scan receipts for money") or business ("receipt scanner for small business", QuickBooks); our pages should say plainly that this is for personal grocery budgets. |
| Grocery budgeting | "grocery budget" (1K–10K / 100–1K); "grocery budget app", "monthly grocery budget", "grocery budget for 2", "grocery budget for family of 4", "how much should i spend on groceries", "average grocery bill" (100–1K US each) | Mixed, mostly informational | MVP | Best web cluster: calculator, landing page and the first blog posts. |
| Saving on groceries | "grocery apps to save money" (100–1K in both); "best grocery apps for saving money" (100–1K US, rising year over year) | Commercial | MVP | The strongest grocery query in Canada. Use only honest framing (see where the money goes), never promised savings. |
| Generic trackers | "expense tracker app", "spending tracker app" (1K–10K / 100–1K) | Transactional | MVP | Large but crowded in the App Store. Worth words in the subtitle and keywords; no dedicated page. |
| Alternatives | "mint alternative", "apps like mint", "best mint alternative", "ynab alternative", "apps like fetch rewards" (100–1K US each) | Comparison | MVP | Real demand for comparison pages on the website only (no brand names in App Store metadata). "alternatives to mint mobile" is the phone carrier; exclude it. |
| Item-level spending | "grocery spending by category" (under 10), "track grocery spending", "grocery expense tracker" (10–100) | Informational | MVP | Little search demand. Keep it as the message, not as a target query. |
| Cash tracking | "track cash spending" (10–100, high ad competition) | Informational | MVP | Too small for a landing page; one blog post. |
| Price tracking | "grocery price comparison app" (1K–10K / 100–1K); "grocery price tracker" (100–1K US); "grocery inflation tracker" (under 10) | Mixed | V1.1 | Large demand. Price history and price alerts ship in the launch build (decided 2026-11-14), so `price` is in the App Store keywords. Store comparison is not named until marketing decision #19 allows it. |
| Household | "shared grocery budget couples" | Mixed | V1.5 | Not measured. |
| Meal/pantry | "use up groceries", "reduce food waste app" | Informational | V2.0 | Not measured. |

**Source:** Google Keyword Planner, historical metrics for November 2025 to October 2026, English, Google Search, exported 2026-11-14. US and Canada were pulled separately (37 seed phrases each), plus the "Discover new keywords" ideas list for 4 seeds per country. The raw exports are not in the repo.

How to read the numbers:
- The account runs no campaign, so Google reports only ranges: 10–100, 100–1K, 1K–10K. Treat them as order of magnitude only.
- Google merges close variants. Phrases with identical bid ranges, for example "grocery budget app", "budget grocery app" and "grocery store budget app", are one bucket. Don't add them up.
- Canada is roughly a tenth of the US on every term, so web content targets US queries. en-CA wins come from the App Store listing, not from search.
- Google search demand stands in for App Store demand; it is not the same thing. **After launch, check real App Store rankings** (App Store Connect search sources plus an ASO tool) and replace keywords that bring no impressions. The task is on the "After launch" checklist in `docs/aso-metadata.md`; the target is in section 9.
- The cost-per-click columns are in CAD (the account's currency). "receipt tracker app" (up to $36.63) and the business receipt terms bid highest, which confirms that those searchers are businesses.

Differentiator to repeat everywhere: bank feeds show "$187 at Loblaws", we show what was in the basket. Bank-feed apps (Mint, YNAB, Copilot) can't do that. Rewards apps (Fetch, Receipt Hog) don't give you budget intelligence.

## 4. Channel 1 — App Store Optimization

- **Title (30 chars):** `Grocery Genie: Receipt Scanner`. "Receipt scanner" is the highest-volume query we can honestly claim (section 3).
- **Subtitle (30 chars):** `Budget & spending tracker`. Apple combines words across fields, so this covers "grocery budget", "spending tracker" and "budget tracker" too.
- **Keyword field (100 chars):** the current draft and its reasoning are in `docs/aso-metadata.md`. Comma-separated, no spaces, no repeats of title or subtitle words. Never use competitor brand names (rejection risk).
- **Screenshots:** first 3 carry the message: scan → itemized review → budget dashboard. Caption each with a keyword-bearing benefit.
- **Description:** conversion copy, not ranking (Apple doesn't index it). Lead with the item-level hook.
- **Ratings:** prompt for a review after a user's 3rd confirmed receipt and after a "budget on track" moment. Never on first launch.
- **Custom Product Pages:** one per cluster (receipt scanner, grocery budget, saving on groceries) so paid/social/web links land on matching screenshots.
- **Iterate:** change metadata every 4–6 weeks, one variable at a time; track keyword rank with App Store Connect + a tracker (AppFollow, Sensor Tower, or free tiers).
- **Localization:** the product handles multi-language receipts. Add Canadian English (CA), UK, and Australia metadata early, since spelling and store names differ ("groceries", "Loblaws", "Tesco", "Woolworths") and competition is lower than en-US.

## 5. Channel 2 — Website content

Move from one page to a small, indexable site. The site is already Astro with static output, which suits this: add `/blog` and `/tools` as Astro pages or content collections, and generate `sitemap.xml` from them.

### 5.1 Page set (MVP launch)

| URL | Purpose | Primary query |
|---|---|---|
| `/` | Homepage, rewritten around receipt → budget | brand + "grocery receipt budget app" |
| `/receipt-scanner` | Feature landing page | "receipt scanner app" (1K–10K US) |
| `/grocery-budget-app` | Feature landing page; also targets "grocery apps to save money" | "grocery budget app", "grocery budget" |
| `/vs/mint-alternative`, `/vs/ynab` | Comparison pages, honest and specific | "mint alternative", "ynab alternative" (100–1K US each) |
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

Starter list (posts 1 and 6 target 100–1K US queries each; post 5 replaces the dropped `/track-cash-spending` page):
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

Do these once, in this order. Status on `origin/main`: step 1 is done; step 2 has `SoftwareApplication` only; step 4's sitemap lists the three live pages with `lastmod`, maintained by hand in `marketing/public/sitemap.xml`. Generate it from the page set once there are more pages.

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

Keyword volumes were measured with Google Keyword Planner on 2026-11-14 (section 3).

## 12. Status of follow-ups (2026-11-14, after reconciling with `origin/main`)

| Item | Status |
|---|---|
| Keyword volumes | Done 2026-11-14: Keyword Planner ranges for US and Canada are in section 3. The App Store name, subtitle and keywords were revised from them (`docs/aso-metadata.md`). Price history ships at launch, so `price` is in the keywords. |
| Privacy FAQ claim ("delete account from Settings") | Now true: in-app account deletion exists on `origin/main` (`DELETE /api/users/me`, `account_service.py`, which also revokes the Sign in with Apple grant by re-authenticating). Not re-verified in this pass. |
| Soft-delete purge and Celery registration | Already on `origin/main` (`purge_tasks.py`, task modules in `include=`). Not re-verified here. An earlier local version of this work was dropped as redundant. |
| Waitlist form | Origin has its own Worker-based waitlist. A bug in the old `app.js` (messages never shown) no longer applies. A real end-to-end signup against Resend was never tested by me. |
| en-CA metadata | Drafted in `docs/aso-metadata.md`. |
| Public privacy and support pages | Live 2026-11-14 (PR #154) at `/privacy` and `/support`. Checked in Chrome after the deploy. `/privacy` is built from `privacy.ts` and stays a draft until legal sign-off. Terms: none (deliberately dropped; the lawyer brief asks whether we need them). |
| Contact addresses | Decided 2026-11-14 (section 13): `privacy@` for privacy and data requests (already in the app), `support@` for help, `hello@` as the waitlist and launch sender. |

## 13. Domain layout (decided 2026-11-14)

Everything lives on the root domain, `grocerygenie.app`:

- Marketing site (Cloudflare, per marketing decision #21), legal pages and support.
- Blog at `grocerygenie.app/blog`. Chosen over a subdomain so blog links and rankings strengthen the same domain as the feature pages (Google can treat a subdomain as a partly separate site).
- Email (decided 2026-11-14):
  - `privacy@grocerygenie.app`: privacy questions, data and deletion requests. Already used in the app (`mobile/src/constants/links.ts`); the public privacy page uses it too.
  - `support@grocerygenie.app`: help and bug reports. The App Store support URL page and the site footer point here.
  - `hello@grocerygenie.app`: sender for waitlist and launch emails (`WAITLIST_FROM` on the marketing Worker). Replies should reach a monitored inbox.

Follow-ups:
- Mailboxes: `privacy@`, `support@` and `hello@` set up as Cloudflare Email Routing forwards (reported done 2026-11-14). Send one test message to each before the privacy policy goes live.
- Sending stays on Resend for now: the marketing Worker and the backend both call Resend, and the waitlist itself is a Resend audience that the free-year matching syncs. Cloudflare Email Sending (beta, Workers Paid) could replace Resend for transactional mail later; it would not replace the audience.
- The backend's transactional sender (`GG_RESEND_FROM`: sign-up verification, password reset) still defaults to a Resend test address; choose its production value with the email setup.
- Sending domain: verified in Resend and `WAITLIST_FROM` set on the marketing Worker (reported done 2026-11-14). Public DNS checked the same day: DKIM at `resend._domainkey`, bounce MX and SPF at `send.`, DMARC `p=none` with Cloudflare reports; a test send showed SPF, DKIM and DMARC passing (reported). Still to do: set `GG_RESEND_FROM` when the backend is deployed, and move DMARC to `p=quarantine` after 2–4 weeks of clean reports.
- Verify a Search Console **Domain property** for `grocerygenie.app`.
- Optional, later: if bulk email volume grows, move newsletters to a sending subdomain (for example `updates.`) so marketing reputation stays separate from operational mail. Users never need to see it.
- The blog should be built as static pages under `/blog` using the same build and `sitemap.xml`.
