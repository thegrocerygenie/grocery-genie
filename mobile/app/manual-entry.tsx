import React, { useMemo, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { colors, radii, spacing, type } from '@/constants/theme';
import { createManualReceipt } from '@/features/receipt-capture/services/receiptApi';

interface ManualLineItem {
  id: string;
  name: string;
  price: string;
}

function todayISO(): string {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ManualEntryScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [storeName, setStoreName] = useState('');
  const [date] = useState(todayISO());
  const [items, setItems] = useState<ManualLineItem[]>([]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0),
    [items],
  );

  const createMutation = useMutation({
    mutationFn: createManualReceipt,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const canSave =
    storeName.trim().length > 0 && items.length > 0 && total > 0 && !createMutation.isPending;

  const addLineItem = () => {
    setItems((prev) => [...prev, { id: `m${prev.length + 1}`, name: '', price: '' }]);
  };

  const updateItem = (id: string, patch: Partial<ManualLineItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const onSave = async () => {
    if (!canSave) return;
    try {
      await createMutation.mutateAsync({
        store_name: storeName.trim(),
        date,
        total,
        items: items.map((i, idx) => {
          const price = parseFloat(i.price) || 0;
          return {
            name: i.name.trim() || `Item ${idx + 1}`,
            quantity: 1,
            unit_price: price,
            total_price: price,
          };
        }),
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Save failed', 'Please try again in a moment.');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          title: 'Manual entry',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
              <Text style={styles.headerBtn}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={onSave} hitSlop={12} disabled={!canSave} accessibilityRole="button">
              <Text style={[styles.headerBtn, { fontWeight: '600' }, !canSave && { opacity: 0.4 }]}>
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
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>Couldn&apos;t read this receipt. Enter what you can.</Text>

          <View style={styles.listCard}>
            <View style={styles.row}>
              <Text style={[type.body, { color: colors.iosLabel2 as string }]}>Store</Text>
              <TextInput
                value={storeName}
                onChangeText={setStoreName}
                placeholder="Tap to add"
                placeholderTextColor={colors.tint}
                style={styles.input}
                accessibilityLabel="Store name"
              />
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={[type.body, { color: colors.iosLabel2 as string }]}>Date</Text>
              <Text style={[type.body, { color: colors.iosLabel as string }]}>
                {formatDate(date)}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={[type.body, { color: colors.iosLabel2 as string }]}>Total</Text>
              <Text style={[type.money, { fontSize: 17, color: colors.iosLabel as string }]}>
                ${total.toFixed(2)}
              </Text>
            </View>
          </View>

          {items.length > 0 ? (
            <View style={styles.listCard}>
              {items.map((item, i) => (
                <View key={item.id} style={[styles.itemRow, i > 0 && styles.itemRowDivider]}>
                  <TextInput
                    value={item.name}
                    onChangeText={(v) => updateItem(item.id, { name: v })}
                    placeholder={`Item ${i + 1}`}
                    placeholderTextColor={colors.iosLabel3 as string}
                    style={[type.body, styles.itemNameInput]}
                    accessibilityLabel={`Item ${i + 1} name`}
                  />
                  <TextInput
                    value={item.price}
                    onChangeText={(v) => updateItem(item.id, { price: v })}
                    placeholder="$0.00"
                    placeholderTextColor={colors.iosLabel3 as string}
                    keyboardType="decimal-pad"
                    style={[type.body, styles.itemPriceInput]}
                    accessibilityLabel={`Item ${i + 1} price`}
                  />
                  <Pressable
                    onPress={() => removeItem(item.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Remove item"
                  >
                    <SymbolView
                      name="minus.circle.fill"
                      size={18}
                      tintColor={colors.iosLabel3 as string}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={addLineItem}
            style={({ pressed }) => [
              styles.addBtn,
              pressed && { backgroundColor: colors.iosFill3 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add line item"
          >
            <SymbolView name="plus" size={14} tintColor={colors.tint} />
            <Text style={[type.subheadline, { color: colors.tint, fontWeight: '600' }]}>
              Add line item
            </Text>
          </Pressable>

          <View style={styles.tip}>
            <Text style={[type.caption1, { color: colors.iosLabel2 as string, lineHeight: 18 }]}>
              You can also retake the photo with better lighting. Manual receipts work like scanned
              ones.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  headerBtn: { ...type.body, color: colors.tint },

  intro: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
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
    paddingHorizontal: 16,
    minHeight: 44,
    paddingVertical: 11,
    justifyContent: 'space-between',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },
  input: {
    ...type.body,
    color: colors.iosLabel as string,
    flex: 1,
    textAlign: 'right',
    paddingVertical: 0,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 44,
    paddingVertical: 8,
  },
  itemRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  itemNameInput: {
    flex: 1,
    color: colors.iosLabel as string,
    paddingVertical: 0,
  },
  itemPriceInput: {
    minWidth: 80,
    color: colors.iosLabel as string,
    textAlign: 'right',
    paddingVertical: 0,
  },

  addBtn: {
    height: 44,
    borderRadius: radii.list,
    backgroundColor: colors.iosBg2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  tip: {
    backgroundColor: 'rgba(0,122,255,0.08)',
    borderRadius: radii.card,
    padding: 12,
  },
});
