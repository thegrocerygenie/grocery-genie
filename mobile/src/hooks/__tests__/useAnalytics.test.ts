import { renderHook, act } from '@testing-library/react-native';
import { useAnalytics } from '../useAnalytics';

describe('useAnalytics', () => {
  it('logs events in dev mode', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.emit('test_event', { key: 'value' });
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Analytics] test_event',
      { key: 'value' },
    );

    consoleSpy.mockRestore();
  });

  it('logs without properties', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.emit('simple_event');
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Analytics] simple_event',
      {},
    );

    consoleSpy.mockRestore();
  });
});
