import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { resolveCategoryMeta } from '@/constants/categories';
import { colors, radii, spacing, type } from '@/constants/theme';
import { useCategories } from '@/features/budget/hooks/useCategories';
import { getReceipt } from '@/features/receipt-capture/services/receiptApi';
import { formatLongDate } from '@/features/receipt-capture/utils/receiptDate';
import { receiptImageSource } from '@/features/receipt-capture/utils/receiptImageSource';
import { API_BASE_URL, getAuthHeaders } from '@/services/api';

function money(amount: number | null): string {
  return amount === null ? '—' : `$${amount.toFixed(2)}`;
}

/**
 * Design "RC-04 · Receipt detail": a saved receipt, read-only, with its photo
 * (RC-04 AC 3). Edit opens Review to correct it.
 */
export default function ReceiptDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: categories } = useCategories();
  const { data: receipt, isLoading } = useQuery({
    queryKey: ['receipt', id],
    queryFn: () => getReceipt(id),
    enabled: !!id,
  });

  const onEdit = () => router.push({ pathname: '/review', params: { receiptId: id, edit: '1' } });

  const header = (
    <Stack.Screen
      options={{
        title: receipt?.store_name ?? 'Receipt',
        headerBackTitle: 'History',
        headerRight: () =>
          receipt ? (
            <Pressable
              onPress={onEdit}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Edit receipt"
            >
              <Text style={styles.headerBtn}>Edit</Text>
            </Pressable>
          ) : null,
      }}
    />
  );

  if (isLoading || !receipt) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          {isLoading ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <Text style={styles.muted}>This receipt could not be loaded.</Text>
          )}
        </View>
      </>
    );
  }

  const photo = receiptImageSource(receipt.image_url, API_BASE_URL, getAuthHeaders());
  const categoryId = receipt.items.find((i) => i.category_id)?.category_id ?? null;
  const category = resolveCategoryMeta(categoryId, categories).name;
  const rows: [string, string][] = [
    ['Store', receipt.store_name ?? 'Unknown store'],
    ['Date', formatLongDate(receipt.date)],
    ['Total', money(receipt.total)],
    ['Category', category],
  ];
  if (receipt.subtotal !== null || receipt.tax !== null) {
    rows.push(['Subtotal · Tax', `${money(receipt.subtotal)} · ${money(receipt.tax)}`]);
  }

  return (
    <>
      {header}
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {photo ? (
          <View style={styles.photoCard}>
            <Image
              source={photo}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel="Receipt photo"
            />
          </View>
        ) : null}

        <View style={styles.listCard}>
          {rows.map(([label, value], i) => (
            <View key={label} style={[styles.row, i > 0 && styles.rowDivider]}>
              <Text style={type.body}>{label}</Text>
              <Text style={styles.value} numberOfLines={1}>
                {value}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Items · {receipt.items.length}</Text>
        <View style={styles.listCard}>
          {receipt.items.map((item, i) => (
            <View key={item.id} style={[styles.row, i > 0 && styles.rowDivider]}>
              <Text style={[type.body, styles.itemName]} numberOfLines={1}>
                {item.quantity === 1 ? item.raw_name : `${item.raw_name} × ${item.quantity}`}
              </Text>
              <Text style={styles.itemPrice}>{money(item.total_price)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  headerBtn: { ...type.body, color: colors.tint },
  muted: { ...type.footnote, color: colors.iosLabel2 as string },
  photoCard: {
    alignSelf: 'center',
    width: '78%',
    borderRadius: 12,
    backgroundColor: colors.iosBg2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12 },
  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    minHeight: 44,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  value: { ...type.body, color: colors.iosLabel2 as string, flexShrink: 1, textAlign: 'right' },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
  },
  itemName: { flex: 1 },
  itemPrice: { ...type.money, fontSize: 15 },
});
