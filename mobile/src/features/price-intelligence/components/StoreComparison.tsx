import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { colors, fontScale, radii, spacing, type } from '@/constants/theme';
import { formatMoney } from '@/utils/money';

import { PRICES_COPY } from '../constants';
import type { PriceComparison, StorePrice } from '../types';
import { EACH_UNITS, formatUnitPrice } from '../utils/priceTrend';
import { storeColor } from '../utils/storeColor';
import { orderStoresByLatest, priceBarShare, switchSavings } from '../utils/storeComparison';
import { StoreSquare } from './StoreSquare';

/** "unit" for a count or no unit, else the measure ("lb", "kg"). */
function savingsUnit(unit: string | null): string {
  const normalized = unit?.trim().toLowerCase() ?? '';
  return !normalized || EACH_UNITS.has(normalized) ? PRICES_COPY.savingsUnit : normalized;
}

/**
 * PI-04: the item's price at each store, as the design's Compare stores. A
 * "Save by switching" card (AC 5), then a row per store ordered by its latest
 * price, cheapest first with a CHEAPEST badge (AC 6, EC-PI 10), each leading
 * with the latest price and the store's square (PI-01 AC 9), over a bar in the
 * store's colour (AC 7). VoiceOver reads a row as one element, and at
 * accessibility sizes the price stacks under the name instead of truncating
 * (AC 8). Stores with too few prices are counted so none goes missing without
 * a reason.
 */
export function StoreComparison({ comparison }: { comparison: PriceComparison }) {
  const { stores_below_minimum: below, min_observations: min } = comparison;
  const currency = comparison.currency ?? 'USD';
  const unit = comparison.unit_of_measure;
  const stores = orderStoresByLatest(comparison.stores);
  const savings = switchSavings(stores);
  const showCheapest = stores.length > 1;
  const stacked = useWindowDimensions().fontScale >= fontScale.accessibility;

  const savingsAmount = savings
    ? PRICES_COPY.savingsAmount(formatMoney(savings.amount, currency), savingsUnit(unit))
    : '';
  const savingsStores = savings
    ? PRICES_COPY.savingsStores(savings.cheapest, savings.priciest)
    : '';

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        {PRICES_COPY.compareHeader}
      </Text>
      {savings ? (
        <View
          style={styles.savingsCard}
          accessible
          accessibilityLabel={PRICES_COPY.savingsLabel(savingsAmount, savingsStores)}
        >
          <Text style={styles.savingsCaption}>{PRICES_COPY.saveBySwitching}</Text>
          <Text style={styles.savingsAmount}>{savingsAmount}</Text>
          <Text style={styles.savingsCaption}>{savingsStores}</Text>
        </View>
      ) : null}
      {stores.length > 0 ? (
        <View style={styles.listCard}>
          {stores.map((s, i) => (
            <StoreRow
              key={s.store_id}
              store={s}
              cheapest={showCheapest && i === 0}
              share={priceBarShare(s, stores)}
              currency={currency}
              unit={unit}
              stacked={stacked}
              divider={i > 0}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.listCard, styles.empty]}>
          <Text style={styles.emptyText}>{PRICES_COPY.compareEmpty(min)}</Text>
        </View>
      )}
      {below > 0 ? (
        <Text style={styles.footer}>{PRICES_COPY.compareBelowMinimum(below, min)}</Text>
      ) : null}
    </View>
  );
}

interface StoreRowProps {
  store: StorePrice;
  cheapest: boolean;
  /** Bar length: this store's latest price over the highest (AC 7). */
  share: number;
  currency: string;
  unit: string | null;
  stacked: boolean;
  divider: boolean;
}

function StoreRow({ store, cheapest, share, currency, unit, stacked, divider }: StoreRowProps) {
  const latest = formatUnitPrice(store.latest_price, currency, unit);
  const average = formatUnitPrice(store.avg_price, currency, unit);
  return (
    <View
      testID={`compare-row-${store.store_id}`}
      style={[styles.row, divider && styles.rowDivider]}
      accessible
      accessibilityLabel={PRICES_COPY.compareRowLabel(
        store.store_name,
        cheapest,
        latest,
        average,
        store.observation_count,
      )}
    >
      <View
        testID={`compare-head-${store.store_id}`}
        style={[styles.head, stacked && styles.headStacked]}
      >
        <View style={styles.nameBlock}>
          <StoreSquare storeId={store.store_id} />
          <View style={styles.rowText}>
            <View testID={`compare-name-line-${store.store_id}`} style={styles.nameLine}>
              <Text style={[type.body, styles.storeName]}>{store.store_name}</Text>
              {cheapest ? (
                <View testID={`compare-badge-${store.store_id}`} style={styles.badge}>
                  <Text style={styles.badgeText}>{PRICES_COPY.cheapest}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.caption}>
              {PRICES_COPY.comparePurchases(store.observation_count, average)}
            </Text>
          </View>
        </View>
        <Text testID={`compare-latest-${store.store_id}`} style={styles.latest}>
          {latest}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          testID={`compare-bar-${store.store_id}`}
          style={[
            styles.bar,
            { width: `${share * 100}%`, backgroundColor: storeColor(store.store_id) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
  savingsCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    padding: spacing.lg,
    gap: 2,
  },
  savingsCaption: { ...type.footnote, color: colors.iosLabel2 },
  savingsAmount: { ...type.money, fontSize: 28, color: colors.tint },
  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    gap: 6,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  nameBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
    flexGrow: 1,
  },
  rowText: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  storeName: { fontWeight: '600', flexShrink: 1 },
  badge: {
    backgroundColor: colors.tintBg,
    borderRadius: radii.cap,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { ...type.caption2, color: colors.tint, fontWeight: '600', letterSpacing: 0.4 },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  latest: { ...type.money, fontSize: 17, color: colors.iosLabel },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.iosFill3,
    overflow: 'hidden',
  },
  bar: { height: '100%' },
  empty: { padding: spacing.lg },
  emptyText: { ...type.subheadline, color: colors.iosLabel2, textAlign: 'center' },
  footer: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.xs },
});
