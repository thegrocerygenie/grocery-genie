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
  type ColorValue,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { BudgetRing } from '@/components/BudgetRing';
import { headerBlurFor } from '@/utils/headerBlur';
import { colors, radii, spacing, type } from '@/constants/theme';
import { getCategoryMetaByName } from '@/constants/categories';
import { capBreachMessage } from '@/features/budget/utils/capBreach';
import { LoadErrorState } from '@/components/LoadErrorState';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import { useUserRefresh } from '@/hooks/useUserRefresh';
import { useBudgetStore } from '@/store/budgetStore';
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
      monthLabel: string;
      spent: number;
      cap: number;
      daysLeft: number;
      categories: CategorySpend[];
    };

const MONTH_LABELS = [
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

function buildMonthLabel(period: string): string {
  const [yearStr, monthStr] = period.split('-');
  const monthIndex = Number(monthStr) - 1;
  const today = new Date();
  const isCurrentPeriod =
    today.getFullYear() === Number(yearStr) && today.getMonth() === monthIndex;
  const monthName = MONTH_LABELS[monthIndex] ?? '';
  return isCurrentPeriod ? `${monthName} · day ${today.getDate()}` : monthName;
}

function computeDaysLeft(period: string): number {
  const now = new Date();
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return Math.max(0, lastDay - now.getDate());
}

function adaptDashboard(api: ApiDashboardData | undefined, period: string): DashboardViewState {
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
      // category_id is a backend UUID; resolve display meta by the category
      // name that the API returns alongside it (matches DEFAULT_CATEGORIES).
      const meta = getCategoryMetaByName(c.name);
      return {
        id: c.category_id,
        name: c.name,
        symbol: meta.symbol,
        color: meta.color,
        spent: c.spent,
        cap: c.budget,
      };
    });

  if (!hasBudget) {
    return {
      state: 'on-track',
      monthLabel: buildMonthLabel(period),
      spent: api.overall.spent,
      cap: 0,
      daysLeft: computeDaysLeft(period),
      categories,
    };
  }

  const over = api.overall.spent > api.overall.budget;
  return {
    state: over ? 'over' : 'on-track',
    monthLabel: buildMonthLabel(period),
    spent: api.overall.spent,
    cap: api.overall.budget,
    daysLeft: computeDaysLeft(period),
    categories,
  };
}

export default function DashboardScreen() {
  const router = useRouter();
  const { selectedPeriod } = useBudgetStore();
  const { data, isLoading, isError, refetch } = useDashboardSpending(selectedPeriod);
  const pull = useUserRefresh(refetch);

  const view = useMemo(() => adaptDashboard(data, selectedPeriod), [data, selectedPeriod]);

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
}

function FilledState({ data, onSetBudget, onTopItems, onTrend }: FilledStateProps) {
  const noBudget = data.cap <= 0;
  const progress = noBudget ? 0 : data.spent / data.cap;
  const over = data.state === 'over';
  const breachMessage = capBreachMessage(data.categories, over);
  const remaining = noBudget ? 0 : Math.max(0, data.cap - data.spent);
  const overBy = data.spent - data.cap;

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
            label={over ? `${Math.round(progress * 100)}%` : `$${Math.round(remaining)}`}
            sub={over ? data.monthLabel.split(' · ')[0] : `left · ${data.daysLeft}d`}
            accessibilityLabel={ringAccessibilityLabel(data.spent, data.cap, data.daysLeft)}
          />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[type.caption1, { color: colors.iosLabel2 }]}>{data.monthLabel}</Text>
          {noBudget ? (
            <>
              <Text style={[type.money, { fontSize: 20, color: colors.iosLabel, marginTop: 2 }]}>
                ${data.spent.toFixed(0)}
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
                ${data.spent.toFixed(0)} / ${data.cap.toFixed(0)}
              </Text>
              <Text
                style={[type.caption1, { color: over ? colors.red : colors.tint, marginTop: 2 }]}
              >
                {over
                  ? `Over by $${overBy.toFixed(0)} · ${data.daysLeft} days left`
                  : `On pace · ${data.daysLeft}d left`}
              </Text>
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
        <Text style={[type.subheadline, { color: colors.tint, fontWeight: '600' }]}>
          See 3-month trend
        </Text>
      </Pressable>
    </View>
  );
}

function ringAccessibilityLabel(spent: number, cap: number, daysLeft: number): string {
  const percent = Math.round((spent / cap) * 100);
  const days = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  const amount =
    spent > cap
      ? `$${Math.round(spent - cap)} over $${Math.round(cap)}`
      : `$${Math.round(cap - spent)} left of $${Math.round(cap)}`;
  return `${amount}, ${percent} percent, ${days}`;
}

// The design's VoiceOver line: "Groceries, $142, 82 percent of $175 budget."
function categoryAccessibilityLabel(cat: CategorySpend): string {
  const amount = `${cat.name}, $${cat.spent.toFixed(0)}`;
  if (cat.cap <= 0) return amount;
  const pct = (cat.spent / cat.cap) * 100;
  const over = pct > 100 ? ', over budget' : '';
  return `${amount}, ${Math.round(pct)} percent of $${cat.cap.toFixed(0)} budget${over}`;
}

interface CategoryRowProps {
  cat: CategorySpend;
  showDivider: boolean;
}

function CategoryRow({ cat, showDivider }: CategoryRowProps) {
  const hasCap = cat.cap > 0;
  const pct = hasCap ? (cat.spent / cat.cap) * 100 : 0;
  const over = pct > 100;

  return (
    <View
      style={[styles.catRow, showDivider && { borderTopWidth: StyleSheet.hairlineWidth }]}
      accessible
      accessibilityLabel={categoryAccessibilityLabel(cat)}
    >
      <View style={[styles.catCircle, { backgroundColor: cat.color }]}>
        <SymbolView
          name={cat.symbol as Parameters<typeof SymbolView>[0]['name']}
          size={14}
          tintColor="#fff"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.headline}>{cat.name}</Text>
        <View style={styles.catBarTrack}>
          <View
            style={[
              styles.catBarFill,
              {
                width: `${Math.min(hasCap ? pct : 0, 100)}%`,
                backgroundColor: over ? colors.red : cat.color,
              },
            ]}
          />
        </View>
      </View>
      {over && (
        // Red is not the only sign of an over-cap category.
        <SymbolView name="exclamationmark.circle.fill" size={15} tintColor={colors.red} />
      )}
      <Text
        style={[
          type.money,
          {
            fontSize: 15,
            color: over ? colors.red : colors.iosLabel,
          },
        ]}
      >
        ${cat.spent.toFixed(0)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    height: 44,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.tint,
    borderRadius: radii.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtnLabel: { ...type.headline, color: colors.onTint },

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
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  sectionLink: {
    ...type.footnote,
    color: colors.tint,
    fontWeight: '600',
  },
  trendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radii.list,
    backgroundColor: colors.iosBg2,
    marginTop: spacing.sm,
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
