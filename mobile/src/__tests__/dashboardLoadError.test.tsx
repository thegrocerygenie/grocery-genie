/**
 * When the dashboard cannot load (server down, no connection), Budget says so
 * and offers a retry instead of the "Scan your first receipt" empty state.
 */
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockRefetch = jest.fn();
const mockDashboard: { data: DashboardData | undefined; isError: boolean } = {
  data: undefined,
  isError: false,
};
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: mockDashboard.data,
    isError: mockDashboard.isError,
    isLoading: false,
    isRefetching: false,
    refetch: mockRefetch,
  }),
}));

const cached: DashboardData = {
  period: '2026-10',
  overall: { budget: 400, spent: 120, remaining: 280, percent: 30 },
  categories: [],
  top_items: [],
  trend: [],
  previous_period: '2026-09',
  category_changes: [],
};

function renderDashboard() {
  renderRouter({ index: DashboardScreen }, { initialUrl: '/' });
}

beforeEach(() => {
  mockRefetch.mockClear();
  mockDashboard.data = undefined;
  mockDashboard.isError = false;
});

describe('Dashboard load error', () => {
  it('shows an error with a retry, not the empty state, when the load fails', () => {
    mockDashboard.isError = true;
    renderDashboard();

    expect(screen.getByText('Couldn’t load your budget')).toBeTruthy();
    expect(screen.queryByText('Scan your first receipt')).toBeNull();

    fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps showing data it already has when a refresh fails', () => {
    mockDashboard.isError = true;
    mockDashboard.data = cached;
    renderDashboard();

    expect(screen.queryByText('Couldn’t load your budget')).toBeNull();
    expect(screen.getByText(/\$120 \/ \$400/)).toBeTruthy();
  });

  it('still shows the empty state for a user with no receipts', () => {
    renderDashboard();

    expect(screen.getByText('Scan your first receipt')).toBeTruthy();
    expect(screen.queryByText('Couldn’t load your budget')).toBeNull();
  });
});
