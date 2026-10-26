/**
 * Design "Top items": the month in the subtitle, and each bar in the colour
 * of the item's category (BC-04 AC 3).
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import TopItemsScreen from '../../app/top-items';
import type { DashboardData } from '@/features/budget/types';

const mockDashboard: { data: DashboardData | undefined } = { data: undefined };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({ data: mockDashboard.data, isLoading: false }),
}));

function dashboard(top_items: DashboardData['top_items']): DashboardData {
  return {
    period: '2026-04',
    overall: { budget: 400, spent: 242, remaining: 158, percent: 60.5 },
    categories: [],
    top_items,
    trend: [],
    previous_period: '2026-03',
    category_changes: [],
  };
}

function renderTopItems() {
  renderRouter({ 'top-items': TopItemsScreen }, { initialUrl: '/top-items' });
}

describe('Top items', () => {
  it('names the month it ranks', () => {
    mockDashboard.data = dashboard([{ name: 'Avocado', total_spent: 58.2, count: 12 }]);
    renderTopItems();

    expect(screen.getByText('April · ranked by total spend')).toBeTruthy();
  });

  it('colours each bar by the item’s category', () => {
    mockDashboard.data = dashboard([
      {
        name: 'Cold brew',
        total_spent: 39.95,
        count: 5,
        category_id: 'b',
        category_name: 'Beverages',
      },
      {
        name: 'Detergent',
        total_spent: 17.4,
        count: 2,
        category_id: 'h',
        category_name: 'Household',
      },
      { name: 'Gift card', total_spent: 10, count: 1, category_id: null, category_name: null },
    ]);
    renderTopItems();

    expect(screen.getByTestId('top-item-bar-0')).toHaveStyle({ backgroundColor: '#5856D6' });
    expect(screen.getByTestId('top-item-bar-1')).toHaveStyle({ backgroundColor: '#007AFF' });
    expect(screen.getByTestId('top-item-bar-2')).toHaveStyle({ backgroundColor: '#8E8E93' });
  });
});
