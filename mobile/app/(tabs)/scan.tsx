import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import { Stack, Tabs, useRouter } from 'expo-router';

import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents';
import { colors, radii, spacing, type } from '@/constants/theme';
import { ImportProgressOverlay } from '@/features/receipt-capture/components/ImportProgressOverlay';
import { useReceiptImport } from '@/features/receipt-capture/hooks/useReceiptImport';
import { useReceiptScan } from '@/features/receipt-capture/hooks/useReceiptScan';
import { isRetryableScanError } from '@/features/receipt-capture/services/offlineQueue';
import { persistCapturedImage } from '@/features/receipt-capture/services/pendingImageFiles';
import { tokenSubject } from '@/features/auth/utils/tokenSubject';
import { useAuthStore } from '@/store/authStore';
import { scanErrorHint } from '@/features/receipt-capture/utils/scanErrorHint';
import { useOfflineStore } from '@/store/offlineStore';
import { useReceiptStore } from '@/store/receiptStore';
import { useAnalytics } from '@/hooks/useAnalytics';

type ScanFlowState = 'detected' | 'capturing' | 'processing' | 'low-quality' | 'queued';

/** How long the "Saved" pill stays before the camera is ready again. */
const QUEUED_PILL_MS = 2500;

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [flowState, setFlowState] = useState<ScanFlowState>('detected');
  const [processingUri, setProcessingUri] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState(() => scanErrorHint(undefined));
  const cameraRef = useRef<CameraView>(null);

  const scanMutation = useReceiptScan();
  const receiptImport = useReceiptImport();
  const { setCapturedImageUri, setActiveScanResponse } = useReceiptStore();
  const addPendingReceipt = useOfflineStore((s) => s.addPendingReceipt);
  const ownerId = tokenSubject(useAuthStore((s) => s.accessToken)) ?? undefined;
  const analytics = useAnalytics();

  // Tracks whether a scan was submitted, so leaving the camera without ever
  // capturing is recorded as a capture-stage abandonment.
  const scanSubmitted = useRef(false);

  useEffect(() => {
    if (flowState !== 'queued') return;
    const timer = setTimeout(() => setFlowState('detected'), QUEUED_PILL_MS);
    return () => clearTimeout(timer);
  }, [flowState]);

  useEffect(() => {
    return () => {
      if (!scanSubmitted.current) {
        analytics.emit(ANALYTICS_EVENTS.RECEIPT_ABANDONED, { stage: 'capture' });
      }
    };
  }, [analytics]);

  if (!permission) {
    return (
      <View style={styles.permissionRoot}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  if (!permission.granted) {
    // NFR: without camera access, fall back to importing from the photo library.
    // No Cancel here, so the tab bar stays as the way out.
    return (
      <>
        <Tabs.Screen options={{ tabBarStyle: undefined }} />
        <PermissionScreen
          denied={!permission.canAskAgain}
          onRequest={requestPermission}
          onChooseFromLibrary={() => receiptImport.importFrom('library')}
        />
        <ImportProgressOverlay
          visible={receiptImport.progress !== null}
          previewUri={receiptImport.progress?.previewUri ?? null}
        />
      </>
    );
  }

  // NFR reliability 3: keep a photo that cannot upload now; useSyncQueue
  // uploads it when the connection or the server comes back.
  const fail = (error?: unknown) => {
    setErrorHint(scanErrorHint(error));
    setFlowState('low-quality');
  };

  const queuePhoto = (uri: string) => {
    try {
      addPendingReceipt({
        imageUri: persistCapturedImage(uri),
        mimeType: 'image/jpeg',
        capturedAt: new Date().toISOString(),
        ownerId,
      });
    } catch {
      fail();
      return;
    }
    setFlowState('queued');
  };

  const onShutter = async () => {
    if (flowState === 'capturing' || flowState === 'processing') return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setFlowState('capturing');
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        fail();
        return;
      }

      // A scan is being submitted — this is no longer a capture abandonment.
      // The server emits receipt_scan_started from the request's source field.
      scanSubmitted.current = true;

      const network = await NetInfo.fetch();
      if (network.isConnected === false) {
        queuePhoto(photo.uri);
        return;
      }

      setProcessingUri(photo.uri);
      setFlowState('processing');
      scanMutation.mutate(
        { imageUri: photo.uri, mimeType: 'image/jpeg', source: 'camera' },
        {
          onSuccess: (response) => {
            setCapturedImageUri(photo.uri);
            setActiveScanResponse(response);
            setFlowState('detected');
            router.push('/review');
          },
          onError: (error) => {
            if (isRetryableScanError(error)) {
              queuePhoto(photo.uri);
            } else {
              fail(error);
            }
          },
        },
      );
    } catch {
      fail();
    }
  };

  // Keep the camera mounted under the overlay so a retake is instant.
  const processing = flowState === 'processing' && processingUri !== null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Design "Scan · capture": full-screen camera; Cancel is the way out. */}
      <Tabs.Screen options={{ tabBarStyle: { display: 'none' } }} />
      <View style={styles.root}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        {processing ? (
          <ProcessingOverlay uri={processingUri} />
        ) : (
          <>
            <Brackets />

            <View style={styles.topHintRow}>
              <HintPill state={flowState} errorHint={errorHint} />
            </View>

            <View style={styles.bottomBar}>
              <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={onShutter}
                disabled={flowState === 'capturing' || flowState === 'processing'}
                style={({ pressed }) => [
                  styles.shutter,
                  pressed && { transform: [{ scale: 0.94 }] },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Capture receipt"
              >
                <View style={styles.shutterInner} />
              </Pressable>

              <Text style={styles.modeLabel}>Auto</Text>
            </View>
          </>
        )}
      </View>
    </>
  );
}

interface PermissionScreenProps {
  denied: boolean;
  onRequest: () => void;
  onChooseFromLibrary: () => void;
}

function PermissionScreen({ denied, onRequest, onChooseFromLibrary }: PermissionScreenProps) {
  return (
    <View style={styles.permissionRoot}>
      <View style={styles.permissionIcon}>
        <SymbolView name="camera.fill" size={28} tintColor={denied ? colors.red : colors.tint} />
      </View>
      <Text style={[type.title2, { textAlign: 'center' }]}>
        {denied ? 'Camera access is off' : 'Allow Camera Access'}
      </Text>
      <Text
        style={[
          type.subheadline,
          {
            color: colors.iosLabel2 as string,
            textAlign: 'center',
            maxWidth: 260,
            lineHeight: 22,
          },
        ]}
      >
        {denied
          ? 'To scan receipts, enable Camera in Settings → Grocery Genie.'
          : 'Grocery Genie uses the camera only to scan receipts. Photos are processed on-device.'}
      </Text>
      <Pressable
        style={styles.primaryBtn}
        onPress={denied ? () => Linking.openSettings() : onRequest}
        accessibilityRole="button"
      >
        <Text style={styles.primaryBtnLabel}>{denied ? 'Open Settings' : 'Continue'}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
        onPress={onChooseFromLibrary}
        accessibilityRole="button"
        accessibilityLabel="Choose a receipt from your photo library"
      >
        <Text style={styles.secondaryBtnLabel}>Choose from Library</Text>
      </Pressable>
    </View>
  );
}

interface BracketDef {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  borderTopWidth: number;
  borderBottomWidth: number;
  borderLeftWidth: number;
  borderRightWidth: number;
}

function Brackets() {
  const inset = 24;
  const len = 24;
  const stroke = 2;
  const corners: BracketDef[] = [
    {
      top: inset,
      left: inset,
      borderTopWidth: stroke,
      borderLeftWidth: stroke,
      borderBottomWidth: 0,
      borderRightWidth: 0,
    },
    {
      top: inset,
      right: inset,
      borderTopWidth: stroke,
      borderRightWidth: stroke,
      borderBottomWidth: 0,
      borderLeftWidth: 0,
    },
    {
      bottom: inset + 100,
      left: inset,
      borderBottomWidth: stroke,
      borderLeftWidth: stroke,
      borderTopWidth: 0,
      borderRightWidth: 0,
    },
    {
      bottom: inset + 100,
      right: inset,
      borderBottomWidth: stroke,
      borderRightWidth: stroke,
      borderTopWidth: 0,
      borderLeftWidth: 0,
    },
  ];
  return (
    <>
      {corners.map((c, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[styles.bracket, { width: len, height: len }, c]}
        />
      ))}
    </>
  );
}

/** Design "Scan · processing": the frozen photo, blurred, under a reading state. */
function ProcessingOverlay({ uri }: { uri: string }) {
  return (
    <View
      style={styles.processingRoot}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Reading receipt. This takes a few seconds."
    >
      <Image
        testID="scan-processing-photo"
        source={{ uri }}
        blurRadius={12}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.processingScrim} />
      <View style={styles.processingCenter}>
        <View style={styles.processingSpinner}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
        <Text style={styles.processingTitle}>Reading receipt…</Text>
        <Text style={styles.processingSub}>This takes a few seconds.</Text>
      </View>
    </View>
  );
}

interface HintPillProps {
  state: ScanFlowState;
  errorHint: string;
}

function HintPill({ state, errorHint }: HintPillProps) {
  if (state === 'low-quality') {
    return (
      <View style={[styles.pill, { backgroundColor: colors.orange }]}>
        <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor="#fff" />
        <Text style={[type.footnote, { color: '#fff', fontWeight: '600' }]}>{errorHint}</Text>
      </View>
    );
  }
  if (state === 'queued') {
    return (
      <View style={[styles.pill, styles.pillGlass]}>
        <SymbolView name="checkmark.circle.fill" size={14} tintColor="#fff" />
        <Text style={[type.footnote, { color: '#fff' }]}>Saved · will upload automatically</Text>
      </View>
    );
  }
  if (state === 'processing' || state === 'capturing') {
    return (
      <View style={[styles.pill, styles.pillGlass]}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={[type.footnote, { color: '#fff' }]}>Capturing…</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, styles.pillGlass]}>
      <Text style={[type.footnote, { color: '#fff' }]}>Receipt detected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topHintRow: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  pillGlass: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  processingRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  processingScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  processingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  processingSpinner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingTitle: { ...type.headline, color: '#fff' },
  processingSub: { ...type.footnote, color: 'rgba(255,255,255,0.7)' },

  bracket: {
    position: 'absolute',
    borderColor: '#fff',
  },

  bottomBar: {
    position: 'absolute',
    bottom: 36,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelLabel: { color: '#fff', ...type.callout },
  modeLabel: { color: '#fff', ...type.callout, fontWeight: '600' },

  shutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: '#fff',
    padding: 4,
  },
  shutterInner: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#fff',
  },

  permissionRoot: {
    flex: 1,
    backgroundColor: colors.iosBg as string,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  primaryBtn: {
    marginTop: spacing.md,
    height: 50,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.tint,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  primaryBtnLabel: { color: '#fff', ...type.headline },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnPressed: { opacity: 0.5 },
  secondaryBtnLabel: { color: colors.tint, ...type.headline },
});
