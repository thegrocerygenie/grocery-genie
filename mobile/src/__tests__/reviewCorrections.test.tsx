/**
 * RC-02 AC 1: each extracted field is editable on the review screen. An edit
 * goes out in the PATCH that confirms the scan; an untouched field does not.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';

import ReviewScreen from '../../app/review';
import { useReceiptStore } from '@/store/receiptStore';
import type { ReceiptResponse, ReceiptScanResponse } from '@/features/receipt-capture/types';
import { colors } from '@/constants/theme';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The native picker has no JS renderer in Jest; stand in a view that keeps
// its props so the test can fire the picker's onChange.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return function MockDateTimePicker(props: object) {
    return <MockView {...props} />;
  };
});

const mockMutate = jest.fn();
jest.mock('@/features/receipt-capture/hooks/useReceiptReview', () => ({
  useReceiptConfirm: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));
jest.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({ emit: jest.fn() }),
}));
const mockGetReceipt = jest.fn();
jest.mock('@/features/receipt-capture/services/receiptApi', () => ({
  getReceipt: (id: string) => mockGetReceipt(id),
}));

const scan: ReceiptScanResponse = {
  receipt_id: 'r-1',
  status: 'pending',
  extraction: {
    store_name: 'Test Grocery Store',
    date: '2026-03-15',
    items: [
      {
        id: 'item-1',
        name: 'Organic Bananas',
        quantity: 1,
        unit_price: 1.29,
        total_price: 1.29,
        category_id: null,
        category_confidence: null,
        extraction_confidence: 0.95,
      },
    ],
    subtotal: 1.29,
    tax: null,
    total: 1.29,
    currency: 'USD',
    confidence: 0.95,
    store_name_confidence: 0.95,
    date_confidence: 0.95,
    total_confidence: 0.95,
  },
};

function renderReview() {
  const queryClient = new QueryClient();
  const routerScreen = renderRouter(
    {
      // Mirrors app/_layout.tsx, which declares this route as a modal. The
      // Stack renders the header, where Save lives.
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <Stack>
            <Stack.Screen
              name="review"
              options={{ title: 'Review Receipt', presentation: 'modal' }}
            />
          </Stack>
        </QueryClientProvider>
      ),
      index: () => null,
      review: ReviewScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/review'));
  return routerScreen;
}

beforeEach(() => {
  jest.clearAllMocks();
  useReceiptStore.getState().setActiveScanResponse(scan);
});

afterEach(() => {
  useReceiptStore.getState().clearScanSession();
});

function save() {
  fireEvent.press(screen.getByLabelText('Save'));
}

describe('Review screen date edit', () => {
  it('shows the extracted date in the picker', () => {
    renderReview();

    const picker = screen.getByLabelText('Receipt date');
    expect(picker.props.value).toEqual(new Date(2026, 2, 15));
  });

  it('sends an edited date when the user saves', () => {
    renderReview();

    fireEvent(
      screen.getByLabelText('Receipt date'),
      'onChange',
      { type: 'set' },
      new Date(2026, 2, 20),
    );
    save();

    expect(mockMutate).toHaveBeenCalledWith(
      {
        receiptId: 'r-1',
        updates: { date: '2026-03-20', status: 'confirmed' },
      },
      expect.anything(),
    );
  });

  it('does not send the date when the user leaves it alone', () => {
    renderReview();

    save();

    expect(mockMutate).toHaveBeenCalledWith(
      { receiptId: 'r-1', updates: { status: 'confirmed' } },
      expect.anything(),
    );
  });
});

describe('Review screen quantity edit', () => {
  function editQuantity(text: string) {
    fireEvent.press(screen.getByLabelText('Quantity of Organic Bananas'));
    const input = screen.getByLabelText('Edit quantity of Organic Bananas');
    fireEvent.changeText(input, text);
    fireEvent(input, 'blur');
  }

  it('shows each item quantity', () => {
    renderReview();

    expect(screen.getByText('Qty 1')).toBeTruthy();
  });

  it('sends an edited quantity and no price change', () => {
    renderReview();

    editQuantity('2');
    save();

    // L9: the line total stays what was paid, and the new unit price shows.
    expect(screen.getByText('Qty 2 · $0.65 each')).toBeTruthy();
    expect(screen.getByLabelText('Total, $1.29')).toBeTruthy();
    expect(mockMutate).toHaveBeenCalledWith(
      {
        receiptId: 'r-1',
        updates: { items: [{ id: 'item-1', quantity: 2 }], status: 'confirmed' },
      },
      expect.anything(),
    );
  });

  it('reads a comma as the decimal separator', () => {
    renderReview();

    editQuantity('1,105');
    save();

    expect(mockMutate).toHaveBeenCalledWith(
      {
        receiptId: 'r-1',
        updates: { items: [{ id: 'item-1', quantity: 1.105 }], status: 'confirmed' },
      },
      expect.anything(),
    );
  });

  it.each(['0', '-1', 'abc', ''])('ignores a quantity of %p', (text) => {
    renderReview();

    editQuantity(text);
    save();

    expect(screen.getByText('Qty 1')).toBeTruthy();
    expect(mockMutate).toHaveBeenCalledWith(
      { receiptId: 'r-1', updates: { status: 'confirmed' } },
      expect.anything(),
    );
  });
});

function withItem(overrides: Partial<ReceiptScanResponse['extraction']['items'][number]>) {
  useReceiptStore.getState().setActiveScanResponse({
    ...scan,
    extraction: {
      ...scan.extraction,
      items: [{ ...scan.extraction.items[0], ...overrides }],
    },
  });
}

describe('Review screen item name edit', () => {
  function editName(text: string) {
    fireEvent.press(screen.getByLabelText('Name of Organic Bananas'));
    const input = screen.getByLabelText('Edit name of Organic Bananas');
    fireEvent.changeText(input, text);
    fireEvent(input, 'blur');
  }

  it('sends an edited item name when the user saves', () => {
    renderReview();

    editName('  Bananas  ');
    save();

    expect(screen.getByText('Bananas')).toBeTruthy();
    expect(mockMutate).toHaveBeenCalledWith(
      {
        receiptId: 'r-1',
        updates: { items: [{ id: 'item-1', name: 'Bananas' }], status: 'confirmed' },
      },
      expect.anything(),
    );
  });

  it('ignores a blank name', () => {
    renderReview();

    editName('   ');
    save();

    expect(screen.getByText('Organic Bananas')).toBeTruthy();
    expect(mockMutate).toHaveBeenCalledWith(
      { receiptId: 'r-1', updates: { status: 'confirmed' } },
      expect.anything(),
    );
  });
});

describe('Review screen price edit', () => {
  function editPrice(text: string) {
    fireEvent.press(screen.getByLabelText('Price of Organic Bananas'));
    const input = screen.getByLabelText('Edit price of Organic Bananas');
    fireEvent.changeText(input, text);
    fireEvent(input, 'blur');
  }

  it('reads a comma as the decimal separator', () => {
    renderReview();

    editPrice('2,50');
    save();

    expect(mockMutate).toHaveBeenCalledWith(
      {
        receiptId: 'r-1',
        updates: { items: [{ id: 'item-1', total_price: 2.5 }], status: 'confirmed' },
      },
      expect.anything(),
    );
  });

  it.each(['abc', '', '-1'])('ignores a price of %p instead of zeroing it', (text) => {
    renderReview();

    editPrice(text);
    save();

    expect(screen.getByLabelText('Price of Organic Bananas')).toHaveTextContent('$1.29');
    expect(mockMutate).toHaveBeenCalledWith(
      { receiptId: 'r-1', updates: { status: 'confirmed' } },
      expect.anything(),
    );
  });

  it('moves the subtotal and total by the price change', () => {
    renderReview();

    editPrice('2.50');

    expect(screen.getByLabelText('Subtotal, $2.50')).toBeTruthy();
    expect(screen.getByLabelText('Total, $2.50')).toBeTruthy();
  });
});

// Save does not blur an open editor, and the price and quantity keyboards
// have no Return key, so a user often taps Save with an editor still open.
describe('Review screen Save with an editor still open', () => {
  function typeWithoutBlur(field: 'name' | 'quantity' | 'price', text: string) {
    const label = field[0].toUpperCase() + field.slice(1);
    fireEvent.press(screen.getByLabelText(`${label} of Organic Bananas`));
    fireEvent.changeText(screen.getByLabelText(`Edit ${field} of Organic Bananas`), text);
  }

  it.each([
    ['name', 'Bananas', { name: 'Bananas' }],
    ['quantity', '2', { quantity: 2 }],
    ['price', '2.50', { total_price: 2.5 }],
  ] as const)('sends the %s being edited', (field, text, change) => {
    renderReview();

    typeWithoutBlur(field, text);
    save();

    expect(mockMutate).toHaveBeenCalledWith(
      {
        receiptId: 'r-1',
        updates: { items: [{ id: 'item-1', ...change }], status: 'confirmed' },
      },
      expect.anything(),
    );
  });

  it('moves the subtotal and total while the price is typed', () => {
    renderReview();

    typeWithoutBlur('price', '2.50');

    expect(screen.getByLabelText('Subtotal, $2.50')).toBeTruthy();
    expect(screen.getByLabelText('Total, $2.50')).toBeTruthy();
  });
});

describe('Review screen low-confidence flags (AC 2)', () => {
  it('flags the price of an item read with low confidence', () => {
    withItem({ extraction_confidence: 0.5 });
    renderReview();

    expect(screen.getByText('verify')).toBeTruthy();
  });

  it('does not flag an item read with confidence at the threshold', () => {
    withItem({ extraction_confidence: 0.7, category_confidence: 0.7 });
    renderReview();

    expect(screen.queryByText('verify')).toBeNull();
    const category = screen.getByLabelText(/^Category .*, tap to change$/);
    expect(category.props.accessibilityLabel).not.toMatch(/low confidence/);
    expect(category).not.toHaveStyle({ borderColor: colors.orange });
  });

  it('rings the category of an item categorised with low confidence', () => {
    withItem({ category_confidence: 0.5 });
    renderReview();

    const category = screen.getByLabelText(/^Category .*, low confidence, tap to change$/);
    expect(category).toHaveStyle({ borderColor: colors.orange });
  });
});

describe('Review screen VoiceOver', () => {
  it('reads each price as the value of its button', () => {
    renderReview();

    expect(screen.getByLabelText('Price of Organic Bananas').props.accessibilityValue).toEqual({
      text: '$1.29',
    });
  });

  it('says a low-confidence price needs checking', () => {
    withItem({ extraction_confidence: 0.5 });
    renderReview();

    expect(screen.getByLabelText('Price of Organic Bananas').props.accessibilityValue).toEqual({
      text: '$1.29, low confidence',
    });
  });

  it('makes Cancel a button', () => {
    renderReview();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});

describe('Review screen store, date and total flags (AC 2)', () => {
  type FieldConfidences = Pick<
    ReceiptScanResponse['extraction'],
    'store_name_confidence' | 'date_confidence' | 'total_confidence'
  >;

  function withFieldConfidences(confidences: FieldConfidences) {
    useReceiptStore.getState().setActiveScanResponse({
      ...scan,
      extraction: { ...scan.extraction, ...confidences },
    });
  }

  it('flags each of store, date and total read with low confidence', () => {
    withFieldConfidences({
      store_name_confidence: 0.4,
      date_confidence: 0.69,
      total_confidence: 0.5,
    });
    renderReview();

    expect(screen.getAllByText('verify')).toHaveLength(3);
    const store = screen.getByLabelText('Store');
    expect(store).toHaveStyle({ color: colors.orange });
    expect(store.props.accessibilityHint).toMatch(/low confidence/i);
    expect(screen.getByLabelText('Receipt date').props.accessibilityHint).toMatch(
      /low confidence/i,
    );
    const total = screen.getByLabelText('Total, $1.29, low confidence');
    expect(within(total).getByText('$1.29')).toHaveStyle({ color: colors.orange });
  });

  it('does not flag store, date or total at the threshold', () => {
    withFieldConfidences({
      store_name_confidence: 0.7,
      date_confidence: 0.7,
      total_confidence: 0.7,
    });
    renderReview();

    expect(screen.queryByText('verify')).toBeNull();
    const store = screen.getByLabelText('Store');
    expect(store).not.toHaveStyle({ color: colors.orange });
    expect(store.props.accessibilityHint).toBeUndefined();
    expect(screen.getByLabelText('Receipt date').props.accessibilityHint).toBeUndefined();
    expect(screen.getByLabelText('Total, $1.29')).toBeTruthy();
  });

  it('does not flag a field with no confidence score', () => {
    withFieldConfidences({
      store_name_confidence: null,
      date_confidence: null,
      total_confidence: null,
    });
    renderReview();

    expect(screen.queryByText('verify')).toBeNull();
  });

  it('flags only the field read with low confidence', () => {
    withFieldConfidences({
      store_name_confidence: 0.95,
      date_confidence: 0.95,
      total_confidence: 0.3,
    });
    renderReview();

    expect(screen.getAllByText('verify')).toHaveLength(1);
    expect(screen.getByLabelText('Total, $1.29, low confidence')).toBeTruthy();
    expect(screen.getByLabelText('Store')).not.toHaveStyle({ color: colors.orange });
  });
});

describe('Review opened from History', () => {
  function stored(status: string): ReceiptResponse {
    return {
      id: 'r-2',
      user_id: 'u-1',
      store_name: 'Test Grocery Store',
      date: '2026-03-15',
      subtotal: 1.29,
      tax: null,
      total: 1.29,
      currency: 'USD',
      image_url: null,
      extraction_confidence: 0.95,
      store_name_confidence: 0.95,
      date_confidence: 0.95,
      total_confidence: 0.95,
      status,
      items: [
        {
          id: 'item-9',
          raw_name: 'Organic Bananas',
          quantity: 1,
          unit_price: 1.29,
          total_price: 1.29,
          unit_of_measure: null,
          category_id: null,
          category_confidence: null,
          extraction_confidence: 0.95,
          corrected: false,
        },
      ],
      created_at: null,
    };
  }

  function openFromHistory() {
    useReceiptStore.getState().clearScanSession();
    const routerScreen = renderReview();
    act(() => router.back());
    act(() => router.push({ pathname: '/review', params: { receiptId: 'r-2' } }));
    return routerScreen;
  }

  it('lets the user correct and confirm a scan that needs review', async () => {
    mockGetReceipt.mockResolvedValue(stored('pending_review'));
    mockMutate.mockImplementationOnce((_vars, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    const routerScreen = openFromHistory();

    fireEvent.changeText(await screen.findByLabelText('Store'), 'Corner Market');
    save();

    expect(mockGetReceipt).toHaveBeenCalledWith('r-2');
    expect(mockMutate).toHaveBeenCalledWith(
      { receiptId: 'r-2', updates: { store_name: 'Corner Market', status: 'confirmed' } },
      expect.anything(),
    );
    // Back to History, not to the scan flow's home tab.
    expect(routerScreen.getPathname()).toBe('/');
  });

  it('flags the stored store, date and total confidences', async () => {
    mockGetReceipt.mockResolvedValue({
      ...stored('pending_review'),
      store_name_confidence: 0.5,
      date_confidence: 0.6,
      total_confidence: 0.4,
    });
    openFromHistory();

    expect(await screen.findByLabelText('Total, $1.29, low confidence')).toBeTruthy();
    expect(screen.getAllByText('verify')).toHaveLength(3);
    expect(screen.getByLabelText('Store')).toHaveStyle({ color: colors.orange });
  });

  it('edits a confirmed receipt from its detail screen without confirming it again', async () => {
    mockGetReceipt.mockResolvedValue(stored('confirmed'));
    mockMutate.mockImplementationOnce((_vars, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    useReceiptStore.getState().clearScanSession();
    renderReview();
    act(() => router.back());
    act(() => router.push({ pathname: '/review', params: { receiptId: 'r-2', edit: '1' } }));

    fireEvent.changeText(await screen.findByLabelText('Store'), 'Corner Market');
    save();

    // A second "confirmed" would dispatch ReceiptConfirmed again.
    expect(mockMutate).toHaveBeenCalledWith(
      { receiptId: 'r-2', updates: { store_name: 'Corner Market' } },
      expect.anything(),
    );
  });

  // L4: the sheet that edits a saved receipt says so; a new scan says Review.
  it('titles the sheet "Edit Receipt" when it edits a saved receipt', async () => {
    mockGetReceipt.mockResolvedValue(stored('confirmed'));
    useReceiptStore.getState().clearScanSession();
    renderReview();
    act(() => router.back());
    act(() => router.push({ pathname: '/review', params: { receiptId: 'r-2', edit: '1' } }));

    await screen.findByLabelText('Store');
    expect(headerTitles()).toContain('Edit Receipt');
    expect(headerTitles()).not.toContain('Review');
  });

  it('titles a new scan "Review"', () => {
    renderReview();

    expect(headerTitles()).toContain('Review');
  });

  it('shows a confirmed receipt read-only', async () => {
    mockGetReceipt.mockResolvedValue(stored('confirmed'));
    openFromHistory();

    expect(await screen.findByText('Done')).toBeTruthy();
    expect(screen.queryByLabelText('Save')).toBeNull();
    expect(screen.queryByLabelText('Receipt date')).toBeNull();
    expect(
      screen.queryByLabelText('Quantity of Organic Bananas')?.props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });
});

// Edge case 4 (11-edge-cases.md): a likely duplicate is flagged before saving.
describe('Review screen duplicate warning', () => {
  it('warns when the scan matches a receipt saved in the last 24 hours', () => {
    useReceiptStore.getState().setActiveScanResponse({ ...scan, duplicate_warning: true });
    renderReview();

    expect(screen.getByText('Possible duplicate')).toBeTruthy();
  });

  it('shows no warning for a new receipt', () => {
    renderReview();

    expect(screen.queryByText('Possible duplicate')).toBeNull();
  });
});

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

function headerTitles(): string[] {
  const titles: string[] = [];
  const walk = (node: HostNode | string): void => {
    if (typeof node === 'string') return;
    if (node.type === 'RNSScreenStackHeaderConfig') titles.push(String(node.props.title));
    node.children?.forEach(walk);
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  (Array.isArray(root) ? root : root ? [root] : []).forEach(walk);
  return titles;
}
