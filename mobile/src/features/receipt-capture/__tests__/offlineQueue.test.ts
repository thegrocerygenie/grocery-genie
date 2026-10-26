import { ApiError } from '@/services/api';
import { useOfflineStore } from '@/store/offlineStore';

import {
  formatQueuedAgo,
  isRetryableScanError,
  syncPendingReceipts,
} from '../services/offlineQueue';

const CAPTURE = {
  imageUri: 'file:///doc/pending-receipts/a.jpg',
  mimeType: 'image/jpeg',
  capturedAt: '2026-10-26T10:00:00Z',
};

function queue(n: number) {
  for (let i = 0; i < n; i++) {
    useOfflineStore
      .getState()
      .addPendingReceipt({ ...CAPTURE, imageUri: `file:///doc/pending-receipts/${i}.jpg` });
  }
}

beforeEach(() => {
  useOfflineStore.setState({ pendingReceipts: [] });
});

describe('isRetryableScanError', () => {
  it('retries a network failure (fetch throws a TypeError)', () => {
    expect(isRetryableScanError(new TypeError('Network request failed'))).toBe(true);
  });

  it.each([401, 408, 429, 500, 503])('retries HTTP %i', (status) => {
    expect(isRetryableScanError(new ApiError(status, {}))).toBe(true);
  });

  it.each([400, 413, 422])('does not retry HTTP %i — the photo itself was rejected', (status) => {
    expect(isRetryableScanError(new ApiError(status, {}))).toBe(false);
  });
});

describe('syncPendingReceipts', () => {
  it('uploads each queued photo, removes it, and deletes its file', async () => {
    queue(2);
    const scan = jest.fn().mockResolvedValue({});
    const deleteImage = jest.fn();

    const result = await syncPendingReceipts({ scan, deleteImage });

    expect(result).toEqual({ synced: 2, failed: 0 });
    expect(scan).toHaveBeenCalledTimes(2);
    expect(scan).toHaveBeenCalledWith('file:///doc/pending-receipts/0.jpg', 'image/jpeg');
    expect(deleteImage).toHaveBeenCalledWith('file:///doc/pending-receipts/1.jpg');
    expect(useOfflineStore.getState().pendingReceipts).toHaveLength(0);
  });

  it('stops at a retryable error and leaves the rest queued as pending', async () => {
    queue(3);
    const scan = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new TypeError('Network request failed'));
    const deleteImage = jest.fn();

    const result = await syncPendingReceipts({ scan, deleteImage });

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(scan).toHaveBeenCalledTimes(2);
    const left = useOfflineStore.getState().pendingReceipts;
    expect(left).toHaveLength(2);
    expect(left.every((r) => r.status === 'pending')).toBe(true);
    // The one that was tried is marked, so History can say it waits to retry.
    expect(left.map((r) => r.lastAttemptFailed ?? false)).toEqual([true, false]);
  });

  it('marks a rejected photo failed, keeps its file, and carries on', async () => {
    queue(2);
    const scan = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(422, { detail: 'Image quality insufficient' }))
      .mockResolvedValueOnce({});
    const deleteImage = jest.fn();

    const result = await syncPendingReceipts({ scan, deleteImage });

    expect(result).toEqual({ synced: 1, failed: 1 });
    const left = useOfflineStore.getState().pendingReceipts;
    expect(left).toHaveLength(1);
    expect(left[0].status).toBe('failed');
    expect(deleteImage).toHaveBeenCalledTimes(1);
  });

  it('skips photos already marked failed', async () => {
    queue(1);
    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().updateStatus(id, 'failed');
    const scan = jest.fn();

    await syncPendingReceipts({ scan, deleteImage: jest.fn() });

    expect(scan).not.toHaveBeenCalled();
  });

  it('runs once when called twice at the same time, so no photo uploads twice', async () => {
    queue(1);
    let release: () => void = () => undefined;
    const scan = jest.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve({});
        }),
    );

    const first = syncPendingReceipts({ scan, deleteImage: jest.fn() });
    const second = syncPendingReceipts({ scan, deleteImage: jest.fn() });
    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    expect(scan).toHaveBeenCalledTimes(1);
  });
});

describe('formatQueuedAgo', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it.each([
    ['2026-10-26T11:59:40Z', 'Captured just now'],
    ['2026-10-26T11:45:00Z', 'Captured 15m ago'],
    ['2026-10-26T10:00:00Z', 'Captured 2h ago'],
    ['2026-10-24T12:00:00Z', 'Captured 2d ago'],
  ])('%s → %s', (iso, label) => {
    expect(formatQueuedAgo(iso, now)).toBe(label);
  });
});
