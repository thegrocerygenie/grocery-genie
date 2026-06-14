import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';

import { colors, radii, spacing, type } from '@/constants/theme';
import { resolveCategoryMeta } from '@/constants/categories';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { useReceiptConfirm } from '@/features/receipt-capture/hooks/useReceiptReview';
import { getReceipt } from '@/features/receipt-capture/services/receiptApi';
import { useCategories } from '@/features/budget/hooks/useCategories';
import { useReceiptStore } from '@/store/receiptStore';
import { useAnalytics } from '@/hooks/useAnalytics';
import type { EditableLineItem, LineItemCorrection } from '@/features/receipt-capture/types';
import type { CategoryResponse } from '@/features/budget/types';

const LOW_CONFIDENCE_THRESHOLD = 0.6;
const HIGH_VALUE_TOTAL = 500;
const HIGH_VALUE_ITEM = 100;

function formatLongDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = [
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
  return `${months[m - 1]} ${d}, ${y}`;
}

export default function ReviewScreen() {
  const router = useRouter();
  const { receiptId } = useLocalSearchParams<{ receiptId?: string }>();
  const { capturedImageUri, activeScanResponse, clearScanSession } = useReceiptStore();
  const confirmMutation = useReceiptConfirm();
  const analytics = useAnalytics();
  const { data: categories } = useCategories();
  const confirmed = useRef(false);

  const isReadOnly = !!receiptId && !activeScanResponse;

  const { data: fetchedReceipt, isLoading: isFetchingReceipt } = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () => getReceipt(receiptId!),
    enabled: isReadOnly,
  });

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

  const [storeName, setStoreName] = useState(activeScanResponse?.extraction.store_name ?? '');
  const [receiptDate, setReceiptDate] = useState(activeScanResponse?.extraction.date ?? '');
  const [items, setItems] = useState<EditableLineItem[]>(initialItems);
  const [categoryPickerItemId, setCategoryPickerItemId] = useState<string | null>(null);

  useEffect(() => {
    if (fetchedReceipt && isReadOnly) {
      setStoreName(fetchedReceipt.store_name ?? '');
      setReceiptDate(fetchedReceipt.date);
      setItems(initialItems);
    }
  }, [fetchedReceipt, isReadOnly, initialItems]);

  useEffect(() => {
    return () => {
      if (!confirmed.current && activeScanResponse && !isReadOnly) {
        analytics.emit('receipt_abandoned', { stage: 'review' });
      }
    };
  }, [activeScanResponse, isReadOnly, analytics]);

  const canConfirm = storeName.trim().length > 0 && items.length > 0;

  const updateItemPrice = (itemId: string, price: number | null) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, totalPrice: price ?? 0, isEdited: true } : item,
      ),
    );
  };

  const updateItemCategory = (itemId: string, categoryId: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, categoryId, isEdited: true } : item)),
    );
  };

  const handleSave = () => {
    if (isReadOnly) {
      router.back();
      return;
    }
    if (!activeScanResponse || !canConfirm) return;

    const corrections: LineItemCorrection[] = items
      .filter((item) => item.isEdited)
      .map((item) => {
        const correction: LineItemCorrection = { id: item.id };
        const original = activeScanResponse.extraction.items.find((i) => i.id === item.id);
        if (original && item.name !== original.name) correction.name = item.name;
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
  };

  if (isReadOnly && isFetchingReceipt) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  if (!activeScanResponse && !fetchedReceipt) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={[type.body, { color: colors.iosLabel2 as string, textAlign: 'center' }]}>
          No receipt data. Please scan a receipt first.
        </Text>
      </View>
    );
  }

  const extraction = activeScanResponse?.extraction;
  const displaySubtotal = extraction?.subtotal ?? fetchedReceipt?.subtotal ?? null;
  const displayTax = extraction?.tax ?? fetchedReceipt?.tax ?? null;
  const displayTotal = extraction?.total ?? fetchedReceipt?.total ?? null;
  const imageUri = capturedImageUri ?? fetchedReceipt?.image_url ?? null;
  const dominantCategoryId = items.find((i) => i.categoryId)?.categoryId ?? null;
  const dominantCategoryName = resolveCategoryMeta(dominantCategoryId, categories).name;

  const isHighValueReceipt =
    !isReadOnly &&
    ((displayTotal ?? 0) >= HIGH_VALUE_TOTAL ||
      items.some((it) => it.totalPrice >= HIGH_VALUE_ITEM));

  const pickerItem = items.find((i) => i.id === categoryPickerItemId) ?? null;

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          title: 'Review',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.headerBtn}>{isReadOnly ? 'Done' : 'Cancel'}</Text>
            </Pressable>
          ),
          headerRight: () =>
            isReadOnly ? null : (
              <Pressable
                onPress={handleSave}
                hitSlop={12}
                disabled={!canConfirm || confirmMutation.isPending}
              >
                {confirmMutation.isPending ? (
                  <ActivityIndicator color={colors.tint} />
                ) : (
                  <Text
                    style={[
                      styles.headerBtn,
                      { fontWeight: '600' },
                      !canConfirm && { opacity: 0.4 },
                    ]}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
            ),
        }}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 }}
      >
        {isHighValueReceipt ? (
          <View style={styles.highValueBanner}>
            <View style={styles.highValueIcon}>
              <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.footnote, { fontWeight: '600' }]}>Confirm before saving</Text>
              <Text
                style={[
                  type.caption1,
                  { color: colors.iosLabel2 as string, marginTop: 2, lineHeight: 16 },
                ]}
              >
                {(displayTotal ?? 0) >= HIGH_VALUE_TOTAL
                  ? 'This receipt is over $500.'
                  : 'One or more items are over $100.'}{' '}
                Please verify totals.
              </Text>
            </View>
          </View>
        ) : null}

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : null}

        <ListGroup>
          <ListInputRow
            label="Store"
            value={storeName}
            onChangeText={setStoreName}
            editable={!isReadOnly}
            placeholder="Store name"
          />
          <ListInputRow
            label="Date"
            value={formatLongDate(receiptDate) || receiptDate}
            onChangeText={setReceiptDate}
            editable={false}
            placeholder="YYYY-MM-DD"
          />
          <ListRow
            label="Total"
            value={displayTotal != null ? `$${displayTotal.toFixed(2)}` : '—'}
          />
          <ListRow label="Category" value={dominantCategoryName} chevron />
        </ListGroup>

        <View>
          <Text style={styles.sectionLabel}>ITEMS · {items.length}</Text>
          <View style={styles.listCard}>
            {items.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                showDivider={i > 0}
                readOnly={isReadOnly}
                categories={categories}
                onChangePrice={(p) => updateItemPrice(item.id, p)}
                onPickCategory={() => setCategoryPickerItemId(item.id)}
              />
            ))}
          </View>
        </View>

        {(displaySubtotal != null || displayTax != null) && (
          <View style={styles.listCard}>
            {displaySubtotal != null && (
              <ListRow label="Subtotal" value={`$${displaySubtotal.toFixed(2)}`} />
            )}
            {displayTax != null && <ListRow label="Tax" value={`$${displayTax.toFixed(2)}`} />}
          </View>
        )}
      </ScrollView>

      <CategoryPickerSheet
        visible={categoryPickerItemId !== null}
        itemName={pickerItem?.name}
        selectedId={pickerItem?.categoryId ?? null}
        categories={categories}
        onSelect={(cid) => {
          if (categoryPickerItemId) {
            updateItemCategory(categoryPickerItemId, cid);
          }
          setCategoryPickerItemId(null);
        }}
        onClose={() => setCategoryPickerItemId(null)}
      />
    </>
  );
}

interface ListGroupProps {
  children: React.ReactNode;
}

function ListGroup({ children }: ListGroupProps) {
  const items = React.Children.toArray(children);
  return (
    <View style={styles.listCard}>
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {c}
          {i < items.length - 1 && <View style={styles.separator} />}
        </React.Fragment>
      ))}
    </View>
  );
}

interface ListRowProps {
  label: string;
  value: string;
  chevron?: boolean;
}

function ListRow({ label, value, chevron }: ListRowProps) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[type.body, { color: colors.iosLabel2 as string }]}>{value}</Text>
        {chevron ? (
          <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3 as string} />
        ) : null}
      </View>
    </View>
  );
}

interface ListInputRowProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  editable: boolean;
  placeholder?: string;
}

function ListInputRow({ label, value, onChangeText, editable, placeholder }: ListInputRowProps) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <TextInput
        style={[type.body, styles.inputValue]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.iosLabel3 as string}
      />
    </View>
  );
}

interface ItemRowProps {
  item: EditableLineItem;
  showDivider: boolean;
  readOnly: boolean;
  categories?: CategoryResponse[];
  onChangePrice: (p: number | null) => void;
  onPickCategory: () => void;
}

function ItemRow({
  item,
  showDivider,
  readOnly,
  categories,
  onChangePrice,
  onPickCategory,
}: ItemRowProps) {
  const conf = item.extractionConfidence ?? 1;
  const lowConf = conf < LOW_CONFIDENCE_THRESHOLD;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.totalPrice.toFixed(2));
  const meta = resolveCategoryMeta(item.categoryId, categories);

  return (
    <View style={[styles.row, showDivider && styles.rowDivider]}>
      <Pressable
        onPress={onPickCategory}
        disabled={readOnly}
        style={[styles.itemDot, { backgroundColor: meta.color }]}
        accessibilityRole="button"
        accessibilityLabel={`Category ${meta.name}, tap to change`}
      >
        <SymbolView
          name={meta.symbol as Parameters<typeof SymbolView>[0]['name']}
          size={11}
          tintColor="#fff"
        />
      </Pressable>
      <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
        {item.name}
      </Text>
      {editing && !readOnly ? (
        <TextInput
          autoFocus
          keyboardType="decimal-pad"
          value={text}
          onChangeText={setText}
          onBlur={() => {
            const n = parseFloat(text);
            onChangePrice(Number.isFinite(n) ? n : null);
            setEditing(false);
          }}
          style={[
            type.body,
            { color: colors.tint, fontWeight: '600', minWidth: 70, textAlign: 'right' },
          ]}
        />
      ) : (
        <Pressable
          onPress={() => !readOnly && setEditing(true)}
          disabled={readOnly}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          {lowConf ? <Text style={styles.verifyTag}>verify</Text> : null}
          <Text
            style={[
              type.body,
              {
                fontWeight: '600',
                color: lowConf ? colors.orange : (colors.iosLabel as string),
              },
            ]}
          >
            ${item.totalPrice.toFixed(2)}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg as string },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  headerBtn: { ...type.body, color: colors.tint },

  image: {
    height: 200,
    borderRadius: radii.card,
    backgroundColor: colors.iosFill3,
  },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
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
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
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

  inputValue: {
    color: colors.iosLabel2 as string,
    flex: 1,
    textAlign: 'right',
    paddingVertical: 0,
  },

  itemDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  verifyTag: {
    ...type.caption2,
    color: colors.orange,
    fontWeight: '500',
  },

  highValueBanner: {
    backgroundColor: 'rgba(255,149,0,0.12)',
    borderRadius: radii.list,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  highValueIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
