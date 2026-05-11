import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import {
  useRecentlyDeletedBudgets,
  useRecentlyDeletedReceipts,
  useRestoreBudget,
  useRestoreReceipt,
} from '@/features/lifecycle/hooks/useLifecycle';
import type { DeletedItem } from '@/features/lifecycle/hooks/useLifecycle';

export default function RecentlyDeletedScreen() {
  const router = useRouter();
  const receipts = useRecentlyDeletedReceipts();
  const budgets = useRecentlyDeletedBudgets();
  const restoreReceipt = useRestoreReceipt();
  const restoreBudget = useRestoreBudget();

  const isLoading = receipts.isLoading || budgets.isLoading;
  const all: DeletedItem[] = [...(receipts.data ?? []), ...(budgets.data ?? [])].sort((a, b) =>
    b.deleted_at > a.deleted_at ? 1 : -1,
  );

  const onRestore = (item: DeletedItem) => {
    if (item.type === 'receipt') {
      void restoreReceipt.mutateAsync(item.id);
    } else {
      void restoreBudget.mutateAsync(item.id);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          title: 'Recently Deleted',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.headerBtn}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 80 }}
      >
        <Text style={styles.intro}>
          Items removed in the last 30 days. After 30 days they&apos;re permanently deleted.
        </Text>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : all.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <SymbolView name="trash" size={26} tintColor={colors.iosLabel2 as string} />
            </View>
            <Text style={type.headline}>Nothing recently deleted</Text>
            <Text
              style={[
                type.footnote,
                { color: colors.iosLabel2 as string, textAlign: 'center', maxWidth: 240 },
              ]}
            >
              Receipts and budgets you delete will appear here for 30 days.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {all.map((item, i) => (
              <View key={`${item.type}-${item.id}`} style={[styles.row, i > 0 && styles.divider]}>
                <View style={[styles.iconSquare, { backgroundColor: colors.iosFill1 }]}>
                  <SymbolView
                    name={item.type === 'receipt' ? 'doc.fill' : 'cart.fill'}
                    size={14}
                    tintColor="#fff"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.body} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={[type.caption1, { color: colors.iosLabel2 as string }]}>
                    {item.days_remaining}d left to restore
                  </Text>
                </View>
                <Pressable
                  onPress={() => onRestore(item)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${item.label}`}
                >
                  <Text style={[type.body, { color: colors.tint, fontWeight: '600' }]}>
                    Restore
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  headerBtn: { ...type.body, color: colors.tint, fontWeight: '600' },
  intro: { ...type.footnote, color: colors.iosLabel2 as string, paddingHorizontal: 4 },
  center: { paddingTop: 80, alignItems: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: 80 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 44,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  iconSquare: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
