import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { PremiumUpgradePrompt } from '@/components/PremiumUpgradePrompt';
import { categoryMeta } from '@/constants/categories';
import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import {
  CategoryEditorSheet,
  type CategoryEditorValue,
} from '@/features/budget/components/CategoryEditorSheet';
import {
  CATEGORY_NAME_MAX,
  CATEGORY_STRINGS as S,
  MAX_CUSTOM_CATEGORIES,
} from '@/features/budget/content/categories';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/features/budget/hooks/useCategories';
import type { CategoryInput, CategoryResponse } from '@/features/budget/types';
import { apiErrorCode } from '@/services/api';
import { isPremiumRequired } from '@/utils/premium';

type SymbolName = Parameters<typeof SymbolView>[0]['name'];

/** Collapse whitespace as the server does; null when it can't be a name. */
function cleanName(value: string | undefined): string | null {
  const name = (value ?? '').split(/\s+/).filter(Boolean).join(' ');
  return name.length > 0 ? name : null;
}

/** The sheet's target: a new category, or one of the user's own. */
type Editing = { mode: 'create' } | { mode: 'edit'; category: CategoryResponse } | null;

/**
 * Settings → Categories (BC-05 AC 3, V11-P1; AC 5–8, DA-9), as the design's
 * "PI · Custom cats": "Built-in" first, each in its icon square; then
 * "Custom", in round icons, with a "New category" row (a free user gets the
 * upgrade prompt and the Premium footer instead).
 * Edit in the navigation bar renames or deletes custom categories; tapping one
 * changes its name, colour and icon. Adding and changing are Premium (D2):
 * after a lapse the categories stay, keep their colour and icon, and can still
 * be deleted; changing them shows the upgrade prompt (AC 8).
 */
export default function CategorySettingsScreen() {
  const router = useRouter();
  const { data: profile } = useMe();
  const categories = useCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [editingList, setEditingList] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  // The server refused a change in the open sheet: Premium lapsed meanwhile.
  const [refused, setRefused] = useState(false);

  const all = categories.data ?? [];
  const defaults = all.filter((c) => c.is_default);
  const mine = all.filter((c) => !c.is_default);
  // Premium as the backend says; a refused create means it lapsed meanwhile.
  const premium =
    profile?.is_premium === true &&
    !isPremiumRequired(create.error) &&
    !isPremiumRequired(update.error);
  const atLimit = mine.length >= MAX_CUSTOM_CATEGORIES;
  const listEditing = editingList && mine.length > 0;
  // At accessibility sizes a name beside its icon broke mid-word ("Househol d",
  // F4): the icon goes above the name, which gets the row's full width.
  const stacked = useWindowDimensions().fontScale >= fontScale.accessibility;

  const openPaywall = () => router.push('/paywall');

  const onSaveError = (error: unknown) => {
    const code = apiErrorCode(error);
    if (code === 'premium_required') {
      setRefused(true); // the upgrade prompt replaces the editor's Save
      return;
    }
    if (code === 'category_name_taken') Alert.alert(S.nameTaken);
    else if (code === 'category_limit_reached') Alert.alert(S.limitReached);
    else Alert.alert(S.failed);
  };

  const openEditor = (next: Editing) => {
    setRefused(false);
    setEditing(next);
  };
  const closeEditor = () => setEditing(null);

  const onEditorSave = (value: CategoryEditorValue) => {
    if (!editing) return;
    if (editing.mode === 'create') {
      create.mutate(value, {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          closeEditor();
        },
        onError: onSaveError,
      });
      return;
    }
    const cat = editing.category;
    const changes: CategoryInput = {};
    if (value.name !== cat.name) changes.name = value.name;
    if (value.color !== cat.color) changes.color = value.color;
    if (value.icon !== cat.icon) changes.icon = value.icon;
    if (Object.keys(changes).length === 0) {
      closeEditor();
      return;
    }
    update.mutate({ id: cat.id, ...changes }, { onSuccess: closeEditor, onError: onSaveError });
  };

  const onRename = (cat: CategoryResponse) =>
    Alert.prompt(
      S.renamePrompt,
      '',
      [
        { text: S.cancel, style: 'cancel' },
        {
          text: S.save,
          onPress: (value?: string) => {
            const name = cleanName(value);
            if (!name || name === cat.name) return;
            if (name.length > CATEGORY_NAME_MAX) {
              Alert.alert(S.nameInvalid);
              return;
            }
            update.mutate({ id: cat.id, name }, { onError: onSaveError });
          },
        },
      ],
      'plain-text',
      cat.name,
    );

  const onDelete = (cat: CategoryResponse) =>
    Alert.alert(S.deleteTitle(cat.name), S.deleteBody, [
      { text: S.cancel, style: 'cancel' },
      {
        text: S.delete,
        style: 'destructive',
        onPress: () => remove.mutate(cat.id, { onError: () => Alert.alert(S.failed) }),
      },
    ]);

  const onRow = (cat: CategoryResponse) => {
    if (listEditing && premium) onRename(cat);
    else openEditor({ mode: 'edit', category: cat });
  };

  const headerRight =
    mine.length > 0
      ? () => (
          <Pressable
            onPress={() => setEditingList((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={listEditing ? S.doneLabel : S.editLabel}
          >
            <Text style={[styles.headerButton, listEditing && styles.headerDone]}>
              {listEditing ? S.done : S.edit}
            </Text>
          </Pressable>
        )
      : undefined;

  return (
    <>
      <Stack.Screen options={{ title: S.screenTitle, headerBackTitle: S.back, headerRight }} />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {categories.isError ? (
          <View style={styles.card}>
            <Text style={[type.subheadline, styles.errorText]}>{S.loadFailed}</Text>
            <Pressable
              onPress={() => void categories.refetch?.()}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={S.retry}
            >
              <Text style={[type.body, styles.tint]}>{S.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {defaults.length > 0 ? (
          <View>
            <Text style={styles.sectionLabel}>{S.builtInHeader}</Text>
            <View style={styles.card}>
              {defaults.map((cat, i) => {
                const meta = categoryMeta(cat);
                return (
                  <View
                    key={cat.id}
                    testID={`category-row-${cat.id}`}
                    style={[styles.row, stacked && styles.rowStacked, i > 0 && styles.divider]}
                    accessible
                    accessibilityLabel={cat.name}
                  >
                    <View
                      testID={`category-icon-${cat.id}`}
                      style={[styles.icon, styles.square, { backgroundColor: meta.color }]}
                    >
                      <SymbolView
                        name={meta.symbol as SymbolName}
                        size={14}
                        tintColor={colors.onIconSquare}
                      />
                    </View>
                    <Text style={[type.body, !stacked && styles.flex]}>{cat.name}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View>
          <View style={styles.headerRow}>
            <Text style={styles.sectionLabel}>{S.customHeader}</Text>
            {premium || mine.length > 0 ? (
              <Text style={styles.sectionLabel} accessibilityLabel={S.countLabel(mine.length)}>
                {S.count(mine.length)}
              </Text>
            ) : null}
          </View>
          <View style={styles.card}>
            {mine.map((cat, i) => {
              const meta = categoryMeta(cat);
              return (
                <View key={cat.id} style={[styles.rowOuter, i > 0 && styles.divider]}>
                  {listEditing ? (
                    <Pressable
                      onPress={() => onDelete(cat)}
                      hitSlop={8}
                      style={styles.deleteButton}
                      accessibilityRole="button"
                      accessibilityLabel={S.deleteLabel(cat.name)}
                    >
                      <SymbolView name="minus.circle.fill" size={22} tintColor={colors.red} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => onRow(cat)}
                    testID={`category-row-${cat.id}`}
                    style={({ pressed }) => [
                      styles.row,
                      styles.flex,
                      stacked && styles.rowStacked,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${cat.name}, ${
                      listEditing && premium ? S.rowRenameHint : S.rowOpenHint
                    }`}
                  >
                    <View style={stacked ? styles.stackedTop : styles.inline}>
                      <View
                        testID={`category-icon-${cat.id}`}
                        style={[styles.icon, styles.round, { backgroundColor: meta.color }]}
                      >
                        <SymbolView
                          name={meta.symbol as SymbolName}
                          size={14}
                          tintColor={colors.onIconSquare}
                        />
                      </View>
                      {stacked && !listEditing ? (
                        <SymbolView name="chevron.right" size={13} tintColor={colors.iosLabel3} />
                      ) : null}
                    </View>
                    <Text
                      style={[type.body, !stacked && styles.flex, styles.customName]}
                      numberOfLines={stacked ? undefined : 1}
                    >
                      {cat.name}
                    </Text>
                    {listEditing || stacked ? null : (
                      <SymbolView name="chevron.right" size={13} tintColor={colors.iosLabel3} />
                    )}
                  </Pressable>
                </View>
              );
            })}
            {premium ? (
              <Pressable
                onPress={() => openEditor({ mode: 'create' })}
                disabled={atLimit || create.isPending}
                style={({ pressed }) => [
                  styles.row,
                  mine.length > 0 && styles.divider,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={S.newCategory}
                accessibilityState={{ disabled: atLimit || create.isPending }}
              >
                <View style={[styles.icon, styles.round, styles.addIcon]}>
                  <SymbolView
                    name="plus"
                    size={14}
                    tintColor={atLimit ? colors.iosLabel3 : colors.tint}
                  />
                </View>
                <Text
                  style={[type.body, styles.customName, atLimit ? styles.secondary : styles.tint]}
                >
                  {S.newCategory}
                </Text>
              </Pressable>
            ) : (
              <View style={mine.length > 0 && styles.divider}>
                <PremiumUpgradePrompt
                  title={S.upgradeTitle}
                  message={S.upgradeMessage}
                  upgradeLabel={S.upgradeAction}
                  onUpgrade={openPaywall}
                />
              </View>
            )}
          </View>
          {premium ? null : <Text style={styles.note}>{S.customFooter}</Text>}
          {premium && atLimit ? <Text style={styles.note}>{S.limitReached}</Text> : null}
          {!premium && mine.length > 0 ? <Text style={styles.note}>{S.lapsedNote}</Text> : null}
        </View>
      </ScrollView>

      <CategoryEditorSheet
        visible={editing !== null}
        mode={editing?.mode ?? 'create'}
        initial={editing?.mode === 'edit' ? editing.category : undefined}
        locked={!premium || refused}
        saving={create.isPending || update.isPending}
        onSave={onEditorSave}
        onCancel={closeEditor}
        onUpgrade={() => {
          closeEditor();
          openPaywall();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  note: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: 4,
    marginTop: spacing.sm,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  headerButton: { ...type.body, color: colors.tint },
  headerDone: { fontWeight: '600' },
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
  rowOuter: { flexDirection: 'row', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: touchTarget.minHeight + 4,
  },
  deleteButton: {
    paddingLeft: 14,
    minHeight: touchTarget.minHeight,
    minWidth: touchTarget.minWidth - 8,
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.iosFill3 },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  icon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: { borderRadius: 7 },
  round: { borderRadius: 14 },
  addIcon: { backgroundColor: colors.tintBg },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.xs },
  stackedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: { flexDirection: 'row' },
  customName: { fontWeight: '600' },
  flex: { flex: 1 },
  secondary: { color: colors.iosLabel2 },
  tint: { color: colors.tint },
  errorText: { color: colors.iosLabel2, padding: 14 },
});
