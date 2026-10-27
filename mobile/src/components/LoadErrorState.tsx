import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';

interface LoadErrorStateProps {
  /** What failed to load, e.g. "Couldn’t load your budget". */
  title: string;
  onRetry: () => void;
}

/**
 * Shown in place of a screen's content when its data could not load (server
 * down, no connection), so a failed load never looks like an empty account.
 */
export function LoadErrorState({ title, onRetry }: LoadErrorStateProps) {
  return (
    <View style={styles.root}>
      <View style={styles.icon}>
        <SymbolView name="wifi.exclamationmark" size={26} tintColor={colors.iosLabel2} />
      </View>
      <Text style={[type.headline, styles.centered]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[type.subheadline, styles.body]}>Check your connection, then try again.</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <SymbolView name="arrow.clockwise" size={16} tintColor={colors.onTint} />
        <Text style={styles.buttonLabel}>Try Again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 480,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
  body: { color: colors.iosLabel2, textAlign: 'center', maxWidth: 260 },
  button: {
    marginTop: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.tint,
    borderRadius: radii.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonPressed: { backgroundColor: colors.tintPressed },
  buttonLabel: { ...type.headline, color: colors.onTint },
});
