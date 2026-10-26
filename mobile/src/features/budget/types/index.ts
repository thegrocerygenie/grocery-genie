export interface BudgetSummary {
  period: string;
  overall: {
    budget: number;
    spent: number;
    remaining: number;
    percent: number;
  };
  categories: BudgetCategorySummary[];
}

export interface BudgetCategorySummary {
  category_id: string;
  name: string;
  budget: number;
  spent: number;
  remaining: number;
  percent: number;
}

export interface DashboardTopItem {
  name: string;
  total_spent: number;
  count: number;
}

/** One category's share of a trend month; `category_id` is null for uncategorized spend. */
export interface DashboardTrendCategory {
  category_id: string | null;
  name: string;
  spent: number;
}

export interface DashboardTrendMonth {
  period: string;
  spent: number;
  budget: number | null;
  /** Absent from servers older than the category split. */
  categories?: DashboardTrendCategory[];
}

/** One category's spend in the period and in the month before it (BC-04). */
export interface DashboardCategoryChange {
  category_id: string;
  name: string;
  spent: number;
  previous_spent: number;
}

export interface DashboardData {
  period: string;
  overall: {
    budget: number;
    spent: number;
    remaining: number;
    percent: number;
  };
  categories: BudgetCategorySummary[];
  top_items: DashboardTopItem[];
  trend: DashboardTrendMonth[];
  previous_period: string;
  category_changes: DashboardCategoryChange[];
}

export interface BudgetCreateRequest {
  category_id: string | null;
  amount: number;
  period_type: string;
  period_start: string;
}

export interface BudgetUpdateRequest {
  amount: number;
  /** 'YYYY-MM-DD'; moves the period start day. */
  period_start?: string;
}

export interface BudgetResponse {
  id: string;
  category_id: string | null;
  amount: number;
  period_type: string;
  period_start: string;
  rollover_enabled: boolean;
}

export interface CategoryResponse {
  id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
}
