/**
 * User-facing strings for Premium (V11-P0): the paywall and the Settings row.
 * Externalized for i18n.
 *
 * The benefit list names only what Premium unlocks today (D2). Custom
 * categories, data export and budget rollover join it as they ship.
 */
export const PREMIUM_STRINGS = {
  screenTitle: 'Premium',
  close: 'Close',
  title: 'Grocery Genie Premium',
  subtitle: 'More from every receipt you scan.',
  benefits: [
    {
      key: 'trend',
      symbol: 'chart.bar.xaxis',
      title: '12-month spending trend',
      detail: 'See how your grocery spending moves across the whole year.',
    },
    {
      key: 'receipts',
      symbol: 'infinity',
      title: 'Unlimited receipts',
      detail: 'Scan every trip. The free plan stops at 20 receipts a month.',
    },
  ],
  staysFree: 'Price history, price alerts and store comparison stay free.',
  perMonth: '/month',
  subscribe: (price: string) => `Subscribe for ${price}/month`,
  subscribing: 'Subscribing…',
  restore: 'Restore Purchases',
  restoring: 'Restoring…',
  terms:
    'Billed monthly to your Apple ID. Renews automatically until you cancel in iOS Settings at least 24 hours before the end of the period.',
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
} as const;

/** Apple's standard EULA, which App Store Connect uses when the app sets none. */
export const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** iOS Settings → Apple ID → Subscriptions. */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
