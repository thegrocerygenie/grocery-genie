import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useResendVerification, useVerifyEmail } from '@/features/auth/hooks/useAuth';

const RESEND_COOLDOWN_SECONDS = 42;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email, token } = useLocalSearchParams<{ email?: string; token?: string }>();
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const resend = useResendVerification();
  const verify = useVerifyEmail();
  const verifiedOnce = useRef(false);

  useEffect(() => {
    if (token && !verifiedOnce.current) {
      verifiedOnce.current = true;
      verify
        .mutateAsync(token)
        .then(() => {
          // Confirm visually then advance.
        })
        .catch(() => {
          Alert.alert('Verification failed', 'The link may be invalid or expired.');
        });
    }
  }, [token, verify]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const formatted = `0:${secondsLeft.toString().padStart(2, '0')}`;
  const display = email && email.length > 0 ? email : 'your email address';

  const onContinue = () => {
    router.push('/onboarding/budget');
  };

  const onResend = async () => {
    if (!email || resend.isPending) return;
    try {
      await resend.mutateAsync(email);
      Alert.alert('Sent', `Verification link re-sent to ${email}.`);
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    } catch {
      Alert.alert('Could not resend', 'Try again in a moment.');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <View style={styles.heroWrap}>
          <View style={styles.envelope}>
            <SymbolView name="envelope.fill" size={34} tintColor="#fff" />
          </View>
          <Text style={[type.title2, { textAlign: 'center' }]}>Check your email</Text>
          <Text style={styles.tagline}>
            We sent a verification link to{'\n'}
            <Text style={styles.email}>{display}</Text>.{'\n'}
            Tap the link to finish setting up your account.
          </Text>
          {secondsLeft > 0 ? (
            <View style={styles.timerPill}>
              <SymbolView name="clock" size={13} tintColor={colors.iosLabel2 as string} />
              <Text style={styles.timerText}>
                Resend available in <Text style={styles.timerValue}>{formatted}</Text>
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={onResend}
              disabled={resend.isPending}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Resend verification email"
            >
              <Text style={[type.subheadline, { color: colors.tint, fontWeight: '600' }]}>
                Resend verification
              </Text>
            </Pressable>
          )}
        </View>
        <View style={styles.ctaStack}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { backgroundColor: colors.tintPressed },
            ]}
            onPress={() => {
              Linking.openURL('message://').catch(() => {
                // No-op if Mail not installed.
              });
              onContinue();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnLabel}>Open Mail</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={styles.tertiaryBtn}>Use a different email</Text>
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  envelope: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    shadowColor: colors.tint,
    shadowOpacity: 0.25,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  tagline: {
    ...type.subheadline,
    color: colors.iosLabel2 as string,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  email: { color: colors.iosLabel as string, fontWeight: '600' },

  timerPill: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  timerText: { ...type.caption1, color: colors.iosLabel2 as string },
  timerValue: {
    color: colors.iosLabel as string,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
    paddingVertical: 8,
  },
});
