/**
 * PI-03 AC 3, device check BUG-6: a price alert tapped while the app is closed
 * opens its item with a way back. On a cold start the root stack is built from
 * the target route; without the tabs under it, the item had no Back button and
 * no tab bar, and the only way out was to force-quit.
 */
import React from 'react';
import { Text } from 'react-native';
import { router, Slot, useLocalSearchParams } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import * as RootLayoutModule from '../../app/_layout';
import { useAuthStore } from '@/store/authStore';
import { deliverTap, priceAlertTap, resetNative } from '@/testing/fakeNotifications';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: { needs_onboarding: false } }),
}));

// A signed-in user: the keychain hands back a session on hydrate, as on launch.
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (key: string) => (key === 'gg.auth.access' ? 'token' : null)),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-notifications', () =>
  jest.requireActual('@/testing/fakeNotifications').fakeNotificationsModule(),
);

const mockMarkRead = jest.fn(async () => undefined);
jest.mock('@/features/notifications/services/pushApi', () => ({
  registerPushToken: jest.fn(async () => undefined),
  markNotificationRead: (...args: unknown[]) => mockMarkRead(...(args as [])),
}));

const ITEM_ID = '7b0c6a52-2f1e-4a8e-9d7e-1f2a3b4c5d6e';

function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`Item ${id}`}</Text>;
}

function launch(initialUrl: string) {
  return renderRouter(
    {
      _layout: RootLayoutModule,
      '(tabs)/_layout': () => <Slot />,
      '(tabs)/index': () => <Text>Budget home</Text>,
      'onboarding/index': () => <Text>Welcome</Text>,
      'items/index': () => <Text>Prices list</Text>,
      'items/[id]': ItemScreen,
    },
    { initialUrl },
  );
}

async function expectBackToBudget() {
  expect(router.canGoBack()).toBe(true);
  act(() => router.back());
  expect(await screen.findByText('Budget home')).toBeTruthy();
}

describe('Opening an item from a cold start (BUG-6)', () => {
  beforeEach(() => {
    resetNative();
    mockMarkRead.mockClear();
    useAuthStore.setState({ accessToken: null, hydrated: false });
  });

  // The plain cold-start tap (hydrating from the keychain) is covered by
  // pushTapColdStart.test.tsx, from main's fix for the same bug.
  it('routes a tap that is waiting on the first frame, once the root navigator is ready', async () => {
    // Signed in already when the root layout first renders its stack: the tap
    // effect runs before React Navigation is ready, and pushing then throws.
    useAuthStore.setState({ accessToken: 'token', hydrated: true });
    deliverTap(priceAlertTap('tap-ready', ITEM_ID));
    launch('/');

    expect(await screen.findByText(`Item ${ITEM_ID}`)).toBeTruthy();
    await expectBackToBudget();
  });

  it('asks for the tabs under the item, in case the tap lands before the stack is built', async () => {
    // On the device the tap can be routed while the root stack is still being
    // built, and the stack is then made from the push alone. withAnchor makes
    // Expo Router load the root's initialRouteName, the tabs, under it.
    const push = jest.spyOn(router, 'push');
    deliverTap(priceAlertTap('tap-anchor', ITEM_ID));
    launch('/');

    expect(await screen.findByText(`Item ${ITEM_ID}`)).toBeTruthy();
    expect(push).toHaveBeenCalledWith(`/items/${ITEM_ID}`, { withAnchor: true });
    push.mockRestore();
  });

  it('puts the tabs under an item opened by a deep link on launch', async () => {
    launch(`/items/${ITEM_ID}`);

    expect(await screen.findByText(`Item ${ITEM_ID}`)).toBeTruthy();
    await expectBackToBudget();
  });
});
