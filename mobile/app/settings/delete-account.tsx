import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { colors, radii, spacing, type } from '@/constants/theme';
import { AppleReauthCancelledError, useDeleteAccount } from '@/features/auth/hooks/useAuth';
import { apiErrorCode } from '@/services/api';

const ERASED = [
  'Your profile, email address and sign-in details',
  'All receipts and their photos, including recently deleted ones',
  'Your budgets, alerts and notification history',
  'Your item corrections and custom categories',
  'Your sign-in activity',
];

/** What to tell the user when deletion failed; nothing was deleted. */
function failureReason(error: unknown): string {
  if (error instanceof AppleReauthCancelledError) {
    return 'Confirm with Apple to delete your account.';
  }
  switch (apiErrorCode(error)) {
    case 'apple_account_mismatch':
      return 'That’s a different Apple ID from the one this account uses.';
    case 'apple_revoke_failed':
      return 'We couldn’t reach Apple. Try again in a moment.';
    default:
      return 'Check your connection and try again.';
  }
}

/**
 * Settings → Delete account (App Store Review Guideline 5.1.1(v)). Says what
 * is erased, confirms in a destructive alert, then deletes and signs out.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const deleteAccount = useDeleteAccount();
  const [failure, setFailure] = useState<string | null>(null);

  const onConfirm = async () => {
    setFailure(null);
    try {
      await deleteAccount.mutateAsync();
    } catch (error) {
      setFailure(failureReason(error));
      return;
    }
    router.replace('/onboarding');
  };

  const onDelete = () => {
    Alert.alert(
      'Delete your account?',
      'Your receipts, budgets and all other data will be erased. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: onConfirm },
      ],
    );
  };

  const pending = deleteAccount.isPending;

  return (
    <>
      <Stack.Screen options={{ title: 'Delete account', headerBackTitle: 'Settings' }} />
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.card}>
          <Text style={type.headline} accessibilityRole="header">
            Deleting your account erases:
          </Text>
          {ERASED.map((line) => (
            <Text key={line} style={styles.item}>
              • {line}
            </Text>
          ))}
        </View>
        <Text style={styles.note}>
          This happens right away and can’t be undone. Receipts still waiting to upload on this
          device are removed too. If you use Sign in with Apple, you’ll confirm with Apple, and
          Grocery Genie’s access to your Apple ID is removed.
        </Text>

        {failure ? (
          <Text style={styles.error} accessibilityRole="alert">
            Your account was not deleted. {failure}
          </Text>
        ) : null}

        <Pressable
          onPress={onDelete}
          disabled={pending}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityState={{ disabled: pending, busy: pending }}
        >
          <Text style={styles.buttonText}>{pending ? 'Deleting…' : 'Delete account'}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.iosBg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  item: { ...type.subheadline, color: colors.iosLabel, lineHeight: 21 },
  note: { ...type.footnote, color: colors.iosLabel2, paddingHorizontal: spacing.lg },
  error: { ...type.footnote, color: colors.red, paddingHorizontal: spacing.lg },
  button: {
    // minHeight, not height: the label wraps at large text sizes.
    minHeight: 44,
    paddingVertical: spacing.sm,
    borderRadius: radii.list,
    backgroundColor: colors.iosBg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.iosFill3 },
  buttonText: { ...type.body, color: colors.red, fontWeight: '600' },
});
