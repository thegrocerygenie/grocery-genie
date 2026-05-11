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
import { useAppleSignIn, useGoogleSignIn, useSignUp } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/services/api';
import {
  isGoogleSignInAvailable,
  runAppleSignIn,
  runGoogleSignIn,
  useAppleSignInAvailable,
} from '@/features/auth/services/socialSignIn';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const signUp = useSignUp();
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const appleAvailable = useAppleSignInAvailable();
  const googleAvailable = isGoogleSignInAvailable();
  const showSocial = appleAvailable || googleAvailable;

  const canSubmit = email.includes('@') && password.length >= 12 && !signUp.isPending;

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      await signUp.mutateAsync({ email, password });
      router.push({ pathname: '/onboarding/verify-email', params: { email } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        Alert.alert('Email already in use', 'Try signing in instead.');
      } else if (err instanceof ApiError && err.status === 422) {
        Alert.alert(
          'Password too weak',
          'Use at least 12 characters with letters and a number or symbol.',
        );
      } else {
        Alert.alert('Sign up failed', 'Please try again in a moment.');
      }
    }
  };

  const onApple = async () => {
    const credential = await runAppleSignIn();
    if (!credential) return;
    try {
      const pair = await apple.mutateAsync(credential);
      router.replace(pair.needs_onboarding ? '/onboarding/budget' : '/(tabs)');
    } catch {
      Alert.alert('Apple sign in failed', 'Please try again.');
    }
  };

  const onGoogle = async () => {
    const idToken = await runGoogleSignIn();
    if (!idToken) return;
    try {
      const pair = await google.mutateAsync(idToken);
      router.replace(pair.needs_onboarding ? '/onboarding/budget' : '/(tabs)');
    } catch {
      Alert.alert('Google sign in failed', 'Please try again.');
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
            <Text style={styles.wordmark}>Create account</Text>
            <Text style={styles.subhead}>
              Save your budget across devices and back up your receipts.
            </Text>
          </View>

          {appleAvailable && (
            <Pressable
              style={({ pressed }) => [styles.appleBtn, pressed && { opacity: 0.8 }]}
              onPress={onApple}
              disabled={apple.isPending}
              accessibilityRole="button"
              accessibilityLabel="Continue with Apple"
            >
              <SymbolView name="apple.logo" size={18} tintColor="#fff" />
              <Text style={styles.appleBtnLabel}>Continue with Apple</Text>
            </Pressable>
          )}

          {googleAvailable && (
            <Pressable
              style={({ pressed }) => [
                styles.googleBtn,
                pressed && { backgroundColor: colors.iosFill3 },
              ]}
              onPress={onGoogle}
              disabled={google.isPending}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <View style={styles.googleGlyph}>
                <Text style={styles.googleGlyphText}>G</Text>
              </View>
              <Text style={styles.googleBtnLabel}>Continue with Google</Text>
            </Pressable>
          )}

          {showSocial && (
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or sign up with email</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

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
            <View style={styles.separator} />
            <View style={styles.inputRow}>
              <TextInput
                placeholder="Password · 8+ characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.iosLabel3 as string}
                style={[styles.input, { flex: 1 }]}
                accessibilityLabel="Password"
              />
              <Pressable
                onPress={() => setShowPassword((p) => !p)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <SymbolView
                  name={showPassword ? 'eye.slash' : 'eye'}
                  size={16}
                  tintColor={colors.iosLabel2 as string}
                />
              </Pressable>
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
            <Text style={styles.primaryBtnLabel}>Create account</Text>
          </Pressable>

          <Text style={styles.legal}>
            By continuing you agree to the <Text style={styles.legalLink}>Terms</Text> and{' '}
            <Text style={styles.legalLink}>Privacy Policy</Text>.
          </Text>

          <View style={{ flex: 1 }} />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Pressable
              onPress={() => router.push('/onboarding/sign-in')}
              hitSlop={6}
              accessibilityRole="button"
            >
              <Text style={styles.footerLink}>Sign in</Text>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  heroWrap: {
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: 6,
  },
  wordmark: {
    fontSize: 32,
    letterSpacing: -0.6,
    fontFamily: Platform.select({ ios: 'Times New Roman', default: 'serif' }),
    color: colors.iosLabel as string,
    textAlign: 'center',
  },
  subhead: {
    ...type.subheadline,
    color: colors.iosLabel2 as string,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },

  appleBtn: {
    height: 50,
    borderRadius: radii.button,
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  appleBtnLabel: { color: '#fff', ...type.headline, fontWeight: '500' },

  googleBtn: {
    height: 50,
    borderRadius: radii.button,
    backgroundColor: colors.iosBg2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.iosSeparator,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  googleBtnLabel: { color: colors.iosLabel as string, ...type.headline, fontWeight: '500' },
  googleGlyph: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  googleGlyphText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4285F4',
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.iosSeparator },
  dividerText: { ...type.caption1, color: colors.iosLabel2 as string },

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

  legal: {
    ...type.caption2,
    color: colors.iosLabel2 as string,
    textAlign: 'center',
    lineHeight: 16,
  },
  legalLink: { color: colors.tint },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: { ...type.footnote, color: colors.iosLabel2 as string },
  footerLink: { ...type.footnote, color: colors.tint, fontWeight: '600' },
});
