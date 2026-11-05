import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useRoute } from '@react-navigation/native';

import { LoadErrorState } from '@/components/LoadErrorState';
import { PremiumUpgradePrompt } from '@/components/PremiumUpgradePrompt';
import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import { PriceAlertControls } from '@/features/price-intelligence/components/PriceAlertControls';
import { PriceChart } from '@/features/price-intelligence/components/PriceChart';
import { RangeControl } from '@/features/price-intelligence/components/RangeControl';
import { StoreSquare } from '@/features/price-intelligence/components/StoreSquare';
import { StoreComparison } from '@/features/price-intelligence/components/StoreComparison';
import { SuggestionCard } from '@/features/price-intelligence/components/SuggestionCard';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
import { itemBackTitle, type RouteLike } from '@/features/price-intelligence/utils/itemBackTitle';
import {
  useItem,
  usePriceComparison,
  usePriceHistory,
  useRenameItem,
  useSplitAlias,
} from '@/features/price-intelligence/hooks/useItems';
import type { ItemAlias, PriceHistory, StoreRef } from '@/features/price-intelligence/types';
import {
  formatPercent,
  formatUnitPrice,
  isStale,
  openingRange,
  pointsInRange,
  thirtyDayAverage,
  timelinePoints,
  unitSuffix,
  type PriceRange,
} from '@/features/price-intelligence/utils/priceTrend';
import { formatLongDate } from '@/features/receipt-capture/utils/receiptDate';
import { formatMoney } from '@/utils/money';
import { isPremiumRequired } from '@/utils/premium';
import { today } from '@/utils/today';

/**
 * PI-01: one item's price history — the 30-day average and its change (AC 7),
 * a line chart once there are enough prices (AC 2, AC 4, AC 8) over the range
 * the user picks (AC 5, AC 6), and every price with its date and store
 * (AC 1), each store with its square (AC 9). PI-02 AC 3: the names receipts gave it, which
 * the user can split off, and combining it with another item. PI-04 AC 4:
 * its price at each store. PI-03 AC 4: muting its price alerts, or a store's.
 * Comparison and muting are Premium (D8, PREM-02): a free user sees an
 * upgrade prompt in their place. A price change alert opens this screen.
 */
/** The Back label: the screen under this one in the stack (itemBackTitle). */
function useBackTitle(): string | undefined {
  const navigation = useNavigation();
  const route = useRoute();
  const { routes } = navigation.getState() ?? { routes: [] };
  const index = routes.findIndex((r) => r.key === route.key);
  return itemBackTitle(index > 0 ? (routes[index - 1] as RouteLike) : undefined);
}

export default function ItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const backTitle = useBackTitle();
  const item = useItem(id);
  const history = usePriceHistory(id);
  // PI-01 AC 5: the range the user picked; until then the opening range.
  const [picked, setPicked] = useState<PriceRange | null>(null);
  // Premium (PREM-02 AC 1) as the server last said; undefined while loading.
  const me = useMe().data;
  const premium = me?.is_premium === true;
  // Not awaited: the rest of the screen shows while the comparison loads.
  const comparison = usePriceComparison(id, premium);
  // PREM-02 AC 5, 6: a free user, or a 403 (Premium lapsed meanwhile).
  const compareLocked = (me !== undefined && !premium) || isPremiumRequired(comparison.error);
  const rename = useRenameItem();
  const split = useSplitAlias();
  // At accessibility sizes a price moves under its date and store (BUG-3).
  const stacked = useWindowDimensions().fontScale >= fontScale.accessibility;

  const name = item.data?.canonical_name ?? history.data?.item.canonical_name ?? '';
  const failed = () => Alert.alert(PRICES_COPY.actionFailed);

  const onRename = () =>
    Alert.prompt(
      PRICES_COPY.renamePrompt,
      PRICES_COPY.renameBody,
      [
        { text: PRICES_COPY.cancel, style: 'cancel' },
        {
          text: PRICES_COPY.save,
          onPress: (value?: string) => {
            const trimmed = value?.trim();
            if (trimmed && trimmed !== name) {
              rename.mutate({ id, name: trimmed }, { onError: failed });
            }
          },
        },
      ],
      'plain-text',
      name,
    );

  const onSplit = (alias: ItemAlias) =>
    Alert.alert(PRICES_COPY.splitConfirmTitle(alias.alias), PRICES_COPY.splitConfirmBody, [
      { text: PRICES_COPY.cancel, style: 'cancel' },
      {
        text: PRICES_COPY.split,
        onPress: () => split.mutate({ id, aliasId: alias.id }, { onError: failed }),
      },
    ]);

  const header = (
    <Stack.Screen
      options={{
        title: name,
        headerBackTitle: backTitle,
        headerRight: () =>
          item.data ? (
            <Pressable
              onPress={onRename}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={PRICES_COPY.renamePrompt}
            >
              <Text style={styles.headerBtn} maxFontSizeMultiplier={fontScale.headerButtonMax}>
                {PRICES_COPY.rename}
              </Text>
            </Pressable>
          ) : null,
      }}
    />
  );

  if (item.isLoading || history.isLoading) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          <ActivityIndicator color={colors.tint} />
        </View>
      </>
    );
  }
  if (!item.data || !history.data) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          <LoadErrorState
            title={PRICES_COPY.itemLoadFailed}
            onRetry={() => {
              void item.refetch();
              void history.refetch();
            }}
          />
        </View>
      </>
    );
  }

  const detail = item.data;
  const prices = history.data;
  const newestFirst = [...prices.observations].reverse();
  const stores = storesOf(newestFirst);
  // PI-01 AC 5: the chart filters the one full history by date, so a range
  // costs no request (and no price_history_viewed). 3M first, or the
  // smallest range with prices when 3M has none.
  const now = today();
  const plottable = timelinePoints(prices);
  const range = picked ?? openingRange(plottable, now);
  const chartPoints = pointsInRange(plottable, range, now);

  return (
    <>
      {header}
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.card}>
          <Headline history={prices} />
          {prices.has_timeline ? (
            <RangeChart
              points={chartPoints}
              currency={prices.currency ?? 'USD'}
              onShowAll={() => setPicked('All')}
            />
          ) : (
            <View style={styles.needMore}>
              <SymbolView name="chart.xyaxis.line" size={26} tintColor={colors.iosLabel3} />
              <Text style={styles.needMoreText}>
                {PRICES_COPY.needMorePrices(prices.min_points)}
              </Text>
            </View>
          )}
        </View>
        {prices.has_timeline ? <RangeControl value={range} onChange={setPicked} /> : null}

        {/* PI-02 AC 7: each pending suggestion opens the "Same item?" prompt. */}
        {detail.suggestions.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} itemId={id} />
        ))}

        {compareLocked ? (
          <View style={styles.card}>
            <PremiumUpgradePrompt
              title={PRICES_COPY.compareUpgradeTitle}
              message={PRICES_COPY.compareUpgradeMessage}
              upgradeLabel={PRICES_COPY.upgradeAction}
              onUpgrade={() => router.push('/paywall')}
            />
          </View>
        ) : comparison.data ? (
          <StoreComparison comparison={comparison.data} />
        ) : null}

        <Text style={styles.sectionLabel} accessibilityRole="header">
          {PRICES_COPY.pricesHeader(prices.observations.length)}
        </Text>
        <View style={styles.listCard}>
          {newestFirst.map((p, i) => {
            const store = p.store_name ?? PRICES_COPY.unknownStore;
            const price = formatUnitPrice(p.unit_price, p.currency, p.unit_of_measure);
            return (
              <View
                key={`${p.receipt_id}-${i}`}
                style={[styles.row, i > 0 && styles.rowDivider]}
                accessible
                accessibilityLabel={`${formatLongDate(p.date)}, ${store}, ${price}${
                  p.in_timeline ? '' : `, ${PRICES_COPY.otherUnit}`
                }`}
              >
                <StoreSquare storeId={p.store_id} />
                <View style={styles.rowText} testID={`price-row-text-${i}`}>
                  <Text style={type.body}>{formatLongDate(p.date)}</Text>
                  <Text style={styles.caption} numberOfLines={stacked ? undefined : 1}>
                    {p.in_timeline ? store : `${store} · ${PRICES_COPY.otherUnit}`}
                  </Text>
                  {stacked ? <Text style={styles.price}>{price}</Text> : null}
                </View>
                {stacked ? null : <Text style={styles.price}>{price}</Text>}
              </View>
            );
          })}
        </View>

        <PriceAlertControls
          canMute={me === undefined || premium}
          itemId={id}
          itemName={detail.canonical_name}
          alertsMuted={detail.alerts_muted}
          stores={stores}
        />

        <Text style={styles.sectionLabel} accessibilityRole="header">
          {PRICES_COPY.namesHeader}
        </Text>
        <View style={styles.listCard}>
          {detail.aliases.map((alias, i) => (
            <View key={alias.id} style={[styles.row, i > 0 && styles.rowDivider]}>
              <Text style={[type.body, styles.rowText]} numberOfLines={2}>
                {alias.alias}
              </Text>
              {detail.aliases.length > 1 ? (
                <Pressable
                  onPress={() => onSplit(alias)}
                  disabled={split.isPending}
                  hitSlop={8}
                  style={styles.inlineButton}
                  accessibilityRole="button"
                  accessibilityLabel={PRICES_COPY.splitLabel(alias.alias)}
                >
                  <Text style={styles.link}>{PRICES_COPY.split}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
        <Text style={styles.footer}>{PRICES_COPY.namesFooter}</Text>

        <Pressable
          onPress={() => router.push({ pathname: '/items/merge', params: { id } })}
          style={({ pressed }) => [styles.listCard, styles.actionRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={PRICES_COPY.combine}
          accessibilityHint={PRICES_COPY.combineHint}
        >
          <Text style={styles.link}>{PRICES_COPY.combine}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

/** Each store with a price of the item, once, in the order given. */
function storesOf(points: PriceHistory['observations']): StoreRef[] {
  const seen = new Map<string, string>();
  for (const p of points) {
    if (p.store_id && !seen.has(p.store_id)) {
      seen.set(p.store_id, p.store_name ?? PRICES_COPY.unknownStore);
    }
  }
  return [...seen].map(([storeId, name]) => ({ id: storeId, name }));
}

/**
 * PI-01 AC 7: "Avg · 30d", the mean of the like-for-like prices in the 30
 * days up to the latest, with its unit, and the change from the 30 days
 * before: a rise red with "+", a fall green with "−" (the sign says it too).
 * A latest price more than 30 days old adds "as of <its date>".
 */
function Headline({ history }: { history: PriceHistory }) {
  const average = thirtyDayAverage(history.observations);
  const latest = history.observations[history.observations.length - 1];
  if (!average || !latest) return null;
  const currency = history.currency ?? latest.currency;
  const money = formatMoney(average.average, currency);
  const unit = unitSuffix(history.unit_of_measure);
  const percent = average.percent ?? 0;
  const change = average.percent === null ? null : formatPercent(percent);
  const changeStyle =
    percent > 0 ? styles.changeUp : percent < 0 ? styles.changeDown : styles.changeFlat;
  // The latest price the average counts: like-for-like, as the 30 days are.
  const comparable = timelinePoints(history);
  const averaged = comparable[comparable.length - 1] ?? latest;
  const asOf = isStale(averaged.date, today())
    ? PRICES_COPY.asOf(formatLongDate(averaged.date))
    : null;
  const latestLine = PRICES_COPY.latestLine(
    formatUnitPrice(latest.unit_price, latest.currency, latest.unit_of_measure),
    latest.store_name ?? PRICES_COPY.unknownStore,
    formatLongDate(latest.date),
  );

  return (
    <View
      style={styles.headline}
      accessible
      accessibilityLabel={[
        PRICES_COPY.average30Label(`${money} ${unit}`.trim(), change),
        asOf,
        latestLine,
      ]
        .filter(Boolean)
        .join('. ')}
    >
      <View style={styles.headlineTop}>
        <Text style={[styles.caption, styles.headlineCaption]}>
          {PRICES_COPY.average30}
          {asOf ? <Text>{' · '}</Text> : null}
          {asOf ? <Text>{asOf}</Text> : null}
        </Text>
        {change ? (
          <Text testID="headline-change" style={[styles.change, changeStyle]}>
            {change}
          </Text>
        ) : null}
      </View>
      <View style={styles.headlinePrice}>
        {/* One line, shrunk to fit: at AX5 "$4.79" split as "$4.7" and "9" (BUG-3). */}
        <Text
          style={styles.latestPrice}
          testID="headline-price"
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {money}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <Text style={styles.caption}>{latestLine}</Text>
    </View>
  );
}

/** PI-01 AC 5, 6: the range's chart, or why there is none and a way to All. */
function RangeChart({
  points,
  currency,
  onShowAll,
}: {
  points: PriceHistory['observations'];
  currency: string;
  onShowAll: () => void;
}) {
  if (points.length >= 2) return <PriceChart points={points} currency={currency} />;
  return (
    <View style={styles.needMore}>
      <Text style={styles.needMoreText}>{PRICES_COPY.rangeTooFew}</Text>
      <Pressable
        onPress={onShowAll}
        style={styles.inlineButton}
        accessibilityRole="button"
        accessibilityLabel={PRICES_COPY.showAllLabel}
      >
        <Text style={styles.link}>{PRICES_COPY.showAll}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  headerBtn: { ...type.body, color: colors.tint, paddingHorizontal: spacing.xs },
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  headline: { gap: 2, marginBottom: spacing.sm },
  headlineTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  headlinePrice: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  latestPrice: { ...type.money, fontSize: 28, flexShrink: 1 },
  unit: { ...type.footnote, color: colors.iosLabel2 },
  headlineCaption: { flexShrink: 1 },
  change: { ...type.footnote, fontWeight: '600' },
  changeUp: { color: colors.redText },
  changeDown: { color: colors.greenText },
  changeFlat: { color: colors.iosLabel2 },
  needMore: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  needMoreText: { ...type.subheadline, color: colors.iosLabel2, textAlign: 'center' },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  rowText: { flex: 1, gap: 2 },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  price: { ...type.money, fontSize: 15 },
  inlineButton: {
    minHeight: touchTarget.minHeight,
    justifyContent: 'center',
  },
  link: { ...type.body, color: colors.tint },
  footer: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.xs },
  actionRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.minHeight,
    paddingVertical: 11,
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.6 },
});
