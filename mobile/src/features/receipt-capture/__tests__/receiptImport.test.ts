import type { DocumentPickerResult } from 'expo-document-picker';
import type { ImagePickerResult } from 'expo-image-picker';

import { ApiError } from '@/services/api';

import { uploadFileName } from '../services/receiptApi';
import {
  DOCUMENT_PICKER_OPTIONS,
  LIBRARY_PICKER_OPTIONS,
  fromDocumentResult,
  fromLibraryResult,
  importReceipt,
  scanErrorMessage,
  type PickedReceipt,
} from '../services/receiptImport';
import type { ReceiptScanResponse } from '../types';
import { QUOTA_MESSAGE } from '../utils/scanQuota';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const MB = 1024 * 1024;

function libraryResult(asset: Record<string, unknown>): ImagePickerResult {
  return {
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', width: 1200, height: 1600, ...asset }],
  } as ImagePickerResult;
}

function documentResult(asset: Record<string, unknown>): DocumentPickerResult {
  return {
    canceled: false,
    assets: [{ uri: 'file:///doc', name: 'receipt.pdf', lastModified: 0, ...asset }],
  } as DocumentPickerResult;
}

describe('picker options', () => {
  it('asks the photo library for one image, transcoded to a compatible format', () => {
    expect(LIBRARY_PICKER_OPTIONS).toMatchObject({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      preferredAssetRepresentationMode: 'compatible',
    });
  });

  it('asks Files for one JPEG, PNG, HEIC or PDF, copied to the cache', () => {
    expect(DOCUMENT_PICKER_OPTIONS.multiple).toBe(false);
    expect(DOCUMENT_PICKER_OPTIONS.copyToCacheDirectory).toBe(true);
    expect(DOCUMENT_PICKER_OPTIONS.type).toEqual(
      expect.arrayContaining(['image/jpeg', 'image/png', 'image/heic', 'application/pdf']),
    );
  });
});

describe('fromLibraryResult', () => {
  it('reports a cancel', () => {
    expect(fromLibraryResult({ canceled: true, assets: null })).toEqual({ status: 'canceled' });
  });

  it('picks a JPEG as a library scan and previews the local file', () => {
    const outcome = fromLibraryResult(libraryResult({ mimeType: 'image/jpeg', fileSize: 2 * MB }));
    expect(outcome).toEqual({
      status: 'picked',
      receipt: {
        uri: 'file:///photo.jpg',
        mimeType: 'image/jpeg',
        source: 'library',
        previewUri: 'file:///photo.jpg',
      },
    });
  });

  it('defaults a missing mime type to JPEG', () => {
    const outcome = fromLibraryResult(libraryResult({ mimeType: undefined }));
    expect(outcome).toMatchObject({ status: 'picked', receipt: { mimeType: 'image/jpeg' } });
  });

  it('rejects an image narrower than 300px before uploading', () => {
    const outcome = fromLibraryResult(libraryResult({ mimeType: 'image/jpeg', width: 299 }));
    expect(outcome.status).toBe('rejected');
    expect(outcome.status === 'rejected' && outcome.message).toMatch(/300/);
  });

  it('accepts an image exactly 300px wide', () => {
    const outcome = fromLibraryResult(libraryResult({ mimeType: 'image/jpeg', width: 300 }));
    expect(outcome.status).toBe('picked');
  });

  it('rejects a file over 10 MB before uploading', () => {
    const outcome = fromLibraryResult(
      libraryResult({ mimeType: 'image/jpeg', fileSize: 10 * MB + 1 }),
    );
    expect(outcome.status).toBe('rejected');
    expect(outcome.status === 'rejected' && outcome.message).toMatch(/10 MB/);
  });
});

describe('fromDocumentResult', () => {
  it('reports a cancel', () => {
    expect(fromDocumentResult({ canceled: true, assets: null })).toEqual({ status: 'canceled' });
  });

  it('picks a PDF as a pdf scan with no local preview', () => {
    const outcome = fromDocumentResult(
      documentResult({ mimeType: 'application/pdf', size: 300_000 }),
    );
    expect(outcome).toEqual({
      status: 'picked',
      receipt: {
        uri: 'file:///doc',
        mimeType: 'application/pdf',
        source: 'pdf',
        previewUri: null,
      },
    });
  });

  it('infers the type from the file name when the mime type is missing', () => {
    const outcome = fromDocumentResult(
      documentResult({ name: 'IMG_0042.HEIC', mimeType: undefined }),
    );
    expect(outcome).toMatchObject({
      status: 'picked',
      receipt: { mimeType: 'image/heic', source: 'library', previewUri: 'file:///doc' },
    });
  });

  it('rejects a file type the backend does not accept', () => {
    const outcome = fromDocumentResult(
      documentResult({ name: 'receipt.gif', mimeType: 'image/gif' }),
    );
    expect(outcome.status).toBe('rejected');
    expect(outcome.status === 'rejected' && outcome.message).toMatch(/JPEG, PNG, HEIC or PDF/);
  });

  it('rejects a file over 10 MB before uploading', () => {
    const outcome = fromDocumentResult(
      documentResult({ mimeType: 'application/pdf', size: 11 * MB }),
    );
    expect(outcome.status).toBe('rejected');
  });
});

describe('uploadFileName', () => {
  it.each([
    ['image/jpeg', 'receipt.jpg'],
    ['image/png', 'receipt.png'],
    ['image/heic', 'receipt.heic'],
    ['image/heif', 'receipt.heic'],
    ['application/pdf', 'receipt.pdf'],
  ])('names a %s upload %s', (mimeType, name) => {
    expect(uploadFileName(mimeType)).toBe(name);
  });
});

describe('scanErrorMessage', () => {
  it('shows the server detail for a rejected upload', () => {
    const error = new ApiError(422, { detail: 'Only single-page PDF receipts are supported.' });
    expect(scanErrorMessage(error)).toBe('Only single-page PDF receipts are supported.');
  });

  it('falls back to a generic message when there is no detail', () => {
    expect(scanErrorMessage(new Error('Network request failed'))).toMatch(/try again/i);
    expect(scanErrorMessage(new ApiError(500, { detail: [{ msg: 'x' }] }))).toMatch(/try again/i);
  });
});

describe('importReceipt', () => {
  const picked: PickedReceipt = {
    uri: 'file:///doc',
    mimeType: 'application/pdf',
    source: 'pdf',
    previewUri: null,
  };
  const response = { receipt_id: 'r-1', status: 'pending_review' } as ReceiptScanResponse;

  it('does not upload when the user cancels', async () => {
    const upload = jest.fn();
    const result = await importReceipt({ pick: async () => ({ status: 'canceled' }), upload });
    expect(result).toEqual({ status: 'canceled' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('does not upload a file that fails the pre-checks', async () => {
    const upload = jest.fn();
    const result = await importReceipt({
      pick: async () => ({ status: 'rejected', message: 'too small' }),
      upload,
    });
    expect(result).toEqual({ status: 'error', message: 'too small' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads the picked file and previews a PDF through the server image', async () => {
    const upload = jest.fn(async () => response);
    const result = await importReceipt({
      pick: async () => ({ status: 'picked', receipt: picked }),
      upload,
    });
    expect(upload).toHaveBeenCalledWith(picked);
    expect(result).toEqual({
      status: 'ready',
      response,
      previewUri: '/api/receipts/r-1/image',
    });
  });

  it('keeps the local preview for an image', async () => {
    const image: PickedReceipt = {
      uri: 'file:///photo.jpg',
      mimeType: 'image/jpeg',
      source: 'library',
      previewUri: 'file:///photo.jpg',
    };
    const result = await importReceipt({
      pick: async () => ({ status: 'picked', receipt: image }),
      upload: async () => response,
    });
    expect(result).toMatchObject({ status: 'ready', previewUri: 'file:///photo.jpg' });
  });

  it('turns an upload failure into a user-facing message', async () => {
    const result = await importReceipt({
      pick: async () => ({ status: 'picked', receipt: picked }),
      upload: async () => {
        throw new ApiError(422, { detail: "This doesn't appear to be a receipt." });
      },
    });
    expect(result).toEqual({ status: 'error', message: "This doesn't appear to be a receipt." });
  });

  it.each([
    ['a network failure', new TypeError('Network request failed')],
    ['a server error', new ApiError(503, {})],
  ])('queues the file to upload later after %s', async (_label, error) => {
    const queue = jest.fn();
    const result = await importReceipt({
      pick: async () => ({ status: 'picked', receipt: picked }),
      upload: async () => {
        throw error;
      },
      queue,
    });
    expect(queue).toHaveBeenCalledWith(picked);
    expect(result).toEqual({ status: 'queued' });
  });

  it('does not queue a file the server rejected', async () => {
    const queue = jest.fn();
    const result = await importReceipt({
      pick: async () => ({ status: 'picked', receipt: picked }),
      upload: async () => {
        throw new ApiError(422, { detail: 'Image quality insufficient' });
      },
      queue,
    });
    expect(queue).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'error', message: 'Image quality insufficient' });
  });

  it('does not queue a file over the monthly quota, and says why', async () => {
    const queue = jest.fn();
    const result = await importReceipt({
      pick: async () => ({ status: 'picked', receipt: picked }),
      upload: async () => {
        throw new ApiError(429, {
          detail: 'Monthly receipt quota exceeded (20 receipts/month on Free tier).',
        });
      },
      queue,
    });
    expect(queue).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'error', message: QUOTA_MESSAGE });
  });

  it('reports the error when saving to the queue fails', async () => {
    const result = await importReceipt({
      pick: async () => ({ status: 'picked', receipt: picked }),
      upload: async () => {
        throw new TypeError('Network request failed');
      },
      queue: () => {
        throw new Error('disk full');
      },
    });
    expect(result).toMatchObject({ status: 'error' });
  });
});
