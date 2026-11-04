/**
 * Prices and item detail at accessibility text sizes (device check 2026-11-03,
 * BUG-3). On the iPhone SE at AX5 the item names collapsed to "Or...", the
 * counts wrapped a word a line beside the price, "$4.79" split over two lines
 * and the Rename button was clipped. At accessibility sizes a row stacks its
 * price under the name, as the dashboard's category rows do. Jest has no
 * layout engine, so this checks the props; the Simulator recheck draws it.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen, within } from 'expo-router/testing-library';

import ItemDetailScreen from '../../app/items/[id]';
import PricesScreen from '../../app/items/index';
import { fontScale } from '@/constants/theme';
import type { ItemDetail, PriceHistory, PricePoint } from '@/features/price-intelligence/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// React Native's iOS font scale at the default size and at AX5.
const DEFAULT_SCALE = 1;
const AX5_SCALE = 3.571;
const mockWindow = { fontScale: DEFAULT_SCALE };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 667, scale: 2, fontScale: mockWindow.fontScale }),
}));

function point(date: string, price: number, store: string): PricePoint {
  return {
    receipt_id: `r-${date}`,
    date,
    store_id: `s-${store}`,
    store_name: store,
    unit_price: price,
    quantity: 1,
    unit_of_measure: null,
    currency: 'USD',
    in_timeline: true,
  };
}

const mockDetail: ItemDetail = {
  id: 'i-1',
  canonical_name: 'Organic Bananas',
  unit_of_measure: null,
  observation_count: 2,
  store_count: 2,
  latest_price: null,
  aliases: [{ id: 'a-1', alias: 'Organic Bananas' }],
  suggestions: [],
  alerts_muted: false,
};

const mockHistory: PriceHistory = {
  item: { id: 'i-1', canonical_name: 'Organic Bananas' },
  unit_of_measure: null,
  currency: 'USD',
  has_timeline: true,
  min_points: 2,
  store_count: 2,
  observations: [point('2026-03-01', 4.29, 'FreshCo'), point('2026-03-20', 4.79, 'Loblaws')],
};

jest.mock('@/features/price-intelligence/services/itemsApi', () => ({
  listItems: async () => ({
    items: [
      {
        id: 'i-1',
        canonical_name: 'Organic Bananas',
        unit_of_measure: null,
        observation_count: 1,
        store_count: 1,
        latest_price: {
          unit_price: 4.79,
          unit_of_measure: null,
          currency: 'USD',
          date: '2026-03-20',
          store_name: 'Loblaws',
        },
      },
    ],
    total: 1,
    page: 1,
    per_page: 50,
    pending_suggestions: 0,
  }),
  getItem: async () => mockDetail,
  getPriceHistory: async () => mockHistory,
  listSuggestions: async () => [],
  getPriceComparison: async () => ({
    item: { id: 'i-1', canonical_name: 'Organic Bananas' },
    unit_of_measure: null,
    currency: 'USD',
    min_observations: 2,
    stores: [],
    stores_below_minimum: 2,
  }),
  getPriceAlertSettings: async () => ({
    enabled: true,
    threshold_percent: 10,
    default_threshold_percent: 10,
    cooldown_days: 7,
    muted_items: [],
    muted_stores: [],
  }),
}));

function open(path: string) {
  renderRouter(
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
    },
    { initialUrl: '/' },
  );
  act(() => router.push(path));
}

afterEach(() => {
  mockWindow.fontScale = DEFAULT_SCALE;
});

describe('Prices list at large text sizes (BUG-3)', () => {
  it('keeps the name, counts and price side by side at the default size', async () => {
    open('/items');

    const name = await screen.findByTestId('item-name-i-1');
    expect(name.props.numberOfLines).toBe(1);
    expect(within(screen.getByTestId('item-text-i-1')).queryByText('$4.79')).toBeNull();
  });

  it('stacks the price under the name at AX5, and lets the name wrap', async () => {
    mockWindow.fontScale = AX5_SCALE;
    open('/items');

    const name = await screen.findByTestId('item-name-i-1');
    expect(name.props.numberOfLines).toBeUndefined();
    expect(within(screen.getByTestId('item-text-i-1')).getByText('$4.79')).toBeTruthy();
  });
});

describe('Item detail at large text sizes (BUG-3)', () => {
  it('keeps the latest price on one line, shrinking it to fit', async () => {
    mockWindow.fontScale = AX5_SCALE;
    open('/items/i-1');

    const latest = await screen.findByTestId('latest-price');
    expect(latest.props.children).toBe('$4.79');
    expect(latest.props.numberOfLines).toBe(1);
    expect(latest.props.adjustsFontSizeToFit).toBe(true);
  });

  it('stacks each price under its date and store at AX5', async () => {
    mockWindow.fontScale = AX5_SCALE;
    open('/items/i-1');

    // Newest first: row 1 is the older $4.29 from FreshCo.
    const text = await screen.findByTestId('price-row-text-1');
    expect(within(text).getByText('$4.29')).toBeTruthy();
  });

  it('caps the Rename header button at the size a native bar button stops growing', async () => {
    open('/items/i-1');

    const rename = await screen.findByText('Rename');
    expect(rename.props.maxFontSizeMultiplier).toBe(fontScale.headerButtonMax);
  });
});
