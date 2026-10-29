import { AccessibilityInfo } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useReduceMotion, useReduceTransparency } from '../useAccessibilitySetting';

type Listener = (enabled: boolean) => void;

function mockSetting(query: 'isReduceMotionEnabled' | 'isReduceTransparencyEnabled', on: boolean) {
  const listeners: Listener[] = [];
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, query).mockResolvedValue(on);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    _event: string,
    cb: Listener,
  ) => {
    listeners.push(cb);
    return { remove };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  return { emit: (v: boolean) => listeners.forEach((l) => l(v)), remove };
}

afterEach(() => jest.restoreAllMocks());

describe('useReduceMotion', () => {
  it('reads the current setting', async () => {
    mockSetting('isReduceMotionEnabled', true);
    const { result } = renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('follows a change while the app runs, and stops listening on unmount', async () => {
    const setting = mockSetting('isReduceMotionEnabled', false);
    const { result, unmount } = renderHook(() => useReduceMotion());
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());

    act(() => setting.emit(true));
    expect(result.current).toBe(true);

    unmount();
    expect(setting.remove).toHaveBeenCalled();
  });

  it('stays off when the setting cannot be read', async () => {
    mockSetting('isReduceMotionEnabled', false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('no'));
    const { result } = renderHook(() => useReduceMotion());
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});

describe('useReduceTransparency', () => {
  it('reads the current setting and follows changes', async () => {
    const setting = mockSetting('isReduceTransparencyEnabled', true);
    const { result } = renderHook(() => useReduceTransparency());
    await waitFor(() => expect(result.current).toBe(true));

    act(() => setting.emit(false));
    expect(result.current).toBe(false);
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      'reduceTransparencyChanged',
      expect.any(Function),
    );
  });
});
