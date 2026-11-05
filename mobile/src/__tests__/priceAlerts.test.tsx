/**
 * V1.1 PI-03 price change alerts and PI-04 cross-store comparison in the app:
 * muting an item or a store from item detail, the store comparison on item
 * detail, and the price alert threshold in Settings → Alerts. Comparison and
 * muting are Premium (D8, PREM-02): a free user gets the upgrade prompt.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ItemDetailScreen from '../../app/items/[id]';
import { ApiError } from '@/services/api';
import NotificationSettingsScreen from '../../app/settings/notification-settings';
import type {
  ItemDetail,
  PriceAlertSettings,
  PriceComparison,
  PriceHistory,
  PricePoint,
} from '@/features/price-intelligence/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
// The signed-in user: Premium unless a test says otherwise (comparison and
// mutes are Premium, D8).
const mockMe: { current: { is_premium: boolean } | undefined } = {
  current: { is_premium: true },
};
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: mockMe.current }),
  useUpdatePreferences: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/budget/hooks/useBudget', () => ({
  useBudgets: () => ({ data: [] }),
}));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));

const mockApi = {
  getItem: jest.fn(),
  getPriceHistory: jest.fn(),
  getPriceComparison: jest.fn(),
  getPriceAlertSettings: jest.fn(),
  updatePriceAlertSettings: jest.fn(),
  muteItem: jest.fn(),
  unmuteItem: jest.fn(),
  muteStore: jest.fn(),
  unmuteStore: jest.fn(),
};
jest.mock('@/features/price-intelligence/services/itemsApi', () => ({
  getItem: (...a: unknown[]) => mockApi.getItem(...a),
  getPriceHistory: (...a: unknown[]) => mockApi.getPriceHistory(...a),
  getPriceComparison: (...a: unknown[]) => mockApi.getPriceComparison(...a),
  getPriceAlertSettings: (...a: unknown[]) => mockApi.getPriceAlertSettings(...a),
  updatePriceAlertSettings: (...a: unknown[]) => mockApi.updatePriceAlertSettings(...a),
  muteItem: (...a: unknown[]) => mockApi.muteItem(...a),
  unmuteItem: (...a: unknown[]) => mockApi.unmuteItem(...a),
  muteStore: (...a: unknown[]) => mockApi.muteStore(...a),
  unmuteStore: (...a: unknown[]) => mockApi.unmuteStore(...a),
}));

function point(date: string, price: number, store: string): PricePoint {
  return {
    receipt_id: `r-${date}`,
    date,
    store_id: `s-${store}`,
    store_name: store,
    unit_price: price,
    quantity: 1,
    unit_of_measure: 'lb',
    currency: 'USD',
    in_timeline: true,
  };
}

function detail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: 'i-1',
    canonical_name: 'Organic Bananas',
    unit_of_measure: 'lb',
    observation_count: 4,
    store_count: 2,
    latest_price: null,
    aliases: [{ id: 'a-1', alias: 'Organic Bananas' }],
    suggestions: [],
    alerts_muted: false,
    ...overrides,
  };
}

const prices: PriceHistory = {
  item: { id: 'i-1', canonical_name: 'Organic Bananas' },
  unit_of_measure: 'lb',
  currency: 'USD',
  has_timeline: true,
  min_points: 2,
  store_count: 2,
  observations: [
    point('2026-03-01', 0.69, 'FreshCo'),
    point('2026-03-02', 0.79, 'Loblaws'),
    point('2026-03-05', 0.71, 'FreshCo'),
    point('2026-03-06', 0.81, 'Loblaws'),
  ],
};

function comparison(overrides: Partial<PriceComparison> = {}): PriceComparison {
  return {
    item: { id: 'i-1', canonical_name: 'Organic Bananas' },
    unit_of_measure: 'lb',
    currency: 'USD',
    min_observations: 2,
    stores: [
      {
        store_id: 's-FreshCo',
        store_name: 'FreshCo',
        latest_price: 0.71,
        latest_date: '2026-03-05',
        avg_price: 0.7,
        observation_count: 2,
      },
      {
        store_id: 's-Loblaws',
        store_name: 'Loblaws',
        latest_price: 0.81,
        latest_date: '2026-03-06',
        avg_price: 0.8,
        observation_count: 2,
      },
    ],
    stores_below_minimum: 0,
    ...overrides,
  };
}

function settings(overrides: Partial<PriceAlertSettings> = {}): PriceAlertSettings {
  return {
    enabled: true,
    threshold_percent: 10,
    default_threshold_percent: 10,
    cooldown_days: 7,
    muted_items: [],
    muted_stores: [],
    ...overrides,
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
      paywall: () => null,
      'items/[id]': ItemDetailScreen,
      'settings/notification-settings': NotificationSettingsScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push(path));
  return routerScreen;
}

const premiumRequired = (feature: string) =>
  new ApiError(403, {
    detail: { code: 'premium_required', feature, message: 'Premium' },
  });

beforeEach(() => {
  mockMe.current = { is_premium: true };
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  mockApi.getItem.mockResolvedValue(detail());
  mockApi.getPriceHistory.mockResolvedValue(prices);
  mockApi.getPriceComparison.mockResolvedValue(comparison());
  mockApi.getPriceAlertSettings.mockResolvedValue(settings());
  mockApi.updatePriceAlertSettings.mockImplementation(async (body: object) => ({
    ...settings(),
    ...body,
  }));
  mockApi.muteItem.mockResolvedValue(undefined);
  mockApi.unmuteItem.mockResolvedValue(undefined);
  mockApi.muteStore.mockResolvedValue(undefined);
  mockApi.unmuteStore.mockResolvedValue(undefined);
});

describe('Price alert mutes on item detail (PI-03 AC 4)', () => {
  it('mutes price alerts for the item', async () => {
    open('/items/i-1');
    const toggle = await screen.findByLabelText('Price alerts for Organic Bananas');
    expect(toggle.props.value).toBe(true);
    fireEvent(toggle, 'valueChange', false);
    await waitFor(() => expect(mockApi.muteItem).toHaveBeenCalledWith('i-1'));
  });

  it('unmutes an item whose price alerts are muted', async () => {
    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true }));
    open('/items/i-1');
    const toggle = await screen.findByLabelText('Price alerts for Organic Bananas');
    expect(toggle.props.value).toBe(false);
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(mockApi.unmuteItem).toHaveBeenCalledWith('i-1'));
  });

  it('mutes and unmutes price alerts at each store the item was bought from', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(
      settings({ muted_stores: [{ id: 's-Loblaws', name: 'Loblaws' }] }),
    );
    open('/items/i-1');
    const freshco = await screen.findByLabelText('Price alerts at FreshCo');
    await waitFor(() =>
      expect(screen.getByLabelText('Price alerts at Loblaws').props.value).toBe(false),
    );
    expect(freshco.props.value).toBe(true);

    fireEvent(freshco, 'valueChange', false);
    await waitFor(() => expect(mockApi.muteStore).toHaveBeenCalledWith('s-FreshCo'));
    fireEvent(screen.getByLabelText('Price alerts at Loblaws'), 'valueChange', true);
    await waitFor(() => expect(mockApi.unmuteStore).toHaveBeenCalledWith('s-Loblaws'));
  });

  it('puts the switch back and says so when a mute fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.muteItem.mockRejectedValue(new Error('offline'));
    open('/items/i-1');
    const toggle = await screen.findByLabelText('Price alerts for Organic Bananas');
    fireEvent(toggle, 'valueChange', false);
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByLabelText('Price alerts for Organic Bananas').props.value).toBe(true),
    );
    alert.mockRestore();
  });

  it('says what size of change sends an alert, and when alerts are off', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(settings({ threshold_percent: 15 }));
    const { unmount } = open('/items/i-1');
    expect(await screen.findByText(/moves 15% or more/)).toBeTruthy();
    unmount();

    mockApi.getPriceAlertSettings.mockResolvedValue(settings({ enabled: false }));
    open('/items/i-1');
    expect(await screen.findByText(/Price alerts are off/)).toBeTruthy();
  });
});

describe('Store comparison on item detail (PI-04 AC 4)', () => {
  it('shows the latest and average price at each store, cheapest first (AC 4)', async () => {
    open('/items/i-1');
    const freshco = await screen.findByLabelText(
      'FreshCo, cheapest, average $0.70/lb, latest $0.71/lb on Mar 5, 2026',
    );
    const loblaws = screen.getByLabelText(
      'Loblaws, average $0.80/lb, latest $0.81/lb on Mar 6, 2026',
    );
    expect(freshco).toBeTruthy();
    expect(loblaws).toBeTruthy();
    expect(mockApi.getPriceComparison).toHaveBeenCalledWith('i-1');
    const rows = screen.getAllByLabelText(/, average /);
    expect(rows.map((r) => r.props.accessibilityLabel.split(',')[0])).toEqual([
      'FreshCo',
      'Loblaws',
    ]);
  });

  it('says how many stores need more prices before they compare', async () => {
    mockApi.getPriceComparison.mockResolvedValue(comparison({ stores_below_minimum: 1 }));
    open('/items/i-1');
    expect(
      await screen.findByText('1 more store needs 2 prices of this item to compare.'),
    ).toBeTruthy();
  });

  it('explains an empty comparison when no store has enough prices yet', async () => {
    mockApi.getPriceComparison.mockResolvedValue(
      comparison({ stores: [], stores_below_minimum: 2 }),
    );
    open('/items/i-1');
    expect(
      await screen.findByText('Buy it 2 times at a store to compare that store’s price.'),
    ).toBeTruthy();
    expect(screen.getByText('2 more stores need 2 prices of this item to compare.')).toBeTruthy();
  });
});

describe('Premium comparison and mutes for a free user (PREM-02 AC 5, 6)', () => {
  const free = () => {
    mockMe.current = { is_premium: false };
  };

  it('AC 5: item detail shows the upgrade prompt where the comparison was, and it opens the paywall', async () => {
    free();
    const view = open('/items/i-1');
    expect(await screen.findByText('Compare stores with Premium')).toBeTruthy();
    expect(screen.queryByLabelText(/, average /)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockApi.getPriceComparison).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('See Premium'));
    await waitFor(() => expect(view.getPathname()).toBe('/paywall'));
  });

  it('AC 6: a 403 premium_required from compare (Premium lapsed) shows the same prompt', async () => {
    mockApi.getPriceComparison.mockRejectedValue(premiumRequired('price_comparison'));
    open('/items/i-1');
    expect(await screen.findByText('Compare stores with Premium')).toBeTruthy();
    expect(mockApi.getPriceComparison).toHaveBeenCalledTimes(1);
  });

  it('AC 5: a free user turning a switch off gets the upgrade prompt and the switch stays on', async () => {
    free();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = open('/items/i-1');
    const item = await screen.findByLabelText('Price alerts for Organic Bananas');
    fireEvent(item, 'valueChange', false);
    expect(alert).toHaveBeenCalledWith(
      'Muting alerts is Premium',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'See Premium' })]),
    );
    expect(screen.getByLabelText('Price alerts for Organic Bananas').props.value).toBe(true);

    fireEvent(await screen.findByLabelText('Price alerts at FreshCo'), 'valueChange', false);
    expect(alert).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Price alerts at FreshCo').props.value).toBe(true);
    expect(mockApi.muteItem).not.toHaveBeenCalled();
    expect(mockApi.muteStore).not.toHaveBeenCalled();

    // "See Premium" opens the paywall.
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find((b) => b.text === 'See Premium')!.onPress!());
    await waitFor(() => expect(view.getPathname()).toBe('/paywall'));
    alert.mockRestore();
  });

  it('AC 5, EC-PI 5: a lapsed user can still turn a muted switch back on', async () => {
    free();
    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true }));
    mockApi.getPriceAlertSettings.mockResolvedValue(
      settings({ muted_stores: [{ id: 's-Loblaws', name: 'Loblaws' }] }),
    );
    open('/items/i-1');
    const item = await screen.findByLabelText('Price alerts for Organic Bananas');
    expect(item.props.value).toBe(false);
    fireEvent(item, 'valueChange', true);
    await waitFor(() => expect(mockApi.unmuteItem).toHaveBeenCalledWith('i-1'));
    await waitFor(() =>
      expect(screen.getByLabelText('Price alerts at Loblaws').props.value).toBe(false),
    );
    fireEvent(screen.getByLabelText('Price alerts at Loblaws'), 'valueChange', true);
    await waitFor(() => expect(mockApi.unmuteStore).toHaveBeenCalledWith('s-Loblaws'));
  });

  it('AC 6: a 403 premium_required from a mute shows the upgrade prompt and puts the switch back', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.muteItem.mockRejectedValue(premiumRequired('price_alert_mute'));
    open('/items/i-1');
    fireEvent(
      await screen.findByLabelText('Price alerts for Organic Bananas'),
      'valueChange',
      false,
    );
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Muting alerts is Premium',
        expect.any(String),
        expect.any(Array),
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Price alerts for Organic Bananas').props.value).toBe(true),
    );
    alert.mockRestore();
  });
});

describe('Price alert settings (PI-03 settings)', () => {
  it('turns price change alerts off', async () => {
    open('/settings/notification-settings');
    const toggle = await screen.findByLabelText('Price change alerts');
    await waitFor(() => expect(toggle.props.value).toBe(true));
    fireEvent(toggle, 'valueChange', false);
    await waitFor(() =>
      expect(mockApi.updatePriceAlertSettings).toHaveBeenCalledWith({ enabled: false }),
    );
  });

  it('sets the price change threshold', async () => {
    open('/settings/notification-settings');
    fireEvent.press(await screen.findByLabelText('Alert when a price changes by: 10%'));
    fireEvent.press(await screen.findByLabelText('20%'));
    await waitFor(() =>
      expect(mockApi.updatePriceAlertSettings).toHaveBeenCalledWith({ threshold_percent: 20 }),
    );
  });

  it('goes back to the default threshold', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(settings({ threshold_percent: 25 }));
    open('/settings/notification-settings');
    fireEvent.press(await screen.findByLabelText('Alert when a price changes by: 25%'));
    fireEvent.press(await screen.findByLabelText('10% (default)'));
    await waitFor(() =>
      expect(mockApi.updatePriceAlertSettings).toHaveBeenCalledWith({ threshold_percent: null }),
    );
  });

  it('unmutes a muted item and a muted store', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(
      settings({
        muted_items: [{ id: 'i-1', canonical_name: 'Organic Bananas' }],
        muted_stores: [{ id: 's-Loblaws', name: 'Loblaws' }],
      }),
    );
    open('/settings/notification-settings');
    fireEvent.press(await screen.findByLabelText('Unmute Organic Bananas'));
    await waitFor(() => expect(mockApi.unmuteItem).toHaveBeenCalledWith('i-1'));
    fireEvent.press(screen.getByLabelText('Unmute Loblaws'));
    await waitFor(() => expect(mockApi.unmuteStore).toHaveBeenCalledWith('s-Loblaws'));
  });
});
