/**
 * PR 9 moved Alerts and Language into the Settings stack. The app's URL scheme
 * makes every route path a deep link, so links to the old root paths must
 * still land on those screens, inside the stack, with Back to Settings.
 */
import React from 'react';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import SettingsLayout from '../../app/settings/_layout';
import SettingsScreen from '../../app/settings/index';
import NotificationSettingsScreen from '../../app/settings/notification-settings';
import LanguageSettingsScreen from '../../app/settings/language-settings';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The expo-router config plugin copies its app.json options into
// expoConfig.extra.router, where the router reads its redirects at runtime.
jest.mock('expo-constants', () => {
  const { expo } = jest.requireActual('../../app.json');
  const plugin = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-router') as
    | [string, Record<string, unknown>]
    | undefined;
  const actual = jest.requireActual('expo-constants');
  const constants = actual.default ?? actual;
  return {
    ...actual,
    __esModule: true,
    default: {
      ...constants,
      expoConfig: {
        ...constants.expoConfig,
        scheme: expo.scheme,
        extra: { router: plugin?.[1] ?? {} },
      },
    },
  };
});
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

function renderApp(initialUrl: string) {
  return renderRouter(
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
    },
    { initialUrl },
  );
}

const legacyLinks = [
  {
    from: '/notification-settings',
    to: '/settings/notification-settings',
    title: 'Alerts',
    content: '50% of budget',
  },
  {
    from: '/language-settings',
    to: '/settings/language-settings',
    title: 'Language',
    content: /processed automatically/,
  },
];

describe.each(legacyLinks)('the old $from link', ({ from, to, title, content }) => {
  it(`opens ${title} in the Settings stack when the app launches from it`, async () => {
    const app = renderApp(from);

    expect(await screen.findByText(content)).toBeTruthy();
    expect(app.getPathname()).toBe(to);
    expect(headerOf(title)?.backTitle).toBe('Settings');
  });

  it(`opens ${title} in the Settings stack when the running app follows it`, async () => {
    const app = renderApp('/');

    act(() => router.push(from));

    expect(await screen.findByText(content)).toBeTruthy();
    expect(app.getPathname()).toBe(to);
    expect(headerOf(title)?.backTitle).toBe('Settings');
  });
});
