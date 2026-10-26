import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import type { PendingReceipt } from '@/store/offlineStore';

import { formatQueuedAgo } from '../services/offlineQueue';

interface OfflineQueueSectionProps {
  pending: PendingReceipt[];
  isConnected: boolean;
  onPressFailed: (receipt: PendingReceipt) => void;
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
}: OfflineQueueSectionProps) {
  if (pending.length === 0) return null;

  const queued = pending.filter((r) => r.status !== 'failed').length;

  return (
    <View style={styles.root}>
      {queued > 0 ? (
        <View style={styles.banner} accessible accessibilityRole="summary">
          <View style={styles.bannerIcon}>
            <SymbolView name={isConnected ? 'arrow.up' : 'wifi.slash'} size={12} tintColor="#fff" />
          </View>
          <Text style={styles.bannerText}>
            {isConnected ? `Uploading ${plural(queued)}…` : `Offline · ${plural(queued)} queued`}
          </Text>
          {isConnected ? (
            <ActivityIndicator size="small" color={colors.orange} />
          ) : (
            <Text style={styles.bannerAction}>Will sync</Text>
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

interface PendingRowProps {
  receipt: PendingReceipt;
  isConnected: boolean;
  showDivider: boolean;
  onPressFailed: (receipt: PendingReceipt) => void;
}

function PendingRow({ receipt, isConnected, showDivider, onPressFailed }: PendingRowProps) {
  const failed = receipt.status === 'failed';
  const detail = failed
    ? 'Couldn’t read this photo'
    : `${formatQueuedAgo(receipt.capturedAt)} · ${isConnected ? 'uploading' : 'waiting for connection'}`;

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
      {failed ? (
        <SymbolView name="chevron.right" size={12} tintColor={colors.iosLabel3 as string} />
      ) : null}
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
  sectionLabel: {
    ...type.footnote,
    color: colors.iosLabel2 as string,
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
  detail: { ...type.caption1, color: colors.iosLabel2 as string, marginTop: 1 },
  detailFailed: { color: colors.red },
});
