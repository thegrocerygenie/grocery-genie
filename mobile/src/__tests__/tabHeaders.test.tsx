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
const mockDashboard = { isLoading: false };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: undefined,
    isLoading: mockDashboard.isLoading,
    refetch: jest.fn(),
  }),
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

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

// The native stack passes the header title to its host config as a prop, not as Text.
function headerTitles(): string[] {
  const titles: string[] = [];
  const walk = (node: HostNode | string): void => {
    if (typeof node === 'string') return;
    if (node.type === 'RNSScreenStackHeaderConfig') titles.push(String(node.props.title));
    node.children?.forEach(walk);
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  (Array.isArray(root) ? root : root ? [root] : []).forEach(walk);
  return titles;
}

describe('tab screen headers', () => {
  beforeEach(() => {
    mockDashboard.isLoading = false;
  });

  it('shows the Settings button on the Budget tab', async () => {
    renderRouter(TABS_DIR, { initialUrl: '/' });

    expect(await screen.findByLabelText('Settings')).toBeTruthy();
  });

  it('titles the Budget tab "Budget" while its data loads, not the route name', async () => {
    mockDashboard.isLoading = true;
    renderRouter(TABS_DIR, { initialUrl: '/' });

    expect(headerTitles()).toEqual(['Budget']);
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
