import type { BudgetResponse } from '@/features/budget/types';
import { formatMoney } from '@/utils/money';

function money(amount: number, currency: string): string {
  return formatMoney(amount, currency, { decimals: Number.isInteger(amount) ? 0 : 2 });
}

/**
 * Settings → Budgets detail line (design: "$400/mo · 4 caps"), from the
 * active budgets: the overall monthly limit and how many categories have a cap.
 */
export function budgetsSummary(budgets: BudgetResponse[] | undefined, currency = 'USD'): string {
  const overall = budgets?.find((b) => b.category_id === null);
  const caps = budgets?.filter((b) => b.category_id !== null && b.amount > 0).length ?? 0;
  const parts = [
    overall ? `${money(overall.amount, currency)}/mo` : null,
    caps > 0 ? `${caps} cap${caps === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Not set';
}

export interface AlertsState {
  fifty: boolean;
  eighty: boolean;
  hundred: boolean;
  weekly: boolean;
}

/** Settings → Alerts detail line (design: "80% · 100% · weekly"). */
export function alertsSummary({ fifty, eighty, hundred, weekly }: AlertsState): string {
  const parts = [
    fifty ? '50%' : null,
    eighty ? '80%' : null,
    hundred ? '100%' : null,
    weekly ? 'weekly' : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Off';
}
