import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface NotificationPreferences {
  fiftyPercent: boolean;
  eightyPercent: boolean;
  hundredPercent: boolean;
  weeklySummaryEnabled: boolean;
  weeklySummaryDay: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
}

interface NotificationState {
  preferences: NotificationPreferences;
  setThreshold: (key: 'fiftyPercent' | 'eightyPercent' | 'hundredPercent', enabled: boolean) => void;
  setWeeklySummaryEnabled: (enabled: boolean) => void;
  setWeeklySummaryDay: (day: number) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      preferences: {
        fiftyPercent: false,
        eightyPercent: true,
        hundredPercent: true,
        weeklySummaryEnabled: true,
        weeklySummaryDay: 0, // Sunday
      },

      setThreshold: (key, enabled) =>
        set((state) => ({
          preferences: { ...state.preferences, [key]: enabled },
        })),

      setWeeklySummaryEnabled: (enabled) =>
        set((state) => ({
          preferences: { ...state.preferences, weeklySummaryEnabled: enabled },
        })),

      setWeeklySummaryDay: (day) =>
        set((state) => ({
          preferences: { ...state.preferences, weeklySummaryDay: day },
        })),
    }),
    {
      name: 'grocery-genie-notifications',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
