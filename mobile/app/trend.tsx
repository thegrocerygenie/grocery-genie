import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
import { PremiumUpgradePrompt } from '@/components/PremiumUpgradePrompt';
import { TREND_STRINGS } from '@/features/budget/content/trend';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import type { TrendMonths } from '@/features/budget/services/budgetApi';
import { isPremiumRequired } from '@/utils/premium';
import { useBudgetCurrency } from '@/hooks/useBudgetCurrency';
import { useBudgetStore } from '@/store/budgetStore';
import { headerBlurFor } from '@/utils/headerBlur';
import { formatMoney } from '@/utils/money';
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
function changeColor(change: number): ColorValue {
  if (change > 0) return colors.red;
  if (change < 0) return colors.tint;
  return colors.iosLabel2;
}

export default function TrendScreen() {
  const router = useRouter();
  const { selectedPeriod } = useBudgetStore();
  const currency = useBudgetCurrency();
  const money = (amount: number) => formatMoney(amount, currency, { decimals: 0 });
  // V1.1: 3 months by default; 12 is Premium (D2) and asked for only when picked.
  const [trendMonths, setTrendMonths] = useState<TrendMonths>(3);
  const { data, isLoading } = useDashboardSpending(selectedPeriod);
  const yearly = useDashboardSpending(selectedPeriod, 12, { enabled: trendMonths === 12 });
  const chartData = trendMonths === 12 ? yearly.data : data;
  const compact = trendMonths === 12;

  const breakdown = useMemo(
    () => buildTrendBreakdown((chartData?.trend ?? []).slice(-trendMonths)),
    [chartData, trendMonths],
  );
  const months = useMemo(
    () =>
      breakdown.months.map((m) => ({
        period: m.period,
        // Twelve bars leave room for one letter each; VoiceOver reads the full name.
        label: compact ? periodLabel(m.period).charAt(0) : periodLabel(m.period),
        total: m.total,
        segments: m.segments,
      })),
    [breakdown, compact],
  );

  const max = months.length > 0 ? Math.max(...months.map((m) => m.total), 1) : 1;
  const exactAvg = months.length > 0 ? months.reduce((s, m) => s + m.total, 0) / months.length : 0;
  const avg = Math.round(exactAvg);
  // Design "3-month trend": the average against the same span before. Only with
  // a full window and spending before it; a percentage of nothing means nothing.
  const priorChange =
    months.length === trendMonths ? percentChange(exactAvg, chartData?.prior_average ?? 0) : null;
  const hasData = (data?.trend ?? []).length > 0;

  // BC-04 AC 2: this month vs last month, for the total and per category.
  const period = data?.period ?? '';
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
          // iOS 26+ draws its own glass here; a blur on top hides the large title (BUG-5).
          headerBlurEffect: headerBlurFor(Platform.Version),
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
        ) : !hasData ? (
          <View style={styles.empty}>
            <Text style={[type.headline, { textAlign: 'center' }]}>Not enough data yet</Text>
            <Text
              style={[
                type.footnote,
                { color: colors.iosLabel2, textAlign: 'center', maxWidth: 240 },
              ]}
            >
              Once you have receipts across multiple months, your trend will show here.
            </Text>
          </View>
        ) : (
          <>
            <SegmentedControl
              values={[...TREND_STRINGS.monthsOptions]}
              selectedIndex={trendMonths === 12 ? 1 : 0}
              onChange={(e) => setTrendMonths(e.nativeEvent.selectedSegmentIndex === 1 ? 12 : 3)}
              accessibilityLabel={TREND_STRINGS.monthsControlLabel}
              style={styles.segmented}
            />
            <View style={styles.summaryCard}>
              <Text style={styles.caption}>{monthName(period)} spending</Text>
              <View style={styles.totalRow} testID="trend-total-row">
                <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                  {money(current)}
                </Text>
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
              {compact && isPremiumRequired(yearly.error) ? (
                // D2: a free user asking for 12 months is invited, never shown an error.
                <PremiumUpgradePrompt
                  title={TREND_STRINGS.upgradeTitle}
                  message={TREND_STRINGS.upgradeMessage}
                  upgradeLabel={TREND_STRINGS.upgradeAction}
                  onUpgrade={() => router.push('/paywall')}
                />
              ) : compact && yearly.isError ? (
                <View style={styles.chartStatus}>
                  <Text style={[type.subheadline, styles.statusText]}>
                    {TREND_STRINGS.loadErrorTwelve}
                  </Text>
                  <Pressable
                    style={styles.retry}
                    onPress={() => void yearly.refetch()}
                    accessibilityRole="button"
                    accessibilityLabel={TREND_STRINGS.retryLabel}
                  >
                    <Text style={styles.retryLabel}>{TREND_STRINGS.retry}</Text>
                  </Pressable>
                </View>
              ) : compact && !yearly.data ? (
                <View style={styles.chartStatus}>
                  <ActivityIndicator color={colors.tint} />
                </View>
              ) : (
                <>
                  <View style={styles.averageRow}>
                    <Text style={styles.caption}>
                      {`${TREND_STRINGS.average(months.length)} ${money(avg)}`}
                    </Text>
                    {priorChange !== null ? (
                      <Text
                        style={[styles.priorChange, { color: changeColor(priorChange) }]}
                        accessibilityLabel={
                          priorChange === 0
                            ? TREND_STRINGS.samePrior(trendMonths)
                            : `${changeWords(priorChange).replace(/^./, (c) => c.toUpperCase())} ${TREND_STRINGS.fromPrior(trendMonths)}`
                        }
                      >
                        {`${changeText(priorChange)} ${TREND_STRINGS.versusPrior(trendMonths)}`}
                      </Text>
                    ) : null}
                  </View>
                  {/* Columns stretch to one height and grow with the text: a
                      fixed height made big labels overflow up over the summary
                      (BUG-1), and bottom-aligned columns of unequal height made
                      VoiceOver read the tallest bar first (BUG-8). */}
                  <View style={[styles.chart, compact && styles.chartCompact]} testID="trend-chart">
                    {months.map((m) => {
                      const h = (m.total / max) * 130;
                      return (
                        <View
                          key={m.period}
                          style={styles.chartCol}
                          accessible
                          accessibilityLabel={`${monthName(m.period)}: ${money(m.total)}`}
                        >
                          {/* Twelve amounts do not fit above narrow bars; VoiceOver reads each. */}
                          {compact ? null : (
                            <Text
                              style={styles.barValue}
                              testID={`trend-amount-${m.period}`}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.5}
                            >
                              {money(m.total)}
                            </Text>
                          )}
                          <View
                            style={[
                              styles.bar,
                              compact && styles.barCompact,
                              { height: Math.max(h, 6) },
                            ]}
                          >
                            <StackedFill period={m.period} total={m.total} segments={m.segments} />
                          </View>
                          <Text
                            style={styles.barLabel}
                            testID={`trend-month-${m.period}`}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.5}
                            maxFontSizeMultiplier={
                              compact ? fontScale.compactChartLabelMax : undefined
                            }
                          >
                            {m.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
              {(!compact || yearly.data) && breakdown.categories.length > 0 ? (
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
  const currency = useBudgetCurrency();
  const money = (amount: number) => formatMoney(amount, currency, { decimals: 0 });
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
    color: colors.iosLabel2,
  },
  totalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.sm,
  },
  total: {
    ...type.money,
    fontSize: 28,
    color: colors.iosLabel,
  },
  averageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 6,
  },
  priorChange: {
    ...type.caption1,
    fontWeight: '600',
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
    color: colors.iosLabel,
  },
  changeDetail: {
    ...type.footnote,
    color: colors.iosLabel2,
  },

  summaryCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: 14,
    padding: spacing.lg,
    gap: 6,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 18,
    minHeight: 170,
    paddingTop: spacing.lg,
  },
  chartCompact: {
    // Twelve bars across an iPhone SE card (about 290pt): ~20pt each.
    gap: spacing.xs,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-end',
  },
  barValue: {
    ...type.caption1,
    fontWeight: '600',
    color: colors.iosLabel,
  },
  barLabel: {
    ...type.caption1,
    color: colors.iosLabel2,
  },
  bar: {
    width: 36,
    backgroundColor: colors.iosFill3,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barCompact: {
    width: '100%',
    maxWidth: 20,
    borderRadius: 4,
  },
  segmented: {
    height: touchTarget.minHeight,
  },
  chartStatus: {
    minHeight: 170,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  statusText: {
    color: colors.iosLabel2,
    textAlign: 'center',
  },
  retry: {
    ...touchTarget,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryLabel: {
    ...type.headline,
    color: colors.tint,
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
    color: colors.iosLabel2,
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
