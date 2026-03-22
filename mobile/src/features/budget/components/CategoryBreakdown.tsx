import { FlatList, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, shadows, spacing, typography } from '@/constants/theme';
import { strings } from '@/constants/strings';
import type { BudgetCategorySummary } from '../types';

interface CategoryBreakdownProps {
  categories: BudgetCategorySummary[];
}

function getCategoryBarColor(percent: number) {
  if (percent >= 100) return colors.light.danger;
  if (percent >= 80) return colors.light.warning;
  return colors.light.primary;
}

function CategoryRow({ item }: { item: BudgetCategorySummary }) {
  const barColor = getCategoryBarColor(item.percent);
  const clampedPercent = Math.min(item.percent, 100);

  return (
    <View
      style={styles.row}
      accessibilityLabel={`${item.name}: $${item.spent.toFixed(2)} spent${item.budget > 0 ? ` of $${item.budget.toFixed(2)}` : ''}, ${item.percent.toFixed(0)} percent`}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.categoryName}>{item.name}</Text>
        <Text style={styles.categoryAmount}>
          ${item.spent.toFixed(2)}
          {item.budget > 0 && (
            <Text style={styles.categoryBudget}> / ${item.budget.toFixed(2)}</Text>
          )}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              width: clampedPercent > 0 ? `${clampedPercent}%` : 2,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

export function CategoryBreakdown({ categories }: CategoryBreakdownProps) {
  const sorted = [...categories].sort((a, b) => b.spent - a.spent);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{strings.dashboard.categories}</Text>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.category_id}
        renderItem={({ item }) => <CategoryRow item={item} />}
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
    marginBottom: spacing.md,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  categoryName: {
    ...typography.body,
    color: colors.light.textPrimary,
  },
  categoryAmount: {
    ...typography.money,
    color: colors.light.textPrimary,
  },
  categoryBudget: {
    ...typography.caption,
    color: colors.light.textSecondary,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.light.primaryLight,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
