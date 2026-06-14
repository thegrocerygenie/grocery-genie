import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

import { colors, radii, spacing, type } from '@/constants/theme';
import { resolveCategoryMeta } from '@/constants/categories';
import { CaptureActionSheet } from '@/components/CaptureActionSheet';
import { useReceipts } from '@/features/receipt-capture/hooks/useReceipts';
import { useCategories } from '@/features/budget/hooks/useCategories';
import { useDeleteReceipt } from '@/features/lifecycle/hooks/useLifecycle';
import type { ReceiptResponse } from '@/features/receipt-capture/types';
import type { CategoryResponse } from '@/features/budget/types';

type FilterIndex = 0 | 1 | 2;

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getDateRange(filter: FilterIndex): { from_date?: string; to_date?: string } {
  const now = new Date();
  if (filter === 0) {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    return { from_date: formatISO(start) };
  }
  if (filter === 1) {
    return { from_date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01` };
  }
  return {};
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

interface ReceiptRowProps {
  receipt: ReceiptResponse;
  showDivider: boolean;
  categories?: CategoryResponse[];
  onPress: () => void;
  onDelete: () => void;
}

function ReceiptRow({ receipt, showDivider, categories, onPress, onDelete }: ReceiptRowProps) {
  const firstCategory = receipt.items.find((item) => item.category_id)?.category_id ?? null;
  const meta = resolveCategoryMeta(firstCategory, categories);
  const pendingSync = receipt.status === 'pending';
  const itemCount = receipt.items.length;
  const total = receipt.total ?? 0;
  const sub = pendingSync
    ? 'Pending sync'
    : `${formatShortDate(receipt.date)} · ${itemCount} items`;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onDelete}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.row,
        showDivider && styles.rowDivider,
        pressed && { backgroundColor: colors.iosFill3 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${receipt.store_name ?? 'Receipt'}, ${sub}, $${total.toFixed(2)}. Long press to delete.`}
    >
      <View style={[styles.catCircle, { backgroundColor: meta.color }]}>
        <SymbolView
          name={meta.symbol as Parameters<typeof SymbolView>[0]['name']}
          size={14}
          tintColor="#fff"
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.headline} numberOfLines={1}>
          {receipt.store_name ?? 'Unknown store'}
        </Text>
        <Text
          style={[
            type.caption1,
            {
              color: pendingSync ? colors.orange : (colors.iosLabel2 as string),
              marginTop: 1,
            },
          ]}
        >
          {sub}
        </Text>
      </View>
      <Text style={[type.money, { fontSize: 15 }]}>${total.toFixed(2)}</Text>
      <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3 as string} />
    </Pressable>
  );
}

interface EmptyStateProps {
  hasQuery: boolean;
}

function EmptyState({ hasQuery }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <SymbolView
          name={hasQuery ? 'magnifyingglass' : 'clock.fill'}
          size={26}
          tintColor={colors.iosLabel2 as string}
        />
      </View>
      <Text style={type.headline}>{hasQuery ? 'No matches' : 'No receipts yet'}</Text>
      <Text
        style={[
          type.footnote,
          {
            color: colors.iosLabel2 as string,
            textAlign: 'center',
            maxWidth: 220,
            lineHeight: 19,
          },
        ]}
      >
        {hasQuery ? 'Try a different store name.' : 'Scanned receipts appear here, sorted by date.'}
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterIndex>(1);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const deleteReceipt = useDeleteReceipt();

  const onDelete = (id: string, label: string) => {
    Alert.alert(
      'Delete receipt?',
      `${label} will be moved to Recently Deleted (30 days to restore).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteReceipt.mutateAsync(id);
          },
        },
      ],
    );
  };

  const dateRange = useMemo(() => getDateRange(filter), [filter]);
  const queryParams = useMemo(
    () => ({
      page,
      per_page: 20,
      store: search.trim() || undefined,
      ...dateRange,
    }),
    [page, search, dateRange],
  );

  const { data, isLoading, isRefetching, refetch } = useReceipts(queryParams);
  const { data: categories } = useCategories();
  const receipts = data?.items ?? [];

  const handleEndReached = () => {
    if (data && receipts.length < data.total) {
      setPage((p) => p + 1);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'History',
          headerLargeTitle: true,
          headerTransparent: true,
          headerBlurEffect: 'systemChromeMaterial',
          headerSearchBarOptions: {
            placeholder: 'Search by store',
            onChangeText: (e) => {
              setSearch(e.nativeEvent.text);
              setPage(1);
            },
          },
          headerRight: () => (
            <Pressable
              onPress={() => setActionSheetOpen(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Add receipt"
            >
              <SymbolView name="plus" size={20} tintColor={colors.tint} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        data={receipts}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <SegmentedControl
              values={['Week', 'Month', 'All']}
              selectedIndex={filter}
              onChange={(e) => {
                setFilter(e.nativeEvent.selectedSegmentIndex as FilterIndex);
                setPage(1);
              }}
            />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : (
            <EmptyState hasQuery={!!search.trim()} />
          )
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.listCard,
              index === 0 && styles.listCardFirst,
              index === receipts.length - 1 && styles.listCardLast,
            ]}
          >
            <ReceiptRow
              receipt={item}
              showDivider={index > 0}
              categories={categories}
              onPress={() => router.push({ pathname: '/review', params: { receiptId: item.id } })}
              onDelete={() => onDelete(item.id, item.store_name ?? 'Receipt')}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
      />

      <CaptureActionSheet
        visible={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        onTakePhoto={() => router.push('/(tabs)/scan')}
        onChooseFromLibrary={() =>
          Alert.alert('Coming soon', 'Photo library import is on the roadmap.')
        }
        onChooseFiles={() => Alert.alert('Coming soon', 'File import is on the roadmap.')}
        onManualEntry={() => router.push('/manual-entry')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg as string },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  listCard: {
    backgroundColor: colors.iosBg2,
    overflow: 'hidden',
  },
  listCardFirst: {
    borderTopLeftRadius: radii.list,
    borderTopRightRadius: radii.list,
  },
  listCardLast: {
    borderBottomLeftRadius: radii.list,
    borderBottomRightRadius: radii.list,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  catCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    minHeight: 480,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  loading: {
    paddingTop: 80,
    alignItems: 'center',
  },
});
