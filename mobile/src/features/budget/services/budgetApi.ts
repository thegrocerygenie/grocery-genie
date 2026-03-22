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

export async function updateBudget(
  budgetId: string,
  data: BudgetUpdateRequest,
): Promise<BudgetResponse> {
  return apiClient<BudgetResponse>(`/api/budgets/${budgetId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getDashboardSpending(period?: string): Promise<DashboardData> {
  const params = period ? `?period=${period}` : '';
  return apiClient<DashboardData>(`/api/dashboard/spending${params}`);
}

export async function getCategories(): Promise<CategoryResponse[]> {
  return apiClient<CategoryResponse[]>('/api/categories');
}
