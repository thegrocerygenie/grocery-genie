/**
 * User-facing strings for Premium (V11-P0, PREM-01): the paywall and the
 * Settings row. Externalized for i18n.
 *
 * The feature list names only what Premium unlocks in this build (PREM-01
 * AC 4, decisions D2 and D8): add a row when its feature ships.
 */
export const PREMIUM_STRINGS = {
  /** The locale these strings are written in; dates and prices on the paywall use it. */
  dateLocale: 'en-US',
  screenTitle: 'Premium',
  close: 'Close',
  title: 'Premium',
  subtitle: 'Unlock the full power of your receipts.',
  benefits: [
    { key: 'compare', symbol: 'cart.fill', title: 'Cross-store comparison' },
    { key: 'categories', symbol: 'tag.fill', title: 'Custom categories' },
    { key: 'export', symbol: 'square.and.arrow.up', title: 'Data export · CSV/JSON/PDF' },
    { key: 'trend', symbol: 'chart.bar.xaxis', title: '12-month trends' },
    { key: 'mute', symbol: 'bell.slash.fill', title: 'Per-item & per-store mute' },
    { key: 'ocr', symbol: 'viewfinder', title: 'Priority OCR processing' },
    { key: 'receipts', symbol: 'infinity', title: 'Unlimited receipts' },
    { key: 'rollover', symbol: 'arrow.uturn.forward', title: 'Budget rollover' },
  ],
  staysFree: 'Price history and price alerts stay free.',
  plansLabel: 'Plans',
  yearly: 'Yearly',
  monthly: 'Monthly',
  /** Under the yearly price: "/yr · $3.33/mo". */
  perYearAndMonth: (perMonth: string) => `/yr · ${perMonth}/mo`,
  perMonthShort: '/mo',
  save: (percent: number) => `SAVE ${percent}%`,
  /** A plan as VoiceOver reads it. */
  yearlyLabel: (price: string, perMonth: string, percent: number | null) =>
    `Yearly, ${price} a year, ${perMonth} a month${percent ? `, save ${percent}%` : ''}`,
  monthlyLabel: (price: string) => `Monthly, ${price} a month`,
  startTrial: (days: number) => `Start ${days}-day free trial`,
  subscribe: 'Subscribe',
  subscribing: 'Subscribing…',
  /** What is billed after the trial (PREM-01 AC 2). */
  trialTerms: (days: number, price: string, period: 'year' | 'month') =>
    `${days} days free, then ${price}/${period}.`,
  billed: (price: string, period: 'year' | 'month') => `Billed ${price} a ${period}.`,
  cancelAnytime: 'Cancel anytime',
  restore: 'Restore purchase',
  restoring: 'Restoring…',
  terms: (period: 'year' | 'month') =>
    `Charged to your Apple ID ${period === 'year' ? 'yearly' : 'monthly'} when any free trial ends. Renews automatically until you cancel in iOS Settings at least 24 hours before the end of the period.`,
  termsOfUse: 'Terms of Use',
  privacyPolicy: 'Privacy Policy',
  loadingOffer: 'Loading the price…',
  offerUnavailable: 'Premium can’t be loaded right now.',
  retry: 'Try Again',
  needsAppStoreBuild:
    'Purchases need the App Store version of Grocery Genie. Install it from the App Store or TestFlight to subscribe.',
  purchaseFailed: 'The purchase didn’t go through. You weren’t charged.',
  restoreFailed: 'Couldn’t restore purchases. Check your connection and try again.',
  nothingToRestore: 'No Premium subscription was found for this Apple ID.',
  restoreCheckFailed:
    'Couldn’t check your subscription right now. Try Restore purchase again in a moment.',
  pending: 'Purchase complete. Premium turns on in a moment.',
  activeTitle: 'You’re on Premium',
  activeUntil: (date: string) => `Renews or ends on ${date}.`,
  activeThanks: 'Thanks for supporting Grocery Genie.',
  manage: 'Manage Subscription',
  settingsRow: 'Grocery Genie Premium',
  settingsFree: 'Free plan · Upgrade',
  settingsPremium: 'Premium',
  planFree: 'Free plan',
  planPremium: 'Premium',
  deleteAccountNote:
    'Deleting your account doesn’t cancel a Premium subscription. Apple keeps billing it until you cancel it in iOS Settings → Apple ID → Subscriptions.',
} as const;

/** Apple's standard EULA, which App Store Connect uses when the app sets none. */
export const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** iOS Settings → Apple ID → Subscriptions. */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
