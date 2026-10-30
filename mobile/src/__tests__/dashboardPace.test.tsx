/**
 * Design 05 · Dashboard: under the cap, the hero says whether spend keeps pace
 * with the month ("On pace · N% under") or runs ahead of it ("Ahead of pace ·
 * N% over"), not "On pace" every time.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { DashboardData } from '@/features/budget/types';

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

function withSpend(spent: number, budget = 400) {
  mockDashboard.data = {
    period: '2026-04',
    overall: { budget, spent, remaining: budget - spent, percent: (spent / budget) * 100 },
    categories: [],
    top_items: [],
    trend: [],
    previous_period: '2026-03',
    category_changes: [],
    has_receipts: true,
  };
}

// Half the month gone. renderRouter resets fake timers, so the share is mocked
// rather than the clock; budgetPace itself is the real one.
jest.mock('@/features/budget/utils/pace', () => ({
  ...jest.requireActual('@/features/budget/utils/pace'),
  monthShareElapsed: () => 0.5,
}));

function renderDashboard() {
  renderRouter({ index: DashboardScreen }, { initialUrl: '/' });
}

describe('Dashboard pace', () => {
  it('says how far under pace when spend trails the month', () => {
    withSpend(160); // 40% of the cap, 50% of the month
    renderDashboard();

    expect(screen.getByText('On pace · 20% under')).toBeTruthy();
  });

  it('says spend is ahead of pace when it runs ahead of the month', () => {
    withSpend(300); // 75% of the cap, 50% of the month
    renderDashboard();

    expect(screen.getByText('Ahead of pace · 50% over')).toBeTruthy();
    expect(screen.queryByText(/^On pace/)).toBeNull();
  });

  it('still says how far over the cap once spend passes it', () => {
    withSpend(460);
    renderDashboard();

    expect(screen.getByText(/^Over by \$60 · \d+ days left$/)).toBeTruthy();
  });
});
