/**
 * Dashboard — Budget tab landing screen.
 *
 * Drop-in for `app/(tabs)/index.tsx`. Assumes:
 *   expo-router        — for the nav header
 *   expo-symbols       — SF Symbols on iOS
 *   expo-haptics       — haptic-led feedback
 *   react-native-svg + react-native-reanimated — for BudgetRing
 *
 * Three states are wired via the `state` prop so you can drive it from
 * your store; in production this hook reads from your receipts query.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing, type } from './theme';
import { BudgetRing } from './BudgetRing';

type CategorySpend = {
  id: string;
  name: string;
  symbol: string;       // SF Symbol name
  color: string;        // from colors.cat.*
  spent: number;
  cap: number;
};

type DashboardData =
  | { state: 'empty' }
  | {
      state: 'on-track' | 'over';
      monthLabel: string;     // "April · day 19"
      spent: number;
      cap: number;
      daysLeft: number;
      categories: CategorySpend[];
    };

export default function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();

  const onScan = () => {
    Haptics.selectionAsync();        // haptic BEFORE visual — see motion rules
    router.push('/(tabs)/scan');
  };

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
      >
        {data.state === 'empty' ? (
          <EmptyState onScan={onScan} />
        ) : (
          <FilledState data={data} />
        )}
      </ScrollView>
    </>
  );
}

// ─── States ──────────────────────────────────────────────

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <SymbolView
          name="camera.viewfinder"
          size={28}
          tintColor={colors.iosLabel2}
        />
      </View>
      <Text style={[type.headline, { textAlign: 'center' }]}>
        Scan your first receipt
      </Text>
      <Text
        style={[
          type.subheadline,
          { color: colors.iosLabel2, textAlign: 'center', maxWidth: 240 },
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
      >
        <SymbolView name="camera.viewfinder" size={16} tintColor="#fff" />
        <Text style={styles.primaryBtnLabel}>Scan Receipt</Text>
      </Pressable>
    </View>
  );
}

function FilledState({
  data,
}: {
  data: Extract<DashboardData, { state: 'on-track' | 'over' }>;
}) {
  const progress = data.spent / data.cap;
  const over = data.state === 'over';
  const remaining = Math.max(0, data.cap - data.spent);
  const overBy = data.spent - data.cap;

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
      {/* Hero summary card */}
      <View style={styles.heroCard}>
        <BudgetRing
          progress={progress}
          label={over ? `${Math.round(progress * 100)}%` : `$${Math.round(remaining)}`}
          sub={over ? data.monthLabel.split(' · ')[0] : `left · ${data.daysLeft}d`}
        />
        <View style={{ flex: 1 }}>
          <Text style={[type.caption1, { color: colors.iosLabel2 }]}>
            {data.monthLabel}
          </Text>
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
            style={[
              type.caption1,
              { color: over ? colors.red : colors.tint, marginTop: 2 },
            ]}
          >
            {over
              ? `Over by $${overBy.toFixed(0)} · ${data.daysLeft} days left`
              : 'On pace · 5% under'}
          </Text>
        </View>
      </View>

      {/* Over-budget banner */}
      {over && (
        <View style={styles.alertBanner}>
          <SymbolView name="bell.fill" size={16} tintColor={colors.red} />
          <Text style={[type.footnote, { color: colors.red, flex: 1 }]}>
            Snacks & Beverages crossed their caps. Adjust limits or pause alerts.
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>BY CATEGORY</Text>
      <View style={styles.listGroup}>
        {data.categories.map((c, i) => (
          <CategoryRow key={c.id} cat={c} showDivider={i > 0} />
        ))}
      </View>
    </View>
  );
}

// ─── Category row — Wallet-style ─────────────────────────

function CategoryRow({
  cat,
  showDivider,
}: {
  cat: CategorySpend;
  showDivider: boolean;
}) {
  const pct = (cat.spent / cat.cap) * 100;
  const over = pct > 100;
  return (
    <View
      style={[styles.catRow, showDivider && { borderTopWidth: StyleSheet.hairlineWidth }]}
    >
      <View style={[styles.catCircle, { backgroundColor: cat.color }]}>
        <SymbolView name={cat.symbol as any} size={14} tintColor="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.headline}>{cat.name}</Text>
        <View style={styles.catBarTrack}>
          <View
            style={[
              styles.catBarFill,
              {
                width: `${Math.min(pct, 100)}%`,
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
            color: over ? colors.red : colors.iosLabel,
          },
        ]}
      >
        ${cat.spent.toFixed(0)}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },

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
    color: colors.iosLabel2,
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

// ─── Sample data for tinkering ───────────────────────────
// Delete in production; replace with your real query.

export const SAMPLE_DATA: Record<string, DashboardData> = {
  empty: { state: 'empty' },
  onTrack: {
    state: 'on-track',
    monthLabel: 'April · day 19',
    spent: 242,
    cap: 400,
    daysLeft: 11,
    categories: [
      { id: 'groc', name: 'Groceries', symbol: 'cart.fill',         color: colors.cat.groceries, spent: 142, cap: 175 },
      { id: 'bev',  name: 'Beverages', symbol: 'cup.and.saucer.fill', color: colors.cat.beverages, spent: 33,  cap: 30  },
      { id: 'hh',   name: 'Household', symbol: 'house.fill',        color: colors.cat.household, spent: 27,  cap: 50  },
    ],
  },
  over: {
    state: 'over',
    monthLabel: 'April · day 28',
    spent: 432,
    cap: 400,
    daysLeft: 2,
    categories: [
      { id: 'groc',   name: 'Groceries', symbol: 'cart.fill',         color: colors.cat.groceries, spent: 214, cap: 225 },
      { id: 'bev',    name: 'Beverages', symbol: 'cup.and.saucer.fill', color: colors.cat.beverages, spent: 58,  cap: 40  },
      { id: 'snacks', name: 'Snacks',    symbol: 'birthday.cake.fill', color: colors.cat.snacks,    spent: 39,  cap: 35  },
    ],
  },
};
