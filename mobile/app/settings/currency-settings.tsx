import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { BUDGET_CURRENCIES } from '@/constants/currencies';
import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { useMe, useUpdatePreferences } from '@/features/auth/hooks/useAuth';
import { currencySymbol } from '@/utils/money';

// The budget currency (MVP rule, 2026-11-02): only receipts in it count
// toward budgets. It starts as the iPhone region's currency at sign-up.
export default function CurrencySettingsScreen() {
  const { data: profile } = useMe();
  const updatePreferences = useUpdatePreferences();
  const current = profile?.currency_preference ?? 'USD';

  const options = BUDGET_CURRENCIES.some((c) => c.code === current)
    ? [...BUDGET_CURRENCIES]
    : [{ code: current, name: current }, ...BUDGET_CURRENCIES];

  const choose = (code: string) => {
    if (code === current) return;
    void Haptics.selectionAsync();
    updatePreferences.mutate({ currency_preference: code });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Currency', headerBackTitle: 'Settings' }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}
      >
        <Text style={styles.intro}>
          Your budgets are in this currency. Only receipts in this currency count toward your
          budgets; receipts in other currencies stay in History, marked “Not in budget”.
        </Text>

        <View style={styles.listCard}>
          {options.map((c, i) => {
            const selected = c.code === current;
            return (
              <Pressable
                key={c.code}
                onPress={() => choose(c.code)}
                disabled={updatePreferences.isPending}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={c.name === c.code ? c.code : `${c.name}, ${c.code}`}
                accessibilityState={{ selected, disabled: updatePreferences.isPending }}
              >
                <Text style={styles.symbol} numberOfLines={1}>
                  {currencySymbol(c.code)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[type.subheadline, { fontWeight: '500' }]}>{c.name}</Text>
                  {c.name !== c.code ? (
                    <Text style={[type.caption1, { color: colors.iosLabel2 }]}>{c.code}</Text>
                  ) : null}
                </View>
                {selected ? (
                  <SymbolView name="checkmark" size={16} tintColor={colors.tint} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footer}>
          Budget amounts aren’t converted: a budget of 400 stays 400 in the new currency. Check your
          budgets after you change it.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  intro: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 4,
  },
  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: touchTarget.minHeight + 8,
  },
  rowPressed: { backgroundColor: colors.iosFill3 },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  symbol: {
    ...type.money,
    // Fits "CHF" and "MX$" on one line.
    width: 44,
    textAlign: 'center',
    color: colors.iosLabel2,
  },
  footer: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 4,
  },
});
