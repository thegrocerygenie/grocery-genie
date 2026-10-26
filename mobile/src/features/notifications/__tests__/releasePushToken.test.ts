import { releasePushToken } from '../releasePushToken';

describe('releasePushToken', () => {
  it('unregisters the device token and forgets it', async () => {
    const unregister = jest.fn(async () => {});
    const clear = jest.fn();

    await releasePushToken({ token: 'ExponentPushToken[abc]', unregister, clear });

    expect(unregister).toHaveBeenCalledWith('ExponentPushToken[abc]');
    expect(clear).toHaveBeenCalled();
  });

  it('does nothing when no token was registered', async () => {
    const unregister = jest.fn(async () => {});

    await releasePushToken({ token: null, unregister, clear: jest.fn() });

    expect(unregister).not.toHaveBeenCalled();
  });

  it('still forgets the token when the backend call fails', async () => {
    const clear = jest.fn();

    await expect(
      releasePushToken({
        token: 'ExponentPushToken[abc]',
        unregister: async () => {
          throw new Error('offline');
        },
        clear,
      }),
    ).resolves.toBeUndefined();
    expect(clear).toHaveBeenCalled();
  });
});
