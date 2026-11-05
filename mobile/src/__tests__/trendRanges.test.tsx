/**
 * BC-04 AC 6 and 7 (DA-10): range chips 1M, 3M, 6M, 1Y and All under the
 * Trend chart. 1M and 3M are free; 6M, 1Y and All are Premium (D2, D11), and
 * the app never decides that itself: it asks the server, and a 403
 * premium_required shows the upgrade prompt, never an error.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import TrendScreen from '../../app/trend';
import { ApiError } from '@/services/api';
import { useBudgetStore } from '@/store/budgetStore';
import type { DashboardData, DashboardTrendMonth } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

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

function dashboard(months: number | 'all'): DashboardData {
  return {
    period: '2026-12',
    current_period: '2026-12',
    overall: { budget: 500, spent: 120, remaining: 380, percent: 24 },
    categories: [],
    top_items: [],
    // All: every month since the first receipt, in February.
    trend: trend(months === 'all' ? 11 : months),
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

function pick(label: string) {
  fireEvent.press(screen.getByLabelText(label));
}

function selected(label: string): boolean {
  return screen.getByLabelText(label).props.accessibilityState?.selected === true;
}

const freeUser = (_p: string, months: number | 'all') =>
  months === 1 || months === 3
    ? Promise.resolve(dashboard(months))
    : Promise.reject(premiumRequired);

beforeEach(() => {
  mockGetDashboardSpending.mockReset();
  useBudgetStore.setState({ selectedPeriod: '2026-12' });
});

describe('Trend range chips (BC-04 AC 6)', () => {
  it('shows 3 months by default and asks the server for 3', async () => {
    mockGetDashboardSpending.mockResolvedValue(dashboard(3));
    renderTrend();

    expect(await screen.findByLabelText('December: $120')).toBeTruthy();
    expect(mockGetDashboardSpending).toHaveBeenCalledWith('2026-12', 3);
    expect(mockGetDashboardSpending).toHaveBeenCalledTimes(1);
    expect(selected('3 months')).toBe(true);
    expect(selected('1 year')).toBe(false);
    expect(screen.queryByLabelText('January: $10')).toBeNull();
    expect(screen.getByText('3-month average')).toBeTruthy();
    expect(screen.getByLabelText('3-month average, $110')).toBeTruthy();
  });

  it('shows the five chips in order, under the chart', async () => {
    mockGetDashboardSpending.mockResolvedValue(dashboard(3));
    renderTrend();
    await screen.findByLabelText('December: $120');

    const chips = screen.getAllByTestId(/^trend-range-/);
    expect(chips.map((c) => c.props.testID)).toEqual([
      'trend-range-1',
      'trend-range-3',
      'trend-range-6',
      'trend-range-12',
      'trend-range-all',
    ]);
    expect(screen.getByText('1M')).toBeTruthy();
    expect(screen.getByText('1Y')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
    // Under the chart: the chips' row follows the chart in the tree.
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf('trend-chart')).toBeLessThan(json.indexOf('trend-range-1'));
  });

  it.each([
    ['1 month', 1],
    ['6 months', 6],
    ['1 year', 12],
    ['All time', 'all'],
  ] as const)('%s asks the server for months=%s', async (label, months) => {
    mockGetDashboardSpending.mockImplementation((_p: string, m: number | 'all') =>
      Promise.resolve(dashboard(m)),
    );
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick(label);

    await waitFor(() => expect(mockGetDashboardSpending).toHaveBeenCalledWith('2026-12', months));
    await waitFor(() => expect(selected(label)).toBe(true));
  });

  it('1Y charts every month and compares the year with the year before as YoY (AC 7)', async () => {
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) =>
      Promise.resolve({ ...dashboard(months), prior_average: months === 12 ? 50 : 0 }),
    );
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick('1 year');

    expect(await screen.findByLabelText('January: $10')).toBeTruthy();
    MONTHS.forEach((name, i) => {
      expect(screen.getByLabelText(`${name}: $${(i + 1) * 10}`)).toBeTruthy();
    });
    expect(screen.getByText('12-month average')).toBeTruthy();
    expect(screen.getByText('+30% YoY')).toBeTruthy();
    expect(screen.getByLabelText('Up 30 percent from the year before')).toBeTruthy();
  });

  it('1M compares the month with the month before (AC 7)', async () => {
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) =>
      Promise.resolve({ ...dashboard(months), prior_average: months === 1 ? 100 : 0 }),
    );
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick('1 month');

    expect(await screen.findByText('1-month average')).toBeTruthy();
    expect(screen.getByText('+20% vs prior month')).toBeTruthy();
    expect(screen.queryByLabelText('November: $110')).toBeNull();
  });

  it('All shows every month since the first receipt and no change (AC 6, 7)', async () => {
    mockGetDashboardSpending.mockImplementation((_p: string, months: number | 'all') =>
      // A server sending a prior average for All is still not compared.
      Promise.resolve({ ...dashboard(months), prior_average: 40 }),
    );
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick('All time');

    expect(await screen.findByLabelText('February: $20')).toBeTruthy();
    expect(screen.getByText('11-month average')).toBeTruthy();
    expect(screen.queryByText(/vs prior|YoY/)).toBeNull();
  });

  it.each(['6 months', '1 year', 'All time'])(
    'a free user picking %s sees the upgrade prompt, not an error (D2, D11)',
    async (label) => {
      mockGetDashboardSpending.mockImplementation(freeUser);
      renderTrend();
      await screen.findByLabelText('December: $120');

      pick(label);

      expect(await screen.findByText('See more of your spending')).toBeTruthy();
      expect(screen.getByText(/part of Grocery Genie Premium/)).toBeTruthy();
      expect(screen.queryByText('Try Again')).toBeNull();
      expect(screen.queryByText(/Couldn.t load/)).toBeNull();
      // No Highlights for a range the user cannot see.
      expect(screen.queryByText('Highlights')).toBeNull();
      // The chips and the month-over-month card stay on screen.
      expect(selected(label)).toBe(true);
      expect(screen.getByText('December spending')).toBeTruthy();
      expect(screen.getByText('Groceries')).toBeTruthy();
      // The server decided, once: premium_required is not retried.
      const asked = mockGetDashboardSpending.mock.calls.filter(([, m]) => m !== 3);
      expect(asked).toHaveLength(1);
    },
  );

  it('the upgrade prompt opens the Premium paywall (V11-P0)', async () => {
    mockGetDashboardSpending.mockImplementation(freeUser);
    const app = renderTrend();
    await screen.findByLabelText('December: $120');
    pick('1 year');

    fireEvent.press(await screen.findByLabelText('Learn About Premium'));
    expect(app.getPathname()).toBe('/paywall');
  });

  it('a free user picking 1M or back to 3M after the prompt sees the chart', async () => {
    mockGetDashboardSpending.mockImplementation(freeUser);
    renderTrend();
    await screen.findByLabelText('December: $120');
    pick('6 months');
    await screen.findByText('See more of your spending');

    pick('3 months');

    await waitFor(() => expect(screen.queryByText('See more of your spending')).toBeNull());
    expect(screen.getByLabelText('December: $120')).toBeTruthy();
    expect(screen.getByText('3-month average')).toBeTruthy();

    pick('1 month');
    expect(await screen.findByText('1-month average')).toBeTruthy();
    expect(screen.queryByText('See more of your spending')).toBeNull();
  });

  it('another failure loading a range offers a retry', async () => {
    let fail = true;
    mockGetDashboardSpending.mockImplementation((_p: string, months: number) => {
      if (months === 12 && fail) return Promise.reject(new ApiError(500, null));
      return Promise.resolve(dashboard(months));
    });
    renderTrend();
    await screen.findByLabelText('December: $120');

    pick('1 year');

    const retry = await screen.findByLabelText('Try again', {}, { timeout: 15000 });
    expect(screen.getByText('Couldn’t load this range.')).toBeTruthy();
    expect(screen.queryByText('See more of your spending')).toBeNull();
    fail = false;
    fireEvent.press(retry);
    expect(await screen.findByLabelText('January: $10')).toBeTruthy();
  }, 20000);
});
