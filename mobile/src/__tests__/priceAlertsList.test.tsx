/**
 * V1.1 PI-03 AC 5-7 (DA-4): the in-app Price alerts list, its Settings group
 * (threshold and cooldown), and the two ways in: Settings → Alerts and the
 * bell on the Budget dashboard. EC-PI 11: a row opens the item named in its
 * data, which the server moves to the surviving item on a merge.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import PriceAlertsScreen from '../../app/price-alerts';
import NotificationSettingsScreen from '../../app/settings/notification-settings';
import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { DashboardData } from '@/features/budget/types';
import type {
  PriceAlertNotification,
  PriceAlertSettings,
} from '@/features/price-intelligence/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// React Native's iOS font scale at the default size and at AX5 (iPhone SE).
const AX5_SCALE = 3.571;
const mockWindow = { fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 667, scale: 2, fontScale: mockWindow.fontScale }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: { is_premium: true } }),
  useUpdatePreferences: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/budget/hooks/useBudget', () => ({ useBudgets: () => ({ data: [] }) }));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));
const mockDashboard: DashboardData = {
  period: '2026-11',
  overall: { budget: 400, spent: 243, remaining: 157, percent: 60.75 },
  categories: [],
  top_items: [],
  trend: [],
  previous_period: '2026-10',
  category_changes: [],
  has_receipts: true,
};
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: mockDashboard,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const mockApi = {
  listPriceAlerts: jest.fn(),
  getPriceAlertSettings: jest.fn(),
  updatePriceAlertSettings: jest.fn(),
};
jest.mock('@/features/price-intelligence/services/priceAlertsApi', () => ({
  listPriceAlerts: (...a: unknown[]) => mockApi.listPriceAlerts(...a),
}));
jest.mock('@/features/price-intelligence/services/itemsApi', () => ({
  getPriceAlertSettings: (...a: unknown[]) => mockApi.getPriceAlertSettings(...a),
  updatePriceAlertSettings: (...a: unknown[]) => mockApi.updatePriceAlertSettings(...a),
}));

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

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function priceAlert(
  id: string,
  data: Record<string, unknown>,
  createdAt: string,
): PriceAlertNotification {
  return {
    id,
    type: 'price_change',
    title: 'title',
    body: 'body',
    data: JSON.stringify(data),
    read: false,
    created_at: createdAt,
  };
}

const eggs = priceAlert(
  'n-eggs',
  {
    canonical_item_id: 'i-eggs',
    item_name: 'Eggs · dozen',
    store_name: 'Safeway',
    direction: 'up',
    percent: 22,
    old_average: '$4.49',
    new_price: '$5.49',
    recent_prices: [4.49, 4.49, 4.79, 4.49, 4.99, 5.49],
  },
  daysAgo(1),
);
const oil = priceAlert(
  'n-oil',
  {
    canonical_item_id: 'i-oil',
    item_name: 'Olive oil · 1L',
    store_name: 'Costco',
    direction: 'down',
    percent: -14,
    old_average: '$14.99',
    new_price: '$12.99',
    recent_prices: [14.99, 15.49, 12.99],
  },
  daysAgo(20),
);

function open(path: string) {
  const view = renderRouter(
    {
      _layout: () => (
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Stack />
        </QueryClientProvider>
      ),
      index: DashboardScreen,
      'price-alerts': PriceAlertsScreen,
      'items/[id]': () => null,
      'settings/notification-settings': NotificationSettingsScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push(path));
  return view;
}

afterEach(() => {
  mockWindow.fontScale = 1;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.listPriceAlerts.mockResolvedValue([eggs, oil]);
  mockApi.getPriceAlertSettings.mockResolvedValue(settings());
  mockApi.updatePriceAlertSettings.mockImplementation(async (body: Partial<PriceAlertSettings>) =>
    settings({
      ...body,
      cooldown_days: body.cooldown_days ?? 7,
      threshold_percent: body.threshold_percent ?? 10,
    }),
  );
});

describe('Price alerts list (PI-03 AC 5)', () => {
  it('groups alerts This week and Earlier, newest first', async () => {
    open('/price-alerts');
    const rows = await screen.findAllByRole('button', { name: /avg, now/ });
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Eggs · dozen, up 22%, Safeway · was $4.49 avg, now $5.49',
      'Olive oil · 1L, down 14%, Costco · was $14.99 avg, now $12.99, stock-up worth it',
    ]);
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
    expect(screen.getByText('+22%')).toBeTruthy();
    expect(screen.getByText('−14%')).toBeTruthy();
    expect(screen.getByText('stock-up worth it')).toBeTruthy();
    // Decorative, so hidden from VoiceOver: the row's label reads the numbers.
    expect(
      screen.getAllByTestId('price-alert-sparkline', { includeHiddenElements: true }),
    ).toHaveLength(2);
  });

  it('opens the item when a row is tapped (EC-PI 11: the id the server keeps current)', async () => {
    const view = open('/price-alerts');
    fireEvent.press(await screen.findByRole('button', { name: /^Eggs/ }));
    await waitFor(() => expect(view.getPathname()).toBe('/items/i-eggs'));
  });

  it('opens from the bell on the Budget dashboard', async () => {
    const view = open('/');
    fireEvent.press(await screen.findByLabelText('Price alerts'));
    await waitFor(() => expect(view.getPathname()).toBe('/price-alerts'));
  });

  it('opens from Settings → Alerts', async () => {
    const view = open('/settings/notification-settings');
    fireEvent.press(await screen.findByRole('button', { name: 'Price alerts' }));
    await waitFor(() => expect(view.getPathname()).toBe('/price-alerts'));
  });

  it('says so and offers a retry when the list fails to load', async () => {
    mockApi.listPriceAlerts.mockRejectedValueOnce(new Error('offline'));
    open('/price-alerts');
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /^Eggs/ })).toBeTruthy();
  });
});

describe('Empty Price alerts list (PI-03 AC 6)', () => {
  it('says No price alerts yet and when one comes, from the threshold', async () => {
    mockApi.listPriceAlerts.mockResolvedValue([]);
    mockApi.getPriceAlertSettings.mockResolvedValue(settings({ threshold_percent: 15 }));
    open('/price-alerts');
    expect(await screen.findByText('No price alerts yet')).toBeTruthy();
    expect(
      await screen.findByText(
        'You’ll get one when something you buy regularly changes price by 15% or more.',
      ),
    ).toBeTruthy();
  });
});

describe('Price alerts Settings group (PI-03 AC 7, 8)', () => {
  it('shows Threshold and Cooldown with the footer from the user’s settings', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(
      settings({ threshold_percent: 15, cooldown_days: 3 }),
    );
    open('/price-alerts');
    expect(await screen.findByRole('button', { name: 'Threshold: 15%' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cooldown: 3 days' })).toBeTruthy();
    expect(screen.getByText('Cooldown: 3 days · alerts at ≥15% change')).toBeTruthy();
  });

  it('offers 1, 3, 7, 14 and 30 days and saves the cooldown', async () => {
    open('/price-alerts');
    fireEvent.press(await screen.findByRole('button', { name: 'Cooldown: 7 days' }));
    for (const label of ['1 day', '3 days', '7 days (default)', '14 days', '30 days']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    fireEvent.press(screen.getByRole('button', { name: '14 days' }));
    await waitFor(() =>
      expect(mockApi.updatePriceAlertSettings).toHaveBeenCalledWith({ cooldown_days: 14 }),
    );
    expect(await screen.findByText('Cooldown: 14 days · alerts at ≥10% change')).toBeTruthy();
  });

  it('sends the default cooldown as null, so a later default applies', async () => {
    mockApi.getPriceAlertSettings.mockResolvedValue(settings({ cooldown_days: 3 }));
    open('/price-alerts');
    fireEvent.press(await screen.findByRole('button', { name: 'Cooldown: 3 days' }));
    fireEvent.press(screen.getByRole('button', { name: '7 days (default)' }));
    await waitFor(() =>
      expect(mockApi.updatePriceAlertSettings).toHaveBeenCalledWith({ cooldown_days: null }),
    );
  });

  it('sets the threshold from the list', async () => {
    open('/price-alerts');
    fireEvent.press(await screen.findByRole('button', { name: 'Threshold: 10%' }));
    fireEvent.press(screen.getByRole('button', { name: '20%' }));
    await waitFor(() =>
      expect(mockApi.updatePriceAlertSettings).toHaveBeenCalledWith({ threshold_percent: 20 }),
    );
  });
});

// F3 (Simulator pass 2026-11-06): at AX5 on the SE the item name was cut to
// "Wh ole…" beside the percent. At accessibility sizes the percent goes under
// the name, as the Items list does (BUG-3). Jest has no layout engine, so this
// checks the props; the Simulator recheck draws it.
describe('Price alerts list at large text sizes (F3)', () => {
  it('keeps the name and percent on one line at the default size', async () => {
    open('/price-alerts');
    const line = await screen.findByTestId('price-alert-title-n-eggs');
    expect(StyleSheet.flatten(line.props.style).flexDirection).toBe('row');
    expect(screen.getByText('Eggs · dozen').props.numberOfLines).toBe(2);
  });

  it('puts the percent under the whole name at AX5', async () => {
    mockWindow.fontScale = AX5_SCALE;
    open('/price-alerts');
    const line = await screen.findByTestId('price-alert-title-n-eggs');
    expect(StyleSheet.flatten(line.props.style).flexDirection).toBe('column');
    expect(screen.getByText('Eggs · dozen').props.numberOfLines).toBeUndefined();
  });
});
