import { registerForPush, type PushDeps } from '../registerForPush';

const TOKEN = 'ExponentPushToken[abc]';

function deps(overrides: Partial<PushDeps> = {}): PushDeps & { registered: string[] } {
  const registered: string[] = [];
  return {
    registered,
    getPermissionStatus: async () => 'granted',
    requestPermission: async () => 'granted',
    getExpoPushToken: async () => TOKEN,
    register: async (token) => {
      registered.push(token);
    },
    ...overrides,
  };
}

describe('registerForPush', () => {
  it('registers the Expo token when permission is already granted', async () => {
    const d = deps();

    await expect(registerForPush('project-id', d)).resolves.toBe(TOKEN);
    expect(d.registered).toEqual([TOKEN]);
  });

  it('asks for permission when it has not been decided', async () => {
    const request = jest.fn(async () => 'granted' as const);
    const d = deps({ getPermissionStatus: async () => 'undetermined', requestPermission: request });

    await expect(registerForPush('project-id', d)).resolves.toBe(TOKEN);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not register when the user declines', async () => {
    const d = deps({
      getPermissionStatus: async () => 'undetermined',
      requestPermission: async () => 'denied',
    });

    await expect(registerForPush('project-id', d)).resolves.toBeNull();
    expect(d.registered).toEqual([]);
  });

  it('does not ask again once the user has denied', async () => {
    const request = jest.fn(async () => 'granted' as const);
    const d = deps({ getPermissionStatus: async () => 'denied', requestPermission: request });

    await expect(registerForPush('project-id', d)).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('skips registration when the EAS project ID is not configured', async () => {
    const d = deps();

    await expect(registerForPush(undefined, d)).resolves.toBeNull();
    expect(d.registered).toEqual([]);
  });

  it('returns null instead of throwing when the token cannot be fetched', async () => {
    const d = deps({
      getExpoPushToken: async () => {
        throw new Error('no APNs entitlement');
      },
    });

    await expect(registerForPush('project-id', d)).resolves.toBeNull();
    expect(d.registered).toEqual([]);
  });

  it('returns null instead of throwing when the backend call fails', async () => {
    const d = deps({
      register: async () => {
        throw new Error('network');
      },
    });

    await expect(registerForPush('project-id', d)).resolves.toBeNull();
  });
});
