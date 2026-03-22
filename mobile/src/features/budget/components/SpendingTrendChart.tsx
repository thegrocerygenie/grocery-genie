import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, shadows, spacing, typography } from '@/constants/theme';
import { strings } from '@/constants/strings';
import type { DashboardTrendMonth } from '../types';

interface SpendingTrendChartProps {
  trend: DashboardTrendMonth[];
}

function formatMonthLabel(period: string): string {
  const [, month] = period.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[parseInt(month, 10) - 1] ?? period;
}

export function SpendingTrendChart({ trend }: SpendingTrendChartProps) {
  if (trend.length === 0) return null;

  const maxSpent = Math.max(...trend.map((t) => t.spent), 1);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{strings.dashboard.trend}</Text>
      <View style={styles.chartContainer}>
        {trend.map((month) => {
          const barHeight = Math.max((month.spent / maxSpent) * 120, 4);
          const isCurrentMonth = month.period === trend[trend.length - 1]?.period;

          return (
            <View
              key={month.period}
              style={styles.barColumn}
              accessibilityLabel={`${formatMonthLabel(month.period)}: $${month.spent.toFixed(2)} spent`}
            >
              <Text style={styles.barAmount}>${month.spent.toFixed(0)}</Text>
              <View style={styles.barWrapper}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: isCurrentMonth
                        ? colors.light.primary
                        : colors.light.primaryLight,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.monthLabel,
                  isCurrentMonth && styles.monthLabelActive,
                ]}
              >
                {formatMonthLabel(month.period)}
              </Text>
            </View>
          );
        })}
      </View>
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
    marginBottom: spacing.base,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 180,
    paddingTop: spacing.xl,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barAmount: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.light.textSecondary,
    marginBottom: spacing.xs,
  },
  barWrapper: {
    justifyContent: 'flex-end',
    flex: 1,
    width: '100%',
    paddingHorizontal: spacing.md,
  },
  bar: {
    borderRadius: borderRadius.sm,
    width: '100%',
  },
  monthLabel: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: spacing.sm,
  },
  monthLabelActive: {
    color: colors.light.primary,
    fontWeight: '600',
  },
});
