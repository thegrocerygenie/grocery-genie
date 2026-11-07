import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, fontScale, radii, spacing, touchTarget, type } from '@/constants/theme';
import { STORE_MERGE_COPY as COPY } from '@/features/price-intelligence/constants';
import {
  useMergeStore,
  useStores,
  useUnmergeStore,
} from '@/features/price-intelligence/hooks/useStores';
import type { StoreSummary } from '@/features/price-intelligence/types';

/**
 * Settings → Stores (EC Price Intelligence 1, decision D3). Branch numbers
 * already group on their own; here the user merges two names that are the
 * same store, so prices compare as one. Only this user's prices regroup.
 */
export default function StoresScreen() {
  const stores = useStores();
  const merge = useMergeStore();
  const unmerge = useUnmergeStore();
  const [source, setSource] = useState<StoreSummary | null>(null);

  const list = stores.data?.stores ?? [];
  const failed = () => Alert.alert(COPY.saveFailedTitle, COPY.saveFailedBody);

  const onPick = (target: StoreSummary) => {
    if (!source) return;
    merge.mutate({ id: source.id, intoId: target.id }, { onError: failed });
    setSource(null);
  };

  return (
    <>
      <Stack.Screen options={{ title: COPY.title, headerBackTitle: COPY.back }} />
      <FlatList
        style={styles.root}
        contentContainerStyle={styles.content}
        data={list}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={
          list.length > 0 ? <Text style={styles.sectionLabel}>{COPY.header}</Text> : null
        }
        ListEmptyComponent={
          stores.isPending ? (
            <LoadingRows />
          ) : stores.isError ? (
            <ErrorState onRetry={() => stores.refetch()} />
          ) : (
            <EmptyState />
          )
        }
        ListFooterComponent={
          list.length > 0 ? (
            <Text style={styles.sectionFooter}>
              {list.length === 1 ? COPY.onlyOne : COPY.footer}
            </Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.cardGap} />}
        renderItem={({ item }) => (
          <StoreCard
            store={item}
            canMerge={list.length > 1}
            onMerge={() => setSource(item)}
            onUnmerge={(id) => unmerge.mutate(id, { onError: failed })}
          />
        )}
      />
      <MergeSheet
        source={source}
        targets={list.filter((s) => s.id !== source?.id)}
        onPick={onPick}
        onClose={() => setSource(null)}
      />
    </>
  );
}

interface StoreCardProps {
  store: StoreSummary;
  canMerge: boolean;
  onMerge: () => void;
  onUnmerge: (id: string) => void;
}

function StoreCard({ store, canMerge, onMerge, onUnmerge }: StoreCardProps) {
  // At accessibility sizes Merge beside the name left it too little room, and
  // words broke mid-word ("Cost co", F4): the button goes under the text.
  const stacked = useWindowDimensions().fontScale >= fontScale.accessibility;
  const rowStyle = [styles.row, stacked && styles.rowStacked];
  const nameLines = stacked ? undefined : 2;
  return (
    <View style={styles.listCard}>
      <View style={rowStyle} testID={`store-row-${store.id}`}>
        <View style={[styles.rowText, stacked && styles.rowTextStacked]}>
          <Text style={type.body} numberOfLines={nameLines}>
            {store.name}
          </Text>
          <Text style={styles.caption}>{COPY.receipts(store.receipt_count)}</Text>
        </View>
        {canMerge ? (
          <Pressable
            onPress={onMerge}
            hitSlop={8}
            style={styles.inlineButton}
            accessibilityRole="button"
            accessibilityLabel={COPY.mergeLabel(store.name)}
          >
            <Text style={styles.link}>{COPY.merge}</Text>
          </Pressable>
        ) : null}
      </View>
      {store.merged_stores.map((m) => (
        <View key={m.id} style={[rowStyle, styles.rowDivider]} testID={`store-row-${m.id}`}>
          <View style={[styles.rowText, stacked && styles.rowTextStacked]}>
            <Text style={type.body} numberOfLines={nameLines}>
              {m.name}
            </Text>
            <Text style={styles.caption}>{COPY.mergedInto(store.name)}</Text>
          </View>
          <Pressable
            onPress={() => onUnmerge(m.id)}
            hitSlop={8}
            style={styles.inlineButton}
            accessibilityRole="button"
            accessibilityLabel={COPY.unmergeLabel(m.name)}
          >
            <Text style={styles.link}>{COPY.unmerge}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

interface MergeSheetProps {
  source: StoreSummary | null;
  targets: StoreSummary[];
  onPick: (target: StoreSummary) => void;
  onClose: () => void;
}

function MergeSheet({ source, targets, onPick, onClose }: MergeSheetProps) {
  return (
    <Modal animationType="slide" transparent visible={source !== null} onRequestClose={onClose}>
      {/* Taps only: accessible, these would hide the options from VoiceOver. */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessible={false}
        onAccessibilityEscape={onClose}
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessible={false}>
          {source ? (
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {COPY.pickerTitle(source.name)}
            </Text>
          ) : null}
          {/* A list that scrolls inside the capped sheet: a user can have many stores. */}
          <FlatList
            testID="merge-sheet-list"
            style={[styles.listCard, styles.sheetList]}
            data={targets}
            keyExtractor={(t) => t.id}
            renderItem={({ item: t, index: i }) => (
              <Pressable
                onPress={() => onPick(t)}
                style={[styles.row, i > 0 && styles.rowDivider]}
                accessibilityRole="button"
                accessibilityLabel={source ? COPY.pickerOptionLabel(source.name, t.name) : t.name}
              >
                <Text style={type.body} numberOfLines={2}>
                  {t.name}
                </Text>
              </Pressable>
            )}
          />
          <Pressable
            onPress={onClose}
            style={[styles.listCard, styles.row, styles.cancel]}
            accessibilityRole="button"
            accessibilityLabel={COPY.cancel}
          >
            <Text style={styles.cancelText}>{COPY.cancel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LoadingRows() {
  return (
    <View style={styles.listCard} accessibilityElementsHidden>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.row, i > 0 && styles.rowDivider]}>
          <View style={styles.skeleton} />
        </View>
      ))}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <SymbolView name="storefront" size={40} tintColor={colors.iosLabel3} />
      <Text style={type.headline}>{COPY.emptyTitle}</Text>
      <Text style={styles.emptyBody}>{COPY.emptyBody}</Text>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={type.headline}>{COPY.loadFailed}</Text>
      <Pressable
        onPress={onRetry}
        style={styles.inlineButton}
        accessibilityRole="button"
        accessibilityLabel={COPY.retry}
      >
        <Text style={styles.link}>{COPY.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg },
  cardGap: { height: spacing.md },

  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionFooter: {
    ...type.footnote,
    color: colors.iosLabel2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
    gap: spacing.md,
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  rowText: { flex: 1, gap: spacing.xs / 2 },
  rowTextStacked: { flex: 0, alignSelf: 'stretch' },
  caption: { ...type.footnote, color: colors.iosLabel2 },
  inlineButton: {
    ...touchTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  link: { ...type.body, color: colors.tint },

  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  // Takes only the room its rows need, and shrinks to scroll in the capped sheet.
  sheetList: { flexGrow: 0, flexShrink: 1 },
  sheetTitle: {
    ...type.footnote,
    color: colors.iosLabel2,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  cancel: { justifyContent: 'center' },
  cancelText: { ...type.headline, color: colors.tint },

  skeleton: {
    height: spacing.lg,
    width: '60%',
    borderRadius: radii.card,
    backgroundColor: colors.iosFill1,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyBody: { ...type.subheadline, color: colors.iosLabel2, textAlign: 'center' },
});
