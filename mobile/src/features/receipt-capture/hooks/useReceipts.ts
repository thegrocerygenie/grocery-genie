import { useQuery } from '@tanstack/react-query';

import { getReceipts } from '../services/receiptApi';

export interface ReceiptQueryParams {
  page?: number;
  per_page?: number;
  store?: string;
  from_date?: string;
  to_date?: string;
}

export function useReceipts(params?: ReceiptQueryParams) {
  return useQuery({
    queryKey: ['receipts', params],
    queryFn: () => getReceipts(params),
    staleTime: 30_000,
  });
}
