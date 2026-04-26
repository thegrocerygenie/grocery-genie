/**
 * Scan — Receipt capture screen.
 *
 * Drop-in for `app/(tabs)/scan.tsx`. Uses:
 *   expo-camera        — live preview + capture
 *   expo-haptics       — capture confirmation
 *   expo-symbols       — SF Symbols (iOS)
 *   expo-router        — navigation to /review
 *
 * On tap of the shutter:
 *   1. Haptic fires (notification success — leads the visual)
 *   2. Photo is captured
 *   3. We push to /review with the URI
 *
 * For real edge detection / multi-page document scanning, swap
 * <CameraView> for VisionCamera + a frame processor, OR use the
 * VNDocumentCameraViewController bridge from `expo-document-scanner`.
 * That is a one-screen native modal — recommended path for v1.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useRouter, Stack } from 'expo-router';
import { colors, type, radii, spacing } from './theme';

type ScanState = 'idle' | 'detected' | 'capturing' | 'processing' | 'low-quality';

export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('detected'); // mock: assume detected
  const cameraRef = useRef<CameraView>(null);

  // Permission states ──────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.permissionRoot}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return <PermissionScreen denied={!permission.canAskAgain} onRequest={requestPermission} />;
  }

  // Capture handler ────────────────────────────────────────
  const onShutter = async () => {
    if (scanState === 'capturing' || scanState === 'processing') return;

    // Haptic FIRST — research-backed, feels faster than haptic-after-photo
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setScanState('capturing');
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        setScanState('low-quality');
        return;
      }
      setScanState('processing');
      // Simulate OCR — replace with your real call
      // const ocr = await runOcr(photo.uri);
      router.push({ pathname: '/review', params: { uri: photo.uri } });
    } catch (e) {
      setScanState('low-quality');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        {/* Detection brackets — corner marks only */}
        <Brackets />

        {/* Top hint pill */}
        <View style={styles.topHintRow}>
          <HintPill state={scanState} />
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={onShutter}
            disabled={scanState === 'capturing' || scanState === 'processing'}
            style={({ pressed }) => [
              styles.shutter,
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>

          <Text style={styles.modeLabel}>Auto</Text>
        </View>
      </View>
    </>
  );
}

// ─── Permission screen ───────────────────────────────────
function PermissionScreen({
  denied,
  onRequest,
}: {
  denied: boolean;
  onRequest: () => void;
}) {
  return (
    <View style={styles.permissionRoot}>
      <View style={styles.permissionIcon}>
        <SymbolView
          name="camera.fill"
          size={28}
          tintColor={denied ? colors.red : colors.tint}
        />
      </View>
      <Text style={[type.title2, { textAlign: 'center' }]}>
        {denied ? 'Camera access is off' : 'Allow Camera Access'}
      </Text>
      <Text
        style={[
          type.subheadline,
          { color: colors.iosLabel2, textAlign: 'center', maxWidth: 260, lineHeight: 22 },
        ]}
      >
        {denied
          ? 'To scan receipts, enable Camera in Settings → Grocery Genie.'
          : 'Grocery Genie uses the camera only to scan receipts. Photos are processed on-device.'}
      </Text>
      <Pressable
        style={styles.primaryBtn}
        onPress={denied ? () => Linking.openSettings() : onRequest}
      >
        <Text style={styles.primaryBtnLabel}>
          {denied ? 'Open Settings' : 'Continue'}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Bracket overlay ─────────────────────────────────────
function Brackets() {
  // Four corner marks, fixed for now — when wiring to a real document
  // detector, animate these to the detected quad in a frame processor.
  const inset = 24;
  const len = 24;
  const stroke = 2;
  const corners = [
    { top: inset, left: inset, top2: true, left2: true },
    { top: inset, right: inset, top2: true, right2: true },
    { bottom: inset + 100, left: inset, bottom2: true, left2: true },
    { bottom: inset + 100, right: inset, bottom2: true, right2: true },
  ] as const;
  return (
    <>
      {corners.map((c, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.bracket,
            {
              top: c.top,
              bottom: c.bottom,
              left: c.left,
              right: c.right,
              borderTopWidth: c.top2 ? stroke : 0,
              borderBottomWidth: c.bottom2 ? stroke : 0,
              borderLeftWidth: c.left2 ? stroke : 0,
              borderRightWidth: c.right2 ? stroke : 0,
              width: len,
              height: len,
            },
          ]}
        />
      ))}
    </>
  );
}

// ─── Hint pill ───────────────────────────────────────────
function HintPill({ state }: { state: ScanState }) {
  if (state === 'low-quality') {
    return (
      <View style={[styles.pill, { backgroundColor: colors.orange }]}>
        <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor="#fff" />
        <Text style={[type.footnote, { color: '#fff', fontWeight: '600' }]}>
          Image looks blurry — hold steady
        </Text>
      </View>
    );
  }
  if (state === 'processing') {
    return (
      <View style={[styles.pill, styles.pillGlass]}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={[type.footnote, { color: '#fff' }]}>Reading receipt…</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, styles.pillGlass]}>
      <Text style={[type.footnote, { color: '#fff' }]}>Receipt detected</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────
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
    // RN doesn't have backdrop-filter; use expo-blur for true glass
  },

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

  // Permission screen ────────────────────────────────────
  permissionRoot: {
    flex: 1,
    backgroundColor: colors.iosBg,
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
});
