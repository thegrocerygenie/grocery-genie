import { apiClient } from '@/services/api';
import type {
  BudgetCreateRequest,
  BudgetResponse,
  BudgetUpdateRequest,
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

/** How many months the dashboard trend covers (V1.1: 12 is Premium, D2). */
export type TrendMonths = 3 | 12;

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
