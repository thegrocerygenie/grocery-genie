import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import { useBudgetStore } from '@/store/budgetStore';
import { getCategoryMetaByName } from '@/constants/categories';
import { percentChange } from '@/features/budget/utils/monthOverMonth';
import { buildTrendBreakdown, type TrendSegment } from '@/features/budget/utils/trendBreakdown';
import type { DashboardCategoryChange } from '@/features/budget/types';

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

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function periodLabel(period: string): string {
  const [, m] = period.split('-').map(Number);
  return MONTH_SHORT[(m ?? 1) - 1] ?? period;
}

function monthName(period: string): string {
  const [, m] = period.split('-').map(Number);
  return MONTH_LONG[(m ?? 1) - 1] ?? period;
}

/** "+17%", "−17%" (minus sign), or "0%". */
function changeText(change: number): string {
  if (change > 0) return `+${change}%`;
  if (change < 0) return `\u2212${Math.abs(change)}%`;
  return '0%';
}

/** "up 17 percent", "down 17 percent", or "no change", for VoiceOver. */
function changeWords(change: number): string {
  if (change > 0) return `up ${change} percent`;
  if (change < 0) return `down ${Math.abs(change)} percent`;
  return 'no change';
}

/** Spending more is the warning direction; spending less is good news. */
function changeColor(change: number): string {
  if (change > 0) return colors.red;
  if (change < 0) return colors.tint;
  return colors.iosLabel2 as string;
}

function money(amount: number): string {
  return `$${amount.toFixed(0)}`;
}

export default function TrendScreen() {
  const { selectedPeriod } = useBudgetStore();
  const { data, isLoading } = useDashboardSpending(selectedPeriod);

  const breakdown = useMemo(() => buildTrendBreakdown((data?.trend ?? []).slice(0, 3)), [data]);
  const months = useMemo(
    () =>
      breakdown.months.map((m) => ({
        period: m.period,
        label: periodLabel(m.period),
        total: m.total,
        segments: m.segments,
      })),
    [breakdown],
  );

  const max = months.length > 0 ? Math.max(...months.map((m) => m.total), 1) : 1;
  const avg =
    months.length > 0 ? Math.round(months.reduce((s, m) => s + m.total, 0) / months.length) : 0;

  // BC-04 AC 2: this month vs last month, for the total and per category.
  const period = data?.period ?? selectedPeriod;
  const previousPeriod = data?.previous_period ?? '';
  const spentIn = (p: string) => data?.trend.find((m) => m.period === p)?.spent ?? 0;
  const current = spentIn(period);
  const totalChange = percentChange(current, spentIn(previousPeriod));
  const categoryChanges = data?.category_changes ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Trend',
          // Opened from the Budget tab; otherwise iOS shows the group name "(tabs)".
          headerBackTitle: 'Budget',
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
            <Text
              style={[
                type.footnote,
                { color: colors.iosLabel2 as string, textAlign: 'center', maxWidth: 240 },
              ]}
            >
              Once you have receipts across multiple months, your trend will show here.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.caption}>{monthName(period)} spending</Text>
              <View style={styles.totalRow}>
                <Text style={styles.total}>{money(current)}</Text>
                {totalChange !== null ? (
                  <Text
                    style={[styles.totalChange, { color: changeColor(totalChange) }]}
                    accessibilityLabel={
                      totalChange === 0
                        ? `Same as ${monthName(previousPeriod)}`
                        : `${changeWords(totalChange).replace(/^./, (c) => c.toUpperCase())} from ${monthName(previousPeriod)}`
                    }
                  >
                    {changeText(totalChange)} vs {periodLabel(previousPeriod)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.caption}>
                {months.length}-month average {money(avg)}
              </Text>
              <View style={styles.chart}>
                {months.map((m) => {
                  const h = (m.total / max) * 130;
                  return (
                    <View
                      key={m.label}
                      style={styles.chartCol}
                      accessible
                      accessibilityLabel={`${monthName(m.period)}: ${money(m.total)}`}
                    >
                      <Text
                        style={[
                          type.caption1,
                          { fontWeight: '600', color: colors.iosLabel as string },
                        ]}
                      >
                        ${m.total.toFixed(0)}
                      </Text>
                      <View style={[styles.bar, { height: Math.max(h, 6) }]}>
                        <StackedFill period={m.period} total={m.total} segments={m.segments} />
                      </View>
                      <Text style={[type.caption1, { color: colors.iosLabel2 as string }]}>
                        {m.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {breakdown.categories.length > 0 ? (
                <View style={styles.legend}>
                  {breakdown.categories.map((c) => (
                    <View
                      key={c.key}
                      style={styles.legendItem}
                      accessible
                      accessibilityLabel={`${c.name}, ${months.length}-month average ${money(c.average)}`}
                    >
                      <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                      <Text style={styles.caption}>
                        {c.name} {money(c.average)} avg
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {categoryChanges.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>
                  BY CATEGORY · VS {periodLabel(previousPeriod).toUpperCase()}
                </Text>
                <View style={styles.legendCard}>
                  {categoryChanges.map((c, i) => (
                    <CategoryChangeRow
                      key={c.category_id}
                      change={c}
                      previousPeriod={previousPeriod}
                      divider={i > 0}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

interface StackedFillProps {
  period: string;
  total: number;
  segments: TrendSegment[];
}

/**
 * A month's bar split by category, largest 3-month spender at the bottom. With
 * no split (no spend, or an older server) the bar is one tint fill.
 */
function StackedFill({ period, total, segments }: StackedFillProps) {
  const drawn = segments.filter((s) => s.spent > 0);
  if (drawn.length === 0 || total <= 0) {
    return <View style={[styles.barFill, styles.barFillPlain]} />;
  }
  // The bar stacks top to bottom, so draw the smallest share first.
  return (
    <>
      {[...drawn].reverse().map((s) => (
        <View
          key={s.key}
          testID={`trend-segment-${period}-${s.key}`}
          style={[
            styles.barFill,
            { height: `${(s.spent / total) * 100}%`, backgroundColor: s.color },
          ]}
        />
      ))}
    </>
  );
}

interface CategoryChangeRowProps {
  change: DashboardCategoryChange;
  previousPeriod: string;
  divider: boolean;
}

function CategoryChangeRow({ change, previousPeriod, divider }: CategoryChangeRowProps) {
  const meta = getCategoryMetaByName(change.name);
  const pct = percentChange(change.spent, change.previous_spent);
  const detail =
    pct === null
      ? 'New this month'
      : `${changeText(pct)} · ${money(change.previous_spent)} in ${periodLabel(previousPeriod)}`;
  const label =
    pct === null
      ? `${change.name}: ${money(change.spent)} this month, new this month`
      : `${change.name}: ${money(change.spent)} this month, ${money(change.previous_spent)} in ${monthName(previousPeriod)}, ${changeWords(pct)}`;

  return (
    <View
      style={[styles.legendRow, divider && styles.legendDivider]}
      accessible
      accessibilityLabel={label}
    >
      <View style={[styles.iconSquare, { backgroundColor: meta.color }]}>
        <SymbolView
          name={meta.symbol as Parameters<typeof SymbolView>[0]['name']}
          size={13}
          tintColor="#fff"
        />
      </View>
      <Text style={[type.body, { flex: 1 }]}>{change.name}</Text>
      <View style={styles.changeValues}>
        <Text style={styles.changeAmount}>{money(change.spent)}</Text>
        <Text
          style={[
            styles.changeDetail,
            pct !== null && pct !== 0 ? { color: changeColor(pct) } : null,
          ]}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  loading: { paddingTop: 80, alignItems: 'center' },

  caption: {
    ...type.caption1,
    color: colors.iosLabel2 as string,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  total: {
    ...type.money,
    fontSize: 28,
    color: colors.iosLabel as string,
  },
  totalChange: {
    ...type.footnote,
    fontWeight: '600',
  },
  changeValues: {
    alignItems: 'flex-end',
  },
  changeAmount: {
    ...type.money,
    ...type.body,
    color: colors.iosLabel as string,
  },
  changeDetail: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
  },

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
  barFillPlain: {
    height: '100%',
    backgroundColor: colors.tint,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: 6,
    paddingTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
