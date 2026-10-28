/**
 * M9: the pull-to-refresh spinner shows only for a refresh the user pulled.
 * A background refetch (focus, or a confirmed receipt invalidating the
 * dashboard) must not drive it, or iOS can leave it stuck on screen.
 */
import { RefreshControl } from 'react-native';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockQuery = {
  isRefetching: false,
  refetch: jest.fn<Promise<unknown>, []>(),
};
const data: DashboardData = {
  period: '2026-04',
  overall: { budget: 400, spent: 100, remaining: 300, percent: 25 },
  categories: [],
  top_items: [],
  trend: [],
  previous_period: '2026-03',
  category_changes: [],
};
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data,
    isLoading: false,
    isRefetching: mockQuery.isRefetching,
    refetch: mockQuery.refetch,
  }),
}));

function refreshControl() {
  return screen.UNSAFE_getByType(RefreshControl);
}

beforeEach(() => {
  mockQuery.isRefetching = false;
  mockQuery.refetch.mockReset();
});

describe('Dashboard pull-to-refresh', () => {
  it('does not spin for a background refetch', () => {
    mockQuery.isRefetching = true;
    renderRouter({ index: DashboardScreen }, { initialUrl: '/' });

    expect(refreshControl().props.refreshing).toBe(false);
  });

  it('spins while a pulled refresh runs, then stops', async () => {
    let finish: (value: unknown) => void = () => {};
    mockQuery.refetch.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderRouter({ index: DashboardScreen }, { initialUrl: '/' });

    act(() => {
      void refreshControl().props.onRefresh();
    });
    expect(refreshControl().props.refreshing).toBe(true);

    await act(async () => finish(undefined));
    expect(refreshControl().props.refreshing).toBe(false);
  });

  it('stops spinning when the refresh fails', async () => {
    mockQuery.refetch.mockRejectedValue(new Error('offline'));
    renderRouter({ index: DashboardScreen }, { initialUrl: '/' });

    await act(async () => refreshControl().props.onRefresh());
    expect(refreshControl().props.refreshing).toBe(false);
  });
});
