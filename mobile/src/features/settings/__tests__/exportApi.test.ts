/**
 * V11-P2 (NFR Privacy 2): the app downloads `GET /api/users/me/export` into the
 * cache, hands it to the iOS share sheet, then removes its copy.
 */
import { Share } from 'react-native';

import { ApiError } from '@/services/api';
import { isPremiumRequired } from '@/utils/premium';
import { useAuthStore } from '@/store/authStore';
import { downloadExport, exportFileName, shareExport } from '../services/exportApi';

const mockDownload = jest.fn();
const mockDelete = jest.fn();
let mockExists = false;

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(base: string | { uri: string }, name?: string) {
      this.uri = typeof base === 'string' ? base : `${base.uri}${name}`;
    }
    get exists() {
      return mockExists;
    }
    delete() {
      mockDelete(this.uri);
    }
    static downloadFileAsync(...args: unknown[]) {
      return mockDownload(...args);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});

const mockFetchMe = jest.fn();
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: () => mockFetchMe(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockExists = false;
  useAuthStore.setState({ accessToken: 'tok' });
  mockFetchMe.mockResolvedValue({ is_premium: true });
});

describe('exportFileName', () => {
  it('names the file by date, .json for JSON and .zip for CSV', () => {
    const day = new Date(2026, 10, 3, 9);
    expect(exportFileName('json', day)).toBe('grocery-genie-export-2026-11-03.json');
    expect(exportFileName('csv', day)).toBe('grocery-genie-export-2026-11-03.zip');
  });
});

describe('downloadExport', () => {
  it('downloads the chosen format with the session token into the cache', async () => {
    mockDownload.mockImplementation((_url: string, file: { uri: string }) => Promise.resolve(file));

    const uri = await downloadExport('csv', new Date(2026, 10, 3));

    expect(uri).toBe('file:///cache/grocery-genie-export-2026-11-03.zip');
    const [url, , options] = mockDownload.mock.calls[0];
    expect(url).toMatch(/\/api\/users\/me\/export\?format=csv$/);
    expect(options.headers.Authorization).toBe('Bearer tok');
    expect(options.idempotent).toBe(true);
  });

  it('a free user gets premium_required without a download', async () => {
    mockFetchMe.mockResolvedValue({ is_premium: false });

    const error = await downloadExport('json').catch((e: unknown) => e);

    expect(isPremiumRequired(error)).toBe(true);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('a 403 from the download is premium_required (Premium lapsed meanwhile)', async () => {
    mockDownload.mockRejectedValue(new Error('Unable to download: response has status 403'));

    const error = await downloadExport('json').catch((e: unknown) => e);

    expect(isPremiumRequired(error)).toBe(true);
  });

  it('any other failure is passed on as is', async () => {
    mockDownload.mockRejectedValue(new Error('The Internet connection appears to be offline.'));

    const error = await downloadExport('json').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(isPremiumRequired(error)).toBe(false);
  });

  it('replaces an earlier export of the same day', async () => {
    mockExists = true;
    mockDownload.mockImplementation((_url: string, file: { uri: string }) => Promise.resolve(file));

    await downloadExport('json', new Date(2026, 10, 3));

    expect(mockDelete).toHaveBeenCalledWith('file:///cache/grocery-genie-export-2026-11-03.json');
  });
});

describe('shareExport', () => {
  it('opens the share sheet with the file, then deletes the cached copy', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    mockExists = true;

    await shareExport('file:///cache/x.zip');

    expect(share).toHaveBeenCalledWith({ url: 'file:///cache/x.zip' });
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/x.zip');
  });
});
