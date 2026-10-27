import { ApiError } from '@/services/api';
import { useOfflineStore, type PendingReceipt } from '@/store/offlineStore';

import {
  formatQueuedAgo,
  isRetryableScanError,
  syncPendingReceipts,
} from '../services/offlineQueue';
import { isQuotaExceededError } from '../utils/scanQuota';

const CAPTURE = {
  imageUri: 'file:///doc/pending-receipts/a.jpg',
  mimeType: 'image/jpeg',
  capturedAt: '2026-10-26T10:00:00Z',
};

const OWNER = 'user-a';

// The two 429 details the backend sends: app/api/routes/receipts.py (monthly
// quota) and app/core/rate_limit.py (hourly rate limit).
const QUOTA_DETAIL = 'Monthly receipt quota exceeded (20 receipts/month on Free tier).';
const RATE_LIMIT_DETAIL = 'Rate limit exceeded. Try again later.';

function queue(n: number, ownerId: string = OWNER) {
  for (let i = 0; i < n; i++) {
    useOfflineStore.getState().addPendingReceipt({
      ...CAPTURE,
      ownerId,
      imageUri: `file:///doc/pending-receipts/${i}.jpg`,
    });
  }
}

beforeEach(() => {
  useOfflineStore.setState({ pendingReceipts: [] });
});

// app/services/ai_consent.py: the server refuses a scan until the user allows AI reading.
const CONSENT_REQUIRED = new ApiError(403, {
  detail: { code: 'ai_consent_required', message: 'Allow this in the app first.' },
});

describe('a queue held for AI consent', () => {
  it('keeps the photo queued, stops the run and reports it, without failing anything', async () => {
    queue(2);
    const scan = jest.fn().mockRejectedValue(CONSENT_REQUIRED);
    const deleteImage = jest.fn();
    const onConsentRequired = jest.fn();

    const result = await syncPendingReceipts({
      scan,
      deleteImage,
      ownerId: OWNER,
      currentOwner: () => OWNER,
      onConsentRequired,
    });

    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(deleteImage).not.toHaveBeenCalled();
    expect(onConsentRequired).toHaveBeenCalledTimes(1);
    const [first, second] = useOfflineStore.getState().pendingReceipts;
    expect(first).toMatchObject({ status: 'pending', needsConsent: true });
    // Not a failed attempt: no retry timer runs until the user allows it.
    expect(first.lastAttemptFailed).toBeFalsy();
    expect(second.status).toBe('pending');
  });

  it('is not a retryable error', () => {
    expect(isRetryableScanError(CONSENT_REQUIRED)).toBe(false);
  });
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

  it('retries the hourly rate limit', () => {
    expect(isRetryableScanError(new ApiError(429, { detail: RATE_LIMIT_DETAIL }))).toBe(true);
  });

  it('does not retry the monthly quota: it fails the same way until next month', () => {
    expect(isRetryableScanError(new ApiError(429, { detail: QUOTA_DETAIL }))).toBe(false);
  });
});

describe('isQuotaExceededError', () => {
  it('spots the monthly quota 429', () => {
    expect(isQuotaExceededError(new ApiError(429, { detail: QUOTA_DETAIL }))).toBe(true);
  });

  it.each([
    ['the rate limit', new ApiError(429, { detail: RATE_LIMIT_DETAIL })],
    ['a 429 with no detail', new ApiError(429, null)],
    ['another status', new ApiError(422, { detail: QUOTA_DETAIL })],
    ['a network failure', new TypeError('Network request failed')],
  ])('ignores %s', (_label, error) => {
    expect(isQuotaExceededError(error)).toBe(false);
  });
});

describe('syncPendingReceipts', () => {
  it('uploads each queued photo, removes it, and deletes its file', async () => {
    queue(2);
    const scan = jest.fn().mockResolvedValue({});
    const deleteImage = jest.fn();

    const result = await syncPendingReceipts({
      scan,
      deleteImage,
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });

    expect(result).toEqual({ synced: 2, failed: 0 });
    expect(scan).toHaveBeenCalledTimes(2);
    expect(scan).toHaveBeenCalledWith('file:///doc/pending-receipts/0.jpg', 'image/jpeg', 'camera');
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

    const result = await syncPendingReceipts({
      scan,
      deleteImage,
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });

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

    const result = await syncPendingReceipts({
      scan,
      deleteImage,
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });

    expect(result).toEqual({ synced: 1, failed: 1 });
    const left = useOfflineStore.getState().pendingReceipts;
    expect(left).toHaveLength(1);
    expect(left[0].status).toBe('failed');
    expect(deleteImage).toHaveBeenCalledTimes(1);
  });

  it('marks a photo over the monthly quota failed for that reason, so it never retries', async () => {
    queue(1);
    const scan = jest.fn().mockRejectedValue(new ApiError(429, { detail: QUOTA_DETAIL }));

    const result = await syncPendingReceipts({
      scan,
      deleteImage: jest.fn(),
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });

    expect(result).toEqual({ synced: 0, failed: 1 });
    const [left] = useOfflineStore.getState().pendingReceipts;
    expect(left.status).toBe('failed');
    expect(left.failure).toBe('quota');
  });

  it('skips photos already marked failed', async () => {
    queue(1);
    const id = useOfflineStore.getState().pendingReceipts[0].id;
    useOfflineStore.getState().updateStatus(id, 'failed');
    const scan = jest.fn();

    await syncPendingReceipts({
      scan,
      deleteImage: jest.fn(),
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });

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

    const first = syncPendingReceipts({
      scan,
      deleteImage: jest.fn(),
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });
    const second = syncPendingReceipts({
      scan,
      deleteImage: jest.fn(),
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });
    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    expect(scan).toHaveBeenCalledTimes(1);
  });
});

describe('syncPendingReceipts keeps where the photo came from', () => {
  it('uploads a queued library photo as a library scan', async () => {
    useOfflineStore.getState().addPendingReceipt({ ...CAPTURE, ownerId: OWNER, source: 'library' });
    useOfflineStore.getState().addPendingReceipt({ ...CAPTURE, ownerId: OWNER });
    const scan = jest.fn().mockResolvedValue({});

    await syncPendingReceipts({
      scan,
      deleteImage: jest.fn(),
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });

    expect(scan.mock.calls.map((c) => c[2])).toEqual(['library', 'camera']);
  });
});

describe('syncPendingReceipts only uploads the signed-in user’s photos', () => {
  // Regression: the queue is shared by every session on the device. Another
  // account (or, in dev, another app build on the same simulator) synced a
  // photo it did not capture, and its server's 422 marked the photo failed.
  it('leaves another user’s photo untouched', async () => {
    queue(1, 'user-b');
    queue(1, OWNER);
    const scan = jest.fn().mockRejectedValue(new ApiError(422, { detail: 'too dark' }));

    const result = await syncPendingReceipts({
      scan,
      deleteImage: jest.fn(),
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });

    expect(scan).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ synced: 0, failed: 1 });
    const statuses = useOfflineStore.getState().pendingReceipts.map((r) => [r.ownerId, r.status]);
    expect(statuses).toEqual([
      ['user-b', 'pending'],
      [OWNER, 'failed'],
    ]);
  });

  it('never uploads a photo that has no owner', async () => {
    // Only an older build saved these; the store drops them on upgrade. Seed
    // one directly so sync stays safe if one ever slips through.
    const legacy = { ...CAPTURE, id: 'pending-legacy', status: 'pending' } as PendingReceipt;
    useOfflineStore.setState({ pendingReceipts: [legacy] });
    const scan = jest.fn();

    await syncPendingReceipts({
      scan,
      deleteImage: jest.fn(),
      ownerId: OWNER,
      currentOwner: () => OWNER,
    });

    expect(scan).not.toHaveBeenCalled();
  });
});

describe('syncPendingReceipts when the account changes mid-sync', () => {
  // Each upload sends whatever token is current when it starts. A run that began
  // for user A must not send A's next photo after user B has signed in.
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  }

  it('stops before the next photo once another account signs in', async () => {
    queue(2);
    let signedIn: string | null = OWNER;
    const first = deferred();
    const scan = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue({});

    const run = syncPendingReceipts({
      scan,
      deleteImage: jest.fn(),
      ownerId: OWNER,
      currentOwner: () => signedIn,
    });
    signedIn = 'user-b';
    first.resolve();

    expect(await run).toEqual({ synced: 1, failed: 0 });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(useOfflineStore.getState().pendingReceipts.map((r) => [r.ownerId, r.status])).toEqual([
      [OWNER, 'pending'],
    ]);
  });

  it('runs the new account’s sync after the old one, not instead of it', async () => {
    queue(1, OWNER);
    queue(1, 'user-b');
    let signedIn: string | null = OWNER;
    const first = deferred();
    const scan = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue({});
    const deps = { scan, deleteImage: jest.fn(), currentOwner: () => signedIn };

    const runA = syncPendingReceipts({ ...deps, ownerId: OWNER, currentOwner: () => OWNER });
    signedIn = 'user-b';
    const runB = syncPendingReceipts({ ...deps, ownerId: 'user-b' });
    first.resolve();

    expect(await runA).toEqual({ synced: 1, failed: 0 });
    expect(await runB).toEqual({ synced: 1, failed: 0 });
    expect(scan).toHaveBeenCalledTimes(2);
    expect(useOfflineStore.getState().pendingReceipts).toEqual([]);
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
