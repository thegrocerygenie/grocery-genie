import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import { useBudgetStore } from '@/store/budgetStore';

const FALLBACK_COLOR = colors.cat.groceries;

export default function TopItemsScreen() {
  const { selectedPeriod } = useBudgetStore();
  const { data, isLoading } = useDashboardSpending(selectedPeriod);

  const items = useMemo(() => {
    const list = data?.top_items ?? [];
    return list.map((it) => ({
      name: it.name,
      trips: `${it.count} trip${it.count === 1 ? '' : 's'}`,
      amount: it.total_spent,
    }));
  }, [data]);

  const max = items.length > 0 ? Math.max(...items.map((i) => i.amount)) : 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Top items',
          headerLargeTitle: true,
          headerBlurEffect: 'systemChromeMaterial',
        }}
      />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.sm }}
      >
        <Text style={styles.intro}>Ranked by total spend this period.</Text>

        {isLoading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[type.headline, { textAlign: 'center' }]}>No items yet</Text>
            <Text style={[type.footnote, { color: colors.iosLabel2 as string, textAlign: 'center' }]}>
              Scan a receipt to start ranking your most-bought items.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {items.map((it, i) => (
              <View key={`${it.name}-${i}`} style={[styles.row, i > 0 && styles.rowDivider]}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={type.headline} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={[type.caption1, { color: colors.iosLabel2 as string }]}>
                      {it.trips}
                    </Text>
                  </View>
                  <Text style={[type.money, { fontSize: 15 }]}>${it.amount.toFixed(2)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: max > 0 ? `${(it.amount / max) * 100}%` : '0%',
                        backgroundColor: FALLBACK_COLOR,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  intro: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    paddingHorizontal: 4,
  },
  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 6,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rank: {
    ...type.caption1,
    color: colors.iosLabel2 as string,
    fontFamily: 'System',
    fontVariant: ['tabular-nums'],
    width: 18,
  },
  barTrack: {
    height: 3,
    backgroundColor: colors.iosFill3,
    borderRadius: 2,
    overflow: 'hidden',
    marginLeft: 28,
  },
  barFill: { height: '100%', borderRadius: 2 },
  empty: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
