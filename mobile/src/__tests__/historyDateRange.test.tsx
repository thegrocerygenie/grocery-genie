/**
 * RC-04 AC 4: search history by date range. Week, Month and All are presets;
 * Custom picks any range with two date pickers.
 */
import React from 'react';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import HistoryScreen from '../../app/(tabs)/history/index';
import type { ReceiptResponse } from '@/features/receipt-capture/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncNow: () => jest.fn() }));
// Plain views that keep their props, so a test can pick a segment or a date.
jest.mock('@react-native-segmented-control/segmented-control', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return function MockSegmented(props: object) {
    return <MockView testID="history-range" {...props} />;
  };
});
jest.mock('@react-native-community/datetimepicker', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return function MockDateTimePicker(props: object) {
    return <MockView {...props} />;
  };
});
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

const mockUseReceipts = jest.fn();
jest.mock('@/features/receipt-capture/hooks/useReceipts', () => ({
  useReceipts: (params: unknown) => {
    mockUseReceipts(params);
    return {
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
    };
  },
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

// The screen reads the real clock, so the expected dates do too.
const now = new Date();
const TODAY = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const MONTH_START = new Date(now.getFullYear(), now.getMonth(), 1);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

beforeEach(() => {
  mockUseReceipts.mockClear();
});

function lastQuery() {
  return mockUseReceipts.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

function pickSegment(index: number) {
  fireEvent(screen.getByTestId('history-range'), 'onChange', {
    nativeEvent: { selectedSegmentIndex: index },
  });
}

it('offers Custom beside the presets', () => {
  renderHistory();

  expect(screen.getByTestId('history-range').props.values).toEqual([
    'Week',
    'Month',
    'All',
    'Custom',
  ]);
});

it('shows From and To pickers for Custom, starting at this month to today', () => {
  renderHistory();
  expect(screen.queryByLabelText('From date')).toBeNull();

  pickSegment(3);

  expect(screen.getByLabelText('From date').props.value).toEqual(MONTH_START);
  expect(screen.getByLabelText('To date').props.value).toEqual(TODAY);
  expect(lastQuery()).toMatchObject({ from_date: iso(MONTH_START), to_date: iso(TODAY) });
});

it('searches the range the user picks', () => {
  renderHistory();
  pickSegment(3);

  fireEvent(screen.getByLabelText('From date'), 'onChange', { type: 'set' }, new Date(2026, 0, 5));
  fireEvent(screen.getByLabelText('To date'), 'onChange', { type: 'set' }, new Date(2026, 1, 10));

  expect(lastQuery()).toMatchObject({ from_date: '2026-01-05', to_date: '2026-02-10', page: 1 });
});

it('keeps To on or after From, and both no later than today', () => {
  renderHistory();
  pickSegment(3);
  fireEvent(screen.getByLabelText('From date'), 'onChange', { type: 'set' }, new Date(2026, 1, 1));

  const to = screen.getByLabelText('To date');
  expect(to.props.minimumDate).toEqual(new Date(2026, 1, 1));
  expect(to.props.maximumDate).toEqual(TODAY);
  expect(screen.getByLabelText('From date').props.maximumDate).toEqual(TODAY);
});

it('drops the custom range when a preset is picked again', () => {
  renderHistory();
  pickSegment(3);
  pickSegment(2); // All

  expect(screen.queryByLabelText('From date')).toBeNull();
  expect(lastQuery().from_date).toBeUndefined();
  expect(lastQuery().to_date).toBeUndefined();
});
