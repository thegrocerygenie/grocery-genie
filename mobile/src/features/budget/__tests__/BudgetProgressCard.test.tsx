import { render, screen } from '@testing-library/react-native';
import { BudgetProgressCard } from '../components/BudgetProgressCard';

describe('BudgetProgressCard', () => {
  it('renders spent and budget amounts', () => {
    render(
      <BudgetProgressCard
        budget={500}
        spent={250}
        remaining={250}
        percent={50}
        daysLeft={15}
      />,
    );

    expect(screen.getByText('$250.00')).toBeTruthy();
    expect(screen.getByText('of $500.00')).toBeTruthy();
  });

  it('shows remaining text when under budget', () => {
    render(
      <BudgetProgressCard
        budget={500}
        spent={250}
        remaining={250}
        percent={50}
        daysLeft={15}
      />,
    );

    expect(screen.getByText('$250.00 remaining')).toBeTruthy();
  });

  it('shows over budget text when at 100%+', () => {
    render(
      <BudgetProgressCard
        budget={500}
        spent={550}
        remaining={-50}
        percent={110}
        daysLeft={5}
      />,
    );

    expect(screen.getByText(/Over budget/)).toBeTruthy();
    expect(screen.getByText(/\$50\.00/)).toBeTruthy();
  });

  it('shows days left', () => {
    render(
      <BudgetProgressCard
        budget={500}
        spent={250}
        remaining={250}
        percent={50}
        daysLeft={10}
      />,
    );

    expect(screen.getByText('10 days left')).toBeTruthy();
  });
});
