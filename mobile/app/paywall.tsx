import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import {
  MANAGE_SUBSCRIPTIONS_URL,
  PREMIUM_STRINGS as S,
  TERMS_OF_USE_URL,
} from '@/features/premium/content/premium';
import {
  usePremiumOffer,
  usePurchasePremium,
  useRestorePremium,
} from '@/features/premium/hooks/usePremium';
import { isPurchasesAvailable } from '@/features/premium/services/purchases';

type Notice = { tone: 'info' | 'error'; text: string } | null;

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Premium (V11-P0, D1): what it unlocks, the App Store price, subscribe and
 * restore. Premium shows only once the backend says `is_premium` (it trusts
 * RevenueCat, never the app).
 */
export default function PaywallScreen() {
  const router = useRouter();
  const { data: me } = useMe();
  const available = isPurchasesAvailable();
  const offer = usePremiumOffer(me?.id);
  const purchase = usePurchasePremium();
  const restore = useRestorePremium();
  const [notice, setNotice] = useState<Notice>(null);

  const isPremium = me?.is_premium === true;
  const busy = purchase.isPending || restore.isPending;

  const celebrate = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onSubscribe = async () => {
    if (!me || !offer.data) return;
    setNotice(null);
    const { outcome, premium } = await purchase.mutateAsync({ userId: me.id, offer: offer.data });
    if (outcome.kind === 'purchased') {
      if (premium) celebrate();
      else setNotice({ tone: 'info', text: S.pending });
    } else if (outcome.kind === 'failed') {
      setNotice({ tone: 'error', text: S.purchaseFailed });
    } else if (outcome.kind === 'unavailable') {
      setNotice({ tone: 'error', text: S.needsAppStoreBuild });
    }
  };

  const onRestore = async () => {
    if (!me) return;
    setNotice(null);
    const { outcome, premium } = await restore.mutateAsync(me.id);
    if (outcome.kind === 'restored') {
      if (premium) celebrate();
      else setNotice({ tone: 'info', text: S.nothingToRestore });
    } else {
      setNotice({ tone: 'error', text: S.restoreFailed });
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: S.screenTitle,
          headerRight: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={S.close}
            >
              <Text style={styles.headerBtn}>{S.close}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <SymbolView
              name={isPremium ? 'checkmark.seal.fill' : 'sparkles'}
              size={28}
              tintColor={colors.tint}
            />
          </View>
          <Text style={[type.title1, styles.centered]} accessibilityRole="header">
            {isPremium ? S.activeTitle : S.title}
          </Text>
          <Text style={[type.callout, styles.subtitle]}>
            {isPremium
              ? me?.premium_expires_at
                ? S.activeUntil(longDate(me.premium_expires_at))
                : S.activeThanks
              : S.subtitle}
          </Text>
        </View>

        <View style={styles.card}>
          {S.benefits.map((b, i) => (
            <View key={b.key} style={[styles.benefit, i > 0 && styles.benefitDivider]} accessible>
              <View style={styles.benefitIcon}>
                <SymbolView
                  name={b.symbol as Parameters<typeof SymbolView>[0]['name']}
                  size={16}
                  tintColor={colors.onTint}
                />
              </View>
              <View style={styles.benefitText}>
                <Text style={type.headline}>{b.title}</Text>
                <Text style={[type.subheadline, styles.secondary]}>{b.detail}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={[type.footnote, styles.staysFree]}>{S.staysFree}</Text>

        {isPremium ? (
          <Pressable
            onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
            accessibilityRole="button"
            accessibilityLabel={S.manage}
          >
            <Text style={styles.secondaryLabel}>{S.manage}</Text>
          </Pressable>
        ) : !available ? (
          <Text style={[type.subheadline, styles.notice]}>{S.needsAppStoreBuild}</Text>
        ) : offer.isPending ? (
          <View style={styles.status} accessibilityLabel={S.loadingOffer}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : !offer.data ? (
          <View style={styles.status}>
            <Text style={[type.subheadline, styles.secondary]}>{S.offerUnavailable}</Text>
            <Pressable
              onPress={() => void offer.refetch()}
              style={styles.textButton}
              accessibilityRole="button"
              accessibilityLabel={S.retry}
            >
              <Text style={styles.textButtonLabel}>{S.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.purchase}>
            <View
              style={styles.priceRow}
              accessible
              accessibilityLabel={`${offer.data.priceString} a month`}
            >
              <Text style={styles.price}>{offer.data.priceString}</Text>
              <Text style={[type.body, styles.secondary]}>{S.perMonth}</Text>
            </View>
            <Pressable
              onPress={() => void onSubscribe()}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryPressed,
                busy && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={S.subscribe(offer.data.priceString)}
              accessibilityState={{ disabled: busy, busy: purchase.isPending }}
            >
              <Text style={styles.primaryLabel}>
                {purchase.isPending ? S.subscribing : S.subscribe(offer.data.priceString)}
              </Text>
            </Pressable>
          </View>
        )}

        {notice ? (
          <Text
            style={[type.subheadline, styles.notice, notice.tone === 'error' && styles.error]}
            accessibilityRole={notice.tone === 'error' ? 'alert' : 'text'}
            accessibilityLiveRegion="polite"
          >
            {notice.text}
          </Text>
        ) : null}

        {me && !isPremium && available ? (
          <Pressable
            onPress={() => void onRestore()}
            disabled={busy}
            style={styles.textButton}
            accessibilityRole="button"
            accessibilityLabel={S.restore}
            accessibilityState={{ disabled: busy, busy: restore.isPending }}
          >
            <Text style={styles.textButtonLabel}>
              {restore.isPending ? S.restoring : S.restore}
            </Text>
          </Pressable>
        ) : null}

        <Text style={[type.caption1, styles.terms]}>{S.terms}</Text>
        <View style={styles.links}>
          <Pressable
            onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
            style={styles.textButton}
            accessibilityRole="link"
            accessibilityLabel={S.termsOfUse}
          >
            <Text style={styles.linkLabel}>{S.termsOfUse}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings/privacy')}
            style={styles.textButton}
            accessibilityRole="link"
            accessibilityLabel={S.privacyPolicy}
          >
            <Text style={styles.linkLabel}>{S.privacyPolicy}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },
  headerBtn: { ...type.body, color: colors.tint, fontWeight: '600', paddingHorizontal: spacing.xs },

  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  centered: { textAlign: 'center' },
  subtitle: { color: colors.iosLabel2, textAlign: 'center', maxWidth: 300 },
  secondary: { color: colors.iosLabel2 },

  card: { backgroundColor: colors.iosBg2, borderRadius: radii.list, overflow: 'hidden' },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  benefitDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  benefitIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  benefitText: { flex: 1, gap: 2 },
  staysFree: { color: colors.iosLabel2, textAlign: 'center', marginTop: -spacing.sm },

  purchase: { gap: spacing.md, alignItems: 'stretch' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 },
  price: { ...type.money, fontSize: 34 },
  primaryButton: {
    minHeight: 50,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: colors.tintPressed },
  disabled: { opacity: 0.6 },
  primaryLabel: { ...type.headline, color: colors.onTint, textAlign: 'center' },

  secondaryButton: {
    minHeight: 50,
    paddingVertical: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.iosBg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPressed: { backgroundColor: colors.iosFill3 },
  secondaryLabel: { ...type.headline, color: colors.tint },

  status: { alignItems: 'center', gap: spacing.sm, minHeight: 80, justifyContent: 'center' },
  notice: { color: colors.iosLabel2, textAlign: 'center' },
  error: { color: colors.red },

  textButton: {
    ...touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  textButtonLabel: { ...type.body, color: colors.tint, fontWeight: '500' },
  terms: { color: colors.iosLabel2, textAlign: 'center' },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: -spacing.sm,
  },
  linkLabel: { ...type.footnote, color: colors.tint },
});
