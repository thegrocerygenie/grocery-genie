import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { strings } from '@/constants/strings';
import { borderRadius, colors, shadows, spacing, typography } from '@/constants/theme';
import { ConfirmButton } from '@/features/receipt-capture/components/ConfirmButton';
import { LineItemCard } from '@/features/receipt-capture/components/LineItemCard';
import { useReceiptConfirm } from '@/features/receipt-capture/hooks/useReceiptReview';
import { getReceipt } from '@/features/receipt-capture/services/receiptApi';
import type { EditableLineItem, LineItemCorrection } from '@/features/receipt-capture/types';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useReceiptStore } from '@/store/receiptStore';

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const { receiptId } = useLocalSearchParams<{ receiptId?: string }>();
  const { capturedImageUri, activeScanResponse, clearScanSession } = useReceiptStore();
  const confirmMutation = useReceiptConfirm();
  const analytics = useAnalytics();
  const confirmed = useRef(false);

  // Read-only mode: fetch receipt from API when navigated from history
  const isReadOnly = !!receiptId && !activeScanResponse;

  // Track receipt abandonment
  useEffect(() => {
    return () => {
      if (!confirmed.current && activeScanResponse && !isReadOnly) {
        analytics.emit('receipt_abandoned', { stage: 'review' });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: fetchedReceipt, isLoading: isFetchingReceipt } = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () => getReceipt(receiptId!),
    enabled: isReadOnly,
  });

  // Initialize form state from scan response OR fetched receipt
  const initialItems: EditableLineItem[] = useMemo(() => {
    if (activeScanResponse) {
      return (activeScanResponse.extraction.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        categoryId: item.category_id,
        extractionConfidence: item.extraction_confidence,
        isEdited: false,
      }));
    }
    if (fetchedReceipt) {
      return fetchedReceipt.items.map((item) => ({
        id: item.id,
        name: item.raw_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        categoryId: item.category_id,
        extractionConfidence: item.extraction_confidence,
        isEdited: false,
      }));
    }
    return [];
  }, [activeScanResponse, fetchedReceipt]);

  const [storeName, setStoreName] = useState(
    activeScanResponse?.extraction.store_name ?? '',
  );
  const [receiptDate, setReceiptDate] = useState(activeScanResponse?.extraction.date ?? '');
  const [items, setItems] = useState<EditableLineItem[]>(initialItems);

  // Update state when fetched receipt loads (read-only mode)
  useMemo(() => {
    if (fetchedReceipt && isReadOnly) {
      setStoreName(fetchedReceipt.store_name ?? '');
      setReceiptDate(fetchedReceipt.date);
      setItems(initialItems);
    }
  }, [fetchedReceipt, isReadOnly, initialItems]);

  const canConfirm = storeName.trim().length > 0 && items.length > 0;

  const handleItemUpdate = useCallback((itemId: string, field: string, value: string | number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, [field]: value, isEdited: true } : item,
      ),
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!activeScanResponse) return;

    // Build corrections for edited items
    const corrections: LineItemCorrection[] = items
      .filter((item) => item.isEdited)
      .map((item) => {
        const correction: LineItemCorrection = { id: item.id };
        const original = activeScanResponse.extraction.items.find((i) => i.id === item.id);
        if (original && item.name !== original.name) {
          correction.name = item.name;
        }
        if (original && item.categoryId !== original.category_id) {
          correction.category_id = item.categoryId ?? undefined;
        }
        return correction;
      });

    confirmMutation.mutate(
      {
        receiptId: activeScanResponse.receipt_id,
        updates: {
          items: corrections.length > 0 ? corrections : undefined,
          status: 'confirmed',
        },
      },
      {
        onSuccess: () => {
          confirmed.current = true;
          clearScanSession();
          router.replace('/(tabs)');
        },
        onError: (error) => {
          Alert.alert('Save Failed', error.message, [{ text: 'OK' }]);
        },
      },
    );
  }, [activeScanResponse, items, confirmMutation, clearScanSession]);

  // Loading state for read-only mode
  if (isReadOnly && isFetchingReceipt) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={colors.light.primary} />
      </View>
    );
  }

  // Guard: no scan data and no fetched receipt
  if (!activeScanResponse && !fetchedReceipt) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No receipt data. Please scan a receipt first.</Text>
      </View>
    );
  }

  const extraction = activeScanResponse?.extraction;
  const displaySubtotal = extraction?.subtotal ?? fetchedReceipt?.subtotal;
  const displayTax = extraction?.tax ?? fetchedReceipt?.tax;
  const displayTotal = extraction?.total ?? fetchedReceipt?.total;
  const imageUri = capturedImageUri ?? fetchedReceipt?.image_url;

  const renderHeader = () => (
    <View>
      {/* Receipt image */}
      {imageUri && (
        <Pressable
          style={styles.imageContainer}
          accessibilityLabel="Receipt image, tap to expand"
          accessibilityRole="image"
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="cover"
          />
        </Pressable>
      )}

      {/* Store name & date */}
      <View style={styles.headerCard}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{strings.review.storeName}</Text>
          <TextInput
            style={styles.fieldInput}
            value={storeName}
            onChangeText={setStoreName}
            placeholder="Store name"
            editable={!isReadOnly}
            accessibilityLabel={`Store name: ${storeName}`}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{strings.review.date}</Text>
          <TextInput
            style={styles.fieldInput}
            value={receiptDate}
            onChangeText={setReceiptDate}
            placeholder="YYYY-MM-DD"
            editable={!isReadOnly}
            accessibilityLabel={`Date: ${receiptDate}`}
          />
        </View>
      </View>

      {/* Items section header */}
      <Text style={styles.sectionHeader}>
        {strings.review.items} ({items.length})
      </Text>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.totalsCard}>
      {displaySubtotal != null && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{strings.review.subtotal}</Text>
          <Text style={styles.totalValue}>${displaySubtotal.toFixed(2)}</Text>
        </View>
      )}
      {displayTax != null && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{strings.review.tax}</Text>
          <Text style={styles.totalValue}>${displayTax.toFixed(2)}</Text>
        </View>
      )}
      {displayTotal != null && (
        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>{strings.review.total}</Text>
          <Text style={styles.grandTotalValue}>${displayTotal.toFixed(2)}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <LineItemCard
            item={item}
            onUpdate={isReadOnly ? () => {} : (field, value) => handleItemUpdate(item.id, field, value)}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={{ paddingBottom: isReadOnly ? 40 + insets.bottom : 100 + insets.bottom }}
      />

      {/* Sticky confirm button — only in edit mode */}
      {!isReadOnly && (
        <View style={[styles.confirmContainer, { paddingBottom: insets.bottom }]}>
          <ConfirmButton
            onPress={handleConfirm}
            disabled={!canConfirm}
            loading={confirmMutation.isPending}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.light.textSecondary,
    textAlign: 'center',
  },
  imageContainer: {
    height: 200,
    margin: spacing.base,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  headerCard: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    ...shadows.card,
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginBottom: spacing.xs,
  },
  fieldInput: {
    ...typography.body,
    color: colors.light.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
    paddingVertical: spacing.xs,
  },
  sectionHeader: {
    ...typography.sectionHeader,
    color: colors.light.textPrimary,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  totalsCard: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    ...shadows.card,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    ...typography.body,
    color: colors.light.textSecondary,
  },
  totalValue: {
    fontSize: typography.money.fontSize,
    fontWeight: typography.money.fontWeight,
    color: colors.light.textPrimary,
  },
  grandTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: 0,
  },
  grandTotalLabel: {
    ...typography.bodyBold,
    color: colors.light.textPrimary,
  },
  grandTotalValue: {
    fontSize: typography.moneyLarge.fontSize,
    fontWeight: typography.moneyLarge.fontWeight,
    color: colors.light.textPrimary,
  },
  confirmContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
