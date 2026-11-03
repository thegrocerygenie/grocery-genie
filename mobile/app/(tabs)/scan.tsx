import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { Stack, Tabs, useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiConsentContent } from '@/features/ai-consent/components/AiConsentContent';
import { AI_CONSENT_COPY } from '@/features/ai-consent/constants';
import {
  useAiConsentStatus,
  useGrantAiConsent,
  useMarkAiConsentRequired,
} from '@/features/ai-consent/hooks/useAiConsent';
import { colors, radii, spacing, type } from '@/constants/theme';
import { ImportProgressOverlay } from '@/features/receipt-capture/components/ImportProgressOverlay';
import { useReceiptImport } from '@/features/receipt-capture/hooks/useReceiptImport';
import {
  useScanSubmission,
  type ScanFlowState,
} from '@/features/receipt-capture/hooks/useScanSubmission';
import {
  isDocumentScannerAvailable,
  scanDocument,
} from '@/features/receipt-capture/services/documentScanner';
import { deleteQuietly } from '@/features/receipt-capture/services/pendingImageFiles';
import { QUALITY_HINTS } from '@/features/receipt-capture/utils/scanErrorHint';
import { useFrameQuality } from '@/features/receipt-capture/hooks/useFrameQuality';
import { sampleFrame, scoreImage } from '@/features/receipt-capture/services/frameSampler';
import type { FrameVerdict } from '@/features/receipt-capture/utils/frameQuality';

type Submission = ReturnType<typeof useScanSubmission>;

/** Shown when a multi-page scan comes back: the backend links no pages yet. */
export const EXTRA_PAGES_HINT = 'Only the first page was kept. Scan each page as its own receipt.';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  // Apple's document scanner where it can run (RC-01 AC 1); expo-camera in
  // Expo Go and on the Simulator. Decided once: it can't change while mounted.
  const [useScanner] = useState(isDocumentScannerAvailable);
  const receiptImport = useReceiptImport();
  // App Store 5.1.2(i): the photo goes to Anthropic, so the tab asks first.
  const aiConsent = useAiConsentStatus();
  const grantConsent = useGrantAiConsent();
  const markConsentRequired = useMarkAiConsentRequired();
  const submission = useScanSubmission({
    askingConsent: aiConsent === false,
    onConsentRequired: markConsentRequired,
  });

  if (aiConsent === false) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Tabs.Screen options={{ tabBarStyle: undefined }} />
        <SafeAreaView style={styles.consentRoot} edges={['top']}>
          <AiConsentContent
            onAllow={() => grantConsent.mutate()}
            onManual={() => router.push('/manual-entry')}
            saving={grantConsent.isPending}
            error={grantConsent.isError ? AI_CONSENT_COPY.saveFailed : null}
          />
        </SafeAreaView>
      </>
    );
  }

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

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Design "Scan · capture": full-screen capture; Cancel is the way out. */}
      <Tabs.Screen options={{ tabBarStyle: { display: 'none' } }} />
      {useScanner ? (
        <DocumentScannerCapture submission={submission} />
      ) : (
        <CameraCapture submission={submission} />
      )}
    </>
  );
}

/** A scanned page held back for the user to keep or retake. */
interface PagePrompt {
  uri: string;
  mimeType: string;
  hints: string[];
}

/**
 * RC-01 AC 1 and AC 3: Apple's scanner finds the receipt's edges, captures it
 * and offers its own retake. AC 2: the page is checked for blur and light on
 * the device before it uploads (decision A, the scanner has no pre-capture hook).
 */
function DocumentScannerCapture({ submission }: { submission: Submission }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [prompt, setPrompt] = useState<PagePrompt | null>(null);
  const busy = useRef(false);

  const launch = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    submission.startAttempt();
    submission.setFlowState('ready');
    setPrompt(null);
    setScanning(true);
    try {
      const outcome = await scanDocument();
      setScanning(false);
      if (outcome.kind === 'cancelled') {
        submission.recordAbandon();
        router.back();
        return;
      }
      if (outcome.kind === 'failed') {
        submission.fail();
        return;
      }

      setChecking(true);
      const verdict = await scoreImage(outcome.uri, outcome.width, outcome.height).catch(
        () => null,
      );
      setChecking(false);
      const hints: string[] = [];
      if (verdict && verdict !== 'ok') hints.push(QUALITY_HINTS[verdict]);
      if (outcome.droppedPages > 0) hints.push(EXTRA_PAGES_HINT);
      if (hints.length > 0) {
        setPrompt({ uri: outcome.uri, mimeType: outcome.mimeType, hints });
        return;
      }
      await submission.submit(outcome.uri, outcome.mimeType);
    } finally {
      busy.current = false;
    }
    // submission's callbacks are stable; its state is read at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // The scanner opens each time Scan comes into focus, as the camera did.
  const launchRef = useRef(launch);
  launchRef.current = launch;
  useFocusEffect(
    useCallback(() => {
      void launchRef.current();
    }, []),
  );

  const retake = () => {
    if (prompt) deleteQuietly(prompt.uri);
    void launch();
  };

  const usePage = () => {
    if (!prompt) return;
    const page = prompt;
    setPrompt(null);
    void submission.submit(page.uri, page.mimeType);
  };

  const cancel = () => {
    if (prompt) deleteQuietly(prompt.uri);
    submission.recordAbandon();
    router.back();
  };

  if (submission.processing && submission.processingUri) {
    return (
      <View style={styles.root}>
        <ProcessingOverlay uri={submission.processingUri} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {prompt ? (
        <Image
          testID="scan-page-preview"
          source={{ uri: prompt.uri }}
          resizeMode="contain"
          style={styles.pagePreview}
          accessibilityIgnoresInvertColors
        />
      ) : null}

      <View style={styles.topHintRow}>
        <ScannerPill
          state={submission.flowState}
          errorHint={submission.errorHint}
          busy={scanning || checking}
          hints={prompt?.hints ?? null}
        />
      </View>

      <View style={styles.bottomBar}>
        <Pressable onPress={cancel} hitSlop={12} accessibilityRole="button">
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
        {prompt ? (
          <>
            <Pressable
              onPress={retake}
              style={styles.scanButton}
              accessibilityRole="button"
              accessibilityLabel="Retake receipt"
            >
              <Text style={styles.scanButtonLabel}>Retake</Text>
            </Pressable>
            <Pressable
              onPress={usePage}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Use this scan"
            >
              <Text style={styles.modeLabel}>Use Scan</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => void launch()}
              disabled={scanning || checking}
              style={styles.scanButton}
              accessibilityRole="button"
              accessibilityLabel="Scan receipt"
            >
              <Text style={styles.scanButtonLabel}>Scan</Text>
            </Pressable>
            <View style={styles.bottomSpacer} />
          </>
        )}
      </View>
    </View>
  );
}

interface ScannerPillProps {
  state: ScanFlowState;
  errorHint: string;
  busy: boolean;
  /** Why a scanned page is held back; null when none is. */
  hints: string[] | null;
}

function ScannerPill({ state, errorHint, busy, hints }: ScannerPillProps) {
  const warning = hints?.join(' ') ?? (state === 'low-quality' ? errorHint : null);
  // iOS ignores accessibilityLiveRegion, so VoiceOver is told outright.
  useEffect(() => {
    if (warning) AccessibilityInfo.announceForAccessibility(warning);
  }, [warning]);

  if (warning) {
    return (
      <View
        style={[styles.pill, styles.pillAlert, styles.pillWarning]}
        testID="scan-error-pill"
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor="#fff" />
        <Text style={[type.footnote, styles.pillWarningText]}>{warning}</Text>
      </View>
    );
  }
  if (state === 'queued') {
    return (
      <View style={[styles.pill, styles.pillGlass]}>
        <SymbolView name="checkmark.circle.fill" size={14} tintColor="#fff" />
        <Text style={[type.footnote, styles.pillText]}>Saved · will upload automatically</Text>
      </View>
    );
  }
  if (busy) {
    return (
      <View style={[styles.pill, styles.pillGlass]}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={[type.footnote, styles.pillText]}>Scanning…</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, styles.pillGlass]}>
      <Text style={[type.footnote, styles.pillText]}>Tap Scan to capture a receipt</Text>
    </View>
  );
}

/** The expo-camera capture screen, for Expo Go and the Simulator. */
function CameraCapture({ submission }: { submission: Submission }) {
  const router = useRouter();
  const { flowState, setFlowState } = submission;
  // RC-01 AC 2: check blur and light before capture, only while waiting for one.
  // Not gated on onCameraReady (the simulator never sends it): a sample taken
  // before the camera is ready fails, and the next one retries.
  const frameQuality = useFrameQuality(
    () => (cameraRef.current ? sampleFrame(cameraRef.current) : Promise.resolve(null)),
    flowState === 'ready',
  );
  const cameraRef = useRef<CameraView>(null);

  const onShutter = async () => {
    if (flowState === 'capturing' || flowState === 'processing') return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setFlowState('capturing');
    try {
      // A frame sample may hold the camera; take the real photo after it.
      await frameQuality.settle();
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        submission.fail();
        return;
      }
      await submission.submit(photo.uri, 'image/jpeg');
    } catch {
      submission.fail();
    }
  };

  return (
    <View style={styles.root}>
      {/* Kept mounted under the overlay so a retake is instant. */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {submission.processing && submission.processingUri ? (
        <ProcessingOverlay uri={submission.processingUri} />
      ) : (
        <>
          <Brackets />

          <View style={styles.topHintRow}>
            <HintPill
              state={flowState}
              errorHint={submission.errorHint}
              frame={frameQuality.verdict}
            />
          </View>

          <View style={styles.bottomBar}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={onShutter}
              disabled={flowState === 'capturing' || flowState === 'processing'}
              style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
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
      <View
        style={[styles.permissionIcon, denied && styles.permissionIconDenied]}
        testID="scan-permission-icon"
      >
        <SymbolView name="camera.fill" size={28} tintColor={denied ? colors.red : colors.tint} />
      </View>
      <Text style={[type.title2, { textAlign: 'center' }]}>
        {denied ? 'Camera access is off' : 'Allow Camera Access'}
      </Text>
      <Text
        style={[
          type.subheadline,
          {
            color: colors.iosLabel2,
            textAlign: 'center',
            maxWidth: 260,
            lineHeight: 22,
          },
        ]}
      >
        {denied
          ? 'To scan receipts, enable Camera in Settings → Grocery Genie.'
          : 'Grocery Genie uses the camera only to scan receipts. Photos are sent securely to read your receipt, and you can delete them anytime.'}
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
  /** The latest pre-capture check of the view; null before the first. */
  frame: FrameVerdict | null;
}

function HintPill({ state, errorHint, frame }: HintPillProps) {
  // iOS ignores accessibilityLiveRegion, so VoiceOver is told a capture failed outright.
  useEffect(() => {
    if (state === 'low-quality') AccessibilityInfo.announceForAccessibility(errorHint);
  }, [state, errorHint]);

  if (state === 'ready' && frame && frame !== 'ok') {
    return (
      <View
        style={[styles.pill, styles.pillAlert, styles.pillWarning]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor="#fff" />
        <Text style={[type.footnote, { color: '#fff', fontWeight: '600' }]}>
          {QUALITY_HINTS[frame]}
        </Text>
      </View>
    );
  }
  if (state === 'low-quality') {
    return (
      <View
        style={[styles.pill, styles.pillAlert, styles.pillWarning]}
        testID="scan-error-pill"
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
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
  // Nothing detects the receipt itself (L1): before the first frame check,
  // ask to frame it; after a clear check, say so.
  return (
    <View style={[styles.pill, styles.pillGlass]}>
      <Text style={[type.footnote, { color: '#fff' }]}>
        {frame === 'ok' ? 'Looks clear — tap to capture' : 'Fit the receipt in the frame'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clears the floating tab bar, which stays as the way out.
  consentRoot: { flex: 1, backgroundColor: colors.iosBg, paddingBottom: 72 },
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
  pillText: { color: '#fff' },
  // Design "Scan · low quality": a warning is a rounded rectangle, not a capsule.
  pillAlert: { borderRadius: 12, paddingVertical: 8 },
  pillWarning: { backgroundColor: colors.orange, maxWidth: 340 },
  pillWarningText: { color: '#fff', fontWeight: '600', flexShrink: 1 },

  pagePreview: {
    ...StyleSheet.absoluteFillObject,
    top: 110,
    bottom: 130,
  },
  scanButton: {
    minWidth: 120,
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.button,
    backgroundColor: '#fff', // fixed: the capture UI is white on black in both appearances
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonLabel: { ...type.headline, color: '#000' },
  bottomSpacer: { width: 52 },

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
  cancelLabel: { ...type.callout, color: '#fff' },
  modeLabel: { ...type.callout, color: '#fff', fontWeight: '600' },

  shutter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#fff',
    padding: 4,
  },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  shutterInner: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#fff', // fixed: the camera UI is white on black in both appearances
  },

  permissionRoot: {
    flex: 1,
    backgroundColor: colors.iosBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  permissionIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  // Design "Permission denied": the camera tile turns red-tinted.
  permissionIconDenied: { backgroundColor: colors.redBg },
  primaryBtn: {
    marginTop: spacing.md,
    minHeight: 50,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.tint,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  primaryBtnLabel: { ...type.headline, color: colors.onTint },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnPressed: { opacity: 0.5 },
  secondaryBtnLabel: { ...type.headline, color: colors.tint },
});
