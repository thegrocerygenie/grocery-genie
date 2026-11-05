/**
 * V11-P2 (NFR Privacy 2), PREM-04: the app downloads `GET /api/users/me/export`
 * with the chosen format, range and includes into the cache, hands it to the
 * iOS share sheet, then removes its copy. `GET /api/users/me/export/summary`
 * gives the count for "Export N receipts".
 */
import { Share } from 'react-native';

import { ApiError } from '@/services/api';
import { isPremiumRequired } from '@/utils/premium';
import { useAuthStore } from '@/store/authStore';
import {
  downloadExport,
  exportFileName,
  exportQuery,
  fetchExportSummary,
  isExportBusy,
  shareExport,
  type ExportRequest,
} from '../services/exportApi';

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

function request(overrides: Partial<ExportRequest> = {}): ExportRequest {
  return {
    format: 'json',
    from: null,
    to: null,
    includes: ['receipts', 'prices', 'budgets'],
    ...overrides,
  };
}

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockExists = false;
  useAuthStore.setState({ accessToken: 'tok' });
  mockFetchMe.mockResolvedValue({ is_premium: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('exportFileName', () => {
  const day = new Date(2026, 10, 3, 9);

  it('names the file by date: .json, .zip for CSV, .pdf for the report', () => {
    expect(exportFileName(request(), day)).toBe('grocery-genie-export-2026-11-03.json');
    expect(exportFileName(request({ format: 'csv' }), day)).toBe(
      'grocery-genie-export-2026-11-03.zip',
    );
    expect(exportFileName(request({ format: 'pdf' }), day)).toBe(
      'grocery-genie-report-2026-11-03.pdf',
    );
  });

  it('with receipt images every format is a zip', () => {
    for (const format of ['json', 'csv', 'pdf'] as const) {
      expect(exportFileName(request({ format, includes: ['receipts', 'images'] }), day)).toBe(
        'grocery-genie-export-2026-11-03.zip',
      );
    }
  });
});

describe('exportQuery', () => {
  it('sends the format, the range and the includes in the screen order', () => {
    expect(
      exportQuery(
        request({
          format: 'pdf',
          from: '2025-12-01',
          to: '2026-11-30',
          includes: ['images', 'receipts'],
        }),
      ),
    ).toBe('format=pdf&from=2025-12-01&to=2026-11-30&include=receipts%2Cimages');
  });

  it('All time sends no dates', () => {
    expect(exportQuery(request())).toBe('format=json&include=receipts%2Cprices%2Cbudgets');
  });
});

describe('downloadExport', () => {
  it('downloads the chosen options with the session token into the cache', async () => {
    mockDownload.mockImplementation((_url: string, file: { uri: string }) => Promise.resolve(file));

    const uri = await downloadExport(
      request({ format: 'csv', from: '2025-12-01', to: '2026-11-30' }),
      new Date(2026, 10, 3),
    );

    expect(uri).toBe('file:///cache/grocery-genie-export-2026-11-03.zip');
    const [url, , options] = mockDownload.mock.calls[0];
    expect(url).toMatch(
      /\/api\/users\/me\/export\?format=csv&from=2025-12-01&to=2026-11-30&include=receipts%2Cprices%2Cbudgets$/,
    );
    expect(options.headers.Authorization).toBe('Bearer tok');
    expect(options.idempotent).toBe(true);
  });

  it('a free user gets premium_required without a download', async () => {
    mockFetchMe.mockResolvedValue({ is_premium: false });

    const error = await downloadExport(request()).catch((e: unknown) => e);

    expect(isPremiumRequired(error)).toBe(true);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('a 403 from the download is premium_required (Premium lapsed meanwhile)', async () => {
    mockDownload.mockRejectedValue(new Error('Unable to download: response has status 403'));

    const error = await downloadExport(request()).catch((e: unknown) => e);

    expect(isPremiumRequired(error)).toBe(true);
  });

  it('a 429 from the download is export_busy (rate limited, or one already running)', async () => {
    mockDownload.mockRejectedValue(new Error('Unable to download: response has status 429'));

    const error = await downloadExport(request()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect(isExportBusy(error)).toBe(true);
    expect(isPremiumRequired(error)).toBe(false);
  });

  it('any other failure is passed on as is', async () => {
    mockDownload.mockRejectedValue(new Error('The Internet connection appears to be offline.'));

    const error = await downloadExport(request()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(isPremiumRequired(error)).toBe(false);
  });

  it('replaces an earlier export of the same day', async () => {
    mockExists = true;
    mockDownload.mockImplementation((_url: string, file: { uri: string }) => Promise.resolve(file));

    await downloadExport(request(), new Date(2026, 10, 3));

    expect(mockDelete).toHaveBeenCalledWith('file:///cache/grocery-genie-export-2026-11-03.json');
  });
});

describe('fetchExportSummary', () => {
  it('asks the server how many receipts the range holds', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ receipt_count: 1247 }),
    });

    const summary = await fetchExportSummary('2025-12-01', '2026-11-30');

    expect(summary).toEqual({ receipt_count: 1247 });
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/api\/users\/me\/export\/summary\?from=2025-12-01&to=2026-11-30$/,
    );
  });

  it('All time asks without dates', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ receipt_count: 3 }),
    });

    await fetchExportSummary(null, null);

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/users\/me\/export\/summary$/);
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
