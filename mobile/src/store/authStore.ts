import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY_ACCESS = 'gg.auth.access';
const KEY_REFRESH = 'gg.auth.refresh';
const KEY_USER_ID = 'gg.auth.user';
const KEY_FIRST_RUN = 'gg.auth.first_run_completed';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'com.grocerygenie.app',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  firstRunCompleted: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (params: {
    accessToken: string;
    refreshToken: string;
    userId?: string;
  }) => Promise<void>;
  setAccessToken: (token: string) => Promise<void>;
  clear: () => Promise<void>;
  markFirstRunCompleted: () => Promise<void>;
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
  } catch {
    // Corrupted keychain — caller should fall back to clear+restart.
  }
}

async function safeDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
  } catch {
    // No-op.
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  userId: null,
  firstRunCompleted: false,
  hydrated: false,
  hydrate: async () => {
    const [accessToken, refreshToken, userId, firstRun] = await Promise.all([
      safeGet(KEY_ACCESS),
      safeGet(KEY_REFRESH),
      safeGet(KEY_USER_ID),
      safeGet(KEY_FIRST_RUN),
    ]);
    set({
      accessToken,
      refreshToken,
      userId,
      firstRunCompleted: firstRun === '1',
      hydrated: true,
    });
  },
  setSession: async ({ accessToken, refreshToken, userId }) => {
    await Promise.all([
      safeSet(KEY_ACCESS, accessToken),
      safeSet(KEY_REFRESH, refreshToken),
      userId ? safeSet(KEY_USER_ID, userId) : Promise.resolve(),
    ]);
    set({ accessToken, refreshToken, userId: userId ?? null });
  },
  setAccessToken: async (token) => {
    await safeSet(KEY_ACCESS, token);
    set({ accessToken: token });
  },
  clear: async () => {
    await Promise.all([safeDelete(KEY_ACCESS), safeDelete(KEY_REFRESH), safeDelete(KEY_USER_ID)]);
    set({ accessToken: null, refreshToken: null, userId: null });
  },
  markFirstRunCompleted: async () => {
    await safeSet(KEY_FIRST_RUN, '1');
    set({ firstRunCompleted: true });
  },
}));

export function getAuthSnapshot() {
  const state = useAuthStore.getState();
  return {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
  };
}
