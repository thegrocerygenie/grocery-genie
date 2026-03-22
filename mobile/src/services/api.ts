const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// MVP: static dev token matching seeded user. Replace with secure storage in production.
const DEV_AUTH_TOKEN = 'dev-token-00000000';

export function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${DEV_AUTH_TOKEN}`,
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(`API Error: ${status}`);
  }
}

export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await response.json());
  }
  return response.json() as Promise<T>;
}
