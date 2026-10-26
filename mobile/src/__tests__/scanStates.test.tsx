/**
 * Design "Scan · processing" and "Scan · low quality": a full-screen reading
 * state over the captured photo, and a specific hint when the photo is rejected.
 */
import React from 'react';
import NetInfo from '@react-native-community/netinfo';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ScanScreen from '../../app/(tabs)/scan';
import { ApiError } from '@/services/api';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  Tabs: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
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
  persistCapturedImage: (uri: string) => uri,
}));

type Handlers = { onSuccess: (r: unknown) => void; onError: (e: Error) => void };
let mockHandlers: Handlers | null = null;
jest.mock('@/features/receipt-capture/hooks/useReceiptScan', () => ({
  useReceiptScan: () => ({
    mutate: (_params: unknown, handlers: Handlers) => {
      mockHandlers = handlers;
    },
  }),
}));

beforeEach(() => {
  mockHandlers = null;
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
});

async function capture() {
  render(<ScanScreen />);
  fireEvent.press(screen.getByLabelText('Capture receipt'));
  await waitFor(() => expect(mockHandlers).not.toBeNull());
}

describe('Scan states', () => {
  it('covers the camera with a reading state over the captured photo', async () => {
    await capture();

    expect(screen.getByText('Reading receipt…')).toBeTruthy();
    expect(screen.getByText('This takes a few seconds.')).toBeTruthy();
    expect(screen.getByTestId('scan-processing-photo').props.source).toEqual({
      uri: 'file:///cache/Camera/shot.jpg',
    });
    expect(screen.queryByLabelText('Capture receipt')).toBeNull();
  });

  it('tells the user to hold steady when the server says the photo is blurry', async () => {
    await capture();
    act(() =>
      mockHandlers!.onError(
        new ApiError(422, {
          detail: 'Image quality insufficient: Image appears blurry (score: 42.0)',
        }),
      ),
    );

    expect(screen.getByText('Image looks blurry — hold steady')).toBeTruthy();
    expect(screen.queryByText('Reading receipt…')).toBeNull();
    expect(screen.getByLabelText('Capture receipt')).toBeTruthy();
  });

  it('keeps the generic hint for a reason it does not know', async () => {
    await capture();
    act(() => mockHandlers!.onError(new ApiError(422, { detail: 'Empty file uploaded.' })));

    expect(screen.getByText('Couldn’t read that — try again')).toBeTruthy();
  });
});
