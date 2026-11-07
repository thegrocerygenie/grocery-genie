/**
 * V1.1 store merge (EC Price Intelligence 1, decision D3): Settings → Stores
 * lists the user's stores as their prices group them; the user merges one into
 * another, and unmerges it again.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, FlatList, StyleSheet } from 'react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import StoresScreen from '../../app/settings/stores';
import type { StoreList } from '@/features/price-intelligence/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// React Native's iOS font scale at the default size and at AX5 (iPhone SE).
const AX5_SCALE = 3.571;
const mockWindow = { fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 667, scale: 2, fontScale: mockWindow.fontScale }),
}));
afterEach(() => {
  mockWindow.fontScale = 1;
});

const mockApi = {
  listStores: jest.fn(),
  mergeStore: jest.fn(),
  unmergeStore: jest.fn(),
};
jest.mock('@/features/price-intelligence/services/storesApi', () => ({
  listStores: (...a: unknown[]) => mockApi.listStores(...a),
  mergeStore: (...a: unknown[]) => mockApi.mergeStore(...a),
  unmergeStore: (...a: unknown[]) => mockApi.unmergeStore(...a),
}));

const twoStores: StoreList = {
  stores: [
    { id: 's-lob', name: 'Loblaws', receipt_count: 3, merged_stores: [] },
    { id: 's-rcss', name: 'REAL CANADIAN SUPERSTORE', receipt_count: 1, merged_stores: [] },
  ],
};

const merged: StoreList = {
  stores: [
    {
      id: 's-lob',
      name: 'Loblaws',
      receipt_count: 4,
      merged_stores: [{ id: 's-rcss', name: 'REAL CANADIAN SUPERSTORE' }],
    },
  ],
};

function renderScreen() {
  renderRouter(
    {
      _layout: () => {
        const { Stack } = jest.requireActual('expo-router');
        return (
          <QueryClientProvider
            client={
              new QueryClient({
                defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
              })
            }
          >
            <Stack />
          </QueryClientProvider>
        );
      },
      'settings/stores': StoresScreen,
    },
    { initialUrl: '/settings/stores' },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('lists the stores with their receipt counts', async () => {
  mockApi.listStores.mockResolvedValue(twoStores);
  renderScreen();

  expect(await screen.findByText('Loblaws')).toBeTruthy();
  expect(screen.getByText('3 receipts')).toBeTruthy();
  expect(screen.getByText('1 receipt')).toBeTruthy();
});

it('merges one store into another the user picks', async () => {
  mockApi.listStores.mockResolvedValueOnce(twoStores).mockResolvedValue(merged);
  mockApi.mergeStore.mockResolvedValue(merged);
  renderScreen();

  fireEvent.press(
    await screen.findByLabelText('Merge REAL CANADIAN SUPERSTORE into another store'),
  );
  expect(screen.getByText('REAL CANADIAN SUPERSTORE is the same store as')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Merge REAL CANADIAN SUPERSTORE into Loblaws'));

  await waitFor(() => expect(mockApi.mergeStore).toHaveBeenCalledWith('s-rcss', 's-lob'));
  expect(await screen.findByText('Merged into Loblaws')).toBeTruthy();
  expect(screen.getByText('4 receipts')).toBeTruthy();
});

it('unmerges a merged store', async () => {
  mockApi.listStores.mockResolvedValueOnce(merged).mockResolvedValue(twoStores);
  mockApi.unmergeStore.mockResolvedValue(undefined);
  renderScreen();

  const unmerge = await screen.findByLabelText('Unmerge REAL CANADIAN SUPERSTORE');
  expect(unmerge.props.style).toEqual(expect.objectContaining({ minHeight: 44 }));
  fireEvent.press(unmerge);

  await waitFor(() => expect(mockApi.unmergeStore).toHaveBeenCalledWith('s-rcss'));
  expect(await screen.findByText('1 receipt')).toBeTruthy();
});

it('says so when a merge fails', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockApi.listStores.mockResolvedValue(twoStores);
  mockApi.mergeStore.mockRejectedValue(new Error('offline'));
  renderScreen();

  fireEvent.press(await screen.findByLabelText('Merge Loblaws into another store'));
  fireEvent.press(screen.getByLabelText('Merge Loblaws into REAL CANADIAN SUPERSTORE'));

  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith('Couldn’t save', 'Check your connection and try again.'),
  );
});

it('has no merge button with a single store', async () => {
  mockApi.listStores.mockResolvedValue({ stores: [twoStores.stores[0]] });
  renderScreen();

  expect(await screen.findByText('Loblaws')).toBeTruthy();
  expect(screen.queryByLabelText('Merge Loblaws into another store')).toBeNull();
  expect(
    screen.getByText('Once you shop at a second store, you can merge two that are the same.'),
  ).toBeTruthy();
});

it('scrolls the merge sheet when the user has many stores', async () => {
  const many: StoreList = {
    stores: Array.from({ length: 40 }, (_, i) => ({
      id: `s-${i}`,
      name: `Store ${String(i).padStart(2, '0')}`,
      receipt_count: 1,
      merged_stores: [],
    })),
  };
  mockApi.listStores.mockResolvedValue(many);
  renderScreen();

  fireEvent.press(await screen.findByLabelText('Merge Store 00 into another store'));

  // A FlatList (a scroll view), capped in height, holds every other store.
  const sheetList = screen.getByTestId('merge-sheet-list');
  expect(sheetList.type).toBe('RCTScrollView');
  const lists = screen.UNSAFE_getAllByType(FlatList);
  const sheet = lists.find((l) => l.props.testID === 'merge-sheet-list');
  expect(sheet?.props.data).toHaveLength(39);
  expect(StyleSheet.flatten(sheet?.props.style)).toEqual(expect.objectContaining({ flexGrow: 0 }));
});

it('shows an empty state with no stores', async () => {
  mockApi.listStores.mockResolvedValue({ stores: [] });
  renderScreen();

  expect(await screen.findByText('No stores yet')).toBeTruthy();
});

it('offers a retry when the stores fail to load', async () => {
  mockApi.listStores.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(twoStores);
  renderScreen();

  fireEvent.press(await screen.findByLabelText('Try again'));

  expect(await screen.findByText('Loblaws')).toBeTruthy();
});

// F4 (Simulator pass 2026-11-06): at AX5 the Merge button beside the name left
// too little room, and words broke mid-word ("Cost co", "receip ts"). At
// accessibility sizes the button goes under the name and count, which get the
// row's full width. Jest has no layout engine; the Simulator recheck draws it.
describe('Stores at large text sizes (F4)', () => {
  it('keeps the name and Merge side by side at the default size', async () => {
    mockApi.listStores.mockResolvedValue(twoStores);
    renderScreen();
    const row = await screen.findByTestId('store-row-s-lob');
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
  });

  it('stacks Merge under the whole name and count at AX5', async () => {
    mockWindow.fontScale = AX5_SCALE;
    mockApi.listStores.mockResolvedValue(merged);
    renderScreen();
    const row = await screen.findByTestId('store-row-s-lob');
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('column');
    expect(
      StyleSheet.flatten(screen.getByTestId('store-row-s-rcss').props.style).flexDirection,
    ).toBe('column');
    expect(screen.getByText('Loblaws').props.numberOfLines).toBeUndefined();
  });
});
