/**
 * A scan the user has not confirmed yet (status pending_review) stays in
 * History as "Needs review", and tapping it opens review for that receipt.
 */
import React from 'react';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import HistoryScreen from '../../app/(tabs)/history/index';
import type { ReceiptResponse } from '@/features/receipt-capture/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-segmented-control/segmented-control', () => () => null);
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));
jest.mock('@/features/lifecycle/hooks/useLifecycle', () => ({
  useDeleteReceipt: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/receipt-capture/hooks/useReceiptImport', () => ({
  useReceiptImport: () => ({ importFrom: jest.fn(), progress: null }),
}));

function mockReceipt(id: string, store: string, status: string): ReceiptResponse {
  return {
    id,
    user_id: 'u-1',
    store_name: store,
    date: '2026-03-12',
    subtotal: 10,
    tax: null,
    total: 10,
    currency: 'USD',
    image_url: null,
    extraction_confidence: 0.9,
    store_name_confidence: null,
    date_confidence: null,
    total_confidence: null,
    status,
    items: [],
    created_at: null,
  };
}

jest.mock('@/features/receipt-capture/hooks/useReceipts', () => ({
  useReceipts: () => ({
    data: {
      items: [
        mockReceipt('r-pending', 'Corner Market', 'pending_review'),
        mockReceipt('r-done', 'No Frills', 'confirmed'),
      ],
      total: 2,
      page: 1,
      per_page: 20,
    },
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));

function renderHistory() {
  const routerScreen = renderRouter(
    {
      _layout: () => <Stack />,
      index: () => null,
      history: HistoryScreen,
      review: () => null,
      'receipt/[id]': () => null,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/history'));
  return routerScreen;
}

describe('History lists unconfirmed scans as needing review', () => {
  it('labels an unconfirmed scan "Needs review" and a confirmed one with its date', () => {
    renderHistory();

    expect(screen.getByText('Needs review')).toBeTruthy();
    expect(screen.getByText('Mar 12 · 0 items')).toBeTruthy();
    expect(screen.queryByText('Pending sync')).toBeNull();
  });

  it('opens review for the unconfirmed scan', () => {
    const routerScreen = renderHistory();

    fireEvent.press(screen.getByLabelText(/^Corner Market, Needs review/));

    expect(routerScreen.getPathname()).toBe('/review');
    expect(routerScreen.getSearchParams()).toEqual({ receiptId: 'r-pending' });
  });

  it('opens the read-only detail for a confirmed receipt', () => {
    const routerScreen = renderHistory();

    fireEvent.press(screen.getByLabelText(/^No Frills,/));

    expect(routerScreen.getPathname()).toBe('/receipt/r-done');
  });
});
