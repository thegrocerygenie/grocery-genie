import * as AppleAuthentication from 'expo-apple-authentication';

import { runAppleSignIn } from './socialSignIn';

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
}));

const apple = AppleAuthentication as jest.Mocked<typeof AppleAuthentication>;

describe('runAppleSignIn', () => {
  beforeEach(() => {
    apple.isAvailableAsync.mockResolvedValue(true);
    apple.signInAsync.mockResolvedValue({
      identityToken: 'id-token',
      authorizationCode: 'auth-code',
      fullName: { givenName: 'Ada', familyName: 'Lovelace' },
    } as AppleAuthentication.AppleAuthenticationCredential);
  });

  it('asks Apple for the email only, not the full name', async () => {
    await runAppleSignIn();

    expect(apple.signInAsync).toHaveBeenCalledWith({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  });

  it('sends no name to the server, even if Apple returns one', async () => {
    const credential = await runAppleSignIn();

    expect(credential).toEqual({
      identity_token: 'id-token',
      authorization_code: 'auth-code',
    });
  });
});
