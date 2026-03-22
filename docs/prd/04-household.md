# Epic: Household Sharing [V1.5]

Multiple family members contribute receipts to a unified budget, price history, and (eventually) pantry inventory. Data is shared; permissions are controlled.

## User Stories

### HH-01: Invite Members [V1.5]
**As a** household admin, **I want to** invite family members to a shared household, **so that** our grocery data is consolidated.

**Acceptance Criteria:**
1. Invite via email or shareable link.
2. Invitee creates account or links existing account.
3. Max 5 members (Premium), unlimited (Family tier).
4. Household creator is default admin.

### HH-02: Role-Based Access [V1.5]
**As a** household admin, **I want to** control what each member can see and do, **so that** I maintain appropriate privacy and control.

**Acceptance Criteria:**
1. Three roles: Admin (full access, manage members/budgets), Contributor (scan, view shared data, edit own receipts), Viewer (read-only dashboards/history).
2. Role changes take effect immediately.
3. Admins can remove members; removed members retain own individual data.

### HH-03: Household vs. Individual View [V1.5]
**As a** household member, **I want to** see both my individual and our household's combined spending, **so that** I understand my contribution.

**Acceptance Criteria:**
1. Dashboard toggle: "My spending" vs. "Household spending."
2. Household view aggregates all members' receipts.
3. Per-member spending breakdown within household view.
4. Budgets settable at household (shared) or individual level.

## Functional Requirements

### Household Management [V1.5]
- Creation by any registered user (becomes admin).
- Invite via email or shareable link (expires after 7 days).
- Max members enforced by tier.
- User belongs to only one household at a time.
- Dissolution: admin dissolves household; members revert to individual; historical data partitioned back.

### Role-Based Access [V1.5]
- Three roles: Admin, Contributor, Viewer.
- Per-household role, not global.
- At least one Admin must exist. Last admin cannot be demoted.

### Data Aggregation [V1.5]
- Household dashboard aggregates all members' receipts.
- Budgets at household level (shared) or individual level (personal within household).
- Price intelligence data shared: all members' receipts contribute to household price history.
