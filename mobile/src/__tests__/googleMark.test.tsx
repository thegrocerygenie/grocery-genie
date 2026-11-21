/**
 * "Continue with Google" shows Google's four-color G (design v1-mvp-gap.jsx
 * Sign up), not a text letter "G", on both auth screens.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/auth/services/socialSignIn', () => ({
  useAppleSignInAvailable: () => false,
  isGoogleSignInAvailable: () => true,
  runAppleSignIn: jest.fn(),
  runGoogleSignIn: jest.fn(),
}));

it.each(['onboarding/sign-in', 'onboarding/sign-up'])(
  '%s draws the Google G mark in the Google button',
  (route) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Screen = require(`../../app/${route}`).default as React.ComponentType;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Screen />
      </QueryClientProvider>,
    );

    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(within(button).getByTestId('google-mark')).toBeTruthy();
    expect(within(button).queryByText('G')).toBeNull();
  },
);
