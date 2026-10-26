interface ReleaseArgs {
  token: string | null;
  unregister: (token: string) => Promise<void>;
  clear: () => void;
}

/**
 * On sign-out, stop this device getting the account's pushes. Best-effort:
 * sign-out must succeed offline, so a failed call is ignored. The backend
 * also moves the token if another account registers it on this device.
 */
export async function releasePushToken({ token, unregister, clear }: ReleaseArgs): Promise<void> {
  if (!token) return;
  try {
    await unregister(token);
  } catch {
    // Ignore: see above.
  }
  clear();
}
