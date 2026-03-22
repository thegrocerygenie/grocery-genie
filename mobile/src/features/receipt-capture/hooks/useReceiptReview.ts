import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateReceipt } from '../services/receiptApi';
import type { ReceiptResponse, ReceiptUpdateRequest } from '../types';

interface ConfirmParams {
  receiptId: string;
  updates: ReceiptUpdateRequest;
}

export function useReceiptConfirm() {
  const queryClient = useQueryClient();

  return useMutation<ReceiptResponse, Error, ConfirmParams>({
    mutationFn: ({ receiptId, updates }) => updateReceipt(receiptId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
