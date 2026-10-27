import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';

import { colors, radii, spacing, type } from '@/constants/theme';
import { PRIVACY_POLICY } from '@/features/settings/content/privacy';

/** Settings → Privacy: the privacy policy, in the app. */
export default function PrivacyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy', headerBackTitle: 'Settings' }} />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {PRIVACY_POLICY.reviewed ? null : (
          <View style={styles.draft} accessibilityRole="alert">
            <Text style={styles.draftText}>Draft · pending legal review</Text>
          </View>
        )}
        <Text style={styles.updated}>Last updated {PRIVACY_POLICY.updated}</Text>
        {PRIVACY_POLICY.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">
              {section.heading}
            </Text>
            {section.paragraphs.map((p) => (
              <Text key={p} style={styles.paragraph}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  draft: {
    backgroundColor: colors.orangeBg,
    borderRadius: radii.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  draftText: { ...type.footnote, color: colors.orange, fontWeight: '600' },
  updated: { ...type.footnote, color: colors.iosLabel2 as string },
  section: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heading: { ...type.headline },
  paragraph: { ...type.subheadline, color: colors.iosLabel as string, lineHeight: 21 },
});
