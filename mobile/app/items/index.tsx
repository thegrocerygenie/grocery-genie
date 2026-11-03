import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';

import { LoadErrorState } from '@/components/LoadErrorState';
import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
import { useItems } from '@/features/price-intelligence/hooks/useItems';
import type { ItemSummary } from '@/features/price-intelligence/types';
import { formatUnitPrice } from '@/features/price-intelligence/utils/priceTrend';

/**
 * PI-01: every item the user has bought, most recent first, with its latest
 * unit price. Tapping one opens its price history.
 */
export default function PricesScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data, isLoading, isError, refetch, isRefetching } = useItems(query);
  const pending = data?.pending_suggestions ?? 0;

  const header = (
    <Stack.Screen
      options={{
        title: PRICES_COPY.listTitle,
        headerBackTitle: 'Budget',
        headerLargeTitle: true,
        headerBlurEffect: 'systemChromeMaterial',
        headerSearchBarOptions: {
          placeholder: PRICES_COPY.searchPlaceholder,
          onChangeText: (e) => setQuery(e.nativeEvent.text),
          hideWhenScrolling: false,
        },
      }}
    />
  );

  if (isError && !data) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          <LoadErrorState title={PRICES_COPY.loadFailed} onRetry={() => refetch()} />
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <FlatList
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        ListHeaderComponent={
          pending > 0 ? (
            <Pressable
              onPress={() => router.push('/items/matches')}
              style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={PRICES_COPY.matchesBanner(pending)}
              accessibilityHint={PRICES_COPY.matchesBannerHint}
            >
              <SymbolView name="link" size={17} tintColor={colors.tint} />
              <Text style={styles.bannerText}>{PRICES_COPY.matchesBanner(pending)}</Text>
              <SymbolView name="chevron.right" size={13} tintColor={colors.iosLabel3} />
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : (
            <View style={styles.empty}>
              <SymbolView name="tag" size={32} tintColor={colors.iosLabel3} />
              {query.trim() ? (
                <Text style={styles.emptyBody}>{PRICES_COPY.noResults(query.trim())}</Text>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>{PRICES_COPY.emptyTitle}</Text>
                  <Text style={styles.emptyBody}>{PRICES_COPY.emptyBody}</Text>
                </>
              )}
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <ItemRow
            item={item}
            first={index === 0}
            last={index === (data?.items.length ?? 0) - 1}
            onPress={() => router.push({ pathname: '/items/[id]', params: { id: item.id } })}
          />
        )}
      />
    </>
  );
}

interface ItemRowProps {
  item: ItemSummary;
  first: boolean;
  last: boolean;
  onPress: () => void;
}

function ItemRow({ item, first, last, onPress }: ItemRowProps) {
  const latest = item.latest_price;
  const price = latest
    ? formatUnitPrice(latest.unit_price, latest.currency, latest.unit_of_measure)
    : '';
  const counts = PRICES_COPY.priceCount(item.observation_count, item.store_count);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        !first && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.canonical_name}, ${price}, ${counts}`}
    >
      <View style={styles.rowText}>
        <Text style={type.body} numberOfLines={1}>
          {item.canonical_name}
        </Text>
        <Text style={styles.caption}>{counts}</Text>
      </View>
      <Text style={styles.price}>{price}</Text>
      <SymbolView name="chevron.right" size={13} tintColor={colors.iosLabel3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: 80 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radii.list,
    backgroundColor: colors.tintBg,
  },
  bannerText: { ...type.subheadline, flex: 1, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.iosBg2,
  },
  rowFirst: { borderTopLeftRadius: radii.list, borderTopRightRadius: radii.list },
  rowLast: { borderBottomLeftRadius: radii.list, borderBottomRightRadius: radii.list },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  rowPressed: { backgroundColor: colors.iosFill3 },
  rowText: { flex: 1, gap: 2 },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  price: { ...type.money, fontSize: 15 },
  empty: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: { ...type.headline, textAlign: 'center' },
  emptyBody: { ...type.footnote, color: colors.iosLabel2, textAlign: 'center' },
});
