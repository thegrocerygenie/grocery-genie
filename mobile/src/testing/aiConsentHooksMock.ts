/**
 * Stand-in for @/features/ai-consent/hooks/useAiConsent in screen tests that
 * render without a QueryClient. Use it with:
 *   jest.mock('@/features/ai-consent/hooks/useAiConsent', () =>
 *     jest.requireActual('@/testing/aiConsentHooksMock'),
 *   );
 * and set `aiConsentMock.granted` per test (default: allowed).
 */
export const aiConsentMock = {
  granted: true as boolean | undefined,
  grant: jest.fn(),
  withdraw: jest.fn(),
  ensureConsent: jest.fn(async () => true),
  askForConsent: jest.fn(async () => true),
  markRequired: jest.fn(),
};

export function useAiConsentStatus(): boolean | undefined {
  return aiConsentMock.granted;
}

export function useGrantAiConsent() {
  return { mutate: aiConsentMock.grant, isPending: false, isError: false };
}

export function useWithdrawAiConsent() {
  return { mutateAsync: aiConsentMock.withdraw, isPending: false };
}

export function useMarkAiConsentRequired() {
  return aiConsentMock.markRequired;
}

export function useAiConsentGate() {
  return {
    ensureConsent: aiConsentMock.ensureConsent,
    askForConsent: aiConsentMock.askForConsent,
    markRequired: aiConsentMock.markRequired,
  };
}
