/**
 * A stand-in for expo-notifications that behaves like its iOS module: the
 * native side keeps the last tap (getLastNotificationResponse) and emits it to
 * whichever JS listeners exist when it lands. Tests deliver taps with
 * `deliverTap`, the way iOS hands the app a tap at launch or while running.
 *
 * Use it from a test with:
 *   jest.mock('expo-notifications', () => jest.requireActual('@/testing/fakeNotifications').fakeNotificationsModule());
 */
import { useLayoutEffect, useState } from 'react';

type Listener = (response: FakeResponse) => void;

export interface FakeResponse {
  actionIdentifier: string;
  notification: {
    request: { identifier: string; content: { data: Record<string, unknown> } };
  };
}

export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

const native: {
  last: FakeResponse | null;
  listeners: Set<Listener>;
  cleared: Set<() => void>;
} = { last: null, listeners: new Set(), cleared: new Set() };

/** iOS hands the app a tap: it is stored, then emitted to current listeners. */
export function deliverTap(response: FakeResponse): void {
  native.last = response;
  native.listeners.forEach((listener) => listener(response));
}

export function resetNative(): void {
  native.last = null;
}

export function priceAlertTap(identifier: string, itemId: string): FakeResponse {
  return {
    actionIdentifier: DEFAULT_ACTION,
    notification: {
      request: {
        identifier,
        content: {
          data: {
            type: 'price_change',
            canonical_item_id: itemId,
            notification_id: `n-${identifier}`,
          },
        },
      },
    },
  };
}

function clearLast(): void {
  native.last = null;
  native.cleared.forEach((listener) => listener());
}

// The hook as expo-notifications 0.32 ships it, over the fake native side.
function useLastNotificationResponse(): FakeResponse | null | undefined {
  const [last, setLast] = useState<FakeResponse | null | undefined>(undefined);
  useLayoutEffect(() => {
    const next = (prev: FakeResponse | null | undefined, response: FakeResponse | null) => {
      if (!response) return null;
      if (!prev) return response;
      return prev.notification.request.identifier !== response.notification.request.identifier
        ? response
        : prev;
    };
    setLast((prev) => next(prev, native.last));
    const onTap: Listener = (response) => setLast((prev) => next(prev, response));
    const onClear = () => setLast(null);
    native.listeners.add(onTap);
    native.cleared.add(onClear);
    return () => {
      native.listeners.delete(onTap);
      native.cleared.delete(onClear);
    };
  }, []);
  return last;
}

export function fakeNotificationsModule() {
  return {
    DEFAULT_ACTION_IDENTIFIER: DEFAULT_ACTION,
    setNotificationHandler: jest.fn(),
    getLastNotificationResponse: () => native.last,
    getLastNotificationResponseAsync: async () => native.last,
    addNotificationResponseReceivedListener: (listener: Listener) => {
      native.listeners.add(listener);
      return { remove: () => native.listeners.delete(listener) };
    },
    addNotificationResponseClearedListener: (listener: () => void) => {
      native.cleared.add(listener);
      return { remove: () => native.cleared.delete(listener) };
    },
    clearLastNotificationResponse: clearLast,
    clearLastNotificationResponseAsync: async () => clearLast(),
    useLastNotificationResponse,
    getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
    getExpoPushTokenAsync: jest.fn(),
  };
}
