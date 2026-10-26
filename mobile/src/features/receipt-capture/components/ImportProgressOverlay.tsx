import React, { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';

const MESSAGE = 'Reading your receipt…';

interface ImportProgressOverlayProps {
  visible: boolean;
  /** Local image to show while it uploads; null shows a document symbol (PDF). */
  previewUri: string | null;
}

/**
 * Covers the screen while an imported receipt uploads and is extracted.
 *
 * Render it last inside the screen. It is a plain view, not a native Modal:
 * iOS won't present the review modal while another modal is still showing.
 */
export function ImportProgressOverlay({ visible, previewUri }: ImportProgressOverlayProps) {
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(MESSAGE);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View
        style={styles.card}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={MESSAGE}
        accessibilityState={{ busy: true }}
      >
        <View style={styles.preview}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <SymbolView name="doc.text.fill" size={30} tintColor={colors.tint} />
          )}
        </View>
        <Text style={styles.title}>{MESSAGE}</Text>
        <Text style={styles.caption}>This takes a few seconds.</Text>
        <ActivityIndicator style={styles.spinner} color={colors.tint} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: 260,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sheet,
    backgroundColor: colors.iosBg2,
    alignItems: 'center',
    gap: spacing.xs,
  },
  preview: {
    width: 64,
    height: 84,
    marginBottom: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
  title: { ...type.headline, color: colors.iosLabel, textAlign: 'center' },
  caption: { ...type.footnote, color: colors.iosLabel2 as string, textAlign: 'center' },
  spinner: { marginTop: spacing.md },
});
