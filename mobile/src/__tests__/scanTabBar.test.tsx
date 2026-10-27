/**
 * Design "Scan · capture": the camera fills the screen with no tab bar; Cancel
 * is the way out. The permission screens keep the tab bar, since they have no
 * Cancel.
 */
import React from 'react';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
  jest.requireActual('@/testing/aiConsentHooksMock'),
);
jest.mock('@/hooks/useSyncQueue', () => ({ useSyncNow: () => jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {},
}));
jest.mock('expo-blur', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    BlurView: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>,
  };
});
let mockGranted = true;
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: mockGranted, canAskAgain: true }, jest.fn()],
}));
jest.mock('@react-native-segmented-control/segmented-control', () => () => null);
jest.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({ emit: jest.fn() }),
}));
jest.mock('@/features/receipt-capture/hooks/useReceiptScan', () => ({
  useReceiptScan: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/receipt-capture/hooks/useReceiptImport', () => ({
  useReceiptImport: () => ({ importFrom: jest.fn(), progress: null }),
}));
jest.mock('@/features/receipt-capture/hooks/useReceipts', () => ({
  useReceipts: () => ({
    data: { items: [], total: 0 },
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));
jest.mock('@/features/lifecycle/hooks/useLifecycle', () => ({
  useDeleteReceipt: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({ data: undefined, isLoading: true, refetch: jest.fn() }),
}));

const TABS_DIR = 'app/(tabs)';

beforeEach(() => {
  mockGranted = true;
});

describe('Scan tab bar', () => {
  it('hides the tab bar while the camera is showing', async () => {
    renderRouter(TABS_DIR, { initialUrl: '/scan' });

    expect(await screen.findByLabelText('Capture receipt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
  });

  it('keeps the tab bar on the camera-permission screen', async () => {
    mockGranted = false;
    renderRouter(TABS_DIR, { initialUrl: '/scan' });

    expect(await screen.findByText('Allow Camera Access')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
  });

  it('brings the tab bar back after leaving Scan', async () => {
    const router = renderRouter(TABS_DIR, { initialUrl: '/history' });
    fireEvent.press(await screen.findByRole('button', { name: 'Scan' }));
    expect(await screen.findByLabelText('Capture receipt')).toBeTruthy();

    fireEvent.press(screen.getByText('Cancel'));

    expect(router.getPathname()).toBe('/history');
    expect(await screen.findByRole('button', { name: 'Budget' })).toBeTruthy();
    await act(async () => undefined);
  });
});
