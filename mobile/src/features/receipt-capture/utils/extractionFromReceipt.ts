import type { ReceiptExtraction, ReceiptResponse } from '../types';

/**
 * Shape a stored receipt like a scan's extraction, so review can edit a
 * receipt opened from History the same way it edits a fresh scan: edits are
 * compared against these stored values.
 */
export function extractionFromReceipt(receipt: ReceiptResponse): ReceiptExtraction {
  return {
    store_name: receipt.store_name ?? '',
    date: receipt.date,
    items: receipt.items.map((item) => ({
      id: item.id,
      name: item.raw_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      category_id: item.category_id,
      category_confidence: item.category_confidence,
      extraction_confidence: item.extraction_confidence,
    })),
    subtotal: receipt.subtotal,
    tax: receipt.tax,
    total: receipt.total,
    currency: receipt.currency,
    confidence: receipt.extraction_confidence ?? 0,
  };
}
