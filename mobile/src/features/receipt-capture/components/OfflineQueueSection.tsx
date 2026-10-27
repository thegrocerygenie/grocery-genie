import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import type { PendingReceipt } from '@/store/offlineStore';

import { formatQueuedAgo } from '../services/offlineQueue';
import { QUOTA_HINT } from '../utils/scanQuota';

interface OfflineQueueSectionProps {
  pending: PendingReceipt[];
  isConnected: boolean;
  onPressFailed: (receipt: PendingReceipt) => void;
  /** Upload the queue now; offered after a failed attempt while online. */
  onRetry: () => void;
}

function plural(n: number): string {
  return `${n} receipt${n === 1 ? '' : 's'}`;
}

/**
 * History's "Pending" group (design: Offline · sync queue): receipts captured
 * without a connection, with a banner that says whether they wait or upload.
 */
export function OfflineQueueSection({
  pending,
  isConnected,
  onPressFailed,
  onRetry,
}: OfflineQueueSectionProps) {
  if (pending.length === 0) return null;

  const banner = bannerState(
    pending.filter((r) => r.status !== 'failed'),
    isConnected,
  );

  return (
    <View style={styles.root}>
      {banner ? (
        // Grouped for VoiceOver, unless that would hide the retry button inside.
        <View style={styles.banner} accessible={!banner.retry} accessibilityRole="summary">
          <View style={styles.bannerIcon}>
            <SymbolView name={banner.symbol} size={12} tintColor="#fff" />
          </View>
          <Text style={styles.bannerText}>{banner.text}</Text>
          {banner.retry ? (
            <Pressable
              onPress={onRetry}
              hitSlop={12}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
              accessibilityRole="button"
              accessibilityLabel="Retry upload now"
            >
              <Text style={styles.bannerAction}>{banner.action}</Text>
            </Pressable>
          ) : banner.action ? (
            <Text style={styles.bannerAction}>{banner.action}</Text>
          ) : (
            <ActivityIndicator size="small" color={colors.orange} />
          )}
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Pending</Text>
      <View style={styles.listCard}>
        {pending.map((receipt, i) => (
          <PendingRow
            key={receipt.id}
            receipt={receipt}
            isConnected={isConnected}
            showDivider={i > 0}
            onPressFailed={onPressFailed}
          />
        ))}
      </View>
    </View>
  );
}

interface BannerState {
  symbol: 'wifi.slash' | 'arrow.up' | 'arrow.clockwise';
  text: string;
  /** Right-hand label; null while an upload runs, so a spinner shows instead. */
  action: string | null;
  /** The label is a button that uploads now. */
  retry?: boolean;
}

/**
 * Offline: waiting for a connection. Online: uploading while an upload runs or
 * before any has been tried; after a failed attempt, waiting to retry (useSyncQueue
 * retries on a timer) with a button to retry now, so the banner never claims an
 * upload is running while the server is down.
 */
function bannerState(queued: PendingReceipt[], isConnected: boolean): BannerState | null {
  if (queued.length === 0) return null;
  const count = plural(queued.length);
  if (!isConnected) {
    return { symbol: 'wifi.slash', text: `Offline · ${count} queued`, action: 'Will sync' };
  }
  const uploading = queued.some((r) => r.status === 'syncing');
  if (!uploading && queued.some((r) => r.lastAttemptFailed)) {
    return {
      symbol: 'arrow.clockwise',
      text: `${count} waiting to upload`,
      action: 'Retry Now',
      retry: true,
    };
  }
  return { symbol: 'arrow.up', text: `Uploading ${count}…`, action: null };
}

/** What a queued row is doing, shown after its capture time. */
function rowState(receipt: PendingReceipt, isConnected: boolean): string {
  if (!isConnected) return 'waiting for connection';
  if (receipt.status !== 'syncing' && receipt.lastAttemptFailed) return 'will retry';
  return 'uploading';
}

/** Why a failed row will never upload. */
function failedReason(receipt: PendingReceipt): string {
  return receipt.failure === 'quota' ? QUOTA_HINT : 'Couldn’t read this photo';
}

interface PendingRowProps {
  receipt: PendingReceipt;
  isConnected: boolean;
  showDivider: boolean;
  onPressFailed: (receipt: PendingReceipt) => void;
}

function PendingRow({ receipt, isConnected, showDivider, onPressFailed }: PendingRowProps) {
  const failed = receipt.status === 'failed';
  const detail = failed
    ? failedReason(receipt)
    : `${formatQueuedAgo(receipt.capturedAt)} · ${rowState(receipt, isConnected)}`;

  return (
    <Pressable
      disabled={!failed}
      onPress={() => onPressFailed(receipt)}
      style={({ pressed }) => [
        styles.row,
        showDivider && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole={failed ? 'button' : undefined}
      accessibilityLabel={`Scanned receipt, ${detail}`}
      accessibilityHint={failed ? 'Enter it manually or discard the photo' : undefined}
    >
      <View style={[styles.iconSquare, failed ? styles.iconFailed : styles.iconQueued]}>
        <SymbolView
          name={failed ? 'exclamationmark.triangle.fill' : 'clock.fill'}
          size={14}
          tintColor="#fff"
        />
      </View>
      <View style={styles.rowText}>
        <Text style={type.body}>Scanned receipt</Text>
        <Text style={[styles.detail, failed && styles.detailFailed]}>{detail}</Text>
      </View>
      {failed ? <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: spacing.md },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radii.card,
    backgroundColor: colors.orangeBg,
    marginBottom: spacing.md,
  },
  bannerIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { ...type.footnote, flex: 1, color: colors.iosLabel },
  bannerAction: { ...type.caption1, color: colors.orange, fontWeight: '600' },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginVertical: -10,
    borderRadius: radii.button,
  },
  retryPressed: { opacity: 0.5 },
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    minHeight: 44,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  rowPressed: { backgroundColor: colors.iosFill3 },
  iconSquare: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconQueued: { backgroundColor: colors.orange },
  iconFailed: { backgroundColor: colors.red },
  rowText: { flex: 1, minWidth: 0 },
  detail: { ...type.caption1, color: colors.iosLabel2, marginTop: 1 },
  detailFailed: { color: colors.red },
});
