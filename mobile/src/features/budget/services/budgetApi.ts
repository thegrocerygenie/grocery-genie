import { apiClient } from '@/services/api';
import type {
  BudgetCreateRequest,
  BudgetResponse,
  BudgetUpdateRequest,
  CategoryInput,
  CategoryResponse,
  DashboardData,
} from '../types';

export async function createBudget(data: BudgetCreateRequest): Promise<BudgetResponse> {
  return apiClient<BudgetResponse>('/api/budgets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listBudgets(): Promise<BudgetResponse[]> {
  return apiClient<BudgetResponse[]>('/api/budgets');
}

export async function deleteBudget(budgetId: string): Promise<void> {
  await apiClient<void>(`/api/budgets/${budgetId}`, { method: 'DELETE' });
}

export async function updateBudget(
  budgetId: string,
  data: BudgetUpdateRequest,
): Promise<BudgetResponse> {
  return apiClient<BudgetResponse>(`/api/budgets/${budgetId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** Turn rollover on or off for one budget. Premium: a free user gets `403 premium_required`. */
export async function setBudgetRollover(
  budgetId: string,
  enabled: boolean,
): Promise<BudgetResponse> {
  return apiClient<BudgetResponse>(`/api/budgets/${budgetId}/rollover`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

/**
 * How many months the dashboard trend covers: the Trend screen's range chips
 * (BC-04 AC 6). `all` is every month since the first receipt. Over 3 is
 * Premium (D2, D11); the server answers a free user `403 premium_required`.
 */
export type TrendMonths = 1 | 3 | 6 | 12 | 'all';

export async function getDashboardSpending(
  period?: string,
  months: TrendMonths = 3,
): Promise<DashboardData> {
  const params = new URLSearchParams({ months: String(months) });
  if (period) params.set('period', period);
  return apiClient<DashboardData>(`/api/dashboard/spending?${params.toString()}`);
}

export async function getCategories(): Promise<CategoryResponse[]> {
  return apiClient<CategoryResponse[]>('/api/categories');
}

/** Add a custom category (Premium; at most 10), with its colour and icon. */
export async function createCategory(
  input: CategoryInput & { name: string },
): Promise<CategoryResponse> {
  return apiClient<CategoryResponse>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Rename one of the user's custom categories, or change its colour or icon (Premium). */
export async function updateCategory(id: string, input: CategoryInput): Promise<CategoryResponse> {
  return apiClient<CategoryResponse>(`/api/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Delete a custom category: its items move to Other, its budget goes. */
export async function deleteCategory(id: string): Promise<void> {
  await apiClient<void>(`/api/categories/${id}`, { method: 'DELETE' });
}
