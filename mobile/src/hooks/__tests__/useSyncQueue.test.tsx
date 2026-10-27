import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ME_QUERY_KEY } from '@/features/auth/hooks/useAuth';
import type { UserProfile } from '@/features/auth/types';
import { useAuthStore } from '@/store/authStore';
import { useOfflineStore } from '@/store/offlineStore';
import { fakeAccessToken } from '@/testing/jwt';

import { SYNC_RETRY_DELAYS_MS, useSyncNow, useSyncQueue } from '../useSyncQueue';

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

function queue(status: 'pending' | 'failed' = 'pending', ownerId = 'user-a') {
  useOfflineStore.getState().addPendingReceipt({
    ownerId,
    imageUri: 'file:///doc/pending-receipts/a.jpg',
    mimeType: 'image/jpeg',
    capturedAt: '2026-10-26T10:00:00Z',
  });
  const id = useOfflineStore.getState().pendingReceipts.at(-1)!.id;
  useOfflineStore.getState().updateStatus(id, status);
}

function renderSync(client = new QueryClient()) {
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
  useAuthStore.setState({ accessToken: fakeAccessToken('user-a') });
});

afterEach(() => jest.restoreAllMocks());

function withConsentCache(granted: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(ME_QUERY_KEY, {
    id: 'user-a',
    ai_consent: {
      granted,
      granted_at: null,
      policy_version: null,
      current_policy_version: '2026-10-27',
    },
  } as unknown as UserProfile);
  return client;
}

describe('useSyncQueue', () => {
  it('holds the queue while the account has not allowed AI reading', () => {
    queue();
    renderSync(withConsentCache(false));

    expect(mockSync).not.toHaveBeenCalled();
  });

  it('uploads the held queue once the user allows AI reading', async () => {
    queue();
    const client = withConsentCache(false);
    renderSync(client);
    expect(mockSync).not.toHaveBeenCalled();

    act(() => {
      client.setQueryData<UserProfile>(ME_QUERY_KEY, (old) =>
        old ? { ...old, ai_consent: { ...old.ai_consent!, granted: true } } : old,
      );
    });

    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
  });

  it('marks consent missing when the server refuses an upload for it', async () => {
    queue();
    const client = withConsentCache(true);
    renderSync(client);

    await waitFor(() => expect(mockSync).toHaveBeenCalled());
    const { onConsentRequired } = mockSync.mock.calls[0][0] as { onConsentRequired: () => void };
    act(() => onConsentRequired());
    expect(client.getQueryData<UserProfile>(ME_QUERY_KEY)?.ai_consent?.granted).toBe(false);
  });

  it('syncs when online with photos queued, and refreshes receipts after an upload', async () => {
    mockSync.mockResolvedValue({ synced: 1, failed: 0 });
    queue();
    const { invalidate } = renderSync();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['receipts'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('uploads as the signed-in user', async () => {
    queue();
    renderSync();

    await waitFor(() => expect(mockSync).toHaveBeenCalled());
    expect(mockSync.mock.calls[0][0].ownerId).toBe('user-a');
  });

  it('lets the sync see who is signed in now, so it stops after an account switch', async () => {
    queue();
    renderSync();

    await waitFor(() => expect(mockSync).toHaveBeenCalled());
    const { currentOwner } = mockSync.mock.calls[0][0] as { currentOwner: () => string | null };
    expect(currentOwner()).toBe('user-a');
    act(() => useAuthStore.setState({ accessToken: fakeAccessToken('user-b') }));
    expect(currentOwner()).toBe('user-b');
  });

  it('does not sync another user’s photos', () => {
    queue('pending', 'user-b');
    renderSync();

    expect(mockSync).not.toHaveBeenCalled();
  });

  it('does not sync while signed out', () => {
    useAuthStore.setState({ accessToken: null });
    queue();
    renderSync();

    expect(mockSync).not.toHaveBeenCalled();
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

  describe('while the app stays in the foreground and online', () => {
    // Each run leaves the photo waiting to retry, as a server outage would.
    function failEachRun() {
      mockSync.mockImplementation(async () => {
        const [r] = useOfflineStore.getState().pendingReceipts;
        useOfflineStore.getState().markAttemptFailed(r.id);
        return { synced: 0, failed: 0 };
      });
    }

    // A plain property in the jest-expo mock, so set it rather than spy on it.
    const initialState = AppState.currentState;
    function setAppState(state: AppStateStatus) {
      (AppState as { currentState: AppStateStatus }).currentState = state;
    }

    beforeEach(() => {
      jest.useFakeTimers();
      setAppState('active');
    });
    afterEach(() => {
      jest.useRealTimers();
      setAppState(initialState);
    });

    async function advance(ms: number) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
      });
    }

    it('retries after a failed attempt, backing off each time', async () => {
      failEachRun();
      queue();
      renderSync();
      await advance(0);
      expect(mockSync).toHaveBeenCalledTimes(1);

      await advance(SYNC_RETRY_DELAYS_MS[0] - 1);
      expect(mockSync).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(mockSync).toHaveBeenCalledTimes(2);

      await advance(SYNC_RETRY_DELAYS_MS[1]);
      expect(mockSync).toHaveBeenCalledTimes(3);
    });

    it('never waits longer than the last delay', async () => {
      failEachRun();
      queue();
      renderSync();
      const total = SYNC_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
      await advance(total);
      const calls = mockSync.mock.calls.length;

      await advance(SYNC_RETRY_DELAYS_MS.at(-1)!);
      expect(mockSync).toHaveBeenCalledTimes(calls + 1);
    });

    it('does not schedule a retry when nothing failed', async () => {
      queue();
      renderSync();
      await advance(SYNC_RETRY_DELAYS_MS.at(-1)! * 2);

      expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it('skips a timed retry while the app is in the background', async () => {
      failEachRun();
      queue();
      renderSync();
      await advance(0);
      setAppState('background');

      await advance(SYNC_RETRY_DELAYS_MS[0]);
      expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it('stops retrying once unmounted (signed out)', async () => {
      failEachRun();
      queue();
      const { unmount } = renderSync();
      await advance(0);
      unmount();

      await advance(SYNC_RETRY_DELAYS_MS[0] * 2);
      expect(mockSync).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useSyncNow', () => {
  function renderSyncNow() {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { ...renderHook(() => useSyncNow(), { wrapper }), invalidate };
  }

  it('uploads the signed-in user’s photos on demand and refreshes after an upload', async () => {
    mockSync.mockResolvedValue({ synced: 1, failed: 0 });
    const { result, invalidate } = renderSyncNow();

    await act(async () => result.current());

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][0].ownerId).toBe('user-a');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['receipts'] });
  });

  it('does nothing while signed out', async () => {
    useAuthStore.setState({ accessToken: null });
    const { result } = renderSyncNow();

    await act(async () => result.current());

    expect(mockSync).not.toHaveBeenCalled();
  });
});
