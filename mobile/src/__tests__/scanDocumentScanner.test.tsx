/**
 * RC-01 with Apple's document scanner (.planning/PLAN-2026-11-01-document-scanner.md):
 * AC 1 edge detection (the scanner opens on Scan), AC 2 quality feedback before
 * submission (a held-back page), AC 3 retake before submitting.
 */
import React from 'react';
import NetInfo from '@react-native-community/netinfo';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ScanScreen, { EXTRA_PAGES_HINT } from '../../app/(tabs)/scan';
import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents';
import { ApiError } from '@/services/api';
import { aiConsentMock } from '@/testing/aiConsentHooksMock';
import { fakeAccessToken } from '@/testing/jwt';
import { useAuthStore } from '@/store/authStore';
import { useOfflineStore } from '@/store/offlineStore';
import type { ScanOutcome } from '@/features/receipt-capture/services/documentScanner';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  Tabs: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: mockBack }),
  // Focus once, on mount, as the Scan tab opening does.
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => effect(), []);
  },
}));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  CameraView: () => null,
}));

const mockScanDocument = jest.fn<Promise<ScanOutcome>, []>();
jest.mock('@/features/receipt-capture/services/documentScanner', () => ({
  isDocumentScannerAvailable: () => true,
  scanDocument: () => mockScanDocument(),
}));
let mockVerdict: string | null = 'ok';
jest.mock('@/features/receipt-capture/services/frameSampler', () => ({
  sampleFrame: async () => null,
  scoreImage: async () => mockVerdict,
}));
const mockEmit = jest.fn();
jest.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({ emit: mockEmit }),
}));
jest.mock('@/features/receipt-capture/hooks/useReceiptImport', () => ({
  useReceiptImport: () => ({ importFrom: jest.fn(), progress: null }),
}));
const mockDeleted: string[] = [];
jest.mock('@/features/receipt-capture/services/pendingImageFiles', () => ({
  persistCapturedImage: (uri: string) => uri.replace('/tmp/', '/doc/pending-receipts/'),
  deleteQuietly: (uri: string) => mockDeleted.push(uri),
}));

type Handlers = { onSuccess: (r: unknown) => void; onError: (e: Error) => void };
let mockHandlers: Handlers | null = null;
const mockMutate = jest.fn((_params: unknown, handlers: Handlers) => {
  mockHandlers = handlers;
});
jest.mock('@/features/receipt-capture/hooks/useReceiptScan', () => ({
  useReceiptScan: () => ({ mutate: mockMutate }),
}));

const PAGE: ScanOutcome = {
  kind: 'page',
  uri: 'file:///tmp/page-1.jpg',
  mimeType: 'image/jpeg',
  width: 1500,
  height: 2000,
  droppedPages: 0,
};

function abandonments() {
  return mockEmit.mock.calls.filter(([event]) => event === ANALYTICS_EVENTS.RECEIPT_ABANDONED);
}

beforeEach(() => {
  jest.clearAllMocks();
  aiConsentMock.granted = true;
  mockHandlers = null;
  mockVerdict = 'ok';
  mockDeleted.length = 0;
  mockScanDocument.mockResolvedValue(PAGE);
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
  useOfflineStore.setState({ pendingReceipts: [] });
  useAuthStore.setState({ accessToken: fakeAccessToken('user-a') });
});

describe('Scan with the document scanner', () => {
  it('opens the scanner when Scan opens, instead of the custom camera (AC 1)', async () => {
    render(<ScanScreen />);

    await waitFor(() => expect(mockScanDocument).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText('Capture receipt')).toBeNull();
  });

  it('uploads a clear page and opens Review', async () => {
    render(<ScanScreen />);

    await waitFor(() => expect(mockHandlers).not.toBeNull());
    expect(mockMutate.mock.calls[0][0]).toEqual({
      imageUri: 'file:///tmp/page-1.jpg',
      mimeType: 'image/jpeg',
      source: 'camera',
    });
    expect(screen.getByText('Reading receipt…')).toBeTruthy();

    act(() => mockHandlers!.onSuccess({}));
    expect(mockPush).toHaveBeenCalledWith('/review');
    expect(abandonments()).toHaveLength(0);
  });

  it('goes back without uploading when the scan is cancelled, and counts it once', async () => {
    mockScanDocument.mockResolvedValue({ kind: 'cancelled' });
    const { unmount } = render(<ScanScreen />);

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockMutate).not.toHaveBeenCalled();
    unmount();
    expect(abandonments()).toEqual([[ANALYTICS_EVENTS.RECEIPT_ABANDONED, { stage: 'capture' }]]);
  });

  it('holds back a blurry page and says why, before anything uploads (AC 2)', async () => {
    mockVerdict = 'blurry';
    render(<ScanScreen />);

    await waitFor(() => expect(screen.getByText('Image looks blurry — hold steady')).toBeTruthy());
    expect(screen.getByTestId('scan-page-preview')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('retakes a held-back page: the scanner opens again and the page is deleted (AC 3)', async () => {
    mockVerdict = 'dark';
    render(<ScanScreen />);
    await waitFor(() => expect(screen.getByLabelText('Retake receipt')).toBeTruthy());

    mockVerdict = 'ok';
    mockScanDocument.mockResolvedValueOnce({ ...PAGE, uri: 'file:///tmp/page-2.jpg' });
    fireEvent.press(screen.getByLabelText('Retake receipt'));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    expect(mockScanDocument).toHaveBeenCalledTimes(2);
    expect(mockDeleted).toContain('file:///tmp/page-1.jpg');
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ imageUri: 'file:///tmp/page-2.jpg' });
  });

  it('uploads a held-back page when the user keeps it', async () => {
    mockVerdict = 'blurry';
    render(<ScanScreen />);
    await waitFor(() => expect(screen.getByLabelText('Use this scan')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Use this scan'));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    expect(mockDeleted).not.toContain('file:///tmp/page-1.jpg');
  });

  it('says only the first page was kept from a multi-page scan', async () => {
    mockScanDocument.mockResolvedValue({ ...PAGE, droppedPages: 2 });
    render(<ScanScreen />);

    await waitFor(() => expect(screen.getByText(EXTRA_PAGES_HINT)).toBeTruthy());
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('queues the page when the phone is offline', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
    render(<ScanScreen />);

    await waitFor(() => expect(screen.getByText('Saved · will upload automatically')).toBeTruthy());
    const [queued] = useOfflineStore.getState().pendingReceipts;
    expect(queued.imageUri).toBe('file:///doc/pending-receipts/page-1.jpg');
    expect(queued.mimeType).toBe('image/jpeg');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows the server’s reason for a rejected page, and Scan tries again', async () => {
    render(<ScanScreen />);
    await waitFor(() => expect(mockHandlers).not.toBeNull());

    act(() =>
      mockHandlers!.onError(
        new ApiError(422, { detail: 'Image quality insufficient: Image appears blurry' }),
      ),
    );
    expect(screen.getByText('Image looks blurry — hold steady')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Scan receipt'));
    await waitFor(() => expect(mockScanDocument).toHaveBeenCalledTimes(2));
  });

  it('records a consent refusal from the server', async () => {
    render(<ScanScreen />);
    await waitFor(() => expect(mockHandlers).not.toBeNull());

    act(() =>
      mockHandlers!.onError(
        new ApiError(403, { detail: { code: 'ai_consent_required', message: 'Allow first.' } }),
      ),
    );

    expect(aiConsentMock.markRequired).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Reading receipt…')).toBeNull();
  });

  it('shows an error when the scanner fails to open', async () => {
    mockScanDocument.mockResolvedValue({ kind: 'failed', message: 'camera unavailable' });
    render(<ScanScreen />);

    await waitFor(() => expect(screen.getByTestId('scan-error-pill')).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('does not open the scanner before consent', () => {
    aiConsentMock.granted = false;
    render(<ScanScreen />);

    expect(mockScanDocument).not.toHaveBeenCalled();
  });
});
