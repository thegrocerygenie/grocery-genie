/**
 * The Budget screen shows the period the server picked from the reset day,
 * with its day count, days left, and pace taken from the period's own dates.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockAskedFor: (string | undefined)[] = [];
const mockDashboard: { data: DashboardData | undefined } = { data: undefined };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: (period?: string) => {
    mockAskedFor.push(period);
    return { data: mockDashboard.data, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// November 3, 2026.
jest.mock('@/utils/today', () => ({ today: () => new Date(2026, 10, 3) }));

function dashboard(period: string, start: string, end: string, spent: number): DashboardData {
  return {
    period,
    period_start: start,
    period_end: end,
    overall: { budget: 400, spent, remaining: 400 - spent, percent: (spent / 400) * 100 },
    categories: [],
    top_items: [],
    trend: [],
    previous_period: '2026-09',
    category_changes: [],
    has_receipts: true,
  };
}

function renderDashboard() {
  renderRouter({ index: DashboardScreen }, { initialUrl: '/' });
}

beforeEach(() => {
  mockAskedFor.length = 0;
});

describe('Dashboard with a reset day of 15', () => {
  it('asks the server for the current period instead of naming a month', () => {
    mockDashboard.data = dashboard('2026-10', '2026-10-15', '2026-11-14', 100);
    renderDashboard();

    expect(mockAskedFor.length).toBeGreaterThan(0);
    expect(mockAskedFor.every((p) => p === undefined)).toBe(true);
  });

  it('labels the period by its dates and counts days within it', () => {
    mockDashboard.data = dashboard('2026-10', '2026-10-15', '2026-11-14', 100);
    renderDashboard();

    expect(screen.getByText('Oct 15 – Nov 14 · day 20')).toBeTruthy();
    expect(screen.getByText('left · 11d')).toBeTruthy();
  });

  it('paces spend against the share of the period gone', () => {
    // Day 20 of 31 is 64.5% gone; $200 of $400 is 50% spent: 22% under.
    mockDashboard.data = dashboard('2026-10', '2026-10-15', '2026-11-14', 200);
    renderDashboard();

    expect(screen.getByText('On pace · 22% under')).toBeTruthy();
  });
});

describe('Dashboard over budget with a reset day of 15', () => {
  it('shows the period end in the ring, not the whole range', () => {
    mockDashboard.data = dashboard('2026-10', '2026-10-15', '2026-11-14', 600);
    renderDashboard();

    expect(screen.getByText('to Nov 14')).toBeTruthy();
    // The whole range stays in the heading only.
    expect(screen.queryByText('Oct 15 – Nov 14')).toBeNull();
    expect(screen.getByText('Oct 15 – Nov 14 · day 20')).toBeTruthy();
  });
});

describe('Dashboard with a reset day of 1', () => {
  it('keeps the month name and the day of the month', () => {
    mockDashboard.data = dashboard('2026-11', '2026-11-01', '2026-11-30', 10);
    renderDashboard();

    expect(screen.getByText('November · day 3')).toBeTruthy();
    expect(screen.getByText('left · 27d')).toBeTruthy();
  });
});
