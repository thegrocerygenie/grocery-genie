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

import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
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
import {
  isPurchasesAvailable,
  type PlanKind,
  type PremiumOffer,
  type PremiumPlan,
} from '@/features/premium/services/purchases';
import { perMonthPrice, savePercent } from '@/features/premium/utils/plans';

type Notice = { tone: 'info' | 'error'; text: string } | null;
type SymbolName = Parameters<typeof SymbolView>[0]['name'];

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(S.dateLocale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const periodOf = (plan: PremiumPlan): 'year' | 'month' =>
  plan.kind === 'yearly' ? 'year' : 'month';

/**
 * Premium (V11-P0, D1; PREM-01, D7): the design's paywall. A round × close,
 * the star badge, "Premium", what it unlocks, then the RevenueCat offering's
 * Yearly (selected) and Monthly plans at App Store prices, with the 7-day
 * free trial when the App Store says the user may take it. Premium shows
 * only once the backend says `is_premium` (it trusts RevenueCat, never the app).
 */
export default function PaywallScreen() {
  const router = useRouter();
  const { data: me } = useMe();
  const available = isPurchasesAvailable();
  const offer = usePremiumOffer(me?.id);
  const purchase = usePurchasePremium();
  const restore = useRestorePremium();
  const [notice, setNotice] = useState<Notice>(null);
  const [chosen, setChosen] = useState<PlanKind | null>(null);

  const isPremium = me?.is_premium === true;
  const busy = purchase.isPending || restore.isPending;
  const plans = offer.data?.plans ?? [];
  const selected = plans.find((p) => p.kind === chosen) ?? plans[0];

  const celebrate = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onSubscribe = async () => {
    if (!me || !selected) return;
    setNotice(null);
    const { outcome, premium } = await purchase.mutateAsync({ userId: me.id, plan: selected });
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
    const { outcome, premium, checked } = await restore.mutateAsync(me.id);
    if (outcome.kind === 'restored') {
      if (premium) celebrate();
      else if (!checked) setNotice({ tone: 'error', text: S.restoreCheckFailed });
      else setNotice({ tone: 'info', text: S.nothingToRestore });
    } else {
      setNotice({ tone: 'error', text: S.restoreFailed });
    }
  };

  const canRestore = !!me && !isPremium && available;

  return (
    <>
      <Stack.Screen options={{ title: S.screenTitle }} />
      <View style={styles.root}>
        <View style={styles.closeBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.closeTarget}
            accessibilityRole="button"
            accessibilityLabel={S.close}
          >
            <View style={styles.closeCircle}>
              <SymbolView name="xmark" size={12} weight="bold" tintColor={colors.iosLabel2} />
            </View>
          </Pressable>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.hero}>
            <View style={styles.badge}>
              <SymbolView
                name={isPremium ? 'checkmark.seal.fill' : 'star.fill'}
                size={30}
                tintColor={colors.onTint}
              />
            </View>
            <Text
              style={styles.title}
              accessibilityRole="header"
              maxFontSizeMultiplier={fontScale.titleMax}
            >
              {isPremium ? S.activeTitle : S.title}
            </Text>
            <Text style={[type.subheadline, styles.subtitle]}>
              {isPremium
                ? me?.premium_expires_at
                  ? S.activeUntil(longDate(me.premium_expires_at))
                  : S.activeThanks
                : S.subtitle}
            </Text>
          </View>

          <View style={styles.features}>
            {S.benefits.map((b) => (
              <View key={b.key} style={styles.feature} accessible accessibilityLabel={b.title}>
                <View style={styles.featureIcon}>
                  <SymbolView name={b.symbol as SymbolName} size={12} tintColor={colors.tint} />
                </View>
                <Text style={styles.featureTitle}>{b.title}</Text>
              </View>
            ))}
          </View>
          <Text style={[type.footnote, styles.staysFree]}>{S.staysFree}</Text>

          {isPremium ? null : !available ? (
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
            <Plans
              offer={offer.data}
              selected={selected}
              disabled={busy}
              onSelect={(kind) => setChosen(kind)}
            />
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

          {selected && !isPremium && available ? (
            <Text style={[type.caption1, styles.terms]}>
              {selected.trialDays
                ? S.trialTerms(selected.trialDays, selected.priceString, periodOf(selected))
                : S.billed(selected.priceString, periodOf(selected))}{' '}
              {S.terms(periodOf(selected))}
            </Text>
          ) : null}
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

        <View style={styles.footer}>
          {isPremium ? (
            <Pressable
              onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
              accessibilityRole="button"
              accessibilityLabel={S.manage}
            >
              <Text style={styles.secondaryLabel} maxFontSizeMultiplier={fontScale.buttonLabelMax}>
                {S.manage}
              </Text>
            </Pressable>
          ) : selected && available ? (
            <Pressable
              onPress={() => void onSubscribe()}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryPressed,
                busy && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                selected.trialDays ? S.startTrial(selected.trialDays) : S.subscribe
              }
              accessibilityState={{ disabled: busy, busy: purchase.isPending }}
            >
              <Text style={styles.primaryLabel}>
                {purchase.isPending
                  ? S.subscribing
                  : selected.trialDays
                    ? S.startTrial(selected.trialDays)
                    : S.subscribe}
              </Text>
            </Pressable>
          ) : null}
          {canRestore ? (
            <View style={styles.footerLine}>
              <Text style={[type.caption1, styles.secondary]}>{`${S.cancelAnytime} ·`}</Text>
              <Pressable
                onPress={() => void onRestore()}
                disabled={busy}
                hitSlop={{ top: 12, bottom: 12, left: 4, right: 12 }}
                style={styles.restore}
                accessibilityRole="button"
                accessibilityLabel={S.restore}
                accessibilityState={{ disabled: busy, busy: restore.isPending }}
              >
                <Text style={styles.restoreLabel}>
                  {restore.isPending ? S.restoring : S.restore}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </>
  );
}

interface PlansProps {
  offer: PremiumOffer;
  selected: PremiumPlan | undefined;
  disabled: boolean;
  onSelect: (kind: PlanKind) => void;
}

/** PREM-01 AC 1: Yearly (with its monthly price and saving) above Monthly. */
function Plans({ offer, selected, disabled, onSelect }: PlansProps) {
  const monthly = offer.plans.find((p) => p.kind === 'monthly');
  return (
    <View style={styles.plans} accessibilityRole="radiogroup" accessibilityLabel={S.plansLabel}>
      {offer.plans.map((plan) => {
        const isSelected = plan.kind === selected?.kind;
        const yearly = plan.kind === 'yearly';
        const perMonth = yearly ? perMonthPrice(plan, S.dateLocale) : null;
        const percent = yearly ? savePercent(plan, monthly) : null;
        return (
          <Pressable
            key={plan.kind}
            onPress={() => onSelect(plan.kind)}
            disabled={disabled}
            style={[styles.plan, isSelected && styles.planSelected]}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled }}
            accessibilityLabel={
              yearly && perMonth
                ? S.yearlyLabel(plan.priceString, perMonth, percent)
                : S.monthlyLabel(plan.priceString)
            }
          >
            {percent ? (
              <View style={styles.saveBadge}>
                <Text style={styles.saveLabel}>{S.save(percent)}</Text>
              </View>
            ) : null}
            <Text style={styles.planName}>{yearly ? S.yearly : S.monthly}</Text>
            <View style={styles.planPriceRow}>
              <Text style={yearly ? styles.planPriceLarge : styles.planPrice}>
                {plan.priceString}
              </Text>
              <Text style={styles.planPer}>
                {perMonth ? S.perYearAndMonth(perMonth) : S.perMonthShort}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  secondary: { color: colors.iosLabel2 },

  closeBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  closeTarget: { ...touchTarget, alignItems: 'center', justifyContent: 'center' },
  closeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hero: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    shadowColor: colors.tint,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  title: { ...type.title1, fontSize: 30, letterSpacing: -0.6, textAlign: 'center' },
  subtitle: { color: colors.iosLabel2, textAlign: 'center', maxWidth: 300 },

  features: { gap: 10 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { ...type.subheadline, fontWeight: '500', flex: 1 },
  staysFree: { color: colors.iosLabel2 },

  plans: { gap: spacing.sm },
  plan: {
    backgroundColor: colors.iosBg2,
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: touchTarget.minHeight,
  },
  planSelected: { borderColor: colors.tint },
  saveBadge: {
    position: 'absolute',
    top: -9,
    right: 12,
    backgroundColor: colors.tint,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  saveLabel: { ...type.caption2, color: colors.onTint, fontWeight: '700', letterSpacing: 0.4 },
  planName: { ...type.footnote, fontWeight: '600' },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  planPriceLarge: { ...type.money, fontSize: 22 },
  planPrice: { ...type.money, fontSize: 18 },
  planPer: { ...type.caption1, color: colors.iosLabel2, fontWeight: '500' },

  status: { alignItems: 'center', gap: spacing.sm, minHeight: 80, justifyContent: 'center' },
  notice: { color: colors.iosLabel2, textAlign: 'center' },
  error: { color: colors.red },

  terms: { color: colors.iosLabel2, textAlign: 'center' },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: -spacing.sm,
  },
  textButton: {
    ...touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  textButtonLabel: { ...type.body, color: colors.tint, fontWeight: '500' },
  linkLabel: { ...type.footnote, color: colors.tint },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
    backgroundColor: colors.iosBg,
  },
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
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.iosBg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPressed: { backgroundColor: colors.iosFill3 },
  secondaryLabel: { ...type.headline, color: colors.tint, textAlign: 'center' },
  footerLine: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  restore: { minHeight: 24, justifyContent: 'center' },
  restoreLabel: { ...type.caption1, color: colors.tint, fontWeight: '500' },
});
