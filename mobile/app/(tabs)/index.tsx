import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { BudgetRing } from '@/components/BudgetRing';
import { colors, radii, spacing, type } from '@/constants/theme';
import { getCategoryMeta } from '@/constants/categories';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import { useBudgetStore } from '@/store/budgetStore';
import type { DashboardData as ApiDashboardData } from '@/features/budget/types';

interface CategorySpend {
  id: string;
  name: string;
  symbol: string;
  color: string;
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

  if (!hasBudget && !hasSpending) return { state: 'empty' };

  const categories: CategorySpend[] = api.categories
    .filter((c) => c.spent > 0 || c.budget > 0)
    .map((c) => {
      const meta = getCategoryMeta(c.category_id);
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
  const { data, isLoading, refetch, isRefetching } = useDashboardSpending(selectedPeriod);

  const view = useMemo(() => adaptDashboard(data, selectedPeriod), [data, selectedPeriod]);

  const onScan = () => {
    Haptics.selectionAsync();
    router.push('/(tabs)/scan');
  };

  const onSetBudget = () => {
    router.push('/budget-settings');
  };

  if (isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Budget',
          headerLargeTitle: true,
          headerTransparent: true,
          headerBlurEffect: 'systemChromeMaterial',
        }}
      />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />
        }
      >
        {view.state === 'empty' ? (
          <EmptyState onScan={onScan} onSetBudget={onSetBudget} />
        ) : (
          <FilledState data={view} onSetBudget={onSetBudget} />
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
        <SymbolView
          name="camera.viewfinder"
          size={28}
          tintColor={colors.iosLabel2 as string}
        />
      </View>
      <Text style={[type.headline, { textAlign: 'center' }]}>
        Scan your first receipt
      </Text>
      <Text
        style={[
          type.subheadline,
          { color: colors.iosLabel2 as string, textAlign: 'center', maxWidth: 240 },
        ]}
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
        <SymbolView name="camera.viewfinder" size={16} tintColor="#fff" />
        <Text style={styles.primaryBtnLabel}>Scan Receipt</Text>
      </Pressable>
      <Pressable onPress={onSetBudget} hitSlop={8} accessibilityRole="button">
        <Text style={[type.callout, { color: colors.tint }]}>Set a budget</Text>
      </Pressable>
    </View>
  );
}

interface FilledStateProps {
  data: Extract<DashboardViewState, { state: 'on-track' | 'over' }>;
  onSetBudget: () => void;
}

function FilledState({ data, onSetBudget }: FilledStateProps) {
  const noBudget = data.cap <= 0;
  const progress = noBudget ? 0 : data.spent / data.cap;
  const over = data.state === 'over';
  const remaining = noBudget ? 0 : Math.max(0, data.cap - data.spent);
  const overBy = data.spent - data.cap;

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
      <View style={styles.heroCard}>
        {noBudget ? (
          <View style={styles.heroCtaIcon}>
            <SymbolView
              name="exclamationmark.triangle.fill"
              size={28}
              tintColor={colors.orange}
            />
          </View>
        ) : (
          <BudgetRing
            progress={progress}
            label={over ? `${Math.round(progress * 100)}%` : `$${Math.round(remaining)}`}
            sub={over ? data.monthLabel.split(' · ')[0] : `left · ${data.daysLeft}d`}
          />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[type.caption1, { color: colors.iosLabel2 as string }]}>
            {data.monthLabel}
          </Text>
          {noBudget ? (
            <>
              <Text
                style={[
                  type.money,
                  { fontSize: 20, color: colors.iosLabel as string, marginTop: 2 },
                ]}
              >
                ${data.spent.toFixed(0)}
              </Text>
              <Pressable onPress={onSetBudget} hitSlop={8}>
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
                    color: over ? colors.red : (colors.iosLabel as string),
                    marginTop: 2,
                  },
                ]}
              >
                ${data.spent.toFixed(0)} / ${data.cap.toFixed(0)}
              </Text>
              <Text
                style={[
                  type.caption1,
                  { color: over ? colors.red : colors.tint, marginTop: 2 },
                ]}
              >
                {over
                  ? `Over by $${overBy.toFixed(0)} · ${data.daysLeft} days left`
                  : `On pace · ${data.daysLeft}d left`}
              </Text>
            </>
          )}
        </View>
      </View>

      {over && (
        <View style={styles.alertBanner}>
          <SymbolView name="bell.fill" size={16} tintColor={colors.red} />
          <Text style={[type.footnote, { color: colors.red, flex: 1 }]}>
            Some categories crossed their caps. Adjust limits or pause alerts.
          </Text>
        </View>
      )}

      {data.categories.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>BY CATEGORY</Text>
          <View style={styles.listGroup}>
            {data.categories.map((c, i) => (
              <CategoryRow key={c.id} cat={c} showDivider={i > 0} />
            ))}
          </View>
        </>
      )}
    </View>
  );
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
      <Text
        style={[
          type.money,
          {
            fontSize: 15,
            color: over ? colors.red : (colors.iosLabel as string),
          },
        ]}
      >
        ${cat.spent.toFixed(0)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg as string },
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
  primaryBtnLabel: { color: '#fff', ...type.headline },

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
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
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
