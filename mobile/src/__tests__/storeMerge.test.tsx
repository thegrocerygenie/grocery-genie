/**
 * V1.1 store merge (EC Price Intelligence 1, decision D3): Settings → Stores
 * lists the user's stores as their prices group them; the user merges one into
 * another, and unmerges it again.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import StoresScreen from '../../app/settings/stores';
import type { StoreList } from '@/features/price-intelligence/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

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
            client={new QueryClient({
              defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
            })}
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

  fireEvent.press(await screen.findByLabelText('Merge REAL CANADIAN SUPERSTORE into another store'));
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
