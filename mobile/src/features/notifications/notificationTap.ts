const DASHBOARD_ROUTE = '/';

/** Ids are UUIDs; anything else never becomes part of a route. */
const ITEM_ID = /^[A-Za-z0-9-]+$/;

export interface NotificationTap {
  notificationId: string | null;
  route: string;
}

/**
 * Read the data the backend attaches to a push (notification_id, url).
 * A price change alert (PI-03) opens its item from `canonical_item_id`.
 * Only in-app paths are followed; anything else opens the dashboard.
 */
export function parseNotificationTap(data: Record<string, unknown> | undefined): NotificationTap {
  const id = data?.notification_id;
  const notificationId = typeof id === 'string' ? id : null;

  if (data?.type === 'price_change') {
    const itemId = data.canonical_item_id;
    const route =
      typeof itemId === 'string' && ITEM_ID.test(itemId) ? `/items/${itemId}` : DASHBOARD_ROUTE;
    return { notificationId, route };
  }

  const url = data?.url;
  const isInAppPath = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
  return { notificationId, route: isInAppPath ? url : DASHBOARD_ROUTE };
}
