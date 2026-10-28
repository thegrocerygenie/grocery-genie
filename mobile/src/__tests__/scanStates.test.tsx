/**
 * Design "Scan · processing" and "Scan · low quality": a full-screen reading
 * state over the captured photo, and a specific hint when the photo is rejected.
 */
import React from 'react';
import NetInfo from '@react-native-community/netinfo';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ScanScreen from '../../app/(tabs)/scan';
import { ApiError } from '@/services/api';
import { aiConsentMock } from '@/testing/aiConsentHooksMock';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
const mockPush = jest.fn();
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
let mockFrame: string | null = null;
jest.mock('@/features/receipt-capture/services/frameSampler', () => ({
  sampleFrame: async () => mockFrame,
}));
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
  jest.clearAllMocks();
  aiConsentMock.granted = true;
  mockHandlers = null;
  mockFrame = null;
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

  it.each([
    ['blurry', 'Image looks blurry — hold steady'],
    ['dark', 'Too dark — find more light'],
    ['bright', 'Too much glare — tilt the receipt'],
  ])('warns before capture when the view is %s (RC-01 AC 2)', async (verdict, hint) => {
    mockFrame = verdict;
    render(<ScanScreen />);

    expect(await screen.findByText(hint)).toBeTruthy();
    expect(screen.queryByText('Looks clear — tap to capture')).toBeNull();
  });

  // L1: nothing detects a receipt, so the pill never claims one.
  it('says the view is clear when it is fine', async () => {
    mockFrame = 'ok';
    render(<ScanScreen />);

    expect(await screen.findByText('Looks clear — tap to capture')).toBeTruthy();
    expect(screen.queryByText('Receipt detected')).toBeNull();
  });

  it('asks to frame the receipt before the first check', async () => {
    mockFrame = null;
    render(<ScanScreen />);

    expect(await screen.findByText('Fit the receipt in the frame')).toBeTruthy();
    expect(screen.queryByText('Receipt detected')).toBeNull();
  });
});

// App Store 5.1.2(i): the photo goes to Anthropic, so the tab asks first.
describe('Scan without AI consent', () => {
  it('shows the consent screen instead of the camera', () => {
    aiConsentMock.granted = false;
    render(<ScanScreen />);

    expect(screen.getByText('Read receipts with AI')).toBeTruthy();
    expect(screen.getAllByText(/Anthropic/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Capture receipt')).toBeNull();
  });

  it('Allow records consent', () => {
    aiConsentMock.granted = false;
    render(<ScanScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Allow' }));
    expect(aiConsentMock.grant).toHaveBeenCalledTimes(1);
  });

  it('offers manual entry instead', () => {
    aiConsentMock.granted = false;
    render(<ScanScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Enter receipts manually' }));
    expect(mockPush).toHaveBeenCalledWith('/manual-entry');
    expect(aiConsentMock.grant).not.toHaveBeenCalled();
  });

  it('shows the camera while consent is unknown: the server decides', () => {
    aiConsentMock.granted = undefined;
    render(<ScanScreen />);

    expect(screen.getByLabelText('Capture receipt')).toBeTruthy();
  });

  it('records the server refusal, which brings the consent screen back', async () => {
    await capture();
    act(() =>
      mockHandlers!.onError(
        new ApiError(403, { detail: { code: 'ai_consent_required', message: 'Allow first.' } }),
      ),
    );

    expect(aiConsentMock.markRequired).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Reading receipt…')).toBeNull();
  });
});
