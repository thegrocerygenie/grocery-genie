import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { useUpdatePreferences } from '../hooks/useAuth';

jest.mock('../services/authApi', () => ({
  updatePreferences: jest.fn(async (p: object) => ({ id: 'u-1', ...p })),
}));

function setup() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useUpdatePreferences(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { result, invalidate };
}

it('refreshes spend when the budget currency changes', async () => {
  // Seen on the Simulator: the dashboard kept the old currency's total.
  const { result, invalidate } = setup();

  await act(() => result.current.mutateAsync({ currency_preference: 'USD' }));

  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['budgets'] });
});

it('leaves spend alone for other preferences', async () => {
  const { result, invalidate } = setup();

  await act(() => result.current.mutateAsync({ locale: 'en' }));

  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['dashboard'] });
});
