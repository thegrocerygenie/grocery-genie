import { render, fireEvent } from '@testing-library/react-native';

import { ReceiptHistoryItem } from '../components/ReceiptHistoryItem';

describe('ReceiptHistoryItem', () => {
  const defaultProps = {
    storeName: 'Whole Foods',
    date: '2026-03-15',
    total: 47.82,
    itemCount: 12,
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders store name, date, total, and item count', () => {
    const { getByText } = render(<ReceiptHistoryItem {...defaultProps} />);

    expect(getByText('Whole Foods')).toBeTruthy();
    expect(getByText('$47.82')).toBeTruthy();
    expect(getByText('12 items')).toBeTruthy();
  });

  it('renders store initial badge', () => {
    const { UNSAFE_getByProps } = render(<ReceiptHistoryItem {...defaultProps} />);
    // Badge is hidden from accessibility, so query by text content directly
    expect(UNSAFE_getByProps({ children: 'W' })).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <ReceiptHistoryItem {...defaultProps} onPress={onPress} />,
    );

    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders pending sync badge when isPending', () => {
    const { getByText } = render(
      <ReceiptHistoryItem {...defaultProps} isPending />,
    );
    expect(getByText('Pending sync')).toBeTruthy();
  });

  it('does not render pending badge by default', () => {
    const { queryByText } = render(<ReceiptHistoryItem {...defaultProps} />);
    expect(queryByText('Pending sync')).toBeNull();
  });

  it('handles null store name', () => {
    const { getByText, UNSAFE_getByProps } = render(
      <ReceiptHistoryItem {...defaultProps} storeName={null} />,
    );
    expect(getByText('Unknown Store')).toBeTruthy();
    expect(UNSAFE_getByProps({ children: '?' })).toBeTruthy();
  });

  it('handles null total', () => {
    const { getByText } = render(
      <ReceiptHistoryItem {...defaultProps} total={null} />,
    );
    expect(getByText('—')).toBeTruthy();
  });

  it('has accessibility label', () => {
    const { getByLabelText } = render(<ReceiptHistoryItem {...defaultProps} />);
    expect(
      getByLabelText(/Whole Foods.*\$47\.82.*12 items/),
    ).toBeTruthy();
  });
});
