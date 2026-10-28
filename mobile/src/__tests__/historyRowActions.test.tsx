/**
 * L6: a History row deletes by swipe (and VoiceOver's Delete action), not
 * only by long-press.
 */
import React from 'react';
import { Alert, StyleSheet, type AlertButton } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import HistoryScreen from '../../app/(tabs)/history/index';
import type { LineItemResponse, ReceiptResponse } from '@/features/receipt-capture/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncNow: () => jest.fn() }));
jest.mock('@react-native-segmented-control/segmented-control', () => () => null);
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));
const mockDelete = jest.fn();
jest.mock('@/features/lifecycle/hooks/useLifecycle', () => ({
  useDeleteReceipt: () => ({ mutateAsync: mockDelete }),
}));
jest.mock('@/features/receipt-capture/hooks/useReceiptImport', () => ({
  useReceiptImport: () => ({ importFrom: jest.fn(), progress: null }),
}));

function lineItem(id: string): LineItemResponse {
  return {
    id,
    raw_name: `Item ${id}`,
    quantity: 1,
    unit_price: 2,
    total_price: 2,
    unit_of_measure: null,
    category_id: null,
    category_confidence: null,
    extraction_confidence: null,
    corrected: false,
  };
}

function mockReceipt(id: string, store: string, itemCount: number): ReceiptResponse {
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
    status: 'confirmed',
    items: Array.from({ length: itemCount }, (_, i) => lineItem(`${id}-${i}`)),
    created_at: null,
  };
}

jest.mock('@/features/receipt-capture/hooks/useReceipts', () => ({
  useReceipts: () => ({
    data: {
      items: [mockReceipt('r-1', 'No Frills', 1), mockReceipt('r-2', 'Metro', 3)],
      total: 2,
      page: 1,
      per_page: 20,
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

function renderHistory() {
  renderRouter(
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
}

function confirmDelete(alert: jest.SpyInstance) {
  expect(alert).toHaveBeenCalledWith(
    'Delete receipt?',
    'No Frills will be moved to Recently Deleted (30 days to restore).',
    expect.any(Array),
  );
  const buttons = alert.mock.calls[0][2] as AlertButton[];
  act(() => buttons.find((b) => b.text === 'Delete')?.onPress?.());
}

beforeEach(() => mockDelete.mockReset().mockResolvedValue(undefined));

it('deletes from the swipe action after confirming (L6)', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderHistory();

  fireEvent.press(screen.getByLabelText('Delete No Frills'));

  confirmDelete(alert);
  expect(mockDelete).toHaveBeenCalledWith('r-1');
  alert.mockRestore();
});

it('offers Delete as a VoiceOver action on the row (L6)', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderHistory();

  const row = screen.getByLabelText(/^No Frills,/);
  expect(row.props.accessibilityActions).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'delete' })]),
  );
  fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

  confirmDelete(alert);
  expect(mockDelete).toHaveBeenCalledWith('r-1');
  alert.mockRestore();
});

// The swipeable's container is a Reanimated view, which throws on an adaptive
// (DynamicColorIOS / PlatformColor) color. Jest's mock doesn't animate, so
// check the props: no object colors reach the container.
it('passes no adaptive colors to the animated swipe container', () => {
  renderHistory();

  const swipeables = screen.UNSAFE_getAllByType(ReanimatedSwipeable);
  expect(swipeables.length).toBeGreaterThan(0);
  for (const s of swipeables) {
    const flat = StyleSheet.flatten(s.props.containerStyle) ?? {};
    const objectColors = Object.entries(flat).filter(
      ([key, value]) => /color/i.test(key) && typeof value === 'object',
    );
    expect(objectColors).toEqual([]);
  }
});
