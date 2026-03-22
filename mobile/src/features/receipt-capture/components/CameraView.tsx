import { CameraView as ExpoCameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, touchTarget } from '@/constants/theme';
import { strings } from '@/constants/strings';
import { CaptureButton } from './CaptureButton';

interface CameraViewProps {
  onCapture: (uri: string) => void;
  onPickFromLibrary: (uri: string, mimeType: string) => void;
}

export function CameraViewComponent({ onCapture, onPickFromLibrary }: CameraViewProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<ExpoCameraView>(null);
  const insets = useSafeAreaInsets();

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (photo) {
      onCapture(photo.uri);
    }
  };

  const handlePickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';
      onPickFromLibrary(asset.uri, mimeType);
    }
  };

  // Permission not yet determined
  if (!permission) {
    return <View style={styles.container} />;
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>{strings.scan.cameraPermission}</Text>
        <Pressable
          style={styles.permissionButton}
          onPress={requestPermission}
          accessibilityLabel={strings.scan.grantPermission}
          accessibilityRole="button"
        >
          <Text style={styles.permissionButtonText}>{strings.scan.grantPermission}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoCameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Receipt guide overlay */}
        <View style={styles.overlay}>
          {/* Top dark strip */}
          <View style={styles.overlayTop} />
          {/* Middle row with dark sides and clear center */}
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.guideCutout}>
              <Text style={styles.guideText}>{strings.scan.positionReceipt}</Text>
            </View>
            <View style={styles.overlaySide} />
          </View>
          {/* Bottom dark strip */}
          <View style={styles.overlayBottom} />
        </View>
      </ExpoCameraView>

      {/* Controls at bottom */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.base }]}>
        <CaptureButton onPress={handleCapture} />
        <Pressable
          style={styles.libraryButton}
          onPress={handlePickFromLibrary}
          accessibilityLabel={strings.scan.uploadFromLibrary}
          accessibilityRole="button"
        >
          <Text style={styles.libraryText}>{strings.scan.uploadFromLibrary}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: '60%',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  guideCutout: {
    flex: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.base,
  },
  guideText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  libraryButton: {
    marginTop: spacing.base,
    minHeight: touchTarget.minHeight,
    justifyContent: 'center',
  },
  libraryText: {
    ...typography.body,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  permissionText: {
    ...typography.body,
    color: colors.light.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  permissionButton: {
    backgroundColor: colors.light.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    minHeight: touchTarget.minHeight,
    justifyContent: 'center',
  },
  permissionButtonText: {
    ...typography.bodyBold,
    color: '#FFFFFF',
  },
});
