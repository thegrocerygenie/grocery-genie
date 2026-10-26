import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useOfflineStore } from '@/store/offlineStore';

import { useSyncQueue } from '../useSyncQueue';

let mockConnected = true;
jest.mock('../useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isConnected: mockConnected }),
}));
const mockSync = jest.fn();
jest.mock('@/features/receipt-capture/services/offlineQueue', () => ({
  syncPendingReceipts: (...args: unknown[]) => mockSync(...args),
}));
jest.mock('@/features/receipt-capture/services/pendingImageFiles', () => ({
  deletePendingImage: jest.fn(),
}));

function queue(status: 'pending' | 'failed' = 'pending') {
  useOfflineStore.getState().addPendingReceipt({
    imageUri: 'file:///doc/pending-receipts/a.jpg',
    mimeType: 'image/jpeg',
    capturedAt: '2026-10-26T10:00:00Z',
  });
  const id = useOfflineStore.getState().pendingReceipts.at(-1)!.id;
  useOfflineStore.getState().updateStatus(id, status);
}

function renderSync() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useSyncQueue(), { wrapper }), invalidate };
}

beforeEach(() => {
  mockConnected = true;
  mockSync.mockReset().mockResolvedValue({ synced: 0, failed: 0 });
  useOfflineStore.setState({ pendingReceipts: [] });
});

afterEach(() => jest.restoreAllMocks());

describe('useSyncQueue', () => {
  it('syncs when online with photos queued, and refreshes receipts after an upload', async () => {
    mockSync.mockResolvedValue({ synced: 1, failed: 0 });
    queue();
    const { invalidate } = renderSync();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['receipts'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('waits while offline', () => {
    mockConnected = false;
    queue();
    renderSync();

    expect(mockSync).not.toHaveBeenCalled();
  });

  it('does not sync for photos that already failed', () => {
    queue('failed');
    renderSync();

    expect(mockSync).not.toHaveBeenCalled();
  });

  it('does not refresh queries when nothing uploaded', async () => {
    queue();
    const { invalidate } = renderSync();

    await waitFor(() => expect(mockSync).toHaveBeenCalled());
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('retries when the app returns to the foreground', async () => {
    let onChange: (state: AppStateStatus) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler as (state: AppStateStatus) => void;
      return { remove: jest.fn() };
    });
    queue();
    renderSync();
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));

    await act(async () => onChange('active'));

    expect(mockSync).toHaveBeenCalledTimes(2);
  });
});
