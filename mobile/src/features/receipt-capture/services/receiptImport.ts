import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { ScanSource } from '@/constants/analyticsEvents';
import { ApiError } from '@/services/api';

import type { ReceiptScanResponse } from '../types';

/** Mirrors the backend's limits so a bad file fails before it is uploaded. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_IMAGE_WIDTH = 300;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

export const LIBRARY_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: false,
  // iOS transcodes HEIC to JPEG for us. The backend still converts HEIC that
  // arrives some other way (for example from the Files app).
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

export const DOCUMENT_PICKER_OPTIONS: DocumentPicker.DocumentPickerOptions = {
  type: ACCEPTED_TYPES,
  multiple: false,
  copyToCacheDirectory: true,
};

export interface PickedReceipt {
  uri: string;
  mimeType: string;
  source: ScanSource;
  /** Local URI the review screen can show, or null when <Image> can't render it (PDF). */
  previewUri: string | null;
}

export type PickOutcome =
  | { status: 'canceled' }
  | { status: 'rejected'; message: string }
  | { status: 'picked'; receipt: PickedReceipt };

export type ImportResult =
  | { status: 'canceled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; response: ReceiptScanResponse; previewUri: string };

function checkFile(size: number | undefined, width: number | undefined): string | null {
  if (size !== undefined && size > MAX_UPLOAD_BYTES) {
    return 'This file is larger than 10 MB. Choose a smaller file.';
  }
  if (width !== undefined && width < MIN_IMAGE_WIDTH) {
    return `This image is ${width}px wide. Receipts need to be at least ${MIN_IMAGE_WIDTH}px wide to read.`;
  }
  return null;
}

function picked(uri: string, mimeType: string): PickOutcome {
  const isPdf = mimeType === 'application/pdf';
  return {
    status: 'picked',
    receipt: {
      uri,
      mimeType,
      source: isPdf ? 'pdf' : 'library',
      previewUri: isPdf ? null : uri,
    },
  };
}

export function fromLibraryResult(result: ImagePicker.ImagePickerResult): PickOutcome {
  if (result.canceled) return { status: 'canceled' };
  const asset = result.assets[0];
  const problem = checkFile(asset.fileSize, asset.width);
  if (problem) return { status: 'rejected', message: problem };
  return picked(asset.uri, asset.mimeType ?? 'image/jpeg');
}

export function fromDocumentResult(result: DocumentPicker.DocumentPickerResult): PickOutcome {
  if (result.canceled) return { status: 'canceled' };
  const asset = result.assets[0];
  const extension = asset.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = asset.mimeType ?? TYPE_BY_EXTENSION[extension];
  if (!mimeType || !ACCEPTED_TYPES.includes(mimeType)) {
    return {
      status: 'rejected',
      message: 'This file type isn’t supported. Choose a JPEG, PNG, HEIC or PDF.',
    };
  }
  const problem = checkFile(asset.size, undefined);
  if (problem) return { status: 'rejected', message: problem };
  return picked(asset.uri, mimeType);
}

export async function pickFromLibrary(): Promise<PickOutcome> {
  return fromLibraryResult(await ImagePicker.launchImageLibraryAsync(LIBRARY_PICKER_OPTIONS));
}

export async function pickFromFiles(): Promise<PickOutcome> {
  return fromDocumentResult(await DocumentPicker.getDocumentAsync(DOCUMENT_PICKER_OPTIONS));
}

export function scanErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.data as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string' && detail) return detail;
  }
  return 'We couldn’t read this receipt. Check your connection and try again.';
}

interface ImportDeps {
  pick: () => Promise<PickOutcome>;
  upload: (receipt: PickedReceipt) => Promise<ReceiptScanResponse>;
}

/** Pick a file, check it, and upload it into the same review flow as a camera scan. */
export async function importReceipt({ pick, upload }: ImportDeps): Promise<ImportResult> {
  const outcome = await pick();
  if (outcome.status === 'canceled') return outcome;
  if (outcome.status === 'rejected') return { status: 'error', message: outcome.message };

  try {
    const response = await upload(outcome.receipt);
    return {
      status: 'ready',
      response,
      // A PDF can't be shown by <Image>; the server stores a JPEG rendering of it.
      previewUri: outcome.receipt.previewUri ?? `/api/receipts/${response.receipt_id}/image`,
    };
  } catch (error) {
    return { status: 'error', message: scanErrorMessage(error) };
  }
}
