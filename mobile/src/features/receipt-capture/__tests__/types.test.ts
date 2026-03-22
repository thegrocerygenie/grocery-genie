import { ReceiptScanResponse } from '../types';

describe('Receipt types', () => {
  it('should accept a valid ReceiptScanResponse shape', () => {
    const response: ReceiptScanResponse = {
      receipt_id: 'test-uuid',
      status: 'pending_review',
      extraction: {
        store_name: 'Test Store',
        date: '2026-03-15',
        items: [],
        subtotal: null,
        tax: null,
        total: null,
        currency: 'USD',
        confidence: 0.85,
      },
    };
    expect(response.receipt_id).toBe('test-uuid');
    expect(response.status).toBe('pending_review');
    expect(response.extraction.store_name).toBe('Test Store');
  });
});
