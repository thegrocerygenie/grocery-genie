import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { strings } from '@/constants/strings';
import { colors, spacing, typography } from '@/constants/theme';
import type { EditableLineItem } from '../types';
import { CategoryPicker } from './CategoryPicker';
import { ReviewCard } from './ReviewCard';

interface LineItemCardProps {
  item: EditableLineItem;
  onUpdate: (field: string, value: string | number) => void;
}

export function LineItemCard({ item, onUpdate }: LineItemCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(item.name);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const isLowConfidence =
    item.extractionConfidence !== null && item.extractionConfidence < 0.7;

  const categoryName =
    DEFAULT_CATEGORIES.find((c) => c.id === item.categoryId)?.name ??
    strings.review.uncategorized;

  const handleNameBlur = () => {
    setEditingName(false);
    if (nameValue !== item.name) {
      onUpdate('name', nameValue);
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  return (
    <>
      <ReviewCard lowConfidence={isLowConfidence}>
        <View style={styles.row}>
          {/* Item name — tap to edit */}
          {editingName ? (
            <TextInput
              style={styles.nameInput}
              value={nameValue}
              onChangeText={setNameValue}
              onBlur={handleNameBlur}
              autoFocus
              selectTextOnFocus
              accessibilityLabel={`Edit item name: ${item.name}`}
            />
          ) : (
            <Pressable
              style={styles.nameContainer}
              onPress={() => setEditingName(true)}
              accessibilityLabel={`${item.name}, tap to edit`}
              accessibilityRole="button"
            >
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
            </Pressable>
          )}

          {/* Total price */}
          <Text style={styles.price}>{formatCurrency(item.totalPrice)}</Text>
        </View>

        {/* Quantity and unit price */}
        <Text style={styles.detail}>
          {item.quantity} × {formatCurrency(item.unitPrice)}
        </Text>

        {/* Category chip */}
        <Pressable
          style={styles.categoryChip}
          onPress={() => setShowCategoryPicker(true)}
          accessibilityLabel={`Category: ${categoryName}, tap to change`}
          accessibilityRole="button"
        >
          <Text style={styles.categoryText}>{categoryName}</Text>
        </Pressable>

        {/* Low confidence indicator */}
        {isLowConfidence && (
          <Text style={styles.lowConfidenceText}>{strings.review.lowConfidence}</Text>
        )}
      </ReviewCard>

      <CategoryPicker
        visible={showCategoryPicker}
        selectedId={item.categoryId}
        onSelect={(id) => onUpdate('categoryId', id)}
        onClose={() => setShowCategoryPicker(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  name: {
    ...typography.body,
    color: colors.light.textPrimary,
  },
  nameInput: {
    ...typography.body,
    color: colors.light.textPrimary,
    flex: 1,
    marginRight: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.primary,
    paddingVertical: 2,
  },
  price: {
    fontSize: typography.money.fontSize,
    fontWeight: typography.money.fontWeight,
    color: colors.light.textPrimary,
  },
  detail: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: spacing.xs,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.light.primaryLight,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  categoryText: {
    ...typography.caption,
    color: colors.light.primary,
  },
  lowConfidenceText: {
    ...typography.caption,
    color: colors.light.warning,
    marginTop: spacing.xs,
  },
});
