import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';

import { AI_CONSENT_COPY } from '../constants';

interface AiConsentContentProps {
  onAllow: () => void;
  onManual: () => void;
  /** Allow is being saved: the button shows a spinner and ignores taps. */
  saving?: boolean;
  /** Why the last Allow failed. */
  error?: string | null;
}

/**
 * App Store 5.1.2(i): says what is sent, to whom and why, before the first
 * scan or import. Used by the consent sheet (app/ai-consent.tsx) and in place
 * of the camera on the Scan tab.
 */
export function AiConsentContent({ onAllow, onManual, saving, error }: AiConsentContentProps) {
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} alwaysBounceVertical={false}>
        <View style={styles.icon}>
          <SymbolView name="sparkles" size={30} tintColor={colors.tint} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {AI_CONSENT_COPY.title}
        </Text>
        <Text style={styles.intro}>{AI_CONSENT_COPY.intro}</Text>
        <View style={styles.points}>
          {AI_CONSENT_COPY.points.map((point) => (
            <View key={point.symbol} style={styles.point}>
              <SymbolView name={point.symbol} size={18} tintColor={colors.tint} />
              <Text style={styles.pointText}>{point.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.ctaStack}>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Pressable
          onPress={onAllow}
          disabled={saving}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
          accessibilityRole="button"
          accessibilityLabel={AI_CONSENT_COPY.allow}
          accessibilityState={{ disabled: !!saving, busy: !!saving }}
        >
          {saving ? (
            <ActivityIndicator color={colors.onTint} />
          ) : (
            <Text style={styles.primaryLabel}>{AI_CONSENT_COPY.allow}</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onManual}
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityLabel={AI_CONSENT_COPY.manual}
        >
          <Text style={styles.secondaryLabel}>{AI_CONSENT_COPY.manual}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.title2, textAlign: 'center' },
  intro: { ...type.callout, color: colors.iosLabel, textAlign: 'center', lineHeight: 22 },
  points: {
    alignSelf: 'stretch',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.iosBg2,
  },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  pointText: { ...type.subheadline, flex: 1, color: colors.iosLabel2, lineHeight: 20 },
  ctaStack: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  error: { ...type.footnote, color: colors.red, textAlign: 'center' },
  primaryBtn: {
    // minHeight, not height: the label wraps at large text sizes.
    minHeight: 50,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  primaryPressed: { backgroundColor: colors.tintPressed },
  primaryLabel: { ...type.headline, color: colors.onTint },
  secondaryBtn: { minHeight: 44, justifyContent: 'center' },
  secondaryLabel: {
    ...type.subheadline,
    color: colors.tint,
    fontWeight: '500',
    textAlign: 'center',
  },
});
