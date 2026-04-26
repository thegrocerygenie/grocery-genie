/**
 * History — Receipts list, sorted by date.
 *
 * Drop-in for `app/(tabs)/history.tsx`. Uses:
 *   expo-router        — header search bar (real UISearchBar on iOS)
 *   expo-symbols       — SF Symbols
 *   @react-native-segmented-control/segmented-control — Week / Month / All
 *
 * Empty + filled states wired via `data` prop.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { colors, type, radii, spacing } from './theme';

type Receipt = {
  id: string;
  store: string;
  date: string;            // 'Apr 24'
  itemCount: number;
  total: number;
  category: keyof typeof colors.cat;
  symbol: string;          // SF Symbol
  pendingSync?: boolean;
};

const SAMPLE: Receipt[] = [
  { id: '1', store: "Trader Joe's",  date: 'Apr 24', itemCount: 12, total: 58.42, category: 'groceries', symbol: 'cart.fill' },
  { id: '2', store: 'Safeway',       date: 'Apr 22', itemCount: 8,  total: 42.11, category: 'groceries', symbol: 'cart.fill' },
  { id: '3', store: 'CVS',           date: 'Apr 21', itemCount: 0,  total: 14.80, category: 'personalCare', symbol: 'cross.case.fill', pendingSync: true },
  { id: '4', store: 'Whole Foods',   date: 'Apr 18', itemCount: 22, total: 126.75, category: 'groceries', symbol: 'cart.fill' },
  { id: '5', store: 'Target',        date: 'Apr 14', itemCount: 6,  total: 38.20, category: 'household', symbol: 'house.fill' },
];

type Filter = 0 | 1 | 2;

export default function History({
  data = SAMPLE,
}: {
  data?: Receipt[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(1);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((r) => r.store.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'History',
          headerLargeTitle: true,
          headerTransparent: true,
          headerBlurEffect: 'systemChromeMaterial',
          headerSearchBarOptions: {
            placeholder: 'Search by store',
            onChangeText: (e) => setSearch(e.nativeEvent.text),
          },
        }}
      />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
      >
        {filtered.length === 0 ? (
          <EmptyState hasQuery={!!search} />
        ) : (
          <>
            <SegmentedControl
              values={['Week', 'Month', 'All']}
              selectedIndex={filter}
              onChange={(e) =>
                setFilter(e.nativeEvent.selectedSegmentIndex as Filter)
              }
            />
            <View style={styles.listCard}>
              {filtered.map((r, i) => (
                <ReceiptRow
                  key={r.id}
                  r={r}
                  showDivider={i > 0}
                  onPress={() =>
                    router.push({ pathname: '/review', params: { id: r.id } })
                  }
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function ReceiptRow({
  r,
  showDivider,
  onPress,
}: {
  r: Receipt;
  showDivider: boolean;
  onPress: () => void;
}) {
  const sub = r.pendingSync
    ? 'Pending sync'
    : `${r.date} · ${r.itemCount} items`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider && styles.rowDivider,
        pressed && { backgroundColor: colors.iosFill3 },
      ]}
    >
      <View style={[styles.catCircle, { backgroundColor: colors.cat[r.category] }]}>
        <SymbolView name={r.symbol as any} size={14} tintColor="#fff" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.headline} numberOfLines={1}>{r.store}</Text>
        <Text
          style={[
            type.caption1,
            { color: r.pendingSync ? colors.orange : colors.iosLabel2, marginTop: 1 },
          ]}
        >
          {sub}
        </Text>
      </View>
      <Text style={[type.money, { fontSize: 15 }]}>${r.total.toFixed(2)}</Text>
      <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
    </Pressable>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <SymbolView
          name={hasQuery ? 'magnifyingglass' : 'clock.fill'}
          size={26}
          tintColor={colors.iosLabel2}
        />
      </View>
      <Text style={type.headline}>
        {hasQuery ? 'No matches' : 'No receipts yet'}
      </Text>
      <Text
        style={[
          type.footnote,
          { color: colors.iosLabel2, textAlign: 'center', maxWidth: 220, lineHeight: 19 },
        ]}
      >
        {hasQuery
          ? 'Try a different store name.'
          : 'Scanned receipts appear here, sorted by date.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },

  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  catCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: {
    minHeight: 480,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
