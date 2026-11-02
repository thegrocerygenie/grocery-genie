/**
 * A receipt in another currency (MVP rule, 2026-11-02): History shows it in
 * its own currency and marks it "Not in budget".
 */
import React from 'react';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import HistoryScreen from '../../app/(tabs)/history/index';
import type { ReceiptResponse } from '@/features/receipt-capture/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncNow: () => jest.fn() }));
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

function mockReceipt(id: string, store: string, status: string, currency = 'USD'): ReceiptResponse {
  return {
    id,
    user_id: 'u-1',
    store_name: store,
    date: '2026-03-12',
    subtotal: 10,
    tax: null,
    total: 10,
    currency,
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
        mockReceipt('r-usd', 'Corner Market', 'confirmed'),
        mockReceipt('r-eur', 'Café Paris', 'confirmed', 'EUR'),
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

it('shows each receipt in its own currency', () => {
  renderHistory();

  expect(screen.getByText('$10.00')).toBeTruthy();
  expect(screen.getByText('€10.00')).toBeTruthy();
});

it('marks only the receipt in another currency "Not in budget"', () => {
  renderHistory();

  expect(screen.getByText('Mar 12 · 0 items · Not in budget')).toBeTruthy();
  expect(screen.getByText('Mar 12 · 0 items')).toBeTruthy();
  expect(screen.getByLabelText(/^Café Paris, .*Not in budget, €10\.00$/)).toBeTruthy();
});
