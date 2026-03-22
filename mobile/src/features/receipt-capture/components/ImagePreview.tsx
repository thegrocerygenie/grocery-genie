import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius, touchTarget } from '@/constants/theme';
import { strings } from '@/constants/strings';
import { QualityBanner } from './QualityBanner';

interface QualityWarning {
  type: 'blur' | 'low_light' | 'resolution';
  message: string;
}

interface ImagePreviewProps {
  uri: string;
  onRetake: () => void;
  onUsePhoto: () => void;
  warnings: QualityWarning[];
  loading?: boolean;
}

export function ImagePreview({
  uri,
  onRetake,
  onUsePhoto,
  warnings,
  loading = false,
}: ImagePreviewProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel="Captured receipt image"
      />

      {/* Quality warnings overlay at top */}
      <View style={[styles.warningsContainer, { top: insets.top + spacing.sm }]}>
        <QualityBanner warnings={warnings} />
      </View>

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>{strings.scan.processing}</Text>
        </View>
      )}

      {/* Action buttons at bottom */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.base }]}>
        <Pressable
          style={styles.retakeButton}
          onPress={onRetake}
          disabled={loading}
          accessibilityLabel={strings.scan.retake}
          accessibilityRole="button"
        >
          <Text style={styles.retakeText}>{strings.scan.retake}</Text>
        </Pressable>

        <Pressable
          style={[styles.useButton, loading && styles.buttonDisabled]}
          onPress={onUsePhoto}
          disabled={loading}
          accessibilityLabel={strings.scan.usePhoto}
          accessibilityRole="button"
        >
          <Text style={styles.useText}>{strings.scan.usePhoto}</Text>
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
  image: {
    flex: 1,
  },
  warningsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    color: '#FFFFFF',
  },
  actions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  retakeButton: {
    flex: 1,
    minHeight: touchTarget.minHeight,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  retakeText: {
    ...typography.bodyBold,
    color: '#FFFFFF',
  },
  useButton: {
    flex: 1,
    minHeight: touchTarget.minHeight,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  useText: {
    ...typography.bodyBold,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
