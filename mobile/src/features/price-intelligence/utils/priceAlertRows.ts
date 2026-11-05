import { PRICE_ALERTS_LIST_COPY as COPY } from '../constants';
import type { PriceAlertNotification } from '../types';

/** Ids are UUIDs; anything else never becomes part of a route. */
const ITEM_ID = /^[A-Za-z0-9-]+$/;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** One row of the Price alerts list (PI-03 AC 5). */
export interface PriceAlertRow {
  id: string;
  /** The item a tap opens, or null when the alert names none we can open. */
  itemId: string | null;
  itemName: string;
  direction: 'up' | 'down';
  /** "+22%" or "−14%" (a true minus sign, as the design draws it). */
  percentText: string;
  /** "<Store> · was $X avg, now $Y", or the body of an alert sent before DA-4. */
  detail: string;
  /** A drop: "stock-up worth it" on a line under the detail. */
  stockUp: boolean;
  /** The item's recent prices, oldest first, the alerted one last. */
  sparkline: number[];
  createdAt: string;
}

export interface PriceAlertGroup {
  title: string;
  data: PriceAlertRow[];
}

function parseData(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Read a price change notification into a list row. Alerts since DA-4 carry
 * the row's parts in `data`; an older one keeps its title and body, and its
 * direction and percent are read from the title ("... up 20%").
 */
export function toPriceAlertRow(n: PriceAlertNotification): PriceAlertRow {
  const data = parseData(n.data);
  const rawId = str(data.canonical_item_id);
  const itemId = rawId && ITEM_ID.test(rawId) ? rawId : null;

  const titleMatch = /\b(up|down) (\d+)%/.exec(n.title);
  const direction: 'up' | 'down' =
    data.direction === 'up' || data.direction === 'down'
      ? data.direction
      : titleMatch?.[1] === 'down'
        ? 'down'
        : 'up';
  const percent =
    typeof data.percent === 'number' ? Math.abs(data.percent) : Number(titleMatch?.[2] ?? 0);
  const percentText = `${direction === 'up' ? '+' : '−'}${percent}%`;

  const itemName = str(data.item_name);
  const oldAverage = str(data.old_average);
  const newPrice = str(data.new_price);
  const store = str(data.store_name);
  const current = itemName !== null && oldAverage !== null && newPrice !== null;
  const wasNow = current ? COPY.wasNow(oldAverage, newPrice) : n.body;
  const detail = current && store ? `${store} · ${wasNow}` : wasNow;

  const sparkline = Array.isArray(data.recent_prices)
    ? data.recent_prices.filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
    : [];

  return {
    id: n.id,
    itemId,
    itemName: itemName ?? n.title,
    direction,
    percentText,
    detail,
    stockUp: current && direction === 'down',
    sparkline,
    createdAt: n.created_at,
  };
}

/**
 * "This week" (the last 7 days) and "Earlier", each newest first; a group
 * with no rows is left out.
 */
export function groupPriceAlerts(rows: PriceAlertRow[], now: Date): PriceAlertGroup[] {
  const sorted = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const cutoff = now.getTime() - WEEK_MS;
  const thisWeek = sorted.filter((r) => Date.parse(r.createdAt) >= cutoff);
  const earlier = sorted.filter((r) => Date.parse(r.createdAt) < cutoff);
  return [
    { title: COPY.thisWeek, data: thisWeek },
    { title: COPY.earlier, data: earlier },
  ].filter((g) => g.data.length > 0);
}
