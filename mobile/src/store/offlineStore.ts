import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { ScanSource } from '@/constants/analyticsEvents';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface PendingReceipt {
  id: string;
  imageUri: string;
  mimeType: string;
  capturedAt: string;
  /**
   * The user who captured it (the access token's `sub`). The queue is shared by
   * every session on the device, so only this user's session may upload it.
   */
  ownerId?: string;
  /** Where the photo came from, for the upload's analytics; camera when absent. */
  source?: ScanSource;
  status: 'pending' | 'syncing' | 'failed';
  /** An upload was tried and failed for a reason worth retrying (network, server). */
  lastAttemptFailed?: boolean;
}

interface OfflineState {
  pendingReceipts: PendingReceipt[];
  addPendingReceipt: (receipt: Omit<PendingReceipt, 'id' | 'status'>) => void;
  updateStatus: (id: string, status: PendingReceipt['status']) => void;
  /** Put a receipt back in the queue after an upload attempt failed and should be retried. */
  markAttemptFailed: (id: string) => void;
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
          pendingReceipts: state.pendingReceipts.map((r) => (r.id === id ? { ...r, status } : r)),
        })),

      markAttemptFailed: (id) =>
        set((state) => ({
          pendingReceipts: state.pendingReceipts.map((r) =>
            r.id === id ? { ...r, status: 'pending' as const, lastAttemptFailed: true } : r,
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
      // An upload cut off by a crash or force-quit stays 'syncing' on disk and
      // would never be retried. On launch nothing is uploading yet, so put it back.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<OfflineState> | undefined)?.pendingReceipts ?? [];
        return {
          ...current,
          pendingReceipts: saved.map((r) =>
            r.status === 'syncing' ? { ...r, status: 'pending' as const } : r,
          ),
        };
      },
    },
  ),
);
