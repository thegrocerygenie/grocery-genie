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

  it('opens the item named in a price change alert (PI-03)', () => {
    expect(
      parseNotificationTap({
        notification_id: 'n2',
        type: 'price_change',
        canonical_item_id: '0f8c2a5e-1b2c-4d3e-8f90-123456789abc',
        store_id: 's1',
      }),
    ).toEqual({ notificationId: 'n2', route: '/items/0f8c2a5e-1b2c-4d3e-8f90-123456789abc' });
  });

  it('opens a price change item from its id even when the url says otherwise', () => {
    expect(
      parseNotificationTap({
        notification_id: 'n2',
        type: 'price_change',
        url: '/',
        canonical_item_id: 'item-1',
      }),
    ).toEqual({ notificationId: 'n2', route: '/items/item-1' });
  });

  it('never builds a route from a malformed price change item id', () => {
    expect(
      parseNotificationTap({
        notification_id: 'n2',
        type: 'price_change',
        canonical_item_id: '../settings',
      }),
    ).toEqual({ notificationId: 'n2', route: '/' });
  });
});
