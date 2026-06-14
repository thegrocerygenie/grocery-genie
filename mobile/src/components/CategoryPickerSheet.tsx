import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import {
  DEFAULT_CATEGORIES,
  getCategoryMetaByName,
  type CategoryMeta,
} from '@/constants/categories';
import type { CategoryResponse } from '@/features/budget/types';

export interface CategoryPickerSheetProps {
  visible: boolean;
  itemName?: string;
  selectedId: string | null;
  /**
   * Real backend categories (UUID ids). When provided, the sheet emits UUID
   * `category_id` values so corrections satisfy the backend. Falls back to the
   * static DEFAULT_CATEGORIES slugs only when this is absent/empty (offline).
   */
  categories?: CategoryResponse[];
  onSelect: (categoryId: string) => void;
  onClose: () => void;
}

/**
 * A single selectable row: the id sent on select plus the display meta. For
 * backend categories the id is a UUID while icon/color come from the matching
 * default category (by name); offline this is just a default category.
 */
interface CategoryOption {
  readonly id: string;
  readonly meta: CategoryMeta;
}

function buildOptions(categories: CategoryResponse[] | undefined): CategoryOption[] {
  if (categories && categories.length > 0) {
    return categories.map((cat) => ({
      id: cat.id,
      meta: { ...getCategoryMetaByName(cat.name), name: cat.name },
    }));
  }
  return DEFAULT_CATEGORIES.map((meta) => ({ id: meta.id, meta }));
}

export function CategoryPickerSheet({
  visible,
  itemName,
  selectedId,
  categories,
  onSelect,
  onClose,
}: CategoryPickerSheetProps) {
  const options = buildOptions(categories);
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="none"
        >
          <View style={styles.headerRow}>
            <View style={{ width: 56 }}>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text style={styles.headerBtn}>Cancel</Text>
              </Pressable>
            </View>
            <Text style={[type.headline, { textAlign: 'center', flex: 1 }]}>Category</Text>
            <View style={{ width: 56 }}>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text style={[styles.headerBtn, { fontWeight: '600', textAlign: 'right' }]}>
                  Done
                </Text>
              </Pressable>
            </View>
          </View>

          {itemName ? (
            <View style={styles.itemCard}>
              <Text style={styles.eyebrow}>ITEM</Text>
              <Text style={type.headline}>{itemName}</Text>
              <Text style={[type.caption1, { color: colors.iosLabel2 as string, marginTop: 2 }]}>
                This change applies to all past and future receipts.
              </Text>
            </View>
          ) : null}

          <View style={styles.listCard}>
            {options.map((opt, i) => (
              <Pressable
                key={opt.id}
                onPress={() => onSelect(opt.id)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowDivider,
                  pressed && { backgroundColor: colors.iosFill3 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${opt.meta.name}${selectedId === opt.id ? ', selected' : ''}`}
              >
                <View style={[styles.circle, { backgroundColor: opt.meta.color }]}>
                  <SymbolView
                    name={opt.meta.symbol as Parameters<typeof SymbolView>[0]['name']}
                    size={14}
                    tintColor="#fff"
                  />
                </View>
                <Text style={[type.body, { flex: 1, fontWeight: '500' }]}>{opt.meta.name}</Text>
                {selectedId === opt.id ? (
                  <SymbolView name="checkmark" size={18} tintColor={colors.tint} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.iosBg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  headerBtn: { ...type.body, color: colors.tint },

  itemCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: 14,
    padding: 14,
    gap: 2,
  },
  eyebrow: {
    ...type.caption2,
    color: colors.iosLabel2 as string,
    letterSpacing: 0.6,
    marginBottom: 4,
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
    minHeight: 48,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
