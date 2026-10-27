/**
 * After the server deletes the account, the device drops what it kept for
 * that account: the session, its queued receipts and their photos, alert
 * settings, the push token, and the scan in progress. Other accounts' queued
 * receipts on the same device stay.
 */
import { clearLocalAccountData } from '@/features/auth/services/clearLocalAccountData';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useOfflineStore } from '@/store/offlineStore';
import { usePushStore } from '@/store/pushStore';
import { useReceiptStore } from '@/store/receiptStore';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mockDeletePendingImage = jest.fn();
jest.mock('@/features/receipt-capture/services/pendingImageFiles', () => ({
  deletePendingImage: (uri: string) => mockDeletePendingImage(uri),
}));

function queue(ownerId: string, imageUri: string) {
  useOfflineStore.getState().addPendingReceipt({
    imageUri,
    mimeType: 'image/jpeg',
    capturedAt: '2026-10-27T00:00:00Z',
    ownerId,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  useOfflineStore.setState({ pendingReceipts: [] });
  queue('u-1', 'file:///a.jpg');
  queue('u-2', 'file:///b.jpg');
  queue('u-1', 'file:///c.jpg');
  useNotificationStore.getState().setThreshold('fiftyPercent', true);
  useNotificationStore.getState().setWeeklySummaryEnabled(false);
  usePushStore.getState().setToken('ExponentPushToken[x]');
  useReceiptStore.getState().setCapturedImageUri('file:///scan.jpg');
  await useAuthStore.getState().setSession({ accessToken: 'a', refreshToken: 'r' });
});

describe('clearLocalAccountData', () => {
  it("drops the account's queued receipts and their photos, and keeps other accounts'", async () => {
    await clearLocalAccountData('u-1');

    const left = useOfflineStore.getState().pendingReceipts;
    expect(left.map((r) => r.ownerId)).toEqual(['u-2']);
    expect(mockDeletePendingImage.mock.calls.map(([uri]) => uri).sort()).toEqual([
      'file:///a.jpg',
      'file:///c.jpg',
    ]);
  });

  it('signs out and resets alert settings, push token and the scan in progress', async () => {
    await clearLocalAccountData('u-1');

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(useNotificationStore.getState().preferences).toEqual({
      fiftyPercent: false,
      eightyPercent: true,
      hundredPercent: true,
      weeklySummaryEnabled: true,
      weeklySummaryDay: 0,
    });
    expect(usePushStore.getState().token).toBeNull();
    expect(useReceiptStore.getState().capturedImageUri).toBeNull();
  });

  it('with no known owner, still signs out and keeps the queue', async () => {
    await clearLocalAccountData(null);

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(3);
    expect(mockDeletePendingImage).not.toHaveBeenCalled();
  });
});
