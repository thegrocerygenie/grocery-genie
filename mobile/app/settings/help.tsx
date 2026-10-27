import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { SUPPORT_EMAIL } from '@/constants/links';
import { colors, radii, spacing, type } from '@/constants/theme';
import { HELP_TOPICS } from '@/features/settings/content/help';

/** Settings → Help & feedback: common questions, and feedback by email. */
export default function HelpScreen() {
  const onFeedback = async () => {
    const version = Constants.expoConfig?.version;
    const subject = `Grocery Genie feedback${version ? ` (v${version})` : ''}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
    // No Mail account on the device (or the simulator): show the address.
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Send feedback', `Email us at ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Help & feedback', headerBackTitle: 'Settings' }} />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.listCard}>
          {HELP_TOPICS.map((topic, i) => (
            <View key={topic.question} style={[styles.topic, i > 0 && styles.topicDivider]}>
              <Text style={styles.question} accessibilityRole="header">
                {topic.question}
              </Text>
              <Text style={styles.answer}>{topic.answer}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={onFeedback}
          style={({ pressed }) => [styles.feedback, pressed && styles.feedbackPressed]}
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
          accessibilityHint={`Opens an email to ${SUPPORT_EMAIL}`}
        >
          <SymbolView name="envelope.fill" size={16} tintColor={colors.tint} />
          <Text style={styles.feedbackLabel}>Send feedback</Text>
        </Pressable>
        <Text style={styles.footnote}>We read every message.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  listCard: { backgroundColor: colors.iosBg2, borderRadius: radii.list, overflow: 'hidden' },
  topic: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  topicDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  question: { ...type.headline },
  answer: { ...type.subheadline, color: colors.iosLabel2 as string, lineHeight: 20 },
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: radii.button,
    backgroundColor: colors.iosBg2,
  },
  feedbackPressed: { backgroundColor: colors.iosFill3 },
  feedbackLabel: { ...type.headline, color: colors.tint },
  footnote: { ...type.footnote, color: colors.iosLabel2 as string, textAlign: 'center' },
});
