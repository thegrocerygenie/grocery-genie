/**
 * Onboarding at large Dynamic Type. At AX5 the text outgrows the screen, so
 * every onboarding screen must put its content in a scroll container: the
 * title, the body and every control must sit inside a ScrollView, where the
 * user can scroll to reach them. The design says "Test up to AX5".
 */
import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { StyleSheet } from 'react-native';

import OnboardingBudget from '../../app/onboarding/budget';
import OnboardingCamera from '../../app/onboarding/camera';
import ConfirmEmailChangeScreen from '../../app/onboarding/confirm-email-change';
import ForgotPasswordScreen from '../../app/onboarding/forgot-password';
import OnboardingWelcome from '../../app/onboarding/index';
import ResetPasswordScreen from '../../app/onboarding/reset-password';
import SignInScreen from '../../app/onboarding/sign-in';
import SignUpScreen from '../../app/onboarding/sign-up';
import VerifyEmailScreen from '../../app/onboarding/verify-email';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

const mockConfirmEmailChange = jest.fn<Promise<{ email: string }>, [string]>();
const mockVerifyEmail = jest.fn<Promise<unknown>, [string]>();
const mockSignIn = jest.fn<Promise<unknown>, [unknown]>();
const mockMutation = () => ({ mutateAsync: jest.fn(), isPending: false });
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useSignUp: () => mockMutation(),
  useSignIn: () => ({ mutateAsync: mockSignIn, isPending: false }),
  useAppleSignIn: () => mockMutation(),
  useGoogleSignIn: () => mockMutation(),
  useResetPassword: () => mockMutation(),
  useForgotPassword: () => mockMutation(),
  useCompleteOnboarding: () => mockMutation(),
  useResendVerification: () => mockMutation(),
  useVerifyEmail: () => ({ mutateAsync: mockVerifyEmail, isPending: false }),
  useConfirmEmailChange: () => ({ mutateAsync: mockConfirmEmailChange, isPending: false }),
}));
jest.mock('@/features/budget/hooks/useBudget', () => ({
  useBudgetCreate: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
const mockSocial = { available: false };
jest.mock('@/features/auth/services/socialSignIn', () => ({
  isGoogleSignInAvailable: () => mockSocial.available,
  useAppleSignInAvailable: () => mockSocial.available,
  runAppleSignIn: jest.fn(),
  runGoogleSignIn: jest.fn(),
}));

function open(route: string, Screen: ComponentType, initialUrl = `/${route}`) {
  renderRouter({ _layout: () => <Stack />, [route]: Screen }, { initialUrl });
}

type Node = ReturnType<typeof screen.getByText>;

function inScrollView(node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parent) {
    if (n.type === 'RCTScrollView') return true;
  }
  return false;
}

function expectAllScroll(texts: (string | RegExp)[]) {
  for (const text of texts) {
    for (const node of screen.getAllByText(text)) {
      if (!inScrollView(node)) {
        throw new Error(`"${String(text)}" is not inside a ScrollView`);
      }
    }
  }
}

describe('onboarding content sits in a scroll container', () => {
  it.each([
    [
      'index',
      OnboardingWelcome,
      ['Grocery Genie', /Snap a receipt/, 'Get Started', 'I already have an account'],
    ],
    ['camera', OnboardingCamera, ['Allow Camera Access', /uses the camera/, 'Continue', 'Not now']],
    [
      'budget',
      OnboardingBudget,
      ['MONTHLY BUDGET', '$', 'You can change this anytime.', 'Continue'],
    ],
    [
      'verify-email',
      VerifyEmailScreen,
      ['Check your email', /verification link/, 'Open Mail', 'Use a different email'],
    ],
    ['sign-in', SignInScreen, ['Welcome back', 'Sign in', 'Forgot password?', 'Create account']],
    [
      'sign-up',
      SignUpScreen,
      ['Create account', /Privacy Policy/, /Already have an account/, 'Sign in'],
    ],
    [
      'forgot-password',
      ForgotPasswordScreen,
      ['Reset password', /send a link/, 'Send reset link', 'Back to sign in'],
    ],
  ] as const)('%s', (route, Screen, texts) => {
    open(route, Screen, route === 'index' ? '/' : `/${route}`);

    expectAllScroll([...texts]);
  });

  it('reset-password', () => {
    open('reset-password', ResetPasswordScreen, '/reset-password?token=t');

    expectAllScroll(['Set a new password', 'Reset password']);
  });

  it('verify-email, verified', async () => {
    mockVerifyEmail.mockResolvedValue({ verified_at: '2026-10-28T00:00:00Z' });
    open('verify-email', VerifyEmailScreen, '/verify-email?token=t');

    await waitFor(() => expect(screen.getByText('Email verified')).toBeTruthy());
    expectAllScroll(['Email verified', /Your email is confirmed/, 'Continue']);
  });

  it('confirm-email-change, confirming', () => {
    mockConfirmEmailChange.mockReturnValue(new Promise(() => {}));
    open('confirm-email-change', ConfirmEmailChangeScreen, '/confirm-email-change?token=t');

    expectAllScroll(['Confirming your new email…']);
  });

  it('confirm-email-change, changed', async () => {
    mockConfirmEmailChange.mockResolvedValue({ email: 'new@test.com' });
    open('confirm-email-change', ConfirmEmailChangeScreen, '/confirm-email-change?token=t');

    await waitFor(() => expect(screen.getByText('Email changed')).toBeTruthy());
    expectAllScroll(['Email changed', /Your email is now/, 'Continue']);
  });

  it('confirm-email-change, invalid link', () => {
    open('confirm-email-change', ConfirmEmailChangeScreen);

    expectAllScroll(['Link not valid', /invalid or has expired/, 'Continue']);
  });
});

// Text that cannot wrap must stop growing before it clips: the budget amount
// is one line in a fixed-width card, and Skip sits in the fixed-height nav bar.
describe('Set Budget caps text that cannot wrap', () => {
  beforeEach(() => open('budget', OnboardingBudget));

  it.each([
    ['amount', () => screen.getByLabelText('Monthly budget amount')],
    ['currency sign', () => screen.getByText('$')],
    ['Skip', () => screen.getByText('Skip')],
  ])('%s has a font scale cap', (_name, get) => {
    const cap = get().props.maxFontSizeMultiplier as number | undefined;

    expect(cap).toBeGreaterThanOrEqual(1);
    expect(cap).toBeLessThanOrEqual(1.3);
  });
});

// "Grocery" is one word: at AX5 the wordmark outgrows the screen width and
// breaks mid-word ("Grocer / y"), so it stops growing at twice its size.
it('welcome wordmark has a font scale cap', () => {
  open('index', OnboardingWelcome, '/');

  expect(screen.getByText('Grocery Genie').props.maxFontSizeMultiplier).toBe(2);
});

// The resend timer sits in a row beside its clock icon. Without flexShrink the
// row outgrows the screen at AX5 instead of wrapping the text.
it('verify-email timer text can shrink to wrap', () => {
  open('verify-email', VerifyEmailScreen);

  const timer = screen.getByText(/Resend available in/);
  expect(StyleSheet.flatten(timer.props.style).flexShrink).toBe(1);
});

function styleOf(node: Node) {
  return StyleSheet.flatten(node.props.style) ?? {};
}

// At AX5 a footer like "New here? Create account" is wider than the screen.
// The row must wrap, and each piece must shrink to the screen and wrap too.
describe('auth footers wrap at large text', () => {
  it.each([
    ['sign-in', SignInScreen, 'New here? ', 'Create account'],
    ['sign-up', SignUpScreen, 'Already have an account? ', 'Sign in'],
    ['forgot-password', ForgotPasswordScreen, 'Remembered it? ', 'Back to sign in'],
  ] as const)('%s', (route, Screen, lead, link) => {
    open(route, Screen);

    const leadText = screen.getByText(lead);
    const linkButton = screen.getAllByRole('button', { name: link }).at(-1)!;
    let row = leadText.parent;
    while (row && row.type !== 'View') row = row.parent;
    expect(styleOf(row!).flexWrap).toBe('wrap');
    expect(styleOf(leadText).flexShrink).toBe(1);
    expect(styleOf(linkButton).flexShrink).toBe(1);
  });
});

// A button label that wraps at AX5 (the form screens' labels do; the hero
// screens' short labels never wrap) must stay centred, and a label beside an
// icon must shrink so the icon stays inside the button.
describe('auth button labels at large text', () => {
  afterEach(() => {
    mockSocial.available = false;
  });

  it.each([
    ['sign-in', SignInScreen, 'Sign in', '/sign-in'],
    ['forgot-password', ForgotPasswordScreen, 'Send reset link', '/forgot-password'],
    ['reset-password', ResetPasswordScreen, 'Reset password', '/reset-password?token=t'],
  ] as const)('%s: primary label is centred', (route, Screen, label, url) => {
    open(route, Screen, url);

    const labels = screen.getAllByText(label);
    expect(styleOf(labels[labels.length - 1]).textAlign).toBe('center');
  });

  it('sign-up: primary label is centred', () => {
    open('sign-up', SignUpScreen);

    const labels = screen.getAllByText('Create account');
    expect(styleOf(labels[labels.length - 1]).textAlign).toBe('center');
  });

  it.each([
    ['sign-in', SignInScreen],
    ['sign-up', SignUpScreen],
  ] as const)('%s: social labels shrink beside their icon', (route, Screen) => {
    mockSocial.available = true;
    open(route, Screen);

    for (const label of ['Continue with Apple', 'Continue with Google']) {
      const style = styleOf(screen.getByText(label));
      expect(style.flexShrink).toBe(1);
      expect(style.textAlign).toBe('center');
    }
  });
});

it('sign-in error banner shows the whole message', async () => {
  mockSignIn.mockRejectedValue(new Error('offline'));
  open('sign-in', SignInScreen);
  fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
  fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
  fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  const error = await screen.findByText(/Sign-in failed/);
  expect(error.props.numberOfLines).toBeUndefined();
});
