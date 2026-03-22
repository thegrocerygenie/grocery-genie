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

    expect(useOfflineStore.getState().pendingReceipts[0].status).toBe(
      'syncing',
    );
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
    expect(useOfflineStore.getState().pendingReceipts[0].imageUri).toBe(
      'file:///b.jpg',
    );
  });
});
