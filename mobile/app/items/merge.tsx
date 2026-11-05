import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
import {
  useItem,
  useLinkCandidates,
  useMergeItem,
} from '@/features/price-intelligence/hooks/useItems';
import type { ItemSummary } from '@/features/price-intelligence/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatMoney } from '@/utils/money';

/** PI-02 AC 15: the search asks once typing pauses, not on every key. */
const SEARCH_DEBOUNCE_MS = 300;

function rowStats(item: ItemSummary): string {
  const average =
    item.avg_unit_price === null || item.avg_unit_price === undefined
      ? null
      : formatMoney(item.avg_unit_price, item.latest_price?.currency ?? 'USD');
  return PRICES_COPY.splitStats(item.observation_count, average);
}

/**
 * PI-02 AC 15 (DA-6): the "Link items" sheet (PI-02 AC 3, link). Cancel and
 * Link in its bar; a search field; "Suggested" (the item's pending
 * suggestions, then the most similar names) and "All items", each row a
 * radio with "N purchases · $X avg". Link, enabled once one is picked,
 * asks "Merge X into Y?", then merges this item into it and opens the result. The item is never listed.
 */
export default function LinkItemsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const source = useItem(id);
  const candidates = useLinkCandidates(id, useDebouncedValue(query, SEARCH_DEBOUNCE_MS));
  const merge = useMergeItem();
  const name = source.data?.canonical_name ?? '';

  const sections = [
    { title: PRICES_COPY.linkSuggested, data: candidates.data?.suggested ?? [] },
    { title: PRICES_COPY.linkAll, data: candidates.data?.items ?? [] },
  ]
    .map((s) => ({ ...s, data: s.data.filter((item) => item.id !== id) }))
    .filter((s) => s.data.length > 0);
  const visible = new Set(sections.flatMap((s) => s.data.map((i) => i.id)));
  const target = picked && visible.has(picked) ? picked : null;
  const canLink = target !== null && !merge.isPending;

  const doLink = (intoId: string) =>
    merge.mutate(
      { id, intoId },
      {
        onSuccess: (merged) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // The old item is gone: leave its screen too, for the combined one.
          router.back();
          router.replace({ pathname: '/items/[id]', params: { id: merged.id } });
        },
        onError: () => Alert.alert(PRICES_COPY.actionFailed),
      },
    );

  // The user's answer (2026-11-05): Link asks before it merges.
  const onLink = () => {
    const into = sections.flatMap((s) => s.data).find((i) => i.id === target);
    if (!into) return;
    Alert.alert(
      PRICES_COPY.linkConfirmTitle(name, into.canonical_name),
      PRICES_COPY.linkConfirmBody,
      [
        { text: PRICES_COPY.cancel, style: 'cancel' },
        { text: PRICES_COPY.linkConfirmAction, onPress: () => doLink(into.id) },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: PRICES_COPY.linkTitle,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={PRICES_COPY.cancel}
            >
              <Text style={styles.headerBtn} maxFontSizeMultiplier={fontScale.headerButtonMax}>
                {PRICES_COPY.cancel}
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={onLink}
              disabled={!canLink}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={PRICES_COPY.linkActionLabel}
              accessibilityState={{ disabled: !canLink }}
            >
              <Text
                style={[styles.headerBtn, styles.headerLink, !canLink && styles.headerDisabled]}
                maxFontSizeMultiplier={fontScale.headerButtonMax}
              >
                {PRICES_COPY.linkAction}
              </Text>
            </Pressable>
          ),
        }}
      />
      <SectionList
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.top}>
            <Text style={styles.intro}>{PRICES_COPY.linkIntro(name)}</Text>
            <View style={styles.search}>
              <SymbolView name="magnifyingglass" size={14} tintColor={colors.iosLabel2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={PRICES_COPY.searchPlaceholder}
                placeholderTextColor={colors.iosLabel2}
                style={styles.searchInput}
                accessibilityLabel={PRICES_COPY.searchPlaceholder}
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          candidates.isLoading ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <Text style={styles.empty}>
              {query.trim() ? PRICES_COPY.noResults(query.trim()) : PRICES_COPY.linkEmpty}
            </Text>
          )
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionLabel} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => {
          const selected = item.id === target;
          const stats = rowStats(item);
          return (
            <Pressable
              onPress={() => setPicked(item.id)}
              style={({ pressed }) => [
                styles.row,
                index === 0 && styles.rowFirst,
                index === section.data.length - 1 && styles.rowLast,
                index > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={PRICES_COPY.linkRowLabel(item.canonical_name, stats, selected)}
            >
              <View style={[styles.radio, selected && styles.radioOn]} />
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.canonical_name}</Text>
                <Text style={styles.caption}>{stats}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, paddingBottom: 80 },
  headerBtn: { ...type.body, color: colors.tint, paddingHorizontal: spacing.xs },
  headerLink: { fontWeight: '600' },
  headerDisabled: { color: colors.iosLabel3 },
  top: { gap: spacing.sm, marginBottom: spacing.sm },
  intro: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.xs },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.iosFill3,
    borderRadius: radii.list,
    paddingHorizontal: spacing.md,
  },
  searchInput: { ...type.body, flex: 1, minHeight: touchTarget.minHeight, color: colors.iosLabel },
  empty: { ...type.subheadline, color: colors.iosLabel2, textAlign: 'center', marginTop: 80 },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget.minHeight + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.iosBg2,
  },
  rowFirst: { borderTopLeftRadius: radii.list, borderTopRightRadius: radii.list },
  rowLast: { borderBottomLeftRadius: radii.list, borderBottomRightRadius: radii.list },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.iosSeparator },
  rowPressed: { backgroundColor: colors.iosFill3 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.iosFill1,
  },
  radioOn: { borderWidth: 6, borderColor: colors.tint },
  rowText: { flex: 1, gap: 2 },
  rowName: { ...type.subheadline, fontWeight: '600' },
  caption: { ...type.footnote, color: colors.iosLabel2 },
});
