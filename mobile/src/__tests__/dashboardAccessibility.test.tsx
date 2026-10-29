/**
 * VoiceOver on the dashboard: the ring reads as one progress bar, each category
 * row reads as one sentence, and over-cap is not shown by color alone.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { BudgetCategorySummary, DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text testID={`symbol-${name}`} />;
  },
}));
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
    has_receipts: true,
    ...over,
  };
}

function renderDashboard() {
  renderRouter({ index: DashboardScreen }, { initialUrl: '/' });
}

describe('Budget ring accessibility', () => {
  it('reads as one progress bar with the amount left, the percent, and the days left', () => {
    mockDashboard.data = dashboard({
      overall: { budget: 400, spent: 243, remaining: 157, percent: 60.75 },
    });
    renderDashboard();

    const ring = screen.getByRole('progressbar');
    expect(ring.props.accessibilityLabel).toMatch(
      /^\$157 left of \$400, 61 percent, \d+ days? left$/,
    );
    expect(ring.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 61,
      text: '61 percent',
    });
  });

  it('says how far over when spending passes the cap', () => {
    mockDashboard.data = dashboard({
      overall: { budget: 400, spent: 460, remaining: -60, percent: 115 },
    });
    renderDashboard();

    const ring = screen.getByRole('progressbar');
    expect(ring.props.accessibilityLabel).toMatch(/^\$60 over \$400, 115 percent, \d+ days? left$/);
    expect(ring.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 100,
      text: '115 percent',
    });
  });
});

describe('Dashboard category rows', () => {
  it('reads a capped category as one sentence', () => {
    mockDashboard.data = dashboard({
      overall: { budget: 400, spent: 142, remaining: 258, percent: 35.5 },
      categories: [category('Produce', 142, 175)],
    });
    renderDashboard();

    expect(screen.getByLabelText('Produce, $142, 81 percent of $175 budget')).toBeTruthy();
  });

  it('says "over budget" and shows a glyph, not only red, past the cap', () => {
    mockDashboard.data = dashboard({
      overall: { budget: 400, spent: 58, remaining: 342, percent: 14.5 },
      categories: [category('Dairy', 58, 40)],
    });
    renderDashboard();

    expect(
      screen.getByLabelText('Dairy, $58, 145 percent of $40 budget, over budget'),
    ).toBeTruthy();
    expect(screen.getByTestId('symbol-exclamationmark.circle.fill')).toBeTruthy();
  });

  it('reads an uncapped category as its name and amount', () => {
    mockDashboard.data = dashboard({
      overall: { budget: 400, spent: 30, remaining: 370, percent: 7.5 },
      categories: [category('Dairy', 30)],
    });
    renderDashboard();

    expect(screen.getByLabelText('Dairy, $30')).toBeTruthy();
    expect(screen.queryByTestId('symbol-exclamationmark.circle.fill')).toBeNull();
  });
});

describe('"Set a budget" links', () => {
  it('is a labelled button in the no-budget hero', () => {
    mockDashboard.data = dashboard({
      overall: { budget: 0, spent: 90, remaining: -90, percent: 0 },
      categories: [category('Produce', 90)],
    });
    renderDashboard();

    expect(screen.getByRole('button', { name: 'Set a budget' })).toBeTruthy();
  });

  it('is a labelled button in the first-scan state', () => {
    mockDashboard.data = dashboard({ has_receipts: false });
    renderDashboard();

    expect(screen.getByRole('button', { name: 'Set a budget' })).toBeTruthy();
  });
});
