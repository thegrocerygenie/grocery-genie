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

  detailBack: 'Prices',
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
} as const;
