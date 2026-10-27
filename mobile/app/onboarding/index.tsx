import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { WORDMARK_FONT } from '@/constants/fonts';
import { colors, radii, spacing, type } from '@/constants/theme';

export default function OnboardingWelcome() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <View style={styles.heroWrap}>
          <View style={styles.appIcon}>
            <SymbolView name="cart.fill" size={44} tintColor="#fff" />
          </View>
          <Text style={styles.wordmark}>Grocery Genie</Text>
          <Text style={styles.tagline}>Snap a receipt, watch your grocery budget take shape.</Text>
        </View>
        <View style={styles.ctaStack}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { backgroundColor: colors.tintPressed },
            ]}
            onPress={() => router.push('/onboarding/sign-up')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnLabel}>Get Started</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/onboarding/sign-in')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="I already have an account"
          >
            <Text style={styles.tertiaryBtn}>I already have an account</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  heroWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  appIcon: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.tint,
    shadowOpacity: 0.3,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  wordmark: {
    fontSize: 38,
    letterSpacing: -0.7,
    fontFamily: WORDMARK_FONT,
    textAlign: 'center',
  },
  tagline: {
    ...type.callout,
    color: colors.iosLabel2,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  ctaStack: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + 4,
    gap: spacing.sm,
  },
  primaryBtn: {
    height: 50,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: { ...type.headline, color: colors.onTint },
  tertiaryBtn: {
    ...type.subheadline,
    color: colors.tint,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
