import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

import { colors, radii, spacing, type } from '@/constants/theme';
import { resolveCategoryMeta } from '@/constants/categories';
import { CaptureActionSheet } from '@/components/CaptureActionSheet';
import { LoadErrorState } from '@/components/LoadErrorState';
import { headerBlurFor } from '@/utils/headerBlur';
import { ImportProgressOverlay } from '@/features/receipt-capture/components/ImportProgressOverlay';
import { OfflineQueueSection } from '@/features/receipt-capture/components/OfflineQueueSection';
import { deletePendingImage } from '@/features/receipt-capture/services/pendingImageFiles';
import { useUserRefresh } from '@/hooks/useUserRefresh';
import { confirmDeleteReceipt } from '@/features/lifecycle/utils/confirmDeleteReceipt';
import { useReceiptImport } from '@/features/receipt-capture/hooks/useReceiptImport';
import { useReceipts } from '@/features/receipt-capture/hooks/useReceipts';
import { useCategories } from '@/features/budget/hooks/useCategories';
import { useDeleteReceipt } from '@/features/lifecycle/hooks/useLifecycle';
import type { ReceiptResponse } from '@/features/receipt-capture/types';
import { QUOTA_HINT, QUOTA_MESSAGE } from '@/features/receipt-capture/utils/scanQuota';
import type { CategoryResponse } from '@/features/budget/types';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useSyncNow } from '@/hooks/useSyncQueue';
import { useAiConsentGate, useAiConsentStatus } from '@/features/ai-consent/hooks/useAiConsent';
import { useOfflineStore, type PendingReceipt } from '@/store/offlineStore';
import { useAuthStore } from '@/store/authStore';
import { tokenSubject } from '@/features/auth/utils/tokenSubject';

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
  // A scan the user has not confirmed yet; tapping it opens review to confirm.
  const needsReview = receipt.status === 'pending_review';
  const itemCount = receipt.items.length;
  const total = receipt.total ?? 0;
  const sub = needsReview
    ? 'Needs review'
    : `${formatShortDate(receipt.date)} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
  const label = receipt.store_name ?? 'Receipt';

  // L6: swipe left for Delete, as in Mail. Long-press still works, and
  // VoiceOver offers Delete as a row action.
  const renderDeleteAction = () => (
    <Pressable
      onPress={onDelete}
      style={({ pressed }) => [styles.swipeDelete, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`Delete ${label}`}
    >
      <SymbolView name="trash.fill" size={18} tintColor="#fff" />
      <Text style={styles.swipeDeleteLabel}>Delete</Text>
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderDeleteAction}
      rightThreshold={40}
      overshootRight={false}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onDelete}
        delayLongPress={400}
        // The divider stays on this plain view: the swipeable's container is
        // animated, and Reanimated can't take the adaptive separator color.
        style={({ pressed }) => [
          styles.row,
          showDivider && styles.rowDivider,
          pressed && { backgroundColor: colors.iosFill3 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${sub}, $${total.toFixed(2)}`}
        accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'delete') onDelete();
        }}
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
                color: needsReview ? colors.orange : colors.iosLabel2,
                marginTop: 1,
              },
            ]}
          >
            {sub}
          </Text>
        </View>
        <Text style={[type.money, { fontSize: 15 }]}>${total.toFixed(2)}</Text>
        <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
      </Pressable>
    </ReanimatedSwipeable>
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
          tintColor={colors.iosLabel2}
        />
      </View>
      <Text style={type.headline}>{hasQuery ? 'No matches' : 'No receipts yet'}</Text>
      <Text
        style={[
          type.footnote,
          {
            color: colors.iosLabel2,
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
  const receiptImport = useReceiptImport();
  const deleteReceipt = useDeleteReceipt();
  const { isConnected } = useNetworkStatus();
  const syncNow = useSyncNow();
  const aiConsent = useAiConsentStatus();
  const { askForConsent } = useAiConsentGate();
  const ownerId = tokenSubject(useAuthStore((s) => s.accessToken));
  const allPending = useOfflineStore((s) => s.pendingReceipts);
  // The queue is device-wide; show only what this user captured.
  const pendingReceipts = useMemo(
    () => allPending.filter((r) => r.ownerId === ownerId),
    [allPending, ownerId],
  );
  const removePendingReceipt = useOfflineStore((s) => s.removePendingReceipt);

  const dropPending = (receipt: PendingReceipt) => {
    removePendingReceipt(receipt.id);
    deletePendingImage(receipt.imageUri);
  };

  const onPressFailed = (receipt: PendingReceipt) => {
    const [title, message] =
      receipt.failure === 'quota'
        ? [QUOTA_HINT, QUOTA_MESSAGE]
        : [
            'Couldn’t read this receipt',
            'The photo may be blurry or not a receipt. Enter it by hand or discard the photo.',
          ];
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Enter manually',
        onPress: () => {
          dropPending(receipt);
          router.push('/manual-entry');
        },
      },
      { text: 'Discard', style: 'destructive', onPress: () => dropPending(receipt) },
    ]);
  };

  const onDelete = (id: string, label: string) =>
    confirmDeleteReceipt(label, () => {
      void deleteReceipt.mutateAsync(id);
    });

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

  const { data, isLoading, isError, refetch } = useReceipts(queryParams);
  const pull = useUserRefresh(refetch);
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
          headerBlurEffect: headerBlurFor(Platform.Version),
          headerSearchBarOptions: {
            placeholder: 'Search by store',
            // Keep the field under the title. iOS 26+ otherwise moves it to the
            // bottom toolbar, where the floating tab bar covers it.
            placement: 'stacked',
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
          <View>
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
            <OfflineQueueSection
              pending={pendingReceipts}
              isConnected={isConnected}
              consentNeeded={
                aiConsent === false ||
                (aiConsent === undefined && pendingReceipts.some((r) => r.needsConsent))
              }
              onPressFailed={onPressFailed}
              onRetry={() => void syncNow()}
              onReviewConsent={() => void askForConsent()}
            />
            {pendingReceipts.length > 0 && receipts.length > 0 ? (
              <Text style={styles.sectionLabel}>Synced</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : isError ? (
            // A failed load is not an empty history; the list is empty only without data.
            <LoadErrorState title="Couldn’t load your receipts" onRetry={() => void refetch()} />
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
              onPress={() =>
                // An unconfirmed scan opens review to confirm it; a saved receipt
                // opens its read-only detail (design: RC-04 · Receipt detail).
                item.status === 'pending_review'
                  ? router.push({ pathname: '/review', params: { receiptId: item.id } })
                  : router.push({ pathname: '/receipt/[id]', params: { id: item.id } })
              }
              onDelete={() => onDelete(item.id, item.store_name ?? 'Receipt')}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor={colors.tint}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
      />

      <CaptureActionSheet
        visible={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        onTakePhoto={() => router.push('/(tabs)/scan')}
        onChooseFromLibrary={() => receiptImport.importFrom('library')}
        onChooseFiles={() => receiptImport.importFrom('files')}
        onManualEntry={() => router.push('/manual-entry')}
      />
      <ImportProgressOverlay
        visible={receiptImport.progress !== null}
        previewUri={receiptImport.progress?.previewUri ?? null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
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
    // Opaque, so the swipe's Delete stays hidden until the row slides.
    backgroundColor: colors.iosBg2,
  },
  swipeDelete: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.red,
  },
  swipeDeleteLabel: { ...type.caption1, color: '#fff', fontWeight: '600' },
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
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingBottom: 6,
  },
  loading: {
    paddingTop: 80,
    alignItems: 'center',
  },
});
