import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { PremiumUpgradePrompt } from '@/components/PremiumUpgradePrompt';
import { getCategoryMetaByName } from '@/constants/categories';
import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import {
  CATEGORY_NAME_MAX,
  CATEGORY_STRINGS as S,
  MAX_CUSTOM_CATEGORIES,
} from '@/features/budget/content/categories';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from '@/features/budget/hooks/useCategories';
import type { CategoryResponse } from '@/features/budget/types';
import { apiErrorCode } from '@/services/api';
import { isPremiumRequired } from '@/utils/premium';

/** Collapse whitespace as the server does; null when it can't be a name. */
function cleanName(value: string | undefined): string | null {
  const name = (value ?? '').split(/\s+/).filter(Boolean).join(' ');
  return name.length > 0 ? name : null;
}

/**
 * Settings → Categories (BC-05 AC 3, V11-P1). The eight built-in categories,
 * then up to 10 of the user's own. Adding and renaming are Premium (D2): a free
 * user sees the upgrade prompt in their place. After Premium lapses the user's
 * categories stay, keep their spending, and can still be deleted.
 */
export default function CategorySettingsScreen() {
  const router = useRouter();
  const { data: profile } = useMe();
  const categories = useCategories();
  const create = useCreateCategory();
  const rename = useRenameCategory();
  const remove = useDeleteCategory();

  const all = categories.data ?? [];
  const defaults = all.filter((c) => c.is_default);
  const mine = all.filter((c) => !c.is_default);
  // Premium as the backend says; a refused create means it lapsed meanwhile.
  const premium = profile?.is_premium === true && !isPremiumRequired(create.error);
  const atLimit = mine.length >= MAX_CUSTOM_CATEGORIES;

  const onSaveError = (error: unknown) => {
    const code = apiErrorCode(error);
    if (code === 'premium_required') return; // the upgrade prompt replaces the add row
    if (code === 'category_name_taken') Alert.alert(S.nameTaken);
    else if (code === 'category_limit_reached') Alert.alert(S.limitReached);
    else Alert.alert(S.failed);
  };

  const askName = (title: string, body: string, initial: string, save: (name: string) => void) =>
    Alert.prompt(
      title,
      body,
      [
        { text: S.cancel, style: 'cancel' },
        {
          text: S.save,
          onPress: (value?: string) => {
            const name = cleanName(value);
            if (!name) return;
            if (name.length > CATEGORY_NAME_MAX) {
              Alert.alert(S.nameInvalid);
              return;
            }
            save(name);
          },
        },
      ],
      'plain-text',
      initial,
    );

  const onAdd = () =>
    askName(S.addPrompt, S.addBody, '', (name) =>
      create.mutate(name, {
        onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        onError: onSaveError,
      }),
    );

  const onRename = (cat: CategoryResponse) =>
    askName(S.renamePrompt, '', cat.name, (name) => {
      if (name === cat.name) return;
      rename.mutate({ id: cat.id, name }, { onError: onSaveError });
    });

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
    if (!premium) {
      onDelete(cat);
      return;
    }
    Alert.alert(S.rowActions(cat.name), undefined, [
      { text: S.rename, onPress: () => onRename(cat) },
      { text: S.delete, style: 'destructive', onPress: () => onDelete(cat) },
      { text: S.cancel, style: 'cancel' },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: S.screenTitle, headerBackTitle: S.back }} />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Text style={styles.note}>{S.intro}</Text>

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

        {premium || mine.length > 0 ? (
          <View>
            <View style={styles.headerRow}>
              <Text style={styles.sectionLabel}>{S.yoursHeader}</Text>
              <Text style={styles.sectionLabel} accessibilityLabel={S.countLabel(mine.length)}>
                {S.count(mine.length)}
              </Text>
            </View>
            <View style={styles.card}>
              {mine.length === 0 ? (
                <View style={styles.row}>
                  <Text style={[type.subheadline, styles.secondary]}>{S.empty}</Text>
                </View>
              ) : null}
              {mine.map((cat, i) => (
                <Pressable
                  key={cat.id}
                  onPress={() => onRow(cat)}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.divider,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat.name}, ${premium ? S.rowHint : S.delete}`}
                >
                  <View style={[styles.icon, styles.customIcon]}>
                    <SymbolView name="tag.fill" size={14} tintColor={colors.onIconSquare} />
                  </View>
                  <Text style={[type.body, styles.flex]} numberOfLines={1}>
                    {cat.name}
                  </Text>
                  <SymbolView
                    name={premium ? 'ellipsis.circle' : 'trash'}
                    size={18}
                    tintColor={premium ? colors.iosLabel3 : colors.red}
                  />
                </Pressable>
              ))}
              {premium ? (
                <Pressable
                  onPress={onAdd}
                  disabled={atLimit || create.isPending}
                  style={({ pressed }) => [
                    styles.row,
                    mine.length > 0 && styles.divider,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={S.add}
                  accessibilityState={{ disabled: atLimit || create.isPending }}
                >
                  <SymbolView
                    name="plus.circle.fill"
                    size={22}
                    tintColor={atLimit ? colors.iosLabel3 : colors.tint}
                  />
                  <Text style={[type.body, atLimit ? styles.secondary : styles.tint]}>{S.add}</Text>
                </Pressable>
              ) : null}
            </View>
            {premium && atLimit ? <Text style={styles.note}>{S.limitReached}</Text> : null}
            {!premium && mine.length > 0 ? <Text style={styles.note}>{S.lapsedNote}</Text> : null}
          </View>
        ) : null}

        {!premium ? (
          <View style={styles.card}>
            <PremiumUpgradePrompt
              title={S.upgradeTitle}
              message={S.upgradeMessage}
              upgradeLabel={S.upgradeAction}
              onUpgrade={() => router.push('/paywall')}
            />
          </View>
        ) : null}

        {defaults.length > 0 ? (
          <View>
            <Text style={styles.sectionLabel}>{S.defaultsHeader}</Text>
            <View style={styles.card}>
              {defaults.map((cat, i) => {
                const meta = getCategoryMetaByName(cat.name);
                return (
                  <View
                    key={cat.id}
                    style={[styles.row, i > 0 && styles.divider]}
                    accessible
                    accessibilityLabel={cat.name}
                  >
                    <View style={[styles.icon, { backgroundColor: meta.color }]}>
                      <SymbolView
                        name={meta.symbol as Parameters<typeof SymbolView>[0]['name']}
                        size={14}
                        tintColor={colors.onIconSquare}
                      />
                    </View>
                    <Text style={[type.body, styles.flex]}>{cat.name}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.note}>{S.defaultsFooter}</Text>
          </View>
        ) : null}
      </ScrollView>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: touchTarget.minHeight + 4,
  },
  pressed: { backgroundColor: colors.iosFill3 },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customIcon: { backgroundColor: colors.indigo },
  flex: { flex: 1 },
  secondary: { color: colors.iosLabel2 },
  tint: { color: colors.tint },
  errorText: { color: colors.iosLabel2, padding: 14 },
});
