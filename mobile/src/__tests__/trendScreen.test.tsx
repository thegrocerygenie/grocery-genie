/**
 * BC-04 AC 2: the Trend screen compares this month with last month, for the
 * total and for each category, from real dashboard data.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import TrendScreen from '../../app/trend';
import type { DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const mockDashboard: { data: DashboardData | undefined } = { data: undefined };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({ data: mockDashboard.data, isLoading: false }),
}));

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    period: '2026-03',
    overall: { budget: 500, spent: 35, remaining: 465, percent: 7 },
    categories: [],
    top_items: [],
    trend: [
      { period: '2026-01', spent: 0, budget: 500, categories: [] },
      {
        period: '2026-02',
        spent: 30,
        budget: 500,
        categories: [
          { category_id: 'c1', name: 'Groceries', spent: 20 },
          { category_id: 'c3', name: 'Beverages', spent: 10 },
        ],
      },
      {
        period: '2026-03',
        spent: 35,
        budget: 500,
        categories: [
          { category_id: 'c1', name: 'Groceries', spent: 30 },
          { category_id: 'c2', name: 'Household', spent: 5 },
        ],
      },
    ],
    previous_period: '2026-02',
    category_changes: [
      { category_id: 'c1', name: 'Groceries', spent: 30, previous_spent: 20 },
      { category_id: 'c2', name: 'Household', spent: 5, previous_spent: 0 },
      { category_id: 'c3', name: 'Beverages', spent: 0, previous_spent: 10 },
    ],
    ...overrides,
  };
}

function renderTrend() {
  renderRouter({ trend: TrendScreen }, { initialUrl: '/trend' });
}

describe('Trend screen month-over-month', () => {
  it("compares this month's total with last month's", () => {
    mockDashboard.data = dashboard();
    renderTrend();

    expect(screen.getByText('March spending')).toBeTruthy();
    expect(screen.getByLabelText('Up 17 percent from February')).toBeTruthy();
    expect(screen.queryByText(/vs prior/)).toBeNull();
  });

  it('compares each category with last month', () => {
    mockDashboard.data = dashboard();
    renderTrend();

    expect(
      screen.getByLabelText('Groceries: $30 this month, $20 in February, up 50 percent'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Household: $5 this month, new this month')).toBeTruthy();
    expect(
      screen.getByLabelText('Beverages: $0 this month, $10 in February, down 100 percent'),
    ).toBeTruthy();
  });

  it('charts the rolling 3 months (BC-04 AC 4)', () => {
    mockDashboard.data = dashboard();
    renderTrend();

    for (const label of ['January: $0', 'February: $30', 'March: $35']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('drops the placeholder legend', () => {
    mockDashboard.data = dashboard();
    renderTrend();

    expect(screen.queryByText('LEGEND')).toBeNull();
  });

  it('shows no total change when last month had no spending', () => {
    mockDashboard.data = dashboard({
      trend: [
        { period: '2026-01', spent: 0, budget: null },
        { period: '2026-02', spent: 0, budget: null },
        { period: '2026-03', spent: 35, budget: null },
      ],
      category_changes: [{ category_id: 'c1', name: 'Groceries', spent: 35, previous_spent: 0 }],
    });
    renderTrend();

    expect(screen.getByText('March spending')).toBeTruthy();
    expect(screen.queryByLabelText(/percent from February/)).toBeNull();
  });

  it('stacks each month by category in the category colour (design: 3-month trend)', () => {
    mockDashboard.data = dashboard();
    renderTrend();

    const groceries = screen.getByTestId('trend-segment-2026-03-c1');
    const household = screen.getByTestId('trend-segment-2026-03-c2');
    expect(groceries).toHaveStyle({ backgroundColor: '#34C759' });
    expect(household).toHaveStyle({ backgroundColor: '#007AFF' });
    // A category with no spend that month draws nothing.
    expect(screen.queryByTestId('trend-segment-2026-03-c3')).toBeNull();
    expect(screen.queryByTestId('trend-segment-2026-01-c1')).toBeNull();
  });

  it('lists each category with its 3-month average', () => {
    mockDashboard.data = dashboard();
    renderTrend();

    expect(screen.getByLabelText('Groceries, 3-month average $17')).toBeTruthy();
    expect(screen.getByLabelText('Beverages, 3-month average $3')).toBeTruthy();
    expect(screen.getByLabelText('Household, 3-month average $2')).toBeTruthy();
  });

  it('draws plain bars when the server sends no category split', () => {
    mockDashboard.data = dashboard({
      trend: [
        { period: '2026-02', spent: 30, budget: null },
        { period: '2026-03', spent: 35, budget: null },
      ],
    });
    renderTrend();

    expect(screen.getByLabelText('March: $35')).toBeTruthy();
    expect(screen.queryByLabelText(/3-month average \$/)).toBeNull();
  });
});
