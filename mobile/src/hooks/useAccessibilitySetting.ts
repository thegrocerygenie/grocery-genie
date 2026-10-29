import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

type Setting = {
  query: () => Promise<boolean>;
  event: 'reduceMotionChanged' | 'reduceTransparencyChanged';
};

const REDUCE_MOTION: Setting = {
  query: () => AccessibilityInfo.isReduceMotionEnabled(),
  event: 'reduceMotionChanged',
};

const REDUCE_TRANSPARENCY: Setting = {
  query: () => AccessibilityInfo.isReduceTransparencyEnabled(),
  event: 'reduceTransparencyChanged',
};

// Starts false and follows the iOS setting live, unlike reanimated's
// useReducedMotion, which reads it once at launch.
function useAccessibilitySetting({ query, event }: Setting): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    query().then(
      (on) => active && setEnabled(on),
      () => {},
    );
    const sub = AccessibilityInfo.addEventListener(event, (on: boolean) => setEnabled(on));
    return () => {
      active = false;
      sub.remove();
    };
  }, [query, event]);

  return enabled;
}

export function useReduceMotion(): boolean {
  return useAccessibilitySetting(REDUCE_MOTION);
}

export function useReduceTransparency(): boolean {
  return useAccessibilitySetting(REDUCE_TRANSPARENCY);
}
