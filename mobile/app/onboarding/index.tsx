import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_ICON, BRAND_INK, WORDMARK, WORDMARK_ASPECT } from '@/constants/brand';
import { colors, radii, spacing, type } from '@/constants/theme';

const WORDMARK_WIDTH = 240;

export default function OnboardingWelcome() {
  // Padding the hero by the top inset on both sides keeps it centred at the
  // default text size and keeps the title clear of the status bar when large
  // text makes the screen scroll.
  const heroPad = { paddingVertical: useSafeAreaInsets().top };
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={false}
      >
        <View style={[styles.heroWrap, heroPad]}>
          {/* The home-screen icon, in the same appearance iOS shows it. */}
          <View style={styles.appIconShadow}>
            <Image
              source={APP_ICON[scheme]}
              style={styles.appIcon}
              accessibilityRole="image"
              accessibilityLabel="Grocery Genie logo"
            />
          </View>
          <View>
            <Image
              source={WORDMARK[scheme]}
              style={styles.wordmark}
              resizeMode="contain"
              accessible
              accessibilityRole="header"
              accessibilityLabel="Grocery Genie"
            />
            <Text style={styles.tagline}>
              Snap a receipt, watch your grocery budget take shape.
            </Text>
          </View>
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
    // Design: 20pt between the icon and the wordmark; the tagline sits 6pt under it.
    gap: 20,
    paddingHorizontal: spacing.xl,
  },
  // The shadow sits on a wrapper: the image clips to its corners, which would clip a shadow too.
  appIconShadow: {
    borderRadius: 22,
    shadowColor: BRAND_INK,
    shadowOpacity: 0.25,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
  },
  appIcon: { width: 88, height: 88, borderRadius: 22 },
  // 240pt wide: about the width the 38pt serif name took, so the hero keeps its balance.
  // Height is explicit: a required image's own 1883 × 295 size overrides aspectRatio.
  wordmark: {
    width: WORDMARK_WIDTH,
    height: WORDMARK_WIDTH / WORDMARK_ASPECT,
    alignSelf: 'center',
  },
  tagline: {
    ...type.subheadline,
    color: colors.iosLabel2,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
    marginTop: 6,
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
