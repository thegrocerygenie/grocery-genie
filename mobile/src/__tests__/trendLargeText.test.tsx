/**
 * The Trend chart at accessibility text sizes and with VoiceOver (device check
 * 2026-11-03, BUG-1, 2, 7, 8, 9). Jest has no layout engine, so these tests
 * check the layout props that keep text in its place; the Simulator recheck
 * at AX1 and AX5 confirms the drawing.
 */
import { StyleSheet } from 'react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import TrendScreen from '../../app/trend';
import type { DashboardData, DashboardTrendMonth } from '@/features/budget/types';
import { useBudgetCurrency } from '@/hooks/useBudgetCurrency';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

/** The `count` months ending at 2026-11. Heights are not in month order. */
const MOCK_SPEND = [40, 55, 30, 70, 90, 120, 20, 25, 63, 77, 19, 50];
function mockTrend(count: number): DashboardTrendMonth[] {
  return Array.from({ length: count }, (_, i) => {
    const m = ((11 - count + i + 12) % 12) + 1;
    const year = m === 12 ? 2025 : 2026;
    return {
      period: `${year}-${String(m).padStart(2, '0')}`,
      spent: MOCK_SPEND[12 - count + i],
      budget: null,
    };
  });
}

function mockDashboard(months: number): DashboardData {
  return {
    period: '2026-11',
    overall: { budget: 500, spent: 19, remaining: 481, percent: 4 },
    categories: [],
    top_items: [],
    trend: mockTrend(months),
    prior_average: 20,
    previous_period: '2026-10',
    category_changes: [{ category_id: 'c1', name: 'Groceries', spent: 19, previous_spent: 77 }],
  };
}

jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: (_period: string, months?: number) => ({
    data: mockDashboard(months === 12 ? 12 : 3),
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

// React Native's iOS font scale at the default size and at AX5.
const AX5_SCALE = 3.571;
const mockWindow = { fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockWindow.fontScale }),
}));

afterEach(() => {
  mockWindow.fontScale = 1;
});

function flat(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
}

function renderTrend(months: 3 | 12 = 3) {
  renderRouter({ trend: TrendScreen }, { initialUrl: '/trend' });
  if (months === 12) fireEvent.press(screen.getByLabelText('1 year'));
}

describe('Trend chart at large text sizes', () => {
  it('lets the chart grow down with the text, not up over the summary (BUG-1)', () => {
    renderTrend();

    // A fixed height made the amounts and month labels overflow upward.
    expect(flat('trend-chart').height).toBeUndefined();
  });

  it('wraps the month-over-month change under the total instead of off the screen (BUG-2)', () => {
    renderTrend();

    expect(flat('trend-total-row').flexWrap).toBe('wrap');
  });

  it('keeps each bar amount on one line, shrinking to fit its column', () => {
    renderTrend();

    const amount = screen.getByTestId('trend-amount-2026-10');
    expect(amount.props.numberOfLines).toBe(1);
    expect(amount.props.adjustsFontSizeToFit).toBe(true);
  });

  it('keeps the 12 one-letter labels to one line and a size that fits a narrow bar (BUG-9)', () => {
    renderTrend(12);

    const label = screen.getByTestId('trend-month-2026-06');
    expect(label.props.children).toBe('J');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.5);
  });
});

describe('Trend chips and Highlights at large text sizes (DA-10)', () => {
  it('keeps each chip a full touch target that wraps to a new row rather than clipping', () => {
    renderTrend();

    expect(flat('trend-ranges').flexWrap).toBe('wrap');
    for (const value of ['1', '3', '6', '12', 'all']) {
      expect(flat(`trend-range-${value}`).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('lets a Highlights row wrap its detail and value under the title at AX sizes', () => {
    renderTrend();

    const row = screen.getByLabelText(/^Highest: /);
    expect(StyleSheet.flatten(row.props.style).flexWrap).toBe('wrap');
    expect(screen.getByText('Highest').props.numberOfLines).toBeUndefined();
  });
});

describe('Trend month rows at AX5 (Simulator, 2026-11-05)', () => {
  // Side by side, the amount kept its width and the title broke mid-word:
  // "Nove/mber spendi/ng". At accessibility sizes the title takes the whole
  // row and the amount wraps under it, as Highlights rows do.
  it('gives the total and each category title the whole row at AX5', () => {
    mockWindow.fontScale = AX5_SCALE;
    renderTrend();

    expect(flat('trend-total-title').flexBasis).toBe('100%');
    expect(flat('trend-category-title-c1').flexBasis).toBe('100%');
    expect(flat('trend-category-row-c1').flexWrap).toBe('wrap');
  });

  it('keeps the amount beside the title at the default size', () => {
    renderTrend();

    expect(flat('trend-total-title').flexBasis).toBeUndefined();
    expect(flat('trend-category-title-c1').flexBasis).toBeUndefined();
  });
});

describe('Trend chart with VoiceOver (BUG-8)', () => {
  it('gives every month column the same height, so VoiceOver reads them left to right', () => {
    renderTrend(12);

    // iOS orders elements top to bottom first. With columns aligned to the
    // bottom, a taller bar's column started higher and was read first. Jest
    // has no layout, so the render order is always calendar order; the column
    // geometry is what this checks.
    expect(flat('trend-chart').alignItems).toBe('stretch');
    const columns = screen.getAllByLabelText(/^[A-Z][a-z]+: \$\d+$/);
    for (const column of columns) {
      expect(StyleSheet.flatten(column.props.style).alignSelf).toBeUndefined();
    }
  });
});

describe('Trend bar amounts in the budget currency (BUG-7)', () => {
  afterEach(() => jest.mocked(useBudgetCurrency).mockReturnValue('USD'));

  it('labels each bar in euros when the budget is in euros', () => {
    jest.mocked(useBudgetCurrency).mockReturnValue('EUR');
    renderTrend();

    expect(screen.getByTestId('trend-amount-2026-09').props.children).toBe('€77');
    expect(screen.queryByText('$77')).toBeNull();
  });
});
