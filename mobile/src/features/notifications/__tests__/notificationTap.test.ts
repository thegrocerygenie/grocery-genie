import { parseNotificationTap } from '../notificationTap';

describe('parseNotificationTap', () => {
  it('reads the notification id and in-app route', () => {
    expect(
      parseNotificationTap({ notification_id: 'n1', type: 'budget_threshold', url: '/' }),
    ).toEqual({ notificationId: 'n1', route: '/' });
  });

  it('falls back to the dashboard when the route is missing', () => {
    expect(parseNotificationTap({ notification_id: 'n1' })).toEqual({
      notificationId: 'n1',
      route: '/',
    });
  });

  it('ignores routes that are not in-app paths', () => {
    expect(parseNotificationTap({ notification_id: 'n1', url: 'https://evil.example' })).toEqual({
      notificationId: 'n1',
      route: '/',
    });
    expect(parseNotificationTap({ notification_id: 'n1', url: '//evil.example' })).toEqual({
      notificationId: 'n1',
      route: '/',
    });
  });

  it('handles a push with no data', () => {
    expect(parseNotificationTap(undefined)).toEqual({ notificationId: null, route: '/' });
  });
});
