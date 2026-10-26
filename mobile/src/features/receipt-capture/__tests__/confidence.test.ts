import { LOW_CONFIDENCE_THRESHOLD, isLowConfidence } from '../utils/confidence';

describe('isLowConfidence', () => {
  it('defaults to the RC-02 threshold of 0.7', () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.7);
  });

  it('flags confidence below the threshold', () => {
    expect(isLowConfidence(0.65)).toBe(true);
  });

  it('does not flag confidence at or above the threshold', () => {
    expect(isLowConfidence(0.7)).toBe(false);
    expect(isLowConfidence(0.95)).toBe(false);
  });

  it('treats unknown confidence as not low', () => {
    expect(isLowConfidence(null)).toBe(false);
  });

  it('accepts a custom threshold', () => {
    expect(isLowConfidence(0.75, 0.8)).toBe(true);
  });
});
