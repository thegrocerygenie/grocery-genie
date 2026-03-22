import { useReceiptStore } from '../receiptStore';
import type { ReceiptScanResponse } from '@/features/receipt-capture/types';

describe('receiptStore', () => {
  beforeEach(() => {
    useReceiptStore.setState({
      pendingReceipts: [],
      capturedImageUri: null,
      activeScanResponse: null,
    });
  });

  it('setCapturedImageUri updates state', () => {
    useReceiptStore.getState().setCapturedImageUri('file:///photo.jpg');
    expect(useReceiptStore.getState().capturedImageUri).toBe('file:///photo.jpg');
  });

  it('setActiveScanResponse updates state', () => {
    const response: ReceiptScanResponse = {
      receipt_id: 'test-id',
      status: 'pending_review',
      extraction: {
        store_name: 'Test Store',
        date: '2026-03-15',
        items: [],
        subtotal: null,
        tax: null,
        total: null,
        currency: 'USD',
        confidence: 0.9,
      },
    };
    useReceiptStore.getState().setActiveScanResponse(response);
    expect(useReceiptStore.getState().activeScanResponse).toEqual(response);
  });

  it('clearScanSession resets both to null', () => {
    useReceiptStore.getState().setCapturedImageUri('file:///photo.jpg');
    useReceiptStore.getState().setActiveScanResponse({
      receipt_id: 'id',
      status: 'pending_review',
      extraction: {
        store_name: 'Store',
        date: '2026-01-01',
        items: [],
        subtotal: null,
        tax: null,
        total: null,
        currency: 'USD',
        confidence: 0.5,
      },
    });
    useReceiptStore.getState().clearScanSession();
    expect(useReceiptStore.getState().capturedImageUri).toBeNull();
    expect(useReceiptStore.getState().activeScanResponse).toBeNull();
  });

  it('addPendingReceipt and removePendingReceipt work', () => {
    useReceiptStore.getState().addPendingReceipt('r1');
    useReceiptStore.getState().addPendingReceipt('r2');
    expect(useReceiptStore.getState().pendingReceipts).toEqual(['r1', 'r2']);

    useReceiptStore.getState().removePendingReceipt('r1');
    expect(useReceiptStore.getState().pendingReceipts).toEqual(['r2']);
  });
});
