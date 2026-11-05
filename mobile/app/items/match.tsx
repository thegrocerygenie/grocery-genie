import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { LoadErrorState } from '@/components/LoadErrorState';
import { colors, fontScale, radii, spacing, type } from '@/constants/theme';
import { PRICES_COPY } from '@/features/price-intelligence/constants';
import {
  ITEMS_KEY,
  useAcceptSuggestion,
  useRejectSuggestion,
} from '@/features/price-intelligence/hooks/useItems';
import {
  listReceiptSuggestions,
  listSuggestions,
} from '@/features/price-intelligence/services/itemsApi';
import { receiptSuggestionsKey } from '@/features/price-intelligence/services/postConfirmMatches';
import type { ItemSuggestion } from '@/features/price-intelligence/types';
import { unitSuffix } from '@/features/price-intelligence/utils/priceTrend';
import { formatLongDate, toIsoDate } from '@/features/receipt-capture/utils/receiptDate';
import { ApiError } from '@/services/api';
import { formatMoney } from '@/utils/money';
import { today } from '@/utils/today';

type Params = {
  /** After a confirm: that receipt's suggestions only (PI-02 AC 7). */
  receiptId?: string;
  /** From item detail: that item's suggestions only. */
  itemId?: string;
  /** Comma-separated ids to ask about (the post-scan prompt's unseen ones). */
  ids?: string;
  /** The suggestion to open on (a card on Review Matches or item detail). */
  start?: string;
};

/** A suggestion someone resolved elsewhere: 409, or 404 once a merge dropped it. */
function alreadyResolved(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404);
}

/** The suggestions to ask about, in order, from the one asked for first. */
function queueOf(all: ItemSuggestion[], params: Params): ItemSuggestion[] {
  const wanted = params.ids ? new Set(params.ids.split(',')) : null;
  const list = all.filter(
    (s) => (!params.itemId || s.item.id === params.itemId) && (!wanted || wanted.has(s.id)),
  );
  const first = params.start ? list.findIndex((s) => s.id === params.start) : -1;
  return first > 0 ? [...list.slice(first), ...list.slice(0, first)] : list;
}

/**
 * PI-02 AC 5, 6 (DA-5): the full-screen "Same item?" prompt, one medium-
 * confidence suggestion at a time. "Yes, merge" accepts, "Keep as separate
 * item" rejects (the server records `item_match_resolved` for both), Skip
 * leaves it pending and shows the next, Cancel closes leaving the rest
 * pending. After the last one it closes. AC 9: one resolved elsewhere (409)
 * is passed over quietly; a failed save keeps it open and says so inline.
 */
export default function MatchPromptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { receiptId, itemId } = params;
  const source = useQuery({
    queryKey: receiptId ? receiptSuggestionsKey(receiptId) : [...ITEMS_KEY, 'suggestions'],
    queryFn: () => (receiptId ? listReceiptSuggestions(receiptId) : listSuggestions()),
  });
  // Fixed once loaded, so a merge refetching the list cannot reorder it.
  const [queue, setQueue] = useState<ItemSuggestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  // From item detail: the item merged away, and the item it became.
  const [mergedInto, setMergedInto] = useState<string | null>(null);
  const accept = useAcceptSuggestion();
  const reject = useRejectSuggestion();
  const busy = accept.isPending || reject.isPending;

  // Derived once, during render: later refetches leave it as it is.
  if (queue === null && source.data) setQueue(queueOf(source.data, params));

  const close = (into: string | null = mergedInto) => {
    router.back();
    if (into) router.replace({ pathname: '/items/[id]', params: { id: into } });
  };

  // Nothing to ask (all resolved elsewhere meanwhile): close.
  const empty = queue !== null && queue.length === 0;
  useEffect(() => {
    if (empty) router.back();
  }, [empty, router]);

  /** The next suggestion, or close after the last one (AC 6). */
  const advance = (into: string | null = mergedInto) => {
    setFailed(false);
    if (queue && index + 1 >= queue.length) close(into);
    else setIndex((i) => i + 1);
  };

  const current = queue?.[index];

  // Set on the tap itself: isPending disables the buttons only after a
  // render, and a second mutate before then would drop the first one's
  // callbacks (its haptic, the next suggestion, the redirect).
  const saving = useRef(false);
  const release = () => {
    saving.current = false;
  };

  const onMerge = () => {
    if (!current || saving.current) return;
    saving.current = true;
    accept.mutate(current.id, {
      onSettled: release,
      onSuccess: (merged) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // From item detail, the item on screen merged away: open the result.
        const into =
          itemId && current.item.id === itemId && merged.id !== itemId ? merged.id : mergedInto;
        setMergedInto(into);
        advance(into);
      },
      onError: (error) => (alreadyResolved(error) ? advance() : setFailed(true)),
    });
  };

  const onKeep = () => {
    if (!current || saving.current) return;
    saving.current = true;
    reject.mutate(current.id, {
      onSettled: release,
      onSuccess: () => advance(),
      onError: (error) => (alreadyResolved(error) ? advance() : setFailed(true)),
    });
  };

  const header = (
    <Stack.Screen
      options={{
        title: PRICES_COPY.matchTitle,
        headerBackVisible: false,
        headerLeft: () => (
          <Pressable
            onPress={() => close()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={PRICES_COPY.matchCancelLabel}
          >
            <Text style={styles.headerBtn} maxFontSizeMultiplier={fontScale.headerButtonMax}>
              {PRICES_COPY.cancel}
            </Text>
          </Pressable>
        ),
        headerRight: () =>
          current ? (
            <Pressable
              onPress={() => advance()}
              disabled={busy}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={PRICES_COPY.matchSkipLabel}
              accessibilityState={{ disabled: busy }}
            >
              <Text style={styles.headerBtn} maxFontSizeMultiplier={fontScale.headerButtonMax}>
                {PRICES_COPY.matchSkip}
              </Text>
            </Pressable>
          ) : null,
      }}
    />
  );

  if (source.isError && !source.data) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          <LoadErrorState title={PRICES_COPY.loadFailed} onRetry={() => source.refetch()} />
        </View>
      </>
    );
  }
  if (!current || !queue) {
    return (
      <>
        {header}
        <View style={[styles.root, styles.center]}>
          <ActivityIndicator color={colors.tint} />
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
      >
        <Text style={styles.intro}>{PRICES_COPY.matchIntro}</Text>
        {queue.length > 1 ? (
          <Text style={styles.progress}>{PRICES_COPY.matchProgress(index + 1, queue.length)}</Text>
        ) : null}
        <MatchCards suggestion={current} />
        <View style={styles.spacer} />
        {failed ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {PRICES_COPY.matchSaveFailed}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            onPress={onMerge}
            disabled={busy}
            style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={PRICES_COPY.matchMergeLabel(
              current.receipt_line?.name ?? current.item.canonical_name,
              current.suggested_item.canonical_name,
            )}
            accessibilityState={{ disabled: busy, busy: accept.isPending }}
          >
            {accept.isPending ? (
              <ActivityIndicator color={colors.onTint} />
            ) : (
              <Text style={styles.primaryLabel}>{PRICES_COPY.matchMerge}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={onKeep}
            disabled={busy}
            style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={PRICES_COPY.matchKeepLabel(
              current.receipt_line?.name ?? current.item.canonical_name,
            )}
            accessibilityState={{ disabled: busy, busy: reject.isPending }}
          >
            {reject.isPending ? (
              <ActivityIndicator color={colors.iosLabel} />
            ) : (
              <Text style={styles.secondaryLabel}>{PRICES_COPY.matchKeep}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

/** As the design: "Apr 19" this year, "Apr 19, 2025" another year. */
function promptDate(iso: string, now: Date): string {
  const long = formatLongDate(iso);
  const thisYear = `, ${now.getFullYear()}`;
  return long.endsWith(thisYear) ? long.slice(0, -thisYear.length) : long;
}

/** PI-02 AC 5: the receipt line, the match percent, and the existing item. */
function MatchCards({ suggestion }: { suggestion: ItemSuggestion }) {
  const line = suggestion.receipt_line;
  const stats = suggestion.suggested_item_stats;
  const lineName = line?.name ?? suggestion.item.canonical_name;
  const now = today();
  const heading =
    line && line.date === toIsoDate(now)
      ? PRICES_COPY.matchFromToday
      : PRICES_COPY.matchFromReceipt;
  const where = line
    ? [line.store_name, promptDate(line.date, now)].filter(Boolean).join(' · ')
    : null;
  const percent = PRICES_COPY.matchPercent(suggestion.confidence);
  const counts = stats ? PRICES_COPY.matchCounts(stats.purchase_count, stats.store_count) : null;
  const average =
    stats && stats.avg_unit_price !== null
      ? `${formatMoney(stats.avg_unit_price, stats.currency ?? 'USD')} ${unitSuffix(
          stats.unit_of_measure,
        )}`.trim()
      : null;

  return (
    <>
      <View
        style={styles.card}
        accessible
        accessibilityLabel={[heading, lineName, where].filter(Boolean).join(', ')}
      >
        <Text style={styles.overline}>{heading}</Text>
        <Text style={styles.name}>{lineName}</Text>
        {where ? <Text style={styles.caption}>{where}</Text> : null}
      </View>

      <View style={styles.matchRow}>
        <View style={styles.rule} />
        <Text style={styles.matchText} testID="match-percent">
          {percent}
        </Text>
        <View style={styles.rule} />
      </View>

      <View
        style={styles.card}
        accessible
        accessibilityLabel={[
          PRICES_COPY.matchExisting,
          suggestion.suggested_item.canonical_name,
          counts,
          average ? `${PRICES_COPY.matchAverage} ${average}` : null,
        ]
          .filter(Boolean)
          .join(', ')}
      >
        <Text style={styles.overline}>{PRICES_COPY.matchExisting}</Text>
        <Text style={styles.name}>{suggestion.suggested_item.canonical_name}</Text>
        {counts ? <Text style={styles.caption}>{counts}</Text> : null}
        {average ? (
          <>
            <View style={styles.cardRule} />
            <View style={styles.averageRow}>
              <Text style={styles.averageLabel}>{PRICES_COPY.matchAverage}</Text>
              <Text style={styles.averageValue}>{average}</Text>
            </View>
          </>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerBtn: { ...type.body, color: colors.tint, paddingHorizontal: spacing.xs },
  intro: {
    ...type.subheadline,
    color: colors.iosLabel2,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  progress: { ...type.footnote, color: colors.iosLabel2, textAlign: 'center' },
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: 2,
  },
  overline: {
    ...type.caption2,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.66,
    marginBottom: spacing.xs,
  },
  name: { ...type.headline },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.iosSeparator },
  matchText: { ...type.caption1, color: colors.iosLabel2 },
  cardRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginHorizontal: -spacing.lg,
    marginVertical: spacing.md,
  },
  averageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  averageLabel: { ...type.footnote, color: colors.iosLabel2 },
  averageValue: { ...type.footnote, fontWeight: '600', fontVariant: ['tabular-nums'] },
  spacer: { flexGrow: 1 },
  error: { ...type.footnote, color: colors.redText, textAlign: 'center' },
  actions: { gap: spacing.sm },
  button: {
    minHeight: 50,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primary: { backgroundColor: colors.tint },
  secondary: { backgroundColor: colors.iosFill2 },
  primaryLabel: { ...type.headline, color: colors.onTint, textAlign: 'center' },
  secondaryLabel: { ...type.headline, color: colors.iosLabel, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
