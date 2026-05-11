import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useMe, useRequestEmailChange } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/services/api';

export default function EmailChangeScreen() {
  const router = useRouter();
  const { data: profile } = useMe();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const requestChange = useRequestEmailChange();

  const canSubmit =
    newEmail.includes('@') &&
    password.length >= 12 &&
    newEmail !== profile?.email &&
    !requestChange.isPending;

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      await requestChange.mutateAsync({
        new_email: newEmail,
        current_password: password,
      });
      Alert.alert(
        'Confirmation sent',
        `We sent a confirmation link to ${profile?.email ?? 'your current email'}. Tap it to finish the change.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        Alert.alert('Wrong password', 'Please confirm your current password.');
      } else if (err instanceof ApiError && err.status === 409) {
        Alert.alert('Email in use', 'That email is already linked to an account.');
      } else {
        Alert.alert('Could not start change', 'Please try again in a moment.');
      }
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          title: 'Change Email',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.headerBtn}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={onSubmit}
              hitSlop={12}
              disabled={!canSubmit}
              accessibilityRole="button"
            >
              <Text
                style={[styles.headerBtn, { fontWeight: '600' }, !canSubmit && { opacity: 0.4 }]}
              >
                Send
              </Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.iosBg }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroWrap}>
            <View style={styles.iconWrap}>
              <SymbolView name="envelope.badge.fill" size={28} tintColor={colors.tint} />
            </View>
            <Text style={[type.title2, { textAlign: 'center' }]}>Change email</Text>
            <Text style={styles.tagline}>
              For security, we&apos;ll send a confirmation link to your **current** email. Once you
              tap it, the new email is active and all sessions sign out.
            </Text>
          </View>

          <View style={styles.listCard}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Current</Text>
              <Text
                style={[
                  type.body,
                  { color: colors.iosLabel2 as string, flex: 1, textAlign: 'right' },
                ]}
                numberOfLines={1}
              >
                {profile?.email ?? '—'}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.inputRow}>
              <Text style={styles.rowLabel}>New</Text>
              <TextInput
                placeholder="new@email.com"
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.iosLabel3 as string}
                style={[type.body, styles.input]}
                accessibilityLabel="New email"
              />
            </View>
            <View style={styles.separator} />
            <View style={styles.inputRow}>
              <Text style={styles.rowLabel}>Password</Text>
              <TextInput
                placeholder="Current password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.iosLabel3 as string}
                style={[type.body, styles.input]}
                accessibilityLabel="Current password"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  headerBtn: { ...type.body, color: colors.tint },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  heroWrap: { alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    ...type.subheadline,
    color: colors.iosLabel2 as string,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },

  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    minHeight: 44,
    gap: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 48,
    gap: 10,
  },
  rowLabel: { ...type.body, color: colors.iosLabel as string, width: 92 },
  input: { flex: 1, color: colors.iosLabel as string, paddingVertical: 13, textAlign: 'right' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },
});
