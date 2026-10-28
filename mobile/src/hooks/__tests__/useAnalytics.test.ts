import { useEffect } from 'react';
import { renderHook, act } from '@testing-library/react-native';

import { apiClient } from '@/services/api';

import { useAnalytics } from '../useAnalytics';

jest.mock('@/services/api', () => ({
  apiClient: jest.fn(() => Promise.resolve(undefined)),
}));

const mockApiClient = apiClient as jest.MockedFunction<typeof apiClient>;

describe('useAnalytics', () => {
  beforeEach(() => {
    mockApiClient.mockClear();
    mockApiClient.mockResolvedValue(undefined);
  });

  it('logs events in dev mode', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.emit('receipt_abandoned', { stage: 'review' });
    });

    expect(consoleSpy).toHaveBeenCalledWith('[Analytics] receipt_abandoned', {
      stage: 'review',
    });

    consoleSpy.mockRestore();
  });

  it('defaults to empty properties when none are given', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.emit('receipt_abandoned');
    });

    expect(consoleSpy).toHaveBeenCalledWith('[Analytics] receipt_abandoned', {});

    consoleSpy.mockRestore();
  });

  it('posts the event to /api/analytics/events', () => {
    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.emit('receipt_abandoned', { stage: 'capture' });
    });

    expect(mockApiClient).toHaveBeenCalledWith('/api/analytics/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: 'receipt_abandoned',
        properties: { stage: 'capture' },
      }),
    });
  });

  it('does not throw when the request fails', async () => {
    mockApiClient.mockRejectedValueOnce(new Error('network down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const { result } = renderHook(() => useAnalytics());
    expect(() =>
      act(() => {
        result.current.emit('receipt_abandoned', { stage: 'capture' });
      }),
    ).not.toThrow();

    // Let the rejected promise settle so the .catch handler runs.
    await act(async () => {
      await Promise.resolve();
    });

    warnSpy.mockRestore();
  });
});

// M4: Scan and Review emit receipt_abandoned from an effect cleanup that
// depends on the hook's result. A new result each render re-ran the cleanup,
// so every re-render sent an abandonment.
describe('useAnalytics identity', () => {
  it('fires an unmount-only cleanup once, not on each re-render', () => {
    mockApiClient.mockClear();
    jest.spyOn(console, 'log').mockImplementation();

    const { rerender, unmount } = renderHook(
      ({ tick }: { tick: number }) => {
        const analytics = useAnalytics();
        useEffect(
          () => () => analytics.emit('receipt_abandoned', { stage: 'capture' }),
          [analytics],
        );
        return tick;
      },
      { initialProps: { tick: 0 } },
    );

    rerender({ tick: 1 });
    rerender({ tick: 2 });
    expect(mockApiClient).not.toHaveBeenCalled();

    unmount();
    expect(mockApiClient).toHaveBeenCalledTimes(1);
  });
});
