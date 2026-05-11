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
import { useAppleSignIn, useGoogleSignIn, useSignIn } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/services/api';
import {
  isGoogleSignInAvailable,
  runAppleSignIn,
  runGoogleSignIn,
  useAppleSignInAvailable,
} from '@/features/auth/services/socialSignIn';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useSignIn();
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const appleAvailable = useAppleSignInAvailable();
  const googleAvailable = isGoogleSignInAvailable();
  const showSocial = appleAvailable || googleAvailable;

  const canSubmit = email.includes('@') && password.length > 0 && !signIn.isPending;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const pair = await signIn.mutateAsync({ email, password });
      router.replace(pair.needs_onboarding ? '/onboarding/budget' : '/(tabs)');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Email or password is incorrect.');
      } else if (err instanceof ApiError && err.status === 423) {
        setError('Your account is temporarily locked. Reset your password to unlock.');
      } else {
        setError('Sign-in failed. Please try again.');
      }
    }
  };

  const onApple = async () => {
    setError(null);
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
    setError(null);
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
            <Text style={styles.wordmark}>Welcome back</Text>
            <Text style={styles.subhead}>Sign in to sync your receipts.</Text>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <SymbolView name="exclamationmark.circle.fill" size={14} tintColor={colors.red} />
              <Text style={styles.errorText} numberOfLines={2}>
                {error}{' '}
                <Text
                  style={styles.errorLink}
                  onPress={() => router.push('/onboarding/forgot-password')}
                >
                  Reset password
                </Text>
              </Text>
            </View>
          ) : null}

          <View style={[styles.listCard, error ? styles.listCardError : null]}>
            <View style={styles.inputRow}>
              <TextInput
                placeholder="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.iosLabel3 as string}
                style={styles.input}
                accessibilityLabel="Email"
              />
            </View>
            <View
              style={[
                styles.separator,
                error ? { backgroundColor: colors.red, opacity: 0.4 } : null,
              ]}
            />
            <View style={styles.inputRow}>
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (error) setError(null);
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.iosLabel3 as string}
                style={[
                  styles.input,
                  { flex: 1, color: error ? colors.red : (colors.iosLabel as string) },
                ]}
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
            <Text style={styles.primaryBtnLabel}>Sign in</Text>
          </Pressable>

          {showSocial && (
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          {appleAvailable && (
            <Pressable
              style={({ pressed }) => [styles.appleBtn, pressed && { opacity: 0.85 }]}
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

          <Pressable
            onPress={() => router.push('/onboarding/forgot-password')}
            hitSlop={6}
            style={{ alignSelf: 'flex-end' }}
            accessibilityRole="button"
          >
            <Text style={styles.linkRight}>Forgot password?</Text>
          </Pressable>

          <View style={{ flex: 1 }} />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>New here? </Text>
            <Pressable
              onPress={() => router.replace('/onboarding/sign-up')}
              hitSlop={6}
              accessibilityRole="button"
            >
              <Text style={styles.footerLink}>Create account</Text>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  heroWrap: {
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: 4,
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
  },

  errorBanner: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderRadius: radii.list,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  errorText: {
    ...type.footnote,
    color: colors.red,
    flex: 1,
  },
  errorLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  listCard: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  listCardError: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.4)',
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

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.iosSeparator },
  dividerText: { ...type.caption1, color: colors.iosLabel2 as string },

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

  linkRight: { ...type.footnote, color: colors.tint, fontWeight: '500' },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: { ...type.footnote, color: colors.iosLabel2 as string },
  footerLink: { ...type.footnote, color: colors.tint, fontWeight: '600' },
});
