import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { PremiumUpgradePrompt } from '@/components/PremiumUpgradePrompt';
import {
  CATEGORY_ICON_SYMBOLS,
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
  DEFAULT_CUSTOM_COLOR,
  DEFAULT_CUSTOM_ICON,
  type CategoryIconName,
} from '@/constants/categories';
import {
  categoryPalette,
  colors,
  radii,
  spacing,
  touchTarget,
  type,
  type CategoryColorName,
} from '@/constants/theme';
import { CATEGORY_NAME_MAX, CATEGORY_STRINGS as S } from '../content/categories';

type SymbolName = Parameters<typeof SymbolView>[0]['name'];

export interface CategoryEditorValue {
  name: string;
  color: CategoryColorName;
  icon: CategoryIconName;
}

export interface CategoryEditorSheetProps {
  visible: boolean;
  /** "create" for the New category row; "edit" for a custom category's row. */
  mode: 'create' | 'edit';
  /** The category being edited; a new one starts with the first colour and icon. */
  initial?: Partial<{ name: string; color: string | null; icon: string | null }>;
  /**
   * Premium has lapsed (BC-05 AC 8): the category keeps its look, shown
   * read-only, with the upgrade prompt in place of Save.
   */
  locked: boolean;
  saving: boolean;
  onSave: (value: CategoryEditorValue) => void;
  onCancel: () => void;
  onUpgrade: () => void;
}

function asColor(value: string | null | undefined): CategoryColorName {
  return (CUSTOM_CATEGORY_COLORS as readonly string[]).includes(value ?? '')
    ? (value as CategoryColorName)
    : DEFAULT_CUSTOM_COLOR;
}

function asIcon(value: string | null | undefined): CategoryIconName {
  return (CUSTOM_CATEGORY_ICONS as readonly string[]).includes(value ?? '')
    ? (value as CategoryIconName)
    : DEFAULT_CUSTOM_ICON;
}

/** Collapse whitespace as the server does. */
function cleanName(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(' ');
}

/**
 * A custom category's name, colour and icon (BC-05 AC 5, DA-9). The colours are
 * the palette in `theme.ts` and the icons a fixed set, both the ones the server
 * accepts; a new category starts on the first of each.
 */
export function CategoryEditorSheet({
  visible,
  mode,
  initial,
  locked,
  saving,
  onSave,
  onCancel,
  onUpgrade,
}: CategoryEditorSheetProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<CategoryColorName>(DEFAULT_CUSTOM_COLOR);
  const [icon, setIcon] = useState<CategoryIconName>(DEFAULT_CUSTOM_ICON);

  // Start from the category each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    setColor(asColor(initial?.color));
    setIcon(asIcon(initial?.icon));
  }, [visible, initial?.name, initial?.color, initial?.icon]);

  const cleaned = cleanName(name);
  const canSave = !locked && !saving && cleaned.length > 0 && cleaned.length <= CATEGORY_NAME_MAX;
  const title = mode === 'create' ? S.editorNewTitle : S.editorEditTitle;

  const pickColor = (next: CategoryColorName) => {
    void Haptics.selectionAsync();
    setColor(next);
  };
  const pickIcon = (next: CategoryIconName) => {
    void Haptics.selectionAsync();
    setIcon(next);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            onPress={onCancel}
            hitSlop={12}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel={S.cancel}
          >
            <Text style={styles.headerButton}>{S.cancel}</Text>
          </Pressable>
          <Text style={[type.headline, styles.headerTitle]} accessibilityRole="header">
            {title}
          </Text>
          <View style={[styles.headerSide, styles.headerRight]}>
            {locked ? null : (
              <Pressable
                onPress={() => canSave && onSave({ name: cleaned, color, icon })}
                disabled={!canSave}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={S.save}
                accessibilityState={{ disabled: !canSave }}
              >
                <Text style={[styles.headerButton, styles.headerSave, !canSave && styles.disabled]}>
                  {S.save}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View
            style={styles.preview}
            accessible
            accessibilityLabel={S.preview(cleaned || S.namePlaceholder)}
          >
            <View style={[styles.previewCircle, { backgroundColor: categoryPalette[color] }]}>
              <SymbolView
                name={CATEGORY_ICON_SYMBOLS[icon] as SymbolName}
                size={30}
                tintColor={colors.onIconSquare}
              />
            </View>
          </View>

          {locked ? (
            <View style={styles.card}>
              <PremiumUpgradePrompt
                title={S.lockedTitle}
                message={S.lockedMessage}
                upgradeLabel={S.upgradeAction}
                onUpgrade={onUpgrade}
              />
            </View>
          ) : null}

          <View>
            <Text style={styles.sectionLabel}>{S.nameLabel}</Text>
            <View style={styles.card}>
              <TextInput
                value={name}
                onChangeText={setName}
                editable={!locked}
                placeholder={S.namePlaceholder}
                placeholderTextColor={colors.iosLabel3}
                maxLength={CATEGORY_NAME_MAX}
                autoFocus={mode === 'create'}
                returnKeyType="done"
                style={[type.body, styles.input]}
                accessibilityLabel={S.nameLabel}
              />
            </View>
          </View>

          <View>
            <Text style={styles.sectionLabel}>{S.colorHeader}</Text>
            <View style={[styles.card, styles.grid]} accessibilityRole="radiogroup">
              {CUSTOM_CATEGORY_COLORS.map((c) => {
                const selected = c === color;
                return (
                  <Pressable
                    key={c}
                    onPress={() => pickColor(c)}
                    disabled={locked}
                    hitSlop={4}
                    style={[styles.swatchHit, selected && styles.swatchSelected]}
                    accessibilityRole="radio"
                    accessibilityLabel={S.colorNames[c]}
                    accessibilityState={{ selected, disabled: locked }}
                  >
                    <View style={[styles.swatch, { backgroundColor: categoryPalette[c] }]}>
                      {selected ? (
                        <SymbolView name="checkmark" size={14} tintColor={colors.onIconSquare} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={styles.sectionLabel}>{S.iconHeader}</Text>
            <View style={[styles.card, styles.grid]} accessibilityRole="radiogroup">
              {CUSTOM_CATEGORY_ICONS.map((i) => {
                const selected = i === icon;
                return (
                  <Pressable
                    key={i}
                    onPress={() => pickIcon(i)}
                    disabled={locked}
                    hitSlop={4}
                    style={[
                      styles.swatchHit,
                      styles.iconTile,
                      selected && { backgroundColor: categoryPalette[color] },
                    ]}
                    accessibilityRole="radio"
                    accessibilityLabel={S.iconNames[i]}
                    accessibilityState={{ selected, disabled: locked }}
                  >
                    <SymbolView
                      name={CATEGORY_ICON_SYMBOLS[i] as SymbolName}
                      size={20}
                      tintColor={selected ? colors.onIconSquare : colors.iosLabel2}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const SWATCH = touchTarget.minHeight;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: touchTarget.minHeight + spacing.md,
  },
  headerSide: { width: 72, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerButton: { ...type.body, color: colors.tint },
  headerSave: { fontWeight: '600' },
  disabled: { color: colors.iosLabel3 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.screenBottom },
  preview: { alignItems: 'center', paddingVertical: spacing.sm },
  previewCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: touchTarget.minHeight,
    color: colors.iosLabel,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    justifyContent: 'flex-start',
  },
  swatchHit: {
    width: SWATCH + 4,
    height: SWATCH + 4,
    borderRadius: (SWATCH + 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.iosBg2,
  },
  swatchSelected: { borderColor: colors.iosLabel3 },
  swatch: {
    width: SWATCH - 8,
    height: SWATCH - 8,
    borderRadius: (SWATCH - 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: { backgroundColor: colors.iosFill3 },
});
