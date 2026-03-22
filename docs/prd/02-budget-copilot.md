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

### BC-04: Spending Dashboard [MVP]
**As a** user, **I want to** view a spending dashboard with breakdowns and trends, **so that** I understand my patterns over time.

**Acceptance Criteria:**
1. Current month spending vs. budget as progress bar per category.
2. Month-over-month comparison for total and per-category.
3. Top 10 items by total spend in current period.
4. Rolling 3-month trend visualization.
5. Dashboard loads within 2 seconds.

### BC-05: Category Corrections [MVP]
**As a** user, **I want to** correct a category assignment on any item, **so that** my budget tracking reflects my actual patterns.

**Acceptance Criteria:**
1. Tap any item to reassign from category list.
2. Correction applied retroactively to all instances of that item in user's history.
3. Custom categories supported (up to 10 additional) for premium users.
4. Corrections feed per-user item-category mapping dictionary for future scans.

### BC-06: Weekly Summary [MVP]
**As a** user, **I want to** receive a weekly spending summary, **so that** I stay informed without opening the app daily.

**Acceptance Criteria:**
1. Push notification or email (user preference) with total spend, top category, budget status.
2. Includes comparison to prior week ("You spent 12% more than last week").
3. Delivered on user-configurable day (default: Sunday morning).
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
