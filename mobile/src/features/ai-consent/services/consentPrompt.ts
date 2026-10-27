/**
 * The consent sheet is a route (app/ai-consent.tsx), so the code that opens
 * it waits here for the answer. One request at a time: a new one answers the
 * previous one "no".
 */
let pending: ((allowed: boolean) => void) | null = null;

export function requestAiConsent(open: () => void): Promise<boolean> {
  answerAiConsent(false);
  return new Promise<boolean>((resolve) => {
    pending = resolve;
    open();
  });
}

/** Called by the sheet: Allow saved, manual entry, or the sheet was dismissed. */
export function answerAiConsent(allowed: boolean): void {
  const resolve = pending;
  pending = null;
  resolve?.(allowed);
}
