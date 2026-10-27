import { act, renderHook } from '@testing-library/react-native';

import { useFrameQuality } from '../hooks/useFrameQuality';
import type { FrameVerdict } from '../utils/frameQuality';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useFrameQuality', () => {
  it('samples at once, then on every interval, and reports the latest verdict', async () => {
    const verdicts: FrameVerdict[] = ['blurry', 'ok'];
    const sample = jest.fn(async () => verdicts.shift() ?? 'ok');
    const { result } = renderHook(() => useFrameQuality(sample, true, 1500));

    await flush();
    expect(sample).toHaveBeenCalledTimes(1);
    expect(result.current.verdict).toBe('blurry');

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await flush();
    expect(sample).toHaveBeenCalledTimes(2);
    expect(result.current.verdict).toBe('ok');
  });

  it('never runs two samples at once', async () => {
    let release: (v: FrameVerdict) => void = () => undefined;
    const sample = jest.fn(
      () =>
        new Promise<FrameVerdict>((resolve) => {
          release = resolve;
        }),
    );
    renderHook(() => useFrameQuality(sample, true, 1500));

    await act(async () => {
      jest.advanceTimersByTime(4500);
    });
    expect(sample).toHaveBeenCalledTimes(1);
    await act(async () => release('ok'));
  });

  it('settle() waits for the sample in flight, so the shutter never races it', async () => {
    let release: (v: FrameVerdict) => void = () => undefined;
    const sample = jest.fn(
      () =>
        new Promise<FrameVerdict>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useFrameQuality(sample, true, 1500));
    let settled = false;
    const settling = result.current.settle().then(() => {
      settled = true;
    });

    await flush();
    expect(settled).toBe(false);
    await act(async () => release('ok'));
    await settling;
    expect(settled).toBe(true);
  });

  it('stops sampling and forgets the verdict when disabled', async () => {
    const sample = jest.fn(async () => 'dark' as FrameVerdict);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useFrameQuality(sample, enabled, 1500),
      { initialProps: { enabled: true } },
    );
    await flush();
    expect(result.current.verdict).toBe('dark');

    rerender({ enabled: false });
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    expect(sample).toHaveBeenCalledTimes(1);
    expect(result.current.verdict).toBeNull();
  });

  it('keeps sampling after a sample fails', async () => {
    const sample = jest
      .fn<Promise<FrameVerdict | null>, []>()
      .mockRejectedValueOnce(new Error('camera busy'))
      .mockResolvedValue('ok');
    const { result } = renderHook(() => useFrameQuality(sample, true, 1500));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await flush();
    expect(result.current.verdict).toBe('ok');
  });
});
