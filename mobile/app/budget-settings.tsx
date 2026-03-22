import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { borderRadius, colors, shadows, spacing, touchTarget, typography } from '@/constants/theme';
import { strings } from '@/constants/strings';
import { useBudgetCreate } from '@/features/budget/hooks/useBudget';
import { useCategories } from '@/features/budget/hooks/useCategories';

export default function BudgetSettingsScreen() {
  const { data: categories } = useCategories();
  const budgetCreate = useBudgetCreate();

  const [overallAmount, setOverallAmount] = useState('');
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, string>>({});
  const [thresholds, setThresholds] = useState({ fifty: false, eighty: true, hundred: true });
  const [startDay, setStartDay] = useState('1');
  const [isSaving, setIsSaving] = useState(false);

  const handleCategoryAmountChange = useCallback((categoryId: string, value: string) => {
    setCategoryAmounts((prev) => ({ ...prev, [categoryId]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(Math.min(parseInt(startDay, 10) || 1, 28)).padStart(2, '0');
    const periodStart = `${year}-${month}-${day}`;

    try {
      // Create overall budget
      if (overallAmount && parseFloat(overallAmount) > 0) {
        await budgetCreate.mutateAsync({
          category_id: null,
          amount: parseFloat(overallAmount),
          period_type: 'monthly',
          period_start: periodStart,
        });
      }

      // Create per-category budgets
      for (const [categoryId, amount] of Object.entries(categoryAmounts)) {
        if (amount && parseFloat(amount) > 0) {
          await budgetCreate.mutateAsync({
            category_id: categoryId,
            amount: parseFloat(amount),
            period_type: 'monthly',
            period_start: periodStart,
          });
        }
      }

      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save budget. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [overallAmount, categoryAmounts, startDay, budgetCreate]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Overall Budget */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {strings.budgetSettings.overallBudget}
            </Text>
            <View style={styles.inputRow}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={overallAmount}
                onChangeText={setOverallAmount}
                keyboardType="decimal-pad"
                placeholder={strings.budgetSettings.amountPlaceholder}
                placeholderTextColor={colors.light.disabled}
                accessibilityLabel="Overall monthly budget amount"
              />
            </View>
          </View>

          {/* Per-Category Budgets */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {strings.budgetSettings.categoryBudgets}
            </Text>
            {categories?.map((category) => (
              <View key={category.id} style={styles.categoryRow}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <View style={styles.categoryInputWrapper}>
                  <Text style={styles.currencySymbolSmall}>$</Text>
                  <TextInput
                    style={styles.categoryInput}
                    value={categoryAmounts[category.id] ?? ''}
                    onChangeText={(val) => handleCategoryAmountChange(category.id, val)}
                    keyboardType="decimal-pad"
                    placeholder={strings.budgetSettings.amountPlaceholder}
                    placeholderTextColor={colors.light.disabled}
                    accessibilityLabel={`${category.name} budget amount`}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Alert Thresholds */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {strings.budgetSettings.alertThresholds}
            </Text>
            <View style={styles.thresholdRow}>
              <Text style={styles.thresholdLabel}>50%</Text>
              <Switch
                value={thresholds.fifty}
                onValueChange={(v) => setThresholds((p) => ({ ...p, fifty: v }))}
                trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
                thumbColor={thresholds.fifty ? colors.light.primary : colors.light.disabled}
                accessibilityLabel="Alert at 50 percent"
              />
            </View>
            <View style={styles.thresholdRow}>
              <Text style={styles.thresholdLabel}>80%</Text>
              <Switch
                value={thresholds.eighty}
                onValueChange={(v) => setThresholds((p) => ({ ...p, eighty: v }))}
                trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
                thumbColor={thresholds.eighty ? colors.light.primary : colors.light.disabled}
                accessibilityLabel="Alert at 80 percent"
              />
            </View>
            <View style={styles.thresholdRow}>
              <Text style={styles.thresholdLabel}>100%</Text>
              <Switch
                value={thresholds.hundred}
                onValueChange={(v) => setThresholds((p) => ({ ...p, hundred: v }))}
                trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
                thumbColor={thresholds.hundred ? colors.light.primary : colors.light.disabled}
                accessibilityLabel="Alert at 100 percent"
              />
            </View>
          </View>

          {/* Budget Start Date */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {strings.budgetSettings.startDate}
            </Text>
            <View style={styles.inputRow}>
              <Text style={styles.dayLabel}>{strings.budgetSettings.dayOfMonth}:</Text>
              <TextInput
                style={styles.dayInput}
                value={startDay}
                onChangeText={setStartDay}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Budget start day of month"
              />
            </View>
          </View>
        </ScrollView>

        {/* Save Button */}
        <View style={styles.saveContainer}>
          <Pressable
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityLabel={isSaving ? strings.budgetSettings.saving : strings.budgetSettings.save}
            accessibilityRole="button"
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? strings.budgetSettings.saving : strings.budgetSettings.save}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    ...shadows.card,
  },
  sectionTitle: {
    ...typography.sectionHeader,
    color: colors.light.textPrimary,
    marginBottom: spacing.base,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    ...typography.moneyLarge,
    color: colors.light.textSecondary,
    marginRight: spacing.sm,
  },
  amountInput: {
    ...typography.moneyLarge,
    color: colors.light.textPrimary,
    flex: 1,
    borderBottomWidth: 2,
    borderBottomColor: colors.light.primary,
    paddingVertical: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: touchTarget.minHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.border,
  },
  categoryName: {
    ...typography.body,
    color: colors.light.textPrimary,
    flex: 1,
  },
  categoryInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 120,
  },
  currencySymbolSmall: {
    ...typography.money,
    color: colors.light.textSecondary,
    marginRight: spacing.xs,
  },
  categoryInput: {
    ...typography.money,
    color: colors.light.textPrimary,
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
    paddingVertical: spacing.xs,
    textAlign: 'right',
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: touchTarget.minHeight,
  },
  thresholdLabel: {
    ...typography.bodyBold,
    color: colors.light.textPrimary,
  },
  dayLabel: {
    ...typography.body,
    color: colors.light.textSecondary,
    marginRight: spacing.md,
  },
  dayInput: {
    ...typography.bodyBold,
    color: colors.light.textPrimary,
    width: 60,
    borderBottomWidth: 2,
    borderBottomColor: colors.light.primary,
    paddingVertical: spacing.sm,
    textAlign: 'center',
  },
  saveContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.light.background,
  },
  saveButton: {
    backgroundColor: colors.light.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.base,
    alignItems: 'center',
    minHeight: touchTarget.minHeight,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...typography.bodyBold,
    color: colors.light.surface,
  },
});
