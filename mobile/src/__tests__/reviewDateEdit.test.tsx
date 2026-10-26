/**
 * RC-02 AC 1: the receipt date is editable on the review screen. The edited
 * date goes out in the PATCH that confirms the scan.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import ReviewScreen from '../../app/review';
import { useReceiptStore } from '@/store/receiptStore';
import type { ReceiptScanResponse } from '@/features/receipt-capture/types';

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
  renderRouter(
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
}

describe('Review screen date edit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useReceiptStore.getState().setActiveScanResponse(scan);
  });

  afterEach(() => {
    useReceiptStore.getState().clearScanSession();
  });

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
    fireEvent.press(screen.getByLabelText('Save'));

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

    fireEvent.press(screen.getByLabelText('Save'));

    expect(mockMutate).toHaveBeenCalledWith(
      { receiptId: 'r-1', updates: { status: 'confirmed' } },
      expect.anything(),
    );
  });
});
