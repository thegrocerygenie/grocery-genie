import type { UserProfile } from '@/features/auth/types';
import { ApiError, apiErrorCode } from '@/services/api';

/** The server's refusal of a scan without consent (app/services/ai_consent.py). */
export function isAiConsentRequiredError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    apiErrorCode(error) === 'ai_consent_required'
  );
}

/**
 * Whether the account allows AI reading. Undefined when unknown (no profile
 * yet, or a server without the field): the app then lets the server decide.
 */
export function aiConsentGranted(profile: UserProfile | undefined): boolean | undefined {
  return profile?.ai_consent?.granted;
}

/** The profile with consent set, for the cache after the server refused a scan. */
export function withConsent(
  profile: UserProfile | undefined,
  granted: boolean,
): UserProfile | undefined {
  if (!profile?.ai_consent) return profile;
  return { ...profile, ai_consent: { ...profile.ai_consent, granted } };
}
