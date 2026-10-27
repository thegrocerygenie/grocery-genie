import AsyncStorage from '@react-native-async-storage/async-storage';

import { deletePendingImage } from '@/features/receipt-capture/services/pendingImageFiles';

import { useOfflineStore } from '../offlineStore';

jest.mock('@/features/receipt-capture/services/pendingImageFiles', () => ({
  deletePendingImage: jest.fn(),
}));

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
      ownerId: 'user-a',
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
      ownerId: 'user-a',
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
      ownerId: 'user-a',
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
      ownerId: 'user-a',
    });
    store.addPendingReceipt({
      imageUri: 'file:///b.jpg',
      mimeType: 'image/jpeg',
      capturedAt: '2026-03-22T11:00:00Z',
      ownerId: 'user-a',
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
              ownerId: 'user-a',
              status: 'syncing',
            },
            {
              id: 'pending-2',
              imageUri: 'file:///b.jpg',
              mimeType: 'image/jpeg',
              capturedAt: '2026-03-22T11:00:00Z',
              ownerId: 'user-a',
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
      ownerId: 'user-a',
    });
    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().updateStatus(id, 'syncing');

    useOfflineStore.getState().markAttemptFailed(id);

    const [receipt] = useOfflineStore.getState().pendingReceipts;
    expect(receipt.status).toBe('pending');
    expect(receipt.lastAttemptFailed).toBe(true);
  });

  it('drops photos an older build queued with no owner, and deletes their files', async () => {
    // Builds before per-account queues saved entries without ownerId (version 0).
    // Nothing may upload or show them, so they would sit on disk forever.
    await AsyncStorage.setItem(
      'grocery-genie-offline',
      JSON.stringify({
        state: {
          pendingReceipts: [
            {
              id: 'pending-legacy',
              imageUri: 'file:///doc/pending-receipts/legacy.jpg',
              mimeType: 'image/jpeg',
              capturedAt: '2026-03-22T10:00:00Z',
              status: 'pending',
            },
            {
              id: 'pending-owned',
              imageUri: 'file:///doc/pending-receipts/owned.jpg',
              mimeType: 'image/jpeg',
              capturedAt: '2026-03-22T11:00:00Z',
              ownerId: 'user-a',
              status: 'pending',
            },
          ],
        },
        version: 0,
      }),
    );

    await useOfflineStore.persist.rehydrate();

    expect(useOfflineStore.getState().pendingReceipts.map((r) => r.id)).toEqual(['pending-owned']);
    expect(deletePendingImage).toHaveBeenCalledTimes(1);
    expect(deletePendingImage).toHaveBeenCalledWith('file:///doc/pending-receipts/legacy.jpg');
    // Saved as version 1, so the cleanup does not run again on the next launch.
    const saved = JSON.parse((await AsyncStorage.getItem('grocery-genie-offline')) ?? '{}');
    expect(saved.version).toBe(1);
    expect(saved.state.pendingReceipts.map((r: { id: string }) => r.id)).toEqual(['pending-owned']);
  });
});
