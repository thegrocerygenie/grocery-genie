import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type { ScanOptions, ScanResult } from '@dariyd/react-native-document-scanner';

import { deleteQuietly } from './pendingImageFiles';

/**
 * Apple's document scanner (VNDocumentCameraViewController), RC-01 AC 1 and
 * AC 3: live edge detection, auto-capture, a flattened crop, and its own
 * retake. See .planning/PLAN-2026-11-01-document-scanner.md.
 */

/** Below 1, or the module writes PNG. 2000 px keeps text sharp and the upload small. */
export const SCANNER_OPTIONS: ScanOptions = {
  quality: 0.8,
  maxWidth: 2000,
  maxHeight: 2000,
  includeBase64: false,
  includeExif: false,
  // The build has no CoreLocation (plugins/withDocumentScannerNoLocation.js).
  includeLocationExif: false,
  requestLocationPermission: false,
};

export type ScanOutcome =
  | {
      kind: 'page';
      uri: string;
      mimeType: string;
      width: number;
      height: number;
      /** Pages after the first, which were deleted (decision B: one page per receipt). */
      droppedPages: number;
    }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

interface ScannerModule {
  default: unknown;
  launchScanner: (options?: ScanOptions) => Promise<ScanResult>;
}

// Required lazily: Expo Go has no native module, so the package never loads there.
function loadScanner(): ScannerModule | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const scanner = require('@dariyd/react-native-document-scanner') as ScannerModule;
    return scanner.default ? scanner : null;
  } catch {
    return null;
  }
}

/**
 * False in Expo Go, on the Simulator (it has no document camera) and in a
 * build without the native module. Scan shows the expo-camera screen there.
 */
export function isDocumentScannerAvailable(): boolean {
  return Device.isDevice && loadScanner() !== null;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'errorMessage' in error) {
    return String((error as { errorMessage?: unknown }).errorMessage ?? 'scanner error');
  }
  return error instanceof Error ? error.message : 'scanner error';
}

/** Present the scanner and return its first page. Never throws. */
export async function scanDocument(): Promise<ScanOutcome> {
  const scanner = Device.isDevice ? loadScanner() : null;
  if (!scanner) return { kind: 'failed', message: 'document scanner unavailable' };

  let result: ScanResult;
  try {
    result = await scanner.launchScanner(SCANNER_OPTIONS);
  } catch (error) {
    return { kind: 'failed', message: errorMessage(error) };
  }
  if (result.error) return { kind: 'failed', message: errorMessage(result) };

  const images = result.images ?? [];
  // VisionKit can return a scan with no pages; it means nothing was captured.
  if (result.didCancel || images.length === 0) return { kind: 'cancelled' };

  const [first, ...rest] = images;
  for (const extra of rest) deleteQuietly(extra.uri);
  return {
    kind: 'page',
    uri: first.uri,
    mimeType: first.type || 'image/jpeg',
    width: first.width,
    height: first.height,
    droppedPages: rest.length,
  };
}
