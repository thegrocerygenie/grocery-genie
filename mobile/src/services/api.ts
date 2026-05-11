import { useAuthStore } from '@/store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(`API Error: ${status}`);
  }
}

let inFlightRefresh: Promise<string | null> | null = null;

async function refreshTokens(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { access_token: string; refresh_token: string };
  await useAuthStore.getState().setSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  });
  return data.access_token;
}

async function getOrRefreshToken(): Promise<string | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshTokens().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
  retried?: boolean;
}

export function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function apiClient<T>(path: string, options?: ApiOptions): Promise<T> {
  const { skipAuth, retried, ...rest } = options ?? {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(skipAuth ? {} : getAuthHeaders()),
    ...((rest.headers as Record<string, string> | undefined) ?? {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers });

  if (response.status === 401 && !skipAuth && !retried) {
    const refreshed = await getOrRefreshToken();
    if (refreshed) {
      return apiClient<T>(path, { ...options, retried: true });
    }
    await useAuthStore.getState().clear();
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // body may be empty (204).
    }
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export { API_BASE_URL };
