import { render, screen } from '@testing-library/react-native';
import { CategoryBreakdown } from '../components/CategoryBreakdown';
import type { BudgetCategorySummary } from '../types';

const mockCategories: BudgetCategorySummary[] = [
  {
    category_id: '1',
    name: 'Groceries',
    budget: 300,
    spent: 200,
    remaining: 100,
    percent: 66.7,
  },
  {
    category_id: '2',
    name: 'Household',
    budget: 100,
    spent: 90,
    remaining: 10,
    percent: 90,
  },
  {
    category_id: '3',
    name: 'Beverages',
    budget: 50,
    spent: 10,
    remaining: 40,
    percent: 20,
  },
];

describe('CategoryBreakdown', () => {
  it('renders all categories', () => {
    render(<CategoryBreakdown categories={mockCategories} />);

    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Household')).toBeTruthy();
    expect(screen.getByText('Beverages')).toBeTruthy();
  });

  it('sorts categories by spend descending', () => {
    render(<CategoryBreakdown categories={mockCategories} />);

    const allText = screen.toJSON();
    const textContent = JSON.stringify(allText);

    // Groceries ($200) should appear before Household ($90)
    const groceriesIndex = textContent.indexOf('Groceries');
    const householdIndex = textContent.indexOf('Household');
    expect(groceriesIndex).toBeLessThan(householdIndex);
  });

  it('renders budget amounts', () => {
    render(<CategoryBreakdown categories={mockCategories} />);

    expect(screen.getByText(/\$200\.00/)).toBeTruthy();
    expect(screen.getByText(/\$90\.00/)).toBeTruthy();
  });
});
