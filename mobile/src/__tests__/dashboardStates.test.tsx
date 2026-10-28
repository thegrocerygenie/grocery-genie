/**
 * L7: "Scan your first receipt" is only for an account with no receipts.
 * L3: the dashboard ranks categories by spend, as Trend does.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { BudgetCategorySummary, DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockDashboard: { data: DashboardData | undefined } = { data: undefined };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: mockDashboard.data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

function category(name: string, spent: number, budget = 0): BudgetCategorySummary {
  return {
    category_id: name,
    name,
    budget,
    spent,
    remaining: budget - spent,
    percent: budget > 0 ? (spent / budget) * 100 : 0,
  };
}

function dashboard(over: Partial<DashboardData>): DashboardData {
  return {
    period: '2026-04',
    overall: { budget: 0, spent: 0, remaining: 0, percent: 0 },
    categories: [],
    top_items: [],
    trend: [],
    previous_period: '2026-03',
    category_changes: [],
    ...over,
  };
}

function renderDashboard() {
  renderRouter({ index: DashboardScreen }, { initialUrl: '/' });
}

describe('Dashboard first-scan state (L7)', () => {
  it('shows "Scan your first receipt" to a new account', () => {
    mockDashboard.data = dashboard({ has_receipts: false });
    renderDashboard();

    expect(screen.getByText('Scan your first receipt')).toBeTruthy();
  });

  it('shows the month, not the first-scan state, when receipts are in other months', () => {
    mockDashboard.data = dashboard({ has_receipts: true });
    renderDashboard();

    expect(screen.queryByText('Scan your first receipt')).toBeNull();
    // The current month's label, for example "October · day 28".
    expect(screen.getByText(/ · day \d+$/)).toBeTruthy();
  });
});

describe('Dashboard category order (L3)', () => {
  it('lists categories by spend, largest first', () => {
    mockDashboard.data = dashboard({
      overall: { budget: 0, spent: 90, remaining: -90, percent: 0 },
      has_receipts: true,
      categories: [category('Snacks & Treats', 10), category('Produce', 50), category('Dairy', 30)],
    });
    renderDashboard();

    const names = screen
      .getAllByText(/^(Snacks & Treats|Produce|Dairy)$/)
      .map((n) => n.props.children);
    expect(names).toEqual(['Produce', 'Dairy', 'Snacks & Treats']);
  });
});
