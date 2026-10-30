/**
 * useAiConsentStatus observes ['auth','me'] with queryFn: skipToken; useMe
 * fetches it. Refetching the profile must call fetchMe, never the skipToken
 * observer's queryFn ("Attempted to invoke queryFn when set to skipToken").
 *
 * The same cause broke useMe's automatic retry at launch with the backend
 * down. That path needs the app's render order between the failure and the
 * retry, which two renderHook roots don't reproduce; it was checked on a
 * native Simulator build instead.
 */
import React from 'react';
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useAiConsentStatus } from '../hooks/useAiConsent';
import { ME_QUERY_KEY, useMe } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { fakeAccessToken } from '@/testing/jwt';

const mockFetchMe = jest.fn();
jest.mock('@/features/auth/services/authApi', () => ({
  ...jest.requireActual('@/features/auth/services/authApi'),
  fetchMe: () => mockFetchMe(),
}));

const SKIP = /skipToken/;

const cleanups: (() => void)[] = [];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // Root layout mounts useMe first; screens add the consent observer later.
  const me = renderHook(() => useMe(), { wrapper });
  const consent = renderHook(() => useAiConsentStatus(), { wrapper });
  cleanups.push(() => {
    consent.unmount();
    me.unmount();
    client.clear();
  });
  return { client, me, consent };
}

let errors: jest.SpyInstance;
beforeEach(() => {
  mockFetchMe.mockReset();
  useAuthStore.setState({ accessToken: fakeAccessToken('user-a') } as never);
  errors = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function skipTokenErrors() {
  return errors.mock.calls.filter((args) => SKIP.test(String(args[0])));
}

describe('profile refetch with the skipToken observer mounted', () => {
  it('invalidating the profile refetches it through fetchMe', async () => {
    mockFetchMe.mockResolvedValue({ id: 'u' });
    const { client } = setup();
    await waitFor(() => expect(mockFetchMe).toHaveBeenCalledTimes(1));

    await act(() => client.invalidateQueries({ queryKey: ME_QUERY_KEY }));

    expect(skipTokenErrors()).toEqual([]);
    expect(mockFetchMe).toHaveBeenCalledTimes(2);
  });

  it('refetching after a failed load goes through fetchMe', async () => {
    mockFetchMe.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 'u' });
    const { client } = setup();
    await waitFor(() => expect(mockFetchMe).toHaveBeenCalledTimes(1));

    await act(() => client.refetchQueries({ queryKey: ME_QUERY_KEY }));

    expect(skipTokenErrors()).toEqual([]);
    expect(mockFetchMe).toHaveBeenCalledTimes(2);
  });

  // The consent hook only reads the cache: carrying fetchMe must not make it fetch.
  it('never fetches the profile from the consent observer on its own', async () => {
    mockFetchMe.mockResolvedValue({ id: 'u' });
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const consent = renderHook(() => useAiConsentStatus(), { wrapper });
    cleanups.push(() => {
      consent.unmount();
      client.clear();
    });

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    consent.rerender({});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetchMe).not.toHaveBeenCalled();
    expect(consent.result.current).toBeUndefined();
  });
});
