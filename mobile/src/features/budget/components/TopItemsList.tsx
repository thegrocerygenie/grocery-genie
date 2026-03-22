import { FlatList, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, shadows, spacing, typography } from '@/constants/theme';
import { strings } from '@/constants/strings';
import type { DashboardTopItem } from '../types';

interface TopItemsListProps {
  items: DashboardTopItem[];
}

function TopItemRow({ item, rank }: { item: DashboardTopItem; rank: number }) {
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Number ${rank}: ${item.name}, $${item.total_spent.toFixed(2)} total, purchased ${item.count} times`}
    >
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemCount}>
          {item.count} {item.count === 1 ? 'purchase' : 'purchases'}
        </Text>
      </View>
      <Text style={styles.itemTotal}>${item.total_spent.toFixed(2)}</Text>
    </View>
  );
}

export function TopItemsList({ items }: TopItemsListProps) {
  if (items.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{strings.dashboard.topItems}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.name}
        renderItem={({ item, index }) => <TopItemRow item={item} rank={index + 1} />}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    ...shadows.card,
  },
  sectionTitle: {
    ...typography.sectionHeader,
    color: colors.light.textPrimary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.border,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.light.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rankText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.light.primary,
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemName: {
    ...typography.body,
    color: colors.light.textPrimary,
  },
  itemCount: {
    ...typography.caption,
    color: colors.light.textSecondary,
  },
  itemTotal: {
    ...typography.money,
    color: colors.light.textPrimary,
  },
});
