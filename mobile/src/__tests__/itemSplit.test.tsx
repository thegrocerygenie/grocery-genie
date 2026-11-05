/**
 * V1.1 PI-02 AC 10-15 (DA-6): split an item by line, the unit-price warning,
 * and the Link items sheet.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActionSheetIOS, Alert, type AlertButton } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ItemDetailScreen from '../../app/items/[id]';
import LinkItemsScreen from '../../app/items/merge';
import SplitScreen from '../../app/items/split';
import type {
  ItemDetail,
  ItemSummary,
  PriceHistory,
  PricePoint,
} from '@/features/price-intelligence/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

const mockApi = {
  getItem: jest.fn(),
  getPriceHistory: jest.fn(),
  splitItem: jest.fn(),
  mergeItem: jest.fn(),
  getLinkCandidates: jest.fn(),
  getPriceComparison: jest.fn(),
  getPriceAlertSettings: jest.fn(),
};
jest.mock('@/features/price-intelligence/services/itemsApi', () => ({
  getItem: (...a: unknown[]) => mockApi.getItem(...a),
  getPriceHistory: (...a: unknown[]) => mockApi.getPriceHistory(...a),
  splitItem: (...a: unknown[]) => mockApi.splitItem(...a),
  mergeItem: (...a: unknown[]) => mockApi.mergeItem(...a),
  getLinkCandidates: (...a: unknown[]) => mockApi.getLinkCandidates(...a),
  getPriceComparison: (...a: unknown[]) => mockApi.getPriceComparison(...a),
  getPriceAlertSettings: (...a: unknown[]) => mockApi.getPriceAlertSettings(...a),
}));

function point(id: string, date: string, price: number, store = 'FreshCo'): PricePoint {
  return {
    receipt_id: `r-${id}`,
    line_item_id: id,
    line_name: 'OLIVE OIL',
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

function history(observations: PricePoint[]): PriceHistory {
  return {
    item: { id: 'i-1', canonical_name: 'Olive oil' },
    unit_of_measure: null,
    currency: 'USD',
    has_timeline: observations.length >= 2,
    min_points: 2,
    store_count: 2,
    observations,
  };
}

function summary(id: string, name: string, count: number, avg: number | null): ItemSummary {
  return {
    id,
    canonical_name: name,
    unit_of_measure: null,
    observation_count: count,
    store_count: 1,
    latest_price: null,
    avg_unit_price: avg,
  };
}

function detail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    ...summary('i-1', 'Olive oil', 3, 16.16),
    aliases: [{ id: 'a-1', alias: 'OLIVE OIL' }],
    suggestions: [],
    alerts_muted: false,
    ...overrides,
  };
}

// Oldest first, as the API sends them; the screens list newest first.
const OIL = [
  point('l-1', '2026-03-01', 11.49),
  point('l-2', '2026-03-08', 11.99, 'Loblaws'),
  point('l-3', '2026-03-15', 24.99),
];

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
      'items/[id]': ItemDetailScreen,
      'items/split': SplitScreen,
      'items/merge': LinkItemsScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push(path));
  return routerScreen;
}

beforeEach(() => {
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  mockApi.getItem.mockResolvedValue(detail());
  mockApi.getPriceHistory.mockResolvedValue(history(OIL));
  mockApi.getPriceComparison.mockResolvedValue({
    item: { id: 'i-1', canonical_name: 'Olive oil' },
    unit_of_measure: null,
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

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

/** The native header config of the screen titled `title` (itemBackTitle.test). */
function headerFor(title: string): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  const walk = (node: HostNode | string): void => {
    if (typeof node === 'string') return;
    if (node.type === 'RNSScreenStackHeaderConfig' && node.props.title === title) {
      found = node.props;
    }
    node.children?.forEach(walk);
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  (Array.isArray(root) ? root : root ? [root] : []).forEach(walk);
  return found;
}

/** Presses the button named `choice` in the last Alert.alert call. */
function choose(alert: jest.SpyInstance, choice: string) {
  const buttons = alert.mock.calls[alert.mock.calls.length - 1][2] as AlertButton[];
  act(() => buttons.find((b) => b.text === choice)?.onPress?.());
}

const WARNING =
  'We grouped these as one item but the unit price varies a lot. Split if these are different products.';

describe('Split by line (PI-02 AC 10-13)', () => {
  it('opens Split into 2 items with the original and its lines (AC 10)', async () => {
    const routerScreen = open('/items/i-1');

    fireEvent.press(await screen.findByLabelText('Split Into Separate Items…'));

    expect(routerScreen.getPathname()).toBe('/items/split');
    await waitFor(() => expect(headerFor('Split into 2 items')).toBeDefined());
    expect(await screen.findByTestId('split-original-stats')).toBeTruthy();
    expect(screen.getByTestId('split-original-stats').props.children).toBe(
      '3 purchases · $16.16 avg',
    );
    expect(
      screen.getByLabelText('Mar 15, 2026, FreshCo, $24.99, OLIVE OIL, in Olive oil'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Mar 1, 2026, FreshCo, $11.49, OLIVE OIL, in Olive oil'),
    ).toBeTruthy();
  });

  it('offers no split for an item with one purchase (EC-PI 6)', async () => {
    mockApi.getPriceHistory.mockResolvedValue(history([OIL[0]]));
    open('/items/i-1');

    expect(await screen.findByText('Names on receipts')).toBeTruthy();
    expect(screen.queryByLabelText('Split Into Separate Items…')).toBeNull();
  });

  it('moves one of several lines sharing a name, naming the new item from it (AC 10, 11)', async () => {
    open('/items/split?id=i-1');

    fireEvent.press(
      await screen.findByLabelText('Mar 15, 2026, FreshCo, $24.99, OLIVE OIL, in Olive oil'),
    );

    expect(screen.getByLabelText('Name of new item 1').props.value).toBe('OLIVE OIL');
    expect(screen.getByTestId('split-new-stats-0').props.children).toBe('1 purchase · $24.99 avg');
    expect(screen.getByTestId('split-original-stats').props.children).toBe(
      '2 purchases · $11.74 avg',
    );
    expect(
      screen.getByLabelText('Mar 15, 2026, FreshCo, $24.99, OLIVE OIL, in OLIVE OIL'),
    ).toBeTruthy();
  });

  it('enables Save once the new item has a name and a line and the original keeps one (AC 11)', async () => {
    open('/items/split?id=i-1');
    const first = await screen.findByLabelText(
      'Mar 15, 2026, FreshCo, $24.99, OLIVE OIL, in Olive oil',
    );
    expect(screen.getByLabelText('Save the split').props.accessibilityState).toEqual({
      disabled: true,
    });

    fireEvent.press(first);
    expect(screen.getByLabelText('Save the split').props.accessibilityState).toEqual({
      disabled: false,
    });

    fireEvent.changeText(screen.getByLabelText('Name of new item 1'), '  ');
    expect(screen.getByLabelText('Save the split').props.accessibilityState).toEqual({
      disabled: true,
    });
    fireEvent.changeText(screen.getByLabelText('Name of new item 1'), 'Olive oil 3L');

    // Every line moved: the original would keep none.
    fireEvent.press(screen.getByLabelText(/^Mar 8, 2026, Loblaws/));
    fireEvent.press(screen.getByLabelText(/^Mar 1, 2026, FreshCo/));
    expect(screen.getByLabelText('Save the split').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it('Add another split makes it Split into 3 items and lines pick their item (AC 11)', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    open('/items/split?id=i-1');
    fireEvent.press(
      await screen.findByLabelText('Mar 15, 2026, FreshCo, $24.99, OLIVE OIL, in Olive oil'),
    );
    fireEvent.changeText(screen.getByLabelText('Name of new item 1'), 'Olive oil 3L');

    fireEvent.press(screen.getByLabelText('Add another split'));

    await waitFor(() => expect(headerFor('Split into 3 items')).toBeDefined());
    expect(screen.getByLabelText('Save the split').props.accessibilityState).toEqual({
      disabled: true,
    });
    fireEvent.press(screen.getByLabelText(/^Mar 8, 2026, Loblaws/));
    const [options, choose] = sheet.mock.calls[0];
    expect(options.options).toEqual(['Olive oil', 'Olive oil 3L', 'New item 2', 'Cancel']);
    act(() => choose(2));

    expect(screen.getByLabelText('Name of new item 2').props.value).toBe('OLIVE OIL');
    expect(screen.getByTestId('split-new-stats-1').props.children).toBe('1 purchase · $11.99 avg');
    expect(screen.getByLabelText('Save the split').props.accessibilityState).toEqual({
      disabled: false,
    });
  });

  it('saves the splits and opens the first new item (AC 13)', async () => {
    mockApi.splitItem.mockResolvedValue([
      detail({ id: 'i-9', canonical_name: 'Olive oil 3L', observation_count: 1 }),
    ]);
    const routerScreen = open('/items/i-1');
    fireEvent.press(await screen.findByLabelText('Split Into Separate Items…'));
    fireEvent.press(
      await screen.findByLabelText('Mar 15, 2026, FreshCo, $24.99, OLIVE OIL, in Olive oil'),
    );
    fireEvent.changeText(screen.getByLabelText('Name of new item 1'), ' Olive oil 3L ');
    mockApi.getItem.mockResolvedValue(detail({ id: 'i-9', canonical_name: 'Olive oil 3L' }));

    fireEvent.press(screen.getByLabelText('Save the split'));

    await waitFor(() =>
      expect(mockApi.splitItem).toHaveBeenCalledWith('i-1', [
        { name: 'Olive oil 3L', line_item_ids: ['l-3'] },
      ]),
    );
    await waitFor(() => expect(routerScreen.getPathname()).toBe('/items/i-9'));
  });
});

describe('Split limits and Save (PI-02 AC 11, 13)', () => {
  it('allows at most 10 new items, as the server does', async () => {
    open('/items/split?id=i-1');
    await screen.findByTestId('split-original-stats');

    for (let i = 0; i < 9; i += 1) fireEvent.press(screen.getByLabelText('Add another split'));

    await waitFor(() => expect(headerFor('Split into 11 items')).toBeDefined());
    expect(screen.getByLabelText('Add another split').props.accessibilityState).toEqual({
      disabled: true,
    });
    fireEvent.press(screen.getByLabelText('Add another split'));
    expect(headerFor('Split into 12 items')).toBeUndefined();
  });

  it('opens the FIRST new item after saving several', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    mockApi.splitItem.mockResolvedValue([
      detail({ id: 'i-9', canonical_name: 'Olive oil 3L' }),
      detail({ id: 'i-10', canonical_name: 'Olive oil (Loblaws)' }),
    ]);
    const routerScreen = open('/items/i-1');
    fireEvent.press(await screen.findByLabelText('Split Into Separate Items…'));
    fireEvent.press(
      await screen.findByLabelText('Mar 15, 2026, FreshCo, $24.99, OLIVE OIL, in Olive oil'),
    );
    fireEvent.press(screen.getByLabelText('Add another split'));
    fireEvent.press(screen.getByLabelText(/^Mar 8, 2026, Loblaws/));
    act(() => sheet.mock.calls[0][1](2));
    mockApi.getItem.mockResolvedValue(detail({ id: 'i-9', canonical_name: 'Olive oil 3L' }));

    fireEvent.press(screen.getByLabelText('Save the split'));

    await waitFor(() =>
      expect(mockApi.splitItem).toHaveBeenCalledWith('i-1', [
        { name: 'OLIVE OIL', line_item_ids: ['l-3'] },
        { name: 'OLIVE OIL', line_item_ids: ['l-2'] },
      ]),
    );
    await waitFor(() => expect(routerScreen.getPathname()).toBe('/items/i-9'));
  });
});

describe('Unit price varies (PI-02 AC 12)', () => {
  it('warns on item detail and the split screen at 1.5 times or more', async () => {
    open('/items/i-1');
    expect(await screen.findByText(WARNING)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Split Into Separate Items…'));
    await waitFor(() => expect(headerFor('Split into 2 items')).toBeDefined());
    expect((await screen.findByTestId('split-warning')).props.children.props.children).toBe(
      WARNING,
    );
  });

  it('says nothing when the prices are close', async () => {
    mockApi.getPriceHistory.mockResolvedValue(history(OIL.slice(0, 2)));
    open('/items/i-1');

    expect(await screen.findByText('Names on receipts')).toBeTruthy();
    expect(screen.queryByText(WARNING)).toBeNull();
  });
});

describe('Link items sheet (PI-02 AC 15)', () => {
  beforeEach(() => {
    mockApi.getLinkCandidates.mockResolvedValue({
      suggested: [summary('i-2', 'Olive oil · extra virgin', 4, 15.49)],
      items: [summary('i-3', 'Cooking oil', 14, 13.99), summary('i-4', 'Sesame oil', 1, null)],
    });
  });

  it('shows the intro, search, Suggested and All items with purchases and averages', async () => {
    const routerScreen = open('/items/i-1');

    fireEvent.press(await screen.findByLabelText('Link Items…'));

    expect(routerScreen.getPathname()).toBe('/items/merge');
    expect(
      await screen.findByText('Pick an existing item to merge “Olive oil” into.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Search items')).toBeTruthy();
    expect(await screen.findByText('Suggested')).toBeTruthy();
    expect(screen.getByText('All items')).toBeTruthy();
    expect(screen.getByText('4 purchases · $15.49 avg')).toBeTruthy();
    expect(screen.getByText('14 purchases · $13.99 avg')).toBeTruthy();
    expect(screen.getByText('1 purchase')).toBeTruthy();
    expect(mockApi.getLinkCandidates).toHaveBeenCalledWith('i-1', '');
  });

  it('never lists the item itself', async () => {
    mockApi.getLinkCandidates.mockResolvedValue({
      suggested: [],
      items: [summary('i-1', 'Olive oil', 3, 16.16), summary('i-3', 'Cooking oil', 14, 13.99)],
    });
    open('/items/merge?id=i-1');

    expect(await screen.findByText('Cooking oil')).toBeTruthy();
    expect(screen.queryByLabelText(/^Olive oil, /)).toBeNull();
  });

  it('searches as the user types', async () => {
    open('/items/merge?id=i-1');
    await screen.findByText('Cooking oil');

    fireEvent.changeText(screen.getByLabelText('Search items'), 's');
    fireEvent.changeText(screen.getByLabelText('Search items'), 'se');
    fireEvent.changeText(screen.getByLabelText('Search items'), 'ses');

    // Debounced (about 300 ms): one request for what was typed, none per key.
    expect(mockApi.getLinkCandidates).not.toHaveBeenCalledWith('i-1', 'ses');
    await waitFor(() => expect(mockApi.getLinkCandidates).toHaveBeenCalledWith('i-1', 'ses'));
    const queries = mockApi.getLinkCandidates.mock.calls.map((c) => c[1]);
    expect(queries).not.toContain('s');
    expect(queries).not.toContain('se');
  });

  it('Cancel on the confirm merges nothing', async () => {
    open('/items/merge?id=i-1');
    fireEvent.press(await screen.findByLabelText('Cooking oil, 14 purchases · $13.99 avg'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    fireEvent.press(screen.getByLabelText('Link the items'));
    choose(alert, 'Cancel');

    expect(alert.mock.calls[0][1]).toBe('Its prices and names move to that item.');
    expect(mockApi.mergeItem).not.toHaveBeenCalled();
  });

  it('enables Link once a radio is picked, then merges and opens the result', async () => {
    mockApi.mergeItem.mockResolvedValue(detail({ id: 'i-3', canonical_name: 'Cooking oil' }));
    const routerScreen = open('/items/i-1');
    fireEvent.press(await screen.findByLabelText('Link Items…'));
    const link = await screen.findByLabelText('Link the items');
    expect(link.props.accessibilityState).toEqual({ disabled: true });

    fireEvent.press(await screen.findByLabelText('Cooking oil, 14 purchases · $13.99 avg'));
    expect(
      screen.getByLabelText('Cooking oil, 14 purchases · $13.99 avg, selected').props
        .accessibilityState,
    ).toEqual({ checked: true });
    expect(screen.getByLabelText('Link the items').props.accessibilityState).toEqual({
      disabled: false,
    });
    mockApi.getItem.mockResolvedValue(detail({ id: 'i-3', canonical_name: 'Cooking oil' }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(screen.getByLabelText('Link the items'));

    // The user's answer: a native confirm first, and nothing merges before it.
    expect(alert.mock.calls[0][0]).toBe('Merge “Olive oil” into “Cooking oil”?');
    expect(mockApi.mergeItem).not.toHaveBeenCalled();
    choose(alert, 'Merge');
    await waitFor(() => expect(mockApi.mergeItem).toHaveBeenCalledWith('i-1', 'i-3'));
    await waitFor(() => expect(routerScreen.getPathname()).toBe('/items/i-3'));
  });
});
