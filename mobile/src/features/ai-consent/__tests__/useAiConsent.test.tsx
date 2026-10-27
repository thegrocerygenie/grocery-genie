/**
 * Consent lives on the account (GET /api/users/me). Granting and withdrawing
 * store the profile the server returns, and the gate opens the sheet only
 * when the profile says consent is missing.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ME_QUERY_KEY } from '@/features/auth/hooks/useAuth';
import type { UserProfile } from '@/features/auth/types';

import { AI_CONSENT_POLICY_VERSION } from '../constants';
import { useAiConsentGate, useGrantAiConsent, useWithdrawAiConsent } from '../hooks/useAiConsent';
import { answerAiConsent } from '../services/consentPrompt';
import { withConsent } from '../utils/aiConsent';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockGrant = jest.fn();
const mockWithdraw = jest.fn();
jest.mock('../services/aiConsentApi', () => ({
  grantAiConsent: (version: string) => mockGrant(version),
  withdrawAiConsent: () => mockWithdraw(),
}));

const granted: UserProfile = {
  id: 'u-1',
  email: 'a@test.com',
  name: 'A',
  locale: 'en_US',
  currency_preference: 'USD',
  email_verified_at: null,
  preferences: {
    notification_thresholds: { fifty: false, eighty: true, hundred: true },
    weekly_summary: { enabled: true, day: 0 },
    ocr_languages: [],
  },
  ai_consent: {
    granted: true,
    granted_at: '2026-10-27T10:00:00Z',
    policy_version: AI_CONSENT_POLICY_VERSION,
    current_policy_version: AI_CONSENT_POLICY_VERSION,
  },
};
const notGranted = withConsent(granted, false)!;

function setup<T>(hook: () => T, profile?: UserProfile) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  if (profile) qc.setQueryData(ME_QUERY_KEY, profile);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(hook, { wrapper });
  return { qc, result };
}

beforeEach(() => jest.clearAllMocks());

describe('useGrantAiConsent', () => {
  it('sends the policy version the sheet showed and stores the profile', async () => {
    mockGrant.mockResolvedValue(granted);
    const { qc, result } = setup(() => useGrantAiConsent(), notGranted);

    await act(() => result.current.mutateAsync());

    expect(mockGrant).toHaveBeenCalledWith(AI_CONSENT_POLICY_VERSION);
    expect(qc.getQueryData<UserProfile>(ME_QUERY_KEY)?.ai_consent?.granted).toBe(true);
  });
});

describe('useWithdrawAiConsent', () => {
  it('stores the profile the server returns', async () => {
    mockWithdraw.mockResolvedValue(notGranted);
    const { qc, result } = setup(() => useWithdrawAiConsent(), granted);

    await act(() => result.current.mutateAsync());

    expect(mockWithdraw).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData<UserProfile>(ME_QUERY_KEY)?.ai_consent?.granted).toBe(false);
  });
});

describe('useAiConsentGate', () => {
  it('lets the action run at once with consent', async () => {
    const { result } = setup(() => useAiConsentGate(), granted);
    await expect(result.current.ensureConsent()).resolves.toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lets the action run when consent is unknown: the server decides', async () => {
    const { result } = setup(() => useAiConsentGate());
    await expect(result.current.ensureConsent()).resolves.toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens the consent sheet without consent, and runs on Allow', async () => {
    const { result } = setup(() => useAiConsentGate(), notGranted);
    const answer = result.current.ensureConsent();
    expect(mockPush).toHaveBeenCalledWith('/ai-consent');
    answerAiConsent(true);
    await expect(answer).resolves.toBe(true);
  });

  it('does not run when the user picks manual entry', async () => {
    const { result } = setup(() => useAiConsentGate(), notGranted);
    const answer = result.current.ensureConsent();
    answerAiConsent(false);
    await expect(answer).resolves.toBe(false);
  });

  it('askForConsent always opens the sheet, as Settings needs', async () => {
    const { result } = setup(() => useAiConsentGate());
    const answer = result.current.askForConsent();
    expect(mockPush).toHaveBeenCalledWith('/ai-consent');
    answerAiConsent(false);
    await expect(answer).resolves.toBe(false);
  });

  it('marks consent missing after the server refuses a scan', async () => {
    const { qc, result } = setup(() => useAiConsentGate(), granted);
    act(() => result.current.markRequired());
    await waitFor(() =>
      expect(qc.getQueryData<UserProfile>(ME_QUERY_KEY)?.ai_consent?.granted).toBe(false),
    );
  });
});
