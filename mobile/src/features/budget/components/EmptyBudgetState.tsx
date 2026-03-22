import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing, typography } from '@/constants/theme';
import { strings } from '@/constants/strings';

interface EmptyBudgetStateProps {
  onSetBudget: () => void;
  hasReceipts: boolean;
}

export function EmptyBudgetState({ onSetBudget, hasReceipts }: EmptyBudgetStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📊</Text>
      <Text style={styles.message}>
        {hasReceipts ? strings.dashboard.noBudgetSet : strings.dashboard.noReceipts}
      </Text>
      {hasReceipts && (
        <Pressable
          style={styles.button}
          onPress={onSetBudget}
          accessibilityLabel={strings.dashboard.setBudget}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{strings.dashboard.setBudget}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.xl,
  },
  message: {
    ...typography.body,
    color: colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.light.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  buttonText: {
    ...typography.bodyBold,
    color: colors.light.surface,
  },
});
