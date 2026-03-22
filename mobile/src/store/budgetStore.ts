import { create } from 'zustand';

interface BudgetState {
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  alertThresholds: number[];
  setAlertThresholds: (thresholds: number[]) => void;
}

function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export const useBudgetStore = create<BudgetState>((set) => ({
  selectedPeriod: getCurrentPeriod(),
  setSelectedPeriod: (period) => set({ selectedPeriod: period }),
  alertThresholds: [80, 100],
  setAlertThresholds: (thresholds) => set({ alertThresholds: thresholds }),
}));
