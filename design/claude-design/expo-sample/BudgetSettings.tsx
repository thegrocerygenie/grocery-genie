/**
 * BudgetSettings — Edit overall + per-category limits.
 *
 * Drop-in for `app/budget-settings.tsx`. Modal presentation.
 * - Uses inset-grouped lists with section headers + footers
 * - Inline price-edit pattern matches Review.tsx
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, type, radii, spacing } from './theme';

type CatLimit = {
  id: keyof typeof colors.cat;
  name: string;
  symbol: string;
  cap: number;
};

const SAMPLE_CATS: CatLimit[] = [
  { id: 'groceries',    name: 'Groceries', symbol: 'cart.fill',         cap: 175 },
  { id: 'household',    name: 'Household', symbol: 'house.fill',        cap: 50  },
  { id: 'beverages',    name: 'Beverages', symbol: 'cup.and.saucer.fill', cap: 30 },
  { id: 'snacks',       name: 'Snacks',    symbol: 'birthday.cake.fill', cap: 25 },
];

export default function BudgetSettings() {
  const router = useRouter();
  const [overall, setOverall] = useState(400);
  const [startDay, setStartDay] = useState(1);
  const [cats, setCats] = useState<CatLimit[]>(SAMPLE_CATS);

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          title: 'Budget',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.headerBtn}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={[styles.headerBtn, { fontWeight: '600' }]}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 }}
      >
        <Section header="OVERALL" footer="Resets on the 1st of each month.">
          <RowNav
            label="Monthly limit"
            value={`$${overall.toFixed(2)}`}
            onPress={() => {}}
          />
          <RowNav
            label="Start day"
            value={`${ordinal(startDay)}`}
            onPress={() => {}}
          />
        </Section>

        <Section header="PER-CATEGORY LIMITS">
          {cats.map((c, i) => (
            <RowCategory key={c.id} cat={c} showDivider={i > 0} onPress={() => {}} />
          ))}
        </Section>
      </ScrollView>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function Section({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <View>
      {header && <Text style={styles.sectionLabel}>{header}</Text>}
      <View style={styles.listCard}>
        {items.map((c, i) => (
          <React.Fragment key={i}>
            {c}
            {i < items.length - 1 && <View style={styles.separator} />}
          </React.Fragment>
        ))}
      </View>
      {footer && <Text style={styles.sectionFooter}>{footer}</Text>}
    </View>
  );
}

function RowNav({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[type.body, { color: colors.iosLabel2 }]}>{value}</Text>
        <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
      </View>
    </Pressable>
  );
}

function RowCategory({
  cat,
  showDivider,
  onPress,
}: {
  cat: CatLimit;
  showDivider: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, showDivider && styles.rowDivider]}>
      <View style={[styles.catCircle, { backgroundColor: colors.cat[cat.id] }]}>
        <SymbolView name={cat.symbol as any} size={13} tintColor="#fff" />
      </View>
      <Text style={[type.body, { flex: 1 }]}>{cat.name}</Text>
      <Text style={[type.body, { color: colors.iosLabel2 }]}>${cat.cap}</Text>
      <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  headerBtn: { ...type.body, color: colors.tint },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  sectionFooter: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },
  catCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
