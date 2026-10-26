/**
 * Design tokens: Instrument Serif for the launch wordmark and the auth
 * headings. The family the styles name must be the one the app loads, or iOS
 * silently falls back to the system font.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { APP_FONTS, WORDMARK_FONT } from '@/constants/fonts';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/auth/services/socialSignIn', () => ({
  useAppleSignInAvailable: () => false,
  isGoogleSignInAvailable: () => false,
}));

// The heading is the first match ("Create account" is also the button label).
function familyOf(text: string): unknown {
  return StyleSheet.flatten(screen.getAllByText(text)[0].props.style)?.fontFamily;
}

describe('wordmark font', () => {
  it('loads the family the styles name', () => {
    expect(Object.keys(APP_FONTS)).toContain(WORDMARK_FONT);
    expect(APP_FONTS[WORDMARK_FONT]).toBeDefined();
  });

  it.each([
    ['onboarding/index', 'Grocery Genie'],
    ['onboarding/sign-in', 'Welcome back'],
    ['onboarding/sign-up', 'Create account'],
  ])('%s sets "%s" in Instrument Serif', (route, text) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Screen = require(`../../app/${route}`).default as React.ComponentType;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Screen />
      </QueryClientProvider>,
    );

    expect(familyOf(text)).toBe(WORDMARK_FONT);
  });
});
