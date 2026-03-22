import { render, fireEvent } from '@testing-library/react-native';
import { CaptureButton } from '../components/CaptureButton';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

// Mock react-native-reanimated
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

describe('CaptureButton', () => {
  it('renders with correct accessibility label', () => {
    const { getByLabelText } = render(<CaptureButton onPress={() => {}} />);
    expect(getByLabelText('Capture Receipt')).toBeTruthy();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    const { getByRole } = render(<CaptureButton onPress={onPress} />);
    await fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = render(<CaptureButton onPress={onPress} disabled />);
    await fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
