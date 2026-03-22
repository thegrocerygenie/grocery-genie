import { render, fireEvent } from '@testing-library/react-native';
import { ConfirmButton } from '../components/ConfirmButton';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (component: unknown) => component,
      View,
    },
    useSharedValue: () => ({ value: 1 }),
    useAnimatedStyle: () => ({}),
    withSpring: (val: number) => val,
  };
});

describe('ConfirmButton', () => {
  it('renders enabled with confirm text', () => {
    const { getByText } = render(
      <ConfirmButton onPress={() => {}} disabled={false} loading={false} />,
    );
    expect(getByText('Confirm & Save')).toBeTruthy();
  });

  it('shows disabled reason when disabled', () => {
    const { getByText } = render(
      <ConfirmButton onPress={() => {}} disabled={true} loading={false} />,
    );
    expect(getByText('Store name and at least one item required')).toBeTruthy();
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ConfirmButton onPress={onPress} disabled={true} loading={false} />,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress when loading', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ConfirmButton onPress={onPress} disabled={false} loading={true} />,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
