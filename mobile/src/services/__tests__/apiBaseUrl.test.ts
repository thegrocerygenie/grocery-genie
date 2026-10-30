/**
 * Without EXPO_PUBLIC_API_URL the app talks to the local backend that
 * `make backend-dev` serves, on port 8001 (see mobile/.env.example).
 */
const saved = process.env.EXPO_PUBLIC_API_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = saved;
});

function baseUrl(): string {
  let url = '';
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    url = require('../api').API_BASE_URL;
  });
  return url;
}

describe('API_BASE_URL', () => {
  it('falls back to the port make backend-dev serves on', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    expect(baseUrl()).toBe('http://localhost:8001');
  });

  it('uses EXPO_PUBLIC_API_URL when it is set', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    expect(baseUrl()).toBe('https://api.example.test');
  });
});
