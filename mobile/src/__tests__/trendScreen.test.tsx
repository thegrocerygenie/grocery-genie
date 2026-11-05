/**
 * BC-04 AC 2: the Trend screen compares this month with last month, for the
 * total and for each category, from real dashboard data. AC 7-10 (DA-10): the
 * average headline, grey bars with the current month tinted, Highlights, and
 * strings kept out of the screen.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import TrendScreen from '../../app/trend';
import type { DashboardData } from '@/features/budget/types';
import { colors } from '@/constants/theme';

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

  it('leads with the 3-month average and its change from the 3 months before (AC 7)', () => {
    // Trend 0 + 30 + 35 = 65 over 3 months is $21.67 a month; prior $25 a month.
    mockDashboard.data = dashboard({ prior_average: 25 });
    renderTrend();

    expect(screen.getByText('3-month average')).toBeTruthy();
    expect(screen.getByLabelText('3-month average, $22')).toBeTruthy();
    expect(screen.getByText('−13% vs prior 3 months')).toBeTruthy();
    expect(screen.getByLabelText('Down 13 percent from the 3 months before')).toBeTruthy();
  });

  it('shows no prior comparison when the 3 months before had no spending', () => {
    mockDashboard.data = dashboard({ prior_average: 0 });
    renderTrend();

    expect(screen.getByLabelText('3-month average, $22')).toBeTruthy();
    expect(screen.queryByText(/vs prior/)).toBeNull();
  });
});

describe('Trend bars (BC-04 AC 9)', () => {
  it('draws grey bars with the current month in the tint colour', () => {
    mockDashboard.data = dashboard({ current_period: '2026-03' });
    renderTrend();

    expect(screen.getByTestId('trend-bar-2026-03')).toHaveStyle({ backgroundColor: colors.tint });
    expect(screen.getByTestId('trend-bar-2026-02')).toHaveStyle({
      backgroundColor: colors.iosFill2,
    });
    expect(screen.getByTestId('trend-bar-2026-01')).toHaveStyle({
      backgroundColor: colors.iosFill2,
    });
    // No category stack or legend any more: one fill per bar.
    expect(screen.queryByTestId(/^trend-segment-/)).toBeNull();
    expect(screen.queryByLabelText(/average \$\d+$/)).toBeNull();
  });

  it('tints no bar when the current month is outside the chart (a past period)', () => {
    mockDashboard.data = dashboard({ current_period: '2026-09' });
    renderTrend();

    for (const p of ['2026-01', '2026-02', '2026-03']) {
      expect(screen.getByTestId(`trend-bar-${p}`)).toHaveStyle({
        backgroundColor: colors.iosFill2,
      });
    }
  });

  it("labels each bar with its month's initial and reads its month and total", () => {
    mockDashboard.data = dashboard();
    renderTrend();

    expect(screen.getByTestId('trend-month-2026-01').props.children).toBe('J');
    expect(screen.getByTestId('trend-month-2026-02').props.children).toBe('F');
    expect(screen.getByTestId('trend-month-2026-03').props.children).toBe('M');
    expect(screen.getByLabelText('February: $30')).toBeTruthy();
  });
});

describe('Trend Highlights (BC-04 AC 8)', () => {
  it('names the highest and lowest month, and the trend with its percent', () => {
    mockDashboard.data = dashboard({ prior_average: 25, current_period: '2026-09' });
    renderTrend();

    expect(screen.getByText('Highlights')).toBeTruthy();
    expect(screen.getByLabelText('Highest: March, $35')).toBeTruthy();
    // January spent nothing, so the lowest is February.
    expect(screen.getByLabelText('Lowest: February, $30')).toBeTruthy();
    expect(screen.getByLabelText('Trend: falling, down 13 percent')).toBeTruthy();
    expect(screen.getByText('Falling')).toBeTruthy();
    expect(screen.getByText('−13%')).toBeTruthy();
  });

  it('skips the current month, still in progress, for the lowest', () => {
    mockDashboard.data = dashboard({
      current_period: '2026-03',
      trend: [
        { period: '2026-01', spent: 50, budget: null },
        { period: '2026-02', spent: 30, budget: null },
        { period: '2026-03', spent: 12, budget: null },
      ],
    });
    renderTrend();

    expect(screen.getByLabelText('Lowest: February, $30')).toBeTruthy();
    expect(screen.queryByLabelText(/^Lowest: March/)).toBeNull();
  });

  it('says so when no finished month had spending to be the lowest', () => {
    mockDashboard.data = dashboard({ current_period: '2026-03', prior_average: 25 });
    mockDashboard.data.trend[1].spent = 0;
    renderTrend();

    expect(screen.getByLabelText('Lowest: no finished month with spending yet')).toBeTruthy();
    expect(screen.getByText('No finished month with spending yet')).toBeTruthy();
  });

  it('shows no trend percent when the months before had no spending, like the headline', () => {
    // 3M: January 10, February 30, March 35. The halves would read +250%; the
    // headline has no months before to compare with, so neither does Trend.
    mockDashboard.data = dashboard({ prior_average: 0, current_period: '2026-09' });
    mockDashboard.data.trend[0].spent = 10;
    renderTrend();

    expect(screen.queryByText('+250%')).toBeNull();

    expect(screen.queryByText(/vs prior/)).toBeNull();
    expect(screen.getByLabelText('Trend: Not enough history yet')).toBeTruthy();
  });

  it('calls a small change steady', () => {
    // Average $21.67 against $22: −2%.
    mockDashboard.data = dashboard({ prior_average: 22 });
    renderTrend();

    expect(screen.getByLabelText('Trend: steady, down 2 percent')).toBeTruthy();
  });
});

describe('Trend strings (BC-04 AC 10)', () => {
  it('keeps every user-facing string in the content file, none in the screen', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(path.join(__dirname, '../../app/trend.tsx'), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/^import .*$/gm, '');

    // JSX text between tags.
    expect(code.match(/>\s*[A-Za-z][^<>{}=;()]*<\//g)).toBeNull();
    // A quoted string with a capital letter or a space is copy, not a key.
    const literals = (code.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? []).filter(
      (s) => /[A-Z]/.test(s) || / /.test(s.replace(/\$\{[^}]*\}/g, '')),
    );
    expect(literals).toEqual([]);
  });
});
