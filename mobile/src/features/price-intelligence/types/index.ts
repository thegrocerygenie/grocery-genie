/** Price intelligence (V1.1): PI-01 price history, PI-02 item matching. */

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
}

export interface ItemAlias {
  id: string;
  alias: string;
}

export interface ItemDetail extends ItemSummary {
  aliases: ItemAlias[];
  suggestions: ItemSuggestion[];
}

export interface PricePoint {
  receipt_id: string;
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
