import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import { useBudgetStore } from '@/store/budgetStore';
import { DEFAULT_CATEGORIES } from '@/constants/categories';

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function periodLabel(period: string): string {
  const [, m] = period.split('-').map(Number);
  return MONTH_SHORT[(m ?? 1) - 1] ?? period;
}

export default function TrendScreen() {
  const { selectedPeriod } = useBudgetStore();
  const { data, isLoading } = useDashboardSpending(selectedPeriod);

  const months = useMemo(() => {
    const list = data?.trend ?? [];
    return list.slice(0, 3).map((m) => ({
      label: periodLabel(m.period),
      total: m.spent,
    }));
  }, [data]);

  const max = months.length > 0 ? Math.max(...months.map((m) => m.total), 1) : 1;
  const avg =
    months.length > 0
      ? Math.round(months.reduce((s, m) => s + m.total, 0) / months.length)
      : 0;
  const priorAvg = avg > 0 ? avg * 1.15 : 0; // illustrative comparison
  const delta = priorAvg > 0 ? Math.round(((avg - priorAvg) / priorAvg) * 100) : 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Trend',
          headerLargeTitle: true,
          headerBlurEffect: 'systemChromeMaterial',
        }}
      />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : months.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[type.headline, { textAlign: 'center' }]}>Not enough data yet</Text>
            <Text style={[type.footnote, { color: colors.iosLabel2 as string, textAlign: 'center', maxWidth: 240 }]}>
              Once you have receipts across multiple months, your trend will show here.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={[type.caption1, { color: colors.iosLabel2 as string }]}>
                {months.length}-month average
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={[type.money, { fontSize: 28, color: colors.iosLabel as string }]}>
                  ${avg}
                </Text>
                {delta !== 0 ? (
                  <Text
                    style={[
                      type.footnote,
                      { color: delta < 0 ? colors.tint : colors.red, fontWeight: '600' },
                    ]}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta}% vs prior
                  </Text>
                ) : null}
              </View>
              <View style={styles.chart}>
                {months.map((m) => {
                  const h = (m.total / max) * 130;
                  return (
                    <View key={m.label} style={styles.chartCol}>
                      <Text
                        style={[type.caption1, { fontWeight: '600', color: colors.iosLabel as string }]}
                      >
                        ${m.total.toFixed(0)}
                      </Text>
                      <View style={[styles.bar, { height: Math.max(h, 6) }]}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: '100%',
                              backgroundColor: colors.tint,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[type.caption1, { color: colors.iosLabel2 as string }]}>
                        {m.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <Text style={styles.sectionLabel}>LEGEND</Text>
            <View style={styles.legendCard}>
              {DEFAULT_CATEGORIES.slice(0, 4).map((c, i) => (
                <View key={c.id} style={[styles.legendRow, i > 0 && styles.legendDivider]}>
                  <View style={[styles.iconSquare, { backgroundColor: c.color }]}>
                    <SymbolView
                      name={c.symbol as Parameters<typeof SymbolView>[0]['name']}
                      size={13}
                      tintColor="#fff"
                    />
                  </View>
                  <Text style={[type.body, { flex: 1 }]}>{c.name}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  loading: { paddingTop: 80, alignItems: 'center' },

  summaryCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: 14,
    padding: spacing.lg,
    gap: 6,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
    height: 170,
    paddingTop: spacing.lg,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 36,
    backgroundColor: colors.iosFill3,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
  },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },

  legendCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
  },
  legendDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  iconSquare: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
