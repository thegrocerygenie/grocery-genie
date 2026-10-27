import { useCallback, useEffect, useRef, useState } from 'react';

import type { FrameVerdict } from '../utils/frameQuality';

/**
 * RC-01 AC 2: judge the camera view before capture. While `enabled`, samples
 * at once and then every `intervalMs`, one sample at a time, and returns the
 * latest verdict (null before the first one, or when disabled).
 *
 * `settle()` resolves once no sample is running. The shutter awaits it, so a
 * background sample never holds the camera when the real photo is taken.
 */
export function useFrameQuality(
  sample: () => Promise<FrameVerdict | null>,
  enabled: boolean,
  intervalMs = 1500,
): { verdict: FrameVerdict | null; settle: () => Promise<void> } {
  const [verdict, setVerdict] = useState<FrameVerdict | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  useEffect(() => {
    if (!enabled) {
      setVerdict(null);
      return;
    }
    let active = true;
    const run = () => {
      if (inFlight.current) return;
      inFlight.current = sampleRef
        .current()
        .then((v) => {
          if (active && v) setVerdict(v);
        })
        .catch(() => {
          // A failed sample (camera busy, file error) just waits for the next one.
        })
        .finally(() => {
          inFlight.current = null;
        });
    };
    run();
    const timer = setInterval(run, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled, intervalMs]);

  const settle = useCallback(async () => {
    await inFlight.current;
  }, []);

  return { verdict, settle };
}
