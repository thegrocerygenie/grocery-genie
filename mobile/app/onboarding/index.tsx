import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WORDMARK_FONT } from '@/constants/fonts';
import { colors, radii, spacing, type } from '@/constants/theme';

// "Grocery" is one word, so past twice its size the wordmark breaks mid-word.
const WORDMARK_MAX_FONT_SCALE = 2;

export default function OnboardingWelcome() {
  // Padding the hero by the top inset on both sides keeps it centred at the
  // default text size and keeps the title clear of the status bar when large
  // text makes the screen scroll.
  const heroPad = { paddingVertical: useSafeAreaInsets().top };
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={false}
      >
        <View style={[styles.heroWrap, heroPad]}>
          <View style={styles.appIcon}>
            <SymbolView name="cart.fill" size={44} tintColor="#fff" />
          </View>
          <Text style={styles.wordmark} maxFontSizeMultiplier={WORDMARK_MAX_FONT_SCALE}>
            Grocery Genie
          </Text>
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
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  scrollContent: { flexGrow: 1 },
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
    color: colors.iosLabel,
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
    minHeight: 50,
    paddingVertical: spacing.sm,
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
