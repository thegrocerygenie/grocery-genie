/**
 * NFR reliability 3: a receipt captured without a connection is queued on the
 * device, not lost, and uploads later from the sync queue.
 */
import React from 'react';
import NetInfo from '@react-native-community/netinfo';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ScanScreen from '../../app/(tabs)/scan';
import { ApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useOfflineStore } from '@/store/offlineStore';
import { fakeAccessToken } from '@/testing/jwt';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  Tabs: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('expo-camera', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual('react');
  return {
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
    CameraView: forwardRef((_props: unknown, ref: unknown) => {
      useImperativeHandle(ref, () => ({
        takePictureAsync: () => Promise.resolve({ uri: 'file:///cache/Camera/shot.jpg' }),
      }));
      return null;
    }),
  };
});
jest.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({ emit: jest.fn() }),
}));
jest.mock('@/features/receipt-capture/hooks/useReceiptImport', () => ({
  useReceiptImport: () => ({ importFrom: jest.fn(), progress: null }),
}));
jest.mock('@/features/receipt-capture/services/pendingImageFiles', () => ({
  persistCapturedImage: (uri: string) => uri.replace('/cache/Camera/', '/doc/pending-receipts/'),
  deletePendingImage: jest.fn(),
}));

const mockPush = jest.fn();
let mockScanError: Error | null = null;
jest.mock('@/features/receipt-capture/hooks/useReceiptScan', () => ({
  useReceiptScan: () => ({
    mutate: (
      _params: unknown,
      handlers: { onSuccess: (r: unknown) => void; onError: (e: Error) => void },
    ) => (mockScanError ? handlers.onError(mockScanError) : handlers.onSuccess({})),
  }),
}));

function online(isConnected: boolean) {
  (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected });
}

beforeEach(() => {
  mockScanError = null;
  mockPush.mockClear();
  useOfflineStore.setState({ pendingReceipts: [] });
  useAuthStore.setState({ accessToken: fakeAccessToken('user-a') });
});

describe('Scan queues receipts it cannot upload', () => {
  it('queues the photo without uploading when the phone is offline', async () => {
    online(false);
    render(<ScanScreen />);

    fireEvent.press(screen.getByLabelText('Capture receipt'));

    await waitFor(() => expect(screen.getByText('Saved · will upload automatically')).toBeTruthy());
    const [queued] = useOfflineStore.getState().pendingReceipts;
    expect(queued.imageUri).toBe('file:///doc/pending-receipts/shot.jpg');
    expect(queued.status).toBe('pending');
    expect(queued.ownerId).toBe('user-a');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('queues the photo when the upload fails on the network', async () => {
    online(true);
    mockScanError = new TypeError('Network request failed');
    render(<ScanScreen />);

    fireEvent.press(screen.getByLabelText('Capture receipt'));

    await waitFor(() => expect(useOfflineStore.getState().pendingReceipts).toHaveLength(1));
  });

  it('does not queue a photo the server rejected', async () => {
    online(true);
    mockScanError = new ApiError(422, { detail: 'This doesn’t appear to be a receipt.' });
    render(<ScanScreen />);

    fireEvent.press(screen.getByLabelText('Capture receipt'));

    await waitFor(() => expect(screen.queryByText('Capturing…')).toBeNull());
    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(0);
  });

  it('opens review when online and the scan succeeds', async () => {
    online(true);
    render(<ScanScreen />);

    fireEvent.press(screen.getByLabelText('Capture receipt'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/review'));
    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(0);
  });
});
