/**
 * Item detail's Back button names the screen it returns to. It said "Prices"
 * everywhere, but an item opens from a receipt line, and from a price alert
 * or link straight over the tabs (device check 2026-11-03).
 */
import React from 'react';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Slot, Stack } from 'expo-router';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import TabsLayout from '../../app/(tabs)/_layout';
import ItemDetailScreen from '../../app/items/[id]';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('expo-blur', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    BlurView: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>,
  };
});
jest.mock('@/hooks/useTimeZoneSync', () => ({ useTimeZoneSync: () => undefined }));

jest.mock('@/features/price-intelligence/services/itemsApi', () => ({
  getItem: async () => ({
    id: 'i-1',
    canonical_name: 'Organic Bananas',
    unit_of_measure: null,
    observation_count: 1,
    store_count: 1,
    latest_price: null,
    aliases: [],
    suggestions: [],
    alerts_muted: false,
  }),
  getPriceHistory: async () => ({
    item: { id: 'i-1', canonical_name: 'Organic Bananas' },
    unit_of_measure: null,
    has_timeline: false,
    min_points: 2,
    store_count: 0,
    observations: [],
  }),
  getPriceComparison: async () => ({
    item: { id: 'i-1', canonical_name: 'Organic Bananas' },
    unit_of_measure: null,
    currency: 'USD',
    min_observations: 2,
    stores: [],
    stores_below_minimum: 0,
  }),
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

function launch(initialUrl: string) {
  useAuthStore.setState({ hydrated: true, accessToken: 't', refreshToken: 't' });
  renderRouter(
    {
      _layout: () => (
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="items/index" options={{ title: 'Prices' }} />
            <Stack.Screen name="receipt/[id]" options={{ title: 'Receipt' }} />
          </Stack>
        </QueryClientProvider>
      ),
      '(tabs)/_layout': TabsLayout,
      '(tabs)/(budget)/_layout': () => <Slot />,
      '(tabs)/(budget)/index': () => <Text>Budget home</Text>,
      '(tabs)/history': () => <Text>History home</Text>,
      '(tabs)/scan': () => null,
      'items/index': () => <Text>Prices list</Text>,
      'receipt/[id]': () => <Text>Receipt detail</Text>,
      'items/[id]': ItemDetailScreen,
    },
    { initialUrl },
  );
}

async function openItemFrom(path: string | null) {
  if (path) act(() => router.push(path as never));
  act(() => router.push('/items/i-1'));
  await waitFor(() => expect(headerFor('Organic Bananas')).toBeDefined());
  return headerFor('Organic Bananas')!;
}

describe('item detail Back label', () => {
  it('says Prices when the item opened from the Prices list', async () => {
    launch('/');
    expect((await openItemFrom('/items')).backTitle).toBe('Prices');
  });

  it('says Receipt when the item opened from a receipt line', async () => {
    launch('/');
    expect((await openItemFrom('/receipt/r-1')).backTitle).toBe('Receipt');
  });

  it('says Budget when the item opened over the Budget tab, as a price alert does', async () => {
    launch('/');
    expect((await openItemFrom(null)).backTitle).toBe('Budget');
  });

  it('says History when the item opened over the History tab', async () => {
    launch('/history');
    expect((await openItemFrom(null)).backTitle).toBe('History');
  });
});
