/**
 * NFR reliability 3 / design "Offline · sync queue": receipts captured offline
 * show in History under Pending, with a banner while the phone is offline.
 */
import React from 'react';
import { Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import HistoryScreen from '../../app/(tabs)/history/index';
import { useAuthStore } from '@/store/authStore';
import { useOfflineStore } from '@/store/offlineStore';
import { fakeAccessToken } from '@/testing/jwt';
import type { ReceiptResponse } from '@/features/receipt-capture/types';
import { QUOTA_MESSAGE } from '@/features/receipt-capture/utils/scanQuota';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
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

const mockSyncNow = jest.fn();
jest.mock('@/hooks/useSyncQueue', () => ({
  useSyncNow: () => mockSyncNow,
}));

let mockConnected = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isConnected: mockConnected }),
}));

const synced: ReceiptResponse = {
  id: 'r-1',
  user_id: 'u-1',
  store_name: 'Whole Foods',
  date: '2026-10-17',
  subtotal: 73.91,
  tax: null,
  total: 73.91,
  currency: 'USD',
  image_url: null,
  extraction_confidence: 0.9,
  store_name_confidence: null,
  date_confidence: null,
  total_confidence: null,
  status: 'confirmed',
  items: [],
  created_at: null,
};

jest.mock('@/features/receipt-capture/hooks/useReceipts', () => ({
  useReceipts: () => ({
    data: { items: [synced], total: 1, page: 1, per_page: 20 },
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

function queue(status: 'pending' | 'failed' = 'pending', ownerId = 'user-a') {
  useOfflineStore.getState().addPendingReceipt({
    ownerId,
    imageUri: 'file:///doc/pending-receipts/a.jpg',
    mimeType: 'image/jpeg',
    capturedAt: TWO_HOURS_AGO,
  });
  const id = useOfflineStore.getState().pendingReceipts.at(-1)!.id;
  useOfflineStore.getState().updateStatus(id, status);
}

function renderHistory() {
  const routerScreen = renderRouter(
    {
      _layout: () => <Stack />,
      index: () => null,
      history: HistoryScreen,
      'manual-entry': () => null,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/history'));
  return routerScreen;
}

beforeEach(() => {
  mockSyncNow.mockClear();
  mockConnected = false;
  useOfflineStore.setState({ pendingReceipts: [] });
  useAuthStore.setState({ accessToken: fakeAccessToken('user-a') });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('History offline queue', () => {
  it('shows the offline banner and a Pending group for queued receipts', () => {
    queue();
    queue();
    renderHistory();

    expect(screen.getByText('Offline · 2 receipts queued')).toBeTruthy();
    expect(screen.getByText('Will sync')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getAllByText('Captured 2h ago · waiting for connection')).toHaveLength(2);
    expect(screen.getByText('Synced')).toBeTruthy();
    expect(screen.getByText('Whole Foods')).toBeTruthy();
  });

  it('says it is uploading once the phone is back online', () => {
    mockConnected = true;
    queue();
    renderHistory();

    expect(screen.getByText('Uploading 1 receipt…')).toBeTruthy();
    expect(screen.getByText('Captured 2h ago · uploading')).toBeTruthy();
  });

  it('says the upload waits to retry after an attempt failed while online', () => {
    mockConnected = true;
    queue();
    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().markAttemptFailed(id);
    renderHistory();

    expect(screen.getByText('1 receipt waiting to upload')).toBeTruthy();
    expect(screen.getByText('Captured 2h ago · will retry')).toBeTruthy();
    expect(screen.queryByText(/^Uploading/)).toBeNull();
  });

  it('lets the user retry the upload now from the banner', () => {
    mockConnected = true;
    queue();
    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().markAttemptFailed(id);
    renderHistory();

    fireEvent.press(screen.getByLabelText('Retry upload now'));

    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  it('offers no retry while offline: there is nothing to reach', () => {
    queue();
    renderHistory();

    expect(screen.queryByLabelText('Retry upload now')).toBeNull();
  });

  it('says uploading again once the retry starts', () => {
    mockConnected = true;
    queue();
    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().markAttemptFailed(id);
    useOfflineStore.getState().updateStatus(id, 'syncing');
    renderHistory();

    expect(screen.getByText('Uploading 1 receipt…')).toBeTruthy();
    expect(screen.getByText('Captured 2h ago · uploading')).toBeTruthy();
  });

  it('hides photos another user captured on this device', () => {
    queue('pending', 'user-b');
    queue('failed', 'user-b');
    renderHistory();

    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText(/receipts? queued/)).toBeNull();
    expect(screen.queryByText('Couldn’t read this photo')).toBeNull();
  });

  it('shows nothing extra when the queue is empty', () => {
    renderHistory();

    expect(screen.queryByText(/receipts? queued/)).toBeNull();
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText('Synced')).toBeNull();
  });

  it('lets the user discard a photo the server could not read', () => {
    queue('failed');
    const alert = jest.spyOn(Alert, 'alert');
    renderHistory();

    fireEvent.press(screen.getByText('Couldn’t read this photo'));
    const buttons = alert.mock.calls[0][2]!;
    act(() => buttons.find((b) => b.text === 'Discard')!.onPress!());

    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(0);
  });

  it('says a photo over the monthly quota hit the limit, not that it was unreadable', () => {
    queue();
    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().markFailed(id, 'quota');
    const alert = jest.spyOn(Alert, 'alert');
    renderHistory();

    expect(screen.queryByText('Couldn’t read this photo')).toBeNull();
    fireEvent.press(screen.getByText('Monthly scan limit reached'));
    expect(alert.mock.calls[0][0]).toBe('Monthly scan limit reached');
    expect(alert.mock.calls[0][1]).toBe(QUOTA_MESSAGE);
  });

  it('lets the user enter a failed photo by hand', () => {
    queue('failed');
    const alert = jest.spyOn(Alert, 'alert');
    const routerScreen = renderHistory();

    fireEvent.press(screen.getByText('Couldn’t read this photo'));
    const buttons = alert.mock.calls[0][2]!;
    act(() => buttons.find((b) => b.text === 'Enter manually')!.onPress!());

    expect(routerScreen.getPathname()).toBe('/manual-entry');
    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(0);
  });
});
