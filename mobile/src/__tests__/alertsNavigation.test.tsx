/**
 * Design "15 · Notifications": Alerts is pushed from Settings with a Back
 * button. As a modal it had no Done or Back, so only a swipe closed it.
 */
import React from 'react';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import NotificationSettingsScreen from '../../app/notification-settings';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: undefined }),
  useUpdatePreferences: () => ({ mutate: jest.fn() }),
}));

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

function hostProps(type: string, match: (p: Record<string, unknown>) => boolean) {
  let found: Record<string, unknown> | undefined;
  const walk = (node: HostNode | string): void => {
    if (typeof node === 'string') return;
    if (node.type === type && match(node.props)) found = node.props;
    node.children?.forEach(walk);
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  (Array.isArray(root) ? root : root ? [root] : []).forEach(walk);
  return found;
}

describe('Alerts navigation', () => {
  it('pushes with a Back button to Settings', () => {
    renderRouter(
      {
        // Mirrors app/_layout.tsx, which registers this route without a modal.
        _layout: () => (
          <Stack>
            <Stack.Screen name="notification-settings" options={{ title: 'Alerts' }} />
          </Stack>
        ),
        index: () => null,
        'notification-settings': NotificationSettingsScreen,
      },
      { initialUrl: '/' },
    );
    act(() => router.push('/notification-settings'));

    expect(screen.getByText('BUDGET ALERTS')).toBeTruthy();
    const header = hostProps('RNSScreenStackHeaderConfig', (p) => p.title === 'Alerts');
    expect(header?.backTitle).toBe('Settings');
    const screenProps = hostProps(
      'RNSScreen',
      (p) => p.stackPresentation !== undefined && p.activityState === 2,
    );
    expect(screenProps?.stackPresentation).toBe('push');
  });
});
