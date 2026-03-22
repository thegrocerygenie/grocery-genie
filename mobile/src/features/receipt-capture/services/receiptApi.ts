import { apiClient, ApiError, getAuthHeaders } from '@/services/api';
import type {
  ReceiptListResponse,
  ReceiptResponse,
  ReceiptScanResponse,
  ReceiptUpdateRequest,
} from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function scanReceipt(
  imageUri: string,
  mimeType: string,
): Promise<ReceiptScanResponse> {
  const formData = new FormData();
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  formData.append('file', {
    uri: imageUri,
    type: mimeType,
    name: `receipt.${extension}`,
  } as unknown as Blob);

  const response = await fetch(`${API_BASE_URL}/api/receipts/scan`, {
    method: 'POST',
    body: formData,
    headers: getAuthHeaders(),
    // Content-Type auto-set by fetch for FormData (includes boundary)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ detail: 'Scan failed' }));
    throw new ApiError(response.status, data);
  }

  return response.json() as Promise<ReceiptScanResponse>;
}

export async function getReceipts(params?: {
  page?: number;
  per_page?: number;
  store?: string;
  from_date?: string;
  to_date?: string;
}): Promise<ReceiptListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.per_page) searchParams.set('per_page', String(params.per_page));
  if (params?.store) searchParams.set('store', params.store);
  if (params?.from_date) searchParams.set('from_date', params.from_date);
  if (params?.to_date) searchParams.set('to_date', params.to_date);
  const qs = searchParams.toString();
  return apiClient<ReceiptListResponse>(`/api/receipts${qs ? `?${qs}` : ''}`);
}

export async function getReceipt(receiptId: string): Promise<ReceiptResponse> {
  return apiClient<ReceiptResponse>(`/api/receipts/${receiptId}`);
}

export async function updateReceipt(
  receiptId: string,
  updates: ReceiptUpdateRequest,
): Promise<ReceiptResponse> {
  return apiClient<ReceiptResponse>(`/api/receipts/${receiptId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}
