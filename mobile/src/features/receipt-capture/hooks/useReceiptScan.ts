import { useMutation } from '@tanstack/react-query';
import { scanReceipt } from '../services/receiptApi';
import type { ReceiptScanResponse } from '../types';

interface ScanParams {
  imageUri: string;
  mimeType: string;
}

export function useReceiptScan() {
  return useMutation<ReceiptScanResponse, Error, ScanParams>({
    mutationFn: ({ imageUri, mimeType }) => scanReceipt(imageUri, mimeType),
  });
}
