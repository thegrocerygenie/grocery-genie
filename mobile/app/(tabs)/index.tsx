import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { borderRadius, colors, spacing, touchTarget, typography } from '@/constants/theme';
import { strings } from '@/constants/strings';
import { BudgetProgressCard } from '@/features/budget/components/BudgetProgressCard';
import { CategoryBreakdown } from '@/features/budget/components/CategoryBreakdown';
import { EmptyBudgetState } from '@/features/budget/components/EmptyBudgetState';
import { SpendingTrendChart } from '@/features/budget/components/SpendingTrendChart';
import { TopItemsList } from '@/features/budget/components/TopItemsList';
import { useDashboardSpending } from '@/features/budget/hooks/useDashboard';
import { useBudgetStore } from '@/store/budgetStore';

export default function DashboardScreen() {
  const { selectedPeriod } = useBudgetStore();
  const { data, isLoading, isError, refetch, isRefetching } = useDashboardSpending(selectedPeriod);

  const handleSetBudget = useCallback(() => {
    router.push('/budget-settings');
  }, []);

  const handleOpenNotificationSettings = useCallback(() => {
    router.push('/notification-settings');
  }, []);

  const daysLeft = useMemo(() => {
    const now = new Date();
    const [year, month] = selectedPeriod.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const currentDay = now.getDate();
    return Math.max(0, lastDay - currentDay);
  }, [selectedPeriod]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.light.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const hasNoBudget = !data || data.overall.budget === 0;
  const hasNoSpending = !data || (data.overall.spent === 0 && data.top_items.length === 0);

  if (hasNoBudget && hasNoSpending) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{strings.dashboard.title}</Text>
          <Pressable
            style={styles.settingsButton}
            onPress={handleOpenNotificationSettings}
            accessibilityLabel="Notification settings"
            accessibilityRole="button"
          >
            <Text style={styles.settingsIcon}>{'⚙'}</Text>
          </Pressable>
        </View>
        <EmptyBudgetState
          onSetBudget={handleSetBudget}
          hasReceipts={false}
        />
      </SafeAreaView>
    );
  }

  if (hasNoBudget && !hasNoSpending) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{strings.dashboard.title}</Text>
          <Pressable
            style={styles.settingsButton}
            onPress={handleOpenNotificationSettings}
            accessibilityLabel="Notification settings"
            accessibilityRole="button"
          >
            <Text style={styles.settingsIcon}>{'⚙'}</Text>
          </Pressable>
        </View>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.light.primary}
            />
          }
          contentContainerStyle={styles.scrollContent}
        >
          <EmptyBudgetState
            onSetBudget={handleSetBudget}
            hasReceipts={true}
          />
          {data && data.top_items.length > 0 && (
            <TopItemsList items={data.top_items} />
          )}
          {data && data.trend.length > 0 && (
            <SpendingTrendChart trend={data.trend} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{strings.common.error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{strings.dashboard.title}</Text>
        <Pressable
          style={styles.settingsButton}
          onPress={handleOpenNotificationSettings}
          accessibilityLabel="Notification settings"
          accessibilityRole="button"
        >
          <Text style={styles.settingsIcon}>{'⚙'}</Text>
        </Pressable>
      </View>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.light.primary}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        <BudgetProgressCard
          budget={data.overall.budget}
          spent={data.overall.spent}
          remaining={data.overall.remaining}
          percent={data.overall.percent}
          daysLeft={daysLeft}
        />

        {data.categories.length > 0 && (
          <CategoryBreakdown categories={data.categories} />
        )}

        {data.top_items.length > 0 && (
          <TopItemsList items={data.top_items} />
        )}

        {data.trend.length > 0 && (
          <SpendingTrendChart trend={data.trend} />
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.display,
    color: colors.light.textPrimary,
  },
  settingsButton: {
    minHeight: touchTarget.minHeight,
    minWidth: touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: colors.light.surface,
  },
  settingsIcon: {
    fontSize: 22,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.light.danger,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
