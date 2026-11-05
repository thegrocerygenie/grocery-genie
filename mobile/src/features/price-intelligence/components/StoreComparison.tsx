import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { formatLongDate } from '@/features/receipt-capture/utils/receiptDate';

import { PRICES_COPY } from '../constants';
import type { PriceComparison } from '../types';
import { formatUnitPrice } from '../utils/priceTrend';
import { StoreSquare } from './StoreSquare';

/**
 * PI-04 AC 4: the item's average and latest price at each store, cheapest
 * first (the server's order). The cheapest store is named in words, not only
 * marked, and stores with too few prices are counted so none goes missing
 * without a reason. Each row leads with the store's square, the colour it
 * has on the price list too (PI-01 AC 9).
 */
export function StoreComparison({ comparison }: { comparison: PriceComparison }) {
  const { stores, stores_below_minimum: below, min_observations: min } = comparison;
  const currency = comparison.currency ?? 'USD';
  const unit = comparison.unit_of_measure;
  const showCheapest = stores.length > 1;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        {PRICES_COPY.compareHeader}
      </Text>
      {stores.length > 0 ? (
        <View style={styles.listCard}>
          {stores.map((s, i) => {
            const cheapest = showCheapest && i === 0;
            const average = formatUnitPrice(s.avg_price, currency, unit);
            const latest = formatUnitPrice(s.latest_price, currency, unit);
            const date = formatLongDate(s.latest_date);
            return (
              <View
                key={s.store_id}
                style={[styles.row, i > 0 && styles.rowDivider]}
                accessible
                accessibilityLabel={PRICES_COPY.compareRowLabel(
                  s.store_name,
                  cheapest,
                  average,
                  latest,
                  date,
                )}
              >
                <StoreSquare storeId={s.store_id} />
                <View style={styles.rowText}>
                  <View style={styles.nameLine}>
                    <Text style={[type.body, styles.storeName]} numberOfLines={1}>
                      {s.store_name}
                    </Text>
                    {cheapest ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{PRICES_COPY.cheapest}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.caption} numberOfLines={1}>
                    {PRICES_COPY.compareLatest(latest, date)}
                  </Text>
                </View>
                <View style={styles.priceCol}>
                  <Text style={[styles.price, cheapest && styles.priceCheapest]}>{average}</Text>
                  <Text style={styles.caption}>{PRICES_COPY.average}</Text>
                </View>
              </View>
            );
          })}
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
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  storeName: { flexShrink: 1 },
  badge: {
    backgroundColor: colors.tintBg,
    borderRadius: radii.cap,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { ...type.caption1, color: colors.tint, fontWeight: '600' },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  price: { ...type.money, fontSize: 17 },
  priceCheapest: { color: colors.tint },
  empty: { padding: spacing.lg },
  emptyText: { ...type.subheadline, color: colors.iosLabel2, textAlign: 'center' },
  footer: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.xs },
});
