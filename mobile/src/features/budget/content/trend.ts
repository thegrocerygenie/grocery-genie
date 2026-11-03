/**
 * User-facing strings for the Trend screen's 3 / 12-month toggle (V1.1 BC-04
 * trends) and its Premium upgrade prompt (D2). Externalized for i18n.
 */
export const TREND_STRINGS = {
  monthsControlLabel: 'Trend length',
  monthsOptions: ['3 Months', '12 Months'],
  average: (months: number) => `${months}-month average`,
  versusPrior: (months: number) => `vs prior ${months} months`,
  samePrior: (months: number) => `Same as the ${months} months before`,
  fromPrior: (months: number) => `from the ${months} months before`,
  loadErrorTwelve: 'Couldn’t load 12 months.',
  retryLabel: 'Try again',
  retry: 'Try Again',
  upgradeTitle: 'See your whole year',
  upgradeMessage:
    'The 12-month trend is part of Grocery Genie Premium. Your 3-month trend stays free.',
  upgradeAction: 'Learn About Premium',
} as const;
