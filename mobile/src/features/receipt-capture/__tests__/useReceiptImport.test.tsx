import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { answerAiConsent } from '@/features/ai-consent/services/consentPrompt';
import { ME_QUERY_KEY } from '@/features/auth/hooks/useAuth';
import type { UserProfile } from '@/features/auth/types';
import { ApiError } from '@/services/api';
import { useReceiptStore } from '@/store/receiptStore';

import { useReceiptImport } from '../hooks/useReceiptImport';
import { persistCapturedImage } from '../services/pendingImageFiles';
import { scanReceipt } from '../services/receiptApi';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../services/receiptApi', () => ({ scanReceipt: jest.fn() }));
jest.mock('../services/pendingImageFiles', () => ({
  persistCapturedImage: jest.fn((uri: string) =>
    uri.replace('file:///', 'file:///doc/pending-receipts/'),
  ),
}));

const launchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const getDocument = DocumentPicker.getDocumentAsync as jest.Mock;
const scan = scanReceipt as jest.Mock;

const response = { receipt_id: 'r-9', status: 'pending_review', extraction: { items: [] } };

function renderImportHook(consent?: boolean) {
  // gcTime Infinity: a finished mutation otherwise schedules a 5-minute cache
  // timer that keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  if (consent !== undefined) {
    client.setQueryData(ME_QUERY_KEY, {
      id: 'u-1',
      ai_consent: {
        granted: consent,
        granted_at: null,
        policy_version: null,
        current_policy_version: '2026-10-27',
      },
    } as unknown as UserProfile);
  }
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useReceiptImport(), { wrapper }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  useReceiptStore.getState().clearScanSession();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

it('uploads a library photo and opens the same review screen as a camera scan', async () => {
  launchLibrary.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', width: 1200, height: 1600, mimeType: 'image/jpeg' }],
  });
  scan.mockResolvedValue(response);
  const { result } = renderImportHook();

  await act(() => result.current.importFrom('library'));

  expect(scan).toHaveBeenCalledWith('file:///photo.jpg', 'image/jpeg', 'library');
  expect(useReceiptStore.getState().activeScanResponse).toEqual(response);
  expect(useReceiptStore.getState().capturedImageUri).toBe('file:///photo.jpg');
  expect(mockPush).toHaveBeenCalledWith('/review');
  expect(result.current.progress).toBeNull();
});

it('uploads a PDF from Files and previews it through the server image', async () => {
  getDocument.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///r.pdf', name: 'r.pdf', mimeType: 'application/pdf', size: 1000 }],
  });
  scan.mockResolvedValue(response);
  const { result } = renderImportHook();

  await act(() => result.current.importFrom('files'));

  expect(scan).toHaveBeenCalledWith('file:///r.pdf', 'application/pdf', 'pdf');
  expect(useReceiptStore.getState().capturedImageUri).toBe('/api/receipts/r-9/image');
  expect(mockPush).toHaveBeenCalledWith('/review');
});

it('does nothing when the user cancels the picker', async () => {
  launchLibrary.mockResolvedValue({ canceled: true, assets: null });
  const { result } = renderImportHook();

  await act(() => result.current.importFrom('library'));

  expect(scan).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it('shows the server reason and stays put when the upload is rejected', async () => {
  getDocument.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///r.pdf', name: 'r.pdf', mimeType: 'application/pdf', size: 1000 }],
  });
  scan.mockRejectedValue(
    new ApiError(422, { detail: 'Only single-page PDF receipts are supported.' }),
  );
  const { result } = renderImportHook();

  await act(() => result.current.importFrom('files'));

  expect(Alert.alert).toHaveBeenCalledWith(
    'Couldn’t import receipt',
    'Only single-page PDF receipts are supported.',
  );
  expect(mockPush).not.toHaveBeenCalled();
  expect(result.current.progress).toBeNull();
});

it('reports a picker that fails to open', async () => {
  launchLibrary.mockRejectedValue(new Error('presentation failed'));
  const { result } = renderImportHook();

  await act(() => result.current.importFrom('library'));

  expect(Alert.alert).toHaveBeenCalledWith(
    'Couldn’t import receipt',
    'The picker couldn’t open. Try again.',
  );
});

describe('an import that cannot upload now', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useOfflineStore } = require('@/store/offlineStore');
    useOfflineStore.setState({ pendingReceipts: [] });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('@/store/authStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fakeAccessToken } = require('@/testing/jwt');
    useAuthStore.setState({ accessToken: fakeAccessToken('user-a') });
  });

  it('queues a library photo when the network fails, and says so', async () => {
    launchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', width: 1200, height: 1600, mimeType: 'image/jpeg' }],
    });
    scan.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = renderImportHook();

    await act(() => result.current.importFrom('library'));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useOfflineStore } = require('@/store/offlineStore');
    const [queued] = useOfflineStore.getState().pendingReceipts;
    expect(queued).toMatchObject({
      imageUri: 'file:///doc/pending-receipts/photo.jpg',
      mimeType: 'image/jpeg',
      source: 'library',
      ownerId: 'user-a',
      status: 'pending',
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Saved to upload later',
      expect.stringContaining('Pending in History'),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not queue or copy a photo when the session has no user id, and says it failed', async () => {
    // Without an owner no session could ever upload it, so it would be orphaned.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('@/store/authStore');
    useAuthStore.setState({ accessToken: 'not-a-jwt' });
    launchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', width: 1200, height: 1600, mimeType: 'image/jpeg' }],
    });
    scan.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = renderImportHook();

    await act(() => result.current.importFrom('library'));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useOfflineStore } = require('@/store/offlineStore');
    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(0);
    expect(persistCapturedImage).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Couldn’t import receipt', expect.any(String));
  });
});

describe('AI consent (App Store 5.1.2(i))', () => {
  const photo = {
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', width: 1200, height: 1600, mimeType: 'image/jpeg' }],
  };

  it('asks for consent before picking, and stops on manual entry', async () => {
    launchLibrary.mockResolvedValue(photo);
    const { result } = renderImportHook(false);

    let done: Promise<void> | undefined;
    act(() => {
      done = result.current.importFrom('library');
    });
    expect(mockPush).toHaveBeenCalledWith('/ai-consent');
    expect(launchLibrary).not.toHaveBeenCalled();

    answerAiConsent(false);
    await act(() => done!);
    expect(launchLibrary).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
  });

  it('imports after the user allows it', async () => {
    launchLibrary.mockResolvedValue(photo);
    scan.mockResolvedValue(response);
    const { result } = renderImportHook(false);

    let done: Promise<void> | undefined;
    act(() => {
      done = result.current.importFrom('library');
    });
    answerAiConsent(true);
    await act(() => done!);

    expect(scan).toHaveBeenCalledWith('file:///photo.jpg', 'image/jpeg', 'library');
    expect(mockPush).toHaveBeenLastCalledWith('/review');
  });

  it('opens the consent sheet when the server refuses for consent', async () => {
    launchLibrary.mockResolvedValue(photo);
    scan.mockRejectedValue(
      new ApiError(403, { detail: { code: 'ai_consent_required', message: 'Allow first.' } }),
    );
    const { client, result } = renderImportHook(true);

    let done: Promise<void> | undefined;
    act(() => {
      done = result.current.importFrom('library');
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/ai-consent'));
    expect(client.getQueryData<UserProfile>(ME_QUERY_KEY)?.ai_consent?.granted).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    answerAiConsent(false);
    await act(() => done!);
  });
});
