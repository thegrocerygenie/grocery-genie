import { getCategoryMetaByName } from '@/constants/categories';

import type { DashboardTrendMonth } from '../types';

export interface TrendCategory {
  /** Category id, or 'uncategorized'. */
  key: string;
  name: string;
  color: string;
  /** Mean monthly spend across the months shown. */
  average: number;
}

export interface TrendSegment {
  key: string;
  color: string;
  spent: number;
}

export interface TrendBreakdownMonth {
  period: string;
  total: number;
  /** One per category, in `categories` order, so stacks line up month to month. */
  segments: TrendSegment[];
}

export interface TrendBreakdown {
  categories: TrendCategory[];
  months: TrendBreakdownMonth[];
}

const UNCATEGORIZED_KEY = 'uncategorized';

/**
 * Design "3-month trend": stack each month's bar by category, largest
 * 3-month spender at the bottom, with a legend of monthly averages.
 */
export function buildTrendBreakdown(trend: DashboardTrendMonth[]): TrendBreakdown {
  const totals = new Map<string, { name: string; spent: number }>();
  for (const month of trend) {
    for (const c of month.categories ?? []) {
      const key = c.category_id ?? UNCATEGORIZED_KEY;
      const entry = totals.get(key) ?? { name: c.name, spent: 0 };
      entry.spent += c.spent;
      totals.set(key, entry);
    }
  }

  const categories: TrendCategory[] = [...totals.entries()]
    .sort(([, a], [, b]) => b.spent - a.spent || a.name.localeCompare(b.name))
    .map(([key, { name, spent }]) => ({
      key,
      name,
      color: getCategoryMetaByName(name).color,
      average: spent / Math.max(trend.length, 1),
    }));

  const months = trend.map((month) => {
    const spentByKey = new Map(
      (month.categories ?? []).map((c) => [c.category_id ?? UNCATEGORIZED_KEY, c.spent]),
    );
    return {
      period: month.period,
      total: month.spent,
      segments: categories.map((c) => ({
        key: c.key,
        color: c.color,
        spent: spentByKey.get(c.key) ?? 0,
      })),
    };
  });

  return { categories, months };
}
