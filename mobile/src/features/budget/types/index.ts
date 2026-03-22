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

export interface DashboardTrendMonth {
  period: string;
  spent: number;
  budget: number | null;
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
}

export interface BudgetCreateRequest {
  category_id: string | null;
  amount: number;
  period_type: string;
  period_start: string;
}

export interface BudgetUpdateRequest {
  amount: number;
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
