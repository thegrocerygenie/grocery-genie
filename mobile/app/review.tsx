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
  useColorScheme,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';

import { TINT_HEX, colors, radii, spacing, type } from '@/constants/theme';
import { resolveCategoryMeta } from '@/constants/categories';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { useReceiptConfirm } from '@/features/receipt-capture/hooks/useReceiptReview';
import { getReceipt } from '@/features/receipt-capture/services/receiptApi';
import { useCategories } from '@/features/budget/hooks/useCategories';
import { useReceiptStore } from '@/store/receiptStore';
import { useAnalytics } from '@/hooks/useAnalytics';
import { buildReceiptUpdate } from '@/features/receipt-capture/utils/buildReceiptUpdate';
import { isLowConfidence } from '@/features/receipt-capture/utils/confidence';
import { extractionFromReceipt } from '@/features/receipt-capture/utils/extractionFromReceipt';
import {
  fromIsoDate,
  latestReceiptDate,
  toIsoDate,
  formatLongDate,
} from '@/features/receipt-capture/utils/receiptDate';
import { receiptImageSource } from '@/features/receipt-capture/utils/receiptImageSource';
import { API_BASE_URL, getAuthHeaders } from '@/services/api';
import type { EditableLineItem } from '@/features/receipt-capture/types';
import type { CategoryResponse } from '@/features/budget/types';

const HIGH_VALUE_TOTAL = 500;
const HIGH_VALUE_ITEM = 100;

export default function ReviewScreen() {
  const router = useRouter();
  const { receiptId, edit } = useLocalSearchParams<{ receiptId?: string; edit?: string }>();
  const { capturedImageUri, activeScanResponse, clearScanSession } = useReceiptStore();
  const confirmMutation = useReceiptConfirm();
  const analytics = useAnalytics();
  const { data: categories } = useCategories();
  const confirmed = useRef(false);

  // Opened from History: a stored receipt. One the user has not confirmed
  // yet (pending_review) stays editable, and Save confirms it.
  const isFromHistory = !!receiptId && !activeScanResponse;

  const { data: fetchedReceipt, isLoading: isFetchingReceipt } = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () => getReceipt(receiptId!),
    enabled: isFromHistory,
  });

  // A confirmed receipt is read-only, unless its detail screen opened it to edit.
  const alreadyConfirmed = isFromHistory && fetchedReceipt?.status === 'confirmed';
  const isReadOnly = isFromHistory && fetchedReceipt?.status !== 'pending_review' && edit !== '1';
  const editingReceiptId = activeScanResponse?.receipt_id ?? fetchedReceipt?.id;

  // What edits are compared against: the scan's extraction, or the stored receipt.
  const baseline = useMemo(
    () =>
      activeScanResponse?.extraction ??
      (fetchedReceipt ? extractionFromReceipt(fetchedReceipt) : null),
    [activeScanResponse, fetchedReceipt],
  );

  const initialItems: EditableLineItem[] = useMemo(
    () =>
      (baseline?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        categoryId: item.category_id,
        categoryConfidence: item.category_confidence,
        extractionConfidence: item.extraction_confidence,
        isEdited: false,
      })),
    [baseline],
  );

  const [storeName, setStoreName] = useState(activeScanResponse?.extraction.store_name ?? '');
  const [receiptDate, setReceiptDate] = useState(activeScanResponse?.extraction.date ?? '');
  const [items, setItems] = useState<EditableLineItem[]>(initialItems);
  const [categoryPickerItemId, setCategoryPickerItemId] = useState<string | null>(null);

  useEffect(() => {
    if (fetchedReceipt && isFromHistory) {
      setStoreName(fetchedReceipt.store_name ?? '');
      setReceiptDate(fetchedReceipt.date);
      setItems(initialItems);
    }
  }, [fetchedReceipt, isFromHistory, initialItems]);

  useEffect(() => {
    return () => {
      if (!confirmed.current && activeScanResponse && !isReadOnly) {
        analytics.emit('receipt_abandoned', { stage: 'review' });
      }
    };
  }, [activeScanResponse, isReadOnly, analytics]);

  const canConfirm = storeName.trim().length > 0 && items.length > 0;

  const updateItemName = (itemId: string, name: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId && item.name !== name ? { ...item, name, isEdited: true } : item,
      ),
    );
  };

  const updateItemPrice = (itemId: string, price: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId && item.totalPrice !== price
          ? { ...item, totalPrice: price, isEdited: true }
          : item,
      ),
    );
  };

  // The line total is what was paid, so a quantity edit keeps it and
  // recomputes the unit price (as the API does).
  const updateItemQuantity = (itemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId && item.quantity !== quantity
          ? {
              ...item,
              quantity,
              unitPrice: Math.round((item.totalPrice / quantity) * 100) / 100,
              isEdited: true,
            }
          : item,
      ),
    );
  };

  const updateItemCategory = (itemId: string, categoryId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, categoryId, categoryConfidence: 1, isEdited: true } : item,
      ),
    );
  };

  const handleSave = () => {
    if (isReadOnly) {
      router.back();
      return;
    }
    if (!baseline || !editingReceiptId || !canConfirm) return;

    confirmMutation.mutate(
      {
        receiptId: editingReceiptId,
        updates: buildReceiptUpdate(baseline, items, storeName, receiptDate, {
          confirm: !alreadyConfirmed,
        }),
      },
      {
        onSuccess: () => {
          confirmed.current = true;
          if (activeScanResponse) {
            clearScanSession();
            router.replace('/(tabs)');
          } else {
            router.back();
          }
        },
        onError: (error) => {
          Alert.alert('Save Failed', error.message, [{ text: 'OK' }]);
        },
      },
    );
  };

  if (isFromHistory && isFetchingReceipt) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  if (!activeScanResponse && !fetchedReceipt) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={[type.body, { color: colors.iosLabel2, textAlign: 'center' }]}>
          No receipt data. Please scan a receipt first.
        </Text>
      </View>
    );
  }

  const extraction = activeScanResponse?.extraction;
  // Subtotal and total are not edited; like the API, they move by what the
  // user's price edits changed.
  const baselinePrices = new Map((baseline?.items ?? []).map((i) => [i.id, i.total_price]));
  const priceDelta = items.reduce(
    (sum, item) => sum + item.totalPrice - (baselinePrices.get(item.id) ?? item.totalPrice),
    0,
  );
  const withPriceDelta = (amount: number | null) =>
    amount == null ? null : Math.round((amount + priceDelta) * 100) / 100;
  const displaySubtotal = withPriceDelta(extraction?.subtotal ?? fetchedReceipt?.subtotal ?? null);
  const displayTax = extraction?.tax ?? fetchedReceipt?.tax ?? null;
  const displayTotal = withPriceDelta(extraction?.total ?? fetchedReceipt?.total ?? null);
  const imageSource = receiptImageSource(
    capturedImageUri ?? fetchedReceipt?.image_url,
    API_BASE_URL,
    getAuthHeaders(),
  );
  const dominantCategoryId = items.find((i) => i.categoryId)?.categoryId ?? null;
  // RC-02 AC 2: store, date and total each carry their own read confidence.
  const lowStoreConf = isLowConfidence(baseline?.store_name_confidence);
  const lowDateConf = isLowConfidence(baseline?.date_confidence);
  const lowTotalConf = isLowConfidence(baseline?.total_confidence);
  const dominantCategoryName = resolveCategoryMeta(dominantCategoryId, categories).name;

  const isHighValueReceipt =
    !isReadOnly &&
    ((displayTotal ?? 0) >= HIGH_VALUE_TOTAL ||
      items.some((it) => it.totalPrice >= HIGH_VALUE_ITEM));

  // Edge case 4: warn before saving a receipt that looks already scanned.
  const isLikelyDuplicate = !isReadOnly && !!activeScanResponse?.duplicate_warning;

  const pickerItem = items.find((i) => i.id === categoryPickerItemId) ?? null;

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          // L4: editing a saved receipt says so; a scan being checked is a Review.
          title: edit === '1' ? 'Edit Receipt' : 'Review',
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
                accessibilityRole="button"
                accessibilityLabel="Save"
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
        {isLikelyDuplicate ? (
          <View style={styles.highValueBanner}>
            <View style={styles.highValueIcon}>
              <SymbolView name="doc.on.doc.fill" size={14} tintColor="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.footnote, { fontWeight: '600' }]}>Possible duplicate</Text>
              <Text
                style={[type.caption1, { color: colors.iosLabel2, marginTop: 2, lineHeight: 16 }]}
              >
                You scanned a receipt from this store with the same date and total in the last 24
                hours. Save only if this is a different purchase.
              </Text>
            </View>
          </View>
        ) : null}

        {isHighValueReceipt ? (
          <View style={styles.highValueBanner}>
            <View style={styles.highValueIcon}>
              <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.footnote, { fontWeight: '600' }]}>Confirm before saving</Text>
              <Text
                style={[type.caption1, { color: colors.iosLabel2, marginTop: 2, lineHeight: 16 }]}
              >
                {(displayTotal ?? 0) >= HIGH_VALUE_TOTAL
                  ? 'This receipt is over $500.'
                  : 'One or more items are over $100.'}{' '}
                Please verify totals.
              </Text>
            </View>
          </View>
        ) : null}

        {imageSource ? (
          <Image source={imageSource} style={styles.image} resizeMode="cover" />
        ) : null}

        <ListGroup>
          <ListInputRow
            label="Store"
            value={storeName}
            onChangeText={setStoreName}
            editable={!isReadOnly}
            placeholder="Store name"
            lowConfidence={lowStoreConf}
          />
          {isReadOnly ? (
            <ListRow
              label="Date"
              value={formatLongDate(receiptDate) || receiptDate}
              lowConfidence={lowDateConf}
            />
          ) : (
            <ListDateRow
              label="Date"
              value={receiptDate}
              onChange={setReceiptDate}
              lowConfidence={lowDateConf}
            />
          )}
          <ListRow
            label="Total"
            value={displayTotal != null ? `$${displayTotal.toFixed(2)}` : '—'}
            lowConfidence={lowTotalConf}
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
                onChangeName={(n) => updateItemName(item.id, n)}
                onChangePrice={(p) => updateItemPrice(item.id, p)}
                onChangeQuantity={(q) => updateItemQuantity(item.id, q)}
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

const LOW_CONFIDENCE_HINT = 'Low confidence, please verify';

/** RC-02 AC 2: the amber tag beside a value read with low confidence. */
function VerifyTag() {
  return <Text style={styles.verifyTag}>verify</Text>;
}

interface ListRowProps {
  label: string;
  value: string;
  chevron?: boolean;
  lowConfidence?: boolean;
}

function ListRow({ label, value, chevron, lowConfidence }: ListRowProps) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}, ${value}${lowConfidence ? ', low confidence' : ''}`}
    >
      <Text style={type.body}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {lowConfidence ? <VerifyTag /> : null}
        <Text
          style={[
            type.body,
            { color: colors.iosLabel2 },
            lowConfidence && styles.lowConfidenceValue,
          ]}
        >
          {value}
        </Text>
        {chevron ? (
          <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
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
  lowConfidence?: boolean;
}

function ListInputRow({
  label,
  value,
  onChangeText,
  editable,
  placeholder,
  lowConfidence,
}: ListInputRowProps) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      {lowConfidence ? <VerifyTag /> : null}
      <TextInput
        style={[type.body, styles.inputValue, lowConfidence && styles.lowConfidenceValue]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        accessibilityLabel={label}
        accessibilityHint={lowConfidence ? LOW_CONFIDENCE_HINT : undefined}
        placeholderTextColor={colors.iosLabel3}
      />
    </View>
  );
}

interface ListDateRowProps {
  label: string;
  /** YYYY-MM-DD. */
  value: string;
  onChange: (iso: string) => void;
  lowConfidence?: boolean;
}

function ListDateRow({ label, value, onChange, lowConfidence }: ListDateRowProps) {
  const scheme = useColorScheme();
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      {lowConfidence ? (
        <View style={styles.dateFlag}>
          <VerifyTag />
        </View>
      ) : null}
      <DateTimePicker
        mode="date"
        display="compact"
        value={fromIsoDate(value)}
        maximumDate={latestReceiptDate()}
        onChange={(event, picked) => {
          if (event.type === 'set' && picked) onChange(toIsoDate(picked));
        }}
        // The picker takes only a string, so pick the brand green per appearance.
        accentColor={scheme === 'dark' ? TINT_HEX.dark : TINT_HEX.light}
        accessibilityLabel="Receipt date"
        accessibilityHint={lowConfidence ? LOW_CONFIDENCE_HINT : undefined}
      />
    </View>
  );
}

interface ItemRowProps {
  item: EditableLineItem;
  showDivider: boolean;
  readOnly: boolean;
  categories?: CategoryResponse[];
  onChangeName: (n: string) => void;
  onChangePrice: (p: number) => void;
  onChangeQuantity: (q: number) => void;
  onPickCategory: () => void;
}

/** Up to three decimals (weighed items), without trailing zeros. */
function formatQuantity(quantity: number): string {
  return String(Number(quantity.toFixed(3)));
}

/** A price of zero or more, reading a comma as the decimal separator; else null. */
function parsePrice(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** A positive quantity, reading a comma as the decimal separator; else null. */
function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(3)) : null;
}

function ItemRow({
  item,
  showDivider,
  readOnly,
  categories,
  onChangeName,
  onChangePrice,
  onChangeQuantity,
  onPickCategory,
}: ItemRowProps) {
  const lowConf = isLowConfidence(item.extractionConfidence);
  const lowCategoryConf = isLowConfidence(item.categoryConfidence);
  // Each editor commits every valid keystroke, not on blur: Save does not
  // blur an open editor, so an edit still open when Save is tapped was lost.
  const [editingName, setEditingName] = useState(false);
  const [nameText, setNameText] = useState('');
  // The name as editing began, so the field's label holds still while typing.
  const [nameBeforeEdit, setNameBeforeEdit] = useState('');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [quantityText, setQuantityText] = useState('');
  // L9: a quantity edit keeps the line total (what was paid), so show the
  // unit price it implies instead of changing it out of sight.
  const quantityLabel =
    item.quantity === 1
      ? 'Qty 1'
      : `Qty ${formatQuantity(item.quantity)} · $${(item.totalPrice / item.quantity).toFixed(2)} each`;
  const meta = resolveCategoryMeta(item.categoryId, categories);

  return (
    <View style={[styles.row, showDivider && styles.rowDivider]}>
      <Pressable
        onPress={onPickCategory}
        disabled={readOnly}
        style={[
          styles.itemDot,
          { backgroundColor: meta.color },
          lowCategoryConf && styles.itemDotLowConfidence,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Category ${meta.name}${lowCategoryConf ? ', low confidence' : ''}, tap to change`}
      >
        <SymbolView
          name={meta.symbol as Parameters<typeof SymbolView>[0]['name']}
          size={11}
          tintColor="#fff"
        />
      </Pressable>
      <View style={styles.itemInfo}>
        {editingName && !readOnly ? (
          <TextInput
            autoFocus
            value={nameText}
            onChangeText={(value) => {
              setNameText(value);
              const name = value.trim();
              if (name) onChangeName(name);
            }}
            onBlur={() => setEditingName(false)}
            accessibilityLabel={`Edit name of ${nameBeforeEdit}`}
            style={[type.body, styles.nameInput]}
          />
        ) : (
          <Pressable
            onPress={() => {
              setNameText(item.name);
              setNameBeforeEdit(item.name);
              setEditingName(true);
            }}
            disabled={readOnly}
            accessibilityRole="button"
            accessibilityLabel={`Name of ${item.name}`}
            accessibilityHint={readOnly ? undefined : 'Double-tap to change'}
          >
            <Text style={type.body} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
        {editingQuantity && !readOnly ? (
          <TextInput
            autoFocus
            keyboardType="decimal-pad"
            value={quantityText}
            onChangeText={(value) => {
              setQuantityText(value);
              const q = parseQuantity(value);
              if (q !== null) onChangeQuantity(q);
            }}
            onBlur={() => setEditingQuantity(false)}
            accessibilityLabel={`Edit quantity of ${item.name}`}
            style={[type.caption1, styles.quantityInput]}
          />
        ) : (
          <Pressable
            onPress={() => {
              setQuantityText(formatQuantity(item.quantity));
              setEditingQuantity(true);
            }}
            disabled={readOnly}
            hitSlop={{ top: 8, bottom: 8, right: 24 }}
            accessibilityRole="button"
            accessibilityLabel={`Quantity of ${item.name}`}
            accessibilityValue={{ text: quantityLabel }}
            accessibilityHint={readOnly ? undefined : 'Double-tap to change'}
          >
            <Text style={styles.quantityText}>{quantityLabel}</Text>
          </Pressable>
        )}
      </View>
      {editing && !readOnly ? (
        <TextInput
          autoFocus
          keyboardType="decimal-pad"
          value={text}
          onChangeText={(value) => {
            setText(value);
            const price = parsePrice(value);
            if (price !== null) onChangePrice(price);
          }}
          onBlur={() => setEditing(false)}
          accessibilityLabel={`Edit price of ${item.name}`}
          style={[
            type.body,
            { color: colors.tint, fontWeight: '600', minWidth: 70, textAlign: 'right' },
          ]}
        />
      ) : (
        <Pressable
          onPress={() => {
            setText(item.totalPrice.toFixed(2));
            setEditing(true);
          }}
          disabled={readOnly}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          accessibilityRole="button"
          accessibilityLabel={`Price of ${item.name}`}
          accessibilityHint={readOnly ? undefined : 'Double-tap to change'}
        >
          {lowConf ? <VerifyTag /> : null}
          <Text
            style={[
              type.body,
              {
                fontWeight: '600',
                color: lowConf ? colors.orange : colors.iosLabel,
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
  root: { flex: 1, backgroundColor: colors.iosBg },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  headerBtn: { ...type.body, color: colors.tint, paddingHorizontal: spacing.xs },

  image: {
    height: 200,
    borderRadius: radii.card,
    backgroundColor: colors.iosFill3,
  },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
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
    color: colors.iosLabel2,
    flex: 1,
    textAlign: 'right',
    paddingVertical: 0,
  },

  itemInfo: { flex: 1, gap: 2 },
  quantityText: {
    ...type.caption1,
    color: colors.iosLabel2,
  },
  nameInput: {
    color: colors.tint,
    paddingVertical: 0,
  },
  quantityInput: {
    color: colors.tint,
    fontWeight: '600',
    paddingVertical: 0,
    minWidth: 60,
  },

  itemDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // RC-02 AC 2: a category assigned with low confidence.
  itemDotLowConfidence: {
    borderWidth: 2,
    borderColor: colors.orange,
  },

  verifyTag: {
    ...type.caption2,
    color: colors.orange,
    fontWeight: '500',
  },
  lowConfidenceValue: { color: colors.orange },
  // The native date picker sits flush right; keep the tag beside it.
  dateFlag: { flex: 1, alignItems: 'flex-end' },

  highValueBanner: {
    backgroundColor: colors.orangeBg,
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
