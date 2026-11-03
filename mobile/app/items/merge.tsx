import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
import { useItem, useItems, useMergeItem } from '@/features/price-intelligence/hooks/useItems';
import type { ItemSummary } from '@/features/price-intelligence/types';

/**
 * PI-02 AC 3 (link): pick the item this one is the same product as. This
 * one's prices and names move there, and the app opens the combined item.
 */
export default function MergeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const source = useItem(id);
  const { data, isLoading } = useItems(query);
  const merge = useMergeItem();
  const name = source.data?.canonical_name ?? '';
  const candidates = (data?.items ?? []).filter((item) => item.id !== id);

  const onPick = (target: ItemSummary) =>
    Alert.alert(
      PRICES_COPY.combineConfirmTitle(name, target.canonical_name),
      PRICES_COPY.combineConfirmBody,
      [
        { text: PRICES_COPY.cancel, style: 'cancel' },
        {
          text: PRICES_COPY.combineAction,
          onPress: () =>
            merge.mutate(
              { id, intoId: target.id },
              {
                onSuccess: (merged) => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  // The old item is gone: leave its screen too, for the combined one.
                  router.back();
                  router.replace({ pathname: '/items/[id]', params: { id: merged.id } });
                },
                onError: () => Alert.alert(PRICES_COPY.actionFailed),
              },
            ),
        },
      ],
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: PRICES_COPY.combineTitle,
          headerSearchBarOptions: {
            placeholder: PRICES_COPY.searchPlaceholder,
            onChangeText: (e) => setQuery(e.nativeEvent.text),
            hideWhenScrolling: false,
          },
        }}
      />
      <FlatList
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        data={candidates}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Text style={styles.intro}>{PRICES_COPY.combineIntro(name)}</Text>}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <Text style={styles.empty}>
              {query.trim() ? PRICES_COPY.noResults(query.trim()) : PRICES_COPY.emptyTitle}
            </Text>
          )
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => onPick(item)}
            disabled={merge.isPending}
            style={({ pressed }) => [
              styles.row,
              index === 0 && styles.rowFirst,
              index === candidates.length - 1 && styles.rowLast,
              index > 0 && styles.rowDivider,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={item.canonical_name}
          >
            <View style={styles.rowText}>
              <Text style={type.body} numberOfLines={1}>
                {item.canonical_name}
              </Text>
              <Text style={styles.caption}>
                {PRICES_COPY.priceCount(item.observation_count, item.store_count)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, paddingBottom: 80 },
  intro: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  empty: { ...type.subheadline, color: colors.iosLabel2, textAlign: 'center', marginTop: 80 },
  row: {
    minHeight: touchTarget.minHeight + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    justifyContent: 'center',
    backgroundColor: colors.iosBg2,
  },
  rowFirst: { borderTopLeftRadius: radii.list, borderTopRightRadius: radii.list },
  rowLast: { borderBottomLeftRadius: radii.list, borderBottomRightRadius: radii.list },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  rowPressed: { backgroundColor: colors.iosFill3 },
  rowText: { gap: 2 },
  caption: { ...type.footnote, color: colors.iosLabel2 },
});
