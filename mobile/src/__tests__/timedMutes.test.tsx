/**
 * V1.1 PI-03 AC 10, 13, 14 (DA-7): timed mutes and the Alerts screen.
 *
 * Item detail has an "Alerts" row ("On", "Muted", "Muted until <date>") that
 * pushes the Alerts screen. Every switch there reads on = alerts on: the
 * item's "Price alerts" switch, with "Mute until" under it while muted, and a
 * switch per store, which asks "Mute until" when turned off. Settings → Alerts
 * lists each mute with "Until <date>" or "Forever"; a failed unmute keeps the
 * row, says so inline, and can be tried again.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ItemDetailScreen from '../../app/items/[id]';
import ItemAlertsScreen from '../../app/items/alerts';
import NotificationSettingsScreen from '../../app/settings/notification-settings';
import { ApiError } from '@/services/api';
import { MUTE_COPY } from '@/features/price-intelligence/constants';
import { formatMuteEnd, muteUntil } from '@/features/price-intelligence/utils/muteUntil';
import type {
  ItemDetail,
  PriceAlertSettings,
  PriceHistory,
  PricePoint,
} from '@/features/price-intelligence/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
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

// A week from now, as the server would send it back.
const WEEK_END = new Date(Date.now() + 7 * 86_400_000).toISOString();
const WEEK_END_DATE = formatMuteEnd(WEEK_END);

function point(date: string, store: string): PricePoint {
  return {
    receipt_id: `r-${date}`,
    line_item_id: `l-${date}`,
    line_name: 'Organic Bananas',
    date,
    store_id: `s-${store}`,
    store_name: store,
    unit_price: 0.7,
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
    observation_count: 2,
    store_count: 2,
    latest_price: null,
    aliases: [{ id: 'a-1', alias: 'Organic Bananas' }],
    suggestions: [],
    alerts_muted: false,
    muted_until: null,
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
  observations: [point('2026-03-01', 'FreshCo'), point('2026-03-02', 'Loblaws')],
};

function settings(overrides: Partial<PriceAlertSettings> = {}): PriceAlertSettings {
  return {
    enabled: true,
    threshold_percent: 10,
    default_threshold_percent: 10,
    cooldown_days: 7,
    default_cooldown_days: 7,
    muted_items: [],
    muted_stores: [],
    ...overrides,
  };
}

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

/** The native header config of the screen titled `title`. */
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
      'items/alerts': ItemAlertsScreen,
      'settings/notification-settings': NotificationSettingsScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push(path as never));
  return routerScreen;
}

const premiumRequired = () =>
  new ApiError(403, {
    detail: { code: 'premium_required', feature: 'price_alert_mute', message: 'Premium' },
  });

/** Days between now and an ISO time, to the nearest day. */
const daysFromNow = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 86_400_000);

beforeEach(() => {
  mockMe.current = { is_premium: true };
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  mockApi.getItem.mockResolvedValue(detail());
  mockApi.getPriceHistory.mockResolvedValue(prices);
  mockApi.getPriceComparison.mockResolvedValue({
    item: { id: 'i-1', canonical_name: 'Organic Bananas' },
    unit_of_measure: 'lb',
    currency: 'USD',
    min_observations: 2,
    stores: [],
    stores_below_minimum: 0,
  });
  mockApi.getPriceAlertSettings.mockResolvedValue(settings());
  mockApi.muteItem.mockResolvedValue(undefined);
  mockApi.unmuteItem.mockResolvedValue(undefined);
  mockApi.muteStore.mockResolvedValue(undefined);
  mockApi.unmuteStore.mockResolvedValue(undefined);
});

describe('muteUntil (PI-03 AC 10)', () => {
  const now = new Date(2026, 0, 31, 9, 30);

  it('offers Forever first, then 1 week, 1 month and 3 months', () => {
    expect(MUTE_COPY.choices).toEqual(['Forever', '1 week', '1 month', '3 months']);
  });

  it('turns a choice into the end time, null for Forever', () => {
    expect(muteUntil(0, now)).toBeNull();
    expect(muteUntil(1, now)).toBe(new Date(2026, 1, 7, 9, 30).toISOString());
    // A month from 31 January is the last day of February, not 3 March.
    expect(muteUntil(2, now)).toBe(new Date(2026, 1, 28, 9, 30).toISOString());
    expect(muteUntil(3, now)).toBe(new Date(2026, 3, 30, 9, 30).toISOString());
  });

  it('shows an end as the local date', () => {
    expect(formatMuteEnd(new Date(2026, 2, 27, 23, 59).toISOString())).toBe('Mar 27, 2026');
  });
});

describe('the Alerts row on item detail (PI-03 AC 13)', () => {
  it('reads On, Muted, or Muted until the date', async () => {
    const first = open('/items/i-1');
    expect(await screen.findByLabelText('Alerts: On')).toBeTruthy();
    first.unmount();

    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true }));
    const second = open('/items/i-1');
    expect(await screen.findByLabelText('Alerts: Muted')).toBeTruthy();
    second.unmount();

    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true, muted_until: WEEK_END }));
    open('/items/i-1');
    expect(await screen.findByLabelText(`Alerts: Muted until ${WEEK_END_DATE}`)).toBeTruthy();
  });

  it('pushes the Alerts screen, whose Back button names the item', async () => {
    const view = open('/items/i-1');
    fireEvent.press(await screen.findByLabelText('Alerts: On'));
    await waitFor(() => expect(view.getPathname()).toBe('/items/alerts'));
    expect(view.getSearchParams()).toEqual({ id: 'i-1' });
    await waitFor(() => expect(headerFor('Alerts')).toBeDefined());
    expect(headerFor('Alerts')!.backTitle).toBe('Organic Bananas');
  });

  it('no longer has the mute switches on item detail', async () => {
    open('/items/i-1');
    await screen.findByLabelText('Alerts: On');
    expect(screen.queryByLabelText('Price alerts for Organic Bananas')).toBeNull();
  });
});

describe('the Alerts screen (PI-03 AC 10, 13)', () => {
  it('lays out the item and store groups, the store note and the footer', async () => {
    open('/items/alerts?id=i-1');
    expect(await screen.findByText('Item-level')).toBeTruthy();
    expect(screen.getByText('Price alerts')).toBeTruthy();
    expect(screen.getByText('For Organic Bananas across all stores')).toBeTruthy();
    expect(await screen.findByText('FreshCo')).toBeTruthy();
    expect(screen.getByText('Per store')).toBeTruthy();
    expect(screen.getByText('Loblaws')).toBeTruthy();
    expect(screen.getByText(MUTE_COPY.storeNote)).toBeTruthy();
    expect(MUTE_COPY.storeNote).toMatch(/every item/);
    expect(
      screen.getByText('You’ll still see price changes in the item detail — just no notifications.'),
    ).toBeTruthy();
  });

  it('every switch reads on = alerts on', async () => {
    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true }));
    mockApi.getPriceAlertSettings.mockResolvedValue(
      settings({ muted_stores: [{ id: 's-Loblaws', name: 'Loblaws', muted_until: null }] }),
    );
    open('/items/alerts?id=i-1');
    await waitFor(() =>
      expect(screen.getByLabelText('Price alerts for Organic Bananas').props.value).toBe(false),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Price alerts at Loblaws').props.value).toBe(false),
    );
    expect(screen.getByLabelText('Price alerts at FreshCo').props.value).toBe(true);
  });

  it('turning the item off mutes it forever and shows Mute until under it', async () => {
    open('/items/alerts?id=i-1');
    const toggle = await screen.findByLabelText('Price alerts for Organic Bananas');
    expect(screen.queryByLabelText(/^Mute until/)).toBeNull();
    // The server's answer once the mute is saved.
    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true }));
    fireEvent(toggle, 'valueChange', false);
    await waitFor(() => expect(mockApi.muteItem).toHaveBeenCalledWith('i-1', null));
    expect(await screen.findByLabelText('Mute until: Forever')).toBeTruthy();
  });

  it('Mute until changes the time of the item mute', async () => {
    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true }));
    open('/items/alerts?id=i-1');
    fireEvent.press(await screen.findByLabelText('Mute until: Forever'));
    // The sheet asks "Mute until" over the row of that name.
    expect(screen.getAllByText('Mute until')).toHaveLength(2);
    expect(screen.getByLabelText('Forever').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByLabelText('1 week'));
    await waitFor(() => expect(mockApi.muteItem).toHaveBeenCalled());
    const [id, until] = mockApi.muteItem.mock.calls[0] as [string, string];
    expect(id).toBe('i-1');
    expect(daysFromNow(until)).toBe(7);
  });

  it('shows a timed item mute’s end date', async () => {
    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true, muted_until: WEEK_END }));
    open('/items/alerts?id=i-1');
    expect(await screen.findByLabelText(`Mute until: ${WEEK_END_DATE}`)).toBeTruthy();
  });

  it('turning a store off asks Mute until, then mutes it for that long', async () => {
    open('/items/alerts?id=i-1');
    fireEvent(await screen.findByLabelText('Price alerts at FreshCo'), 'valueChange', false);
    expect(await screen.findByLabelText('3 months')).toBeTruthy();
    expect(mockApi.muteStore).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('1 month'));
    await waitFor(() => expect(mockApi.muteStore).toHaveBeenCalled());
    const [storeId, until] = mockApi.muteStore.mock.calls[0] as [string, string];
    expect(storeId).toBe('s-FreshCo');
    expect(daysFromNow(until)).toBeGreaterThanOrEqual(28);
    expect(daysFromNow(until)).toBeLessThanOrEqual(31);
  });

  it('Forever on the store sheet mutes with no end', async () => {
    open('/items/alerts?id=i-1');
    fireEvent(await screen.findByLabelText('Price alerts at FreshCo'), 'valueChange', false);
    fireEvent.press(await screen.findByLabelText('Forever'));
    await waitFor(() => expect(mockApi.muteStore).toHaveBeenCalledWith('s-FreshCo', null));
  });

  it('closing the store sheet leaves the store on', async () => {
    open('/items/alerts?id=i-1');
    fireEvent(await screen.findByLabelText('Price alerts at FreshCo'), 'valueChange', false);
    await screen.findByLabelText('1 week');
    act(() => screen.UNSAFE_getByProps({ animationType: 'slide' }).props.onRequestClose());
    await waitFor(() => expect(screen.queryByLabelText('1 week')).toBeNull());
    expect(screen.getByLabelText('Price alerts at FreshCo').props.value).toBe(true);
    expect(mockApi.muteStore).not.toHaveBeenCalled();
  });

  it('a timed store mute shows its end under the store', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(
      settings({ muted_stores: [{ id: 's-Loblaws', name: 'Loblaws', muted_until: WEEK_END }] }),
    );
    open('/items/alerts?id=i-1');
    expect(await screen.findByText(`Until ${WEEK_END_DATE}`)).toBeTruthy();
  });

  it('turning a store back on unmutes it', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(
      settings({ muted_stores: [{ id: 's-Loblaws', name: 'Loblaws', muted_until: WEEK_END }] }),
    );
    open('/items/alerts?id=i-1');
    await waitFor(() =>
      expect(screen.getByLabelText('Price alerts at Loblaws').props.value).toBe(false),
    );
    fireEvent(screen.getByLabelText('Price alerts at Loblaws'), 'valueChange', true);
    await waitFor(() => expect(mockApi.unmuteStore).toHaveBeenCalledWith('s-Loblaws'));
  });

  it('a lapsed user changing Mute until gets the upgrade prompt, and can unmute', async () => {
    mockMe.current = { is_premium: false };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true, muted_until: WEEK_END }));
    open('/items/alerts?id=i-1');
    fireEvent.press(await screen.findByLabelText(`Mute until: ${WEEK_END_DATE}`));
    expect(alert).toHaveBeenCalledWith(
      'Muting alerts is Premium',
      expect.any(String),
      expect.any(Array),
    );
    expect(screen.queryByLabelText('1 week')).toBeNull();
    fireEvent(screen.getByLabelText('Price alerts for Organic Bananas'), 'valueChange', true);
    await waitFor(() => expect(mockApi.unmuteItem).toHaveBeenCalledWith('i-1'));
    expect(mockApi.muteItem).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('a 403 on a new time shows the upgrade prompt', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.getItem.mockResolvedValue(detail({ alerts_muted: true }));
    mockApi.muteItem.mockRejectedValue(premiumRequired());
    open('/items/alerts?id=i-1');
    fireEvent.press(await screen.findByLabelText('Mute until: Forever'));
    fireEvent.press(screen.getByLabelText('3 months'));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Muting alerts is Premium',
        expect.any(String),
        expect.any(Array),
      ),
    );
    alert.mockRestore();
  });
});

describe('Settings → Alerts mutes (PI-03 AC 14)', () => {
  const muted = () =>
    settings({
      muted_items: [{ id: 'i-1', canonical_name: 'Organic Bananas', muted_until: WEEK_END }],
      muted_stores: [{ id: 's-Loblaws', name: 'Loblaws', muted_until: null }],
    });

  it('lists each mute with Until <date> or Forever', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(muted());
    open('/settings/notification-settings');
    expect(await screen.findByText(`Item · Until ${WEEK_END_DATE}`)).toBeTruthy();
    expect(screen.getByText('Store · Forever')).toBeTruthy();
  });

  it('a failed unmute keeps the row, says so, and can be tried again', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(muted());
    mockApi.unmuteItem.mockRejectedValueOnce(new Error('offline'));
    open('/settings/notification-settings');
    fireEvent.press(await screen.findByLabelText('Unmute Organic Bananas'));
    expect(await screen.findByText(MUTE_COPY.unmuteFailed)).toBeTruthy();
    expect(screen.getByLabelText('Unmute Organic Bananas')).toBeTruthy();

    mockApi.getPriceAlertSettings.mockResolvedValue(
      settings({ muted_stores: muted().muted_stores }),
    );
    fireEvent.press(screen.getByLabelText('Unmute Organic Bananas'));
    await waitFor(() => expect(mockApi.unmuteItem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByLabelText('Unmute Organic Bananas')).toBeNull());
    expect(screen.queryByText(MUTE_COPY.unmuteFailed)).toBeNull();
    expect(screen.getByLabelText('Unmute Loblaws')).toBeTruthy();
  });
});
