import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCameraPermissions } from 'expo-camera';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useCompleteOnboarding } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';

export default function OnboardingCamera() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const markFirstRunCompleted = useAuthStore((s) => s.markFirstRunCompleted);
  const completeOnboarding = useCompleteOnboarding();

  // Onboarding ends here, with or without a budget (Skip). The root layout's
  // gate reads needs_onboarding from /me, so it must be false before we leave.
  const finish = async () => {
    void markFirstRunCompleted();
    try {
      await completeOnboarding.mutateAsync();
    } catch {
      // useCompleteOnboarding lets the user in offline; the server asks again later.
    }
    router.replace('/(tabs)');
  };

  const onAllow = async () => {
    if (!permission?.granted) {
      await requestPermission();
    }
    await finish();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <View style={styles.heroWrap}>
          <View style={styles.permIcon}>
            <SymbolView name="camera.fill" size={32} tintColor={colors.tint} />
          </View>
          <Text style={[type.title2, { textAlign: 'center' }]}>Allow Camera Access</Text>
          <Text style={styles.tagline}>
            Grocery Genie uses the camera only to scan receipts. Photos are sent securely to read
            your receipt, and you can delete them anytime.
          </Text>
        </View>
        <View style={styles.ctaStack}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { backgroundColor: colors.tintPressed },
            ]}
            onPress={onAllow}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnLabel}>Continue</Text>
          </Pressable>
          <Pressable hitSlop={12} onPress={finish} accessibilityRole="button">
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
  permIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
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
    paddingVertical: spacing.sm,
  },
});
