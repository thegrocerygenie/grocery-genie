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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';
import { useResetPassword } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/services/api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const reset = useResetPassword();

  const canSubmit = !!token && password.length >= 12 && password === confirm && !reset.isPending;

  const onSubmit = async () => {
    if (!canSubmit || !token) return;
    try {
      await reset.mutateAsync({ token, newPassword: password });
      Alert.alert(
        'Password reset',
        'Your password was updated. Please sign in with the new password.',
        [{ text: 'OK', onPress: () => router.replace('/onboarding/sign-in') }],
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        Alert.alert(
          'Password too weak',
          'Use at least 12 characters with letters and a digit/symbol.',
        );
      } else {
        Alert.alert('Reset failed', 'The link may be expired. Request a new one.');
      }
    }
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
            <View style={styles.iconWrap}>
              <SymbolView name="lock.rotation" size={28} tintColor={colors.tint} />
            </View>
            <Text style={[type.title2, { textAlign: 'center' }]}>Set a new password</Text>
            <Text style={styles.tagline}>
              Choose a strong password — at least 12 characters with a letter and a digit or symbol.
            </Text>
          </View>

          <View style={styles.listCard}>
            <View style={styles.inputRow}>
              <TextInput
                placeholder="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.iosLabel3 as string}
                style={[styles.input, { flex: 1 }]}
                accessibilityLabel="New password"
              />
              <Pressable
                onPress={() => setShowPassword((p) => !p)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <SymbolView
                  name={showPassword ? 'eye.slash' : 'eye'}
                  size={16}
                  tintColor={colors.iosLabel2 as string}
                />
              </Pressable>
            </View>
            <View style={styles.separator} />
            <View style={styles.inputRow}>
              <TextInput
                placeholder="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.iosLabel3 as string}
                style={styles.input}
                accessibilityLabel="Confirm password"
              />
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { backgroundColor: colors.tintPressed },
              !canSubmit && { opacity: 0.4 },
            ]}
            disabled={!canSubmit}
            onPress={onSubmit}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnLabel}>Reset password</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  heroWrap: {
    alignItems: 'center',
    gap: 8,
  },
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
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.iosSeparator,
    marginLeft: 16,
  },

  primaryBtn: {
    height: 50,
    borderRadius: radii.button,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: { color: '#fff', ...type.headline },
});
