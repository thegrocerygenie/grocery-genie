import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useConfirmEmailChange } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';

type Status = { kind: 'confirming' } | { kind: 'changed'; email: string } | { kind: 'failed' };

// Opened from the email-change link. It lives under onboarding/ because the
// root gate sends a signed-out user away from any other screen, and the
// confirm endpoint needs no sign-in.
export default function ConfirmEmailChangeScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const signedIn = useAuthStore((s) => !!s.accessToken);
  // Padding the hero by the top inset on both sides keeps it centred at the
  // default text size and keeps the title clear of the status bar when large
  // text makes the screen scroll.
  const heroPad = { paddingVertical: useSafeAreaInsets().top };
  const confirm = useConfirmEmailChange();
  const [status, setStatus] = useState<Status>(token ? { kind: 'confirming' } : { kind: 'failed' });
  const confirmedOnce = useRef(false);

  useEffect(() => {
    if (!token || confirmedOnce.current) return;
    confirmedOnce.current = true;
    confirm
      .mutateAsync(token)
      .then(({ email }) => setStatus({ kind: 'changed', email }))
      .catch(() => setStatus({ kind: 'failed' }));
  }, [token, confirm]);

  const onContinue = () => {
    router.replace(signedIn ? '/' : '/onboarding/sign-in');
  };

  if (status.kind === 'confirming') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.scrollContent}
          alwaysBounceVertical={false}
        >
          <View style={[styles.heroWrap, heroPad]}>
            <ActivityIndicator accessibilityLabel="Confirming email change" />
            <Text style={styles.tagline}>Confirming your new email…</Text>
          </View>
        </ScrollView>
      </>
    );
  }

  const changed = status.kind === 'changed';
  const next = signedIn ? 'Continue to the app.' : 'Sign in with your new email to continue.';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={false}
      >
        <View style={[styles.heroWrap, heroPad]}>
          <View style={[styles.badge, !changed && styles.badgeFailed]}>
            <SymbolView
              name={changed ? 'checkmark' : 'exclamationmark'}
              size={34}
              tintColor={colors.onTint}
            />
          </View>
          <Text style={[type.title2, { textAlign: 'center' }]}>
            {changed ? 'Email changed' : 'Link not valid'}
          </Text>
          <Text style={styles.tagline}>
            {changed ? (
              <>
                Your email is now <Text style={styles.email}>{status.email}</Text>. {next}
              </>
            ) : (
              'This link is invalid or has expired. Request the change again from Settings.'
            )}
          </Text>
        </View>
        <View style={styles.ctaStack}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { backgroundColor: colors.tintPressed },
            ]}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.primaryBtnLabel}>Continue</Text>
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  badgeFailed: { backgroundColor: colors.red },
  tagline: {
    ...type.subheadline,
    color: colors.iosLabel2,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  email: { color: colors.iosLabel, fontWeight: '600' },
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
});
