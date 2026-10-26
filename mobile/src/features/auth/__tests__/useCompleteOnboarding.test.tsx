/**
 * useCompleteOnboarding ends onboarding in the cached /me profile, which the
 * root layout's gate reads, so the user is not sent back to Set Budget.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ME_QUERY_KEY, useCompleteOnboarding } from '@/features/auth/hooks/useAuth';
import type { UserProfile } from '@/features/auth/types';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

const mockCompleteOnboarding = jest.fn();
jest.mock('@/features/auth/services/authApi', () => ({
  completeOnboarding: () => mockCompleteOnboarding(),
}));

const profile: UserProfile = {
  id: 'u-1',
  email: 'skip@test.com',
  name: 'Skip',
  locale: 'en_US',
  currency_preference: 'USD',
  email_verified_at: null,
  preferences: {
    notification_thresholds: { fifty: false, eighty: true, hundred: true },
    weekly_summary: { enabled: true, day: 0 },
    ocr_languages: [],
  },
  needs_onboarding: true,
};

function setup() {
  // gcTime: Infinity schedules no cleanup timers, so Jest can exit.
  const qc = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  qc.setQueryData(ME_QUERY_KEY, profile);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });
  return { qc, result };
}

describe('useCompleteOnboarding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores the profile the server returns', async () => {
    mockCompleteOnboarding.mockResolvedValue({ ...profile, needs_onboarding: false });
    const { qc, result } = setup();

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData<UserProfile>(ME_QUERY_KEY)?.needs_onboarding).toBe(false);
  });

  it('lets the user in when the request fails (offline)', async () => {
    mockCompleteOnboarding.mockRejectedValue(new Error('Network request failed'));
    const { qc, result } = setup();

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(qc.getQueryData<UserProfile>(ME_QUERY_KEY)?.needs_onboarding).toBe(false);
  });
});
