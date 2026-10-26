export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Platform calls, injected so the flow can be tested without a device. */
export interface PushDeps {
  getPermissionStatus: () => Promise<PermissionStatus>;
  requestPermission: () => Promise<PermissionStatus>;
  getExpoPushToken: (projectId: string) => Promise<string>;
  register: (token: string) => Promise<void>;
}

/**
 * Ask for notification permission (once) and register this device's Expo push
 * token with the backend. Returns the token, or null when push isn't
 * available: no EAS project ID, permission declined, simulator, or offline.
 * Never throws: push is best-effort and must not block the app.
 */
export async function registerForPush(
  projectId: string | undefined,
  deps: PushDeps,
): Promise<string | null> {
  if (!projectId) return null;
  try {
    let status = await deps.getPermissionStatus();
    if (status === 'undetermined') status = await deps.requestPermission();
    if (status !== 'granted') return null;

    const token = await deps.getExpoPushToken(projectId);
    await deps.register(token);
    return token;
  } catch {
    return null;
  }
}
