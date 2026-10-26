/**
 * The tab screens put their buttons in the navigation header (History's "+"
 * capture menu, Budget's Settings). Those headers only render when each tab
 * has its own Stack. This mounts the real app/(tabs) folder to prove it.
 */
import React from 'react';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}));
jest.mock('expo-blur', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    BlurView: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>,
  };
});
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [null, jest.fn()],
}));
jest.mock('@react-native-segmented-control/segmented-control', () => () => null);
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({ data: undefined, isLoading: false, refetch: jest.fn() }),
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
jest.mock('@/features/receipt-capture/hooks/useReceiptImport', () => ({
  useReceiptImport: () => ({ importFrom: jest.fn(), progress: null }),
}));

const TABS_DIR = 'app/(tabs)';

describe('tab screen headers', () => {
  it('shows the Settings button on the Budget tab', async () => {
    renderRouter(TABS_DIR, { initialUrl: '/' });

    expect(await screen.findByLabelText('Settings')).toBeTruthy();
  });

  it('shows the add-receipt button on History, which opens the capture menu', async () => {
    renderRouter(TABS_DIR, { initialUrl: '/history' });

    fireEvent.press(await screen.findByLabelText('Add receipt'));

    expect(screen.getByLabelText('Choose from Library')).toBeTruthy();
    expect(screen.getByLabelText('Choose Files')).toBeTruthy();
  });

  it('keeps the routes the rest of the app links to', async () => {
    const router = renderRouter(TABS_DIR, { initialUrl: '/history' });
    expect(router.getPathname()).toBe('/history');
  });
});
