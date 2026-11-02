import * as Localization from 'expo-localization';

/**
 * Money in the app. A receipt keeps its own currency; budgets are in the
 * user's currency (`currency_preference`), and only receipts in it count
 * toward them (MVP rule, 2026-11-02; docs/prd/11-edge-cases.md).
 */

export function formatMoney(
  amount: number,
  currency: string,
  options: { decimals?: 0 | 2 } = {},
): string {
  const decimals = options.decimals ?? 2;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // Not an ISO 4217 code (a receipt saved before codes were enforced).
    return `${currency} ${amount.toFixed(decimals)}`;
  }
}

/** The symbol shown before an amount being typed, such as "$" or "€".
 * Read from a formatted zero: Hermes has no Intl formatToParts. */
export function currencySymbol(currency: string): string {
  return formatMoney(0, currency, { decimals: 0 }).replace(/[\d\s]/g, '') || currency;
}

/** The iPhone region's currency, sent at sign-up as the budget currency. */
export function deviceCurrency(): string | undefined {
  return Localization.getLocales()[0]?.currencyCode ?? undefined;
}

export function countsTowardBudget(receiptCurrency: string, budgetCurrency: string): boolean {
  return receiptCurrency === budgetCurrency;
}
