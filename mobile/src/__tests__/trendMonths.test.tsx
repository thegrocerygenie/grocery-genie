/**
 * V1.1 BC-04 trends: the Trend screen switches between 3 and 12 months. The
 * 12-month trend is Premium (D2); a free user sees an upgrade prompt, never an
 * error screen.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import TrendScreen from '../../app/trend';
import { ApiError } from '@/services/api';
import { useBudgetStore } from '@/store/budgetStore';
import type { DashboardData, DashboardTrendMonth } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// A plain view that keeps its props, so a test can pick a segment.
jest.mock('@react-native-segmented-control/segmented-control', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return function MockSegmented(props: object) {
    return <MockView testID="trend-months" {...props} />;
  };
});

const mockGetDashboardSpending = jest.fn();
jest.mock('@/features/budget/services/budgetApi', () => ({
  getDashboardSpending: (...a: unknown[]) => mockGetDashboardSpending(...a),
}));

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The `count` months ending at 2026-12, each spending $10 a month more. */
function trend(count: number): DashboardTrendMonth[] {
  return Array.from({ length: count }, (_, i) => {
    const m = 12 - count + i + 1;
    return { period: `2026-${String(m).padStart(2, '0')}`, spent: m * 10, budget: null };
  });
}

function dashboard(months: number): DashboardData {
  return {
    period: '2026-12',
    overall: { budget: 500, spent: 120, remaining: 380, percent: 24 },
    categories: [],
    top_items: [],
    trend: trend(months),
    prior_average: 0,
    previous_period: '2026-11',
    category_changes: [{ category_id: 'c1', name: 'Groceries', spent: 120, previous_spent: 110 }],
  };
}

const premiumRequired = new ApiError(403, {
  detail: {
    code: 'premium_required',
    feature: 'trend_12_months',
    message: 'This feature is part of Grocery Genie Premium.',
  },
});

function renderTrend() {
  return renderRouter(
    {
      _layout: () => {
        const { Stack } = jest.requireActual('expo-router');
        return (
          <QueryClientProvider client={new QueryClient()}>
            <Stack />
          </QueryClientProvider>
        );
      },
      trend: TrendScreen,
      paywall: () => null,
    },
    { initialUrl: '/trend' },
  );
}

function pick(index: 0 | 1) {
  fireEvent(screen.getByTestId('trend-months'), 'change', {
    nativeEvent: { selectedSegmentIndex: index },
  });
}

beforeEach(() => {
  mockGetDashboardSpending.mockReset();
  useBudgetStore.setState({ selectedPeriod: '2026-12' });
});

describe('Trend screen 3 or 12 months', () => {
  it('shows 3 months by default and asks the server for 3', async () => {
    mockGetDashboardSpending.mockResolvedValue(dashboard(3));
    renderTrend();

    expect(await screen.findByLabelText('December: $120')).toBeTruthy();
    expect(mockGetDashboardSpending).toHaveBeenCalledWith('2026-12', 3);
    expect(mockGetDashboardSpending).not.toHaveBeenCalledWith('2026-12', 12);
    expect(screen.getByTestId('trend-months').props.selectedIndex).toBe(0);
    expect(screen.queryByLabelText('January: $10')).toBeNull();
    expect(screen.getByText('3-month average $110')).toBeTruthy();
  });

  it('switching to 12 months asks the server for 12 and charts every month', async () => {
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) =>
      Promise.resolve(dashboard(months)),
    );
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick(1);

    expect(await screen.findByLabelText('January: $10')).toBeTruthy();
    expect(mockGetDashboardSpending).toHaveBeenCalledWith('2026-12', 12);
    MONTHS.forEach((name, i) => {
      expect(screen.getByLabelText(`${name}: $${(i + 1) * 10}`)).toBeTruthy();
    });
    expect(screen.getByText('12-month average $65')).toBeTruthy();
    expect(screen.getByTestId('trend-months').props.selectedIndex).toBe(1);
  });

  it('compares the 12-month average with the 12 months before', async () => {
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) =>
      Promise.resolve({ ...dashboard(months), prior_average: months === 12 ? 50 : 0 }),
    );
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick(1);

    expect(await screen.findByText('+30% vs prior 12 months')).toBeTruthy();
    expect(screen.getByLabelText('Up 30 percent from the 12 months before')).toBeTruthy();
  });

  it('a free user asking for 12 months sees an upgrade prompt, not an error', async () => {
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) =>
      months === 12 ? Promise.reject(premiumRequired) : Promise.resolve(dashboard(3)),
    );
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick(1);

    expect(await screen.findByText('See your whole year')).toBeTruthy();
    expect(screen.getByText(/12-month trend is part of Grocery Genie Premium/)).toBeTruthy();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText(/Couldn.t load/)).toBeNull();
    // The month-over-month summary and categories stay on screen.
    expect(screen.getByText('December spending')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
    // premium_required is an answer, not a failure: it is not retried.
    const twelve = mockGetDashboardSpending.mock.calls.filter(([, m]) => m === 12);
    expect(twelve).toHaveLength(1);
  });

  it('the upgrade prompt opens the Premium paywall (V11-P0)', async () => {
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) =>
      months === 12 ? Promise.reject(premiumRequired) : Promise.resolve(dashboard(3)),
    );
    const app = renderTrend();
    await screen.findByLabelText('December: $120');
    pick(1);

    fireEvent.press(await screen.findByLabelText('Learn About Premium'));
    expect(app.getPathname()).toBe('/paywall');
  });

  it('switching back to 3 months after the upgrade prompt shows the 3-month chart', async () => {
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) =>
      months === 12 ? Promise.reject(premiumRequired) : Promise.resolve(dashboard(3)),
    );
    renderTrend();
    await screen.findByLabelText('December: $120');
    pick(1);
    await screen.findByText('See your whole year');

    pick(0);

    await waitFor(() => expect(screen.queryByText('See your whole year')).toBeNull());
    expect(screen.getByLabelText('December: $120')).toBeTruthy();
    expect(screen.getByText('3-month average $110')).toBeTruthy();
  });

  it('another failure loading 12 months offers a retry', async () => {
    let fail = true;
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) => {
      if (months === 12 && fail) return Promise.reject(new ApiError(500, null));
      return Promise.resolve(dashboard(months));
    });
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick(1);

    const retry = await screen.findByLabelText('Try again', {}, { timeout: 15000 });
    expect(screen.queryByText('See your whole year')).toBeNull();
    fail = false;
    fireEvent.press(retry);
    expect(await screen.findByLabelText('January: $10')).toBeTruthy();
  }, 20000);
});
