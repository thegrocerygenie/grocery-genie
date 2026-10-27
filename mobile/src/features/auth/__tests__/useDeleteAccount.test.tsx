/**
 * useDeleteAccount asks the server to delete the account, and only once it
 * has, clears what the device kept for it and every cached query.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { AppleReauthCancelledError, useDeleteAccount } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mockDeleteAccount = jest.fn();
jest.mock('@/features/auth/services/authApi', () => ({
  deleteAccount: (code?: string) => mockDeleteAccount(code),
}));

const mockAppleReauth = jest.fn();
jest.mock('@/features/auth/services/socialSignIn', () => ({
  runAppleReauth: () => mockAppleReauth(),
}));

const appleReauthRequired = new ApiError(409, {
  detail: { code: 'apple_reauth_required', message: 'sign in with Apple again' },
});

const mockClearLocal = jest.fn(async (_ownerId: string | null) => undefined);
jest.mock('@/features/auth/services/clearLocalAccountData', () => ({
  clearLocalAccountData: (ownerId: string | null) => mockClearLocal(ownerId),
}));

// A JWT whose payload is {"sub":"u-1"}; only the subject is read.
const TOKEN = `h.${btoa(JSON.stringify({ sub: 'u-1' }))}.s`;

function setup() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  qc.setQueryData(['receipts'], ['cached']);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useDeleteAccount(), { wrapper });
  return { qc, result };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await useAuthStore.getState().setSession({ accessToken: TOKEN, refreshToken: 'r' });
});

describe('useDeleteAccount', () => {
  it("deletes on the server, then clears the account's local data and the query cache", async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    const { qc, result } = setup();

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearLocal).toHaveBeenCalledWith('u-1');
    expect(qc.getQueryData(['receipts'])).toBeUndefined();
  });

  it('keeps everything when the server call fails', async () => {
    mockDeleteAccount.mockRejectedValue(new Error('offline'));
    const { qc, result } = setup();

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockClearLocal).not.toHaveBeenCalled();
    expect(qc.getQueryData(['receipts'])).toEqual(['cached']);
  });

  it('for a Sign in with Apple account, asks Apple again and retries with the fresh code', async () => {
    mockDeleteAccount.mockRejectedValueOnce(appleReauthRequired).mockResolvedValueOnce(undefined);
    mockAppleReauth.mockResolvedValue('fresh-code');
    const { result } = setup();

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDeleteAccount.mock.calls).toEqual([[undefined], ['fresh-code']]);
    expect(mockClearLocal).toHaveBeenCalledWith('u-1');
  });

  it('keeps everything when the user cancels the Apple sheet', async () => {
    mockDeleteAccount.mockRejectedValueOnce(appleReauthRequired);
    mockAppleReauth.mockResolvedValue(null);
    const { qc, result } = setup();

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(AppleReauthCancelledError);
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearLocal).not.toHaveBeenCalled();
    expect(qc.getQueryData(['receipts'])).toEqual(['cached']);
  });
});
