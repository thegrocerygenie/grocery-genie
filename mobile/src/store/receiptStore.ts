import { create } from 'zustand';
import type { ReceiptScanResponse } from '@/features/receipt-capture/types';

interface ReceiptState {
  pendingReceipts: string[];
  addPendingReceipt: (id: string) => void;
  removePendingReceipt: (id: string) => void;

  // Scan session state
  capturedImageUri: string | null;
  setCapturedImageUri: (uri: string | null) => void;
  activeScanResponse: ReceiptScanResponse | null;
  setActiveScanResponse: (response: ReceiptScanResponse | null) => void;
  clearScanSession: () => void;
}

export const useReceiptStore = create<ReceiptState>((set) => ({
  pendingReceipts: [],
  addPendingReceipt: (id) =>
    set((state) => ({
      pendingReceipts: [...state.pendingReceipts, id],
    })),
  removePendingReceipt: (id) =>
    set((state) => ({
      pendingReceipts: state.pendingReceipts.filter((r) => r !== id),
    })),

  capturedImageUri: null,
  setCapturedImageUri: (uri) => set({ capturedImageUri: uri }),
  activeScanResponse: null,
  setActiveScanResponse: (response) => set({ activeScanResponse: response }),
  clearScanSession: () =>
    set({
      capturedImageUri: null,
      activeScanResponse: null,
    }),
}));
