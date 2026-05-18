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
