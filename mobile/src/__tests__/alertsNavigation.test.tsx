/**
 * Design "15 · Notifications": Alerts is pushed from Settings with a Back
 * button. Settings is a modal, and iOS presents any root-stack screen opened
 * over a modal as another modal, with no Back. So Settings owns a stack, and
 * Alerts must live in it: both screens on one native stack.
 */
import React from 'react';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import SettingsLayout from '../../app/settings/_layout';
import SettingsScreen from '../../app/settings/index';
import NotificationSettingsScreen from '../../app/settings/notification-settings';
import LanguageSettingsScreen from '../../app/settings/language-settings';
import AboutScreen from '../../app/settings/about';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.1.0' } }));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: undefined }),
  useSignOut: () => ({ mutateAsync: jest.fn() }),
  useUpdatePreferences: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/budget/hooks/useBudget', () => ({
  useBudgets: () => ({ data: [] }),
}));

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

function titlesUnder(node: HostNode): string[] {
  const titles: string[] = [];
  const walk = (n: HostNode | string): void => {
    if (typeof n === 'string') return;
    if (n.type === 'RNSScreenStackHeaderConfig') titles.push(String(n.props.title));
    n.children?.forEach(walk);
  };
  walk(node);
  return titles;
}

/** The header titles of each native stack, innermost stacks included. */
function stacks(): string[][] {
  const found: string[][] = [];
  const walk = (n: HostNode | string): void => {
    if (typeof n === 'string') return;
    if (n.type === 'RNSScreenStack') found.push(titlesUnder(n));
    n.children?.forEach(walk);
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  (Array.isArray(root) ? root : root ? [root] : []).forEach(walk);
  return found;
}

function headerOf(title: string): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  const walk = (n: HostNode | string): void => {
    if (typeof n === 'string') return;
    if (n.type === 'RNSScreenStackHeaderConfig' && n.props.title === title) found = n.props;
    n.children?.forEach(walk);
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  (Array.isArray(root) ? root : root ? [root] : []).forEach(walk);
  return found;
}

/** The real settings folder, under a root stack that presents it as a modal. */
function openSettings() {
  renderRouter(
    {
      _layout: () => (
        <Stack>
          <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
      ),
      index: () => null,
      'settings/_layout': SettingsLayout,
      'settings/index': SettingsScreen,
      'settings/notification-settings': NotificationSettingsScreen,
      'settings/language-settings': LanguageSettingsScreen,
      'settings/about': AboutScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/settings'));
}

describe('Alerts navigation', () => {
  it('pushes Alerts onto the Settings stack, with a Back button to Settings', async () => {
    openSettings();

    fireEvent.press(await screen.findByLabelText('Notifications'));

    expect(await screen.findByText('50% of budget')).toBeTruthy();
    expect(stacks().some((t) => t.includes('Settings') && t.includes('Alerts'))).toBe(true);
    expect(headerOf('Alerts')?.backTitle).toBe('Settings');
  });

  it('pushes Language and About onto the same stack', async () => {
    openSettings();

    fireEvent.press(await screen.findByLabelText('About'));

    expect(await screen.findByText('Version')).toBeTruthy();
    expect(stacks().some((t) => t.includes('Settings') && t.includes('About'))).toBe(true);
  });
});
