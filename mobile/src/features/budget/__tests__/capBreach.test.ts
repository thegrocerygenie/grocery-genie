import { capBreachMessage } from '../utils/capBreach';

const cat = (name: string, spent: number, cap: number) => ({ name, spent, cap });

describe('capBreachMessage', () => {
  it('names a single category over its cap', () => {
    expect(capBreachMessage([cat('Snacks', 39, 25), cat('Groceries', 100, 175)], false)).toBe(
      'Snacks crossed its cap. Adjust limits or pause alerts.',
    );
  });

  // Category names already contain "&" (Snacks & Treats), so lists join with "and".
  it('joins two categories with "and", furthest over first', () => {
    expect(capBreachMessage([cat('Beverages', 58, 40), cat('Snacks & Treats', 39, 25)], true)).toBe(
      'Snacks & Treats and Beverages crossed their caps. Adjust limits or pause alerts.',
    );
  });

  it('lists three or more with commas and a final "and"', () => {
    expect(
      capBreachMessage([cat('Pet', 31, 30), cat('Snacks', 50, 25), cat('Beverages', 60, 40)], true),
    ).toBe('Snacks, Beverages and Pet crossed their caps. Adjust limits or pause alerts.');
  });

  it('ignores categories with no cap and those at exactly their cap', () => {
    expect(capBreachMessage([cat('Household', 80, 0), cat('Pet', 30, 30)], false)).toBeNull();
  });

  it('falls back to the overall budget when no category cap is crossed', () => {
    expect(capBreachMessage([cat('Groceries', 432, 0)], true)).toBe(
      'You’re over your monthly budget. Adjust limits or pause alerts.',
    );
  });
});
