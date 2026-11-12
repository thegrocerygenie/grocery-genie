import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { tokenSubject } from '@/features/auth/utils/tokenSubject';

const KEY_ACCESS = 'gg.auth.access';
const KEY_REFRESH = 'gg.auth.refresh';
const KEY_USER_ID = 'gg.auth.user';
const KEY_FIRST_RUN = 'gg.auth.first_run_completed';
const KEY_ONBOARDING = 'gg.auth.onboarding';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'com.grocerygenie.app',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  firstRunCompleted: boolean;
  onboarding: OnboardingMemory | null;
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
  rememberOnboarding: (needsOnboarding: boolean) => Promise<void>;
}

/**
 * The last `needs_onboarding` the profile returned, and the account it is for
 * (DA-14). A cold start offline reads it to open a held push tap without
 * waiting for the profile. Only the account id and the flag are kept.
 */
interface OnboardingMemory {
  userId: string;
  needsOnboarding: boolean;
}

function parseOnboarding(raw: string | null): OnboardingMemory | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OnboardingMemory>;
    if (typeof value.userId !== 'string' || typeof value.needsOnboarding !== 'boolean') {
      return null;
    }
    return { userId: value.userId, needsOnboarding: value.needsOnboarding };
  } catch {
    return null;
  }
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

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  userId: null,
  firstRunCompleted: false,
  onboarding: null,
  hydrated: false,
  hydrate: async () => {
    const [accessToken, refreshToken, userId, firstRun, onboarding] = await Promise.all([
      safeGet(KEY_ACCESS),
      safeGet(KEY_REFRESH),
      safeGet(KEY_USER_ID),
      safeGet(KEY_FIRST_RUN),
      safeGet(KEY_ONBOARDING),
    ]);
    set({
      accessToken,
      refreshToken,
      userId,
      firstRunCompleted: firstRun === '1',
      onboarding: parseOnboarding(onboarding),
      hydrated: true,
    });
  },
  setSession: async ({ accessToken, refreshToken, userId }) => {
    // Another account signing in never inherits this one's onboarding state.
    const { onboarding } = get();
    const otherAccount = !!onboarding && onboarding.userId !== tokenSubject(accessToken);
    await Promise.all([
      safeSet(KEY_ACCESS, accessToken),
      safeSet(KEY_REFRESH, refreshToken),
      userId ? safeSet(KEY_USER_ID, userId) : Promise.resolve(),
      otherAccount ? safeDelete(KEY_ONBOARDING) : Promise.resolve(),
    ]);
    set({
      accessToken,
      refreshToken,
      userId: userId ?? null,
      ...(otherAccount ? { onboarding: null } : {}),
    });
  },
  setAccessToken: async (token) => {
    await safeSet(KEY_ACCESS, token);
    set({ accessToken: token });
  },
  clear: async () => {
    await Promise.all([
      safeDelete(KEY_ACCESS),
      safeDelete(KEY_REFRESH),
      safeDelete(KEY_USER_ID),
      safeDelete(KEY_ONBOARDING),
    ]);
    set({ accessToken: null, refreshToken: null, userId: null, onboarding: null });
  },
  markFirstRunCompleted: async () => {
    await safeSet(KEY_FIRST_RUN, '1');
    set({ firstRunCompleted: true });
  },
  rememberOnboarding: async (needsOnboarding) => {
    const userId = tokenSubject(get().accessToken);
    if (!userId) return;
    const { onboarding } = get();
    if (onboarding?.userId === userId && onboarding.needsOnboarding === needsOnboarding) return;
    const next = { userId, needsOnboarding };
    set({ onboarding: next });
    await safeSet(KEY_ONBOARDING, JSON.stringify(next));
  },
}));

/**
 * The signed-in account's last known `needs_onboarding`, or null when this
 * device has none for it (first launch for the account, or another account's).
 */
export function cachedNeedsOnboarding(
  state: Pick<AuthState, 'accessToken' | 'onboarding'>,
): boolean | null {
  const userId = tokenSubject(state.accessToken);
  if (!userId || state.onboarding?.userId !== userId) return null;
  return state.onboarding.needsOnboarding;
}

export function getAuthSnapshot() {
  const state = useAuthStore.getState();
  return {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
  };
}
