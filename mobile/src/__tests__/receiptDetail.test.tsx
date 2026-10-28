/**
 * Design "RC-04 · Receipt detail": a saved receipt opens read-only from
 * History, titled by its store, with Edit for corrections (RC-04 AC 3).
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, type AlertButton } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import ReceiptDetailScreen from '../../app/receipt/[id]';
import type { ReceiptResponse } from '@/features/receipt-capture/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ id: 'c-g', name: 'Groceries', icon: null, color: null }] }),
}));
const mockDelete = jest.fn();
jest.mock('@/features/lifecycle/hooks/useLifecycle', () => ({
  useDeleteReceipt: () => ({ mutate: mockDelete, isPending: false }),
}));
const mockGetReceipt = jest.fn();
jest.mock('@/features/receipt-capture/services/receiptApi', () => ({
  getReceipt: (id: string) => mockGetReceipt(id),
}));

function item(id: string, name: string, quantity: number, total: number) {
  return {
    id,
    raw_name: name,
    quantity,
    unit_price: total / quantity,
    total_price: total,
    unit_of_measure: null,
    category_id: 'c-g',
    category_confidence: 0.9,
    extraction_confidence: 0.95,
    corrected: false,
  };
}

const receipt: ReceiptResponse = {
  id: 'r-1',
  user_id: 'u-1',
  store_name: "Trader Joe's",
  date: '2026-04-19',
  subtotal: 54.32,
  tax: 4.1,
  total: 58.42,
  currency: 'USD',
  image_url: '/api/receipts/r-1/image',
  extraction_confidence: 0.95,
  store_name_confidence: 0.95,
  date_confidence: 0.95,
  total_confidence: 0.95,
  status: 'confirmed',
  items: [item('i-1', 'Bananas', 1, 2.49), item('i-2', 'Avocados', 3, 6)],
  created_at: null,
};

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

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

function openDetail() {
  const routerScreen = renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={new QueryClient()}>
          <Stack />
        </QueryClientProvider>
      ),
      index: () => null,
      'receipt/[id]': ReceiptDetailScreen,
      review: () => null,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/receipt/r-1'));
  return routerScreen;
}

beforeEach(() => {
  mockGetReceipt.mockReset().mockResolvedValue(receipt);
  mockDelete.mockReset();
});

describe('Receipt detail', () => {
  it('shows the saved receipt, titled by its store', async () => {
    openDetail();

    expect(await screen.findByText('Apr 19, 2026')).toBeTruthy();
    expect(mockGetReceipt).toHaveBeenCalledWith('r-1');
    expect(headerTitles()).toContain("Trader Joe's");
    expect(screen.getByText('$58.42')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('$54.32 · $4.10')).toBeTruthy();
    expect(screen.getByText('Items · 2')).toBeTruthy();
    expect(screen.getByText('Bananas')).toBeTruthy();
    expect(screen.getByText('Avocados × 3')).toBeTruthy();
    expect(screen.getByText('$6.00')).toBeTruthy();
    expect(screen.getByLabelText('Receipt photo')).toBeTruthy();
  });

  it('opens Review in edit mode from Edit', async () => {
    const routerScreen = openDetail();
    await screen.findByText('Apr 19, 2026');

    fireEvent.press(screen.getByLabelText('Edit receipt'));

    expect(routerScreen.getPathname()).toBe('/review');
    expect(routerScreen.getSearchParams()).toEqual({ receiptId: 'r-1', edit: '1' });
  });
});

// L6: delete from the detail screen, not only by long-pressing a History row.
describe('Receipt detail delete', () => {
  function pressDeleteAndConfirm(choice: 'Cancel' | 'Delete') {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(screen.getByLabelText('Delete receipt'));
    expect(alert).toHaveBeenCalledWith(
      'Delete receipt?',
      "Trader Joe's will be moved to Recently Deleted (30 days to restore).",
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    act(() => buttons.find((b) => b.text === choice)?.onPress?.());
    alert.mockRestore();
  }

  it('moves the receipt to Recently Deleted after confirming, and goes back', async () => {
    mockDelete.mockImplementation((_id: string, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    const routerScreen = openDetail();
    await screen.findByText('Apr 19, 2026');

    pressDeleteAndConfirm('Delete');

    expect(mockDelete).toHaveBeenCalledWith('r-1', expect.anything());
    expect(routerScreen.getPathname()).toBe('/');
  });

  it('keeps the receipt when the user cancels', async () => {
    const routerScreen = openDetail();
    await screen.findByText('Apr 19, 2026');

    pressDeleteAndConfirm('Cancel');

    expect(mockDelete).not.toHaveBeenCalled();
    expect(routerScreen.getPathname()).toBe('/receipt/r-1');
  });
});
