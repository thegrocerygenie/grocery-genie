import { buildTrendBreakdown } from '../utils/trendBreakdown';
import type { DashboardTrendMonth } from '../types';
import { colors } from '@/constants/theme';

const trend: DashboardTrendMonth[] = [
  { period: '2026-01', spent: 0, budget: null, categories: [] },
  {
    period: '2026-02',
    spent: 30,
    budget: null,
    categories: [
      { category_id: 'g', name: 'Groceries', spent: 20 },
      { category_id: 'b', name: 'Beverages', spent: 10 },
    ],
  },
  {
    period: '2026-03',
    spent: 37,
    budget: null,
    categories: [
      { category_id: 'g', name: 'Groceries', spent: 30 },
      { category_id: null, name: 'Uncategorized', spent: 7 },
    ],
  },
];

describe('buildTrendBreakdown', () => {
  it('orders categories by 3-month spend, largest first, with their average', () => {
    const { categories } = buildTrendBreakdown(trend);

    expect(categories.map((c) => [c.key, c.name, c.average])).toEqual([
      ['g', 'Groceries', 50 / 3],
      ['b', 'Beverages', 10 / 3],
      ['uncategorized', 'Uncategorized', 7 / 3],
    ]);
  });

  it('gives every month a segment per category in the same order, zero when absent', () => {
    const { months } = buildTrendBreakdown(trend);

    expect(months.map((m) => m.segments.map((s) => [s.key, s.spent]))).toEqual([
      [
        ['g', 0],
        ['b', 0],
        ['uncategorized', 0],
      ],
      [
        ['g', 20],
        ['b', 10],
        ['uncategorized', 0],
      ],
      [
        ['g', 30],
        ['b', 0],
        ['uncategorized', 7],
      ],
    ]);
  });

  it('colours a category the same in every month', () => {
    const { categories, months } = buildTrendBreakdown(trend);
    const groceries = categories.find((c) => c.key === 'g')!;

    expect(groceries.color).toEqual(colors.cat.groceries);
    expect(months[2].segments[0].color).toBe(groceries.color);
  });

  it('handles months from an older server with no category split', () => {
    const legacy = [{ period: '2026-03', spent: 12, budget: null }] as DashboardTrendMonth[];

    expect(buildTrendBreakdown(legacy)).toEqual({
      categories: [],
      months: [{ period: '2026-03', total: 12, segments: [] }],
    });
  });
});
