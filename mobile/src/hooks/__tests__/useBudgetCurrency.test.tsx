import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';

import { ME_QUERY_KEY } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';

jest.unmock('@/hooks/useBudgetCurrency');
// eslint-disable-next-line import/first
import { useBudgetCurrency } from '@/hooks/useBudgetCurrency';

function render(profile: object | undefined) {
  const client = new QueryClient();
  if (profile) client.setQueryData(ME_QUERY_KEY, profile);
  // Signed out keeps the profile query from fetching: no network in tests.
  useAuthStore.setState({ accessToken: profile ? 'token' : null });
  return renderHook(() => useBudgetCurrency(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  }).result.current;
}

it("is the profile's currency", () => {
  expect(render({ currency_preference: 'EUR' })).toBe('EUR');
});

it('is USD without a profile', () => {
  expect(render(undefined)).toBe('USD');
});
