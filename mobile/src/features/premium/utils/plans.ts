import type { PremiumPlan } from '../services/purchases';

/**
 * PREM-01 AC 1: the yearly plan's price per month and its saving over twelve
 * months of the monthly plan, both from the App Store prices.
 */

/** The yearly price over 12 months, in the plan's currency ("$3.33"). */
export function perMonthPrice(yearly: PremiumPlan, locale: string): string {
  const cents = Math.floor((yearly.price / 12) * 100) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: yearly.currencyCode,
    }).format(cents);
  } catch {
    return cents.toFixed(2);
  }
}

/** The yearly plan's saving in percent, rounded down; null when there is none. */
export function savePercent(yearly: PremiumPlan, monthly: PremiumPlan | undefined): number | null {
  if (!monthly || monthly.price <= 0 || monthly.currencyCode !== yearly.currencyCode) return null;
  const percent = Math.floor((1 - yearly.price / (monthly.price * 12)) * 100);
  return percent > 0 ? percent : null;
}
