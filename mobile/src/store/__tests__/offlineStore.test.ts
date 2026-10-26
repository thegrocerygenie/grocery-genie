import AsyncStorage from '@react-native-async-storage/async-storage';

import { useOfflineStore } from '../offlineStore';

// Reset store between tests
beforeEach(() => {
  useOfflineStore.setState({ pendingReceipts: [] });
});

describe('offlineStore', () => {
  it('adds a pending receipt', () => {
    useOfflineStore.getState().addPendingReceipt({
      imageUri: 'file:///photo.jpg',
      mimeType: 'image/jpeg',
      capturedAt: '2026-03-22T10:00:00Z',
    });

    const { pendingReceipts } = useOfflineStore.getState();
    expect(pendingReceipts).toHaveLength(1);
    expect(pendingReceipts[0].status).toBe('pending');
    expect(pendingReceipts[0].imageUri).toBe('file:///photo.jpg');
    expect(pendingReceipts[0].id).toMatch(/^pending-/);
  });

  it('updates receipt status', () => {
    useOfflineStore.getState().addPendingReceipt({
      imageUri: 'file:///photo.jpg',
      mimeType: 'image/jpeg',
      capturedAt: '2026-03-22T10:00:00Z',
    });

    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().updateStatus(id, 'syncing');

    expect(useOfflineStore.getState().pendingReceipts[0].status).toBe('syncing');
  });

  it('removes a pending receipt', () => {
    useOfflineStore.getState().addPendingReceipt({
      imageUri: 'file:///photo.jpg',
      mimeType: 'image/jpeg',
      capturedAt: '2026-03-22T10:00:00Z',
    });

    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().removePendingReceipt(id);

    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(0);
  });

  it('preserves other receipts when removing one', () => {
    const store = useOfflineStore.getState();
    store.addPendingReceipt({
      imageUri: 'file:///a.jpg',
      mimeType: 'image/jpeg',
      capturedAt: '2026-03-22T10:00:00Z',
    });
    store.addPendingReceipt({
      imageUri: 'file:///b.jpg',
      mimeType: 'image/jpeg',
      capturedAt: '2026-03-22T11:00:00Z',
    });

    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().removePendingReceipt(id);

    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(1);
    expect(useOfflineStore.getState().pendingReceipts[0].imageUri).toBe('file:///b.jpg');
  });

  it('resets a receipt left syncing by a crash back to pending on restart', async () => {
    await AsyncStorage.setItem(
      'grocery-genie-offline',
      JSON.stringify({
        state: {
          pendingReceipts: [
            {
              id: 'pending-1',
              imageUri: 'file:///a.jpg',
              mimeType: 'image/jpeg',
              capturedAt: '2026-03-22T10:00:00Z',
              status: 'syncing',
            },
            {
              id: 'pending-2',
              imageUri: 'file:///b.jpg',
              mimeType: 'image/jpeg',
              capturedAt: '2026-03-22T11:00:00Z',
              status: 'failed',
            },
          ],
        },
        version: 0,
      }),
    );

    await useOfflineStore.persist.rehydrate();

    const statuses = useOfflineStore.getState().pendingReceipts.map((r) => r.status);
    expect(statuses).toEqual(['pending', 'failed']);
  });

  it('marks a failed attempt and puts the receipt back in the queue', () => {
    useOfflineStore.getState().addPendingReceipt({
      imageUri: 'file:///a.jpg',
      mimeType: 'image/jpeg',
      capturedAt: '2026-03-22T10:00:00Z',
    });
    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().updateStatus(id, 'syncing');

    useOfflineStore.getState().markAttemptFailed(id);

    const [receipt] = useOfflineStore.getState().pendingReceipts;
    expect(receipt.status).toBe('pending');
    expect(receipt.lastAttemptFailed).toBe(true);
  });
});
