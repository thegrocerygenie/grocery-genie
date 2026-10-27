/**
 * When receipts cannot load (server down, no connection), History says so and
 * offers a retry instead of the "No receipts yet" empty state.
 */
import React from 'react';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import HistoryScreen from '../../app/(tabs)/history/index';
import { useAuthStore } from '@/store/authStore';
import { useOfflineStore } from '@/store/offlineStore';
import { fakeAccessToken } from '@/testing/jwt';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncNow: () => jest.fn() }));
jest.mock('@react-native-segmented-control/segmented-control', () => () => null);
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));
jest.mock('@/features/lifecycle/hooks/useLifecycle', () => ({
  useDeleteReceipt: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/receipt-capture/hooks/useReceiptImport', () => ({
  useReceiptImport: () => ({ importFrom: jest.fn(), progress: null }),
}));
jest.mock('@/features/receipt-capture/services/pendingImageFiles', () => ({
  deletePendingImage: jest.fn(),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isConnected: false }),
}));

const mockRefetch = jest.fn();
let mockIsError = false;
jest.mock('@/features/receipt-capture/hooks/useReceipts', () => ({
  useReceipts: () => ({
    data: undefined,
    isError: mockIsError,
    isLoading: false,
    isRefetching: false,
    refetch: mockRefetch,
  }),
}));

function renderHistory() {
  renderRouter(
    { _layout: () => <Stack />, index: () => null, history: HistoryScreen },
    { initialUrl: '/' },
  );
  act(() => router.push('/history'));
}

beforeEach(() => {
  mockIsError = false;
  mockRefetch.mockClear();
  useOfflineStore.setState({ pendingReceipts: [] });
  useAuthStore.setState({ accessToken: fakeAccessToken('user-a') });
});

describe('History load error', () => {
  it('shows an error with a retry, not the empty state, when the load fails', () => {
    mockIsError = true;
    renderHistory();

    expect(screen.getByText('Couldn’t load your receipts')).toBeTruthy();
    expect(screen.queryByText('No receipts yet')).toBeNull();

    fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('still shows photos queued on this device above the error', () => {
    mockIsError = true;
    useOfflineStore.getState().addPendingReceipt({
      ownerId: 'user-a',
      imageUri: 'file:///doc/pending-receipts/a.jpg',
      mimeType: 'image/jpeg',
      capturedAt: new Date().toISOString(),
    });
    renderHistory();

    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Couldn’t load your receipts')).toBeTruthy();
  });

  it('still shows the empty state when the load works and there are no receipts', () => {
    renderHistory();

    expect(screen.getByText('No receipts yet')).toBeTruthy();
    expect(screen.queryByText('Couldn’t load your receipts')).toBeNull();
  });
});
