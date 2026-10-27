/**
 * Dark mode chrome: native stack headers (receipt detail, Review, sign-in,
 * pushed Settings screens) take their colors from the React Navigation theme.
 * With no theme they stay light in dark mode, and the light status bar is
 * white on a white header. The Welcome wordmark must also follow the label
 * color, or it is black on black.
 */
import React from 'react';
// React Native's jest setup mocks useColorScheme to return 'light'.
import { StyleSheet, Text, useColorScheme } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import Welcome from '../../app/onboarding';
import { colors, navigationTheme, TINT_HEX } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncQueue: () => undefined }));
jest.mock('@/features/notifications/hooks/usePushNotifications', () => ({
  usePushNotifications: () => undefined,
}));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: { needs_onboarding: false } }),
}));

function ThemeProbe() {
  const theme = useTheme();
  return (
    <Text>{`dark=${theme.dark} card=${theme.colors.card} primary=${theme.colors.primary}`}</Text>
  );
}

// The groups and screens app/_layout.tsx declares, so its Stack finds each one.
const otherRoutes = {
  '(tabs)/_layout': () => <Slot />,
  'onboarding/_layout': () => <Slot />,
  'settings/_layout': () => <Slot />,
  ...Object.fromEntries(
    ['(tabs)/index', 'onboarding/index', 'settings/index', 'receipt/[id]'].map((name) => [
      name,
      () => null,
    ]),
  ),
  ...Object.fromEntries(
    [
      'review',
      'budget-settings',
      'manual-entry',
      'top-items',
      'trend',
      'email-change',
      'recently-deleted',
    ].map((name) => [name, () => null]),
  ),
};

describe('navigationTheme', () => {
  it.each(['light', 'dark'] as const)(
    '%s uses the brand tint and the grouped background',
    (scheme) => {
      const theme = navigationTheme(scheme);
      expect(theme.dark).toBe(scheme === 'dark');
      expect(theme.colors.primary).toBe(TINT_HEX[scheme]);
      expect(theme.colors.background).toBe(scheme === 'dark' ? '#000000' : '#F2F2F7');
    },
  );

  it('gives dark mode a dark header and light text', () => {
    const { colors: nav } = navigationTheme('dark');
    expect(nav.card).not.toBe(navigationTheme('light').colors.card);
    expect(nav.text).not.toBe(navigationTheme('light').colors.text);
  });
});

describe('root layout theme', () => {
  beforeEach(() => {
    useAuthStore.setState({ hydrated: true, accessToken: 'token', refreshToken: 'refresh' });
  });
  afterEach(() => jest.mocked(useColorScheme).mockReturnValue('light'));

  it.each(['light', 'dark'] as const)('gives stack screens the %s theme', async (scheme) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme);
    renderRouter(
      { _layout: RootLayout, ...otherRoutes, 'receipt/[id]': ThemeProbe },
      { initialUrl: '/receipt/abc' },
    );

    const { card, primary } = navigationTheme(scheme).colors;
    const probe = `dark=${scheme === 'dark'} card=${card} primary=${primary}`;
    expect(await screen.findByText(probe)).toBeTruthy();
  });
});

describe('Welcome wordmark', () => {
  it('uses the label color so it shows in dark mode', async () => {
    renderRouter(
      { _layout: RootLayout, ...otherRoutes, 'onboarding/index': Welcome },
      { initialUrl: '/onboarding' },
    );

    const style = StyleSheet.flatten((await screen.findByText('Grocery Genie')).props.style);
    expect(style.color).toEqual(colors.iosLabel);
  });
});
