import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Stack, useRouter } from 'expo-router';

import { PremiumUpgradePrompt } from '@/components/PremiumUpgradePrompt';
import { colors, radii, spacing, touchTarget, type } from '@/constants/theme';
import { useMe } from '@/features/auth/hooks/useAuth';
import { EXPORT_STRINGS as S } from '@/features/settings/content/export';
import { useExportData } from '@/features/settings/hooks/useExportData';
import type { ExportFormat } from '@/features/settings/services/exportApi';
import { isPremiumRequired } from '@/utils/premium';

const FORMATS: ExportFormat[] = ['json', 'csv'];

/**
 * Settings → Export data (NFR Privacy 2, V11-P2). Premium (D2): a free user
 * sees the upgrade prompt in place of the export, never an error.
 */
export default function ExportDataScreen() {
  const router = useRouter();
  const { data: profile, isLoading } = useMe();
  const exportData = useExportData();
  const [format, setFormat] = useState<ExportFormat>('json');

  const refused = isPremiumRequired(exportData.error);
  const free = profile?.is_premium === false || refused;
  const failed = exportData.isError && !refused;
  const pending = exportData.isPending;

  return (
    <>
      <Stack.Screen options={{ title: S.screenTitle, headerBackTitle: S.backTitle }} />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.tint} style={styles.loading} />
        ) : free ? (
          <View style={styles.card}>
            <PremiumUpgradePrompt
              title={S.upgradeTitle}
              message={S.upgradeMessage}
              upgradeLabel={S.upgradeAction}
              onUpgrade={() => router.push('/paywall')}
            />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={type.headline} accessibilityRole="header">
                {S.heading}
              </Text>
              <Text style={styles.body}>{S.intro}</Text>
            </View>

            <View style={styles.formatBlock}>
              <SegmentedControl
                values={[...S.formats]}
                selectedIndex={FORMATS.indexOf(format)}
                onChange={(e) => setFormat(FORMATS[e.nativeEvent.selectedSegmentIndex] ?? 'json')}
                enabled={!pending}
                accessibilityLabel={S.formatLabel}
                style={styles.segmented}
              />
              <Text style={styles.note}>{S.formatDetail[format]}</Text>
            </View>

            {failed ? (
              <Text style={styles.error} accessibilityRole="alert">
                {S.failed}
              </Text>
            ) : null}

            <Pressable
              onPress={() => exportData.mutate(format)}
              disabled={pending}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              accessibilityRole="button"
              accessibilityLabel={S.action}
              accessibilityState={{ disabled: pending, busy: pending }}
            >
              {pending ? <ActivityIndicator color={colors.onTint} /> : null}
              <Text style={styles.buttonLabel}>{pending ? S.preparing : S.action}</Text>
            </Pressable>

            <Text style={styles.note}>{S.deletedNote}</Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 },
  loading: { marginTop: spacing.xl },
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  body: { ...type.subheadline, color: colors.iosLabel2 },
  formatBlock: { gap: spacing.sm },
  segmented: { height: touchTarget.minHeight },
  note: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.lg },
  error: { ...type.footnote, color: colors.red, paddingHorizontal: spacing.lg },
  button: {
    // minHeight, not height: the label wraps at large text sizes.
    minHeight: touchTarget.minHeight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.tintPressed },
  buttonLabel: { ...type.headline, color: colors.onTint },
});
