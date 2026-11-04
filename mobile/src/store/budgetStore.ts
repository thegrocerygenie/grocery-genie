import { create } from 'zustand';

interface BudgetState {
  /**
   * The "YYYY-MM" period the budget screens show. Undefined is the current
   * period, which the server picks from the overall budget's reset day.
   */
  selectedPeriod: string | undefined;
  setSelectedPeriod: (period: string | undefined) => void;
  alertThresholds: number[];
  setAlertThresholds: (thresholds: number[]) => void;
}

export const useBudgetStore = create<BudgetState>((set) => ({
  selectedPeriod: undefined,
  setSelectedPeriod: (period) => set({ selectedPeriod: period }),
  alertThresholds: [80, 100],
  setAlertThresholds: (thresholds) => set({ alertThresholds: thresholds }),
}));
