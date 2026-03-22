import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { borderRadius, colors, shadows, spacing, touchTarget, typography } from '@/constants/theme';
import { strings } from '@/constants/strings';
import { useNotificationStore } from '@/store/notificationStore';

const DAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function NotificationSettingsScreen() {
  const { preferences, setThreshold, setWeeklySummaryEnabled, setWeeklySummaryDay } =
    useNotificationStore();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Budget Alerts */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{strings.notifications.budgetAlerts}</Text>

          <View style={styles.thresholdRow}>
            <Text style={styles.thresholdLabel}>{strings.notifications.fiftyPercent}</Text>
            <Switch
              value={preferences.fiftyPercent}
              onValueChange={(v) => setThreshold('fiftyPercent', v)}
              trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
              thumbColor={preferences.fiftyPercent ? colors.light.primary : colors.light.disabled}
              accessibilityLabel="Alert at 50 percent threshold"
            />
          </View>

          <View style={styles.thresholdRow}>
            <Text style={styles.thresholdLabel}>{strings.notifications.eightyPercent}</Text>
            <Switch
              value={preferences.eightyPercent}
              onValueChange={(v) => setThreshold('eightyPercent', v)}
              trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
              thumbColor={preferences.eightyPercent ? colors.light.primary : colors.light.disabled}
              accessibilityLabel="Alert at 80 percent threshold"
            />
          </View>

          <View style={styles.thresholdRow}>
            <Text style={styles.thresholdLabel}>{strings.notifications.hundredPercent}</Text>
            <Switch
              value={preferences.hundredPercent}
              onValueChange={(v) => setThreshold('hundredPercent', v)}
              trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
              thumbColor={
                preferences.hundredPercent ? colors.light.primary : colors.light.disabled
              }
              accessibilityLabel="Alert at 100 percent threshold"
            />
          </View>
        </View>

        {/* Weekly Summary */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{strings.notifications.weeklySummary}</Text>

          <View style={styles.thresholdRow}>
            <Text style={styles.thresholdLabel}>{strings.notifications.summaryEnabled}</Text>
            <Switch
              value={preferences.weeklySummaryEnabled}
              onValueChange={setWeeklySummaryEnabled}
              trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
              thumbColor={
                preferences.weeklySummaryEnabled ? colors.light.primary : colors.light.disabled
              }
              accessibilityLabel="Enable weekly summary"
            />
          </View>

          {preferences.weeklySummaryEnabled && (
            <View style={styles.dayPickerSection}>
              <Text style={styles.dayPickerLabel}>{strings.notifications.summaryDay}</Text>
              <View style={styles.dayPillContainer}>
                {DAY_ABBREVIATIONS.map((abbr, index) => {
                  const isSelected = preferences.weeklySummaryDay === index;
                  return (
                    <Pressable
                      key={abbr}
                      style={[styles.dayPill, isSelected && styles.dayPillSelected]}
                      onPress={() => setWeeklySummaryDay(index)}
                      accessibilityLabel={`${strings.notifications.days[index]}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={[styles.dayPillText, isSelected && styles.dayPillTextSelected]}>
                        {abbr}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
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
  dayPickerSection: {
    marginTop: spacing.md,
  },
  dayPickerLabel: {
    ...typography.body,
    color: colors.light.textSecondary,
    marginBottom: spacing.sm,
  },
  dayPillContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  dayPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.light.background,
    minHeight: touchTarget.minHeight,
    minWidth: touchTarget.minWidth,
  },
  dayPillSelected: {
    backgroundColor: colors.light.primary,
  },
  dayPillText: {
    ...typography.caption,
    color: colors.light.textSecondary,
    fontWeight: '600',
  },
  dayPillTextSelected: {
    color: colors.light.surface,
  },
});
