import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ColorValue,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { BudgetRing } from '@/components/BudgetRing';
import { headerBlurFor } from '@/utils/headerBlur';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { categoryMeta } from '@/constants/categories';
import { ROLLOVER_STRINGS } from '@/features/budget/content/rollover';
import { capBreachMessage } from '@/features/budget/utils/capBreach';
import { budgetPace } from '@/features/budget/utils/pace';
import {
  periodBounds,
  periodDaysLeft,
  periodHeading,
  periodRingName,
  periodShareElapsed,
} from '@/features/budget/utils/period';
import { LoadErrorState } from '@/components/LoadErrorState';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import { useUserRefresh } from '@/hooks/useUserRefresh';
import { useBudgetCurrency } from '@/hooks/useBudgetCurrency';
import { useBudgetStore } from '@/store/budgetStore';
import { formatMoney } from '@/utils/money';
import { today } from '@/utils/today';
import type { DashboardData as ApiDashboardData } from '@/features/budget/types';

interface CategorySpend {
  id: string;
  name: string;
  symbol: string;
  color: ColorValue;
  spent: number;
  cap: number;
}

type DashboardViewState =
  | { state: 'empty' }
  | {
      state: 'on-track' | 'over';
      /** "November · day 3", or "Oct 15 – Nov 14 · day 20" for another reset day. */
      periodLabel: string;
      /** "November" or "to Nov 14", for the ring when over. */
      ringName: string;
      spent: number;
      cap: number;
      /** The part of ``cap`` that rolled over from earlier periods (Premium). */
      rolledOver: number;
      daysLeft: number;
      /** Share of the period gone, 0–1, for the pace line. */
      monthShare: number;
      categories: CategorySpend[];
    };

function adaptDashboard(api: ApiDashboardData | undefined, now: Date): DashboardViewState {
  if (!api) return { state: 'empty' };

  const hasBudget = api.overall.budget > 0;
  const hasSpending = api.overall.spent > 0 || api.categories.length > 0;

  // "Scan your first receipt" is for a new account, not a quiet month (L7).
  if (!hasBudget && !hasSpending && !api.has_receipts) return { state: 'empty' };

  // Ranked by spend, as Trend ranks them (L3).
  const categories: CategorySpend[] = [...api.categories]
    .filter((c) => c.spent > 0 || c.budget > 0)
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name))
    .map((c) => {
      // The category's own colour and icon (BC-05 AC 7); a server before
      // DA-9 sends neither, and the built-in look is matched by name.
      const meta = categoryMeta(c);
      return {
        id: c.category_id,
        name: c.name,
        symbol: meta.symbol,
        color: meta.color,
        spent: c.spent,
        cap: c.budget,
      };
    });

  // The period the server picked, by its own dates (reset day, not calendar month).
  const bounds = periodBounds(api);

  if (!hasBudget) {
    return {
      state: 'on-track',
      periodLabel: periodHeading(bounds, now),
      ringName: periodRingName(bounds),
      spent: api.overall.spent,
      cap: 0,
      rolledOver: 0,
      daysLeft: periodDaysLeft(bounds, now),
      monthShare: periodShareElapsed(bounds, now),
      categories,
    };
  }

  const over = api.overall.spent > api.overall.budget;
  return {
    state: over ? 'over' : 'on-track',
    periodLabel: periodHeading(bounds, now),
    ringName: periodRingName(bounds),
    spent: api.overall.spent,
    cap: api.overall.budget,
    rolledOver: api.overall.rolled_over ?? 0,
    daysLeft: periodDaysLeft(bounds, now),
    monthShare: periodShareElapsed(bounds, now),
    categories,
  };
}

export default function DashboardScreen() {
  const router = useRouter();
  const { selectedPeriod } = useBudgetStore();
  const { data, isLoading, isError, refetch } = useDashboardSpending(selectedPeriod);
  const pull = useUserRefresh(refetch);

  const view = useMemo(() => adaptDashboard(data, today()), [data]);

  const onScan = () => {
    Haptics.selectionAsync();
    router.push('/(tabs)/scan');
  };

  const onSetBudget = () => {
    router.push('/budget-settings');
  };

  const onSettings = () => {
    router.push('/settings');
  };

  // Rendered in every state: without it the header falls back to the route name ("index").
  const header = (
    <Stack.Screen
      options={{
        title: 'Budget',
        headerLargeTitle: true,
        headerTransparent: true,
        headerBlurEffect: headerBlurFor(Platform.Version),
        headerRight: () => (
          <Pressable
            onPress={onSettings}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <SymbolView name="gearshape.fill" size={20} tintColor={colors.tint} />
          </Pressable>
        ),
      }}
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          <ActivityIndicator color={colors.tint} />
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor={colors.tint}
          />
        }
      >
        {isError && !data ? (
          // A failed load is not an empty account: say so, and keep cached data otherwise.
          <LoadErrorState title="Couldn’t load your budget" onRetry={() => void refetch()} />
        ) : view.state === 'empty' ? (
          <EmptyState onScan={onScan} onSetBudget={onSetBudget} />
        ) : (
          <FilledState
            data={view}
            onSetBudget={onSetBudget}
            onTopItems={() => router.push('/top-items')}
            onTrend={() => router.push('/trend')}
            onPrices={() => router.push('/items')}
          />
        )}
      </ScrollView>
    </>
  );
}

interface EmptyStateProps {
  onScan: () => void;
  onSetBudget: () => void;
}

function EmptyState({ onScan, onSetBudget }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <SymbolView name="camera.viewfinder" size={28} tintColor={colors.iosLabel2} />
      </View>
      <Text style={[type.headline, { textAlign: 'center' }]}>Scan your first receipt</Text>
      <Text
        style={[type.subheadline, { color: colors.iosLabel2, textAlign: 'center', maxWidth: 240 }]}
      >
        Your budget will fill in as you snap receipts.
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          pressed && { backgroundColor: colors.tintPressed },
        ]}
        onPress={onScan}
        accessibilityRole="button"
        accessibilityLabel="Scan receipt"
      >
        <SymbolView name="camera.viewfinder" size={16} tintColor={colors.onTint} />
        <Text style={styles.primaryBtnLabel}>Scan Receipt</Text>
      </Pressable>
      <Pressable
        onPress={onSetBudget}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Set a budget"
      >
        <Text style={[type.callout, { color: colors.tint }]}>Set a budget</Text>
      </Pressable>
    </View>
  );
}

interface FilledStateProps {
  data: Extract<DashboardViewState, { state: 'on-track' | 'over' }>;
  onSetBudget: () => void;
  onTopItems: () => void;
  onTrend: () => void;
  /** PI-01: the price history of everything the user buys. */
  onPrices: () => void;
}

function FilledState({ data, onSetBudget, onTopItems, onTrend, onPrices }: FilledStateProps) {
  const currency = useBudgetCurrency();
  const whole = (amount: number) => formatMoney(amount, currency, { decimals: 0 });
  const noBudget = data.cap <= 0;
  const progress = noBudget ? 0 : data.spent / data.cap;
  const over = data.state === 'over';
  const breachMessage = capBreachMessage(data.categories, over);
  const remaining = noBudget ? 0 : Math.max(0, data.cap - data.spent);
  const overBy = data.spent - data.cap;
  const pace = budgetPace(data.spent, data.cap, data.monthShare);
  const paceAhead = !over && !!pace?.ahead;

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
      <View style={styles.heroCard}>
        {noBudget ? (
          <View style={styles.heroCtaIcon}>
            <SymbolView name="exclamationmark.triangle.fill" size={28} tintColor={colors.orange} />
          </View>
        ) : (
          <BudgetRing
            progress={progress}
            label={over ? `${Math.round(progress * 100)}%` : whole(remaining)}
            sub={over ? data.ringName : `left · ${data.daysLeft}d`}
            accessibilityLabel={
              ringAccessibilityLabel(data.spent, data.cap, data.daysLeft, currency) +
              (data.rolledOver > 0 ? ROLLOVER_STRINGS.rolledOverA11y(whole(data.rolledOver)) : '')
            }
          />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[type.caption1, { color: colors.iosLabel2 }]}>{data.periodLabel}</Text>
          {noBudget ? (
            <>
              <Text style={[type.money, { fontSize: 20, color: colors.iosLabel, marginTop: 2 }]}>
                {whole(data.spent)}
              </Text>
              <Pressable
                onPress={onSetBudget}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Set a budget"
              >
                <Text style={[type.caption1, { color: colors.tint, marginTop: 2 }]}>
                  Set a budget to track progress →
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text
                style={[
                  type.money,
                  {
                    fontSize: 20,
                    color: over ? colors.red : colors.iosLabel,
                    marginTop: 2,
                  },
                ]}
              >
                {whole(data.spent)} / {whole(data.cap)}
              </Text>
              <Text
                style={[
                  type.caption1,
                  {
                    color: over ? colors.red : paceAhead ? colors.orange : colors.tint,
                    marginTop: 2,
                  },
                ]}
              >
                {over
                  ? `Over by ${whole(overBy)} · ${data.daysLeft} days left`
                  : paceLine(pace, data.daysLeft)}
              </Text>
              {data.rolledOver > 0 ? (
                <Text style={styles.rolledOver}>
                  {ROLLOVER_STRINGS.includesRolledOver(whole(data.rolledOver))}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>

      {breachMessage && (
        // L5: it says "Adjust limits", so a tap opens Budgets.
        <Pressable
          onPress={onSetBudget}
          style={({ pressed }) => [styles.alertBanner, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={breachMessage}
          accessibilityHint="Opens Budgets"
        >
          <SymbolView name="bell.fill" size={16} tintColor={colors.red} />
          <Text style={[type.footnote, { color: colors.red, flex: 1 }]}>{breachMessage}</Text>
          <SymbolView
            name="chevron.right"
            size={12}
            tintColor={colors.red}
            style={styles.bannerChevron}
          />
        </Pressable>
      )}

      {data.categories.length > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>BY CATEGORY</Text>
            <Pressable
              onPress={onTopItems}
              hitSlop={6}
              style={styles.sectionLinkButton}
              accessibilityRole="button"
              accessibilityLabel="Top items"
            >
              <Text style={styles.sectionLink}>Top items</Text>
            </Pressable>
          </View>
          <View style={styles.listGroup}>
            {data.categories.map((c, i) => (
              <CategoryRow key={c.id} cat={c} showDivider={i > 0} />
            ))}
          </View>
        </>
      )}

      <Pressable
        onPress={onTrend}
        style={({ pressed }) => [styles.trendBtn, pressed && { backgroundColor: colors.iosFill3 }]}
        accessibilityRole="button"
        accessibilityLabel="See 3-month trend"
      >
        <SymbolView name="chart.bar.fill" size={16} tintColor={colors.tint} />
        <Text style={styles.trendLabel}>See 3-month trend</Text>
      </Pressable>

      <Pressable
        onPress={onPrices}
        style={({ pressed }) => [styles.trendBtn, pressed && styles.trendBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={PRICES_COPY.dashboardEntry}
        accessibilityHint={PRICES_COPY.dashboardEntryHint}
      >
        <SymbolView name="chart.line.uptrend.xyaxis" size={16} tintColor={colors.tint} />
        <Text style={styles.trendLabel}>{PRICES_COPY.dashboardEntry}</Text>
      </Pressable>
    </View>
  );
}

// Design 05: "On pace · 5% under", or "Ahead of pace · N% over" once spend
// outruns the month.
function paceLine(pace: ReturnType<typeof budgetPace>, daysLeft: number): string {
  if (!pace) return `On pace · ${daysLeft}d left`;
  return pace.ahead ? `Ahead of pace · ${pace.percent}% over` : `On pace · ${pace.percent}% under`;
}

function ringAccessibilityLabel(
  spent: number,
  cap: number,
  daysLeft: number,
  currency: string,
): string {
  const whole = (amount: number) => formatMoney(amount, currency, { decimals: 0 });
  const percent = Math.round((spent / cap) * 100);
  const days = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  const amount =
    spent > cap
      ? `${whole(spent - cap)} over ${whole(cap)}`
      : `${whole(cap - spent)} left of ${whole(cap)}`;
  return `${amount}, ${percent} percent, ${days}`;
}

// The design's VoiceOver line: "Groceries, $142, 82 percent of $175 budget."
function categoryAccessibilityLabel(cat: CategorySpend, currency: string): string {
  const whole = (amount: number) => formatMoney(amount, currency, { decimals: 0 });
  const amount = `${cat.name}, ${whole(cat.spent)}`;
  if (cat.cap <= 0) return amount;
  const pct = (cat.spent / cat.cap) * 100;
  const over = pct > 100 ? ', over budget' : '';
  return `${amount}, ${Math.round(pct)} percent of ${whole(cat.cap)} budget${over}`;
}

interface CategoryRowProps {
  cat: CategorySpend;
  showDivider: boolean;
}

// React Native's iOS font scale at AX1, the first accessibility text size.
const ACCESSIBILITY_FONT_SCALE = 1.7;

function CategoryRow({ cat, showDivider }: CategoryRowProps) {
  const currency = useBudgetCurrency();
  const { fontScale } = useWindowDimensions();
  const hasCap = cat.cap > 0;
  const pct = hasCap ? (cat.spent / cat.cap) * 100 : 0;
  const over = pct > 100;

  const circle = (
    <View
      testID={`category-icon-${cat.id}`}
      style={[styles.catCircle, { backgroundColor: cat.color }]}
    >
      <SymbolView
        name={cat.symbol as Parameters<typeof SymbolView>[0]['name']}
        size={14}
        tintColor="#fff"
      />
    </View>
  );
  const name = <Text style={type.headline}>{cat.name}</Text>;
  const bar = (
    <View style={styles.catBarTrack}>
      <View
        testID={`category-bar-${cat.id}`}
        style={[
          styles.catBarFill,
          {
            width: `${Math.min(hasCap ? pct : 0, 100)}%`,
            backgroundColor: over ? colors.red : cat.color,
          },
        ]}
      />
    </View>
  );
  const amount = (
    <>
      {over && (
        // Red is not the only sign of an over-cap category.
        <SymbolView name="exclamationmark.circle.fill" size={15} tintColor={colors.red} />
      )}
      <Text style={[styles.catAmount, { color: over ? colors.red : colors.iosLabel }]}>
        {formatMoney(cat.spent, currency, { decimals: 0 })}
      </Text>
    </>
  );
  const rowProps = {
    accessible: true,
    accessibilityLabel: categoryAccessibilityLabel(cat, currency),
  };
  const divider = showDivider && { borderTopWidth: StyleSheet.hairlineWidth };

  // At accessibility sizes the name, icon and amount do not fit side by side:
  // the name gets its own full-width line, where it can wrap.
  if (fontScale >= ACCESSIBILITY_FONT_SCALE) {
    return (
      <View style={[styles.catRowStacked, divider]} {...rowProps}>
        <View style={styles.catTopLine}>
          {circle}
          <View style={{ flex: 1 }} />
          {amount}
        </View>
        {name}
        {bar}
      </View>
    );
  }

  return (
    <View style={[styles.catRow, divider]} {...rowProps}>
      {circle}
      <View style={{ flex: 1 }}>
        {name}
        {bar}
      </View>
      {amount}
    </View>
  );
}

const styles = StyleSheet.create({
  rolledOver: { ...type.caption1, color: colors.iosLabel2, marginTop: 2 },
  root: { flex: 1, backgroundColor: colors.iosBg },
  center: { alignItems: 'center', justifyContent: 'center' },

  empty: {
    flex: 1,
    minHeight: 500,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    marginTop: spacing.sm,
    minHeight: touchTarget.minHeight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.tint,
    borderRadius: radii.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtnLabel: { ...type.headline, color: colors.onTint, flexShrink: 1, textAlign: 'center' },

  heroCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: 14,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 2,
  },
  heroCtaIcon: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
  },

  alertBanner: {
    minHeight: touchTarget.minHeight,
    backgroundColor: colors.redBg,
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  bannerChevron: { alignSelf: 'center' },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  // Wraps at large text, where the label and the link do not fit on one line.
  sectionHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  sectionLinkButton: { flexShrink: 1 },
  sectionLink: {
    ...type.footnote,
    color: colors.tint,
    fontWeight: '600',
  },
  trendBtnPressed: { backgroundColor: colors.iosFill3 },
  trendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: touchTarget.minHeight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.list,
    backgroundColor: colors.iosBg2,
    marginTop: spacing.sm,
  },

  trendLabel: {
    ...type.subheadline,
    color: colors.tint,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },

  listGroup: {
    backgroundColor: colors.iosBg2,
    borderRadius: 14,
    overflow: 'hidden',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopColor: colors.iosSeparator,
  },
  catRowStacked: {
    gap: spacing.sm,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopColor: colors.iosSeparator,
  },
  catTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catAmount: { ...type.money, fontSize: 15, flexShrink: 0 },
  catCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBarTrack: {
    height: 3,
    backgroundColor: colors.iosFill3,
    borderRadius: 999,
    marginTop: 4,
    overflow: 'hidden',
  },
  catBarFill: { height: '100%', borderRadius: 999 },
});
