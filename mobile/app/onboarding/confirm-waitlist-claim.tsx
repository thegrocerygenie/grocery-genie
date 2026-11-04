import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { WAITLIST_OFFER_STRINGS as S } from '@/features/premium/content/waitlistOffer';
import { useConfirmWaitlistClaim } from '@/features/premium/hooks/useWaitlistOffer';
import { claimErrorMessage, offerDate } from '@/features/premium/utils/waitlistOffer';
import { useAuthStore } from '@/store/authStore';

type Status =
  | { kind: 'confirming' }
  | { kind: 'claimed'; message: string }
  | { kind: 'failed'; message: string };

// Opened from the link in the claim email (V11-P5). It lives under
// onboarding/ because the root gate sends a signed-out user away from any
// other screen, and the confirm endpoint needs no sign-in (the token is the
// proof), like confirm-email-change.
export default function ConfirmWaitlistClaimScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const signedIn = useAuthStore((s) => !!s.accessToken);
  const heroPad = { paddingVertical: useSafeAreaInsets().top };
  const confirm = useConfirmWaitlistClaim();
  const [status, setStatus] = useState<Status>(
    token ? { kind: 'confirming' } : { kind: 'failed', message: S.errorInvalidLink },
  );
  const confirmedOnce = useRef(false);

  useEffect(() => {
    if (!token || confirmedOnce.current) return;
    confirmedOnce.current = true;
    confirm
      .mutateAsync(token)
      .then((r) =>
        setStatus(
          r.status === 'failed'
            ? { kind: 'failed', message: S.grantFailedBody }
            : {
                kind: 'claimed',
                message:
                  r.status === 'granted' ? S.grantedBody(offerDate(r.expires_at)) : S.pendingBody,
              },
        ),
      )
      .catch((e: unknown) => setStatus({ kind: 'failed', message: claimErrorMessage(e) }));
  }, [token, confirm]);

  if (status.kind === 'confirming') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView style={styles.root} contentContainerStyle={styles.scrollContent}>
          <View style={[styles.heroWrap, heroPad]}>
            <ActivityIndicator accessibilityLabel={S.confirmingLabel} />
            <Text style={styles.tagline}>{S.confirming}</Text>
          </View>
        </ScrollView>
      </>
    );
  }

  const claimed = status.kind === 'claimed';
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={false}
      >
        <View style={[styles.heroWrap, heroPad]}>
          <View style={[styles.badge, !claimed && styles.badgeFailed]}>
            <SymbolView
              name={claimed ? 'gift.fill' : 'exclamationmark'}
              size={34}
              tintColor={colors.onTint}
            />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {claimed ? S.confirmedTitle : S.failedTitle}
          </Text>
          <Text style={styles.tagline}>{status.message}</Text>
        </View>
        <View style={styles.ctaStack}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
            onPress={() => router.replace(signedIn ? '/' : '/onboarding/sign-in')}
            accessibilityRole="button"
            accessibilityLabel={S.continue}
          >
            <Text style={styles.primaryBtnLabel}>{S.continue}</Text>
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
  title: { ...type.title2, textAlign: 'center' },
  tagline: {
    ...type.subheadline,
    color: colors.iosLabel2,
    textAlign: 'center',
    maxWidth: 280,
  },
  ctaStack: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  primaryBtn: {
    minHeight: touchTarget.minHeight,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: colors.tintPressed },
  primaryBtnLabel: { ...type.headline, color: colors.onTint },
});
