/**
 * Review — Confirm OCR'd receipt before saving.
 *
 * Drop-in for `app/review.tsx`. Modal-style screen.
 * - Inset-grouped lists (the iOS pattern)
 * - Cancel / Save in nav bar (Stack.Screen options)
 * - Items list with low-confidence rows flagged for verify
 *
 * In production, replace `useState` initial value with your OCR result
 * passed via `useLocalSearchParams()` (see commented hook below).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Stack, useRouter /*, useLocalSearchParams */ } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, type, radii, spacing } from './theme';

type Item = {
  id: string;
  name: string;
  price: number | null;        // null = unrecognized → flag for verify
  confidence: number;          // 0–1
};

type ReviewData = {
  store: string;
  date: string;
  total: number;
  category: string;
  items: Item[];
};

const SAMPLE: ReviewData = {
  store: "Trader Joe's",
  date: 'Apr 24, 2026',
  total: 58.42,
  category: 'Groceries',
  items: [
    { id: '1', name: 'Bananas',       price: 2.49, confidence: 0.98 },
    { id: '2', name: 'Greek yogurt',  price: 4.99, confidence: 0.95 },
    { id: '3', name: 'Olive oil',     price: null, confidence: 0.42 },
    { id: '4', name: 'Sourdough',     price: 5.50, confidence: 0.91 },
    { id: '5', name: 'Avocados (4)',  price: 6.00, confidence: 0.88 },
  ],
};

export default function Review() {
  const router = useRouter();
  // const { uri } = useLocalSearchParams<{ uri: string }>();
  const [data, setData] = useState<ReviewData>(SAMPLE);

  const onSave = () => {
    // TODO: persist + dismiss
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          title: 'Review',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.headerBtn}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={onSave} hitSlop={12}>
              <Text style={[styles.headerBtn, { fontWeight: '600' }]}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {/* Receipt summary */}
        <ListGroup>
          <ListRow label="Store"    value={data.store}    chevron />
          <ListRow label="Date"     value={data.date}     chevron />
          <ListRow label="Total"    value={`$${data.total.toFixed(2)}`} />
          <ListRow label="Category" value={data.category} chevron />
        </ListGroup>

        {/* Items */}
        <View>
          <Text style={styles.sectionLabel}>ITEMS · {data.items.length}</Text>
          <View style={styles.listCard}>
            {data.items.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                showDivider={i > 0}
                onChangePrice={(p) =>
                  setData({
                    ...data,
                    items: data.items.map((x) => (x.id === item.id ? { ...x, price: p } : x)),
                  })
                }
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

// ─── List primitives ─────────────────────────────────────

function ListGroup({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <View style={styles.listCard}>
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {c}
          {i < items.length - 1 && <View style={styles.separator} />}
        </React.Fragment>
      ))}
    </View>
  );
}

function ListRow({
  label,
  value,
  chevron,
}: {
  label: string;
  value: string;
  chevron?: boolean;
}) {
  return (
    <Pressable style={styles.row} disabled={!chevron}>
      <Text style={type.body}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[type.body, { color: colors.iosLabel2 }]}>{value}</Text>
        {chevron && (
          <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} />
        )}
      </View>
    </Pressable>
  );
}

// ─── Item row with inline price edit ─────────────────────

function ItemRow({
  item,
  showDivider,
  onChangePrice,
}: {
  item: Item;
  showDivider: boolean;
  onChangePrice: (p: number | null) => void;
}) {
  const lowConf = item.confidence < 0.6;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.price?.toFixed(2) ?? '');

  return (
    <View style={[styles.row, showDivider && styles.rowDivider]}>
      <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
        {item.name}
      </Text>
      {editing ? (
        <TextInput
          autoFocus
          keyboardType="decimal-pad"
          value={text}
          onChangeText={setText}
          onBlur={() => {
            const n = parseFloat(text);
            onChangePrice(Number.isFinite(n) ? n : null);
            setEditing(false);
          }}
          style={[
            type.body,
            { color: colors.tint, fontWeight: '600', minWidth: 70, textAlign: 'right' },
          ]}
        />
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          {lowConf && <Text style={styles.verifyTag}>verify</Text>}
          <Text
            style={[
              type.body,
              {
                fontWeight: '600',
                color: lowConf || item.price === null ? colors.orange : colors.iosLabel,
              },
            ]}
          >
            {item.price === null ? '—' : `$${item.price.toFixed(2)}`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },

  headerBtn: { ...type.body, color: colors.tint },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },

  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },

  verifyTag: {
    ...type.caption2,
    color: colors.orange,
    fontWeight: '500',
  },
});
