/**
 * Onboarding — First-launch flow.
 *
 * Three screens stacked under expo-router. Place these as:
 *   app/onboarding/index.tsx   → OnboardingWelcome
 *   app/onboarding/budget.tsx  → OnboardingBudget
 *   app/onboarding/camera.tsx  → OnboardingCamera
 *
 * Or keep them in one file with router.push between them.
 *
 * Gate the (tabs) group behind a "completed onboarding" flag in
 * AsyncStorage / your auth provider — when false, redirect to /onboarding.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCameraPermissions } from 'expo-camera';
import { colors, type, radii, spacing } from './theme';

// ─── Welcome ─────────────────────────────────────────────
export function OnboardingWelcome() {
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
          <Text style={styles.tagline}>
            Snap a receipt, watch your grocery budget take shape.
          </Text>
        </View>
        <View style={styles.ctaStack}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push('/onboarding/budget')}
          >
            <Text style={styles.primaryBtnLabel}>Get Started</Text>
          </Pressable>
          <Pressable hitSlop={12}>
            <Text style={styles.tertiaryBtn}>I already have an account</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

// ─── Budget ──────────────────────────────────────────────
export function OnboardingBudget() {
  const router = useRouter();
  const [amount, setAmount] = useState('400');

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Set Budget',
          headerBackTitle: 'Back',
          headerRight: () => (
            <Pressable onPress={() => router.push('/onboarding/camera')} hitSlop={12}>
              <Text style={styles.headerBtn}>Skip</Text>
            </Pressable>
          ),
        }}
      />
      <View style={[styles.root, { padding: spacing.lg }]}>
        <Text style={styles.sectionLabel}>MONTHLY BUDGET</Text>
        <View style={styles.amountCard}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
            <Text style={styles.amountCurrency}>$</Text>
            <TextInput
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              style={styles.amountInput}
              maxLength={6}
            />
          </View>
          <Text style={styles.amountHint}>You can change this anytime.</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push('/onboarding/camera')}
        >
          <Text style={styles.primaryBtnLabel}>Continue</Text>
        </Pressable>
      </View>
    </>
  );
}

// ─── Camera permission ───────────────────────────────────
export function OnboardingCamera() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const onAllow = async () => {
    if (!permission?.granted) {
      await requestPermission();
    }
    router.replace('/(tabs)');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <View style={styles.heroWrap}>
          <View style={[styles.permIcon, { backgroundColor: colors.iosFill3 }]}>
            <SymbolView name="camera.fill" size={32} tintColor={colors.tint} />
          </View>
          <Text style={[type.title2, { textAlign: 'center' }]}>
            Allow Camera Access
          </Text>
          <Text style={styles.tagline}>
            Grocery Genie uses the camera only to scan receipts. Photos are processed on-device.
          </Text>
        </View>
        <View style={styles.ctaStack}>
          <Pressable style={styles.primaryBtn} onPress={onAllow}>
            <Text style={styles.primaryBtnLabel}>Continue</Text>
          </Pressable>
          <Pressable hitSlop={12} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.tertiaryBtn}>Not now</Text>
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
  permIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  wordmark: {
    fontSize: 38,
    letterSpacing: -0.7,
    fontFamily: 'Times New Roman', // swap to your serif via expo-font
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
  primaryBtnLabel: { color: '#fff', ...type.headline },
  tertiaryBtn: {
    color: colors.tint,
    ...type.subheadline,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  headerBtn: { ...type.body, color: colors.tint },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  amountCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  amountCurrency: {
    ...type.money,
    fontSize: 32,
    color: colors.iosLabel3,
  },
  amountInput: {
    ...type.money,
    fontSize: 56,
    color: colors.iosLabel,
    minWidth: 120,
    textAlign: 'center',
    padding: 0,
  },
  amountHint: {
    ...type.footnote,
    color: colors.iosLabel2,
    textAlign: 'center',
  },
});
