import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { strings } from '@/constants/strings';
import { borderRadius, colors, spacing, typography } from '@/constants/theme';
import { ReceiptHistoryItem } from '@/features/receipt-capture/components/ReceiptHistoryItem';
import { useReceipts } from '@/features/receipt-capture/hooks/useReceipts';
import type { ReceiptResponse } from '@/features/receipt-capture/types';

type DateFilter = 'thisWeek' | 'thisMonth' | 'lastMonth' | 'allTime';

const FILTER_CHIPS: { key: DateFilter; label: string }[] = [
  { key: 'allTime', label: strings.history.allTime },
  { key: 'thisWeek', label: strings.history.thisWeek },
  { key: 'thisMonth', label: strings.history.thisMonth },
  { key: 'lastMonth', label: strings.history.lastMonth },
];

function getDateRange(filter: DateFilter): { from_date?: string; to_date?: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (filter) {
    case 'thisWeek': {
      const day = now.getDay();
      const start = new Date(now);
      start.setDate(now.getDate() - day);
      return { from_date: formatISO(start) };
    }
    case 'thisMonth':
      return { from_date: `${year}-${pad(month + 1)}-01` };
    case 'lastMonth': {
      const lmYear = month === 0 ? year - 1 : year;
      const lmMonth = month === 0 ? 12 : month;
      const lastDay = new Date(year, month, 0).getDate();
      return {
        from_date: `${lmYear}-${pad(lmMonth)}-01`,
        to_date: `${lmYear}-${pad(lmMonth)}-${pad(lastDay)}`,
      };
    }
    default:
      return {};
  }
}

function formatISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export default function HistoryScreen() {
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<DateFilter>('allTime');
  const [page, setPage] = useState(1);

  const dateRange = useMemo(() => getDateRange(activeFilter), [activeFilter]);

  const queryParams = useMemo(
    () => ({
      page,
      per_page: 20,
      store: searchText.trim() || undefined,
      ...dateRange,
    }),
    [page, searchText, dateRange],
  );

  const { data, isLoading, isRefetching, refetch } = useReceipts(queryParams);

  const receipts = data?.items ?? [];

  const handleReceiptPress = useCallback((receipt: ReceiptResponse) => {
    router.push({ pathname: '/review', params: { receiptId: receipt.id } });
  }, []);

  const handleFilterChange = useCallback((filter: DateFilter) => {
    setActiveFilter(filter);
    setPage(1);
  }, []);

  const handleEndReached = useCallback(() => {
    if (data && receipts.length < data.total) {
      setPage((p) => p + 1);
    }
  }, [data, receipts.length]);

  const renderItem = useCallback(
    ({ item }: { item: ReceiptResponse }) => (
      <ReceiptHistoryItem
        storeName={item.store_name}
        date={item.date}
        total={item.total}
        itemCount={item.items.length}
        onPress={() => handleReceiptPress(item)}
      />
    ),
    [handleReceiptPress],
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🧾</Text>
        <Text style={styles.emptyText}>{strings.history.empty}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <Text style={styles.title}>{strings.history.title}</Text>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={strings.history.search}
          placeholderTextColor={colors.light.textSecondary}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
            setPage(1);
          }}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search receipts by store name"
        />
      </View>

      {/* Date filter chips */}
      <View style={styles.chipRow}>
        {FILTER_CHIPS.map((chip) => (
          <Pressable
            key={chip.key}
            style={[
              styles.chip,
              activeFilter === chip.key && styles.chipActive,
            ]}
            onPress={() => handleFilterChange(chip.key)}
            accessibilityLabel={`Filter by ${chip.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected: activeFilter === chip.key }}
          >
            <Text
              style={[
                styles.chipText,
                activeFilter === chip.key && styles.chipTextActive,
              ]}
            >
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.light.primary} />
        </View>
      )}

      {/* Receipt list */}
      {!isLoading && (
        <FlatList
          data={receipts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.light.primary}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  title: {
    ...typography.display,
    color: colors.light.textPrimary,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  searchContainer: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  searchInput: {
    ...typography.body,
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.light.textPrimary,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.light.surface,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  chipActive: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.light.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.base,
  },
  emptyText: {
    ...typography.body,
    color: colors.light.textSecondary,
    textAlign: 'center',
  },
});
