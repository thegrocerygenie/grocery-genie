import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface OnboardingState {
  hasOnboarded: boolean;
  hydrated: boolean;
  markComplete: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasOnboarded: false,
      hydrated: false,
      markComplete: () => set({ hasOnboarded: true }),
      reset: () => set({ hasOnboarded: false }),
    }),
    {
      name: 'grocery-genie-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
