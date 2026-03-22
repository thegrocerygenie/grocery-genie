import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, shadows, spacing, typography } from '@/constants/theme';
import { strings } from '@/constants/strings';

interface BudgetProgressCardProps {
  budget: number;
  spent: number;
  remaining: number;
  percent: number;
  daysLeft: number;
}

function getProgressColor(percent: number) {
  if (percent >= 100) return colors.light.danger;
  if (percent >= 80) return colors.light.warning;
  return colors.light.primary;
}

function getProgressBackgroundColor(percent: number) {
  if (percent >= 100) return colors.light.dangerLight;
  if (percent >= 80) return colors.light.warningLight;
  return colors.light.primaryLight;
}

export function BudgetProgressCard({
  budget,
  spent,
  remaining,
  percent,
  daysLeft,
}: BudgetProgressCardProps) {
  const progressColor = getProgressColor(percent);
  const progressBg = getProgressBackgroundColor(percent);
  const isOverBudget = percent >= 100;
  const clampedPercent = Math.min(percent, 100);

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`Budget progress: $${spent.toFixed(2)} spent of $${budget.toFixed(2)} budget, ${percent.toFixed(0)} percent`}
      accessibilityValue={{ min: 0, max: budget, now: spent }}
    >
      <View style={styles.headerRow}>
        <Text style={styles.spentLabel}>{strings.dashboard.spent}</Text>
        <Text style={styles.periodLabel}>
          {daysLeft} {strings.dashboard.daysLeft}
        </Text>
      </View>

      <Text style={[styles.spentAmount, { color: progressColor }]}>
        ${spent.toFixed(2)}
      </Text>

      <Text style={styles.budgetContext}>
        {strings.dashboard.ofBudget} ${budget.toFixed(2)}
      </Text>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: progressBg }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${clampedPercent}%`,
              backgroundColor: progressColor,
            },
          ]}
        />
      </View>

      {/* Remaining / Over budget */}
      <Text style={[styles.remainingText, { color: progressColor }]}>
        {isOverBudget
          ? `${strings.dashboard.overBudget} — $${Math.abs(remaining).toFixed(2)}`
          : `$${remaining.toFixed(2)} ${strings.dashboard.remaining}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    ...shadows.elevated,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  spentLabel: {
    ...typography.caption,
    color: colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  periodLabel: {
    ...typography.caption,
    color: colors.light.textSecondary,
  },
  spentAmount: {
    ...typography.moneyLarge,
    marginBottom: spacing.xs,
  },
  budgetContext: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginBottom: spacing.base,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  remainingText: {
    ...typography.bodyBold,
  },
});
