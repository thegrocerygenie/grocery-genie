/** RC-02: extracted fields below this confidence are flagged for review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function isLowConfidence(
  confidence: number | null | undefined,
  threshold: number = LOW_CONFIDENCE_THRESHOLD,
): boolean {
  return confidence != null && confidence < threshold;
}
