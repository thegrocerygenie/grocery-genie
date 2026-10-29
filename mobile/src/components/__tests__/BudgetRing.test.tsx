import { render, screen } from '@testing-library/react-native';
import { withSpring, withTiming } from 'react-native-reanimated';

import { BudgetRing } from '../BudgetRing';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
  };
});

let mockReduceMotion = false;
jest.mock('@/hooks/useAccessibilitySetting', () => ({
  useReduceMotion: () => mockReduceMotion,
}));

function renderRing() {
  render(<BudgetRing progress={0.6} label="$160" sub="left · 11d" accessibilityLabel="ring" />);
}

beforeEach(() => jest.clearAllMocks());

describe('BudgetRing motion', () => {
  it('springs to its value by default', () => {
    mockReduceMotion = false;
    renderRing();
    expect(withSpring).toHaveBeenCalledWith(0.6, expect.anything());
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('fades in at its value, with no spring, under Reduce Motion', () => {
    mockReduceMotion = true;
    renderRing();
    expect(withSpring).not.toHaveBeenCalled();
    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 250 }));
  });
});

describe('BudgetRing Dynamic Type', () => {
  // The ring is a fixed 108pt; uncapped AX5 text spills out of it. The full
  // amount is still in VoiceOver's label and the hero text beside the ring.
  it('caps the center text so it stays inside the ring', () => {
    renderRing();
    expect(screen.getByText('$160').props.maxFontSizeMultiplier).toBe(1.2);
    expect(screen.getByText('left · 11d').props.maxFontSizeMultiplier).toBe(1.2);
  });
});
