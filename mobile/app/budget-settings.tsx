import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { DEFAULT_CATEGORIES, getCategoryMetaByName } from '@/constants/categories';
import {
  useBudgetCreate,
  useBudgetDelete,
  useBudgetUpdate,
  useBudgets,
} from '@/features/budget/hooks/useBudget';
import { useCategories } from '@/features/budget/hooks/useCategories';
import type { BudgetResponse } from '@/features/budget/types';

/** Amount text for an input: "200", "12.5". */
function amountText(amount: number): string {
  return String(amount);
}

function parseAmount(text: string): number {
  const value = parseFloat(text);
  return Number.isFinite(value) ? value : 0;
}

/** The start day as saved: 1 to 28, so every month has it. */
function clampedStartDay(startDay: string): number {
  return Math.min(Math.max(parseInt(startDay, 10) || 1, 1), 28);
}

/** The start date this month for a start day. */
function periodStartFor(startDay: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(clampedStartDay(startDay)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startDayOf(budget: BudgetResponse | undefined): string {
  return budget ? String(Number(budget.period_start.slice(8, 10))) : '1';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function BudgetSettingsScreen() {
  const router = useRouter();
  const { data: serverCategories } = useCategories();
  const { data: budgets } = useBudgets();
  const budgetCreate = useBudgetCreate();
  const budgetUpdate = useBudgetUpdate();
  const budgetDelete = useBudgetDelete();

  const [overall, setOverall] = useState('');
  const [startDay, setStartDay] = useState('1');
  const [catAmounts, setCatAmounts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // The saved budgets, by category id ('' = overall). Edits are compared with
  // these so Save only touches what changed (BC-02 AC 4).
  const saved = new Map((budgets ?? []).map((b) => [b.category_id ?? '', b]));
  const savedOverall = saved.get('');

  // Prefill once, when the saved budgets first arrive.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !budgets) return;
    prefilled.current = true;
    const overallBudget = budgets.find((b) => b.category_id === null);
    if (overallBudget) setOverall(amountText(overallBudget.amount));
    setStartDay(startDayOf(overallBudget));
    setCatAmounts(
      Object.fromEntries(
        budgets
          .filter((b) => b.category_id !== null)
          .map((b) => [b.category_id as string, amountText(b.amount)]),
      ),
    );
  }, [budgets]);

  const categories =
    serverCategories && serverCategories.length > 0
      ? serverCategories.map((c) => {
          // Server ids are UUIDs; display meta is keyed by the category name.
          const meta = getCategoryMetaByName(c.name);
          return {
            id: c.id,
            name: c.name,
            color: meta?.color ?? colors.cat.other,
            symbol: meta?.symbol ?? 'tag.fill',
          };
        })
      : DEFAULT_CATEGORIES.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          symbol: c.symbol,
        }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const periodStart = periodStartFor(startDay);

      // Overall: update in place. A blank field leaves it alone, because a user
      // with no monthly budget is sent back to onboarding.
      const overallAmount = parseAmount(overall);
      if (savedOverall) {
        const startChanged =
          clampedStartDay(startDay) !== clampedStartDay(startDayOf(savedOverall));
        const amount = overallAmount > 0 ? overallAmount : savedOverall.amount;
        if (amount !== savedOverall.amount || startChanged) {
          await budgetUpdate.mutateAsync({
            budgetId: savedOverall.id,
            data: startChanged ? { amount, period_start: periodStart } : { amount },
          });
        }
      } else if (overallAmount > 0) {
        await budgetCreate.mutateAsync({
          category_id: null,
          amount: overallAmount,
          period_type: 'monthly',
          period_start: periodStart,
        });
      }

      // Categories: update changed limits, delete cleared ones, create new ones.
      for (const [categoryId, text] of Object.entries(catAmounts)) {
        const amount = parseAmount(text);
        const existing = saved.get(categoryId);
        if (existing) {
          if (amount <= 0) {
            await budgetDelete.mutateAsync(existing.id);
          } else if (amount !== existing.amount) {
            await budgetUpdate.mutateAsync({ budgetId: existing.id, data: { amount } });
          }
        } else if (amount > 0) {
          await budgetCreate.mutateAsync({
            category_id: categoryId,
            amount,
            period_type: 'monthly',
            period_start: periodStart,
          });
        }
      }
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save budget. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          title: 'Budget',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.headerBtn}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleSave}
              hitSlop={12}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Save"
              accessibilityState={{ disabled: isSaving }}
            >
              <Text style={[styles.headerBtn, { fontWeight: '600' }, isSaving && { opacity: 0.4 }]}>
                Save
              </Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={{
            padding: spacing.lg,
            gap: spacing.lg,
            paddingBottom: 80,
          }}
        >
          <Section
            header="OVERALL"
            footer={`Resets on the ${ordinal(clampedStartDay(startDay))} of each month.`}
          >
            <RowAmountInput
              label="Monthly limit"
              value={overall}
              onChangeText={setOverall}
              placeholder="$0.00"
            />
            <RowNumericInput
              label="Start day"
              value={startDay}
              onChangeText={setStartDay}
              suffix={ordinal(parseInt(startDay, 10) || 1)}
            />
          </Section>

          <Section
            header="PER-CATEGORY LIMITS"
            footer="Optional. Leave blank to share the overall limit."
          >
            {categories.map((c, i) => (
              <RowCategoryInput
                key={c.id}
                cat={c}
                value={catAmounts[c.id] ?? ''}
                onChangeText={(v) => setCatAmounts((p) => ({ ...p, [c.id]: v }))}
                showDivider={i > 0}
              />
            ))}
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

interface SectionProps {
  header?: string;
  footer?: string;
  children: React.ReactNode;
}

function Section({ header, footer, children }: SectionProps) {
  const items = React.Children.toArray(children);
  return (
    <View>
      {header ? <Text style={styles.sectionLabel}>{header}</Text> : null}
      <View style={styles.listCard}>
        {items.map((c, i) => (
          <React.Fragment key={i}>
            {c}
            {i < items.length - 1 ? <View style={styles.separator} /> : null}
          </React.Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

interface RowAmountInputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}

function RowAmountInput({ label, value, onChangeText, placeholder }: RowAmountInputProps) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {value ? <Text style={[type.body, { color: colors.iosLabel as string }]}>$</Text> : null}
        <TextInput
          style={[type.body, styles.input, { color: colors.iosLabel as string }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder={placeholder ?? ''}
          placeholderTextColor={colors.iosLabel3 as string}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

interface RowNumericInputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  suffix?: string;
}

function RowNumericInput({ label, value, onChangeText, suffix }: RowNumericInputProps) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <TextInput
          style={[type.body, styles.input, { color: colors.iosLabel as string, minWidth: 30 }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={label}
        />
        {suffix ? (
          <Text style={[type.body, { color: colors.iosLabel2 as string }]}>{suffix}</Text>
        ) : null}
      </View>
    </View>
  );
}

interface RowCategoryInputProps {
  cat: { id: string; name: string; color: string; symbol: string };
  value: string;
  onChangeText: (v: string) => void;
  showDivider: boolean;
}

function RowCategoryInput({ cat, value, onChangeText, showDivider }: RowCategoryInputProps) {
  return (
    <View style={[styles.row, showDivider && styles.rowDivider]}>
      <View style={[styles.catCircle, { backgroundColor: cat.color }]}>
        <SymbolView
          name={cat.symbol as Parameters<typeof SymbolView>[0]['name']}
          size={13}
          tintColor="#fff"
        />
      </View>
      <Text style={[type.body, { flex: 1 }]}>{cat.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {value ? <Text style={[type.body, { color: colors.iosLabel2 as string }]}>$</Text> : null}
        <TextInput
          style={[type.body, styles.input, { color: colors.iosLabel2 as string, minWidth: 60 }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder="$0.00"
          placeholderTextColor={colors.iosLabel3 as string}
          accessibilityLabel={`${cat.name} budget amount`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg as string },
  headerBtn: { ...type.body, color: colors.tint },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  sectionFooter: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
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

  input: {
    paddingVertical: 0,
    textAlign: 'right',
    minWidth: 80,
  },

  catCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
