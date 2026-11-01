import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';

import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents';
import { isAiConsentRequiredError } from '@/features/ai-consent/utils/aiConsent';
import { tokenSubject } from '@/features/auth/utils/tokenSubject';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAuthStore } from '@/store/authStore';
import { useOfflineStore } from '@/store/offlineStore';
import { useReceiptStore } from '@/store/receiptStore';

import { isRetryableScanError } from '../services/offlineQueue';
import { persistCapturedImage } from '../services/pendingImageFiles';
import { scanErrorHint } from '../utils/scanErrorHint';
import { useReceiptScan } from './useReceiptScan';

export type ScanFlowState = 'ready' | 'capturing' | 'processing' | 'low-quality' | 'queued';

/** How long the "Saved" pill stays before the camera is ready again. */
export const QUEUED_PILL_MS = 2500;

interface Options {
  /** True while the consent screen shows: leaving it is not a capture abandonment. */
  askingConsent: boolean;
  /** The server says consent is missing (withdrawn on another device). */
  onConsentRequired: () => void;
}

/**
 * Everything a capture does after the photo exists, shared by the document
 * scanner and the expo-camera fallback: the offline check, the upload, the
 * offline queue (NFR reliability 3), the consent refusal, and the
 * capture-stage abandonment event.
 */
export function useScanSubmission({ askingConsent, onConsentRequired }: Options) {
  const router = useRouter();
  const [flowState, setFlowState] = useState<ScanFlowState>('ready');
  const [processingUri, setProcessingUri] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState(() => scanErrorHint(undefined));

  const scanMutation = useReceiptScan();
  const { setCapturedImageUri, setActiveScanResponse } = useReceiptStore();
  const addPendingReceipt = useOfflineStore((s) => s.addPendingReceipt);
  const ownerId = tokenSubject(useAuthStore((s) => s.accessToken));
  const analytics = useAnalytics();

  const askingConsentRef = useRef(askingConsent);
  askingConsentRef.current = askingConsent;
  // Set once a scan is submitted, or once an abandonment is recorded, so one
  // attempt never counts as abandoned twice.
  const attemptSettled = useRef(false);

  useEffect(() => {
    if (flowState !== 'queued') return;
    const timer = setTimeout(() => setFlowState('ready'), QUEUED_PILL_MS);
    return () => clearTimeout(timer);
  }, [flowState]);

  const recordAbandon = useCallback(() => {
    if (attemptSettled.current || askingConsentRef.current) return;
    attemptSettled.current = true;
    analytics.emit(ANALYTICS_EVENTS.RECEIPT_ABANDONED, { stage: 'capture' });
  }, [analytics]);

  // Leaving Scan without ever submitting is a capture-stage abandonment.
  useEffect(() => () => recordAbandon(), [recordAbandon]);

  /** A new attempt starts (the scanner opens again): it can be abandoned again. */
  const startAttempt = useCallback(() => {
    attemptSettled.current = false;
  }, []);

  const fail = useCallback((error?: unknown) => {
    setErrorHint(scanErrorHint(error));
    setFlowState('low-quality');
  }, []);

  // Keep a photo that cannot upload now; useSyncQueue uploads it when the
  // connection or the server comes back.
  const queuePhoto = (uri: string, mimeType: string) => {
    // A photo with no owner could never upload under any session; don't keep it.
    if (!ownerId) {
      fail();
      return;
    }
    try {
      addPendingReceipt({
        imageUri: persistCapturedImage(uri),
        mimeType,
        capturedAt: new Date().toISOString(),
        ownerId,
      });
    } catch {
      fail();
      return;
    }
    setFlowState('queued');
  };

  /** Upload a captured image, or queue it. The server emits receipt_scan_started. */
  const submit = async (uri: string, mimeType: string) => {
    attemptSettled.current = true;
    try {
      const network = await NetInfo.fetch();
      if (network.isConnected === false) {
        queuePhoto(uri, mimeType);
        return;
      }
    } catch {
      fail();
      return;
    }

    setProcessingUri(uri);
    setFlowState('processing');
    scanMutation.mutate(
      { imageUri: uri, mimeType, source: 'camera' },
      {
        onSuccess: (response) => {
          setCapturedImageUri(uri);
          setActiveScanResponse(response);
          setFlowState('ready');
          router.push('/review');
        },
        onError: (error) => {
          if (isAiConsentRequiredError(error)) {
            // Show the consent screen in place of the camera.
            setFlowState('ready');
            onConsentRequired();
          } else if (isRetryableScanError(error)) {
            queuePhoto(uri, mimeType);
          } else {
            fail(error);
          }
        },
      },
    );
  };

  return {
    flowState,
    setFlowState,
    errorHint,
    processing: flowState === 'processing' && processingUri !== null,
    processingUri,
    submit,
    fail,
    recordAbandon,
    startAttempt,
  };
}
