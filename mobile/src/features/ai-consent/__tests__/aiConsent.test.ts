/**
 * App Store 5.1.2(i): the server refuses a scan until the user allows
 * receipts to go to Anthropic. These helpers read that refusal and run the
 * one-time consent sheet.
 */
import { ApiError } from '@/services/api';
import type { UserProfile } from '@/features/auth/types';

import { AI_CONSENT_POLICY_VERSION } from '../constants';
import { answerAiConsent, requestAiConsent } from '../services/consentPrompt';
import { aiConsentGranted, isAiConsentRequiredError, withConsent } from '../utils/aiConsent';

const REQUIRED = new ApiError(403, {
  detail: {
    code: 'ai_consent_required',
    message: 'Reading a receipt sends its photo…',
    policy_version: AI_CONSENT_POLICY_VERSION,
  },
});

describe('isAiConsentRequiredError', () => {
  it('matches the server refusal', () => {
    expect(isAiConsentRequiredError(REQUIRED)).toBe(true);
  });

  it.each([
    ['another 403', new ApiError(403, { detail: { code: 'forbidden' } })],
    ['a 403 with a string detail', new ApiError(403, { detail: 'nope' })],
    ['a 422', new ApiError(422, { detail: 'Image quality insufficient: blurry' })],
    ['a network failure', new TypeError('Network request failed')],
    ['nothing', undefined],
  ])('ignores %s', (_label, error) => {
    expect(isAiConsentRequiredError(error)).toBe(false);
  });
});

const profile = {
  id: 'u-1',
  ai_consent: {
    granted: true,
    granted_at: '2026-10-27T10:00:00Z',
    policy_version: AI_CONSENT_POLICY_VERSION,
    current_policy_version: AI_CONSENT_POLICY_VERSION,
  },
} as UserProfile;

describe('aiConsentGranted', () => {
  it('reads the profile', () => {
    expect(aiConsentGranted(profile)).toBe(true);
    expect(aiConsentGranted(withConsent(profile, false))).toBe(false);
  });

  it('is unknown with no profile, so the server decides', () => {
    expect(aiConsentGranted(undefined)).toBeUndefined();
  });

  it('is unknown when the server sends no consent field', () => {
    expect(aiConsentGranted({ id: 'u-1' } as UserProfile)).toBeUndefined();
  });
});

describe('withConsent', () => {
  it('marks consent withdrawn without dropping the rest of the profile', () => {
    const next = withConsent(profile, false);
    expect(next?.id).toBe('u-1');
    expect(next?.ai_consent?.granted).toBe(false);
    expect(next?.ai_consent?.current_policy_version).toBe(AI_CONSENT_POLICY_VERSION);
  });

  it('leaves a missing profile missing', () => {
    expect(withConsent(undefined, false)).toBeUndefined();
  });
});

describe('consent prompt', () => {
  it('opens the sheet and resolves with the answer', async () => {
    const open = jest.fn();
    const answer = requestAiConsent(open);
    expect(open).toHaveBeenCalledTimes(1);
    answerAiConsent(true);
    await expect(answer).resolves.toBe(true);
  });

  it('answers an earlier request no when a new one starts', async () => {
    const first = requestAiConsent(jest.fn());
    const second = requestAiConsent(jest.fn());
    await expect(first).resolves.toBe(false);
    answerAiConsent(true);
    await expect(second).resolves.toBe(true);
  });

  it('ignores an answer with no request waiting', () => {
    expect(() => answerAiConsent(false)).not.toThrow();
  });
});
