import { useMutation } from '@tanstack/react-query';

import type { ScanSource } from '@/constants/analyticsEvents';

import { scanReceipt } from '../services/receiptApi';
import type { ReceiptScanResponse } from '../types';

interface ScanParams {
  imageUri: string;
  mimeType: string;
  source?: ScanSource;
}

export function useReceiptScan() {
  return useMutation<ReceiptScanResponse, Error, ScanParams>({
    mutationFn: ({ imageUri, mimeType, source }) =>
      scanReceipt(imageUri, mimeType, source),
  });
}
