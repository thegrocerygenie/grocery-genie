import { useBudgetStore } from './budgetStore';

describe('budgetStore', () => {
  it('starts on the current period, which the server picks from the reset day', () => {
    // No period sent: the phone's calendar month is the wrong period when the
    // budget resets on any day but the 1st.
    expect(useBudgetStore.getState().selectedPeriod).toBeUndefined();
  });
});
