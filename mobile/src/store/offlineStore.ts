import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface PendingReceipt {
  id: string;
  imageUri: string;
  mimeType: string;
  capturedAt: string;
  status: 'pending' | 'syncing' | 'failed';
}

interface OfflineState {
  pendingReceipts: PendingReceipt[];
  addPendingReceipt: (receipt: Omit<PendingReceipt, 'id' | 'status'>) => void;
  updateStatus: (id: string, status: PendingReceipt['status']) => void;
  removePendingReceipt: (id: string) => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      pendingReceipts: [],

      addPendingReceipt: (receipt) =>
        set((state) => ({
          pendingReceipts: [
            ...state.pendingReceipts,
            {
              ...receipt,
              id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              status: 'pending' as const,
            },
          ],
        })),

      updateStatus: (id, status) =>
        set((state) => ({
          pendingReceipts: state.pendingReceipts.map((r) =>
            r.id === id ? { ...r, status } : r,
          ),
        })),

      removePendingReceipt: (id) =>
        set((state) => ({
          pendingReceipts: state.pendingReceipts.filter((r) => r.id !== id),
        })),
    }),
    {
      name: 'grocery-genie-offline',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
