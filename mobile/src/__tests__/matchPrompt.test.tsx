/**
 * PI-02 AC 5-9 (DA-5): the full-screen "Same item?" prompt. What it shows,
 * its four actions, where it opens (Review Matches, item detail, right after
 * a confirm), and how it treats a suggestion resolved elsewhere or a failed
 * save.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import MatchPromptScreen from '../../app/items/match';
import MatchesScreen from '../../app/items/matches';
import ItemDetailScreen from '../../app/items/[id]';
import ReviewScreen from '../../app/review';
import { promptMatchesAfterConfirm } from '@/features/price-intelligence/services/postConfirmMatches';
import type { ItemDetail, ItemSuggestion } from '@/features/price-intelligence/types';
import type { ReceiptScanResponse } from '@/features/receipt-capture/types';
import { ApiError } from '@/services/api';
import { useMatchPromptStore } from '@/store/matchPromptStore';
import { useReceiptStore } from '@/store/receiptStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@react-native-community/datetimepicker', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return function MockDateTimePicker(props: object) {
    return <MockView {...props} />;
  };
});
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));
jest.mock('@/hooks/useAnalytics', () => ({ useAnalytics: () => ({ emit: jest.fn() }) }));
jest.mock('@/features/auth/hooks/useAuth', () => ({ useMe: () => ({ data: undefined }) }));
const mockToday = jest.fn(() => new Date(2026, 2, 20));
jest.mock('@/utils/today', () => ({ today: () => mockToday() }));

type ConfirmOptions = { onSuccess?: () => void; onError?: (e: Error) => void };
const mockConfirm = jest.fn<void, [unknown, ConfirmOptions]>();
jest.mock('@/features/receipt-capture/hooks/useReceiptReview', () => ({
  useReceiptConfirm: () => ({ mutate: mockConfirm, isPending: false }),
}));
jest.mock('@/features/receipt-capture/services/receiptApi', () => ({
  getReceipt: jest.fn(),
}));

const mockApi = {
  listSuggestions: jest.fn(),
  listReceiptSuggestions: jest.fn(),
  acceptSuggestion: jest.fn(),
  rejectSuggestion: jest.fn(),
  getItem: jest.fn(),
  getPriceHistory: jest.fn(),
  getPriceComparison: jest.fn(),
  getPriceAlertSettings: jest.fn(),
};
jest.mock('@/features/price-intelligence/services/itemsApi', () => ({
  listSuggestions: (...a: unknown[]) => mockApi.listSuggestions(...a),
  listReceiptSuggestions: (...a: unknown[]) => mockApi.listReceiptSuggestions(...a),
  acceptSuggestion: (...a: unknown[]) => mockApi.acceptSuggestion(...a),
  rejectSuggestion: (...a: unknown[]) => mockApi.rejectSuggestion(...a),
  getItem: (...a: unknown[]) => mockApi.getItem(...a),
  getPriceHistory: (...a: unknown[]) => mockApi.getPriceHistory(...a),
  getPriceComparison: (...a: unknown[]) => mockApi.getPriceComparison(...a),
  getPriceAlertSettings: (...a: unknown[]) => mockApi.getPriceAlertSettings(...a),
}));

function suggestion(id: string, overrides: Partial<ItemSuggestion> = {}): ItemSuggestion {
  return {
    id,
    item: { id: `new-${id}`, canonical_name: 'BNLS CHKN BRST 2LB' },
    suggested_item: { id: 'i-1', canonical_name: 'Chicken breast, boneless' },
    confidence: 0.724,
    method: 'fuzzy',
    receipt_line: {
      receipt_id: 'r-1',
      name: 'BNLS CHKN BRST 2LB',
      store_name: 'Costco',
      date: '2026-03-19',
    },
    suggested_item_stats: {
      purchase_count: 14,
      store_count: 3,
      avg_unit_price: 8.99,
      unit_of_measure: 'lb',
      currency: 'USD',
    },
    ...overrides,
  };
}

const second = suggestion('sg-2', {
  item: { id: 'new-sg-2', canonical_name: 'ORG BNNA' },
  suggested_item: { id: 'i-9', canonical_name: 'Organic Bananas' },
  confidence: 0.66,
  receipt_line: { receipt_id: 'r-1', name: 'ORG BNNA', store_name: 'Costco', date: '2026-03-19' },
});

function itemDetail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: 'new-sg-1',
    canonical_name: 'BNLS CHKN BRST 2LB',
    unit_of_measure: 'lb',
    observation_count: 1,
    store_count: 1,
    latest_price: null,
    aliases: [{ id: 'a-1', alias: 'BNLS CHKN BRST 2LB' }],
    suggestions: [],
    alerts_muted: false,
    ...overrides,
  };
}

const scan: ReceiptScanResponse = {
  receipt_id: 'r-1',
  status: 'pending',
  extraction: {
    store_name: 'Costco',
    date: '2026-03-20',
    items: [
      {
        id: 'line-1',
        name: 'BNLS CHKN BRST 2LB',
        quantity: 1,
        unit_price: 17.98,
        total_price: 17.98,
        category_id: null,
        category_confidence: null,
        extraction_confidence: 0.95,
      },
    ],
    subtotal: 17.98,
    tax: null,
    total: 17.98,
    currency: 'USD',
    confidence: 0.95,
    store_name_confidence: 0.95,
    date_confidence: 0.95,
    total_confidence: 0.95,
  },
};

let queryClient: QueryClient;

function open(path: string) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const routerScreen = renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          {/* As app/_layout.tsx: modals, whose headers hold Save, Cancel and Skip. */}
          <Stack>
            <Stack.Screen name="review" options={{ presentation: 'modal' }} />
            <Stack.Screen name="items/match" options={{ presentation: 'fullScreenModal' }} />
          </Stack>
        </QueryClientProvider>
      ),
      index: () => null,
      '(tabs)/index': () => null,
      review: ReviewScreen,
      'items/[id]': ItemDetailScreen,
      'items/matches': MatchesScreen,
      'items/match': MatchPromptScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push(path));
  return routerScreen;
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  mockToday.mockReturnValue(new Date(2026, 2, 20));
  useMatchPromptStore.setState({ prompted: {} });
  mockApi.listSuggestions.mockResolvedValue([suggestion('sg-1'), second]);
  mockApi.listReceiptSuggestions.mockResolvedValue([suggestion('sg-1')]);
  mockApi.getItem.mockResolvedValue(itemDetail());
  mockApi.getPriceHistory.mockResolvedValue({
    item: { id: 'new-sg-1', canonical_name: 'BNLS CHKN BRST 2LB' },
    unit_of_measure: 'lb',
    currency: 'USD',
    has_timeline: false,
    min_points: 2,
    store_count: 1,
    observations: [],
  });
  mockApi.getPriceComparison.mockResolvedValue(null);
  mockApi.getPriceAlertSettings.mockResolvedValue({
    enabled: true,
    threshold_percent: 10,
    default_threshold_percent: 10,
    cooldown_days: 7,
    muted_items: [],
    muted_stores: [],
  });
});

afterEach(() => useReceiptStore.getState().clearScanSession());

describe('What the prompt shows (PI-02 AC 5)', () => {
  it('shows the receipt line, store, date, match percent and the existing item', async () => {
    open('/items/match');

    expect(await screen.findByText('BNLS CHKN BRST 2LB')).toBeTruthy();
    expect(
      screen.getByText('We think these are the same product. Confirm to merge price history.'),
    ).toBeTruthy();
    expect(screen.getByText('From your receipt')).toBeTruthy();
    expect(screen.getByText('Costco · Mar 19, 2026')).toBeTruthy();
    expect(screen.getByTestId('match-percent').props.children).toBe('72% match');
    expect(screen.getByText('Existing item')).toBeTruthy();
    expect(screen.getByText('Chicken breast, boneless')).toBeTruthy();
    expect(screen.getByText('14 purchases · 3 stores')).toBeTruthy();
    expect(screen.getByText('Avg unit price')).toBeTruthy();
    expect(screen.getByText('$8.99 / lb')).toBeTruthy();
    expect(screen.getByText('Yes, merge')).toBeTruthy();
    expect(screen.getByText('Keep as separate item')).toBeTruthy();
    expect(screen.getByLabelText('Skip, decide later')).toBeTruthy();
    expect(screen.getByLabelText('Cancel, decide later')).toBeTruthy();
  });

  it('heads a line from a receipt dated today as from today’s receipt', async () => {
    mockToday.mockReturnValue(new Date(2026, 2, 19));
    open('/items/match');

    expect(await screen.findByText('From today’s receipt')).toBeTruthy();
  });

  it('reads each card to VoiceOver as one element', async () => {
    open('/items/match');

    expect(
      await screen.findByLabelText('From your receipt, BNLS CHKN BRST 2LB, Costco · Mar 19, 2026'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Existing item, Chicken breast, boneless, 14 purchases · 3 stores, Avg unit price $8.99 / lb',
      ),
    ).toBeTruthy();
  });
});

describe('The prompt’s actions (PI-02 AC 6)', () => {
  it('Yes, merge accepts and shows the next suggestion', async () => {
    mockApi.acceptSuggestion.mockResolvedValue(itemDetail({ id: 'i-1' }));
    open('/items/match');

    fireEvent.press(
      await screen.findByLabelText('Yes, merge BNLS CHKN BRST 2LB into Chicken breast, boneless'),
    );

    await waitFor(() => expect(mockApi.acceptSuggestion).toHaveBeenCalledWith('sg-1'));
    expect(await screen.findByText('ORG BNNA')).toBeTruthy();
    expect(mockApi.rejectSuggestion).not.toHaveBeenCalled();
  });

  it('Keep as separate item rejects, and the prompt closes after the last', async () => {
    mockApi.listSuggestions.mockResolvedValue([suggestion('sg-1')]);
    mockApi.rejectSuggestion.mockResolvedValue(undefined);
    const routerScreen = open('/items/match');

    fireEvent.press(await screen.findByLabelText('Keep BNLS CHKN BRST 2LB as a separate item'));

    await waitFor(() => expect(mockApi.rejectSuggestion).toHaveBeenCalledWith('sg-1'));
    await waitFor(() => expect(routerScreen.getPathname()).toBe('/'));
    expect(mockApi.acceptSuggestion).not.toHaveBeenCalled();
  });

  it('Skip leaves the suggestion pending and shows the next, then closes', async () => {
    const routerScreen = open('/items/match');

    fireEvent.press(await screen.findByLabelText('Skip, decide later'));
    expect(await screen.findByText('ORG BNNA')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Skip, decide later'));

    await waitFor(() => expect(routerScreen.getPathname()).toBe('/'));
    // Nothing was saved: both stay pending (no item_match_resolved, which
    // only the accept and reject routes send).
    expect(mockApi.acceptSuggestion).not.toHaveBeenCalled();
    expect(mockApi.rejectSuggestion).not.toHaveBeenCalled();
  });

  it('Cancel closes the prompt and leaves the rest pending', async () => {
    const routerScreen = open('/items/match');

    fireEvent.press(await screen.findByLabelText('Cancel, decide later'));

    await waitFor(() => expect(routerScreen.getPathname()).toBe('/'));
    expect(mockApi.acceptSuggestion).not.toHaveBeenCalled();
    expect(mockApi.rejectSuggestion).not.toHaveBeenCalled();
  });
});

describe('Where the prompt opens (PI-02 AC 7)', () => {
  it('opens from Review Matches on the suggestion tapped', async () => {
    const routerScreen = open('/items/matches');

    fireEvent.press(
      await screen.findByLabelText('Review whether ORG BNNA is the same as Organic Bananas'),
    );

    await waitFor(() => expect(routerScreen.getPathname()).toBe('/items/match'));
    expect(await screen.findByText('ORG BNNA')).toBeTruthy();
    expect(screen.getByText('66% match')).toBeTruthy();
  });

  it('opens from item detail with only that item’s suggestions', async () => {
    mockApi.getItem.mockResolvedValue(itemDetail({ suggestions: [suggestion('sg-1')] }));
    mockApi.rejectSuggestion.mockResolvedValue(undefined);
    const routerScreen = open('/items/new-sg-1');

    fireEvent.press(
      await screen.findByLabelText(
        'Review whether BNLS CHKN BRST 2LB is the same as Chicken breast, boneless',
      ),
    );
    fireEvent.press(await screen.findByLabelText('Keep BNLS CHKN BRST 2LB as a separate item'));

    // sg-2 is another item's: the prompt closes after this item's one.
    await waitFor(() => expect(routerScreen.getPathname()).toBe('/items/new-sg-1'));
    expect(mockApi.rejectSuggestion).toHaveBeenCalledTimes(1);
  });

  it('opens after a confirm succeeds, with only that receipt’s suggestions', async () => {
    useReceiptStore.getState().setActiveScanResponse(scan);
    mockConfirm.mockImplementation((_vars, options) => options.onSuccess?.());
    const routerScreen = open('/review');

    fireEvent.press(await screen.findByLabelText('Save'));

    await waitFor(() => expect(routerScreen.getPathname()).toBe('/items/match'));
    expect(mockApi.listReceiptSuggestions).toHaveBeenCalledWith('r-1');
    expect(mockApi.listSuggestions).not.toHaveBeenCalled();
    expect(await screen.findByText('BNLS CHKN BRST 2LB')).toBeTruthy();
    expect(screen.queryByText('ORG BNNA')).toBeNull();
  });

  it('never opens when the confirm fails', async () => {
    useReceiptStore.getState().setActiveScanResponse(scan);
    mockConfirm.mockImplementation((_vars, options) => options.onError?.(new Error('down')));
    open('/review');

    fireEvent.press(await screen.findByLabelText('Save'));

    expect(mockApi.listReceiptSuggestions).not.toHaveBeenCalled();
  });

  it('never holds up the confirm: the app leaves the review before the fetch answers', async () => {
    useReceiptStore.getState().setActiveScanResponse(scan);
    mockConfirm.mockImplementation((_vars, options) => options.onSuccess?.());
    mockApi.listReceiptSuggestions.mockReturnValue(new Promise(() => {}));
    const routerScreen = open('/review');

    fireEvent.press(await screen.findByLabelText('Save'));

    expect(routerScreen.getPathname()).toBe('/');
    expect(mockApi.listReceiptSuggestions).toHaveBeenCalledWith('r-1');
  });

  it('does not open for a receipt that raised no suggestion', async () => {
    mockApi.listReceiptSuggestions.mockResolvedValue([]);
    const push = jest.spyOn(router, 'push');

    await promptMatchesAfterConfirm('r-1', new QueryClient());

    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it('shows each suggestion after a confirm only once', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => {});

    await promptMatchesAfterConfirm('r-1', new QueryClient());
    await promptMatchesAfterConfirm('r-1', new QueryClient());

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: '/items/match',
      params: { receiptId: 'r-1', ids: 'sg-1' },
    });
    push.mockRestore();
  });

  it('gives up quietly when the fetch fails', async () => {
    mockApi.listReceiptSuggestions.mockRejectedValue(new Error('offline'));
    const push = jest.spyOn(router, 'push');

    await expect(promptMatchesAfterConfirm('r-1', new QueryClient())).resolves.toBeUndefined();

    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });
});

describe('Resolved elsewhere and failed saves (PI-02 AC 9)', () => {
  it('passes over a suggestion already resolved (409) without an error', async () => {
    mockApi.acceptSuggestion.mockRejectedValue(new ApiError(409, { detail: 'already' }));
    open('/items/match');

    fireEvent.press(
      await screen.findByLabelText('Yes, merge BNLS CHKN BRST 2LB into Chicken breast, boneless'),
    );

    expect(await screen.findByText('ORG BNNA')).toBeTruthy();
    expect(screen.queryByText(/didn’t save/)).toBeNull();
  });

  it('keeps the prompt open and says so inline when a save fails', async () => {
    mockApi.rejectSuggestion.mockRejectedValue(new ApiError(500, null));
    open('/items/match');

    fireEvent.press(await screen.findByLabelText('Keep BNLS CHKN BRST 2LB as a separate item'));

    expect(
      await screen.findByText('That didn’t save. Check your connection and try again.'),
    ).toBeTruthy();
    expect(screen.getByText('BNLS CHKN BRST 2LB')).toBeTruthy();
    expect(screen.queryByText('ORG BNNA')).toBeNull();
  });
});
