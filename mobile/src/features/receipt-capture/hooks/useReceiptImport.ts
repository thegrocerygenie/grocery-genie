import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { useReceiptStore } from '@/store/receiptStore';

import { importReceipt, pickFromFiles, pickFromLibrary } from '../services/receiptImport';
import { useReceiptScan } from './useReceiptScan';

export type ImportKind = 'library' | 'files';

interface ImportProgress {
  previewUri: string | null;
}

/**
 * RC-03: import a receipt from the photo library or Files into the same
 * review flow as a camera scan. `progress` is set while the upload runs.
 */
export function useReceiptImport() {
  const router = useRouter();
  const { setCapturedImageUri, setActiveScanResponse } = useReceiptStore();
  const scanMutation = useReceiptScan();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const busy = useRef(false);

  const importFrom = useCallback(
    async (kind: ImportKind) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const result = await importReceipt({
          pick: kind === 'library' ? pickFromLibrary : pickFromFiles,
          upload: (receipt) => {
            setProgress({ previewUri: receipt.previewUri });
            return scanMutation.mutateAsync({
              imageUri: receipt.uri,
              mimeType: receipt.mimeType,
              source: receipt.source,
            });
          },
        });
        setProgress(null);
        if (result.status === 'ready') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setCapturedImageUri(result.previewUri);
          setActiveScanResponse(result.response);
          router.push('/review');
        } else if (result.status === 'error') {
          Alert.alert('Couldn’t import receipt', result.message);
        }
      } catch {
        setProgress(null);
        Alert.alert('Couldn’t import receipt', 'The picker couldn’t open. Try again.');
      } finally {
        busy.current = false;
      }
    },
    [router, scanMutation, setActiveScanResponse, setCapturedImageUri],
  );

  return { importFrom, progress };
}
