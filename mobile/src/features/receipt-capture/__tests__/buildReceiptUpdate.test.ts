import type { EditableLineItem, ReceiptExtraction } from '../types';
import { buildReceiptUpdate } from '../utils/buildReceiptUpdate';

const extraction: ReceiptExtraction = {
  store_name: 'Test Grocery Store',
  date: '2026-03-15',
  items: [
    {
      id: 'item-1',
      name: 'Organic Bananas',
      quantity: 1,
      unit_price: 1.29,
      total_price: 1.29,
      category_id: 'cat-groceries',
      category_confidence: 0.9,
      extraction_confidence: 0.95,
    },
    {
      id: 'item-2',
      name: 'Whole Milk',
      quantity: 1,
      unit_price: 4.99,
      total_price: 4.99,
      category_id: 'cat-groceries',
      category_confidence: 0.9,
      extraction_confidence: 0.92,
    },
  ],
  subtotal: 6.28,
  tax: null,
  total: 6.28,
  currency: 'USD',
  confidence: 0.91,
  store_name_confidence: null,
  date_confidence: null,
  total_confidence: null,
};

function editable(overrides: Partial<EditableLineItem>[] = []): EditableLineItem[] {
  return extraction.items.map((item, i) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    totalPrice: item.total_price,
    categoryId: item.category_id,
    categoryConfidence: item.category_confidence,
    extractionConfidence: item.extraction_confidence,
    isEdited: false,
    ...overrides[i],
  }));
}

describe('buildReceiptUpdate', () => {
  it('sends only the corrections when editing an already confirmed receipt', () => {
    const update = buildReceiptUpdate(extraction, editable(), ' Corner Market ', '2026-03-15', {
      confirm: false,
    });

    expect(update).toEqual({ store_name: 'Corner Market' });
  });

  it('confirms with no corrections when nothing was edited', () => {
    expect(
      buildReceiptUpdate(extraction, editable(), 'Test Grocery Store', extraction.date),
    ).toEqual({
      status: 'confirmed',
    });
  });

  it('sends an edited price as total_price', () => {
    const items = editable([{ totalPrice: 2.5, isEdited: true }]);

    expect(buildReceiptUpdate(extraction, items, 'Test Grocery Store', extraction.date)).toEqual({
      items: [{ id: 'item-1', total_price: 2.5 }],
      status: 'confirmed',
    });
  });

  it('sends an edited store name, trimmed', () => {
    expect(buildReceiptUpdate(extraction, editable(), '  Corner Market ', extraction.date)).toEqual(
      {
        store_name: 'Corner Market',
        status: 'confirmed',
      },
    );
  });

  it('keeps sending name and category corrections', () => {
    const items = editable([{}, { name: 'Milk', categoryId: 'cat-dairy', isEdited: true }]);

    expect(buildReceiptUpdate(extraction, items, 'Test Grocery Store', extraction.date)).toEqual({
      items: [{ id: 'item-2', name: 'Milk', category_id: 'cat-dairy' }],
      status: 'confirmed',
    });
  });

  it('sends an edited quantity', () => {
    const items = editable([{ quantity: 3, unitPrice: 0.43, isEdited: true }]);

    expect(buildReceiptUpdate(extraction, items, 'Test Grocery Store', extraction.date)).toEqual({
      items: [{ id: 'item-1', quantity: 3 }],
      status: 'confirmed',
    });
  });

  it('sends an edited date', () => {
    expect(buildReceiptUpdate(extraction, editable(), 'Test Grocery Store', '2026-03-20')).toEqual({
      date: '2026-03-20',
      status: 'confirmed',
    });
  });

  it('leaves the date out when it matches the extraction', () => {
    expect(buildReceiptUpdate(extraction, editable(), 'Test Grocery Store', '2026-03-15')).toEqual({
      status: 'confirmed',
    });
  });

  it('skips an item marked edited whose values are unchanged', () => {
    const items = editable([{ isEdited: true }]);

    expect(buildReceiptUpdate(extraction, items, 'Test Grocery Store', extraction.date)).toEqual({
      status: 'confirmed',
    });
  });
});
