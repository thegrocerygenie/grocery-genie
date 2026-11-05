/**
 * Item detail as the V1.1 design draws it (DA-3, PI-01 AC 5–10): the range
 * control under the chart, the "Avg · 30d" headline, the shaded chart with
 * month labels and a dot per purchase, store squares, and large text.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';

import ItemDetailScreen from '../../app/items/[id]';
import { colors } from '@/constants/theme';
import type {
  ItemDetail,
  PriceComparison,
  PriceHistory,
  PricePoint,
} from '@/features/price-intelligence/types';
import { storeColor } from '@/features/price-intelligence/utils/storeColor';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('@/utils/today', () => ({ today: () => new Date(2026, 3, 20) }));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: { is_premium: true } }),
}));

const DEFAULT_SCALE = 1;
const AX5_SCALE = 3.571;
const mockWindow = { fontScale: DEFAULT_SCALE };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 667, scale: 2, fontScale: mockWindow.fontScale }),
}));

function point(date: string, price: number, store: string, inTimeline = true): PricePoint {
  return {
    receipt_id: `r-${date}`,
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

function history(observations: PricePoint[]): PriceHistory {
  return {
    item: { id: 'i-1', canonical_name: 'Avocado' },
    unit_of_measure: 'lb',
    currency: 'USD',
    has_timeline: observations.filter((p) => p.in_timeline).length >= 2,
    min_points: 2,
    store_count: new Set(observations.map((p) => p.store_id)).size,
    observations,
  };
}

const detail: ItemDetail = {
  id: 'i-1',
  canonical_name: 'Avocado',
  unit_of_measure: 'lb',
  observation_count: 5,
  store_count: 2,
  latest_price: null,
  aliases: [{ id: 'a-1', alias: 'AVOCADO' }],
  suggestions: [],
  alerts_muted: false,
};

// Five prices: two last year, three in the 3 months to Apr 20, 2026.
const ALL = [
  point('2025-06-01', 1.5, 'FreshCo'),
  point('2025-09-01', 1.8, 'Loblaws'),
  point('2026-02-10', 2, 'FreshCo'),
  point('2026-03-15', 2.2, 'Loblaws'),
  point('2026-04-15', 2.6, 'FreshCo'),
];

const mockApi = {
  getPriceHistory: jest.fn(),
  getPriceComparison: jest.fn(),
};
jest.mock('@/features/price-intelligence/services/itemsApi', () => ({
  getItem: async () => detail,
  getPriceHistory: (...a: unknown[]) => mockApi.getPriceHistory(...a),
  getPriceComparison: (...a: unknown[]) => mockApi.getPriceComparison(...a),
  listSuggestions: async () => [],
  getPriceAlertSettings: async () => ({
    enabled: true,
    threshold_percent: 10,
    default_threshold_percent: 10,
    cooldown_days: 7,
    muted_items: [],
    muted_stores: [],
  }),
}));

/** The item's full history, the one request item detail makes. */
function serve(observations: PricePoint[]) {
  mockApi.getPriceHistory.mockResolvedValue(history(observations));
}

const comparison: PriceComparison = {
  item: { id: 'i-1', canonical_name: 'Avocado' },
  unit_of_measure: 'lb',
  currency: 'USD',
  min_observations: 2,
  stores: [
    {
      store_id: 's-Loblaws',
      store_name: 'Loblaws',
      latest_price: 2.2,
      latest_date: '2026-03-15',
      avg_price: 2,
      observation_count: 2,
    },
    {
      store_id: 's-FreshCo',
      store_name: 'FreshCo',
      latest_price: 2.6,
      latest_date: '2026-04-15',
      avg_price: 2.03,
      observation_count: 3,
    },
  ],
  stores_below_minimum: 0,
};

function open() {
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
      'items/[id]': ItemDetailScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/items/i-1'));
}

/** Gives the chart a width, as the first layout does on a device. */
async function layOutChart() {
  const plot = await screen.findByTestId('price-plot');
  fireEvent(plot, 'layout', { nativeEvent: { layout: { width: 300, height: 160 } } });
}

beforeEach(() => {
  mockApi.getPriceHistory.mockReset();
  mockApi.getPriceComparison.mockReset();
  mockApi.getPriceComparison.mockResolvedValue(comparison);
  serve(ALL);
  mockWindow.fontScale = DEFAULT_SCALE;
});

describe('Range control (PI-01 AC 5)', () => {
  it('offers 1M to All under the chart with 3M selected, and plots only that range', async () => {
    open();

    const labels = ['1 month', '3 months', '6 months', '1 year', 'All prices'];
    for (const label of labels) {
      const button = await screen.findByLabelText(label);
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityState).toEqual({ selected: label === '3 months' });
    }
    expect((await screen.findByTestId('price-chart')).props.accessibilityLabel).toBe(
      'Price chart, 3 prices from $2.00 to $2.60, latest $2.60',
    );
    // The price list still has every price (AC 1).
    expect(screen.getByText('Prices · 5')).toBeTruthy();
  });

  it('follows the chosen range, and All plots every price', async () => {
    open();

    fireEvent.press(await screen.findByLabelText('1 year'));
    expect(screen.getByLabelText('1 year').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('3 months').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(screen.getByTestId('price-chart').props.accessibilityLabel).toMatch(
      /^Price chart, 5 prices/,
    );

    fireEvent.press(screen.getByLabelText('1 month'));
    expect(await screen.findByText('Not enough prices in this range')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('All prices'));
    expect((await screen.findByTestId('price-chart')).props.accessibilityLabel).toMatch(
      /^Price chart, 5 prices/,
    );
  });

  it('asks for the history once per open, and a range tap asks for nothing', async () => {
    open();

    fireEvent.press(await screen.findByLabelText('1 year'));
    fireEvent.press(screen.getByLabelText('1 month'));
    fireEvent.press(screen.getByLabelText('All prices'));
    await screen.findByTestId('price-chart');
    // One GET /prices, so one price_history_viewed, with no date filter.
    expect(mockApi.getPriceHistory).toHaveBeenCalledTimes(1);
    expect(mockApi.getPriceHistory).toHaveBeenCalledWith('i-1');
  });

  it('opens on the smallest range with prices when 3M has none', async () => {
    serve([point('2025-06-01', 1.5, 'FreshCo'), point('2025-09-01', 1.8, 'Loblaws')]);
    open();

    expect(await screen.findByTestId('price-chart')).toBeTruthy();
    expect(screen.getByLabelText('1 year').props.accessibilityState).toEqual({ selected: true });
  });

  it('opens on All when even 1Y has no prices', async () => {
    serve([point('2024-01-01', 1.5, 'FreshCo'), point('2024-06-01', 1.8, 'Loblaws')]);
    open();

    expect(await screen.findByTestId('price-chart')).toBeTruthy();
    expect(screen.getByLabelText('All prices').props.accessibilityState).toEqual({
      selected: true,
    });
  });
});

describe('A range with too few prices (PI-01 AC 6, edge case 8)', () => {
  it('says so instead of drawing a chart, with All one tap away', async () => {
    serve([point('2025-06-01', 1.5, 'FreshCo'), point('2026-04-15', 2.6, 'FreshCo')]);
    open();

    expect(await screen.findByText('Not enough prices in this range')).toBeTruthy();
    expect(screen.queryByTestId('price-chart')).toBeNull();
    fireEvent.press(screen.getByLabelText('Show all prices'));
    expect(await screen.findByTestId('price-chart')).toBeTruthy();
    expect(screen.getByLabelText('All prices').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('counts only like-for-like prices as plotted', async () => {
    serve([
      point('2026-03-01', 2, 'FreshCo'),
      { ...point('2026-04-01', 0.5, 'Loblaws', false), unit_of_measure: 'each' },
      point('2025-01-01', 1.5, 'FreshCo'),
    ]);
    open();

    expect(await screen.findByText('Not enough prices in this range')).toBeTruthy();
  });

  it('shows no range control for an item with fewer than 2 prices', async () => {
    serve([point('2026-04-15', 2.6, 'FreshCo')]);
    open();

    expect(await screen.findByText(/Buy it again/)).toBeTruthy();
    expect(screen.queryByLabelText('3 months')).toBeNull();
  });
});

describe('Headline "Avg · 30d" (PI-01 AC 7)', () => {
  it('shows the 30-day mean with its unit and a rise in red with a plus', async () => {
    open();

    expect(await screen.findByText('Avg · 30d')).toBeTruthy();
    // Apr 15 alone in the 30 days; Mar 15, 31 days before, in the 30 before that.
    expect(screen.getByTestId('headline-price').props.children).toBe('$2.60');
    expect(screen.getByText('/ lb')).toBeTruthy();
    const change = screen.getByTestId('headline-change');
    expect(change.props.children).toBe('+18%');
    expect(StyleSheet.flatten(change.props.style).color).toBe(colors.redText);
    // The latest price is 5 days old: no "as of".
    expect(screen.queryByText(/^as of /)).toBeNull();
  });

  it('adds as of the latest price date when it is more than 30 days old', async () => {
    serve([point('2026-01-05', 1.8, 'FreshCo'), point('2026-02-10', 2, 'FreshCo')]);
    open();

    expect((await screen.findByTestId('headline-price')).props.children).toBe('$2.00');
    expect(screen.getByText('as of Feb 10, 2026')).toBeTruthy();
  });

  it('shows a fall in green with a minus sign', async () => {
    serve([point('2026-03-01', 3, 'FreshCo'), point('2026-04-15', 2.4, 'FreshCo')]);
    open();

    const change = await screen.findByTestId('headline-change');
    expect(change.props.children).toBe('−20%');
    expect(StyleSheet.flatten(change.props.style).color).toBe(colors.greenText);
  });

  it('shows no percent with no price in the 30 days before', async () => {
    serve([point('2026-04-01', 2, 'FreshCo'), point('2026-04-15', 2.6, 'FreshCo')]);
    open();

    expect((await screen.findByTestId('headline-price')).props.children).toBe('$2.30');
    expect(screen.queryByTestId('headline-change')).toBeNull();
  });
});

describe('Chart (PI-01 AC 8)', () => {
  it('draws a shaded area under the line, month labels, and a dot per purchase', async () => {
    open();
    await layOutChart();

    expect(screen.getByTestId('price-area')).toBeTruthy();
    expect(screen.getByTestId('price-line')).toBeTruthy();
    expect(screen.getAllByTestId(/^price-dot-/)).toHaveLength(3);
    const months = within(screen.getByTestId('price-months'));
    expect(months.getByText('Mar')).toBeTruthy();
    expect(months.getByText('Apr')).toBeTruthy();
  });
});

describe('Store squares (PI-01 AC 9)', () => {
  it('leads each price row and comparison row with the store’s own colour', async () => {
    open();

    const fresh = storeColor('s-FreshCo');
    const priceSquares = await screen.findAllByTestId('store-square-s-FreshCo');
    // Three FreshCo prices in the list, and its row in Compare stores.
    expect(priceSquares).toHaveLength(4);
    for (const square of priceSquares) {
      expect(StyleSheet.flatten(square.props.style).backgroundColor).toBe(fresh);
    }
    const loblaws = screen.getAllByTestId('store-square-s-Loblaws');
    expect(StyleSheet.flatten(loblaws[0].props.style).backgroundColor).toBe(
      storeColor('s-Loblaws'),
    );
  });
});

describe('Largest text size (PI-01 AC 10)', () => {
  it('lets the range control wrap and keeps the headline price whole', async () => {
    mockWindow.fontScale = AX5_SCALE;
    open();

    const control = await screen.findByTestId('range-control');
    expect(StyleSheet.flatten(control.props.style).flexWrap).toBe('wrap');
    const headline = screen.getByTestId('headline-price');
    expect(headline.props.numberOfLines).toBe(1);
    expect(headline.props.adjustsFontSizeToFit).toBe(true);
    // Each price stacks under its date and store, never cut off (BUG-3).
    const row = screen.getByTestId('price-row-text-0');
    expect(within(row).getByText('$2.60/lb')).toBeTruthy();
  });
});
