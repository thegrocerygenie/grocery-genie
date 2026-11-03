import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';

interface PremiumUpgradePromptProps {
  title: string;
  message: string;
  /** Label for the upgrade button; shown only with `onUpgrade`. */
  upgradeLabel?: string;
  /**
   * Opens the upgrade flow: callers route it to the paywall (`/paywall`,
   * V11-P0). Without it the prompt shows no button that goes nowhere.
   */
  onUpgrade?: () => void;
}

/**
 * Shown in place of a Premium-only feature when the server answers
 * `403 premium_required` (D2): a calm, inline invitation, never an error.
 */
export function PremiumUpgradePrompt({
  title,
  message,
  upgradeLabel,
  onUpgrade,
}: PremiumUpgradePromptProps) {
  return (
    <View style={styles.root} testID="premium-upgrade-prompt">
      <View style={styles.icon}>
        <SymbolView name="sparkles" size={20} tintColor={colors.tint} />
      </View>
      <Text style={[type.headline, styles.centered]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[type.subheadline, styles.message]}>{message}</Text>
      {onUpgrade && upgradeLabel ? (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={onUpgrade}
          accessibilityRole="button"
          accessibilityLabel={upgradeLabel}
        >
          <Text style={styles.buttonLabel}>{upgradeLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
  message: { color: colors.iosLabel2, textAlign: 'center', maxWidth: 280 },
  button: {
    ...touchTarget,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.tint,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.tintPressed },
  buttonLabel: { ...type.headline, color: colors.onTint },
});
