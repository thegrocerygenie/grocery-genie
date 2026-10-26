import type { BudgetResponse } from '@/features/budget/types';

import { alertsSummary, budgetsSummary } from '../utils/settingsSummary';

function budget(category_id: string | null, amount: number): BudgetResponse {
  return {
    id: `${category_id ?? 'overall'}`,
    category_id,
    amount,
    period_type: 'monthly',
    period_start: '2026-10-01',
    rollover_enabled: false,
  };
}

describe('budgetsSummary', () => {
  it('shows the monthly limit and the number of category caps', () => {
    const budgets = [
      budget(null, 400),
      budget('g', 175),
      budget('h', 50),
      budget('b', 30),
      budget('s', 25),
    ];
    expect(budgetsSummary(budgets)).toBe('$400/mo · 4 caps');
  });

  it('says "1 cap" for a single cap', () => {
    expect(budgetsSummary([budget(null, 400), budget('g', 175)])).toBe('$400/mo · 1 cap');
  });

  it('shows the limit alone when there are no caps', () => {
    expect(budgetsSummary([budget(null, 412.5)])).toBe('$412.50/mo');
  });

  it('shows caps alone when there is no monthly limit', () => {
    expect(budgetsSummary([budget('g', 175), budget('h', 50)])).toBe('2 caps');
  });

  it('says "Not set" with no budgets, or while they load', () => {
    expect(budgetsSummary([])).toBe('Not set');
    expect(budgetsSummary(undefined)).toBe('Not set');
  });
});

describe('alertsSummary', () => {
  it('lists the thresholds that are on, then the weekly summary', () => {
    expect(alertsSummary({ fifty: false, eighty: true, hundred: true, weekly: true })).toBe(
      '80% · 100% · weekly',
    );
  });

  it('leaves out the weekly summary when it is off', () => {
    expect(alertsSummary({ fifty: true, eighty: false, hundred: false, weekly: false })).toBe(
      '50%',
    );
  });

  it('says "Off" when nothing is on', () => {
    expect(alertsSummary({ fifty: false, eighty: false, hundred: false, weekly: false })).toBe(
      'Off',
    );
  });
});
