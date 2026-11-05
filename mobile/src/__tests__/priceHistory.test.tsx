/**
 * V1.1 PI-01 price history and PI-02 item matching in the app: the Prices
 * list, an item's history and chart, its names (split), combining items,
 * confirming possible matches, and opening an item from a saved receipt.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, type AlertButton } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ItemDetailScreen from '../../app/items/[id]';
import PricesScreen from '../../app/items/index';
import MatchPromptScreen from '../../app/items/match';
import MatchesScreen from '../../app/items/matches';
import MergeScreen from '../../app/items/merge';
import ReceiptDetailScreen from '../../app/receipt/[id]';
import type {
  ItemDetail,
  ItemList,
  ItemSuggestion,
  PriceHistory,
  PricePoint,
} from '@/features/price-intelligence/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));
jest.mock('@/features/lifecycle/hooks/useLifecycle', () => ({
  useDeleteReceipt: () => ({ mutate: jest.fn(), isPending: false }),
}));
const mockGetReceipt = jest.fn();
jest.mock('@/features/receipt-capture/services/receiptApi', () => ({
  getReceipt: (id: string) => mockGetReceipt(id),
}));

const mockApi = {
  listItems: jest.fn(),
  getItem: jest.fn(),
  getPriceHistory: jest.fn(),
  renameItem: jest.fn(),
  mergeItem: jest.fn(),
  splitAlias: jest.fn(),
  getLinkCandidates: jest.fn(),
  listSuggestions: jest.fn(),
  acceptSuggestion: jest.fn(),
  rejectSuggestion: jest.fn(),
  getPriceComparison: jest.fn(),
  getPriceAlertSettings: jest.fn(),
};
jest.mock('@/features/price-intelligence/services/itemsApi', () => ({
  getPriceComparison: (...a: unknown[]) => mockApi.getPriceComparison(...a),
  getPriceAlertSettings: (...a: unknown[]) => mockApi.getPriceAlertSettings(...a),
  listItems: (...a: unknown[]) => mockApi.listItems(...a),
  getItem: (...a: unknown[]) => mockApi.getItem(...a),
  getPriceHistory: (...a: unknown[]) => mockApi.getPriceHistory(...a),
  renameItem: (...a: unknown[]) => mockApi.renameItem(...a),
  mergeItem: (...a: unknown[]) => mockApi.mergeItem(...a),
  splitAlias: (...a: unknown[]) => mockApi.splitAlias(...a),
  getLinkCandidates: (...a: unknown[]) => mockApi.getLinkCandidates(...a),
  listSuggestions: (...a: unknown[]) => mockApi.listSuggestions(...a),
  acceptSuggestion: (...a: unknown[]) => mockApi.acceptSuggestion(...a),
  rejectSuggestion: (...a: unknown[]) => mockApi.rejectSuggestion(...a),
}));

function point(date: string, price: number, store: string, inTimeline = true): PricePoint {
  return {
    receipt_id: `r-${date}`,
    line_item_id: `l-${date}`,
    line_name: 'Organic Bananas',
    date,
    store_id: `s-${store}`,
    store_name: store,
    unit_price: price,
    quantity: 1,
    unit_of_measure: 'lb',
    currency: 'USD',
    in_timeline: inTimeline,
  };
}

const suggestion: ItemSuggestion = {
  id: 'sg-1',
  item: { id: 'i-2', canonical_name: 'ORG BANANAS' },
  suggested_item: { id: 'i-1', canonical_name: 'Organic Bananas' },
  confidence: 0.84,
  method: 'fuzzy',
};

function detail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: 'i-1',
    canonical_name: 'Organic Bananas',
    unit_of_measure: 'lb',
    observation_count: 2,
    store_count: 2,
    latest_price: null,
    aliases: [
      { id: 'a-1', alias: 'Organic Bananas' },
      { id: 'a-2', alias: 'ORG BNNA' },
    ],
    suggestions: [],
    alerts_muted: false,
    ...overrides,
  };
}

function history(observations: PricePoint[]): PriceHistory {
  return {
    item: { id: 'i-1', canonical_name: 'Organic Bananas' },
    unit_of_measure: 'lb',
    currency: 'USD',
    has_timeline: observations.filter((p) => p.in_timeline).length >= 2,
    min_points: 2,
    store_count: new Set(observations.map((p) => p.store_id)).size,
    observations,
  };
}

function open(path: string) {
  const routerScreen = renderRouter(
    {
      _layout: () => (
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Stack />
        </QueryClientProvider>
      ),
      index: () => null,
      'items/index': PricesScreen,
      'items/[id]': ItemDetailScreen,
      'items/matches': MatchesScreen,
      'items/match': MatchPromptScreen,
      'items/merge': MergeScreen,
      'receipt/[id]': ReceiptDetailScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push(path));
  return routerScreen;
}

/** Presses the button named `choice` in the last Alert.alert call. */
function choose(alert: jest.SpyInstance, choice: string) {
  const buttons = alert.mock.calls[alert.mock.calls.length - 1][2] as AlertButton[];
  act(() => buttons.find((b) => b.text === choice)?.onPress?.());
}

beforeEach(() => {
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  mockApi.getItem.mockResolvedValue(detail());
  mockApi.getPriceHistory.mockResolvedValue(
    history([point('2026-03-01', 0.7, 'FreshCo'), point('2026-03-20', 0.77, 'Loblaws')]),
  );
  mockApi.listSuggestions.mockResolvedValue([]);
  mockApi.getPriceComparison.mockResolvedValue({
    item: { id: 'i-1', canonical_name: 'Organic Bananas' },
    unit_of_measure: 'lb',
    currency: 'USD',
    min_observations: 2,
    stores: [],
    stores_below_minimum: 2,
  });
  mockApi.getPriceAlertSettings.mockResolvedValue({
    enabled: true,
    threshold_percent: 10,
    default_threshold_percent: 10,
    cooldown_days: 7,
    muted_items: [],
    muted_stores: [],
  });
  jest.restoreAllMocks();
});

describe('Item price history (PI-01)', () => {
  it('shows every price with its date and store, newest first (AC 1)', async () => {
    open('/items/i-1');

    expect(await screen.findByText('Purchases · 2')).toBeTruthy();
    expect(mockApi.getPriceHistory).toHaveBeenCalledWith('i-1');
    expect(screen.getByText('Mar 20, 2026')).toBeTruthy();
    expect(screen.getByText('Mar 1, 2026')).toBeTruthy();
    expect(screen.getByText('FreshCo')).toBeTruthy();
    expect(screen.getByText('Loblaws')).toBeTruthy();
    const rows = screen.getAllByLabelText(/^Mar \d+, 2026, /);
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Mar 20, 2026, Loblaws, $0.77/lb',
      'Mar 1, 2026, FreshCo, $0.70/lb',
    ]);
  });

  it('plots a line chart once there are two prices (AC 2)', async () => {
    open('/items/i-1');

    const chart = await screen.findByTestId('price-chart');
    expect(chart.props.accessibilityLabel).toBe(
      'Price chart, 2 prices from $0.70 to $0.77, latest $0.77',
    );
    expect(screen.queryByText(/Buy it again/)).toBeNull();
  });

  it('shows unit prices in the list and the headline (AC 3)', async () => {
    open('/items/i-1');

    expect(await screen.findByText('$0.77/lb')).toBeTruthy();
    expect(screen.getByText('$0.70/lb')).toBeTruthy();
    // The headline's 30-day average is per lb too, and names the latest price.
    expect(screen.getByText('/ lb')).toBeTruthy();
    expect(screen.getByText('Latest $0.77/lb · Loblaws · Mar 20, 2026')).toBeTruthy();
  });

  it('waits for a second price before showing a trend (AC 4)', async () => {
    mockApi.getPriceHistory.mockResolvedValue(history([point('2026-03-01', 0.7, 'FreshCo')]));
    open('/items/i-1');

    expect(
      await screen.findByText('Buy it again to see its price trend. A trend needs 2 prices.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('price-chart')).toBeNull();
    expect(screen.queryByTestId('headline-change')).toBeNull();
  });

  it('lists a price in another unit but leaves it out of the chart', async () => {
    mockApi.getPriceHistory.mockResolvedValue(
      history([
        point('2026-03-01', 0.7, 'FreshCo'),
        point('2026-03-05', 0.72, 'FreshCo'),
        { ...point('2026-03-09', 0.25, 'Loblaws', false), unit_of_measure: 'each' },
      ]),
    );
    open('/items/i-1');

    expect(await screen.findByText('Loblaws · Not in chart: another unit')).toBeTruthy();
    expect((await screen.findByTestId('price-chart')).props.accessibilityLabel).toBe(
      'Price chart, 2 prices from $0.70 to $0.72, latest $0.72',
    );
  });

  it('offers a retry when the item cannot load', async () => {
    mockApi.getItem.mockRejectedValue(new Error('offline'));
    open('/items/i-1');

    expect(await screen.findByText('Couldn’t load this item')).toBeTruthy();
    mockApi.getItem.mockResolvedValue(detail());
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Purchases · 2')).toBeTruthy();
  });
});

describe('Item names and combining (PI-02 AC 3)', () => {
  it('splits a name off into its own item after confirming', async () => {
    mockApi.splitAlias.mockResolvedValue(detail({ id: 'i-9', canonical_name: 'ORG BNNA' }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    open('/items/i-1');

    fireEvent.press(await screen.findByLabelText('Split off ORG BNNA'));
    expect(alert.mock.calls[0][0]).toBe('Split off “ORG BNNA”?');
    choose(alert, 'Split Off');

    await waitFor(() => expect(mockApi.splitAlias).toHaveBeenCalledWith('i-1', 'a-2'));
  });

  it('offers no split when the item has a single name', async () => {
    mockApi.getItem.mockResolvedValue(
      detail({ aliases: [{ id: 'a-1', alias: 'Organic Bananas' }] }),
    );
    open('/items/i-1');

    expect(await screen.findByText('Names on receipts')).toBeTruthy();
    expect(screen.queryByText('Split Off')).toBeNull();
  });

  it('renames the item', async () => {
    mockApi.renameItem.mockResolvedValue(detail({ canonical_name: 'Bananas' }));
    const prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => {});
    open('/items/i-1');
    await screen.findByText('Purchases · 2');

    fireEvent.press(screen.getByLabelText('Rename item'));
    const buttons = prompt.mock.calls[0][2] as AlertButton[];
    act(() => (buttons[1].onPress as (v: string) => void)('  Bananas '));

    await waitFor(() => expect(mockApi.renameItem).toHaveBeenCalledWith('i-1', 'Bananas'));
  });

  it('combines the item into another one and opens the result', async () => {
    mockApi.getLinkCandidates.mockResolvedValue({
      suggested: [],
      items: [
        {
          id: 'i-3',
          canonical_name: 'Bananas',
          unit_of_measure: 'lb',
          observation_count: 4,
          store_count: 1,
          latest_price: null,
          avg_unit_price: 0.69,
        },
      ],
    });
    mockApi.mergeItem.mockResolvedValue(detail({ id: 'i-3', canonical_name: 'Bananas' }));
    const routerScreen = open('/items/i-1');

    // PI-02 AC 15 (DA-6): the Link items sheet.
    fireEvent.press(await screen.findByLabelText('Link Items…'));
    expect(routerScreen.getPathname()).toBe('/items/merge');
    fireEvent.press(await screen.findByLabelText('Bananas, 4 purchases · $0.69 avg'));
    fireEvent.press(screen.getByLabelText('Link the items'));

    await waitFor(() => expect(mockApi.mergeItem).toHaveBeenCalledWith('i-1', 'i-3'));
    await waitFor(() => expect(routerScreen.getPathname()).toBe('/items/i-3'));
  });
});

describe('Possible matches (PI-02 AC 2)', () => {
  it('asks on the item and merges when the user says Yes, merge', async () => {
    mockApi.getItem.mockResolvedValue(
      detail({ id: 'i-2', canonical_name: 'ORG BANANAS', suggestions: [suggestion] }),
    );
    mockApi.listSuggestions.mockResolvedValue([suggestion]);
    mockApi.acceptSuggestion.mockResolvedValue(detail());
    const routerScreen = open('/items/i-2');

    expect(await screen.findByText('Is “ORG BANANAS” the same as “Organic Bananas”?')).toBeTruthy();
    // PI-02 AC 7: the card opens the "Same item?" prompt, where Yes merges.
    fireEvent.press(
      screen.getByLabelText('Review whether ORG BANANAS is the same as Organic Bananas'),
    );
    fireEvent.press(await screen.findByLabelText('Yes, merge ORG BANANAS into Organic Bananas'));

    await waitFor(() => expect(mockApi.acceptSuggestion).toHaveBeenCalledWith('sg-1'));
    // The asked-about item is gone; the screen shows the combined one.
    await waitFor(() => expect(routerScreen.getPathname()).toBe('/items/i-1'));
  });

  it('keeps them apart when the user says Keep as separate item', async () => {
    mockApi.listSuggestions.mockResolvedValue([suggestion]);
    mockApi.rejectSuggestion.mockResolvedValue(undefined);
    open('/items/matches');

    fireEvent.press(
      await screen.findByLabelText('Review whether ORG BANANAS is the same as Organic Bananas'),
    );
    fireEvent.press(await screen.findByLabelText('Keep ORG BANANAS as a separate item'));

    await waitFor(() => expect(mockApi.rejectSuggestion).toHaveBeenCalledWith('sg-1'));
    expect(mockApi.acceptSuggestion).not.toHaveBeenCalled();
  });
});

describe('Prices list', () => {
  const list: ItemList = {
    items: [
      {
        id: 'i-1',
        canonical_name: 'Organic Bananas',
        unit_of_measure: 'lb',
        observation_count: 3,
        store_count: 2,
        latest_price: {
          unit_price: 0.77,
          unit_of_measure: 'lb',
          currency: 'USD',
          date: '2026-03-20',
          store_name: 'Loblaws',
        },
      },
    ],
    total: 1,
    page: 1,
    per_page: 100,
    pending_suggestions: 2,
  };

  it('lists items with their latest unit price and opens one', async () => {
    mockApi.listItems.mockResolvedValue(list);
    const routerScreen = open('/items');

    const row = await screen.findByLabelText('Organic Bananas, $0.77/lb, 3 prices · 2 stores');
    expect(screen.getByText('$0.77/lb')).toBeTruthy();
    fireEvent.press(row);

    expect(routerScreen.getPathname()).toBe('/items/i-1');
  });

  it('points to the matches waiting for review', async () => {
    mockApi.listItems.mockResolvedValue(list);
    mockApi.listSuggestions.mockResolvedValue([suggestion]);
    const routerScreen = open('/items');

    fireEvent.press(await screen.findByLabelText('2 possible matches to review'));

    expect(routerScreen.getPathname()).toBe('/items/matches');
  });

  it('explains an empty list', async () => {
    mockApi.listItems.mockResolvedValue({ ...list, items: [], total: 0, pending_suggestions: 0 });
    open('/items');

    expect(await screen.findByText('No prices yet')).toBeTruthy();
    expect(screen.queryByText(/possible match/)).toBeNull();
  });
});

describe('Receipt detail', () => {
  it('opens the price history of a confirmed line', async () => {
    mockGetReceipt.mockResolvedValue({
      id: 'r-1',
      user_id: 'u-1',
      store_name: 'FreshCo',
      date: '2026-03-20',
      subtotal: null,
      tax: null,
      total: 0.77,
      currency: 'USD',
      image_url: null,
      extraction_confidence: 0.95,
      store_name_confidence: 0.95,
      date_confidence: 0.95,
      total_confidence: 0.95,
      status: 'confirmed',
      items: [
        {
          id: 'l-1',
          raw_name: 'ORG BNNA',
          quantity: 1,
          unit_price: 0.77,
          total_price: 0.77,
          unit_of_measure: 'lb',
          category_id: null,
          category_confidence: null,
          extraction_confidence: 0.95,
          corrected: false,
          canonical_item_id: 'i-1',
        },
        {
          id: 'l-2',
          raw_name: 'Bag fee',
          quantity: 1,
          unit_price: 0.1,
          total_price: 0.1,
          unit_of_measure: null,
          category_id: null,
          category_confidence: null,
          extraction_confidence: 0.95,
          corrected: false,
          canonical_item_id: null,
        },
      ],
      created_at: null,
    });
    const routerScreen = open('/receipt/r-1');

    fireEvent.press(await screen.findByLabelText('ORG BNNA, $0.77'));

    expect(routerScreen.getPathname()).toBe('/items/i-1');
    expect(screen.queryByLabelText('Bag fee, $0.10')).toBeNull();
  });
});
