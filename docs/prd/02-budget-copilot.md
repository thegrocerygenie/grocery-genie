# Epic: Budget Copilot [MVP]

Real-time spending awareness with intelligent alerts. Turns receipt data into actionable budget insights without requiring setup beyond scanning.

## User Stories

### BC-01: Auto-Categorization [MVP]
**As a** user, **I want to** have my receipt items automatically categorized into spending categories, **so that** I can see where my money goes without manual sorting.

**Acceptance Criteria:**
1. Eight default categories: Groceries, Household, Personal Care, Beverages, Snacks & Treats, Baby & Kids, Pet, Other.
2. LLM assigns category per line item with confidence score.
3. Items with category confidence below threshold flagged for user review.
4. Previously-confirmed items use user corrections deterministically (override dictionary takes priority over LLM).

### BC-02: Budget Setting [MVP]
**As a** user, **I want to** set monthly budgets for overall spending and individual categories, **so that** I get alerted before I overspend.

**Acceptance Criteria:**
1. Overall monthly grocery budget configurable.
2. Per-category monthly budgets independently configurable.
3. Budget periods align to calendar months by default; custom start date supported.
4. Budget amounts editable at any time; changes take effect immediately for current period.

### BC-03: Proactive Alerts [MVP]
**As a** user, **I want to** receive proactive alerts when spending approaches or exceeds thresholds, **so that** I can adjust before it's too late.

**Acceptance Criteria:**
1. Push notification at 80% consumed (configurable: 50%, 80%, 100%).
2. Notification includes remaining budget and days left in period.
3. Notification at 100% confirms overspend with overage amount.
4. Alerts respect device notification preferences; toggleable per category.
   - MVP (2026-11-02): Settings → Alerts lists each category with a budget, with a switch. A muted category's budget sends no alert; the overall budget still does.

### BC-04: Spending Dashboard [MVP]
**As a** user, **I want to** view a spending dashboard with breakdowns and trends, **so that** I understand my patterns over time.

**Acceptance Criteria:**
1. Current month spending vs. budget as progress bar per category.
2. Month-over-month comparison for total and per-category.
3. Top 10 items by total spend in current period.
4. Rolling 3-month trend visualization.
5. Dashboard loads within 2 seconds.
6. [V1.1] (DA-10) Range chips 1M, 3M, 6M, 1Y, All under the Trend chart. 1M and 3M are free; 6M, 1Y and All are Premium (the 12-month gate, D2, stays) and show a free user the upgrade prompt, never an error. All covers every month since the user's first receipt. `GET /api/dashboard/spending` takes `months` 1, 3, 6, 12 or `all`; over 3 answers a free user `403 premium_required`.
7. [V1.1] (DA-10) The headline is "<N>-month average" with the change from the N months before it (labelled "YoY" for 1Y); with no earlier months, or for All, no change is shown.
8. [V1.1] (DA-10) A "Highlights" group under the chips: Highest (month and total), Lowest (month and total; months with no spending and the current month, not yet over, are left out, and with none left it says "No finished month with spending yet"), and Trend (direction in words and the percent: the headline's change, so none when the headline has none; for All, which has no headline change, the later half of the months against the earlier half). A change under 5% either way reads "Steady". (User answers, DA-10 review, 2026-11-05.)
9. [V1.1] (DA-10) Bars are grey with the current month in the tint colour, each labelled with its month's initial; VoiceOver reads each bar's month and total.
10. [V1.1] (DA-10) Every Trend string lives in the content file for i18n; none is hard-coded in the screen.

### BC-05: Category Corrections [MVP]
**As a** user, **I want to** correct a category assignment on any item, **so that** my budget tracking reflects my actual patterns.

**Acceptance Criteria:**
1. Tap any item to reassign from category list.
2. Correction applied retroactively to all instances of that item in user's history.
3. Custom categories supported (up to 10 additional) for premium users.
4. Corrections feed per-user item-category mapping dictionary for future scans.
5. [V1.1] (DA-9) Every category has a colour and an icon. The eight built-ins have fixed ones; a custom category takes a colour from the palette in `theme.ts` and an icon from a fixed set, chosen when it is created or edited (the first of each when none is chosen). `GET /api/categories` returns `color` and `icon` for every category; `POST` and `PATCH` accept them from the allowed sets (422 otherwise). A migration adds both columns.
6. [V1.1] (DA-9) Settings → Categories follows the design: "Built-in" first, each with its icon square; then "Custom", with round icons, a "New category" row and the footer "Custom categories require Premium."; an "Edit" button in the navigation bar to rename or delete custom categories.
7. [V1.1] (DA-9) The colour and icon show wherever the category is listed with one: Settings → Categories, the category picker, and the dashboard's category bars.
8. [V1.1] (DA-9) After Premium lapses, custom categories keep their colour and icon; changing them needs Premium (`403 premium_required`, the app's upgrade prompt).

### BC-06: Weekly Summary [MVP]
**As a** user, **I want to** receive a weekly spending summary, **so that** I stay informed without opening the app daily.

**Acceptance Criteria:**
1. Push notification or email (user preference) with total spend, top category, budget status.
   - MVP (decided 2026-11-02): push and in-app only. Email is deferred; the summary reads "This week: $X. Top category: Y. <comparison> Budget: $A of $B used (N%)."
2. Includes comparison to prior week ("You spent 12% more than last week").
3. Delivered on user-configurable day (default: Sunday morning).
   - MVP (2026-11-02): at 9 AM in the user's time zone, which the app sets from the iPhone at sign-up and keeps current.
4. Links to full dashboard.

## Functional Requirements

### Categorization Engine [MVP]
- Eight default categories (listed above).
- LLM-based assignment during extraction. Prompt includes category definitions and examples.
- Per-user override dictionary takes priority over LLM for previously-corrected items.
- Custom categories (up to 10 additional) for premium users.

### Budget Management [MVP]
- Monthly budget with configurable start date (default: 1st of month).
- Overall and per-category budgets, independently configurable.
- Rollover: unspent budget does not roll over by default. Optional rollover toggle (premium).
- Budget CRUD: create, read, update. Deleting a budget retains historical data.

### Notifications & Alerts [MVP]
- Push at configurable thresholds (default: 80% and 100%).
- Weekly summary (day/time user-configurable).
- All notifications respect OS permissions and in-app toggle per type.
- Content includes actionable context (remaining amount, days left, comparison).

### Spending Dashboard [MVP]
- Current period: progress bar per category, overall spending card.
- Trends: month-over-month bar chart (3-month rolling at MVP, expandable to 12 in V1.1).
- Top items: ranked list by total spend in current period.
- Refreshes on app foreground and after receipt confirmation.
