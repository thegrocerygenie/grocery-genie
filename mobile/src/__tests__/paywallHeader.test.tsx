/**
 * F1 (Simulator pass 2026-11-06): the paywall showed a "Premium" navigation
 * header above its own close button, and the design has none. The route hides
 * the header itself: a modal that changes header visibility from inside the
 * screen is remounted and loses its state (the Metro warning).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Text } from 'react-native';
import { router, Slot } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: { needs_onboarding: false }, isSuccess: true }),
}));
jest.mock('expo-notifications', () =>
  jest.requireActual('@/testing/fakeNotifications').fakeNotificationsModule(),
);
jest.mock('@/features/notifications/services/pushApi', () => ({
  registerPushToken: jest.fn(async () => undefined),
  markNotificationRead: jest.fn(async () => undefined),
}));

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

function headerConfigs(): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (node: HostNode | string): void => {
    if (typeof node === 'string') return;
    if (node.type === 'RNSScreenStackHeaderConfig') found.push(node.props);
    node.children?.forEach(walk);
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  (Array.isArray(root) ? root : root ? [root] : []).forEach(walk);
  return found;
}

describe('Paywall header (F1)', () => {
  it('opens with no navigation header, from the route options', async () => {
    useAuthStore.setState({ hydrated: true, accessToken: 'token' });
    renderRouter(
      {
        _layout: RootLayout,
        '(tabs)/_layout': () => <Slot />,
        '(tabs)/index': () => <Text>Budget home</Text>,
        // A stand-in that sets no options of its own: only the route's apply.
        paywall: () => <Text>Paywall body</Text>,
      },
      { initialUrl: '/' },
    );
    await screen.findByText('Budget home');

    act(() => router.push('/paywall'));
    await screen.findByText('Paywall body');

    const paywallHeaders = headerConfigs().filter((h) => h.title === 'Premium');
    expect(paywallHeaders.length).toBeGreaterThan(0);
    expect(paywallHeaders.every((h) => h.hidden === true)).toBe(true);
  });

  it('does not change header visibility from inside the screen', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../app/paywall.tsx'), 'utf8');
    expect(source).not.toMatch(/headerShown/);
  });
});
