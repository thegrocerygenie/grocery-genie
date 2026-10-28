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

/**
 * Called by the sheet: Allow saved, manual entry, or the sheet was dismissed.
 * With `delayMs`, the waiting request is taken now and answered later, so a
 * new request in between is not answered by mistake.
 */
export function answerAiConsent(allowed: boolean, delayMs = 0): void {
  const resolve = pending;
  pending = null;
  if (!resolve) return;
  if (delayMs > 0) setTimeout(() => resolve(allowed), delayMs);
  else resolve(allowed);
}
