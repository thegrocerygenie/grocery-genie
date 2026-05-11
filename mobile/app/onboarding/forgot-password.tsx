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
import { useForgotPassword } from '@/features/auth/hooks/useAuth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const forgotPassword = useForgotPassword();

  const canSubmit = email.includes('@') && !forgotPassword.isPending;

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      await forgotPassword.mutateAsync(email);
    } catch {
      // We always show a generic success regardless to avoid email enumeration.
    }
    Alert.alert(
      'Check your email',
      `If an account exists for ${email}, a reset link has been sent.`,
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: '', headerBackTitle: 'Back' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.iosBg }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroWrap}>
            <View style={styles.envelope}>
              <SymbolView name="envelope.fill" size={28} tintColor={colors.tint} />
            </View>
            <Text style={[type.title2, { textAlign: 'center' }]}>Reset password</Text>
            <Text style={styles.tagline}>
              Enter your email and we&apos;ll send a link to reset your password.
            </Text>
          </View>

          <View style={styles.listCard}>
            <View style={styles.inputRow}>
              <TextInput
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.iosLabel3 as string}
                style={styles.input}
                accessibilityLabel="Email"
              />
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { backgroundColor: colors.tintPressed },
              !canSubmit && { opacity: 0.4 },
            ]}
            onPress={onSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnLabel}>Send reset link</Text>
          </Pressable>

          <View style={{ flex: 1 }} />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Remembered it? </Text>
            <Pressable onPress={() => router.back()} hitSlop={6} accessibilityRole="button">
              <Text style={styles.footerLink}>Back to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  heroWrap: {
    alignItems: 'center',
    marginTop: spacing.md,
    gap: 8,
  },
  envelope: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.iosFill3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  tagline: {
    ...type.subheadline,
    color: colors.iosLabel2 as string,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },

  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  input: {
    ...type.subheadline,
    color: colors.iosLabel as string,
    paddingVertical: 13,
    flex: 1,
  },

  primaryBtn: {
    height: 50,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: { color: '#fff', ...type.headline },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: { ...type.footnote, color: colors.iosLabel2 as string },
  footerLink: { ...type.footnote, color: colors.tint, fontWeight: '600' },
});
