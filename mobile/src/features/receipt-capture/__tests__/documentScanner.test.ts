import { ExecutionEnvironment } from 'expo-constants';

import {
  isDocumentScannerAvailable,
  scanDocument,
  SCANNER_OPTIONS,
} from '../services/documentScanner';

const mockLaunchScanner = jest.fn();
const mockDelete = jest.fn();
const mockConstants = { executionEnvironment: 'bare' as string };
const mockDevice = { isDevice: true };
let mockModuleAvailable = true;

jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
  ExecutionEnvironment: { StoreClient: 'storeClient', Bare: 'bare', Standalone: 'standalone' },
}));
jest.mock('expo-device', () => ({
  __esModule: true,
  get isDevice() {
    return mockDevice.isDevice;
  },
}));
jest.mock('@dariyd/react-native-document-scanner', () => ({
  __esModule: true,
  get default() {
    return mockModuleAvailable ? { launchScanner: jest.fn() } : null;
  },
  launchScanner: (...args: unknown[]) => mockLaunchScanner(...args),
}));
jest.mock('../services/pendingImageFiles', () => ({
  deleteQuietly: (uri: string) => mockDelete(uri),
}));

const page = (n: number) => ({
  uri: `file:///tmp/page-${n}.jpg`,
  type: 'image/jpeg',
  width: 1500,
  height: 2000,
  fileSize: 1000,
  fileName: `page-${n}.jpg`,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockConstants.executionEnvironment = 'bare';
  mockDevice.isDevice = true;
  mockModuleAvailable = true;
});

describe('isDocumentScannerAvailable', () => {
  it('is true in a native build on a device', () => {
    expect(isDocumentScannerAvailable()).toBe(true);
  });

  it('is false in Expo Go, which has no native module', () => {
    mockConstants.executionEnvironment = ExecutionEnvironment.StoreClient;
    expect(isDocumentScannerAvailable()).toBe(false);
  });

  it('is false on the Simulator, which has no document camera', () => {
    mockDevice.isDevice = false;
    expect(isDocumentScannerAvailable()).toBe(false);
  });

  it('is false when the native module is missing from the build', () => {
    mockModuleAvailable = false;
    expect(isDocumentScannerAvailable()).toBe(false);
  });
});

describe('scanDocument', () => {
  it('asks for a JPEG capped in size, with no location', async () => {
    mockLaunchScanner.mockResolvedValue({ images: [page(1)] });
    await scanDocument();
    expect(mockLaunchScanner).toHaveBeenCalledWith(SCANNER_OPTIONS);
    // Below 1, or the module writes a large PNG.
    expect(SCANNER_OPTIONS.quality).toBeLessThan(1);
    expect(SCANNER_OPTIONS.includeLocationExif).toBe(false);
  });

  it('returns the page', async () => {
    mockLaunchScanner.mockResolvedValue({ images: [page(1)] });
    await expect(scanDocument()).resolves.toEqual({
      kind: 'page',
      uri: 'file:///tmp/page-1.jpg',
      mimeType: 'image/jpeg',
      width: 1500,
      height: 2000,
      droppedPages: 0,
    });
  });

  it('keeps the first page of several and deletes the rest', async () => {
    mockLaunchScanner.mockResolvedValue({ images: [page(1), page(2), page(3)] });
    const outcome = await scanDocument();
    expect(outcome).toMatchObject({ kind: 'page', uri: 'file:///tmp/page-1.jpg', droppedPages: 2 });
    expect(mockDelete.mock.calls).toEqual([['file:///tmp/page-2.jpg'], ['file:///tmp/page-3.jpg']]);
  });

  it('treats a cancel as cancelled', async () => {
    mockLaunchScanner.mockResolvedValue({ didCancel: true });
    await expect(scanDocument()).resolves.toEqual({ kind: 'cancelled' });
  });

  it('treats a scan with no pages as cancelled', async () => {
    mockLaunchScanner.mockResolvedValue({ images: [] });
    await expect(scanDocument()).resolves.toEqual({ kind: 'cancelled' });
  });

  it('reports a scanner error', async () => {
    mockLaunchScanner.mockResolvedValue({ error: true, errorMessage: 'camera unavailable' });
    await expect(scanDocument()).resolves.toEqual({
      kind: 'failed',
      message: 'camera unavailable',
    });
  });

  it('reports a missing module as a failure, not a throw', async () => {
    mockLaunchScanner.mockRejectedValue({ error: true, errorMessage: 'not available' });
    await expect(scanDocument()).resolves.toEqual({ kind: 'failed', message: 'not available' });
  });

  it('does not open the scanner where it is unavailable', async () => {
    mockDevice.isDevice = false;
    await expect(scanDocument()).resolves.toMatchObject({ kind: 'failed' });
    expect(mockLaunchScanner).not.toHaveBeenCalled();
  });
});
