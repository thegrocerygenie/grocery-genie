import React, { useMemo, useRef, useState } from 'react';
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

import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
import { PremiumUpgradePrompt } from '@/components/PremiumUpgradePrompt';
import {
  TREND_RANGES,
  TREND_STRINGS,
  changeText,
  monthInitial,
  monthLong,
  type TrendRange,
} from '@/features/budget/content/trend';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import { isPremiumRequired } from '@/utils/premium';
import { useBudgetCurrency } from '@/hooks/useBudgetCurrency';
import { useBudgetStore } from '@/store/budgetStore';
import { headerBlurFor } from '@/utils/headerBlur';
import { formatMoney } from '@/utils/money';
import { getCategoryMetaByName } from '@/constants/categories';
import { percentChange } from '@/features/budget/utils/monthOverMonth';
import { buildTrendHighlights } from '@/features/budget/utils/trendHighlights';
import type { DashboardCategoryChange } from '@/features/budget/types';

/** Up to this many bars, each shows its amount above it. */
const AMOUNT_BARS_MAX = 3;
/** More bars than this (All over a long history) scroll sideways. */
const FITTED_BARS_MAX = 12;
/** The chart's tallest bar, in points. */
const BAR_MAX_HEIGHT = 130;

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
  // BC-04 AC 6: 3 months by default. Any other range is asked for only when
  // picked, and the server decides whether this user may see it (D11).
  const [range, setRange] = useState<TrendRange>(3);
  const { data, isLoading } = useDashboardSpending(selectedPeriod);
  const ranged = useDashboardSpending(selectedPeriod, range, { enabled: range !== 3 });
  const chartData = range === 3 ? data : ranged.data;
  const locked = range !== 3 && isPremiumRequired(ranged.error);
  const failed = range !== 3 && ranged.isError && !locked;

  const months = useMemo(() => {
    const trend = chartData?.trend ?? [];
    return (range === 'all' ? trend : trend.slice(-range)).map((m) => ({
      period: m.period,
      total: m.spent,
    }));
  }, [chartData, range]);
  const compact = months.length > AMOUNT_BARS_MAX;
  const scrolls = months.length > FITTED_BARS_MAX;

  const max = months.length > 0 ? Math.max(...months.map((m) => m.total), 1) : 1;
  const exactAvg = months.length > 0 ? months.reduce((s, m) => s + m.total, 0) / months.length : 0;
  const avg = Math.round(exactAvg);
  // AC 7: the average against the same span before, with a full window and
  // spending before it. All starts at the first receipt: nothing is before it.
  const priorChange =
    range !== 'all' && months.length === range
      ? percentChange(exactAvg, chartData?.prior_average ?? 0)
      : null;
  // AC 9: the current month is tinted; an older server sends no current_period,
  // and then the period being viewed (the last bar) is.
  const currentPeriod = data?.current_period ?? data?.period ?? '';
  const highlights = buildTrendHighlights(months, {
    change: priorChange,
    currentPeriod,
    halves: range === 'all',
  });
  const hasData = (data?.trend ?? []).length > 0;

  // BC-04 AC 2: this month vs last month, for the total and per category.
  const period = data?.period ?? '';
  const previousPeriod = data?.previous_period ?? '';
  const spentIn = (p: string) => data?.trend.find((m) => m.period === p)?.spent ?? 0;
  const current = spentIn(period);
  const totalChange = percentChange(current, spentIn(previousPeriod));
  const categoryChanges = data?.category_changes ?? [];

  const chartScroll = useRef<ScrollView>(null);

  const columns = months.map((m) => {
    const h = (m.total / max) * BAR_MAX_HEIGHT;
    return (
      <View
        key={m.period}
        style={[styles.chartCol, scrolls && styles.chartColScrolling]}
        accessible
        accessibilityLabel={TREND_STRINGS.barLabel(m.period, money(m.total))}
      >
        {/* Many amounts do not fit above narrow bars; VoiceOver reads each. */}
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
          testID={`trend-bar-${m.period}`}
          style={[
            styles.bar,
            compact && styles.barCompact,
            { height: Math.max(h, 6) },
            m.period === currentPeriod ? styles.barCurrent : styles.barPast,
          ]}
        />
        <Text
          style={styles.barLabel}
          testID={`trend-month-${m.period}`}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          maxFontSizeMultiplier={compact ? fontScale.compactChartLabelMax : undefined}
        >
          {monthInitial(m.period)}
        </Text>
      </View>
    );
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: TREND_STRINGS.title,
          // Opened from the Budget tab; otherwise iOS shows the group name "(tabs)".
          headerBackTitle: TREND_STRINGS.backTitle,
          headerLargeTitle: true,
          // iOS 26+ draws its own glass here; a blur on top hides the large title (BUG-5).
          headerBlurEffect: headerBlurFor(Platform.Version),
        }}
      />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : !hasData ? (
          <View style={styles.empty}>
            <Text style={[type.headline, styles.centered]}>{TREND_STRINGS.emptyTitle}</Text>
            <Text style={[type.footnote, styles.emptyMessage]}>{TREND_STRINGS.emptyMessage}</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              {locked ? (
                // D2, D11: a free user picking a Premium range is invited, never shown an error.
                <PremiumUpgradePrompt
                  title={TREND_STRINGS.upgradeTitle}
                  message={TREND_STRINGS.upgradeMessage}
                  upgradeLabel={TREND_STRINGS.upgradeAction}
                  onUpgrade={() => router.push('/paywall')}
                />
              ) : failed ? (
                <View style={styles.chartStatus}>
                  <Text style={[type.subheadline, styles.statusText]}>
                    {TREND_STRINGS.loadError}
                  </Text>
                  <Pressable
                    style={styles.retry}
                    onPress={() => void ranged.refetch()}
                    accessibilityRole="button"
                    accessibilityLabel={TREND_STRINGS.retryLabel}
                  >
                    <Text style={styles.retryLabel}>{TREND_STRINGS.retry}</Text>
                  </Pressable>
                </View>
              ) : !chartData ? (
                <View style={styles.chartStatus}>
                  <ActivityIndicator color={colors.tint} />
                </View>
              ) : (
                <>
                  <View style={styles.averageRow} testID="trend-average-row">
                    <View
                      accessible
                      accessibilityLabel={TREND_STRINGS.averageLabel(months.length, money(avg))}
                    >
                      <Text style={styles.caption}>{TREND_STRINGS.average(months.length)}</Text>
                      <Text style={styles.average} numberOfLines={1} adjustsFontSizeToFit>
                        {money(avg)}
                      </Text>
                    </View>
                    {priorChange !== null && range !== 'all' ? (
                      <Text
                        style={[styles.priorChange, { color: changeColor(priorChange) }]}
                        accessibilityLabel={TREND_STRINGS.versusPriorLabel(priorChange, range)}
                      >
                        {TREND_STRINGS.versusPrior(priorChange, range)}
                      </Text>
                    ) : null}
                  </View>
                  {/* Columns stretch to one height and grow with the text: a
                      fixed height made big labels overflow up over the summary
                      (BUG-1), and bottom-aligned columns of unequal height made
                      VoiceOver read the tallest bar first (BUG-8). */}
                  {scrolls ? (
                    <ScrollView
                      horizontal
                      ref={chartScroll}
                      showsHorizontalScrollIndicator={false}
                      onContentSizeChange={() =>
                        chartScroll.current?.scrollToEnd({ animated: false })
                      }
                    >
                      <View style={[styles.chart, styles.chartCompact]} testID="trend-chart">
                        {columns}
                      </View>
                    </ScrollView>
                  ) : (
                    <View
                      style={[styles.chart, compact && styles.chartCompact]}
                      testID="trend-chart"
                    >
                      {columns}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* AC 6: the range chips, under the chart. */}
            <View
              style={styles.ranges}
              testID="trend-ranges"
              accessibilityLabel={TREND_STRINGS.rangesLabel}
            >
              {TREND_RANGES.map((r) => {
                const isSelected = r.value === range;
                return (
                  <Pressable
                    key={r.chip}
                    testID={`trend-range-${r.value}`}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setRange(r.value)}
                    accessibilityRole="button"
                    accessibilityLabel={r.label}
                    accessibilityHint={TREND_STRINGS.rangeHint(r.label)}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {r.chip}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* AC 8: Highlights, for a range on screen. */}
            {!locked && !failed && chartData && highlights.highest ? (
              <>
                <Text style={styles.sectionLabel} accessibilityRole="header">
                  {TREND_STRINGS.highlightsHeader}
                </Text>
                <View style={styles.listCard}>
                  <HighlightRow
                    symbol="arrow.up"
                    iconColor={colors.red}
                    title={TREND_STRINGS.highest}
                    detail={monthLong(highlights.highest.period)}
                    value={money(highlights.highest.total)}
                    label={TREND_STRINGS.highestLabel(
                      monthLong(highlights.highest.period),
                      money(highlights.highest.total),
                    )}
                  />
                  <HighlightRow
                    divider
                    symbol="arrow.down"
                    iconColor={colors.green}
                    title={TREND_STRINGS.lowest}
                    detail={
                      highlights.lowest
                        ? monthLong(highlights.lowest.period)
                        : TREND_STRINGS.noLowest
                    }
                    value={highlights.lowest ? money(highlights.lowest.total) : null}
                    label={
                      highlights.lowest
                        ? TREND_STRINGS.lowestLabel(
                            monthLong(highlights.lowest.period),
                            money(highlights.lowest.total),
                          )
                        : TREND_STRINGS.noLowestLabel
                    }
                  />
                  <HighlightRow
                    divider
                    symbol="chart.line.uptrend.xyaxis"
                    iconColor={colors.blue}
                    title={TREND_STRINGS.trend}
                    detail={
                      highlights.trend
                        ? TREND_STRINGS[highlights.trend.direction]
                        : TREND_STRINGS.noTrend
                    }
                    value={highlights.trend ? changeText(highlights.trend.change) : null}
                    valueColor={highlights.trend ? changeColor(highlights.trend.change) : undefined}
                    label={TREND_STRINGS.trendLabel(
                      highlights.trend
                        ? TREND_STRINGS[highlights.trend.direction]
                        : TREND_STRINGS.noTrend,
                      highlights.trend?.change ?? null,
                    )}
                  />
                </View>
              </>
            ) : null}

            {/* BC-04 AC 2: this month against the month before. */}
            <Text style={styles.sectionLabel}>
              {TREND_STRINGS.byCategoryHeader(previousPeriod)}
            </Text>
            <View style={styles.listCard}>
              <View
                style={styles.totalRow}
                testID="trend-total-row"
                accessible
                accessibilityLabel={TREND_STRINGS.monthSpendingLabel(period, money(current))}
              >
                <Text style={[type.headline, styles.flexText]}>
                  {TREND_STRINGS.monthSpending(period)}
                </Text>
                <Text style={styles.changeAmount}>{money(current)}</Text>
              </View>
              {totalChange !== null ? (
                <Text
                  style={[styles.totalChange, { color: changeColor(totalChange) }]}
                  accessibilityLabel={TREND_STRINGS.totalChangeLabel(totalChange, previousPeriod)}
                >
                  {TREND_STRINGS.totalChange(totalChange, previousPeriod)}
                </Text>
              ) : null}
              {categoryChanges.map((c) => (
                <CategoryChangeRow key={c.category_id} change={c} previousPeriod={previousPeriod} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

interface HighlightRowProps {
  symbol: string;
  iconColor: ColorValue;
  title: string;
  detail: string;
  value: string | null;
  valueColor?: ColorValue;
  label: string;
  divider?: boolean;
}

/** One Highlights row, read by VoiceOver as one element (AC 8). */
function HighlightRow({
  symbol,
  iconColor,
  title,
  detail,
  value,
  valueColor,
  label,
  divider = false,
}: HighlightRowProps) {
  return (
    <View
      style={[styles.highlightRow, divider && styles.divider]}
      accessible
      accessibilityLabel={label}
    >
      <View style={[styles.iconSquare, { backgroundColor: iconColor }]}>
        <SymbolView
          name={symbol as Parameters<typeof SymbolView>[0]['name']}
          size={13}
          tintColor={colors.onIconSquare}
        />
      </View>
      <Text style={[type.body, styles.flexText]}>{title}</Text>
      <View style={styles.highlightValues}>
        <Text style={styles.changeDetail}>{detail}</Text>
        {value !== null ? (
          <Text style={[styles.changeAmount, valueColor ? { color: valueColor } : null]}>
            {value}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface CategoryChangeRowProps {
  change: DashboardCategoryChange;
  previousPeriod: string;
}

function CategoryChangeRow({ change, previousPeriod }: CategoryChangeRowProps) {
  const currency = useBudgetCurrency();
  const money = (amount: number) => formatMoney(amount, currency, { decimals: 0 });
  const meta = getCategoryMetaByName(change.name);
  const pct = percentChange(change.spent, change.previous_spent);
  const detail =
    pct === null
      ? TREND_STRINGS.newThisMonth
      : TREND_STRINGS.categoryDetail(pct, money(change.previous_spent), previousPeriod);
  const label =
    pct === null
      ? TREND_STRINGS.categoryNewLabel(change.name, money(change.spent))
      : TREND_STRINGS.categoryLabel(
          change.name,
          money(change.spent),
          money(change.previous_spent),
          previousPeriod,
          pct,
        );

  return (
    <View style={[styles.legendRow, styles.divider]} accessible accessibilityLabel={label}>
      <View style={[styles.categoryIcon, { backgroundColor: meta.color }]}>
        <SymbolView
          name={meta.symbol as Parameters<typeof SymbolView>[0]['name']}
          size={13}
          tintColor={colors.onIconSquare}
        />
      </View>
      <Text style={[type.body, styles.flexText]}>{change.name}</Text>
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
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
  loading: { paddingTop: 80, alignItems: 'center' },
  centered: { textAlign: 'center' },
  flexText: { flex: 1, minWidth: 120 },

  caption: {
    ...type.caption1,
    color: colors.iosLabel2,
  },
  averageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: spacing.sm,
  },
  average: {
    ...type.money,
    fontSize: 28,
    color: colors.iosLabel,
  },
  priorChange: {
    ...type.footnote,
    fontWeight: '600',
    paddingBottom: 4,
  },
  totalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.sm,
    paddingHorizontal: 14,
    paddingTop: 11,
    minHeight: touchTarget.minHeight,
  },
  totalChange: {
    ...type.footnote,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingBottom: 11,
  },
  changeValues: {
    alignItems: 'flex-end',
  },
  highlightValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    columnGap: spacing.sm,
    flexShrink: 1,
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
  chartColScrolling: {
    flex: 0,
    width: 20,
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
    borderRadius: 6,
  },
  barCompact: {
    width: '100%',
    maxWidth: 20,
    borderRadius: 4,
  },
  barPast: {
    backgroundColor: colors.iosFill2,
  },
  barCurrent: {
    backgroundColor: colors.tint,
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

  ranges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: 2,
    borderRadius: 9,
    backgroundColor: colors.iosFill3,
  },
  chip: {
    minHeight: touchTarget.minHeight,
    minWidth: touchTarget.minHeight,
    paddingHorizontal: spacing.md,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.iosBg2,
  },
  chipText: {
    ...type.footnote,
    color: colors.iosLabel,
  },
  chipTextSelected: {
    fontWeight: '600',
  },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },

  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  highlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: touchTarget.minHeight,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: touchTarget.minHeight,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  iconSquare: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIcon: {
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
  emptyMessage: {
    color: colors.iosLabel2,
    textAlign: 'center',
    maxWidth: 240,
  },
});
