import React, { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { LoadErrorState } from '@/components/LoadErrorState';
import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
import { StoreSquare } from '@/features/price-intelligence/components/StoreSquare';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
import {
  useItem,
  usePriceHistory,
  useSplitItem,
} from '@/features/price-intelligence/hooks/useItems';
import type { PricePoint } from '@/features/price-intelligence/types';
import { formatUnitPrice } from '@/features/price-intelligence/utils/priceTrend';
import {
  canSaveSplit,
  groupStats,
  unitPriceVaries,
  type SplitDraft,
} from '@/features/price-intelligence/utils/split';
import { formatLongDate } from '@/features/receipt-capture/utils/receiptDate';
import { formatMoney } from '@/utils/money';

interface Draft extends SplitDraft {
  /** The user typed a name: picking lines no longer fills it in. */
  named: boolean;
}

const EMPTY: Draft = { name: '', lines: [], named: false };

function statsLine(points: PricePoint[]): string {
  const stats = groupStats(points);
  const average =
    stats.average === null ? null : formatMoney(stats.average, stats.currency ?? 'USD');
  return PRICES_COPY.splitStats(stats.count, average);
}

/**
 * PI-02 AC 10-13 (DA-6): split an item by line. The original ("N purchases
 * · $X avg") keeps every purchase until one is moved to a new item; any one
 * can move, even one of several with the same receipt name. Each new item
 * has a name (filled in from its first purchase's receipt name, editable)
 * and its own count and average; "+ Add another split" adds one more. Save
 * needs every new item named with a purchase, and the original keeping one;
 * it then opens the first new item. The unit-price warning (AC 12) shows here
 * as on item detail.
 */
export default function SplitScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const history = usePriceHistory(id);
  const split = useSplitItem();
  const [drafts, setDrafts] = useState<Draft[]>([EMPTY]);

  const points = history.data ? [...history.data.observations].reverse() : [];
  const allLines = points.map((p) => p.line_item_id);
  const owner = (lineId: string) => drafts.findIndex((d) => d.lines.includes(lineId));
  const pointsOf = (lines: string[]) => points.filter((p) => lines.includes(p.line_item_id));
  const kept = points.filter((p) => owner(p.line_item_id) === -1);
  const canSave = canSaveSplit(allLines, drafts) && !split.isPending;
  const draftName = (index: number) =>
    drafts[index].name.trim() || PRICES_COPY.splitNewItem(index + 1);
  const itemName = item.data?.canonical_name ?? '';

  /** Moves a line to new item `to`, or back to the original with -1. */
  const move = (point: PricePoint, to: number) =>
    setDrafts((current) =>
      current.map((draft, index) => {
        const without = draft.lines.filter((l) => l !== point.line_item_id);
        if (index !== to) return { ...draft, lines: without };
        // AC 11: the name starts as its first purchase's receipt name.
        const name = draft.named || without.length > 0 ? draft.name : point.line_name;
        return { ...draft, name, lines: [...without, point.line_item_id] };
      }),
    );

  const onLine = (point: PricePoint) => {
    const current = owner(point.line_item_id);
    if (drafts.length === 1) {
      move(point, current === -1 ? 0 : -1);
      return;
    }
    const options = [itemName, ...drafts.map((_, i) => draftName(i)), PRICES_COPY.cancel];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: PRICES_COPY.splitMoveTitle,
        options,
        cancelButtonIndex: options.length - 1,
      },
      (index) => {
        if (index === undefined || index === options.length - 1) return;
        move(point, index - 1);
      },
    );
  };

  const onSave = () =>
    split.mutate(
      {
        id,
        splits: drafts.map((d) => ({ name: d.name.trim(), line_item_ids: d.lines })),
      },
      {
        onSuccess: (items) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          if (items[0]) router.push({ pathname: '/items/[id]', params: { id: items[0].id } });
        },
        onError: () => Alert.alert(PRICES_COPY.actionFailed),
      },
    );

  const header = (
    <Stack.Screen
      options={{
        title: PRICES_COPY.splitTitle(drafts.length + 1),
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
            onPress={onSave}
            disabled={!canSave}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={PRICES_COPY.splitSaveLabel}
            accessibilityState={{ disabled: !canSave }}
          >
            <Text
              style={[styles.headerBtn, styles.headerSave, !canSave && styles.headerDisabled]}
              maxFontSizeMultiplier={fontScale.headerButtonMax}
            >
              {PRICES_COPY.save}
            </Text>
          </Pressable>
        ),
      }}
    />
  );

  if (item.isLoading || history.isLoading) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          <ActivityIndicator color={colors.tint} />
        </View>
      </>
    );
  }
  if (!item.data || !history.data) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          <LoadErrorState
            title={PRICES_COPY.itemLoadFailed}
            onRetry={() => {
              void item.refetch();
              void history.refetch();
            }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {unitPriceVaries(history.data.observations) ? (
          <View style={styles.warning} accessibilityRole="alert" testID="split-warning">
            <Text style={styles.warningText}>{PRICES_COPY.splitWarning}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel} accessibilityRole="header">
          {PRICES_COPY.splitOriginal}
        </Text>
        <View style={styles.listCard}>
          <View style={styles.cardRow} accessible>
            <Text style={type.headline}>{itemName}</Text>
            <Text style={styles.caption} testID="split-original-stats">
              {statsLine(kept)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel} accessibilityRole="header">
          {PRICES_COPY.splitInto}
        </Text>
        <View style={styles.listCard}>
          {drafts.map((draft, index) => (
            <View key={index} style={[styles.cardRow, index > 0 && styles.rowDivider]}>
              <View style={styles.nameRow}>
                <TextInput
                  value={draft.name}
                  onChangeText={(name) =>
                    setDrafts((current) =>
                      current.map((d, i) => (i === index ? { ...d, name, named: true } : d)),
                    )
                  }
                  placeholder={PRICES_COPY.splitNamePlaceholder}
                  placeholderTextColor={colors.iosLabel3}
                  style={styles.nameInput}
                  accessibilityLabel={PRICES_COPY.splitNameLabel(index + 1)}
                  returnKeyType="done"
                  maxLength={255}
                />
                {index > 0 ? (
                  <Pressable
                    onPress={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                    hitSlop={8}
                    style={styles.inlineButton}
                    accessibilityRole="button"
                    accessibilityLabel={PRICES_COPY.splitRemoveLabel(draftName(index))}
                  >
                    <Text style={styles.remove}>{PRICES_COPY.splitRemove}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.caption} testID={`split-new-stats-${index}`}>
                {statsLine(pointsOf(draft.lines))}
              </Text>
            </View>
          ))}
        </View>
        <Pressable
          onPress={() => setDrafts((current) => [...current, EMPTY])}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={PRICES_COPY.splitAddAnotherLabel}
        >
          <Text style={styles.addText}>{PRICES_COPY.splitAddAnother}</Text>
        </Pressable>

        <Text style={styles.sectionLabel} accessibilityRole="header">
          {PRICES_COPY.splitLines}
        </Text>
        <View style={styles.listCard}>
          {points.map((p, i) => {
            const store = p.store_name ?? PRICES_COPY.unknownStore;
            const price = formatUnitPrice(p.unit_price, p.currency, p.unit_of_measure);
            const at = owner(p.line_item_id);
            const destination = at === -1 ? itemName : draftName(at);
            return (
              <Pressable
                key={p.line_item_id}
                onPress={() => onLine(p)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={PRICES_COPY.splitLineLabel(
                  formatLongDate(p.date),
                  store,
                  price,
                  p.line_name,
                  destination,
                )}
                accessibilityHint={PRICES_COPY.splitLineHint}
                accessibilityState={{ selected: at !== -1 }}
              >
                <StoreSquare storeId={p.store_id} />
                <View style={styles.rowText}>
                  <Text style={type.body}>{formatLongDate(p.date)}</Text>
                  <Text style={styles.caption}>{`${store} · ${p.line_name}`}</Text>
                  <Text style={[styles.pill, at !== -1 && styles.pillMoved]}>{destination}</Text>
                </View>
                <Text style={styles.price}>{price}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.footer}>{PRICES_COPY.splitLinesFooter}</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  headerBtn: { ...type.body, color: colors.tint, paddingHorizontal: spacing.xs },
  headerSave: { fontWeight: '600' },
  headerDisabled: { color: colors.iosLabel3 },
  warning: {
    backgroundColor: colors.orangeBg,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  warningText: { ...type.footnote, color: colors.iosLabel2 },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
  listCard: { backgroundColor: colors.iosBg2, borderRadius: radii.list, overflow: 'hidden' },
  cardRow: {
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    gap: 2,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameInput: {
    ...type.headline,
    flex: 1,
    minHeight: touchTarget.minHeight,
    color: colors.iosLabel,
  },
  remove: { ...type.subheadline, color: colors.redText },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.iosSeparator },
  rowPressed: { backgroundColor: colors.iosFill3 },
  rowText: { flex: 1, gap: 2 },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  pill: { ...type.caption1, color: colors.iosLabel2, fontWeight: '600' },
  pillMoved: { color: colors.tint },
  price: { ...type.money, fontSize: 15 },
  inlineButton: { minHeight: touchTarget.minHeight, justifyContent: 'center' },
  addButton: {
    minHeight: touchTarget.minHeight,
    backgroundColor: colors.iosBg2,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { ...type.subheadline, fontWeight: '600', color: colors.tint },
  footer: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.6 },
});
