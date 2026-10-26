import type {
  EditableLineItem,
  LineItemCorrection,
  ReceiptExtraction,
  ReceiptUpdateRequest,
} from '../types';

/**
 * Build the PATCH body that confirms a reviewed scan. Sends only fields the
 * user actually changed, compared against the original extraction.
 */
export function buildReceiptUpdate(
  extraction: ReceiptExtraction,
  items: EditableLineItem[],
  storeName: string,
  receiptDate: string,
): ReceiptUpdateRequest {
  const originals = new Map(extraction.items.map((item) => [item.id, item]));

  const corrections: LineItemCorrection[] = [];
  for (const item of items) {
    const original = originals.get(item.id);
    if (!item.isEdited || !original) continue;

    const correction: LineItemCorrection = { id: item.id };
    if (item.name !== original.name) correction.name = item.name;
    if (item.categoryId !== original.category_id) {
      correction.category_id = item.categoryId ?? undefined;
    }
    if (item.totalPrice !== original.total_price) correction.total_price = item.totalPrice;

    if (Object.keys(correction).length > 1) corrections.push(correction);
  }

  const update: ReceiptUpdateRequest = { status: 'confirmed' };
  const trimmedStore = storeName.trim();
  if (trimmedStore && trimmedStore !== extraction.store_name) update.store_name = trimmedStore;
  if (receiptDate && receiptDate !== extraction.date) update.date = receiptDate;
  if (corrections.length > 0) update.items = corrections;
  return update;
}
