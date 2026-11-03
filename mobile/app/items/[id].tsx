import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { LoadErrorState } from '@/components/LoadErrorState';
import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { PriceAlertControls } from '@/features/price-intelligence/components/PriceAlertControls';
import { PriceChart } from '@/features/price-intelligence/components/PriceChart';
import { StoreComparison } from '@/features/price-intelligence/components/StoreComparison';
import { SuggestionCard } from '@/features/price-intelligence/components/SuggestionCard';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
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
  priceChange,
  timelinePoints,
} from '@/features/price-intelligence/utils/priceTrend';
import { formatLongDate } from '@/features/receipt-capture/utils/receiptDate';

/**
 * PI-01: one item's price history — the latest unit price and its change, a
 * line chart once there are enough prices (AC 2, AC 4), and every price with
 * its date and store (AC 1). PI-02 AC 3: the names receipts gave it, which
 * the user can split off, and combining it with another item. PI-04 AC 4:
 * its price at each store. PI-03 AC 4: muting its price alerts, or a store's.
 * A price change alert opens this screen.
 */
export default function ItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const history = usePriceHistory(id);
  // Not awaited: the rest of the screen shows while the comparison loads.
  const comparison = usePriceComparison(id);
  const rename = useRenameItem();
  const split = useSplitAlias();

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
        headerBackTitle: PRICES_COPY.detailBack,
        headerRight: () =>
          item.data ? (
            <Pressable
              onPress={onRename}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={PRICES_COPY.renamePrompt}
            >
              <Text style={styles.headerBtn}>{PRICES_COPY.rename}</Text>
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

  return (
    <>
      {header}
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <LatestCard history={prices} />

        {detail.suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            onAccepted={(mergedId) =>
              mergedId !== id &&
              router.replace({ pathname: '/items/[id]', params: { id: mergedId } })
            }
          />
        ))}

        {comparison.data ? <StoreComparison comparison={comparison.data} /> : null}

        <Text style={styles.sectionLabel} accessibilityRole="header">
          {PRICES_COPY.timelineHeader}
        </Text>
        <View style={styles.card}>
          {prices.has_timeline ? (
            <PriceChart points={timelinePoints(prices)} currency={prices.currency ?? 'USD'} />
          ) : (
            <View style={styles.needMore}>
              <SymbolView name="chart.xyaxis.line" size={26} tintColor={colors.iosLabel3} />
              <Text style={styles.needMoreText}>
                {PRICES_COPY.needMorePrices(prices.min_points)}
              </Text>
            </View>
          )}
        </View>

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
                <View style={styles.rowText}>
                  <Text style={type.body}>{formatLongDate(p.date)}</Text>
                  <Text style={styles.caption} numberOfLines={1}>
                    {p.in_timeline ? store : `${store} · ${PRICES_COPY.otherUnit}`}
                  </Text>
                </View>
                <Text style={styles.price}>{price}</Text>
              </View>
            );
          })}
        </View>

        <PriceAlertControls
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

function LatestCard({ history }: { history: PriceHistory }) {
  const points = history.has_timeline ? timelinePoints(history) : history.observations;
  const latest = points[points.length - 1];
  if (!latest) return null;
  const change = history.has_timeline ? priceChange(points) : null;
  const price = formatUnitPrice(latest.unit_price, latest.currency, latest.unit_of_measure);
  const changeText = change
    ? change.percent === 0
      ? PRICES_COPY.noChange(formatLongDate(change.sinceDate))
      : PRICES_COPY.since(formatPercent(change.percent), formatLongDate(change.sinceDate))
    : null;
  // Color backs up the words, never replaces them: up is orange, down green.
  const direction = !change || change.percent === 0 ? 'flat' : change.percent > 0 ? 'up' : 'down';
  const changeColor = { up: colors.orange, down: colors.green, flat: colors.iosLabel2 }[direction];
  const changeStyle = { up: styles.changeUp, down: styles.changeDown, flat: styles.changeFlat }[
    direction
  ];
  const where = `${latest.store_name ?? PRICES_COPY.unknownStore} · ${formatLongDate(latest.date)}`;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={[PRICES_COPY.latest, price, changeText, where].filter(Boolean).join(', ')}
    >
      <Text style={styles.caption}>{PRICES_COPY.latest}</Text>
      <Text style={styles.latestPrice}>{price}</Text>
      {changeText ? (
        <View style={styles.changeRow}>
          {change && change.percent !== 0 ? (
            <SymbolView
              name={change.percent > 0 ? 'arrow.up.right' : 'arrow.down.right'}
              size={13}
              tintColor={changeColor}
            />
          ) : null}
          <Text style={[styles.change, changeStyle]}>{changeText}</Text>
        </View>
      ) : null}
      <Text style={styles.caption}>{where}</Text>
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
  latestPrice: { ...type.money, fontSize: 34 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  change: { ...type.subheadline, fontWeight: '600' },
  changeUp: { color: colors.orange },
  changeDown: { color: colors.green },
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
