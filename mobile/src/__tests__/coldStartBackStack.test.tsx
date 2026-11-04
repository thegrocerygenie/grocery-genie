/**
 * BUG-6 (device check 2026-11-03): a price alert tapped while the app was
 * closed, or a link to /items/<id> that launched it, opened the item as the
 * only screen in the stack, with no back button and no tab bar. The root
 * layout's unstable_settings must anchor the tabs under any screen the app
 * starts on.
 */
import React from 'react';
import { Text } from 'react-native';
import { router, Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';

// The real root layout pulls in fonts, auth and push; only its settings matter here.
jest.mock('@/features/notifications/hooks/usePushNotifications', () => ({
  usePushNotifications: () => undefined,
}));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));
jest.mock('@/features/auth/hooks/useAuth', () => ({ useMe: () => ({ data: undefined }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { unstable_settings } = require('../../app/_layout') as {
  unstable_settings?: { initialRouteName?: string };
};

function TestRootLayout() {
  return <Stack />;
}

function startAt(url: string) {
  renderRouter(
    {
      _layout: { default: TestRootLayout, unstable_settings },
      '(tabs)/_layout': () => <Stack />,
      '(tabs)/index': () => <Text>Budget</Text>,
      'items/[id]': () => <Text>Item</Text>,
    },
    { initialUrl: url },
  );
}

describe('cold start back stack', () => {
  it('anchors the tabs under an item opened from a cold start', () => {
    startAt('/items/abc');

    expect(screen.getByText('Item')).toBeTruthy();
    expect(router.canGoBack()).toBe(true);
  });

  it('starts on the tabs with nothing to go back to', () => {
    startAt('/');

    expect(screen.getByText('Budget')).toBeTruthy();
    expect(router.canGoBack()).toBe(false);
  });
});
