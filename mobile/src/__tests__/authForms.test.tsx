/**
 * Onboarding auth forms. Each text field must fill its row, so a tap anywhere
 * on the row focuses it. Sign-up must state the real password minimum (12,
 * the backend's password_min_length) and say why Create account stays off.
 */
import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { StyleSheet } from 'react-native';

import ResetPasswordScreen from '../../app/onboarding/reset-password';
import SignInScreen from '../../app/onboarding/sign-in';
import SignUpScreen from '../../app/onboarding/sign-up';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const mockMutation = () => ({ mutateAsync: jest.fn(), isPending: false });
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useSignUp: () => mockMutation(),
  useSignIn: () => mockMutation(),
  useAppleSignIn: () => mockMutation(),
  useGoogleSignIn: () => mockMutation(),
  useResetPassword: () => mockMutation(),
}));
jest.mock('@/features/auth/services/socialSignIn', () => ({
  isGoogleSignInAvailable: () => false,
  useAppleSignInAvailable: () => false,
  runAppleSignIn: jest.fn(),
  runGoogleSignIn: jest.fn(),
}));

function open(route: string, Screen: ComponentType, initialUrl = `/${route}`) {
  renderRouter({ _layout: () => <Stack />, [route]: Screen }, { initialUrl });
}

function flexOf(label: string): unknown {
  return StyleSheet.flatten(screen.getByLabelText(label).props.style)?.flex;
}

function createAccountDisabled(): boolean | undefined {
  return screen.getByRole('button', { name: 'Create account' }).props.accessibilityState?.disabled;
}

describe('auth form inputs fill their row', () => {
  it.each([
    ['sign-up', 'Email', SignUpScreen],
    ['sign-up', 'Password', SignUpScreen],
    ['sign-in', 'Email', SignInScreen],
    ['sign-in', 'Password', SignInScreen],
  ] as const)('%s: %s input has flex 1', (route, label, Screen) => {
    open(route, Screen);

    expect(flexOf(label)).toBe(1);
  });

  it.each(['New password', 'Confirm password'])('reset-password: %s input has flex 1', (label) => {
    open('reset-password', ResetPasswordScreen, '/reset-password?token=t');

    expect(flexOf(label)).toBe(1);
  });
});

describe('sign-up password minimum', () => {
  beforeEach(() => {
    open('sign-up', SignUpScreen);
    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
  });

  it('states the real 12-character minimum in the placeholder', () => {
    const placeholder = screen.getByLabelText('Password').props.placeholder as string;

    expect(placeholder).toContain('12+');
    expect(placeholder).not.toContain('8+');
  });

  it('keeps Create account disabled at 11 characters and says why', () => {
    fireEvent.changeText(screen.getByLabelText('Password'), 'a'.repeat(11));

    expect(createAccountDisabled()).toBe(true);
    expect(screen.getByText('Use at least 12 characters.')).toBeTruthy();
  });

  it('enables Create account at 12 characters and hides the hint', () => {
    fireEvent.changeText(screen.getByLabelText('Password'), 'a'.repeat(12));

    expect(createAccountDisabled()).toBe(false);
    expect(screen.queryByText('Use at least 12 characters.')).toBeNull();
  });

  it('shows no hint before the user types a password', () => {
    expect(screen.queryByText('Use at least 12 characters.')).toBeNull();
  });
});

describe('reset-password hints', () => {
  const tooShort = 'Use at least 12 characters.';
  const mismatch = "Passwords don't match.";

  beforeEach(() => {
    open('reset-password', ResetPasswordScreen, '/reset-password?token=t');
  });

  function type(password: string, confirm: string) {
    fireEvent.changeText(screen.getByLabelText('New password'), password);
    fireEvent.changeText(screen.getByLabelText('Confirm password'), confirm);
  }

  function resetDisabled(): boolean | undefined {
    return screen.getByRole('button', { name: 'Reset password' }).props.accessibilityState
      ?.disabled;
  }

  it('states the 12-character minimum in the placeholder', () => {
    expect(screen.getByLabelText('New password').props.placeholder).toContain('12+');
  });

  it('shows no hint before the user types', () => {
    expect(screen.queryByText(tooShort)).toBeNull();
    expect(screen.queryByText(mismatch)).toBeNull();
  });

  it('says why Reset password is off at 11 matching characters', () => {
    type('a'.repeat(11), 'a'.repeat(11));

    expect(resetDisabled()).toBe(true);
    expect(screen.getByText(tooShort)).toBeTruthy();
  });

  it('stays quiet while the confirm is a correct prefix', () => {
    type('a'.repeat(12), 'a'.repeat(5));

    expect(resetDisabled()).toBe(true);
    expect(screen.queryByText(mismatch)).toBeNull();
  });

  it('says the passwords differ once the confirm goes wrong', () => {
    type('a'.repeat(12), 'aab');

    expect(resetDisabled()).toBe(true);
    expect(screen.getByText(mismatch)).toBeTruthy();
  });

  it('says the passwords differ when the confirm is too long', () => {
    type('a'.repeat(12), 'a'.repeat(13));

    expect(screen.getByText(mismatch)).toBeTruthy();
  });

  it('enables Reset password with no hint at 12 matching characters', () => {
    type('a'.repeat(12), 'a'.repeat(12));

    expect(resetDisabled()).toBe(false);
    expect(screen.queryByText(tooShort)).toBeNull();
    expect(screen.queryByText(mismatch)).toBeNull();
  });

  it('labels the show-password toggle', () => {
    fireEvent.press(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  });
});
