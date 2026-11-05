import type { PriceRange } from './utils/priceTrend';

/** User-facing text for price history and item matching (PI-01, PI-02). */
export const PRICES_COPY = {
  listTitle: 'Items',
  // The Budget dashboard's row that opens the list.
  dashboardEntry: 'Items',
  dashboardEntryHint: 'What you paid for each item over time',
  searchPlaceholder: 'Search items',
  emptyTitle: 'No prices yet',
  emptyBody: 'Confirm a receipt and every item on it starts a price history.',
  noResults: (query: string) => `No items match “${query}”.`,
  loadFailed: 'Couldn’t load your prices',
  itemLoadFailed: 'Couldn’t load this item',
  priceCount: (prices: number, stores: number) =>
    `${prices} ${prices === 1 ? 'price' : 'prices'} · ${stores} ${stores === 1 ? 'store' : 'stores'}`,
  matchesBanner: (count: number) =>
    count === 1 ? '1 possible match to review' : `${count} possible matches to review`,
  matchesBannerHint: 'Opens the list of items that may be the same product',

  // Item detail's Back label names the screen it returns to (itemBackTitle).
  detailBack: 'Items',
  backReceipt: 'Receipt',
  backBudget: 'Budget',
  backHistory: 'History',
  backScan: 'Scan',
  backPriceAlerts: 'Price alerts',
  // PI-01 AC 7: the headline, the 30-day average and its change.
  average30: 'Avg · 30d',
  asOf: (date: string) => `as of ${date}`,
  average30Label: (price: string, change: string | null) =>
    `Average over 30 days, ${price}${change ? `, ${change} on the 30 days before` : ''}`,
  latestLine: (price: string, store: string, date: string) =>
    `Latest ${price} · ${store} · ${date}`,
  // PI-01 AC 5, 6: the chart's range control.
  rangeLabels: {
    '1M': '1 month',
    '3M': '3 months',
    '6M': '6 months',
    '1Y': '1 year',
    All: 'All prices',
  } satisfies Record<PriceRange, string>,
  rangeControlLabel: 'Chart range',
  rangeTooFew: 'Not enough prices in this range',
  showAll: 'Show All',
  showAllLabel: 'Show all prices',
  needMorePrices: (min: number) =>
    `Buy it again to see its price trend. A trend needs ${min} prices.`,
  pricesHeader: (count: number) => `Purchases · ${count}`,
  otherUnit: 'Not in chart: another unit',
  unknownStore: 'Unknown store',
  namesHeader: 'Names on receipts',
  namesFooter:
    'Receipts write the same product differently. Split off a name that isn’t this item.',
  split: 'Split Off',
  splitLabel: (alias: string) => `Split off ${alias}`,
  splitConfirmTitle: (alias: string) => `Split off “${alias}”?`,
  splitConfirmBody: 'It becomes its own item, with its own prices.',
  rename: 'Rename',
  renamePrompt: 'Rename item',
  renameBody: 'The name shown in Items. Receipts keep their own names.',
  combine: 'Combine with Another Item…',
  combineHint: 'Choose an item that is the same product',
  cancel: 'Cancel',
  save: 'Save',
  actionFailed: 'That didn’t save. Check your connection and try again.',

  sameQuestion: (item: string, other: string) => `Is “${item}” the same as “${other}”?`,
  // PI-02 AC 7: a suggestion card opens the "Same item?" prompt.
  reviewMatch: 'Review',
  reviewMatchLabel: (item: string, other: string) =>
    `Review whether ${item} is the same as ${other}`,
  matchPercent: (confidence: number) => `${Math.round(confidence * 100)}% match`,

  // PI-02 AC 5, 6 (DA-5): the full-screen "Same item?" prompt.
  matchTitle: 'Same item?',
  matchIntro: 'We think these are the same product. Confirm to merge price history.',
  matchFromToday: 'From today’s receipt',
  matchFromReceipt: 'From your receipt',
  matchExisting: 'Existing item',
  matchCounts: (purchases: number, stores: number) =>
    `${purchases} ${purchases === 1 ? 'purchase' : 'purchases'} · ${stores} ${
      stores === 1 ? 'store' : 'stores'
    }`,
  matchAverage: 'Avg unit price',
  matchMerge: 'Yes, merge',
  matchMergeLabel: (item: string, other: string) => `Yes, merge ${item} into ${other}`,
  matchKeep: 'Keep as separate item',
  matchKeepLabel: (item: string) => `Keep ${item} as a separate item`,
  matchSkip: 'Skip',
  matchSkipLabel: 'Skip, decide later',
  matchCancelLabel: 'Cancel, decide later',
  matchProgress: (index: number, total: number) => `${index} of ${total}`,
  matchSaveFailed: 'That didn’t save. Check your connection and try again.',
  matchesTitle: 'Review Matches',
  matchesIntro:
    'These names came close to an item you’ve bought before. Combining them joins their price histories.',
  matchesEmpty: 'No matches to review.',

  combineTitle: 'Combine',
  combineIntro: (name: string) =>
    `Choose the item “${name}” is the same as. Its prices move there.`,
  combineConfirmTitle: (from: string, into: string) => `Combine “${from}” into “${into}”?`,
  combineConfirmBody: 'Its prices and names move to that item.',
  combineAction: 'Combine',

  chartLabel: (count: number, low: string, high: string, latest: string) =>
    `Price chart, ${count} prices from ${low} to ${high}, latest ${latest}`,

  // PI-04 AC 4: store comparison on item detail.
  compareHeader: 'Compare stores',
  cheapest: 'Cheapest',
  average: 'average',
  compareLatest: (price: string, date: string) => `Latest ${price} · ${date}`,
  compareRowLabel: (
    store: string,
    cheapest: boolean,
    average: string,
    latest: string,
    date: string,
  ) => `${store}${cheapest ? ', cheapest' : ''}, average ${average}, latest ${latest} on ${date}`,
  compareEmpty: (min: number) => `Buy it ${min} times at a store to compare that store’s price.`,
  compareBelowMinimum: (count: number, min: number) =>
    `${count} more ${count === 1 ? 'store needs' : 'stores need'} ${min} prices of this item to compare.`,

  // PI-03 AC 4: mute price alerts for the item, or at a store.
  alertsHeader: 'Price alerts',
  alertsItem: 'This item',
  alertsItemLabel: (name: string) => `Price alerts for ${name}`,
  alertsStore: (store: string) => `At ${store}`,
  alertsStoreLabel: (store: string) => `Price alerts at ${store}`,
  alertsFooter: (threshold: number, days: number) =>
    `You get an alert when a price moves ${threshold}% or more from your 30-day average, at most once every ${days} days.`,
  alertsOff: 'Price alerts are off. Turn them on in Settings → Alerts.',

  // PREM-02 AC 5, 6 (D8): comparison and muting are Premium.
  upgradeAction: 'See Premium',
  notNow: 'Not Now',
  compareUpgradeTitle: 'Compare stores with Premium',
  compareUpgradeMessage:
    'See this item’s latest and average price at each store you shop, cheapest first.',
  muteUpgradeTitle: 'Muting alerts is Premium',
  muteUpgradeMessage:
    'Premium lets you mute price alerts for an item or a store. Price alerts themselves stay free.',
} as const;

/** Settings → Alerts: price change alerts (PI-03 settings). */
export const PRICE_ALERT_SETTINGS_COPY = {
  header: 'PRICE ALERTS',
  enabled: 'Price change alerts',
  threshold: 'Alert when a price changes by',
  thresholdOption: (percent: number, isDefault: boolean) =>
    isDefault ? `${percent}% (default)` : `${percent}%`,
  footer: (days: number) =>
    `Compared with your 30-day average for the item, up or down. At most one alert per item every ${days} days.`,
  mutedHeader: 'MUTED PRICE ALERTS',
  mutedFooter: 'Mute an item or a store from the item’s price history.',
  unmute: 'Unmute',
  unmuteLabel: (name: string) => `Unmute ${name}`,
  store: 'Store',
  item: 'Item',
} as const;

/** Settings → Stores: merging two of the user's stores (EC Price Intelligence 1). */
export const STORE_MERGE_COPY = {
  title: 'Stores',
  settingsRow: 'Stores',
  settingsDetail: 'Merge the same store',
  back: 'Settings',
  header: 'YOUR STORES',
  footer:
    'Branch numbers are matched for you. Merge two names that are the same store, like a store and its other banner, so their prices compare as one. Only your prices change.',
  receipts: (count: number) => `${count} ${count === 1 ? 'receipt' : 'receipts'}`,
  merge: 'Merge',
  mergeLabel: (name: string) => `Merge ${name} into another store`,
  pickerTitle: (name: string) => `${name} is the same store as`,
  pickerOptionLabel: (source: string, target: string) => `Merge ${source} into ${target}`,
  cancel: 'Cancel',
  mergedInto: (name: string) => `Merged into ${name}`,
  unmerge: 'Unmerge',
  unmergeLabel: (name: string) => `Unmerge ${name}`,
  emptyTitle: 'No stores yet',
  emptyBody: 'Stores appear here once you save a receipt.',
  onlyOne: 'Once you shop at a second store, you can merge two that are the same.',
  loadFailed: 'Couldn’t load your stores',
  retry: 'Try again',
  saveFailedTitle: 'Couldn’t save',
  saveFailedBody: 'Check your connection and try again.',
} as const;

/** The threshold choices; the default and the user's own are always added. */
export const PRICE_ALERT_THRESHOLDS = [5, 10, 15, 20, 25, 30, 50] as const;

/** PI-03 AC 8: the cooldown choices; the default and the user's own are always added. */
export const PRICE_ALERT_COOLDOWNS = [1, 3, 7, 14, 30] as const;

/** PI-03 AC 5-7 (DA-4): the Price alerts list and its Settings group. */
export const PRICE_ALERTS_LIST_COPY = {
  title: 'Price alerts',
  // The Budget dashboard's bell and the row in Settings → Alerts.
  open: 'Price alerts',
  openHint: 'Price changes on things you buy',
  thisWeek: 'This week',
  earlier: 'Earlier',
  stockUp: 'stock-up worth it',
  wasNow: (oldAverage: string, newPrice: string) => `was ${oldAverage} avg, now ${newPrice}`,
  rowLabel: (
    item: string,
    direction: 'up' | 'down',
    percent: string,
    detail: string,
    stockUp: boolean,
  ) => `${item}, ${direction} ${percent}, ${detail}${stockUp ? ', stock-up worth it' : ''}`,
  emptyTitle: 'No price alerts yet',
  emptyBody: (threshold: number) =>
    `You’ll get one when something you buy regularly changes price by ${threshold}% or more.`,
  loadFailed: 'Couldn’t load your price alerts',
  settingsHeader: 'Settings',
  threshold: 'Threshold',
  cooldown: 'Cooldown',
  days: (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`,
  cooldownOption: (days: number, isDefault: boolean) =>
    `${days} ${days === 1 ? 'day' : 'days'}${isDefault ? ' (default)' : ''}`,
  footer: (days: number, threshold: number) =>
    `Cooldown: ${days} ${days === 1 ? 'day' : 'days'} · alerts at ≥${threshold}% change`,
  saveFailed: 'Couldn’t save. Check your connection and try again.',
} as const;
