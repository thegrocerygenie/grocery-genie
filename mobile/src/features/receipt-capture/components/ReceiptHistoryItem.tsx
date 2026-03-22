import { Pressable, StyleSheet, Text, View } from 'react-native';

import { strings } from '@/constants/strings';
import { borderRadius, colors, shadows, spacing, typography } from '@/constants/theme';

interface ReceiptHistoryItemProps {
  storeName: string | null;
  date: string;
  total: number | null;
  itemCount: number;
  isPending?: boolean;
  onPress: () => void;
}

export function ReceiptHistoryItem({
  storeName,
  date,
  total,
  itemCount,
  isPending,
  onPress,
}: ReceiptHistoryItemProps) {
  const formattedDate = formatDate(date);
  const formattedTotal = total != null ? `$${total.toFixed(2)}` : '—';

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityLabel={`${storeName ?? 'Unknown store'}, ${formattedDate}, ${formattedTotal}, ${itemCount} items`}
      accessibilityRole="button"
    >
      {/* Store initial badge */}
      <View
        style={styles.badge}
        accessibilityElementsHidden
      >
        <Text style={styles.badgeText}>
          {(storeName ?? '?')[0].toUpperCase()}
        </Text>
      </View>

      {/* Left: store name + date */}
      <View style={styles.info}>
        <Text style={styles.storeName} numberOfLines={1}>
          {storeName ?? 'Unknown Store'}
        </Text>
        <Text style={styles.date}>{formattedDate}</Text>
        {isPending && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>{strings.history.pendingSync}</Text>
          </View>
        )}
      </View>

      {/* Right: total + item count */}
      <View style={styles.amounts}>
        <Text style={styles.total}>{formattedTotal}</Text>
        <Text style={styles.itemCount}>
          {itemCount} {strings.history.items}
        </Text>
      </View>

      {/* Chevron */}
      <Text style={styles.chevron} accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    minHeight: 72,
    ...shadows.card,
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  badgeText: {
    ...typography.bodyBold,
    color: '#FFFFFF',
    fontSize: 18,
  },
  info: {
    flex: 1,
    marginRight: spacing.sm,
  },
  storeName: {
    ...typography.bodyBold,
    color: colors.light.textPrimary,
  },
  date: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: colors.light.warning,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  pendingText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 11,
  },
  amounts: {
    alignItems: 'flex-end',
    marginRight: spacing.sm,
  },
  total: {
    fontSize: typography.money.fontSize,
    fontWeight: typography.money.fontWeight,
    color: colors.light.textPrimary,
  },
  itemCount: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: colors.light.textSecondary,
    fontWeight: '300',
  },
});
