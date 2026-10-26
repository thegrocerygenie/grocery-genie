/**
 * RC-02 AC 1: each extracted field is editable on the review screen. An edit
 * goes out in the PATCH that confirms the scan; an untouched field does not.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import ReviewScreen from '../../app/review';
import { useReceiptStore } from '@/store/receiptStore';
import type { ReceiptResponse, ReceiptScanResponse } from '@/features/receipt-capture/types';

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

    expect(screen.getByText('Qty 2')).toBeTruthy();
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
