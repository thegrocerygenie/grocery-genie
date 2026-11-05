/**
 * Price intelligence (V1.1): PI-01 price history, PI-02 item matching, PI-03
 * price change alerts, PI-04 cross-store comparison.
 */

export interface ItemRef {
  id: string;
  canonical_name: string;
}

export interface LatestPrice {
  unit_price: number;
  unit_of_measure: string | null;
  currency: string;
  date: string;
  store_name: string | null;
}

export interface ItemSummary {
  id: string;
  canonical_name: string;
  unit_of_measure: string | null;
  observation_count: number;
  store_count: number;
  latest_price: LatestPrice | null;
  /** PI-02 AC 11, 15 (DA-6): like-for-like mean unit price; null with none. */
  avg_unit_price?: number | null;
}

export interface ItemList {
  items: ItemSummary[];
  total: number;
  page: number;
  per_page: number;
  /** Possible matches waiting for the user (PI-02 AC 2). */
  pending_suggestions: number;
}

export interface ItemSuggestion {
  id: string;
  item: ItemRef;
  suggested_item: ItemRef;
  confidence: number;
  method: string;
  /** PI-02 AC 8 (DA-5): what the "Same item?" prompt shows. */
  receipt_line?: SuggestionReceiptLine | null;
  suggested_item_stats?: SuggestedItemStats | null;
}

/** PI-02 AC 5: the receipt line a suggestion asks about, as printed. */
export interface SuggestionReceiptLine {
  receipt_id: string;
  name: string;
  store_name: string | null;
  date: string;
}

/** PI-02 AC 5: the existing item it would merge into (the user's own prices). */
export interface SuggestedItemStats {
  purchase_count: number;
  store_count: number;
  avg_unit_price: number | null;
  unit_of_measure: string | null;
  currency: string | null;
}

export interface ItemAlias {
  id: string;
  alias: string;
}

export interface ItemDetail extends ItemSummary {
  aliases: ItemAlias[];
  suggestions: ItemSuggestion[];
  /** PI-03 AC 4: the user muted price alerts for this item. */
  alerts_muted: boolean;
}

export interface PricePoint {
  receipt_id: string;
  /** PI-02 AC 10 (DA-6): the receipt line a split by line moves. */
  line_item_id: string;
  /** The line's name as the receipt printed it. */
  line_name: string;
  date: string;
  store_id: string | null;
  store_name: string | null;
  unit_price: number;
  quantity: number;
  unit_of_measure: string | null;
  currency: string;
  /** False when the price is in another unit or currency than the chart's. */
  in_timeline: boolean;
}

export interface PriceHistory {
  item: ItemRef;
  unit_of_measure: string | null;
  currency: string | null;
  /** PI-01 AC 4: false until there are `min_points` comparable prices. */
  has_timeline: boolean;
  min_points: number;
  store_count: number;
  observations: PricePoint[];
}

/** PI-02 AC 14: one new item of `POST /api/items/{id}/split`. */
export interface ItemSplitPart {
  name: string;
  line_item_ids: string[];
}

/** PI-02 AC 15: `GET /api/items/{id}/link-candidates`, for Link items. */
export interface LinkCandidates {
  suggested: ItemSummary[];
  items: ItemSummary[];
}

export interface StoreRef {
  id: string;
  name: string;
}

/** PI-03 settings: `GET/PUT /api/items/price-alert-settings`. */
export interface PriceAlertSettings {
  enabled: boolean;
  /** The user's own threshold, or the default when they set none. */
  threshold_percent: number;
  default_threshold_percent: number;
  cooldown_days: number;
  muted_items: ItemRef[];
  muted_stores: StoreRef[];
}

/** A field left out stays; `threshold_percent: null` goes back to the default. */
export interface PriceAlertSettingsUpdate {
  enabled?: boolean;
  threshold_percent?: number | null;
}

export interface StorePrice {
  store_id: string;
  store_name: string;
  latest_price: number;
  latest_date: string;
  avg_price: number;
  observation_count: number;
}

/** PI-04: `GET /api/items/{id}/compare`, cheapest store first. */
export interface PriceComparison {
  item: ItemRef;
  unit_of_measure: string | null;
  currency: string | null;
  min_observations: number;
  stores: StorePrice[];
  /** Stores with a price of the item but too few to compare. */
  stores_below_minimum: number;
}

/** EC Price Intelligence 1: one of the user's stores as their prices group it. */
export interface StoreSummary {
  id: string;
  name: string;
  /** Receipts in the group (deleted ones left out). */
  receipt_count: number;
  /** Stores the user merged into this one; each can be unmerged. */
  merged_stores: StoreRef[];
}

/** `GET /api/stores`, by name. */
export interface StoreList {
  stores: StoreSummary[];
}
