/** User-facing text for price history and item matching (PI-01, PI-02). */
export const PRICES_COPY = {
  listTitle: 'Prices',
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
  detailBack: 'Prices',
  backReceipt: 'Receipt',
  backBudget: 'Budget',
  backHistory: 'History',
  backScan: 'Scan',
  latest: 'Latest price',
  since: (percent: string, date: string) => `${percent} since ${date}`,
  noChange: (date: string) => `Same as ${date}`,
  timelineHeader: 'Price history',
  needMorePrices: (min: number) =>
    `Buy it again to see its price trend. A trend needs ${min} prices.`,
  pricesHeader: (count: number) => `Prices · ${count}`,
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
  renameBody: 'The name shown in Prices. Receipts keep their own names.',
  combine: 'Combine with Another Item…',
  combineHint: 'Choose an item that is the same product',
  cancel: 'Cancel',
  save: 'Save',
  actionFailed: 'That didn’t save. Check your connection and try again.',

  sameQuestion: (item: string, other: string) => `Is “${item}” the same as “${other}”?`,
  sameYes: 'Same Item',
  sameNo: 'Different',
  sameYesLabel: (item: string, other: string) => `${item} is the same as ${other}`,
  sameNoLabel: (item: string, other: string) => `${item} is different from ${other}`,
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

/** The threshold choices; the default and the user's own are always added. */
export const PRICE_ALERT_THRESHOLDS = [5, 10, 15, 20, 25, 30, 50] as const;
