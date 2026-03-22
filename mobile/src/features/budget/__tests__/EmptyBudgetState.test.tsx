import { fireEvent, render, screen } from '@testing-library/react-native';
import { EmptyBudgetState } from '../components/EmptyBudgetState';

describe('EmptyBudgetState', () => {
  it('renders CTA button when user has receipts', () => {
    const onSetBudget = jest.fn();
    render(<EmptyBudgetState onSetBudget={onSetBudget} hasReceipts={true} />);

    const button = screen.getByRole('button', { name: 'Set Budget' });
    expect(button).toBeTruthy();
  });

  it('calls onSetBudget when button pressed', () => {
    const onSetBudget = jest.fn();
    render(<EmptyBudgetState onSetBudget={onSetBudget} hasReceipts={true} />);

    fireEvent.press(screen.getByRole('button', { name: 'Set Budget' }));
    expect(onSetBudget).toHaveBeenCalledTimes(1);
  });

  it('does not show button when no receipts', () => {
    const onSetBudget = jest.fn();
    render(<EmptyBudgetState onSetBudget={onSetBudget} hasReceipts={false} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows appropriate message based on receipt status', () => {
    const onSetBudget = jest.fn();
    render(<EmptyBudgetState onSetBudget={onSetBudget} hasReceipts={true} />);

    expect(screen.getByText(/Set up your first budget/)).toBeTruthy();
  });
});
