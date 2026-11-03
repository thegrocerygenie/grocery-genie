/**
 * Design alignment, visual fidelity (PR 3 in
 * .planning/HANDOFF-2026-10-28-design-alignment.md). Each case pins one value
 * from the design reference (mvp-screens.jsx, patterns.jsx, motion.jsx) where a
 * test can see it; spacing and shadows are checked on the Simulator.
 */
import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { render } from '@testing-library/react-native';

import OnboardingBudget from '../../app/onboarding/budget';
import OnboardingCamera from '../../app/onboarding/camera';
import OnboardingWelcome from '../../app/onboarding/index';
import { BudgetRing } from '@/components/BudgetRing';
import { colors, springs, type } from '@/constants/theme';
import { useBudgetCurrency } from '@/hooks/useBudgetCurrency';

jest.mock('expo-symbols', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SymbolView: (props: { name: string }) => <View testID={`symbol-${props.name}`} {...props} />,
  };
});
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));
jest.mock('@/features/budget/hooks/useBudget', () => ({
  useBudgetCreate: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useCompleteOnboarding: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/useAccessibilitySetting', () => ({
  useReduceMotion: () => false,
}));

function open(route: string, Screen: ComponentType, initialUrl = `/${route}`) {
  renderRouter({ _layout: () => <Stack />, [route]: Screen }, { initialUrl });
}

const style = (node: { props: { style?: unknown } }): TextStyle =>
  StyleSheet.flatten(node.props.style as TextStyle) ?? {};

describe('money font', () => {
  // 'SF Pro Rounded' is not a family name iOS resolves, so money text fell back
  // to plain SF. React Native maps 'ui-rounded' to the system rounded design.
  it('uses the iOS system rounded design', () => {
    expect(type.money.fontFamily).toBe('ui-rounded');
  });
});

describe('ring spring', () => {
  // motion.jsx: "ring spring · response 0.6 · damping 0.7", the Activity ring.
  it('matches response 0.6 s and damping ratio 0.7 (mass 1)', () => {
    const { damping, stiffness } = springs.ring;
    const response = (2 * Math.PI) / Math.sqrt(stiffness);
    const ratio = damping / (2 * Math.sqrt(stiffness));
    expect(response).toBeCloseTo(0.6, 2);
    expect(ratio).toBeCloseTo(0.7, 2);
  });
});

describe('ring center label', () => {
  it('on track: 22pt amount in the label color, 13pt sub', () => {
    render(<BudgetRing progress={0.4} label="$157" sub="left · 11d" accessibilityLabel="ring" />);
    expect(style(screen.getByText('$157'))).toMatchObject({
      fontSize: 22,
      color: colors.iosLabel,
    });
    expect(style(screen.getByText('left · 11d')).fontSize).toBe(13);
  });

  it('over: 18pt percent in red, 11pt sub', () => {
    render(<BudgetRing progress={1.08} label="108%" sub="April" accessibilityLabel="ring" />);
    expect(style(screen.getByText('108%'))).toMatchObject({ fontSize: 18, color: colors.red });
    expect(style(screen.getByText('April')).fontSize).toBe(11);
  });

  // A four-digit amount at 22pt is wider than the ring's 80pt hole.
  it('shrinks the amount to one line rather than spill out of the ring', () => {
    render(<BudgetRing progress={0.2} label="$1,234" sub="left · 9d" accessibilityLabel="ring" />);
    const amount = screen.getByText('$1,234');
    expect(amount.props.numberOfLines).toBe(1);
    expect(amount.props.adjustsFontSizeToFit).toBe(true);
  });
});

describe('Welcome', () => {
  // In dark mode the tint is bright green, and content on it is black.
  it('draws the cart glyph in the on-tint color', () => {
    open('index', OnboardingWelcome, '/');
    expect(screen.getByTestId('symbol-cart.fill').props.tintColor).toBe(colors.onTint);
  });

  it('sets the tagline at 15pt, 6pt under the wordmark', () => {
    open('index', OnboardingWelcome, '/');
    expect(
      style(screen.getByText('Snap a receipt, watch your grocery budget take shape.')),
    ).toMatchObject({ fontSize: 15, marginTop: 6 });
  });
});

describe('Camera permission', () => {
  it('sets "Not now" at regular weight', () => {
    open('camera', OnboardingCamera);
    expect(style(screen.getByText('Not now')).fontWeight).toBe('400');
  });
});

describe('Onboarding budget amount', () => {
  afterEach(() => jest.mocked(useBudgetCurrency).mockReturnValue('USD'));

  it('shows the amount at 48pt with the cents in the tertiary label color', () => {
    open('budget', OnboardingBudget);
    expect(style(screen.getByLabelText('Monthly budget amount')).fontSize).toBe(48);
    // Hidden from VoiceOver: the field already reads the amount.
    const cents = screen.getByText('.00', { includeHiddenElements: true });
    expect(style(cents).color).toBe(colors.iosLabel3);
  });

  it('drops the ".00" once the user types cents', () => {
    open('budget', OnboardingBudget);
    fireEvent.changeText(screen.getByLabelText('Monthly budget amount'), '412.50');
    expect(screen.queryByText('.00', { includeHiddenElements: true })).toBeNull();
  });

  // The budget currency comes from the iPhone at sign-up, before this screen.
  it('uses the budget currency symbol, not a hard-coded "$"', () => {
    jest.mocked(useBudgetCurrency).mockReturnValue('EUR');
    open('budget', OnboardingBudget);
    expect(screen.getByText('€')).toBeTruthy();
    expect(screen.queryByText('$')).toBeNull();
  });
});
