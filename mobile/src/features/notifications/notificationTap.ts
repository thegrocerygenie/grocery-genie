const DASHBOARD_ROUTE = '/';

export interface NotificationTap {
  notificationId: string | null;
  route: string;
}

/**
 * Read the data the backend attaches to a push (notification_id, url).
 * Only in-app paths are followed; anything else opens the dashboard.
 */
export function parseNotificationTap(data: Record<string, unknown> | undefined): NotificationTap {
  const id = data?.notification_id;
  const url = data?.url;
  const isInAppPath = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
  return {
    notificationId: typeof id === 'string' ? id : null,
    route: isInAppPath ? url : DASHBOARD_ROUTE,
  };
}
